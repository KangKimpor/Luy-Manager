package com.luymanager.nativeapp;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

public final class MainActivity extends Activity {
  LuyApplication app;
  LinearLayout root, body, header;
  TextView status;
  Ledger ledger = new Ledger();
  JSONArray accounts = new JSONArray(),
      categories = new JSONArray(),
      transactions = new JSONArray(),
      budgets = new JSONArray();
  int tab = 0;
  YearMonth month = YearMonth.now(ZoneId.of("Asia/Phnom_Penh"));
  boolean loaded = false;
  EditText amount, note, received;
  Spinner account, category, type, destination;
  LocalDate date = LocalDate.now(ZoneId.of("Asia/Phnom_Penh"));

  SharedPreferences draft() {
    return getSharedPreferences("draft-" + owner(), 0);
  }

  String owner() {
    try {
      return app.cloud == null || !app.cloud.signedIn() ? "signed-out" : app.cloud.owner();
    } catch (Exception e) {
      return "signed-out";
    }
  }

  int dp(float value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }

  int color(int id) {
    return getColor(id);
  }

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    app = (LuyApplication) getApplication();
    if (android.os.Build.VERSION.SDK_INT >= 33)
      getOnBackInvokedDispatcher()
          .registerOnBackInvokedCallback(
              android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
    if (state != null) tab = state.getInt("tab", 0);
    handle(getIntent());
    load();
  }

  void goBack() {
    if (tab == 0 || app.store == null) {
      finish();
      return;
    }
    saveDraft();
    tab = 0;
    draw();
  }

  @Override
  public void onBackPressed() {
    goBack();
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handle(intent);
  }

  @Override
  protected void onSaveInstanceState(Bundle state) {
    saveDraft();
    state.putInt("tab", tab);
    super.onSaveInstanceState(state);
  }

  @Override
  protected void onPause() {
    saveDraft();
    super.onPause();
  }

  @Override
  protected void onResume() {
    super.onResume();
    if (app.store != null) {
      app.schedule();
      app.sync(
          () ->
              runOnUiThread(
                  () -> {
                    if (!isFinishing()) load();
                  }));
    }
  }

  String selectedId(Spinner s) {
    try {
      JSONObject row = ((ArrayList<JSONObject>) s.getTag()).get(s.getSelectedItemPosition());
      return row == null ? "" : row.getString("id");
    } catch (Exception e) {
      return "";
    }
  }

  void selectId(Spinner s, String id) {
    if (id == null) return;
    try {
      ArrayList<JSONObject> rows = (ArrayList<JSONObject>) s.getTag();
      for (int i = 0; i < rows.size(); i++) {
        JSONObject row = rows.get(i);
        if (row != null && row.getString("id").equals(id)) {
          s.setSelection(i);
          return;
        }
      }
    } catch (Exception ignored) {
    }
  }

  void saveDraft() {
    if (tab != 2 || amount == null || account == null) return;
    draft()
        .edit()
        .putString("amount", amount.getText().toString())
        .putString("note", note.getText().toString())
        .putString("account_id", selectedId(account))
        .putInt("type", type.getSelectedItemPosition())
        .putString("category_id", selectedId(category))
        .putString("received", received.getText().toString())
        .putString("destination_id", selectedId(destination))
        .putString("date", date.toString())
        .apply();
  }

  void handle(Intent intent) {
    Uri uri = intent.getData();
    if (app.store != null
        || uri == null
        || !CloudClient.CALLBACK.equals(
            uri.buildUpon().clearQuery().fragment(null).build().toString())) return;
    SharedPreferences auth = getSharedPreferences("auth-flow", 0);
    String verifier = auth.getString("verifier", null);
    long age = System.currentTimeMillis() - auth.getLong("created", 0);
    String code = uri.getQueryParameter("code");
    if (code == null || verifier == null || age < 0 || age > 600000) {
      app.status = "Sign-in expired. Start sign-in again.";
      return;
    }
    auth.edit().clear().commit();
    intent.setData(null);
    app.network.execute(
        () -> {
          try {
            CloudClient authenticated = new CloudClient(new SessionVault(this));
            authenticated.authenticate(code, verifier);
            app.cloud = authenticated;
            app.store = new LedgerStore(this, authenticated.owner());
            app.status = "Signed in";
            runOnUiThread(
                () -> {
                  loaded = false;
                  load();
                  app.sync(() -> runOnUiThread(this::load));
                });
          } catch (Exception e) {
            runOnUiThread(
                () -> {
                  app.status = "Could not complete sign-in. Try again.";
                  draw();
                });
          }
        });
  }

