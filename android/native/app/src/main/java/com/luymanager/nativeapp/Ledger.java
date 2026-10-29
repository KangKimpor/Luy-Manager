package com.luymanager.nativeapp;

import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.HashMap;
import org.json.JSONArray;
import org.json.JSONObject;

final class Ledger {
  private final HashMap<String, Long> balances = new HashMap<>();
  private final HashMap<String, Long> totals = new HashMap<>();
  private final HashMap<String, long[]> flows = new HashMap<>();

  Ledger() {}

  Ledger(JSONArray accounts, JSONArray transactions) throws Exception {
    HashMap<String, String> currencies = new HashMap<>();
    for (int i = 0; i < accounts.length(); i++) {
      JSONObject account = accounts.getJSONObject(i);
      String id = account.getString("id");
      currencies.put(id, Money.currency(account.getString("currency")));
      balances.put(id, Money.checked(account.getLong("opening_balance")));
    }
    for (int i = 0; i < transactions.length(); i++) {
      JSONObject row = transactions.getJSONObject(i);
      String id = row.getString("account_id"), currency = Money.currency(row.getString("currency"));
      long amount = Money.checked(row.getLong("amount"));
      if (balances.containsKey(id)) {
        if (!currency.equals(currencies.get(id))) throw new Exception("Currency mismatch");
        balances.put(id, Money.add(balances.get(id), amount));
      }
      if (row.getString("type").equals("transfer")) continue;
      String key = month(row) + ":" + currency;
      long[] flow = flows.computeIfAbsent(key, ignored -> new long[2]);
      int direction = amount >= 0 ? 0 : 1;
      flow[direction] = Money.add(flow[direction], amount);
    }
    for (int i = 0; i < accounts.length(); i++) {
      JSONObject account = accounts.getJSONObject(i);
      if (!account.optBoolean("include_in_net_worth", true)) continue;
      String currency = account.getString("currency");
      totals.put(
          currency, Money.add(totals.getOrDefault(currency, 0L), balance(account.getString("id"))));
    }
  }

  static YearMonth month(JSONObject row) throws Exception {
    return YearMonth.from(
        OffsetDateTime.parse(row.getString("occurred_at"))
            .atZoneSameInstant(ZoneId.of("Asia/Phnom_Penh")));
  }

  long balance(String id) {
    return balances.getOrDefault(id, 0L);
  }

  long total(String currency) {
    return totals.getOrDefault(Money.currency(currency), 0L);
  }

  long[] flow(YearMonth month, String currency) {
    return flows.getOrDefault(month + ":" + Money.currency(currency), new long[2]).clone();
  }
}
