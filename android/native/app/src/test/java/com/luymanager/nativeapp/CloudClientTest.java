package com.luymanager.nativeapp;

import static org.junit.Assert.*;

import java.util.*;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class CloudClientTest {
  @Test
  public void retryAcknowledgesOnlyAnExactOwnerScopedRow() throws Exception {
    String user = UUID.randomUUID().toString();
    JSONObject row =
        new JSONObject()
            .put("id", UUID.randomUUID().toString())
            .put("user_id", user)
            .put("account_id", UUID.randomUUID().toString())
            .put("currency", "USD")
            .put("amount", -100L)
            .put("occurred_at", "2026-10-23T12:00:00+07:00");
    ArrayList<String> paths = new ArrayList<>();
    CloudClient client =
        new CloudClient(new SessionVault(RuntimeEnvironment.getApplication())) {
          @Override
          Response request(String method, String path, Object body, boolean auth, int offset)
              throws Exception {
            paths.add(path);
            Response r = new Response();
            r.status = method.equals("POST") ? 409 : 200;
            if (path.startsWith("/rest/v1/accounts")) {
              r.body =
                  new JSONArray()
                      .put(
                          new JSONObject()
                              .put("id", row.getString("account_id"))
                              .put("user_id", user)
                              .put("currency", "USD")
                              .put("is_active", true))
                      .toString();
              return r;
            }
            r.body =
                new JSONArray()
                    .put(new JSONObject(row.toString()).put("occurred_at", "2026-10-23T05:00:00Z"))
                    .toString();
            return r;
          }
        };
    client.session = new JSONObject().put("user", new JSONObject().put("id", user));
    JSONObject op =
        new JSONObject()
            .put("table", "transactions")
            .put("rows", new JSONArray().put(new JSONObject(row.toString())));
    client.send(op);
    assertTrue(paths.get(0).contains("user_id=eq." + user));
    row.put("amount", -200L);
    assertThrows(Exception.class, () -> client.send(op));
  }

  @Test
  public void incompleteChangingOrCrossOwnerDownloadsAreRejected() throws Exception {
    String user = UUID.randomUUID().toString();
    for (String failure : new String[] {"missing", "duplicate", "changed", "owner", "overflow"}) {
      CloudClient client =
          new CloudClient(new SessionVault(RuntimeEnvironment.getApplication())) {
            @Override
            Response request(String method, String path, Object body, boolean auth, int offset)
                throws Exception {
              Response r = new Response();
              r.status = 200;
              int total = failure.equals("overflow") ? 0 : failure.equals("owner") ? 1 : 2;
              if (failure.equals("changed") && offset > 0) total = 3;
              r.range = offset + "-" + offset + "/" + total;
              JSONArray page = new JSONArray();
              if (!(failure.equals("missing") && offset > 0))
                page.put(
                    new JSONObject()
                        .put("id", failure.equals("duplicate") ? "same" : "row-" + offset)
                        .put(
                            "user_id",
                            failure.equals("owner") ? UUID.randomUUID().toString() : user));
              r.body = page.toString();
              return r;
            }
          };
      client.session = new JSONObject().put("user", new JSONObject().put("id", user));
      assertThrows(failure, Exception.class, () -> client.readAll("transactions"));
    }
  }

  @Test
  public void closedAccountCannotReceiveANewEntry() throws Exception {
    String user = UUID.randomUUID().toString();
    CloudClient client =
        new CloudClient(new SessionVault(RuntimeEnvironment.getApplication())) {
          @Override
          Response request(String method, String path, Object body, boolean auth, int offset)
              throws Exception {
            assertEquals("GET", method);
            Response r = new Response();
            r.status = 200;
            r.body =
                path.startsWith("/rest/v1/accounts")
                    ? new JSONArray()
                        .put(new JSONObject().put("user_id", user).put("is_active", false))
                        .toString()
                    : "[]";
            return r;
          }
        };
    client.session = new JSONObject().put("user", new JSONObject().put("id", user));
    JSONObject row =
        new JSONObject()
            .put("id", UUID.randomUUID().toString())
            .put("user_id", user)
            .put("account_id", UUID.randomUUID().toString())
            .put("currency", "USD");
    assertThrows(
        Exception.class,
        () ->
            client.send(
                new JSONObject()
                    .put("table", "transactions")
                    .put("rows", new JSONArray().put(row))));
  }

  @Test
  public void anotherOwnersQueuedEntryNeverMakesANetworkRequest() throws Exception {
    CloudClient client =
        new CloudClient(new SessionVault(RuntimeEnvironment.getApplication())) {
          @Override
          Response request(String method, String path, Object body, boolean auth, int offset) {
            throw new AssertionError("Cross-owner operation reached network");
          }
        };
    client.session =
        new JSONObject().put("user", new JSONObject().put("id", UUID.randomUUID().toString()));
    JSONObject row = new JSONObject().put("user_id", UUID.randomUUID().toString());
    assertThrows(
        Exception.class,
        () ->
            client.send(
                new JSONObject()
                    .put("table", "transactions")
                    .put("rows", new JSONArray().put(row))));
  }

  @Test
  public void committedUploadWithLostResponseRecoversWithoutDuplicateOrDataLoss() throws Exception {
    String user = UUID.randomUUID().toString(), accountId = UUID.randomUUID().toString();
    JSONObject account =
        new JSONObject()
            .put("id", accountId)
            .put("user_id", user)
            .put("currency", "KHR")
            .put("is_active", true);
    JSONObject row =
        new JSONObject()
            .put("id", UUID.randomUUID().toString())
            .put("user_id", user)
            .put("account_id", accountId)
            .put("currency", "KHR")
            .put("amount", -999355L);
    final boolean[] committed = {false};
    final int[] inserts = {0};
    CloudClient client =
        new CloudClient(new SessionVault(RuntimeEnvironment.getApplication())) {
          @Override
          void refresh() {}

          @Override
          void validatePrecision() {}

          @Override
          Response request(String method, String path, Object body, boolean auth, int offset)
              throws Exception {
            Response r = new Response();
            r.status = 200;
            if (method.equals("POST")) {
              if (!committed[0]) {
                committed[0] = true;
                inserts[0]++;
                throw new java.io.IOException("Connection lost after commit");
              }
              r.status = 409;
              r.body = "{}";
              return r;
            }
            JSONArray rows = new JSONArray();
            if (path.startsWith("/rest/v1/accounts")) rows.put(account);
            if (path.startsWith("/rest/v1/transactions") && committed[0]) rows.put(row);
            if (path.startsWith("/rest/v1/profiles")) rows.put(new JSONObject().put("id", user));
            r.body = rows.toString();
            r.range = "0-0/" + rows.length();
            return r;
          }
        };
    client.session = new JSONObject().put("user", new JSONObject().put("id", user));
    LedgerStore store = new LedgerStore(RuntimeEnvironment.getApplication(), user);
    try {
      store.enqueue("transactions", new JSONArray().put(row));
      assertThrows(java.io.IOException.class, () -> client.sync(store));
      assertEquals(1, store.pendingCount());
      assertEquals(-999355L, store.rows("transactions").getJSONObject(0).getLong("amount"));
      client.sync(store);
      assertEquals(1, inserts[0]);
      assertEquals(0, store.pendingCount());
      assertEquals(1, store.rows("transactions").length());
      assertEquals(-999355L, store.rows("transactions").getJSONObject(0).getLong("amount"));
    } finally {
      store.close();
    }
  }
}