  void login() {
    try {
      byte[] random = new byte[48];
      new SecureRandom().nextBytes(random);
      String verifier =
          Base64.encodeToString(random, Base64.NO_WRAP | Base64.NO_PADDING | Base64.URL_SAFE);
      String challenge =
          Base64.encodeToString(
              MessageDigest.getInstance("SHA-256")
                  .digest(verifier.getBytes(java.nio.charset.StandardCharsets.US_ASCII)),
              Base64.NO_WRAP | Base64.NO_PADDING | Base64.URL_SAFE);
      getSharedPreferences("auth-flow", 0)
          .edit()
          .putString("verifier", verifier)
          .putLong("created", System.currentTimeMillis())
          .commit();
      Uri url =
          Uri.parse(BuildConfig.SUPABASE_URL + "/auth/v1/authorize")
              .buildUpon()
              .appendQueryParameter("provider", "google")
              .appendQueryParameter("redirect_to", CloudClient.CALLBACK)
              .appendQueryParameter("code_challenge", challenge)
              .appendQueryParameter("code_challenge_method", "s256")
              .build();
      startActivity(new Intent(Intent.ACTION_VIEW, url));
    } catch (Exception e) {
      error("Could not open sign-in");
    }
  }

  void load() {
    LedgerStore source = app.store;
    if (source == null) {
      draw();
      return;
    }
    app.worker.execute(
        () -> {
          try {
            JSONArray a = source.rows("accounts"),
                c = source.rows("categories"),
                t = source.rows("transactions"),
                b = source.rows("budgets");
            Ledger summary = new Ledger(a, t);
            ArrayList<JSONObject> sorted = new ArrayList<>();
            for (int i = 0; i < t.length(); i++) sorted.add(t.getJSONObject(i));
            sorted.sort(
                Comparator.comparing((JSONObject o) -> o.optString("occurred_at")).reversed());
            JSONArray ordered = new JSONArray();
            for (JSONObject row : sorted) ordered.put(row);
            runOnUiThread(
                () -> {
                  if (app.store != source || isFinishing()) return;
                  accounts = a;
                  categories = c;
                  transactions = ordered;
                  budgets = b;
                  ledger = summary;
                  boolean preserve = loaded && tab == 2 && amount != null;
                  loaded = true;
                  if (preserve && status != null) updateStatus();
                  else draw();
                });
          } catch (Exception e) {
            runOnUiThread(() -> error("Could not read the local ledger. It has been preserved."));
          }
        });
  }

  void updateStatus() {
    status.setText(
        app.status + (app.store == null ? "" : "  |  " + app.store.pendingCount() + " pending"));
  }

