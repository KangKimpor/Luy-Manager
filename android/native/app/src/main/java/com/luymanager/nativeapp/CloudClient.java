package com.luymanager.nativeapp;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import org.json.JSONArray;
import org.json.JSONObject;

class CloudClient {
  static final String CALLBACK = "com.luymanager.nativeapp://auth/callback";
  final SessionVault vault;
  JSONObject session;
  private String verifiedPrecisionOwner;

  CloudClient(SessionVault vault) throws Exception {
    this.vault = vault;
    session = vault.load();
  }

  boolean signedIn() {
    return session != null;
  }

  String owner() throws Exception {
    return session.getJSONObject("user").getString("id");
  }

  static final class Response {
    int status;
    String body, range;

    boolean ok() {
      return status >= 200 && status < 300;
    }
  }

  Response request(String method, String path, Object body, boolean auth, int offset)
      throws Exception {
    HttpURLConnection c =
        (HttpURLConnection) new URL(BuildConfig.SUPABASE_URL + path).openConnection();
    c.setConnectTimeout(15000);
    c.setReadTimeout(20000);
    c.setInstanceFollowRedirects(false);
    c.setRequestMethod(method);
    c.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY);
    c.setRequestProperty("Content-Type", "application/json");
    if (auth) c.setRequestProperty("Authorization", "Bearer " + session.getString("access_token"));
    c.setRequestProperty("Prefer", method.equals("GET") ? "count=exact" : "return=representation");
    if (offset >= 0) c.setRequestProperty("Range", offset + "-" + (offset + 999));
    if (body != null) {
      c.setDoOutput(true);
      try (java.io.OutputStream out = c.getOutputStream()) {
        out.write(body.toString().getBytes(StandardCharsets.UTF_8));
      }
    }
    Response result = new Response();
    try {
      result.status = c.getResponseCode();
      result.range = c.getHeaderField("Content-Range");
      InputStream stream = result.ok() ? c.getInputStream() : c.getErrorStream();
      java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
      if (stream != null) {
        try (InputStream input = stream) {
          byte[] buffer = new byte[8192];
          int count;
          while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
        }
      }
      result.body = bytes.toString(StandardCharsets.UTF_8.name());
      return result;
    } finally {
      c.disconnect();
    }
  }

  JSONObject object(Response response) throws Exception {
    if (!response.ok())
      throw new Exception(
          "Server request failed ("
              + response.status
              + "). Your unsynced entries remain on this phone.");
    return new JSONObject(response.body);
  }

  void authenticate(String code, String verifier) throws Exception {
    JSONObject token =
        object(
            request(
                "POST",
                "/auth/v1/token?grant_type=pkce",
                new JSONObject().put("auth_code", code).put("code_verifier", verifier),
                false,
                -1));
    session = token;
    try {
      JSONObject user = object(request("GET", "/auth/v1/user", null, true, -1));
      token.put("user", user);
      java.util.UUID.fromString(user.getString("id"));
      vault.save(token);
    } catch (Exception e) {
      session = null;
      throw e;
    }
  }

  void refresh() throws Exception {
    if (session != null && session.has("user") && session.has("access_token")) {
      long expiresAt = session.optLong("expires_at", 0L);
      if (expiresAt * 1000L > System.currentTimeMillis() + 60_000L) return;
    }
    JSONObject previous = session;
    JSONObject next =
        object(
            request(
                "POST",
                "/auth/v1/token?grant_type=refresh_token",
                new JSONObject().put("refresh_token", session.getString("refresh_token")),
                false,
                -1));
    session = next;
    try {
      JSONObject user = object(request("GET", "/auth/v1/user", null, true, -1));
      if (!user.getString("id").equals(previous.getJSONObject("user").getString("id")))
        throw new Exception("Account changed during refresh");
      next.put("user", user);
      vault.save(next);
    } catch (Exception e) {
      session = previous;
      throw e;
    }
  }

  JSONArray readAll(String table) throws Exception {
    String scope = table.equals("profiles") ? "id" : "user_id";
    String path = "/rest/v1/" + table + "?select=*&" + scope + "=eq." + owner() + "&order=id.asc";
    JSONArray all = new JSONArray();
    int offset = 0, total = Integer.MAX_VALUE;
    java.util.HashSet<String> seen = new java.util.HashSet<>();
    while (offset < total) {
      Response r = request("GET", path, null, true, offset);
      if (!r.ok())
        throw new Exception("Could not download " + table + ". Cached data is unchanged.");
      if (r.range == null || !r.range.matches(".*/[0-9]+"))
        throw new Exception("Server did not confirm the complete ledger size");
      int count = Integer.parseInt(r.range.substring(r.range.indexOf('/') + 1));
      if (offset > 0 && count != total)
        throw new Exception("Ledger changed during download. Retry sync.");
      total = count;
      JSONArray page = new JSONArray(r.body);
      if (page.length() == 0 && offset < total) throw new Exception("Incomplete ledger download");
      for (int i = 0; i < page.length(); i++) {
        JSONObject row = page.getJSONObject(i);
        if (!seen.add(row.getString("id")))
          throw new Exception("Ledger changed during download. Retry sync.");
        if (!row.getString(scope).equals(owner()))
          throw new Exception("Server returned a row from another account");
        all.put(row);
      }
      offset += page.length();
      if (offset > total) throw new Exception("Server returned an inconsistent ledger size");
    }
    return all;
  }

  void validatePrecision() throws Exception {
    String currentOwner = owner();
    if (currentOwner.equals(verifiedPrecisionOwner)) return;
    Response r =
        request("POST", "/rest/v1/rpc/ledger_precision_version", new JSONObject(), true, -1);
    if (!r.ok() || !r.body.trim().equals("2"))
      throw new Exception("Database precision could not be verified. Nothing was uploaded.");
    verifiedPrecisionOwner = currentOwner;
  }

  void send(JSONObject operation) throws Exception {
    String table = operation.getString("table");
    JSONArray rows = operation.getJSONArray("rows");
    if (!table.equals("transactions") && !table.equals("accounts") && !table.equals("budgets"))
      throw new Exception("Unsupported queued write");
    for (int i = 0; i < rows.length(); i++)
      if (!rows.getJSONObject(i).getString("user_id").equals(owner()))
        throw new Exception("Queued entry belongs to another account");
    if (rows.length() == 0) throw new Exception("Queued write is empty");
    if (table.equals("transactions")) {
      HashMap<String, JSONObject> checkedAccounts = new HashMap<>();
      HashMap<String, JSONObject> checkedCategories = new HashMap<>();
      try {
        for (int i = 0; i < rows.length(); i++) {
          JSONObject row = rows.getJSONObject(i);
          String accountId = row.getString("account_id");
          JSONObject account = checkedAccounts.get(accountId);
          if (account == null && !checkedAccounts.containsKey(accountId)) {
            account = ownedRow("accounts", accountId);
            checkedAccounts.put(accountId, account);
          }
          if (account == null
              || !account.isNull("deleted_at")
              || !account.optBoolean("is_active", true))
            throw new Exception(
                "The selected account is closed or unavailable. Your entry is still on this"
                    + " phone.");
          if (!account.getString("currency").equals(row.getString("currency")))
            throw new Exception("The account currency changed. Your entry needs review.");
          if (!row.isNull("category_id")) {
            String categoryId = row.getString("category_id");
            JSONObject category = checkedCategories.get(categoryId);
            if (category == null && !checkedCategories.containsKey(categoryId)) {
              category = ownedRow("categories", categoryId);
              checkedCategories.put(categoryId, category);
            }
            if (category == null || !category.isNull("deleted_at"))
              throw new Exception("The selected category is unavailable. Your entry needs review.");
          }
        }
      } catch (Exception validation) {
        // A previously committed entry remains acknowledged even if its account was closed later.
        if (confirmed(table, rows)) return;
        throw validation;
      }
    }
    Response r = request("POST", "/rest/v1/" + table, rows, true, -1);
    if (r.ok()) return;
    if (r.status != 409)
      throw new Exception("Upload refused (" + r.status + "). Review the queued entry and retry.");
    if (!confirmed(table, rows)) throw new Exception("Upload conflict needs review");
  }

  JSONObject ownedRow(String table, String rowId) throws Exception {
    String id = java.util.UUID.fromString(rowId).toString();
    Response existing =
        request(
            "GET", "/rest/v1/" + table + "?id=eq." + id + "&user_id=eq." + owner(), null, true, -1);
    if (!existing.ok()) throw new Exception("Could not verify the selected " + table);
    JSONArray found = new JSONArray(existing.body);
    if (found.length() == 0) return null;
    if (found.length() != 1) throw new Exception("Server returned an ambiguous record");
    JSONObject row = found.getJSONObject(0);
    if (!row.getString("user_id").equals(owner()))
      throw new Exception("Record belongs to another account");
    return row;
  }

  boolean confirmed(String table, JSONArray rows) throws Exception {
    // A lost response may hide a committed insert. Confirm every field before acknowledging it.
    for (int i = 0; i < rows.length(); i++) {
      JSONObject row = rows.getJSONObject(i);
      JSONObject stored = ownedRow(table, row.getString("id"));
      if (stored == null) return false;
      for (java.util.Iterator<String> keys = row.keys(); keys.hasNext(); ) {
        String k = keys.next();
        Object expected = row.get(k), actual = stored.opt(k);
        if (k.equals("occurred_at")) {
          if (!java.time.OffsetDateTime.parse(expected.toString())
              .toInstant()
              .equals(java.time.OffsetDateTime.parse(String.valueOf(actual)).toInstant()))
            throw new Exception("Upload date conflict");
        } else if (!String.valueOf(expected).equals(String.valueOf(actual)))
          throw new Exception("Upload conflict: " + k);
      }
    }
    return true;
  }

  void sync(LedgerStore store) throws Exception {
    refresh();
    validatePrecision();
    ArrayList<String> acknowledged = new ArrayList<>();
    for (JSONObject queued : store.pending()) {
      try {
        send(queued.getJSONObject("operation"));
        acknowledged.add(queued.getString("id"));
      } catch (Exception e) {
        store.failed(queued.getString("id"), e.getMessage());
        throw e;
      }
    }
    JSONObject data = new JSONObject();
    for (String table :
        new String[] {"accounts", "categories", "transactions", "budgets", "profiles"})
      data.put(table, readAll(table));
    store.commitSnapshot(data, acknowledged);
  }
}
