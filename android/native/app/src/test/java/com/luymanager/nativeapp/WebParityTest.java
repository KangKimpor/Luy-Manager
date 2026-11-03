package com.luymanager.nativeapp;

import static org.junit.Assert.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

/** The web view hand-off, the shared session and the web's currency conversion. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class WebParityTest {
  static final String REF = "lesfzlirqkwvmevhrgug";

  static JSONObject session(String refresh, long expires, String user) throws Exception {
    return new JSONObject()
        .put("access_token", "a".repeat(900))
        .put("refresh_token", refresh)
        .put("expires_at", expires)
        .put("token_type", "bearer")
        .put("user", new JSONObject().put("id", user).put("email", "x@example.com").put("pad", "p".repeat(2500)));
  }

  @Test
  public void referenceComesFromTheProjectHost() {
    assertEquals(REF, WebSession.ref("https://lesfzlirqkwvmevhrgug.supabase.co"));
    assertEquals("sb-" + REF + "-auth-token", WebSession.name(REF));
  }

  @Test
  public void largeSessionIsChunkedAndReadsBack() throws Exception {
    JSONObject s = session("r1", 2000000000L, "user-1");
    LinkedHashMap<String, String> cookies = WebSession.cookies(REF, s);
    assertTrue("needs more than one chunk", cookies.size() > 1);
    for (Map.Entry<String, String> e : cookies.entrySet()) {
      assertTrue(e.getValue().length() <= WebSession.CHUNK);
      assertTrue(e.getKey().matches("sb-" + REF + "-auth-token\\.[0-9]+"));
    }
    assertTrue(cookies.values().iterator().next().startsWith("base64-"));
    JSONObject back = WebSession.parse(REF, cookies);
    assertEquals("r1", back.getString("refresh_token"));
    assertEquals("user-1", back.getJSONObject("user").getString("id"));
  }

  @Test
  public void smallSessionUsesOneCookieAndHeaderParsingWorks() throws Exception {
    JSONObject s = new JSONObject().put("access_token", "x").put("refresh_token", "r");
    LinkedHashMap<String, String> cookies = WebSession.cookies(REF, s);
    assertEquals(1, cookies.size());
    assertEquals("sb-" + REF + "-auth-token", cookies.keySet().iterator().next());
    String header = "theme=dark; " + cookies.keySet().iterator().next() + "=" + cookies.values().iterator().next();
    assertEquals("r", WebSession.parse(REF, WebSession.parseHeader(header)).getString("refresh_token"));
  }

  @Test
  public void missingOrDamagedCookiesGiveNoSession() {
    assertNull(WebSession.parse(REF, new LinkedHashMap<>()));
    LinkedHashMap<String, String> bad = new LinkedHashMap<>();
    bad.put("sb-" + REF + "-auth-token", "base64-%%%not base64");
    assertNull(WebSession.parse(REF, bad));
    assertTrue(WebSession.parseHeader(null).isEmpty());
  }

  @Test
  public void webPathsMustStayInsideTheSite() {
    assertEquals("/reports", WebActivity.safePath("/reports"));
    assertEquals("/", WebActivity.safePath("//evil.example"));
    assertEquals("/", WebActivity.safePath("https://evil.example"));
    assertEquals("/", WebActivity.safePath(null));
  }

  @Test
  public void adoptsOnlyANewerSessionOfTheSameOwner() throws Exception {
    ArrayList<JSONObject> stored = new ArrayList<>();
    CloudClient client =
        new CloudClient(new SessionVault(RuntimeEnvironment.getApplication())) {
          @Override
          void persist(JSONObject value) {
            stored.add(value);
          }
        };
    client.session = session("r1", 1000L, "user-1");
    assertFalse("same refresh token", client.adoptWebSession(session("r1", 2000L, "user-1")));
    assertFalse("different account", client.adoptWebSession(session("r2", 2000L, "user-2")));
    assertFalse("older session", client.adoptWebSession(session("r2", 500L, "user-1")));
    assertFalse("nothing", client.adoptWebSession(null));
    assertEquals("r1", client.session.getString("refresh_token"));
    assertTrue(client.adoptWebSession(session("r2", 2000L, "user-1")));
    assertEquals("r2", client.session.getString("refresh_token"));
    assertEquals(1, stored.size());
    assertEquals("r2", stored.get(0).getString("refresh_token"));
  }

  @Test
  public void freshSessionIsNotRefreshedForTheWebView() throws Exception {
    ArrayList<String> log = new ArrayList<>();
    long soon = System.currentTimeMillis() / 1000L + 3000L;
    CloudClient client = AuthFailureTest.client(session("r1", soon, "user-1"), (m, p, a) -> null, log);
    client.ensureFresh(900);
    assertTrue("no network call needed", log.isEmpty());
  }

  @Test
  public void rateChoosesTheNewestDayAndPrefersYourOwn() throws Exception {
    JSONArray rows =
        new JSONArray(
            "[{\"rate\":4106.556143,\"as_of\":\"2026-11-02\",\"user_id\":null},"
                + "{\"rate\":4200,\"as_of\":\"2026-11-02\",\"user_id\":\"u\"},"
                + "{\"rate\":4000,\"as_of\":\"2026-11-01\",\"user_id\":null}]");
    assertEquals(0, new BigDecimal("4200").compareTo(CloudClient.pickRate(rows)));
    JSONArray published = new JSONArray("[{\"rate\":\"4106.556143\",\"as_of\":\"2026-11-02\",\"user_id\":null}]");
    assertEquals(0, new BigDecimal("4106.556143").compareTo(CloudClient.pickRate(published)));
    assertNull(CloudClient.pickRate(new JSONArray()));
  }

  @Test
  public void conversionFollowsTheWebAppBaseAmountRule() throws Exception {
    BigDecimal rate = new BigDecimal("4106.556143");
    // Entered on the web in riel: the stored dollar figure wins over today's rate.
    JSONObject web =
        new JSONObject()
            .put("amount", -600000L).put("currency", "KHR")
            .put("base_amount", -146L).put("base_currency", "USD");
    assertEquals(-146L, Ledger.inCurrency(web, "USD", rate));
    // Entered on the phone: no stored figure, so it converts at the current rate.
    JSONObject phone = new JSONObject().put("amount", -600000L).put("currency", "KHR");
    assertEquals(-146L, Ledger.inCurrency(phone, "USD", rate));
    // Same currency is untouched, and riel are converted back from dollars.
    assertEquals(-1234L, Ledger.inCurrency(new JSONObject().put("amount", -1234L).put("currency", "USD"), "USD", rate));
    assertEquals(
        Money.convert(-500L, "USD", "KHR", rate),
        Ledger.inCurrency(new JSONObject().put("amount", -500L).put("currency", "USD"), "KHR", rate));
    // Asking for riel ignores the stored dollar figure; the entry is already in riel.
    assertEquals(-600000L, Ledger.inCurrency(web, "KHR", rate));
  }
}