  void draw() {
    amount = null;
    root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(color(R.color.surface));
    setContentView(root);
    root.setOnApplyWindowInsetsListener(
        (v, insets) -> {
          if (android.os.Build.VERSION.SDK_INT >= 30) {
            android.graphics.Insets bars =
                insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
            root.setPadding(bars.left, bars.top, bars.right, bars.bottom);
          } else
            root.setPadding(
                insets.getSystemWindowInsetLeft(),
                insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(),
                insets.getSystemWindowInsetBottom());
          return insets;
        });
    root.requestApplyInsets();
    header = new LinearLayout(this);
    header.setOrientation(LinearLayout.VERTICAL);
    header.setPadding(dp(20), dp(12), dp(20), dp(8));
    root.addView(header);
    text(header, "LUY MANAGER", 12, R.color.muted, false);
    text(
        header,
        new String[] {"Home", "Activity", "Add transaction", "Accounts", "More"}[tab],
        26,
        R.color.ink,
        true);
    status = text(header, "", 12, R.color.muted, false);
    status.setPadding(0, dp(8), 0, dp(6));
    updateStatus();
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
    body = new LinearLayout(this);
    body.setPadding(dp(20), dp(10), dp(20), dp(24));
    body.setOrientation(LinearLayout.VERTICAL);
    scroll.addView(body);
    if (app.store == null) {
      text(body, "Your money, ready on your phone", 24, R.color.ink, true);
      text(
          body,
          "Sign in once to download your ledger. After that, add entries offline and sync when you"
              + " reconnect.",
          16,
          R.color.muted,
          false);
      button(body, "Continue with Google", this::login);
      return;
    }
    try {
      switch (tab) {
        case 0:
          home();
          break;
        case 1:
          activity();
          break;
        case 2:
          entry();
          break;
        case 3:
          accounts();
          break;
        default:
          more();
      }
    } catch (Exception e) {
      text(
          body,
          "Could not display this screen. Your local entries have been preserved.",
          16,
          R.color.outflow,
          false);
    }
    LinearLayout nav = new LinearLayout(this);
    nav.setPadding(dp(4), dp(4), dp(4), dp(4));
    root.addView(nav);
    String[] tabs = {"Home", "Activity", "Add", "Accounts", "More"};
    for (int i = 0; i < tabs.length; i++) {
      final int next = i;
      Button button = new Button(this);
      button.setText(tabs[i]);
      button.setTextSize(11);
      button.setAllCaps(false);
      button.setTextColor(color(i == tab ? R.color.brand : R.color.muted));
      button.setMinWidth(0);
      button.setMinimumWidth(0);
      button.setPadding(0, 0, 0, 0);
      nav.addView(button, new LinearLayout.LayoutParams(0, dp(52), 1));
      button.setOnClickListener(
          v -> {
            saveDraft();
            tab = next;
            draw();
          });
    }
  }

  TextView text(LinearLayout parent, String value, int size, int color, boolean bold) {
    TextView t = new TextView(this);
    t.setText(value);
    t.setTextSize(size);
    t.setTextColor(color(color));
    t.setPadding(0, dp(5), 0, dp(5));
    if (bold) t.setTypeface(null, Typeface.BOLD);
    parent.addView(t);
    return t;
  }

  LinearLayout card() {
    LinearLayout box = new LinearLayout(this);
    box.setOrientation(LinearLayout.VERTICAL);
    box.setPadding(dp(18), dp(14), dp(18), dp(14));
    GradientDrawable bg = new GradientDrawable();
    bg.setColor(color(R.color.surface_raised));
    bg.setCornerRadius(dp(20));
    box.setBackground(bg);
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
    p.bottomMargin = dp(14);
    body.addView(box, p);
    return box;
  }

  Button button(LinearLayout parent, String label, Runnable action) {
    Button b = new Button(this);
    b.setText(label);
    b.setAllCaps(false);
    b.setMinHeight(dp(48));
    b.setTextColor(color(R.color.brand));
    parent.addView(b, new LinearLayout.LayoutParams(-1, -2));
    b.setOnClickListener(v -> action.run());
    return b;
  }

  EditText field(LinearLayout parent, String label, boolean numeric) {
    text(parent, label, 14, R.color.muted, false);
    EditText e = new EditText(this);
    e.setSingleLine(true);
    e.setTextSize(17);
    e.setContentDescription(label);
    e.setMinHeight(dp(50));
    e.setInputType(
        numeric
            ? InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL
            : InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
    parent.addView(e, new LinearLayout.LayoutParams(-1, -2));
    return e;
  }

  Spinner spinner(LinearLayout parent, String label, ArrayList<String> values) {
    text(parent, label, 14, R.color.muted, false);
    Spinner s = new Spinner(this);
    s.setContentDescription(label);
    ArrayAdapter<String> adapter =
        new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, values);
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
    s.setAdapter(adapter);
    parent.addView(s, new LinearLayout.LayoutParams(-1, dp(50)));
    return s;
  }

  Spinner choices(LinearLayout parent, String label, String... labels) {
    return spinner(parent, label, new ArrayList<>(java.util.Arrays.asList(labels)));
  }

