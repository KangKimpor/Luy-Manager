package com.luymanager.nativeapp;

import static org.junit.Assert.*;

import android.content.Context;
import java.util.*;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class LedgerStoreTest {
  final Context context = RuntimeEnvironment.getApplication();
  final String owner = UUID.randomUUID().toString();

  JSONObject transaction(String id) throws Exception {
    return new JSONObject()
        .put("id", id)
        .put("user_id", owner)
        .put("account_id", UUID.randomUUID().toString())
        .put("type", "expense")
        .put("amount", -999355L)
        .put("currency", "KHR");
  }

  @Test
  public void offlineQueueSurvivesProcessDatabaseReopen() throws Exception {
    LedgerStore store = new LedgerStore(context, owner);
    JSONObject row = transaction(UUID.randomUUID().toString());
    store.enqueue("transactions", new JSONArray().put(row));
    String op = store.pending().get(0).getString("id");
    store.close();
    store = new LedgerStore(context, owner);
    assertEquals(1, store.pendingCount());
    assertEquals(op, store.pending().get(0).getString("id"));
    assertEquals(-999355L, store.rows("transactions").getJSONObject(0).getLong("amount"));
    store.close();
  }

  @Test
  public void acknowledgedRowsNeverDoubleCountAndAccountDataIsIsolated() throws Exception {
    LedgerStore store = new LedgerStore(context, owner);
    JSONObject row = transaction(UUID.randomUUID().toString());
    store.enqueue("transactions", new JSONArray().put(row));
    String op = store.pending().get(0).getString("id");
    // Server committed but acknowledgement was lost: overlay by row ID, not by list position.
    store.commitSnapshot(
        new JSONObject().put("transactions", new JSONArray().put(row)), new ArrayList<>());
    assertEquals(1, store.rows("transactions").length());
    assertEquals(1, store.pendingCount());
    store.commitSnapshot(
        new JSONObject().put("transactions", new JSONArray().put(row)),
        new ArrayList<>(Arrays.asList(op)));
    assertEquals(1, store.rows("transactions").length());
    assertEquals(0, store.pendingCount());
    LedgerStore other = new LedgerStore(context, UUID.randomUUID().toString());
    assertEquals(0, other.rows("transactions").length());
    other.close();
    store.close();
  }

  @Test
  public void fifoKeepsAccountCreationBeforeDependentEntries() throws Exception {
    LedgerStore store = new LedgerStore(context, owner);
    for (int i = 0; i < 50; i++)
      store.enqueue(
          i == 0 ? "accounts" : "transactions",
          new JSONArray().put(transaction(UUID.randomUUID().toString())));
    assertEquals("accounts", store.pending().get(0).getJSONObject("operation").getString("table"));
    assertEquals(50, store.pendingCount());
    store.close();
  }

  @Test
  public void failedRefreshDoesNotRemoveUnacknowledgedOperations() throws Exception {
    LedgerStore store = new LedgerStore(context, owner);
    store.enqueue("transactions", new JSONArray().put(transaction(UUID.randomUUID().toString())));
    String id = store.pending().get(0).getString("id");
    store.failed(id, "offline");
    store.close();
    store = new LedgerStore(context, owner);
    assertEquals("offline", store.pending().get(0).getString("error"));
    assertEquals(1, store.pendingCount());
    store.close();
  }
}
