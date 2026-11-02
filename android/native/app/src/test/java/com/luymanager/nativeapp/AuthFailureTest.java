package com.luymanager.nativeapp;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.UUID;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

/** A rejected key or token must never be reported as "Connection unavailable". */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class AuthFailureTest {
  interface Reply {
    CloudClient.Response to(String method, String path, boolean auth) throws Exception;
  }

  static CloudClient client(JSONObject session, Reply reply, ArrayList<String> log)
      throws Exception {
    CloudClient client =
        new CloudClient(new SessionVault(RuntimeEnvironment.getApplication())) {
          @Override
          Response transport(String method, String path, Object body, boolean auth, int offset)
              throws Exception {
            log.add(method + " " + path);
            return reply.to(method, path, auth);
          }
        };
    client.session = session;
    return client;
  }

  static CloudClient.Response answer(int status, String body) {
    CloudClient.Response r = new CloudClient.Response();
    r.status = status;
    r.body = body;
    return r;
  }

  @Test
  public void rejectedKeyIsNotAConnectionProblem() throws Exception {
    ArrayList<String> log = new ArrayList<>();
    CloudClient client = client(null, (m, p, a) -> answer(401, ""), log);
    CloudClient.AuthException e =
        assertThrows(
            CloudClient.AuthException.class,
            () -> client.request("POST", "/auth/v1/token?grant_type=refresh_token", null, false, -1));
    assertEquals(CloudClient.KEY_REJECTED, e.getMessage());
    assertFalse("a new sign-in cannot fix a rejected key", e.signInAgain);
    assertFalse((Object) e instanceof java.io.IOException);
  }

  @Test
  public void expiredSessionWithoutRefreshTokenAsksForSignIn() throws Exception {
    ArrayList<String> log = new ArrayList<>();
    JSONObject session = new JSONObject().put("access_token", "old");
    CloudClient client = client(session, (m, p, a) -> answer(401, ""), log);
    CloudClient.AuthException e =
        assertThrows(
            CloudClient.AuthException.class,
            () -> client.request("GET", "/rest/v1/accounts", null, true, -1));
    assertEquals(CloudClient.SESSION_EXPIRED, e.getMessage());
    assertTrue(e.signInAgain);
    assertEquals("No refresh was possible, so only one request is made", 1, log.size());
  }

  @Test
  public void a401TriggersOneRefreshAndAnInvalidRefreshTokenAsksForSignIn() throws Exception {
    ArrayList<String> log = new ArrayList<>();
    JSONObject session =
        new JSONObject()
            .put("access_token", "old")
            .put("refresh_token", "stale")
            .put("user", new JSONObject().put("id", UUID.randomUUID().toString()));
    CloudClient client =
        client(
            session,
            (m, p, a) ->
                p.contains("grant_type=refresh_token")
                    ? answer(400, "{\"error\":\"invalid_grant\"}")
                    : answer(401, ""),
            log);
    CloudClient.AuthException e =
        assertThrows(
            CloudClient.AuthException.class,
            () -> client.request("GET", "/rest/v1/accounts", null, true, -1));
    assertTrue(e.signInAgain);
    assertEquals(2, log.size());
    assertTrue(log.get(1).contains("grant_type=refresh_token"));
  }

  @Test
  public void signingInWithADifferentAccountIsRefusedAndKeepsTheOldSession() throws Exception {
    String other = UUID.randomUUID().toString();
    String expected = UUID.randomUUID().toString();
    JSONObject old = new JSONObject().put("access_token", "old");
    CloudClient client =
        client(
            old,
            (m, p, a) ->
                p.contains("grant_type=pkce")
                    ? answer(200, "{\"access_token\":\"new\",\"refresh_token\":\"r\"}")
                    : answer(200, "{\"id\":\"" + other + "\"}"),
            new ArrayList<>());
    Exception e = assertThrows(Exception.class, () -> client.authenticate("code", "verifier", expected));
    assertTrue(e.getMessage().contains("different"));
    assertSame(old, client.session);
  }

  @Test
  public void networkFailuresStayNetworkFailures() throws Exception {
    CloudClient client =
        client(
            new JSONObject().put("access_token", "x"),
            (m, p, a) -> {
              throw new java.net.UnknownHostException("no route");
            },
            new ArrayList<>());
    assertThrows(
        java.io.IOException.class, () -> client.request("GET", "/rest/v1/accounts", null, true, -1));
  }
}