  void select(Spinner s, int n) {
    if (n >= 0 && n < s.getCount()) s.setSelection(n);
  }

  JSONObject find(JSONArray rows, String id) throws Exception {
    for (int i = 0; i < rows.length(); i++)
      if (rows.getJSONObject(i).getString("id").equals(id)) return rows.getJSONObject(i);
    throw new Exception("Missing reference");
  }

  String accountName(JSONObject row) {
    try {
      return find(accounts, row.getString("account_id")).getString("name");
    } catch (Exception e) {
      return "Archived account";
    }
  }

  String categoryName(JSONObject row) {
    try {
      return find(categories, row.getString("category_id")).getString("name");
    } catch (Exception e) {
      return row.optString("type", "Uncategorised");
    }
  }

  long balance(JSONObject account) throws Exception {
    return ledger.balance(account.getString("id"));
  }

  boolean inMonth(JSONObject row) {
    try {
      return Ledger.month(row).equals(month);
    } catch (Exception e) {
      return false;
    }
  }

  void period() {
    LinearLayout row = new LinearLayout(this);
    body.addView(row);
    Button previous = new Button(this);
    previous.setText("Previous");
    row.addView(previous, new LinearLayout.LayoutParams(0, dp(48), 1));
    previous.setOnClickListener(
        v -> {
          month = month.minusMonths(1);
          draw();
        });
    TextView label = new TextView(this);
    label.setText(month.toString());
    label.setGravity(Gravity.CENTER);
    row.addView(label, new LinearLayout.LayoutParams(0, dp(48), 1));
    Button next = new Button(this);
    next.setText("Next");
    row.addView(next, new LinearLayout.LayoutParams(0, dp(48), 1));
    next.setOnClickListener(
        v -> {
          month = month.plusMonths(1);
          draw();
        });
  }

  void home() throws Exception {
    LinearLayout worth = card();
    text(worth, "Total balances by currency", 14, R.color.muted, false);
    for (String currency : new String[] {"USD", "KHR"}) {
      text(worth, Money.format(ledger.total(currency), currency), 28, R.color.ink, true);
    }
    period();
    LinearLayout flow = card();
    text(flow, "This month's cash flow", 18, R.color.ink, true);
    for (String currency : new String[] {"USD", "KHR"}) {
      long[] amounts = ledger.flow(month, currency);
      text(flow, "Income  " + Money.format(amounts[0], currency), 16, R.color.inflow, false);
      text(flow, "Spending  " + Money.format(amounts[1], currency), 16, R.color.outflow, false);
    }
    button(
        body,
        "Add an entry",
        () -> {
          tab = 2;
          draw();
        });
    text(body, "Recent activity", 20, R.color.ink, true);
    int count = 0;
    for (int i = 0; i < transactions.length() && count < 5; i++) {
      JSONObject t = transactions.getJSONObject(i);
      if (inMonth(t)) {
        transaction(t);
        count++;
      }
    }
    if (count == 0) text(body, "No entries in this month.", 16, R.color.muted, false);
  }

  void transaction(JSONObject row) throws Exception {
    LinearLayout box = card();
    text(box, categoryName(row) + "  |  " + accountName(row), 15, R.color.ink, true);
    text(
        box,
        Money.format(row.getLong("amount"), row.getString("currency")),
        22,
        row.getLong("amount") < 0 ? R.color.outflow : R.color.inflow,
        true);
    if (!row.isNull("notes")) text(box, row.getString("notes"), 15, R.color.muted, false);
    text(
        box,
        row.getString("occurred_at").substring(0, 10)
            + (row.optBoolean("_pending") ? "  |  Waiting to sync" : ""),
        12,
        R.color.muted,
        false);
  }

  void activity() throws Exception {
    period();
    EditText search = field(body, "Search notes", false);
    LinearLayout list = new LinearLayout(this);
    list.setOrientation(LinearLayout.VERTICAL);
    body.addView(list);
    button(body, "Search", () -> showActivity(list, search.getText().toString(), 0));
    showActivity(list, "", 0);
  }

