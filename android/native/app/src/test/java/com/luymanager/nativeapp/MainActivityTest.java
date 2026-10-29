package com.luymanager.nativeapp;

import static org.junit.Assert.*;

import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class MainActivityTest {
  LuyApplication app;
  ActivityController<MainActivity> controller;
  MainActivity activity;

  @Before
  public void setUp() throws Exception {
    app = (LuyApplication) RuntimeEnvironment.getApplication();
    String owner = UUID.randomUUID().toString();
    app.cloud =
        new CloudClient(new SessionVault(app)) {
          @Override
          void sync(LedgerStore store) throws Exception {
            throw new java.io.IOException("Offline test");
          }

          @Override
          Response request(String m, String p, Object b, boolean auth, int offset) {
            throw new AssertionError("Unexpected live network call");
          }
        };
    app.cloud.session = new JSONObject().put("user", new JSONObject().put("id", owner));
    app.store = new LedgerStore(app, owner);
    JSONArray accounts = new JSONArray();
    for (String currency : new String[] {"USD", "KHR"})
      accounts.put(
          new JSONObject()
              .put("id", UUID.randomUUID().toString())
              .put("user_id", owner)
              .put("name", currency + " Account")
              .put("currency", currency)
              .put("opening_balance", 100000L)
              .put("is_active", true)
              .put("include_in_net_worth", true));
    app.store.commitSnapshot(
        new JSONObject()
            .put("accounts", accounts)
            .put("transactions", new JSONArray())
            .put("categories", new JSONArray())
            .put("budgets", new JSONArray()),
        new java.util.ArrayList<>());
    controller = Robolectric.buildActivity(MainActivity.class).create().start();
    activity = controller.get();
    drain();
  }

  void drain() throws Exception {
    app.worker.submit(() -> {}).get(30, TimeUnit.SECONDS);
    Shadows.shadowOf(Looper.getMainLooper()).idle();
  }

  @After
  public void finish() {
    if (controller != null) controller.destroy();
    app.worker.shutdownNow();
    app.network.shutdownNow();
    if (app.store != null) app.store.close();
  }

  /** A tappable view whose label or accessible name is `label`. */
  View button(View node, String label) {
    CharSequence name = node.getContentDescription();
    boolean named =
        (name != null && name.toString().equals(label))
            || (node instanceof android.widget.TextView
                && ((android.widget.TextView) node).getText().toString().equals(label));
    if (named && node.isClickable() && node.getVisibility() == View.VISIBLE) return node;
    if (node instanceof ViewGroup) {
      ViewGroup parent = (ViewGroup) node;
      for (int i = 0; i < parent.getChildCount(); i++) {
        View found = button(parent.getChildAt(i), label);
        if (found != null) return found;
      }
    }
    return null;
  }

  void click(String label) throws Exception {
    View b = button(activity.root, label);
    assertNotNull(label, b);
    b.performClick();
    drain();
  }

  @Test
  public void startupAndNavigationUseNativeViewsWithoutNetwork() throws Exception {
    assertEquals(2, activity.accounts.length());
    assertEquals(0, activity.transactions.length());
    for (String label : new String[] {"Activity", "Add transaction", "Accounts", "More", "Budgets", "Home"}) click(label);
    assertFalse(containsWebView(activity.root));
  }

  boolean containsWebView(View v) {
    if (v instanceof android.webkit.WebView) return true;
    if (v instanceof ViewGroup) {
      ViewGroup p = (ViewGroup) v;
      for (int i = 0; i < p.getChildCount(); i++) if (containsWebView(p.getChildAt(i))) return true;
    }
    return false;
  }

  @Test
  public void offlineExpenseIsDurableAndVisibleLocally() throws Exception {
    click("Add transaction");
    activity.amount.setText("9993.55");
    activity.account.setSelection(1);
    activity.note.setText("Offline purchase");
    click("Save expense");
    assertEquals(1, app.store.pendingCount());
    JSONObject row = app.store.rows("transactions").getJSONObject(0);
    assertEquals(-999355L, row.getLong("amount"));
    assertEquals("KHR", row.getString("currency"));
    assertEquals("Offline purchase", row.getString("notes"));
    assertEquals(1, activity.transactions.length());
  }

  @Test
  public void accountsWithoutATypeCountAsBankInCashAvailable() throws Exception {
    assertEquals(100000L, activity.totalOf("USD", "bank", "ewallet", "cash"));
    assertEquals(100000L, activity.totalOf("KHR", "bank"));
  }

  @Test
  public void keypadEntersAmountsWithAtMostTwoDecimals() throws Exception {
    click("Add transaction");
    for (String key : new String[] {"1", "2", ".", "5", "0", "9"}) click("Key " + key);
    assertEquals("12.50", activity.amount.getText().toString());
    click("Delete last digit");
    assertEquals("12.5", activity.amount.getText().toString());
  }

  @Test
  public void transfersQueueBothLegsAsOneOperation() throws Exception {
    click("Add transaction");
    click("Transfer");
    activity.account.setSelection(0);
    activity.destination.setSelection(1);
    activity.amount.setText("10.00");
    activity.received.setText("41000.00");
    click("Save transfer");
    assertEquals(1, app.store.pendingCount());
    JSONArray rows = app.store.pending().get(0).getJSONObject("operation").getJSONArray("rows");
    assertEquals(2, rows.length());
    assertEquals(
        rows.getJSONObject(0).getString("transfer_group_id"),
        rows.getJSONObject(1).getString("transfer_group_id"));
    assertEquals(-1000L, rows.getJSONObject(0).getLong("amount"));
    assertEquals(4100000L, rows.getJSONObject(1).getLong("amount"));
  }

  @Test
  public void draftKeepsExplicitAccountWhenSnapshotOrderChanges() throws Exception {
    click("Add transaction");
    activity.account.setSelection(1);
    activity.amount.setText("12.34");
    String selected = activity.selectedId(activity.account);
    click("Home");
    JSONArray old = activity.accounts;
    activity.accounts = new JSONArray().put(old.getJSONObject(1)).put(old.getJSONObject(0));
    click("Add transaction");
    assertEquals(selected, activity.selectedId(activity.account));
    assertEquals("12.34", activity.amount.getText().toString());
  }

  @Test
  public void activityPagesIncludeEntriesBeyondTheFirstHundred() throws Exception {
    for (int i = 0; i < 105; i++)
      activity.transactions.put(
          new JSONObject()
              .put("id", UUID.randomUUID().toString())
              .put("account_id", activity.accounts.getJSONObject(0).getString("id"))
              .put("amount", -100L)
              .put("currency", "USD")
              .put("type", "expense")
              .put("occurred_at", activity.month.atDay(1) + "T12:00:00+07:00")
              .put("notes", "Entry " + i));
    activity.tab = 1;
    activity.draw();
    assertNotNull(button(activity.root, "Next 50"));
    click("Next 50");
    click("Next 50");
    assertNull(button(activity.root, "Next 50"));
    assertNotNull(button(activity.root, "Previous 50"));
    assertTrue(screenText(activity.root).contains("Entry 104"));
    assertTrue(screenText(activity.root).contains("Showing 101 to 105 of 105"));
    assertFalse(screenText(activity.root).contains("Entry 0"));
  }

  String screenText(View view) {
    StringBuilder result = new StringBuilder();
    if (view instanceof android.widget.TextView)
      result.append(((android.widget.TextView) view).getText()).append('\n');
    if (view instanceof ViewGroup) {
      ViewGroup group = (ViewGroup) view;
      for (int i = 0; i < group.getChildCount(); i++)
        result.append(screenText(group.getChildAt(i)));
    }
    return result.toString();
  }

  @Test
  public void aSlowConnectionDoesNotBlockLocalReads() throws Exception {
    java.util.concurrent.CountDownLatch started = new java.util.concurrent.CountDownLatch(1),
        release = new java.util.concurrent.CountDownLatch(1);
    app.network.execute(
        () -> {
          started.countDown();
          try {
            release.await(10, TimeUnit.SECONDS);
          } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
          }
        });
    assertTrue(started.await(1, TimeUnit.SECONDS));
    try {
      app.worker.submit(() -> {}).get(1, TimeUnit.SECONDS);
      click("Add transaction");
      assertNotNull(activity.amount);
    } finally {
      release.countDown();
    }
  }

  @Test
  public void backReturnsHomeAndKeepsTheEntryDraft() throws Exception {
    click("Add transaction");
    activity.amount.setText("12.34");
    activity.goBack();
    assertEquals(0, activity.tab);
    assertFalse(activity.isFinishing());
    click("Add transaction");
    assertEquals("12.34", activity.amount.getText().toString());
    activity.goBack();
    activity.goBack();
    assertTrue(activity.isFinishing());
  }

  @Test
  public void overlappingForegroundAndBackgroundSyncUseOneConnectionSequence() throws Exception {
    java.util.concurrent.CountDownLatch started = new java.util.concurrent.CountDownLatch(1),
        release = new java.util.concurrent.CountDownLatch(1);
    java.util.concurrent.atomic.AtomicInteger
        requests = new java.util.concurrent.atomic.AtomicInteger(),
        callbacks = new java.util.concurrent.atomic.AtomicInteger();
    app.cloud =
        new CloudClient(new SessionVault(app)) {
          @Override
          void sync(LedgerStore store) throws Exception {
            requests.incrementAndGet();
            started.countDown();
            release.await(5, TimeUnit.SECONDS);
          }
        };
    app.cloud.session =
        new JSONObject().put("user", new JSONObject().put("id", UUID.randomUUID().toString()));
    try {
      app.sync(null);
      assertTrue(started.await(1, TimeUnit.SECONDS));
      for (int i = 0; i < 10; i++) app.sync(callbacks::incrementAndGet);
    } finally {
      release.countDown();
    }
    app.network.submit(() -> {}).get(5, TimeUnit.SECONDS);
    assertEquals(1, requests.get());
    assertEquals(10, callbacks.get());
  }
}
