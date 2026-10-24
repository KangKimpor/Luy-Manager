package com.luymanager.nativeapp;

import static org.junit.Assert.*;

import java.time.YearMonth;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class LedgerTest {
  JSONObject account(String id, String currency, long opening) throws Exception {
    return new JSONObject().put("id", id).put("currency", currency).put("opening_balance", opening);
  }

  JSONObject row(String account, String currency, long amount, String type) throws Exception {
    return new JSONObject()
        .put("account_id", account)
        .put("currency", currency)
        .put("amount", amount)
        .put("type", type)
        .put("occurred_at", "2026-09-30T18:00:00Z");
  }

  @Test
  public void balancesAndCashFlowStayExactAndSeparateByCurrency() throws Exception {
    JSONArray accounts =
        new JSONArray().put(account("usd", "USD", 10000L)).put(account("khr", "KHR", 5000000L));
    JSONArray rows =
        new JSONArray()
            .put(row("usd", "USD", -1000L, "expense"))
            .put(row("usd", "USD", 300L, "refund"))
            .put(row("usd", "USD", -200L, "adjustment"))
            .put(row("usd", "USD", -500L, "transfer"))
            .put(row("khr", "KHR", 2050000L, "transfer"));
    Ledger ledger = new Ledger(accounts, rows);
    assertEquals(8600L, ledger.total("USD"));
    assertEquals(7050000L, ledger.total("KHR"));
    assertArrayEquals(new long[] {300L, -1200L}, ledger.flow(YearMonth.of(2026, 10), "USD"));
    assertArrayEquals(new long[] {0L, 0L}, ledger.flow(YearMonth.of(2026, 9), "USD"));
    assertArrayEquals(new long[] {0L, 0L}, ledger.flow(YearMonth.of(2026, 10), "KHR"));
  }

  @Test
  public void currencyMismatchCannotSilentlyChangeABalance() throws Exception {
    assertThrows(
        Exception.class,
        () ->
            new Ledger(
                new JSONArray().put(account("usd", "USD", 0)),
                new JSONArray().put(row("usd", "KHR", 100L, "income"))));
  }
}