  void showActivity(LinearLayout list, String search, int start) {
    LinearLayout original = body;
    try {
      list.removeAllViews();
      body = list;
      String term = search.toLowerCase(java.util.Locale.ROOT);
      int matched = 0;
      for (int i = 0; i < transactions.length(); i++) {
        JSONObject row = transactions.getJSONObject(i);
        if (!inMonth(row)
            || !row.optString("notes", "").toLowerCase(java.util.Locale.ROOT).contains(term))
          continue;
        if (matched >= start && matched < start + 50) transaction(row);
        matched++;
      }
      if (matched == 0) text(list, "No matching entries.", 16, R.color.muted, false);
      else
        text(
            list,
            "Showing " + (start + 1) + " to " + Math.min(start + 50, matched) + " of " + matched,
            13,
            R.color.muted,
            false);
      if (start > 0)
        button(list, "Previous 50", () -> showActivity(list, search, Math.max(0, start - 50)));
      if (matched > start + 50)
        button(list, "Next 50", () -> showActivity(list, search, start + 50));
    } catch (Exception e) {
      error("Could not display activity");
    } finally {
      body = original;
    }
  }

  void accounts() throws Exception {
    for (int i = 0; i < accounts.length(); i++) {
      JSONObject a = accounts.getJSONObject(i);
      LinearLayout box = card();
      text(
          box,
          a.getString("name") + (a.optBoolean("is_active", true) ? "" : " (closed)"),
          18,
          R.color.ink,
          true);
      text(box, Money.format(balance(a), a.getString("currency")), 24, R.color.ink, true);
    }
    button(body, "Add account", this::newAccount);
  }

  void newAccount() {
    LinearLayout form = new LinearLayout(this);
    form.setPadding(dp(20), 0, dp(20), 0);
    form.setOrientation(LinearLayout.VERTICAL);
    EditText name = field(form, "Account name", false);
    Spinner currency = choices(form, "Currency", "USD", "KHR");
    Spinner kind =
        choices(
            form,
            "Account type",
            "bank",
            "cash",
            "ewallet",
            "savings",
            "credit_card",
            "investment");
    EditText opening = field(form, "Opening balance", true);
    opening.setText("0");
    AlertDialog dialog =
        new AlertDialog.Builder(this)
            .setTitle("Add account")
            .setView(form)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Save offline", null)
            .create();
    dialog.setOnShowListener(
        v ->
            dialog
                .getButton(-1)
                .setOnClickListener(
                    b -> {
                      try {
                        String label = name.getText().toString().trim();
                        if (label.isEmpty() || label.length() > 100)
                          throw new Exception("Enter an account name (up to 100 characters)");
                        JSONObject row =
                            new JSONObject()
                                .put("id", UUID.randomUUID().toString())
                                .put("user_id", owner())
                                .put("name", label)
                                .put("currency", currency.getSelectedItem())
                                .put("type", kind.getSelectedItem())
                                .put("opening_balance", Money.parse(opening.getText().toString()))
                                .put("is_active", true)
                                .put("include_in_net_worth", true)
                                .put("sort_order", 0);
                        queue("accounts", new JSONArray().put(row));
                        dialog.dismiss();
                      } catch (Exception e) {
                        error(e.getMessage());
                      }
                    }));
    dialog.show();
  }

