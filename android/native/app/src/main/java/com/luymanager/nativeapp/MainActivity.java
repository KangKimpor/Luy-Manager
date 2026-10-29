package com.luymanager.nativeapp;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * One activity drawing every screen with plain Android views. Each screen follows its
 * web counterpart in src/app and src/components; Ui holds the shared pieces.
 */
public final class MainActivity extends Activity {
  static final ZoneId CAMBODIA = ZoneId.of("Asia/Phnom_Penh");
  static final String[] TITLES = {
    "Home", "Activity", "Add transaction", "Accounts", "More", "Budgets"
  };
  static final String[] MODES = {"expense", "income", "transfer"};
  static final String[] ACCOUNT_TYPES = {
    "bank", "ewallet", "cash", "savings", "investment", "credit_card"
  };
  static final String[] ACCOUNT_LABELS = {
    "Bank", "E-wallet", "Cash", "Savings", "Investment", "Credit card"
  };
  static final String[] ACCOUNT_ICONS = {
    "notebook", "mobile", "wallet", "wallet-alt", "line-up", "credit-card"
  };
  static final String WEB = "https://luy-manager.vercel.app";

  LuyApplication app;
  Ui ui;
  LinearLayout root, body, header, banner;
  TextView status;
  Ledger ledger = new Ledger();
  JSONArray accounts = new JSONArray(),
      categories = new JSONArray(),
      transactions = new JSONArray(),
      budgets = new JSONArray();
  int tab = 0, mode = 0;
  YearMonth month = YearMonth.now(CAMBODIA);
  boolean loaded = false;
  String shown = "USD", accountFilter = null, search = "";
  EditText amount, note, received, keypadTarget;
  Spinner account, category, destination;
  LocalDate date = LocalDate.now(CAMBODIA);

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
    return ui.dp(value);
  }

  int color(int id) {
    return getColor(id);
  }

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    app = (LuyApplication) getApplication();
    ui = new Ui(this);
    shown = getSharedPreferences("display", 0).getString("currency", "USD");
    if (android.os.Build.VERSION.SDK_INT >= 33)
      getOnBackInvokedDispatcher()
          .registerOnBackInvokedCallback(
              android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
    if (state != null) {
      tab = state.getInt("tab", 0);
      mode = state.getInt("mode", 0);
    }
    handle(getIntent());
    load();
  }

  void goBack() {
    if (tab == 0 || app.store == null) {
      finish();
      return;
    }
    saveDraft();
    tab = tab == 5 ? 4 : 0;
    accountFilter = null;
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
    state.putInt("mode", mode);
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

  JSONObject selectedRow(Spinner s) {
    try {
      return ((ArrayList<JSONObject>) s.getTag()).get(s.getSelectedItemPosition());
    } catch (Exception e) {
      return null;
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
    SharedPreferences.Editor e =
        draft()
            .edit()
            .putString("amount", amount.getText().toString())
            .putString("note", note.getText().toString())
            .putString("account_id", selectedId(account))
            .putString("mode", MODES[mode])
            .putString("date", date.toString());
    if (category != null) e.putString("category_id", selectedId(category));
    if (destination != null) e.putString("destination_id", selectedId(destination));
    if (received != null) e.putString("received", received.getText().toString());
    e.apply();
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

  /** Quiet when everything is synced; a brand-soft notice, like the demo banner, otherwise. */
  void updateStatus() {
    if (status == null) return;
    int pending = app.store == null ? 0 : app.store.pendingCount();
    String state = app.status;
    boolean quiet =
        state.equals("Ready")
            || state.equals("Up to date")
            || state.equals("Signed in")
            || state.equals("Syncing")
            || state.equals("Saved on this phone");
    status.setText(
        pending > 0
            ? state + " · " + pending + (pending == 1 ? " entry" : " entries") + " waiting to sync"
            : state);
    banner.setVisibility(pending > 0 || !quiet ? View.VISIBLE : View.GONE);
  }

  void draw() {
    amount = null;
    note = null;
    received = null;
    account = null;
    category = null;
    destination = null;
    keypadTarget = null;
    root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(color(R.color.surface));
    setContentView(root);
    if (app.store == null) {
      signIn();
      return;
    }
    LinearLayout chrome = ui.column();
    chrome.setBackgroundColor(color(R.color.surface));
    root.addView(chrome);
    chrome.addView(appBar(), new LinearLayout.LayoutParams(-1, dp(80)));
    banner = ui.row();
    banner.setPadding(dp(16), dp(12), dp(16), dp(12));
    banner.setBackground(
        ui.round(color(R.color.brand_soft), 16, Ui.alpha(color(R.color.brand), 0.1f)));
    View dot = new View(this);
    dot.setBackground(ui.round(color(R.color.brand), 999));
    banner.addView(dot, new LinearLayout.LayoutParams(dp(6), dp(6)));
    status = ui.text("", 12, color(R.color.brand), 500);
    banner.addView(status, ui.start(ui.weight(1), 8));
    LinearLayout.LayoutParams bannerSpace = ui.fill();
    bannerSpace.setMargins(dp(20), 0, dp(20), dp(8));
    chrome.addView(banner, bannerSpace);
    updateStatus();

    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    scroll.setClipToPadding(false);
    root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
    body = ui.column();
    body.setPadding(dp(20), dp(4), dp(20), dp(28));
    scroll.addView(body);
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
        case 5:
          budgetList();
          break;
        default:
          more();
      }
    } catch (Exception e) {
      add(
          ui.text(
              "Could not display this screen. Your local entries have been preserved.",
              14,
              color(R.color.outflow),
              400));
    }
    LinearLayout nav = bottomNav();
    root.addView(nav, ui.fill());
    root.setOnApplyWindowInsetsListener(
        (v, insets) -> {
          int top, bottom, left, right, ime = 0;
          if (android.os.Build.VERSION.SDK_INT >= 30) {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
            ime = insets.getInsets(WindowInsets.Type.ime()).bottom;
            top = bars.top;
            bottom = bars.bottom;
            left = bars.left;
            right = bars.right;
          } else {
            top = insets.getSystemWindowInsetTop();
            bottom = insets.getSystemWindowInsetBottom();
            left = insets.getSystemWindowInsetLeft();
            right = insets.getSystemWindowInsetRight();
          }
          boolean typing = ime > bottom;
          root.setPadding(left, 0, right, typing ? ime : 0);
          chrome.setPadding(0, top, 0, 0);
          nav.setVisibility(typing ? View.GONE : View.VISIBLE);
          nav.setPadding(dp(8), 0, dp(8), bottom);
          return insets;
        });
    root.requestApplyInsets();
  }

  /** SiteHeader: app mark, "LUY MANAGER" and the screen name; a back arrow below the top level. */
  LinearLayout appBar() {
    header = ui.row();
    header.setPadding(dp(20), 0, dp(20), 0);
    boolean top = tab != 2 && tab != 5;
    if (top) {
      ImageView logo = new ImageView(this);
      logo.setImageResource(R.drawable.ic_logo);
      logo.setContentDescription("Luy Manager");
      header.addView(logo, new LinearLayout.LayoutParams(dp(40), dp(40)));
    } else {
      LinearLayout back = ui.tile("arrow-left", 44, 20, 0, color(R.color.muted), 0);
      back.setBackground(null);
      back.setContentDescription("Go back");
      LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(44), dp(44));
      p.setMarginStart(-dp(8));
      header.addView(ui.press(back, 0.94f, this::goBack), p);
    }
    LinearLayout titles = ui.column();
    titles.addView(ui.caps("Luy Manager", 10, color(R.color.faint), 0.15f));
    TextView title = ui.truncate(ui.text(TITLES[tab], 20, color(R.color.ink), 600));
    title.setLetterSpacing(-0.015f);
    titles.addView(title, ui.top(ui.wrap(), 3));
    header.addView(titles, ui.start(ui.weight(1), top ? 12 : 4));
    if (top) {
      LinearLayout settings = ui.tile("setting-line", 44, 19, 0, color(R.color.muted), 0);
      settings.setBackground(
          ui.round(color(R.color.surface_raised), 16, color(R.color.surface_variant)));
      settings.setContentDescription("Settings");
      header.addView(ui.press(settings, 0.97f, () -> go(4)));
    }
    return header;
  }

  /** BottomNav: four destinations around the raised Add button. */
  LinearLayout bottomNav() {
    LinearLayout nav = ui.row();
    GradientDrawable bg = new GradientDrawable();
    bg.setColor(color(R.color.surface_raised));
    float r = dp(24);
    bg.setCornerRadii(new float[] {r, r, r, r, 0, 0, 0, 0});
    bg.setStroke(dp(1), color(R.color.surface_variant));
    nav.setBackground(bg);
    nav.setElevation(dp(10));
    nav.setOutlineSpotShadowColor(Ui.alpha(color(R.color.ink), 0.35f));
    nav.setOutlineAmbientShadowColor(Ui.alpha(color(R.color.ink), 0.15f));
    String[][] items = {
      {"Home", "home", "0"}, {"Activity", "expense-list", "1"}, null,
      {"Accounts", "wallet", "3"}, {"More", "meatballs-menu", "4"}
    };
    for (String[] item : items) {
      if (item == null) {
        LinearLayout slot = ui.row();
        slot.setGravity(Gravity.CENTER);
        LinearLayout fab = ui.tile("add", 52, 25, color(R.color.brand), color(R.color.on_hero), 0);
        fab.setBackground(ui.round(color(R.color.brand), 17.6f));
        fab.setElevation(dp(6));
        fab.setOutlineSpotShadowColor(color(R.color.brand));
        fab.setOutlineAmbientShadowColor(color(R.color.brand));
        fab.setContentDescription("Add transaction");
        slot.addView(ui.press(fab, 0.9f, () -> go(2)));
        nav.addView(slot, new LinearLayout.LayoutParams(0, dp(72), 1));
        continue;
      }
      int target = Integer.parseInt(item[2]);
      boolean active = tab == target || (target == 4 && tab == 5);
      int ink = color(active ? R.color.brand : R.color.faint);
      LinearLayout cell = ui.column();
      cell.setGravity(Gravity.CENTER);
      cell.setContentDescription(item[0]);
      LinearLayout pill = ui.tile(item[1], 32, 21, 0, ink, 0);
      pill.setBackground(active ? ui.round(color(R.color.brand_soft), 12) : null);
      cell.addView(pill, new LinearLayout.LayoutParams(dp(48), dp(32)));
      cell.addView(ui.text(item[0], 10, ink, 600), ui.top(ui.wrap(), 4));
      nav.addView(ui.press(cell, 0.95f, () -> go(target)), new LinearLayout.LayoutParams(0, dp(72), 1));
    }
    return nav;
  }

  void go(int next) {
    saveDraft();
    if (next != 1) accountFilter = null;
    tab = next;
    draw();
  }

  void add(View view) {
    LinearLayout.LayoutParams p = ui.fill();
    if (body.getChildCount() > 0) p.topMargin = dp(20);
    body.addView(view, p);
  }

  /** The login page: app mark, headline, and one way in. */
  void signIn() {
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    root.addView(scroll, new LinearLayout.LayoutParams(-1, -1));
    LinearLayout page = ui.column();
    page.setGravity(Gravity.CENTER_HORIZONTAL);
    page.setPadding(dp(20), dp(32), dp(20), dp(32));
    scroll.addView(page);
    root.setOnApplyWindowInsetsListener(
        (v, insets) -> {
          root.setPadding(0, insets.getSystemWindowInsetTop(), 0, insets.getSystemWindowInsetBottom());
          return insets;
        });
    root.requestApplyInsets();
    ImageView logo = new ImageView(this);
    logo.setImageResource(R.drawable.ic_logo);
    page.addView(logo, ui.top(new LinearLayout.LayoutParams(dp(64), dp(64)), 32));
    page.addView(ui.text("Luy Manager", 14, color(R.color.brand), 600), ui.top(ui.wrap(), 20));
    TextView headline = ui.text("Money, made clearer.", 36, color(R.color.ink), 600);
    headline.setGravity(Gravity.CENTER);
    headline.setLetterSpacing(-0.025f);
    page.addView(headline, ui.top(ui.wrap(), 16));
    TextView lead =
        ui.text(
            "Sign in once to download your ledger. After that, add entries offline and they sync"
                + " when you reconnect.",
            14,
            color(R.color.muted),
            400);
    lead.setGravity(Gravity.CENTER);
    page.addView(lead, ui.top(ui.wrap(), 8));
    LinearLayout card = ui.card();
    card.setPadding(dp(20), dp(20), dp(20), dp(20));
    card.addView(ui.button("Continue with Google", null, "outline", this::login), ui.fill());
    if (!app.status.equals("Ready")) {
      TextView problem = ui.text(app.status, 14, color(R.color.outflow), 400);
      card.addView(problem, ui.top(ui.fill(), 12));
    }
    TextView small =
        ui.text(
            "Your ledger stays private on this phone. Keep the web app for reports and settings.",
            12,
            color(R.color.faint),
            400);
    card.addView(small, ui.top(ui.fill(), 16));
    page.addView(card, ui.top(ui.fill(), 32));
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

  JSONObject categoryOf(JSONObject row) {
    try {
      return row.isNull("category_id") ? null : find(categories, row.getString("category_id"));
    } catch (Exception e) {
      return null;
    }
  }

  String categoryLabel(JSONObject category) {
    return category == null ? "Uncategorised" : category.optString("name", "Uncategorised");
  }

  boolean isTransfer(JSONObject row) {
    return row.optString("type").equals("transfer");
  }

  String title(JSONObject row) {
    if (!row.isNull("notes") && !row.optString("notes").isEmpty()) return row.optString("notes");
    JSONObject category = categoryOf(row);
    if (category != null) return categoryLabel(category);
    return isTransfer(row) ? "Transfer" : "Transaction";
  }

  /** "ABA USD to Wing" for either leg of a transfer, as the web transaction row does. */
  String route(JSONObject row) {
    String own = accountName(row);
    if (!isTransfer(row) || row.isNull("transfer_group_id")) return own;
    String group = row.optString("transfer_group_id");
    for (int i = 0; i < transactions.length(); i++) {
      JSONObject other = transactions.optJSONObject(i);
      if (other != null
          && group.equals(other.optString("transfer_group_id"))
          && !other.optString("id").equals(row.optString("id"))) {
        String them = accountName(other);
        return row.optLong("amount") < 0 ? own + " to " + them : them + " to " + own;
      }
    }
    return own;
  }

  static LocalDate day(JSONObject row) throws Exception {
    return OffsetDateTime.parse(row.getString("occurred_at"))
        .atZoneSameInstant(CAMBODIA)
        .toLocalDate();
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

  String other(String currency) {
    return currency.equals("USD") ? "KHR" : "USD";
  }

  boolean holds(String currency) {
    for (int i = 0; i < accounts.length(); i++)
      if (currency.equals(accounts.optJSONObject(i).optString("currency"))) return true;
    return false;
  }

  /** Sum of included balances in `currency` whose type is in `types`. */
  long totalOf(String currency, String... types) throws Exception {
    long sum = 0;
    for (int i = 0; i < accounts.length(); i++) {
      JSONObject a = accounts.getJSONObject(i);
      if (!a.optBoolean("include_in_net_worth", true)
          || !currency.equals(a.getString("currency"))) continue;
      for (String type : types)
        if (type.equals(a.optString("type", "bank"))) sum = Money.add(sum, balance(a));
    }
    return sum;
  }

  /** CurrencyToggle: which currency the totals on this screen are shown in. */
  LinearLayout currencyToggle() {
    LinearLayout toggle = ui.row();
    toggle.setPadding(dp(4), dp(4), dp(4), dp(4));
    toggle.setBackground(ui.round(color(R.color.surface), 999));
    for (String code : new String[] {"USD", "KHR"}) {
      boolean on = code.equals(shown);
      TextView t = ui.text(code, 12, color(on ? R.color.ink : R.color.muted), 700);
      t.setGravity(Gravity.CENTER);
      t.setMinHeight(dp(36));
      t.setPadding(dp(12), 0, dp(12), 0);
      t.setContentDescription("Show totals in " + code);
      if (on) {
        t.setBackground(ui.round(color(R.color.surface_raised), 999));
        t.setElevation(dp(1));
      }
      toggle.addView(
          ui.press(
              t,
              0.95f,
              () -> {
                shown = code;
                getSharedPreferences("display", 0).edit().putString("currency", code).apply();
                draw();
              }));
    }
    return toggle;
  }

  /** The dark net worth card shared by Home and Accounts. */
  LinearLayout heroCard(boolean home) throws Exception {
    int onHero = color(R.color.on_hero);
    LinearLayout hero = ui.column();
    hero.setBackground(new Ui.Hero(ui));
    hero.setClipToOutline(true);
    hero.setPadding(dp(24), dp(24), dp(24), dp(24));
    LinearLayout top = ui.row();
    if (home) top.addView(ui.icon("wallet", 17, Ui.alpha(onHero, 0.75f)));
    top.addView(
        ui.text("Total net worth", 14, Ui.alpha(onHero, home ? 0.75f : 0.7f), 500),
        ui.start(ui.weight(1), home ? 8 : 0));
    if (home) {
      LinearLayout open = ui.tile("arrow-top", 44, 20, 0, onHero, 45);
      open.setBackground(
          ui.round(Ui.alpha(onHero, 0.05f), 999, Ui.alpha(onHero, 0.15f)));
      open.setContentDescription("View your accounts");
      top.addView(ui.press(open, 0.95f, () -> go(3)));
    }
    hero.addView(top, ui.fill());
    TextView total = ui.money(Money.display(ledger.total(shown), shown), 32, onHero, 600);
    total.setLetterSpacing(-0.025f);
    hero.addView(total, ui.top(ui.fill(), home ? 16 : 12));
    String second = other(shown);
    if (holds(second))
      hero.addView(
          ui.text(
              "and " + Money.display(ledger.total(second), second) + " in " + second + " accounts",
              14,
              Ui.alpha(onHero, 0.65f),
              400),
          ui.top(ui.fill(), 8));
    View rule = new View(this);
    rule.setBackgroundColor(Ui.alpha(onHero, 0.15f));
    hero.addView(rule, ui.top(new LinearLayout.LayoutParams(-1, dp(1)), home ? 28 : 24));
    LinearLayout split = ui.row();
    split.setGravity(Gravity.TOP);
    long liabilities = -totalOf(shown, "credit_card");
    split.addView(figure("Cash available", totalOf(shown, "bank", "ewallet", "cash")), ui.weight(1));
    if (!home || liabilities != 0) split.addView(figure("Liabilities", liabilities), ui.weight(1));
    hero.addView(split, ui.top(ui.fill(), 16));
    hero.addView(
        ui.text(
            "Only "
                + shown
                + " accounts. Currencies are not converted on this phone.",
            11,
            Ui.alpha(onHero, 0.55f),
            400),
        ui.top(ui.fill(), 16));
    return hero;
  }

  LinearLayout figure(String label, long minor) {
    int onHero = color(R.color.on_hero);
    LinearLayout box = ui.column();
    box.addView(ui.text(label, 12, Ui.alpha(onHero, 0.6f), 400));
    box.addView(ui.money(Money.display(minor, shown), 14, onHero, 600), ui.top(ui.wrap(), 4));
    return box;
  }

  /** MonthStepper: previous, the month, next, in one card. */
  LinearLayout monthStepper() {
    LinearLayout stepper = ui.row();
    stepper.setPadding(dp(4), dp(4), dp(4), dp(4));
    stepper.setBackground(
        ui.round(color(R.color.surface_raised), 24, color(R.color.surface_variant)));
    LinearLayout previous = ui.tile("expand-left", 44, 20, 0, color(R.color.muted), 0);
    previous.setBackground(null);
    previous.setContentDescription("Previous month");
    stepper.addView(
        ui.press(
            previous,
            0.94f,
            () -> {
              month = month.minusMonths(1);
              draw();
            }));
    TextView label =
        ui.text(
            month.format(DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH)),
            16,
            color(R.color.ink),
            500);
    label.setGravity(Gravity.CENTER);
    stepper.addView(label, ui.weight(1));
    LinearLayout next = ui.tile("expand-right", 44, 20, 0, color(R.color.muted), 0);
    next.setBackground(null);
    next.setContentDescription("Next month");
    stepper.addView(
        ui.press(
            next,
            0.94f,
            () -> {
              month = month.plusMonths(1);
              draw();
            }));
    return stepper;
  }

  /** The strip under the stepper. The web shows the exchange rate here; the phone has none. */
  LinearLayout totalsStrip() {
    LinearLayout strip = ui.row();
    strip.setPadding(dp(16), dp(8), dp(8), dp(8));
    strip.setBackground(
        ui.round(color(R.color.surface_raised), 24, color(R.color.surface_variant)));
    LinearLayout words = ui.column();
    words.addView(ui.text("Totals in " + shown, 14, color(R.color.ink), 600));
    words.addView(
        ui.text("Each currency counts separately", 12, color(R.color.faint), 400),
        ui.top(ui.wrap(), 3));
    strip.addView(words, ui.weight(1));
    strip.addView(currencyToggle());
    return strip;
  }

  void home() throws Exception {
    add(heroCard(true));

    LinearLayout flowHead = ui.row();
    flowHead.setPadding(dp(4), 0, dp(4), 0);
    flowHead.addView(ui.text("Your cash flow", 14, color(R.color.ink), 600), ui.weight(1));
    flowHead.addView(
        ui.text(
            month.format(DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH)),
            12,
            color(R.color.faint),
            400));
    add(flowHead);
    long[] flow = ledger.flow(month, shown);
    LinearLayout pair = ui.row();
    pair.setGravity(Gravity.TOP);
    pair.addView(
        flowCard("Income", flow[0], "arrow-top", 45, R.color.inflow, R.color.inflow_soft, 1),
        ui.weight(1));
    pair.addView(
        flowCard("Spending", -flow[1], "arrow-down", -45, R.color.outflow, R.color.outflow_soft, 0),
        ui.start(ui.weight(1), 12));
    LinearLayout.LayoutParams pairSpace = ui.fill();
    pairSpace.topMargin = dp(12);
    body.addView(pair, pairSpace);
    TextView foot = ui.text("In " + shown + ". Transfers excluded.", 11, color(R.color.faint), 400);
    foot.setPadding(dp(4), 0, dp(4), 0);
    LinearLayout.LayoutParams footSpace = ui.fill();
    footSpace.topMargin = dp(12);
    body.addView(foot, footSpace);

    LinearLayout actions = ui.row();
    String[][] quick = {
      {"Add expense", "add", "0"}, {"Transfer", "horizontal-switch", "2"}, {"Accounts", "wallet", "-1"}
    };
    for (String[] q : quick) {
      LinearLayout tile = ui.card();
      tile.setGravity(Gravity.CENTER);
      tile.setMinimumHeight(dp(80));
      tile.setPadding(dp(8), dp(16), dp(8), dp(16));
      tile.setContentDescription(q[0]);
      tile.addView(ui.icon(q[1], 19, color(R.color.brand)));
      TextView label = ui.text(q[0], 12, color(R.color.ink), 600);
      label.setGravity(Gravity.CENTER);
      tile.addView(label, ui.top(ui.wrap(), 8));
      int target = Integer.parseInt(q[2]);
      ui.press(tile, 0.985f, () -> openAdd(target));
      actions.addView(tile, actions.getChildCount() == 0 ? ui.weight(1) : ui.start(ui.weight(1), 12));
    }
    add(actions);
    add(monthStepper());
    LinearLayout.LayoutParams stripSpace = ui.fill();
    stripSpace.topMargin = dp(12);
    body.addView(totalsStrip(), stripSpace);

    LinearLayout recent = ui.card();
    LinearLayout head = ui.row();
    head.setPadding(dp(20), dp(20), dp(20), dp(12));
    LinearLayout words = ui.column();
    words.addView(ui.text("Recent activity", 16, color(R.color.ink), 600));
    words.addView(
        ui.text("Your latest money moves", 12, color(R.color.faint), 400), ui.top(ui.wrap(), 4));
    head.addView(words, ui.weight(1));
    head.addView(ui.link("View all", color(R.color.brand), 12, () -> go(1)));
    recent.addView(head, ui.fill());
    LinearLayout rows = ui.column();
    rows.setPadding(dp(20), dp(8), dp(20), dp(20));
    int count = 0;
    for (int i = 0; i < transactions.length() && count < 5; i++) {
      JSONObject t = transactions.getJSONObject(i);
      if (!inMonth(t)) continue;
      if (count > 0) rows.addView(ui.divider());
      rows.addView(transactionRow(t), ui.fill());
      count++;
    }
    if (count == 0) rows.addView(emptyState("paper", "A fresh start", "Your transactions will appear here."));
    recent.addView(rows, ui.fill());
    add(recent);
    add(breakdown());
  }

  void openAdd(int nextMode) {
    if (nextMode < 0) {
      go(3);
      return;
    }
    saveDraft();
    mode = nextMode;
    tab = 2;
    draw();
  }

  LinearLayout flowCard(
      String label, long minor, String icon, float rotation, int ink, int soft, int addMode) {
    LinearLayout card = ui.card();
    card.setPadding(dp(16), dp(16), dp(16), dp(8));
    card.addView(ui.tile(icon, 40, 20, color(soft), color(ink), rotation));
    card.addView(ui.text(label, 12, color(R.color.muted), 500), ui.top(ui.wrap(), 20));
    TextView value = ui.money(Money.display(minor, shown), 18, color(R.color.ink), 600);
    value.setAutoSizeTextTypeUniformWithConfiguration(12, 18, 1, TypedValue.COMPLEX_UNIT_SP);
    card.addView(value, ui.top(new LinearLayout.LayoutParams(-1, dp(24)), 6));
    card.addView(
        ui.link(addMode == 1 ? "Add income" : "Add expense", color(ink), 12, () -> openAdd(addMode)),
        ui.top(ui.wrap(), 4));
    return card;
  }

  LinearLayout emptyState(String icon, String heading, String detail) {
    LinearLayout empty = ui.column();
    empty.setGravity(Gravity.CENTER_HORIZONTAL);
    empty.setPadding(0, dp(32), 0, dp(32));
    empty.addView(ui.tile(icon, 48, 22, color(R.color.brand_soft), color(R.color.brand), 0));
    empty.addView(ui.text(heading, 16, color(R.color.ink), 600), ui.top(ui.wrap(), 16));
    TextView text = ui.text(detail, 14, color(R.color.muted), 400);
    text.setGravity(Gravity.CENTER);
    empty.addView(text, ui.top(ui.wrap(), 4));
    return empty;
  }

  /** TransactionRow: direction tile, title, date and account, amount with its currency. */
  LinearLayout transactionRow(JSONObject row) throws Exception {
    boolean transfer = isTransfer(row);
    long minor = row.getLong("amount");
    String currency = row.getString("currency");
    LinearLayout line = ui.row();
    line.setPadding(0, dp(16), 0, dp(16));
    line.addView(
        transfer
            ? ui.tile("horizontal-switch", 36, 17, color(R.color.surface_container), color(R.color.muted), 0)
            : minor < 0
                ? ui.tile("arrow-top", 36, 17, color(R.color.outflow_soft), color(R.color.outflow), 45)
                : ui.tile("arrow-down", 36, 17, color(R.color.inflow_soft), color(R.color.inflow), 45));
    LinearLayout middle = ui.column();
    middle.addView(ui.truncate(ui.text(title(row), 14, color(R.color.ink), 600)));
    String when = day(row).format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH));
    TextView sub =
        ui.truncate(
            ui.text(
                when + " · " + route(row) + (row.optBoolean("_pending") ? " · Waiting to sync" : ""),
                11,
                color(R.color.faint),
                400));
    middle.addView(sub, ui.top(ui.wrap(), 4));
    line.addView(middle, ui.start(ui.weight(1), 12));
    LinearLayout right = ui.column();
    right.setGravity(Gravity.END);
    right.addView(amountText(minor, currency, transfer, 14), ui.wrap());
    right.addView(ui.badge(currency), ui.top(ui.wrap(), 4));
    line.addView(right, ui.start(ui.wrap(), 12));
    return line;
  }

  /** MoneyAmount with colorBySign and showPlus, which a transfer leg does not get. */
  TextView amountText(long minor, String currency, boolean transfer, float sp) {
    String text = Money.display(minor, currency);
    if (!transfer && minor > 0) text = "+" + text;
    int ink =
        transfer || minor == 0
            ? color(R.color.ink)
            : color(minor < 0 ? R.color.outflow : R.color.inflow);
    return ui.money(text, sp, ink, 600);
  }

  /** CategoryBreakdown: "Where it went", ranked bars for this month's spending. */
  LinearLayout breakdown() throws Exception {
    LinkedHashMap<String, Long> totals = new LinkedHashMap<>();
    long all = 0;
    for (int i = 0; i < transactions.length(); i++) {
      JSONObject t = transactions.getJSONObject(i);
      if (isTransfer(t) || !inMonth(t) || !shown.equals(t.getString("currency"))) continue;
      long minor = t.getLong("amount");
      if (minor >= 0) continue;
      String key = t.isNull("category_id") ? "" : t.getString("category_id");
      totals.put(key, Money.add(totals.getOrDefault(key, 0L), -minor));
      all = Money.add(all, -minor);
    }
    ArrayList<Map.Entry<String, Long>> ranked = new ArrayList<>(totals.entrySet());
    ranked.sort((a, b) -> Long.compare(b.getValue(), a.getValue()));
    LinearLayout card = ui.card();
    LinearLayout head = ui.column();
    head.setPadding(dp(20), dp(20), dp(20), dp(12));
    head.addView(ui.text("Where it went", 16, color(R.color.ink), 600));
    head.addView(
        ui.text("Spending by category", 12, color(R.color.faint), 400), ui.top(ui.wrap(), 4));
    card.addView(head, ui.fill());
    LinearLayout list = ui.column();
    list.setPadding(dp(20), dp(8), dp(20), dp(20));
    if (ranked.isEmpty()) {
      TextView none = ui.text("Nothing spent yet.", 14, color(R.color.faint), 400);
      none.setGravity(Gravity.CENTER);
      none.setPadding(0, dp(24), 0, dp(24));
      list.addView(none, ui.fill());
    }
    for (int i = 0; i < Math.min(4, ranked.size()); i++) {
      String id = ranked.get(i).getKey();
      long spent = ranked.get(i).getValue();
      JSONObject category = null;
      try {
        if (!id.isEmpty()) category = find(categories, id);
      } catch (Exception ignored) {
      }
      long percent = (spent * 100 + all / 2) / all;
      LinearLayout entry = ui.column();
      LinearLayout top = ui.row();
      top.addView(ui.icon(Ui.categoryIcon(category), 16, color(R.color.ink)));
      top.addView(
          ui.truncate(ui.text(categoryLabel(category), 14, color(R.color.ink), 500)),
          ui.start(ui.weight(1), 8));
      top.addView(ui.money(Money.display(spent, shown), 12, color(R.color.ink), 600));
      TextView share = ui.text(percent + "%", 11, color(R.color.faint), 400);
      share.setGravity(Gravity.END);
      top.addView(share, ui.start(new LinearLayout.LayoutParams(dp(32), -2), 8));
      entry.addView(top, ui.fill());
      LinearLayout bar = ui.row();
      bar.setBackground(ui.round(color(R.color.surface_variant), 999));
      bar.setClipToOutline(true);
      View fillBar = new View(this);
      fillBar.setBackground(
          ui.round(Ui.parseColor(category, color(R.color.chart_other)), 999));
      bar.addView(fillBar, new LinearLayout.LayoutParams(0, -1, Math.max(1, percent)));
      bar.addView(new View(this), new LinearLayout.LayoutParams(0, -1, 100 - Math.min(100, percent)));
      entry.addView(bar, ui.top(new LinearLayout.LayoutParams(-1, dp(6)), 8));
      list.addView(entry, i == 0 ? ui.fill() : ui.top(ui.fill(), 20));
    }
    card.addView(list, ui.fill());
    return card;
  }

  void activity() throws Exception {
    LinearLayout top = ui.row();
    TextView count = ui.text("", 12, color(R.color.faint), 400);
    top.addView(count, ui.weight(1));
    top.addView(currencyToggle());
    add(top);
    if (accountFilter != null) {
      JSONObject selected = find(accounts, accountFilter);
      LinearLayout chip = ui.card();
      chip.setOrientation(LinearLayout.HORIZONTAL);
      chip.setGravity(Gravity.CENTER_VERTICAL);
      chip.setPadding(dp(20), dp(12), dp(12), dp(12));
      LinearLayout words = ui.column();
      words.addView(ui.truncate(ui.text(selected.getString("name"), 14, color(R.color.ink), 600)));
      words.addView(
          ui.text(
              "Balance " + Money.display(balance(selected), selected.getString("currency")),
              12,
              color(R.color.faint),
              400),
          ui.top(ui.wrap(), 2));
      chip.addView(words, ui.weight(1));
      TextView clear = ui.text("Show all", 12, color(R.color.brand), 600);
      clear.setMinHeight(dp(44));
      clear.setGravity(Gravity.CENTER);
      clear.setPadding(dp(8), 0, dp(8), 0);
      clear.setContentDescription("Show all");
      chip.addView(
          ui.press(
              clear,
              0.97f,
              () -> {
                accountFilter = null;
                draw();
              }));
      add(chip);
    }
    add(monthStepper());
    LinearLayout box = ui.row();
    box.setPadding(dp(12), 0, dp(12), 0);
    box.setBackground(ui.inputBackground());
    box.addView(ui.icon("search", 16, color(R.color.faint)));
    EditText find = new EditText(this);
    find.setBackground(null);
    find.setHint("Search notes");
    find.setHintTextColor(color(R.color.faint));
    find.setTextColor(color(R.color.ink));
    find.setTextSize(14);
    find.setSingleLine(true);
    find.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
    find.setContentDescription("Search notes");
    find.setText(search);
    box.addView(find, ui.start(new LinearLayout.LayoutParams(0, dp(44), 1), 8));
    LinearLayout.LayoutParams boxSpace = ui.fill();
    boxSpace.topMargin = dp(12);
    body.addView(box, boxSpace);
    LinearLayout summary = ui.card();
    summary.setOrientation(LinearLayout.HORIZONTAL);
    summary.setPadding(dp(20), dp(16), dp(20), dp(16));
    add(summary);
    LinearLayout list = ui.column();
    add(list);
    Runnable refresh =
        () -> {
          summary.removeAllViews();
          try {
            long[] flow = monthFlow(search);
            summaryCell(summary, "Income", flow[0], R.color.inflow);
            summaryCell(summary, "Spending", flow[1], R.color.outflow);
            summaryCell(summary, "Net", flow[0] - flow[1], R.color.ink);
          } catch (Exception ignored) {
          }
        };
    find.addTextChangedListener(
        new TextWatcher() {
          public void beforeTextChanged(CharSequence s, int a, int b, int c) {}

          public void onTextChanged(CharSequence s, int a, int b, int c) {}

          public void afterTextChanged(Editable s) {
            search = s.toString();
            refresh.run();
            count.setText(showActivity(list, search, 0));
          }
        });
    refresh.run();
    count.setText(showActivity(list, search, 0));
  }

  boolean matches(JSONObject row, String term) {
    if (!inMonth(row)) return false;
    if (accountFilter != null && !accountFilter.equals(row.optString("account_id"))) return false;
    String needle = term.toLowerCase(Locale.ROOT).trim();
    return needle.isEmpty()
        || title(row).toLowerCase(Locale.ROOT).contains(needle)
        || row.optString("notes", "").toLowerCase(Locale.ROOT).contains(needle);
  }

  long[] monthFlow(String term) throws Exception {
    long[] flow = new long[2];
    for (int i = 0; i < transactions.length(); i++) {
      JSONObject row = transactions.getJSONObject(i);
      if (isTransfer(row) || !matches(row, term) || !shown.equals(row.getString("currency")))
        continue;
      long minor = row.getLong("amount");
      if (minor >= 0) flow[0] = Money.add(flow[0], minor);
      else flow[1] = Money.add(flow[1], -minor);
    }
    return flow;
  }

  void summaryCell(LinearLayout parent, String label, long minor, int ink) {
    LinearLayout cell = ui.column();
    cell.setGravity(Gravity.CENTER_HORIZONTAL);
    TextView name = ui.text(label, 10, color(R.color.faint), 500);
    name.setGravity(Gravity.CENTER);
    cell.addView(name, ui.fill());
    TextView value = ui.money(Money.display(minor, shown), 14, color(ink), 600);
    value.setAutoSizeTextTypeUniformWithConfiguration(10, 14, 1, TypedValue.COMPLEX_UNIT_SP);
    value.setGravity(Gravity.CENTER);
    cell.addView(value, ui.top(new LinearLayout.LayoutParams(-1, dp(20)), 4));
    parent.addView(cell, ui.weight(1));
  }

  /** TransactionHistory: day headings with their flow, then a card of that day's rows. */
  String showActivity(LinearLayout list, String term, int start) {
    list.removeAllViews();
    try {
      ArrayList<JSONObject> matched = new ArrayList<>();
      for (int i = 0; i < transactions.length(); i++) {
        JSONObject row = transactions.getJSONObject(i);
        if (matches(row, term)) matched.add(row);
      }
      if (matched.isEmpty()) {
        LinearLayout empty = ui.card();
        empty.addView(
            emptyState(
                "search",
                "Nothing here yet",
                term.isEmpty() ? "No entries in this month." : "No matching entries."),
            ui.fill());
        list.addView(empty, ui.fill());
        return "0 entries";
      }
      int end = Math.min(start + 50, matched.size());
      LocalDate current = null;
      LinearLayout rows = null;
      for (int i = start; i < end; i++) {
        JSONObject row = matched.get(i);
        LocalDate when = day(row);
        if (!when.equals(current)) {
          current = when;
          list.addView(dayHeading(when, matched), list.getChildCount() == 0 ? ui.fill() : ui.top(ui.fill(), 20));
          LinearLayout card = ui.card();
          card.setPadding(dp(12), dp(4), dp(12), dp(4));
          rows = ui.column();
          card.addView(rows, ui.fill());
          list.addView(card, ui.top(ui.fill(), 8));
        } else rows.addView(ui.divider());
        rows.addView(activityRow(row), ui.fill());
      }
      TextView range =
          ui.text(
              "Showing " + (start + 1) + " to " + end + " of " + matched.size(),
              12,
              color(R.color.faint),
              400);
      range.setGravity(Gravity.CENTER);
      list.addView(range, ui.top(ui.fill(), 16));
      if (start > 0)
        list.addView(
            ui.button(
                "Previous 50",
                "expand-left",
                "outline",
                () -> showActivity(list, term, Math.max(0, start - 50))),
            ui.top(ui.fill(), 12));
      if (matched.size() > end)
        list.addView(
            ui.button("Next 50", null, "outline", () -> showActivity(list, term, start + 50)),
            ui.top(ui.fill(), 12));
      return matched.size() + (matched.size() == 1 ? " entry" : " entries");
    } catch (Exception e) {
      error("Could not display activity");
      return "";
    }
  }

  LinearLayout dayHeading(LocalDate when, ArrayList<JSONObject> matched) throws Exception {
    LinearLayout head = ui.row();
    head.setPadding(dp(4), 0, dp(4), 0);
    TextView number = ui.money(String.valueOf(when.getDayOfMonth()), 24, color(R.color.ink), 600);
    head.addView(number);
    TextView weekday =
        ui.text(
            when.format(DateTimeFormatter.ofPattern("EEE", Locale.ENGLISH)),
            10,
            color(R.color.muted),
            600);
    weekday.setPadding(dp(8), dp(4), dp(8), dp(4));
    weekday.setBackground(ui.round(color(R.color.surface_container), 999));
    head.addView(weekday, ui.start(ui.wrap(), 8));
    head.addView(new View(this), ui.weight(1));
    long in = 0, out = 0;
    for (JSONObject row : matched) {
      if (isTransfer(row) || !day(row).equals(when) || !shown.equals(row.getString("currency")))
        continue;
      long minor = row.getLong("amount");
      if (minor > 0) in = Money.add(in, minor);
      else out = Money.add(out, minor);
    }
    if (in != 0) head.addView(ui.money(Money.display(in, shown), 12, color(R.color.inflow), 600));
    if (out != 0)
      head.addView(
          ui.money(Money.display(out, shown), 12, color(R.color.outflow), 600),
          ui.start(ui.wrap(), 12));
    return head;
  }

  /** The `activity` variant of TransactionRow: category column, title, amount. */
  LinearLayout activityRow(JSONObject row) throws Exception {
    boolean transfer = isTransfer(row);
    JSONObject category = categoryOf(row);
    LinearLayout line = ui.row();
    line.setMinimumHeight(dp(56));
    line.setPadding(0, dp(12), 0, dp(12));
    LinearLayout kind = ui.column();
    kind.setGravity(Gravity.CENTER_HORIZONTAL);
    kind.addView(ui.icon(transfer ? "horizontal-switch" : Ui.categoryIcon(category), 19, color(R.color.muted)));
    TextView label =
        ui.truncate(
            ui.text(transfer ? "Transfer" : categoryLabel(category), 10, color(R.color.muted), 400));
    label.setGravity(Gravity.CENTER);
    kind.addView(label, ui.top(new LinearLayout.LayoutParams(-1, -2), 4));
    line.addView(kind, new LinearLayout.LayoutParams(dp(52), -2));
    LinearLayout middle = ui.column();
    middle.addView(ui.truncate(ui.text(title(row), 12, color(R.color.ink), 600)));
    middle.addView(
        ui.truncate(
            ui.text(
                route(row) + (row.optBoolean("_pending") ? " · Waiting to sync" : ""),
                10,
                color(R.color.faint),
                400)),
        ui.top(ui.wrap(), 4));
    line.addView(middle, ui.start(ui.weight(1), 8));
    line.addView(
        amountText(row.getLong("amount"), row.getString("currency"), transfer, 12),
        ui.start(ui.wrap(), 8));
    return line;
  }

  void accounts() throws Exception {
    LinearLayout top = ui.row();
    top.addView(
        ui.text("Every account, one clear picture.", 14, color(R.color.muted), 400), ui.weight(1));
    top.addView(currencyToggle());
    add(top);
    add(heroCard(false));
    add(ui.button("Add an account", "add", accounts.length() == 0 ? "primary" : "secondary", this::newAccount));
    for (int g = 0; g < ACCOUNT_TYPES.length; g++) {
      ArrayList<JSONObject> members = new ArrayList<>();
      for (int i = 0; i < accounts.length(); i++) {
        JSONObject a = accounts.getJSONObject(i);
        if (ACCOUNT_TYPES[g].equals(a.optString("type", "bank"))) members.add(a);
      }
      if (members.isEmpty()) continue;
      boolean credit = ACCOUNT_TYPES[g].equals("credit_card");
      LinearLayout head = ui.row();
      head.setPadding(dp(4), 0, dp(4), 0);
      head.addView(ui.text(ACCOUNT_LABELS[g], 14, color(R.color.muted), 600), ui.weight(1));
      LinkedHashMap<String, Long> subtotal = new LinkedHashMap<>();
      for (JSONObject a : members)
        subtotal.put(
            a.getString("currency"),
            Money.add(subtotal.getOrDefault(a.getString("currency"), 0L), balance(a)));
      StringBuilder sums = new StringBuilder();
      for (Map.Entry<String, Long> e : subtotal.entrySet())
        sums.append(sums.length() == 0 ? "" : " + ").append(Money.display(e.getValue(), e.getKey()));
      head.addView(ui.money(sums.toString(), 14, color(R.color.ink), 600));
      add(head);
      LinearLayout card = ui.card();
      for (int i = 0; i < members.size(); i++) {
        if (i > 0) card.addView(ui.divider());
        card.addView(accountRow(members.get(i), g, credit), ui.fill());
      }
      LinearLayout.LayoutParams cardSpace = ui.fill();
      cardSpace.topMargin = dp(12);
      body.addView(card, cardSpace);
    }
  }

  LinearLayout accountRow(JSONObject a, int group, boolean credit) throws Exception {
    boolean active = a.optBoolean("is_active", true);
    LinearLayout line = ui.row();
    line.setPadding(dp(16), dp(20), dp(16), dp(20));
    line.addView(
        ui.tile(
            ACCOUNT_ICONS[group],
            40,
            20,
            color(credit ? R.color.outflow_soft : R.color.brand_soft),
            color(credit ? R.color.outflow : R.color.brand),
            0));
    LinearLayout middle = ui.column();
    TextView name =
        ui.truncate(ui.text(a.getString("name"), 14, color(active ? R.color.ink : R.color.faint), 600));
    if (!active)
      name.setPaintFlags(name.getPaintFlags() | android.graphics.Paint.STRIKE_THRU_TEXT_FLAG);
    middle.addView(name);
    String detail = a.isNull("institution") ? ACCOUNT_LABELS[group] : a.optString("institution", ACCOUNT_LABELS[group]);
    if (!active) detail += " · closed";
    else if (!a.optBoolean("include_in_net_worth", true)) detail += " · not counted";
    middle.addView(ui.truncate(ui.text(detail, 11, color(R.color.faint), 400)), ui.top(ui.wrap(), 4));
    line.addView(middle, ui.start(ui.weight(1), 12));
    LinearLayout right = ui.column();
    right.setGravity(Gravity.END);
    long minor = balance(a);
    int ink = credit && minor != 0 ? color(minor < 0 ? R.color.outflow : R.color.inflow) : color(R.color.ink);
    right.addView(ui.money(Money.display(minor, a.getString("currency")), 14, ink, 600), ui.wrap());
    right.addView(ui.badge(a.getString("currency")), ui.top(ui.wrap(), 4));
    line.addView(right, ui.start(ui.wrap(), 12));
    line.setContentDescription(a.getString("name"));
    String id = a.getString("id");
    return ui.press(
        line,
        0.99f,
        () -> {
          accountFilter = id;
          month = YearMonth.now(CAMBODIA);
          tab = 1;
          draw();
        });
  }

  /** A labelled field like the web's: muted label, then a bordered rounded input. */
  EditText input(LinearLayout parent, String label, String hint, boolean numeric) {
    if (label != null) parent.addView(ui.text(label, 14, color(R.color.muted), 500), ui.fill());
    EditText e = new EditText(this);
    e.setSingleLine(true);
    e.setTextSize(14);
    e.setTextColor(color(R.color.ink));
    e.setHint(hint);
    e.setHintTextColor(color(R.color.faint));
    e.setContentDescription(label == null ? hint : label);
    e.setBackground(ui.inputBackground());
    e.setPadding(dp(12), 0, dp(12), 0);
    e.setInputType(
        numeric
            ? InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL
            : InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
    parent.addView(e, ui.top(new LinearLayout.LayoutParams(-1, dp(44)), label == null ? 0 : 8));
    return e;
  }

  /**
   * The compact EntryChoicePicker: the chosen item in a bordered box with a "Change" link.
   * A Spinner underneath, so the choice list is the platform's own.
   */
  Spinner picker(
      LinearLayout parent, String label, ArrayList<String> labels, ArrayList<String> details,
      ArrayList<String> icons) {
    parent.addView(ui.text(label, 14, color(R.color.muted), 500), ui.fill());
    Spinner s = new Spinner(this, Spinner.MODE_DROPDOWN);
    s.setContentDescription(label);
    s.setBackground(ui.inputBackground());
    s.setPopupBackgroundDrawable(
        ui.round(color(R.color.surface_raised), 16, color(R.color.surface_variant)));
    s.setAdapter(
        new ArrayAdapter<String>(this, 0, labels) {
          View choice(int position, boolean selected) {
            LinearLayout line = ui.row();
            line.setPadding(dp(12), dp(4), selected ? dp(8) : dp(16), dp(4));
            line.setMinimumHeight(dp(selected ? 44 : 52));
            if (icons != null)
              line.addView(
                  ui.icon(icons.get(position), 18, color(selected ? R.color.ink : R.color.muted)),
                  new LinearLayout.LayoutParams(dp(18), dp(18)));
            LinearLayout words = ui.row();
            words.addView(
                ui.truncate(ui.text(labels.get(position), 14, color(R.color.ink), selected ? 600 : 500)));
            String detail = details == null ? "" : details.get(position);
            if (!detail.isEmpty())
              words.addView(ui.text(detail, 12, color(R.color.faint), 400), ui.start(ui.wrap(), 8));
            line.addView(words, ui.start(ui.weight(1), icons == null ? 0 : 10));
            if (selected) {
              line.addView(ui.text("Change", 12, color(R.color.brand), 600));
              line.addView(ui.icon("expand-down", 15, color(R.color.brand)), ui.start(new LinearLayout.LayoutParams(dp(15), dp(15)), 4));
            }
            return line;
          }

          @Override
          public View getView(int position, View convert, ViewGroup group) {
            return choice(position, true);
          }

          @Override
          public View getDropDownView(int position, View convert, ViewGroup group) {
            return choice(position, false);
          }
        });
    parent.addView(s, ui.top(new LinearLayout.LayoutParams(-1, dp(44)), 8));
    return s;
  }

  /** A row of choice chips; the chosen one is brand on brand-soft, as on the web. */
  TextView chip(String label, boolean on, Runnable action) {
    TextView t = ui.text(label, 14, color(on ? R.color.brand : R.color.muted), 500);
    t.setGravity(Gravity.CENTER);
    t.setMinHeight(dp(44));
    t.setPadding(dp(12), 0, dp(12), 0);
    t.setBackground(
        ui.round(
            color(on ? R.color.brand_soft : R.color.surface_raised),
            12,
            color(on ? R.color.brand : R.color.border_subtle)));
    t.setContentDescription(label);
    return ui.press(t, 0.97f, action);
  }

  void entry() throws Exception {
    ArrayList<JSONObject> active = new ArrayList<>();
    ArrayList<String> names = new ArrayList<>(), currencies = new ArrayList<>(), kinds = new ArrayList<>();
    for (int i = 0; i < accounts.length(); i++) {
      JSONObject a = accounts.getJSONObject(i);
      if (a.optBoolean("is_active", true)) {
        active.add(a);
        names.add(a.getString("name"));
        currencies.add(a.getString("currency"));
        int g = java.util.Arrays.asList(ACCOUNT_TYPES).indexOf(a.optString("type", "bank"));
        kinds.add(ACCOUNT_ICONS[Math.max(0, g)]);
      }
    }
    if (active.isEmpty()) {
      LinearLayout card = ui.card();
      card.setPadding(dp(20), dp(20), dp(20), dp(20));
      card.setGravity(Gravity.CENTER_HORIZONTAL);
      card.addView(ui.text("No accounts yet", 14, color(R.color.ink), 600));
      TextView why =
          ui.text(
              "A transaction has to come from somewhere. Add an account first.",
              14,
              color(R.color.muted),
              400);
      why.setGravity(Gravity.CENTER);
      card.addView(why, ui.top(ui.wrap(), 12));
      card.addView(ui.button("Add an account", null, "primary", this::newAccount), ui.top(ui.fill(), 12));
      add(card);
      return;
    }
    SharedPreferences saved = draft();
    boolean transfer = mode == 2;
    add(ui.text("A few taps, and your money is up to date.", 14, color(R.color.muted), 400));

    LinearLayout modes = ui.row();
    modes.setPadding(dp(6), dp(6), dp(6), dp(6));
    modes.setBackground(ui.round(color(R.color.surface_container), 16));
    String[] modeLabels = {"Expense", "Income", "Transfer"};
    for (int i = 0; i < 3; i++) {
      boolean on = i == mode;
      TextView t = ui.text(modeLabels[i], 14, color(on ? R.color.on_hero : R.color.muted), 600);
      t.setGravity(Gravity.CENTER);
      t.setMinHeight(dp(44));
      t.setContentDescription(modeLabels[i]);
      if (on) t.setBackground(ui.round(color(R.color.brand), 12));
      int next = i;
      modes.addView(
          ui.press(
              t,
              0.97f,
              () -> {
                if (next == mode) return;
                saveDraft();
                mode = next;
                draw();
              }),
          ui.weight(1));
    }
    add(modes);

    // Amount card, the AmountDisplay component.
    int tone = color(transfer ? R.color.ink : mode == 0 ? R.color.outflow : R.color.inflow);
    LinearLayout amountCard = ui.column();
    amountCard.setBackground(ui.round(color(R.color.surface_container_low), 24));
    amountCard.setPadding(dp(20), dp(20), dp(20), dp(20));
    amountCard.addView(ui.caps(transfer ? "Amount sent" : "Amount", 12, color(R.color.faint), 0.05f));
    LinearLayout amountRow = ui.row();
    TextView prefix = ui.money("$", 36, tone, 600);
    amountRow.addView(prefix);
    amount = new EditText(this);
    amount.setBackground(null);
    amount.setPadding(0, 0, 0, 0);
    amount.setTextSize(TypedValue.COMPLEX_UNIT_SP, 36);
    amount.setTypeface(Ui.font(600));
    amount.setFontFeatureSettings("tnum");
    amount.setLetterSpacing(-0.025f);
    amount.setTextColor(tone);
    amount.setHint("0.00");
    amount.setHintTextColor(Ui.alpha(tone, 0.35f));
    amount.setSingleLine(true);
    amount.setContentDescription("Amount");
    amount.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    amount.setShowSoftInputOnFocus(false);
    amount.setText(saved.getString("amount", ""));
    keypadTarget = amount;
    amountRow.addView(amount, ui.weight(1));
    TextView suffix = ui.money("៛", 36, tone, 600);
    amountRow.addView(suffix);
    LinearLayout pills = ui.row();
    amountRow.addView(pills, ui.start(ui.wrap(), 8));
    amountCard.addView(amountRow, ui.top(ui.fill(), 12));
    add(amountCard);

    LinearLayout accountBox = ui.column();
    account = picker(accountBox, transfer ? "From" : "Account", names, currencies, kinds);
    account.setTag(active);
    selectId(account, saved.getString("account_id", null));
    Runnable currencyChanged =
        () -> {
          String code = active.get(Math.max(0, account.getSelectedItemPosition())).optString("currency");
          prefix.setVisibility(code.equals("USD") ? View.VISIBLE : View.GONE);
          suffix.setVisibility(code.equals("KHR") ? View.VISIBLE : View.GONE);
          pills.removeAllViews();
          if (transfer) return;
          for (String c : new String[] {"USD", "KHR"}) {
            int target = currencies.indexOf(c);
            boolean on = c.equals(code);
            TextView pill = ui.text(c, 12, color(on ? R.color.on_hero : R.color.muted), 700);
            pill.setGravity(Gravity.CENTER);
            pill.setMinHeight(dp(44));
            pill.setPadding(dp(12), 0, dp(12), 0);
            pill.setBackground(ui.round(color(on ? R.color.brand : R.color.surface), 999));
            pill.setContentDescription("Use " + c);
            if (target < 0) pill.setAlpha(0.3f);
            else ui.press(pill, 0.95f, () -> account.setSelection(target));
            pills.addView(pill, pills.getChildCount() == 0 ? ui.wrap() : ui.start(ui.wrap(), 4));
          }
        };
    account.setOnItemSelectedListener(
        new AdapterView.OnItemSelectedListener() {
          public void onNothingSelected(AdapterView<?> p) {}

          public void onItemSelected(AdapterView<?> p, View v, int n, long id) {
            currencyChanged.run();
            if (destination != null) transferCurrencies();
          }
        });
    currencyChanged.run();

    // TransactionDateField: Today, Yesterday, or any date.
    try {
      date = LocalDate.parse(saved.getString("date", LocalDate.now(CAMBODIA).toString()));
    } catch (Exception e) {
      date = LocalDate.now(CAMBODIA);
    }
    LinearLayout dateBox = ui.column();
    LinearLayout dateLabel = ui.row();
    dateLabel.addView(ui.icon("calendar", 16, color(R.color.muted)));
    dateLabel.addView(ui.text("Date", 14, color(R.color.muted), 500), ui.start(ui.wrap(), 8));
    dateBox.addView(dateLabel);
    LinearLayout dates = ui.row();
    dateBox.addView(dates, ui.top(ui.fill(), 8));
    Runnable[] paint = new Runnable[1];
    paint[0] =
        () -> {
          dates.removeAllViews();
          LocalDate today = LocalDate.now(CAMBODIA);
          dates.addView(chip("Today", date.equals(today), () -> {
            date = today;
            paint[0].run();
          }));
          dates.addView(chip("Yesterday", date.equals(today.minusDays(1)), () -> {
            date = today.minusDays(1);
            paint[0].run();
          }), ui.start(ui.wrap(), 8));
          boolean other = !date.equals(today) && !date.equals(today.minusDays(1));
          TextView pick =
              chip(
                  date.format(DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH)),
                  other,
                  () ->
                      new DatePickerDialog(
                              this,
                              (p, y, m, d) -> {
                                date = LocalDate.of(y, m + 1, d);
                                paint[0].run();
                              },
                              date.getYear(),
                              date.getMonthValue() - 1,
                              date.getDayOfMonth())
                          .show());
          pick.setContentDescription("Choose date");
          dates.addView(pick, ui.start(ui.weight(1), 8));
        };
    paint[0].run();
    add(dateBox);
    add(accountBox);

    if (transfer) {
      LinearLayout toBox = ui.column();
      destination = picker(toBox, "To", names, currencies, kinds);
      destination.setTag(active);
      selectId(destination, saved.getString("destination_id", null));
      if (destination.getSelectedItemPosition() == account.getSelectedItemPosition()
          && active.size() > 1
          && saved.getString("destination_id", null) == null)
        destination.setSelection(account.getSelectedItemPosition() == 0 ? 1 : 0);
      add(toBox);
      LinearLayout receivedBox = ui.column();
      received = input(receivedBox, "Amount received", "0.00", true);
      received.setText(saved.getString("received", ""));
      received.setShowSoftInputOnFocus(false);
      received.setOnFocusChangeListener((v, focused) -> {
        if (focused) keypadTarget = received;
      });
      amount.setOnFocusChangeListener((v, focused) -> {
        if (focused) keypadTarget = amount;
      });
      TextView hint =
          ui.text(
              "The two accounts hold different currencies, so enter what arrived.",
              12,
              color(R.color.faint),
              400);
      receivedBox.addView(hint, ui.top(ui.fill(), 8));
      add(receivedBox);
      destination.setOnItemSelectedListener(
          new AdapterView.OnItemSelectedListener() {
            public void onNothingSelected(AdapterView<?> p) {}

            public void onItemSelected(AdapterView<?> p, View v, int n, long id) {
              transferCurrencies();
            }
          });
      transferCurrencies();
    }

    LinearLayout noteBox = ui.column();
    note = input(noteBox, "Note", transfer ? "What was it for? (optional)" : "What was it for?", false);
    note.setText(saved.getString("note", ""));
    add(noteBox);

    add(keypad());

    if (!transfer) {
      ArrayList<String> labels = new ArrayList<>(), icons = new ArrayList<>();
      ArrayList<JSONObject> options = new ArrayList<>();
      labels.add("No category");
      icons.add("widget");
      options.add(null);
      for (int i = 0; i < categories.length(); i++) {
        JSONObject c = categories.getJSONObject(i);
        JSONArray applies = c.optJSONArray("applies_to");
        boolean fits = applies == null;
        for (int k = 0; applies != null && k < applies.length(); k++)
          fits |= applies.optString(k).equals(MODES[mode]) || (mode == 1 && applies.optString(k).equals("refund"));
        if (!fits) continue;
        labels.add(categoryLabel(c));
        icons.add(Ui.categoryIcon(c));
        options.add(c);
      }
      LinearLayout categoryBox = ui.column();
      category = picker(categoryBox, "Category", labels, null, icons);
      category.setTag(options);
      selectId(category, saved.getString("category_id", null));
      add(categoryBox);
    }

    add(
        ui.button(
            "Save " + MODES[mode],
            "check-fill",
            "primary",
            () -> save(active)));
    TextView foot =
        ui.text(
            "Saved on this phone first. Pending entries count in your balances and sync when you"
                + " are online.",
            12,
            color(R.color.faint),
            400);
    foot.setGravity(Gravity.CENTER);
    LinearLayout.LayoutParams footSpace = ui.fill();
    footSpace.topMargin = dp(12);
    body.addView(foot, footSpace);
  }

  /** Shows "Amount received" only when the transfer crosses currencies. */
  void transferCurrencies() {
    if (destination == null || received == null) return;
    JSONObject from = selectedRow(account), to = selectedRow(destination);
    boolean crosses =
        from != null && to != null && !from.optString("currency").equals(to.optString("currency"));
    View box = (View) received.getParent();
    box.setVisibility(crosses ? View.VISIBLE : View.GONE);
    if (!crosses && keypadTarget == received) keypadTarget = amount;
  }

  /** AmountKeypad: 1 to 9, the decimal point, 0 and delete. */
  LinearLayout keypad() {
    LinearLayout grid = ui.column();
    String[] keys = {"1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"};
    LinearLayout line = null;
    for (int i = 0; i < keys.length; i++) {
      if (i % 3 == 0) {
        line = ui.row();
        grid.addView(line, i == 0 ? ui.fill() : ui.top(ui.fill(), 8));
      }
      String key = keys[i];
      LinearLayout cell = ui.row();
      cell.setGravity(Gravity.CENTER);
      cell.setBackground(
          ui.round(color(R.color.surface_raised), 16, color(R.color.surface_variant)));
      cell.setContentDescription(key.equals("del") ? "Delete last digit" : "Key " + key);
      if (key.equals("del")) cell.addView(ui.icon("back", 20, color(R.color.ink)));
      else cell.addView(ui.text(key, 24, color(R.color.ink), 500));
      ui.press(cell, 0.9f, () -> press(key));
      line.addView(cell, i % 3 == 0 ? new LinearLayout.LayoutParams(0, dp(56), 1) : ui.start(new LinearLayout.LayoutParams(0, dp(56), 1), 8));
    }
    return grid;
  }

  void press(String key) {
    EditText target = keypadTarget == null ? amount : keypadTarget;
    if (target == null) return;
    String value = target.getText().toString();
    if (key.equals("del")) value = value.isEmpty() ? "" : value.substring(0, value.length() - 1);
    else if (key.equals(".")) {
      if (!value.contains(".")) value = (value.isEmpty() ? "0" : value) + ".";
    } else {
      int dot = value.indexOf('.');
      if (dot >= 0 && value.length() - dot > 2) return;
      if (value.length() >= 15) return;
      value = value.equals("0") ? key : value + key;
    }
    target.setText(value);
    target.setSelection(value.length());
  }

  void save(ArrayList<JSONObject> active) {
    try {
      long minor = Money.parse(amount.getText().toString().trim());
      if (minor <= 0) throw new Exception("Enter an amount above zero");
      String notes = note.getText().toString().trim();
      if (notes.length() > 2000) throw new Exception("Note must be 2000 characters or fewer");
      JSONObject selected = active.get(account.getSelectedItemPosition());
      String kind = MODES[mode];
      String occurred = date.atTime(12, 0).atZone(CAMBODIA).toOffsetDateTime().toString();
      JSONObject row =
          new JSONObject()
              .put("id", UUID.randomUUID().toString())
              .put("user_id", owner())
              .put("account_id", selected.getString("id"))
              .put("type", kind)
              .put("amount", kind.equals("income") ? minor : -minor)
              .put("currency", selected.getString("currency"))
              .put("occurred_at", occurred)
              .put("notes", notes.isEmpty() ? JSONObject.NULL : notes)
              .put("created_via", "android");
      JSONArray rows = new JSONArray();
      if (kind.equals("transfer")) {
        JSONObject to = active.get(destination.getSelectedItemPosition());
        if (to.getString("id").equals(selected.getString("id")))
          throw new Exception("Choose a different destination account");
        long incoming = minor;
        if (!to.getString("currency").equals(selected.getString("currency"))) {
          incoming = Money.parse(received.getText().toString().trim());
          if (incoming <= 0) throw new Exception("Enter the amount received");
        }
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
        String id = selectedId(category);
        row.put("category_id", id.isEmpty() ? JSONObject.NULL : id);
        rows.put(row);
      }
      app.store.enqueue("transactions", rows);
      draft().edit().clear().commit();
      amount = null;
      ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE))
          .hideSoftInputFromWindow(root.getWindowToken(), 0);
      tab = 1;
      month = YearMonth.from(date);
      app.status = "Saved on this phone";
      load();
      app.schedule();
      app.sync(() -> runOnUiThread(this::load));
    } catch (Exception e) {
      error(e.getMessage());
    }
  }

  void newAccount() {
    LinearLayout form = ui.column();
    form.setPadding(dp(24), dp(8), dp(24), 0);
    EditText name = input(form, "Account name", "ABA, Wing, Cash wallet", false);
    LinearLayout gap = ui.column();
    form.addView(gap, ui.top(ui.fill(), 16));
    Spinner currency =
        picker(gap, "Currency", new ArrayList<>(java.util.Arrays.asList("USD", "KHR")), null, null);
    LinearLayout gap2 = ui.column();
    form.addView(gap2, ui.top(ui.fill(), 16));
    Spinner kind =
        picker(
            gap2,
            "Account type",
            new ArrayList<>(java.util.Arrays.asList(ACCOUNT_LABELS)),
            null,
            new ArrayList<>(java.util.Arrays.asList(ACCOUNT_ICONS)));
    LinearLayout gap3 = ui.column();
    form.addView(gap3, ui.top(ui.fill(), 16));
    EditText opening = input(gap3, "Opening balance", "0.00", true);
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
                                .put("type", ACCOUNT_TYPES[kind.getSelectedItemPosition()])
                                .put("opening_balance", Money.parse(opening.getText().toString().trim()))
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

  void queue(String table, JSONArray rows) throws Exception {
    app.store.enqueue(table, rows);
    app.status = "Saved on this phone";
    load();
    app.schedule();
    app.sync(() -> runOnUiThread(this::load));
  }

  /** One row of the More list: tinted icon tile, title, description, chevron. */
  LinearLayout moreRow(String icon, String title, String detail, boolean danger, Runnable action) {
    LinearLayout line = ui.row();
    line.setPadding(dp(20), dp(20), dp(20), dp(20));
    line.addView(
        ui.tile(
            icon,
            48,
            22,
            color(danger ? R.color.outflow_soft : R.color.brand_soft),
            color(danger ? R.color.outflow : R.color.brand),
            0));
    LinearLayout words = ui.column();
    words.addView(ui.text(title, 16, color(R.color.ink), 600));
    words.addView(ui.text(detail, 14, color(R.color.muted), 400), ui.top(ui.wrap(), 4));
    line.addView(words, ui.start(ui.weight(1), 16));
    line.addView(ui.icon("expand-right", 18, color(R.color.faint)));
    line.setContentDescription(title);
    return ui.press(line, 0.99f, action);
  }

  void more() throws Exception {
    add(ui.text("Make room for the bigger picture.", 14, color(R.color.muted), 400));
    int pending = app.store.pendingCount();
    LinearLayout list = ui.card();
    list.addView(moreRow("pie-chart", "Budgets", "Stay on top of your spending", false, () -> go(5)), ui.fill());
    list.addView(ui.divider());
    list.addView(
        moreRow(
            "refresh",
            "Sync now",
            pending > 0 ? pending + " waiting to sync. " + app.status : app.status,
            false,
            () -> {
              app.status = "Syncing";
              updateStatus();
              app.sync(() -> runOnUiThread(this::load));
            }),
        ui.fill());
    list.addView(ui.divider());
    list.addView(
        moreRow(
            "colum-up",
            "Reports and settings",
            "Open the full web app",
            false,
            () -> openWeb("/reports")),
        ui.fill());
    add(list);

    if (pending > 0) {
      TextView head = ui.text("Waiting to sync", 14, color(R.color.muted), 600);
      head.setPadding(dp(4), 0, dp(4), 0);
      add(head);
      LinearLayout queued = ui.card();
      boolean first = true;
      for (JSONObject item : app.store.pending()) {
        if (!first) queued.addView(ui.divider());
        first = false;
        LinearLayout line = ui.row();
        line.setPadding(dp(20), dp(16), dp(20), dp(16));
        boolean failed = !item.optString("error").isEmpty();
        line.addView(
            ui.tile(
                failed ? "critical" : "load-circle",
                36,
                17,
                color(failed ? R.color.outflow_soft : R.color.surface_container),
                color(failed ? R.color.outflow : R.color.muted),
                0));
        LinearLayout words = ui.column();
        String table = item.getJSONObject("operation").getString("table");
        words.addView(
            ui.text(table.equals("accounts") ? "New account" : "New entry", 14, color(R.color.ink), 600));
        words.addView(
            ui.text(failed ? item.getString("error") : "Waiting for a connection", 12, color(R.color.faint), 400),
            ui.top(ui.wrap(), 4));
        line.addView(words, ui.start(ui.weight(1), 12));
        queued.addView(line, ui.fill());
      }
      LinearLayout.LayoutParams space = ui.fill();
      space.topMargin = dp(12);
      body.addView(queued, space);
    }

    LinearLayout telegram = ui.column();
    telegram.setBackground(ui.round(color(R.color.brand_soft), 24));
    telegram.setPadding(dp(24), dp(24), dp(24), dp(24));
    telegram.addView(ui.icon("send", 24, color(R.color.brand)));
    telegram.addView(ui.text("Your money, in a message.", 18, color(R.color.ink), 600), ui.top(ui.wrap(), 16));
    telegram.addView(
        ui.text(
            "Connect @LuyManagerBot and keep your ledger up to date from Telegram.",
            14,
            color(R.color.muted),
            400),
        ui.top(ui.wrap(), 8));
    LinearLayout connect = ui.button("Connect Telegram", null, "primary", () -> openWeb("/settings"));
    connect.setMinimumHeight(dp(44));
    connect.addView(ui.icon("expand-right", 16, color(R.color.on_hero)), ui.start(new LinearLayout.LayoutParams(dp(16), dp(16)), 8));
    telegram.addView(connect, ui.top(ui.wrap(), 20));
    add(telegram);

    LinearLayout leave = ui.card();
    leave.addView(
        moreRow(
            "sign-out",
            "Sign out",
            pending > 0 ? "Sync pending entries first" : "Your ledger stays private on this phone",
            true,
            this::signOut),
        ui.fill());
    add(leave);
  }

  void openWeb(String path) {
    try {
      startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(WEB + path)));
    } catch (Exception e) {
      error("Could not open the web app");
    }
  }

  void budgetList() throws Exception {
    add(ui.text("Budgets you set in the web app.", 14, color(R.color.muted), 400));
    if (budgets.length() == 0) {
      LinearLayout empty = ui.card();
      empty.addView(
          emptyState("pie-chart", "No budgets yet", "Create one in the web app and it appears here."),
          ui.fill());
      add(empty);
      return;
    }
    LinearLayout card = ui.card();
    for (int i = 0; i < budgets.length(); i++) {
      JSONObject b = budgets.getJSONObject(i);
      if (i > 0) card.addView(ui.divider());
      JSONObject category = null;
      try {
        if (!b.isNull("category_id")) category = find(categories, b.getString("category_id"));
      } catch (Exception ignored) {
      }
      LinearLayout line = ui.row();
      line.setPadding(dp(20), dp(16), dp(20), dp(16));
      line.addView(
          ui.tile(
              category == null ? "pie-chart" : Ui.categoryIcon(category),
              40,
              20,
              color(R.color.brand_soft),
              color(R.color.brand),
              0));
      LinearLayout words = ui.column();
      String name = b.isNull("name") ? (category == null ? "Overall" : categoryLabel(category)) : b.optString("name");
      words.addView(ui.truncate(ui.text(name, 14, color(R.color.ink), 600)));
      String period = b.optString("period", "monthly");
      words.addView(
          ui.text(period.substring(0, 1).toUpperCase(Locale.ROOT) + period.substring(1), 11, color(R.color.faint), 400),
          ui.top(ui.wrap(), 4));
      line.addView(words, ui.start(ui.weight(1), 12));
      LinearLayout right = ui.column();
      right.setGravity(Gravity.END);
      right.addView(ui.money(Money.display(b.getLong("amount"), b.getString("currency")), 14, color(R.color.ink), 600), ui.wrap());
      right.addView(ui.badge(b.getString("currency")), ui.top(ui.wrap(), 4));
      line.addView(right, ui.start(ui.wrap(), 12));
      card.addView(line, ui.fill());
    }
    add(card);
  }

  void signOut() {
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
  }

  void error(String message) {
    new AlertDialog.Builder(this)
        .setTitle("Luy Manager")
        .setMessage(message == null ? "Please try again" : message)
        .setPositiveButton("OK", null)
        .show();
  }
}