  void entry() throws Exception {
    ArrayList<JSONObject> active = new ArrayList<>();
    ArrayList<String> labels = new ArrayList<>();
    for (int i = 0; i < accounts.length(); i++) {
      JSONObject a = accounts.getJSONObject(i);
      if (a.optBoolean("is_active", true)) {
        active.add(a);
        labels.add(a.getString("name") + " (" + a.getString("currency") + ")");
      }
    }
    if (active.isEmpty()) {
      text(body, "Add an account before recording an entry.", 17, R.color.muted, false);
      button(body, "Add account", this::newAccount);
      return;
    }
    SharedPreferences saved = draft();
    type = choices(body, "Entry type", "Expense", "Income", "Refund", "Transfer");
    select(type, saved.getInt("type", 0));
    account = spinner(body, "From account", labels);
    account.setTag(active);
    selectId(account, saved.getString("account_id", null));
    amount = field(body, "Amount", true);
    amount.setText(saved.getString("amount", ""));
    note = field(body, "Note", false);
    note.setText(saved.getString("note", ""));
    ArrayList<String> cats = new ArrayList<>();
    ArrayList<JSONObject> categoryOptions = new ArrayList<>();
    cats.add("Uncategorised");
    categoryOptions.add(null);
    for (int i = 0; i < categories.length(); i++) {
      cats.add(categories.getJSONObject(i).getString("name"));
      categoryOptions.add(categories.getJSONObject(i));
    }
    category = spinner(body, "Category (ignored for transfers)", cats);
    category.setTag(categoryOptions);
    selectId(category, saved.getString("category_id", null));
    try {
      date =
          LocalDate.parse(
              saved.getString("date", LocalDate.now(ZoneId.of("Asia/Phnom_Penh")).toString()));
    } catch (Exception e) {
      date = LocalDate.now();
    }
    Button dateButton = button(body, "Date: " + date, () -> {});
    dateButton.setOnClickListener(
        v ->
            new DatePickerDialog(
                    this,
                    (p, y, m, d) -> {
                      date = LocalDate.of(y, m + 1, d);
                      dateButton.setText("Date: " + date);
                    },
                    date.getYear(),
                    date.getMonthValue() - 1,
                    date.getDayOfMonth())
                .show());
    LinearLayout transfer = new LinearLayout(this);
    transfer.setOrientation(LinearLayout.VERTICAL);
    body.addView(transfer);
    destination = spinner(transfer, "To account", labels);
    destination.setTag(active);
    selectId(destination, saved.getString("destination_id", null));
    received = field(transfer, "Amount received (destination currency)", true);
    received.setText(saved.getString("received", ""));
    type.setOnItemSelectedListener(
        new android.widget.AdapterView.OnItemSelectedListener() {
          public void onNothingSelected(android.widget.AdapterView<?> p) {}

          public void onItemSelected(android.widget.AdapterView<?> p, View v, int n, long id) {
            transfer.setVisibility(n == 3 ? View.VISIBLE : View.GONE);
          }
        });
    button(
        body,
        "Save on this phone",
        () -> {
          try {
            long minor = Money.parse(amount.getText().toString());
            if (minor <= 0) throw new Exception("Enter an amount above zero");
            String notes = note.getText().toString().trim();
            if (notes.length() > 2000) throw new Exception("Note must be 2000 characters or fewer");
            JSONObject selected = active.get(account.getSelectedItemPosition());
            String kind =
                new String[] {"expense", "income", "refund", "transfer"}
                    [type.getSelectedItemPosition()];
            String occurred =
                date.atTime(12, 0)
                    .atZone(ZoneId.of("Asia/Phnom_Penh"))
                    .toOffsetDateTime()
                    .toString();
            JSONObject row =
                new JSONObject()
                    .put("id", UUID.randomUUID().toString())
                    .put("user_id", owner())
                    .put("account_id", selected.getString("id"))
                    .put("type", kind)
                    .put(
                        "amount",
                        kind.equals("expense") || kind.equals("transfer") ? -minor : minor)
                    .put("currency", selected.getString("currency"))
                    .put("occurred_at", occurred)
                    .put("notes", notes.isEmpty() ? JSONObject.NULL : notes)
                    .put("created_via", "android");
            JSONArray rows = new JSONArray();
            if (kind.equals("transfer")) {
              JSONObject to = active.get(destination.getSelectedItemPosition());
              if (to.getString("id").equals(selected.getString("id")))
                throw new Exception("Choose a different destination account");
              long incoming = Money.parse(received.getText().toString());
              if (incoming <= 0) throw new Exception("Enter the amount received");
              if (to.getString("currency").equals(selected.getString("currency"))
                  && incoming != minor)
                throw new Exception("Same-currency transfer amounts must match");
              String group = UUID.randomUUID().toString();
              row.put("transfer_group_id", group);
              JSONObject other =
                  new JSONObject(row.toString())
                      .put("id", UUID.randomUUID().toString())
                      .put("account_id", to.getString("id"))
                      .put("amount", incoming)
                      .put("currency", to.getString("currency"));
              rows.put(row).put(other);
            } else {
              row.put(
                  "category_id",
                  category.getSelectedItemPosition() == 0
                      ? JSONObject.NULL
                      : categories
                          .getJSONObject(category.getSelectedItemPosition() - 1)
                          .getString("id"));
              rows.put(row);
            }
            app.store.enqueue("transactions", rows);
            draft().edit().clear().commit();
            amount = null;
            ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE))
                .hideSoftInputFromWindow(root.getWindowToken(), 0);
            tab = 1;
            app.status = "Saved on this phone";
            load();
            app.schedule();
            app.sync(() -> runOnUiThread(this::load));
          } catch (Exception e) {
            error(e.getMessage());
          }
        });
    text(
        body,
        "Entries stay on this phone until the server confirms them. Pending entries are included in"
            + " the balances shown here.",
        13,
        R.color.muted,
        false);
  }

  void queue(String table, JSONArray rows) throws Exception {
    app.store.enqueue(table, rows);
    app.status = "Saved on this phone";
    load();
    app.schedule();
    app.sync(() -> runOnUiThread(this::load));
  }

  void more() throws Exception {
    button(
        body,
        "Sync now",
        () -> {
          app.status = "Syncing";
          updateStatus();
          app.sync(() -> runOnUiThread(this::load));
        });
    text(body, "Waiting to sync", 20, R.color.ink, true);
    for (JSONObject queued : app.store.pending()) {
      LinearLayout box = card();
      text(box, queued.getJSONObject("operation").getString("table"), 16, R.color.ink, true);
      text(
          box,
          queued.optString("error").isEmpty()
              ? "Waiting for a connection"
              : queued.getString("error"),
          14,
          R.color.muted,
          false);
    }
    text(body, "Budgets", 20, R.color.ink, true);
    for (int i = 0; i < budgets.length(); i++) {
      JSONObject b = budgets.getJSONObject(i);
      LinearLayout box = card();
      text(box, b.optString("name", "Budget"), 17, R.color.ink, true);
      text(
          box,
          Money.format(b.getLong("amount"), b.getString("currency"))
              + " / "
              + b.getString("period"),
          17,
          R.color.ink,
          false);
    }
    button(
        body,
        "Sign out",
        () -> {
          if (app.store.pendingCount() > 0) {
            error("Sync your pending entries before signing out. Nothing has been removed.");
            return;
          }
          new AlertDialog.Builder(this)
              .setTitle("Sign out?")
              .setMessage(
                  "Cached ledger data will remain private in this app until it is uninstalled. You"
                      + " can sign in again to access it.")
              .setNegativeButton("Cancel", null)
              .setPositiveButton(
                  "Sign out",
                  (d, w) -> {
                    AlertDialog progress =
                        new AlertDialog.Builder(this)
                            .setMessage("Signing out...")
                            .setCancelable(false)
                            .show();
                    app.network.execute(
                        () -> {
                          try {
                            if (app.store.pendingCount() > 0)
                              throw new Exception("Sync your pending entries before signing out.");
                            app.cloud.vault.clear();
                            app.cloud.session = null;
                            getSystemService(android.app.job.JobScheduler.class).cancel(1);
                            app.worker.execute(
                                () -> {
                                  app.store.close();
                                  app.store = null;
                                  runOnUiThread(
                                      () -> {
                                        accounts = new JSONArray();
                                        categories = new JSONArray();
                                        transactions = new JSONArray();
                                        budgets = new JSONArray();
                                        ledger = new Ledger();
                                        loaded = false;
                                        tab = 0;
                                        progress.dismiss();
                                        draw();
                                      });
                                });
                          } catch (Exception e) {
                            runOnUiThread(
                                () -> {
                                  progress.dismiss();
                                  error(e.getMessage());
                                });
                          }
                        });
                  })
              .show();
        });
  }

  void error(String message) {
    new AlertDialog.Builder(this)
        .setTitle("Luy Manager")
        .setMessage(message == null ? "Please try again" : message)
        .setPositiveButton("OK", null)
        .show();
  }
}
