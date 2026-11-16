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
import java.util.HashMap;
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
  static final DateTimeFormatter MONTH_FORMAT =
      DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH);
  static final DateTimeFormatter SHORT_DATE_FORMAT =
      DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH);
  static final DateTimeFormatter FULL_DATE_FORMAT =
      DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);
  static final DateTimeFormatter WEEKDAY_FORMAT =
      DateTimeFormatter.ofPattern("EEE", Locale.ENGLISH);
  static final String[] TITLES = {
    "Home", "Activity", "Add transaction", "Accounts", "Settings", "Budgets"
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
  /** A resume inside this window after a completed sync skips the network round trip. */
  static final long FRESH_MS = 60_000L;

  LuyApplication app;
  Ui ui;
  LinearLayout root, body, header, banner;
  TextView status;
  Ledger ledger = new Ledger();
  JSONArray accounts = new JSONArray(),
      categories = new JSONArray(),
      transactions = new JSONArray(),
      budgets = new JSONArray();
  private JSONArray indexedAccountsRef, indexedCategoriesRef, indexedTransactionsRef;
  private int indexedAccountsLen = -1, indexedCategoriesLen = -1, indexedTransactionsLen = -1;
  private final HashMap<String, JSONObject> accountById = new HashMap<>();
  private final HashMap<String, JSONObject> categoryById = new HashMap<>();
  private final HashMap<String, ArrayList<JSONObject>> transferByGroup = new HashMap<>();
  /** Cambodia dates by row id. Parsing an offset date per row is the hot path on Activity. */
  private final HashMap<String, LocalDate> dayById = new HashMap<>();
  private final android.os.Handler timer = new android.os.Handler(android.os.Looper.getMainLooper());
  /** The debounced search render, so a burst of keystrokes builds one list. */
  private Runnable pendingSearch;
  int tab = 0, mode = 0;
  YearMonth month = YearMonth.now(CAMBODIA);
  boolean loaded = false;
  /** The app dataVersion this screen was built from, so a committed pull is not missed. */
  private int loadedVersion = -1;
  /** True between onResume and onPause, so a pull from elsewhere never redraws a hidden screen. */
  private boolean visible;
  String shown = "USD", accountFilter = null, categoryFilter = null, typeFilter = "", search = "";
  EditText amount, note, received, keypadTarget;
  Spinner account, category, destination;
  LocalDate date = LocalDate.now(CAMBODIA);
  boolean transferMoreOpen = false;

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
    // Kept across pause so a pull that lands after this screen resumes still refreshes it,
    // while `visible` keeps a background pull from rebuilding a hidden screen.
    app.synced =
        () ->
            runOnUiThread(
                () -> {
                  if (visible && !isFinishing() && app.store != null) load();
                });
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
    cancelSearch();
    visible = false;
    super.onPause();
  }

  @Override
  protected void onDestroy() {
    if (app.synced != null) app.synced = null;
    super.onDestroy();
  }

  /** Drop a debounced search render so it cannot touch a screen that was replaced. */
  void cancelSearch() {
    if (pendingSearch == null) return;
    timer.removeCallbacks(pendingSearch);
    pendingSearch = null;
  }

  @Override
  protected void onResume() {
    super.onResume();
    visible = true;
    if (app.store != null) {
      app.schedule();
      // Coming back from the web view may have changed data the pull in takeBack is still
      // committing. A committed pull bumps dataVersion, so read now only when this screen
      // missed one; otherwise a resume inside the freshness window needs no work.
      if (loaded && app.dataVersion != loadedVersion) load();
      app.syncIfStale(
          FRESH_MS,
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
    if ((app.store != null && !app.reauth)
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
            String expected =
                app.store != null && app.cloud != null && app.cloud.signedIn()
                    ? app.cloud.owner()
                    : null;
            authenticated.authenticate(code, verifier, expected);
            app.cloud = authenticated;
            if (app.store == null) app.store = new LedgerStore(this, authenticated.owner());
            app.blocked = false;
            app.reauth = false;
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
                  app.status =
                      e instanceof CloudClient.AuthException || e.getMessage() == null
                          ? "Could not complete sign-in. Try again."
                          : e.getMessage();
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
            int version = app.dataVersion;
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
                  dayById.clear();
                  loadedVersion = version;
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
    cancelSearch();
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
    chrome.addView(appBar(), ui.fill());
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
    bannerSpace.setMargins(dp(16), 0, dp(16), dp(8));
    chrome.addView(banner, bannerSpace);
    updateStatus();

    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    scroll.setClipToPadding(false);
    root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
    body = ui.column();
    body.setPadding(dp(16), dp(4), dp(16), dp(tab == 2 ? 16 : 28));
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
          nav.setPadding(dp(16), dp(6), dp(16), Math.max(dp(10), bottom + dp(6)));
          return insets;
        });
    root.requestApplyInsets();
  }

  /**
   * SiteHeader:
   * - Form route (`tab == 2`): compact top bar with circular `<` back button and centered 17sp title.
   * - Other routes: top bar with app glyph on root routes (`Home`, `Activity`, `Budgets`) or circular
   *   back button on sub-routes (`Accounts`, `Settings`), circular Settings button on the right, and
   *   large in-flow 34sp bold screen title below.
   */
  LinearLayout appBar() {
    header = ui.column();
    boolean compact = tab == 2;
    boolean isRoot = tab == 0 || tab == 1 || tab == 5;
    LinearLayout topRow = ui.row();
    topRow.setPadding(dp(16), dp(8), dp(16), dp(compact ? 8 : 4));
    topRow.setMinimumHeight(dp(56));

    if (isRoot) {
      ImageView logo = new ImageView(this);
      logo.setImageResource(R.drawable.ic_logo);
      logo.setContentDescription("Luy Manager");
      topRow.addView(logo, new LinearLayout.LayoutParams(dp(34), dp(34)));
    } else {
      LinearLayout back =
          ui.tile(
              "expand-left",
              40,
              20,
              color(R.color.surface_raised),
              color(R.color.ink),
              0);
      back.setBackground(
          ui.round(color(R.color.surface_raised), 999, color(R.color.surface_variant)));
      back.setContentDescription("Home");
      topRow.addView(ui.press(back, 0.94f, this::goBack), new LinearLayout.LayoutParams(dp(40), dp(40)));
    }

    if (compact) {
      TextView inlineTitle = ui.truncate(ui.text(TITLES[tab], 17, color(R.color.ink), 600));
      inlineTitle.setGravity(Gravity.CENTER);
      inlineTitle.setLetterSpacing(-0.025f);
      topRow.addView(inlineTitle, ui.weight(1));
      View spacer = new View(this);
      topRow.addView(spacer, new LinearLayout.LayoutParams(dp(40), dp(40)));
      header.addView(topRow, ui.fill());
      return header;
    }

    topRow.addView(new View(this), ui.weight(1));
    if (tab != 4) {
      LinearLayout settings =
          ui.tile(
              "setting-line",
              40,
              19,
              color(R.color.surface_raised),
              color(R.color.ink),
              0);
      settings.setBackground(
          ui.round(color(R.color.surface_raised), 999, color(R.color.surface_variant)));
      settings.setContentDescription("More");
      topRow.addView(ui.press(settings, 0.96f, () -> go(4)), new LinearLayout.LayoutParams(dp(40), dp(40)));
    }
    header.addView(topRow, ui.fill());

    LinearLayout flowHead = ui.row();
    flowHead.setPadding(dp(16), dp(2), dp(16), dp(8));
    TextView largeTitle = ui.truncate(ui.text(TITLES[tab], 34, color(R.color.ink), 700));
    largeTitle.setLetterSpacing(-0.028f);
    flowHead.addView(largeTitle, ui.weight(1));
    header.addView(flowHead, ui.fill());
    return header;
  }

  /**
   * BottomNav: floating capsule with 4 tabs (`Home`, `Activity`, `Budgets`, `Accounts`) +
   * separate circular `Add transaction` button on the right, matching `.floating-dock`.
   */
  LinearLayout bottomNav() {
    LinearLayout dock = ui.row();
    dock.setGravity(Gravity.CENTER_VERTICAL);
    dock.setPadding(dp(16), dp(6), dp(16), dp(12));

    LinearLayout capsule = ui.row();
    capsule.setPadding(dp(4), dp(4), dp(4), dp(4));
    capsule.setBackground(
        ui.round(color(R.color.surface_raised), 999, color(R.color.surface_variant)));
    capsule.setElevation(dp(8));
    capsule.setOutlineSpotShadowColor(Ui.alpha(color(R.color.ink), 0.25f));
    capsule.setOutlineAmbientShadowColor(Ui.alpha(color(R.color.ink), 0.12f));

    String[][] items = {
      {"Home", "home", "0"},
      {"Activity", "expense-list", "1"},
      {"Budgets", "target", "5"},
      {"Accounts", "wallet", "3"}
    };
    for (String[] item : items) {
      int target = Integer.parseInt(item[2]);
      boolean active = tab == target;
      int ink = color(active ? R.color.brand : R.color.muted);
      LinearLayout cell = ui.column();
      cell.setGravity(Gravity.CENTER);
      cell.setMinimumHeight(dp(54));
      cell.setContentDescription(item[0]);
      if (active) {
        cell.setBackground(ui.round(color(R.color.brand_soft), 999));
      }
      cell.addView(ui.icon(item[1], 20, ink));
      TextView lbl = ui.text(item[0], 11, ink, 600);
      lbl.setLetterSpacing(-0.008f);
      cell.addView(lbl, ui.top(ui.wrap(), 2));
      capsule.addView(
          ui.press(cell, 0.96f, () -> go(target)), new LinearLayout.LayoutParams(0, dp(54), 1));
    }
    dock.addView(capsule, new LinearLayout.LayoutParams(0, dp(62), 1));

    LinearLayout fab = ui.tile("add", 62, 24, color(R.color.brand), color(R.color.on_action), 0);
    fab.setBackground(ui.round(color(R.color.brand), 999));
    fab.setElevation(dp(8));
    fab.setOutlineSpotShadowColor(color(R.color.brand));
    fab.setOutlineAmbientShadowColor(color(R.color.brand));
    fab.setContentDescription("Add transaction");
    dock.addView(
        ui.press(fab, 0.93f, () -> go(2)),
        ui.start(new LinearLayout.LayoutParams(dp(62), dp(62)), 10));
    return dock;
  }

  void go(int next) {
    saveDraft();
    if (next != 1) {
      accountFilter = null;
      categoryFilter = null;
      typeFilter = "";
    }
    tab = next;
    draw();
  }

  void add(View view) {
    LinearLayout.LayoutParams p = ui.fill();
    if (body.getChildCount() > 0) p.topMargin = dp(18);
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

  private void ensureLookupIndexes() {
    if (indexedAccountsRef != accounts || indexedAccountsLen != accounts.length()) {
      accountById.clear();
      for (int i = 0; i < accounts.length(); i++) {
        JSONObject row = accounts.optJSONObject(i);
        if (row != null) accountById.put(row.optString("id"), row);
      }
      indexedAccountsRef = accounts;
      indexedAccountsLen = accounts.length();
    }
    if (indexedCategoriesRef != categories || indexedCategoriesLen != categories.length()) {
      categoryById.clear();
      for (int i = 0; i < categories.length(); i++) {
        JSONObject row = categories.optJSONObject(i);
        if (row != null) categoryById.put(row.optString("id"), row);
      }
      indexedCategoriesRef = categories;
      indexedCategoriesLen = categories.length();
    }
    if (indexedTransactionsRef != transactions || indexedTransactionsLen != transactions.length()) {
      transferByGroup.clear();
      for (int i = 0; i < transactions.length(); i++) {
        JSONObject row = transactions.optJSONObject(i);
        if (row != null && !row.isNull("transfer_group_id")) {
          String group = row.optString("transfer_group_id");
          if (!group.isEmpty()) {
            transferByGroup.computeIfAbsent(group, ignored -> new ArrayList<>()).add(row);
          }
        }
      }
      indexedTransactionsRef = transactions;
      indexedTransactionsLen = transactions.length();
    }
  }

  JSONObject find(JSONArray rows, String id) throws Exception {
    ensureLookupIndexes();
    if (rows == accounts) {
      JSONObject hit = accountById.get(id);
      if (hit != null) return hit;
    } else if (rows == categories) {
      JSONObject hit = categoryById.get(id);
      if (hit != null) return hit;
    }
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
    ensureLookupIndexes();
    String group = row.optString("transfer_group_id");
    ArrayList<JSONObject> legs = transferByGroup.get(group);
    if (legs != null) {
      for (JSONObject other : legs) {
        if (!other.optString("id").equals(row.optString("id"))) {
          String them = accountName(other);
          return row.optLong("amount") < 0 ? own + " to " + them : them + " to " + own;
        }
      }
    }
    return own;
  }

  static LocalDate day(JSONObject row) throws Exception {
    return OffsetDateTime.parse(row.getString("occurred_at"))
        .atZoneSameInstant(CAMBODIA)
        .toLocalDate();
  }

  /** The same date, parsed once per transaction across every screen rebuild. */
  LocalDate dayOf(JSONObject row) throws Exception {
    String id = row.optString("id");
    LocalDate known = id.isEmpty() ? null : dayById.get(id);
    if (known != null) return known;
    LocalDate when = day(row);
    if (!id.isEmpty()) dayById.put(id, when);
    return when;
  }

  long balance(JSONObject account) throws Exception {
    return ledger.balance(account.getString("id"));
  }

  boolean inMonth(JSONObject row) {
    try {
      return YearMonth.from(dayOf(row)).equals(month);
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
    return currencyToggle(false);
  }

  LinearLayout currencyToggle(boolean heroVariant) {
    LinearLayout toggle = ui.row();
    toggle.setPadding(dp(2), dp(2), dp(2), dp(2));
    int trackFill = heroVariant ? Ui.alpha(color(R.color.on_hero), 0.1f) : color(R.color.fill);
    int trackStroke = heroVariant ? Ui.alpha(color(R.color.on_hero), 0.14f) : 0;
    toggle.setBackground(ui.round(trackFill, 999, trackStroke));
    for (String code : new String[] {"USD", "KHR"}) {
      boolean on = code.equals(shown);
      int textColor =
          heroVariant
              ? (on ? color(R.color.hero) : Ui.alpha(color(R.color.on_hero), 0.72f))
              : color(on ? R.color.ink : R.color.muted);
      TextView t = ui.text(code, 12, textColor, on ? 600 : 500);
      t.setGravity(Gravity.CENTER);
      t.setMinHeight(dp(30));
      t.setPadding(dp(12), 0, dp(12), 0);
      t.setContentDescription("Show totals in " + code);
      if (on) {
        t.setBackground(
            ui.round(color(heroVariant ? R.color.on_hero : R.color.surface_raised), 999));
        if (!heroVariant) t.setElevation(dp(1));
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

  long convertedNetWorth(String targetCurrency) throws Exception {
    long usdMinor = ledger.total("USD");
    long khrMinor = ledger.total("KHR");
    return Money.add(
        Money.convert(usdMinor, "USD", targetCurrency, app.usdKhr()),
        Money.convert(khrMinor, "KHR", targetCurrency, app.usdKhr()));
  }

  long convertedLiabilities(String targetCurrency) throws Exception {
    long usdLiab = -totalOf("USD", "credit_card");
    long khrLiab = -totalOf("KHR", "credit_card");
    return Money.add(
        Money.convert(Math.max(0L, usdLiab), "USD", targetCurrency, app.usdKhr()),
        Money.convert(Math.max(0L, khrLiab), "KHR", targetCurrency, app.usdKhr()));
  }

  String perDollarText() {
    long rateMinor =
        app.usdKhr().multiply(java.math.BigDecimal.valueOf(100)).longValue();
    return Money.display(rateMinor, "KHR");
  }

  /**
   * TwoPocketsHero: "Everything you have", hero currency toggle, converted net worth +
   * equivalent in the other currency, two-segment USD/KHR share bar, Dollars & Riel pocket
   * tiles, optional liabilities line, and "$1 = 4,100៛" rate footer.
   */
  LinearLayout twoPocketsHero() throws Exception {
    int onHero = color(R.color.on_hero);
    LinearLayout hero = ui.column();
    hero.setBackground(new Ui.Hero(ui));
    hero.setClipToOutline(true);
    hero.setPadding(dp(22), dp(22), dp(22), dp(20));

    LinearLayout top = ui.row();
    top.addView(
        ui.text("Everything you have", 13, Ui.alpha(onHero, 0.72f), 500), ui.weight(1));
    top.addView(currencyToggle(true));
    hero.addView(top, ui.fill());

    long netWorth = convertedNetWorth(shown);
    String altCurrency = other(shown);
    long altNetWorth = convertedNetWorth(altCurrency);

    TextView total = ui.money(Money.display(netWorth, shown), 36, onHero, 700);
    total.setLetterSpacing(-0.032f);
    hero.addView(total, ui.top(ui.fill(), 14));

    TextView sub =
        ui.money(
            "~ " + Money.display(altNetWorth, altCurrency) + " at today's rate",
            13,
            Ui.alpha(onHero, 0.62f),
            400);
    hero.addView(sub, ui.top(ui.fill(), 2));

    long usdTotal = ledger.total("USD");
    long khrTotal = ledger.total("KHR");
    int usdCount = 0, khrCount = 0;
    for (int i = 0; i < accounts.length(); i++) {
      JSONObject a = accounts.getJSONObject(i);
      if (!a.optBoolean("is_active", true)) continue;
      if ("USD".equals(a.optString("currency"))) usdCount++;
      else if ("KHR".equals(a.optString("currency"))) khrCount++;
    }
    long usdInShown = Math.max(0L, Money.convert(usdTotal, "USD", shown, app.usdKhr()));
    long khrInShown = Math.max(0L, Money.convert(khrTotal, "KHR", shown, app.usdKhr()));
    long posSum = Money.add(usdInShown, khrInShown);
    int usdPct = posSum > 0 ? Math.round((usdInShown * 100f) / posSum) : 50;
    int khrPct = posSum > 0 ? Math.max(0, 100 - usdPct) : 50;

    LinearLayout pocketBar = ui.row();
    pocketBar.setBackground(ui.round(Ui.alpha(onHero, 0.14f), 999));
    pocketBar.setClipToOutline(true);
    View segUsd = new View(this);
    segUsd.setBackground(ui.round(color(R.color.hero_usd), 999));
    View segKhr = new View(this);
    segKhr.setBackground(ui.round(color(R.color.hero_khr), 999));
    pocketBar.addView(segUsd, new LinearLayout.LayoutParams(0, -1, Math.max(1, usdPct)));
    if (usdPct > 0 && khrPct > 0) {
      pocketBar.addView(new View(this), new LinearLayout.LayoutParams(dp(3), -1));
    }
    pocketBar.addView(segKhr, new LinearLayout.LayoutParams(0, -1, Math.max(1, khrPct)));
    hero.addView(pocketBar, ui.top(new LinearLayout.LayoutParams(-1, dp(8)), 16));

    LinearLayout tiles = ui.row();
    tiles.addView(
        pocketTile("Dollars", R.color.hero_usd, usdTotal, "USD", usdCount, posSum > 0 ? usdPct : 0),
        ui.weight(1));
    tiles.addView(
        pocketTile("Riel", R.color.hero_khr, khrTotal, "KHR", khrCount, posSum > 0 ? khrPct : 0),
        ui.start(ui.weight(1), 10));
    hero.addView(tiles, ui.top(ui.fill(), 10));

    long owed = convertedLiabilities(shown);
    if (owed > 0) {
      hero.addView(
          ui.money(
              "Owed " + Money.display(owed, shown),
              12,
              Ui.alpha(onHero, 0.72f),
              400),
          ui.top(ui.fill(), 10));
    }

    View rule = new View(this);
    rule.setBackgroundColor(Ui.alpha(onHero, 0.14f));
    hero.addView(rule, ui.top(new LinearLayout.LayoutParams(-1, dp(1)), 14));

    LinearLayout rateRow = ui.row();
    rateRow.setPadding(0, dp(10), 0, 0);
    rateRow.addView(ui.icon("horizontal-switch", 15, Ui.alpha(onHero, 0.76f)));
    rateRow.addView(
        ui.money("$1 = " + perDollarText(), 12, onHero, 600), ui.start(ui.wrap(), 6));
    rateRow.addView(
        ui.text("Today's rate", 12, Ui.alpha(onHero, 0.62f), 400),
        ui.start(ui.weight(1), 6));
    rateRow.addView(ui.icon("expand-right", 16, Ui.alpha(onHero, 0.76f)));
    hero.addView(ui.press(rateRow, 0.98f, () -> go(4)), ui.fill());
    return hero;
  }

  LinearLayout pocketTile(
      String label, int dotColorRes, long subtotal, String currency, int count, int pct) {
    int onHero = color(R.color.on_hero);
    LinearLayout tile = ui.column();
    tile.setPadding(dp(14), dp(12), dp(14), dp(12));
    tile.setBackground(
        ui.round(Ui.alpha(onHero, 0.08f), 16, Ui.alpha(onHero, 0.12f)));
    LinearLayout head = ui.row();
    View dot = new View(this);
    dot.setBackground(ui.round(color(dotColorRes), 999));
    head.addView(dot, new LinearLayout.LayoutParams(dp(7), dp(7)));
    head.addView(
        ui.text(label, 12, Ui.alpha(onHero, 0.72f), 500), ui.start(ui.wrap(), 6));
    tile.addView(head);
    TextView val = ui.money(Money.display(subtotal, currency), 18, onHero, 600);
    val.setAutoSizeTextTypeUniformWithConfiguration(13, 18, 1, TypedValue.COMPLEX_UNIT_SP);
    tile.addView(val, ui.top(new LinearLayout.LayoutParams(-1, dp(24)), 4));
    tile.addView(
        ui.text(
            count + (count == 1 ? " account, " : " accounts, ") + pct + "%",
            12,
            Ui.alpha(onHero, 0.60f),
            400),
        ui.top(ui.wrap(), 2));
    return ui.press(tile, 0.97f, () -> go(3));
  }

  static final class Habit {
    final String type;
    final String currency;
    final long minor;
    final String categoryId;
    final String note;

    Habit(String type, String currency, long minor, String categoryId, String note) {
      this.type = type;
      this.currency = currency;
      this.minor = minor;
      this.categoryId = categoryId;
      this.note = note;
    }
  }

  /** Mirrors `learnEntryHabits` in `src/lib/domain/entry-habits.ts`. */
  ArrayList<Habit> learnHabits() {
    LinkedHashMap<String, Integer> totals = new LinkedHashMap<>();
    LinkedHashMap<String, LinkedHashMap<String, Integer>> counts = new LinkedHashMap<>();
    LinkedHashMap<String, LinkedHashMap<String, Habit>> samples = new LinkedHashMap<>();
    int limit = Math.min(200, transactions.length());
    for (int i = 0; i < limit; i++) {
      JSONObject tx = transactions.optJSONObject(i);
      if (tx == null || isTransfer(tx)) continue;
      String type = tx.optString("type", "expense");
      String ccy = tx.optString("currency", "USD");
      long amt = Math.abs(tx.optLong("amount", 0L));
      if (amt <= 0) continue;
      String key = type + ":" + ccy + ":" + amt;
      totals.put(key, totals.getOrDefault(key, 0) + 1);
      String n = tx.isNull("notes") ? "" : tx.optString("notes", "").trim().replaceAll("\\s+", " ");
      String catId = tx.isNull("category_id") ? "" : tx.optString("category_id", "");
      if (n.isEmpty() || catId.isEmpty()) continue;
      String choiceKey = catId + "|" + n.toLowerCase(Locale.ROOT);
      LinkedHashMap<String, Integer> groupCounts =
          counts.computeIfAbsent(key, ignored -> new LinkedHashMap<>());
      groupCounts.put(choiceKey, groupCounts.getOrDefault(choiceKey, 0) + 1);
      samples
          .computeIfAbsent(key, ignored -> new LinkedHashMap<>())
          .putIfAbsent(choiceKey, new Habit(type, ccy, amt, catId, n));
    }
    ArrayList<Habit> result = new ArrayList<>();
    for (Map.Entry<String, Integer> entry : totals.entrySet()) {
      int groupTotal = entry.getValue();
      LinkedHashMap<String, Integer> groupCounts = counts.get(entry.getKey());
      LinkedHashMap<String, Habit> groupSamples = samples.get(entry.getKey());
      if (groupCounts == null || groupSamples == null) continue;
      for (Map.Entry<String, Integer> choice : groupCounts.entrySet()) {
        int c = choice.getValue();
        if (c >= 3 && c * 4 >= groupTotal * 3) {
          result.add(groupSamples.get(choice.getKey()));
          break;
        }
      }
    }
    return result;
  }

  /** AddAgainStrip: horizontal row of learned entry habits that prefill Add transaction. */
  LinearLayout addAgainStrip() {
    ArrayList<Habit> habits = learnHabits();
    if (habits.isEmpty()) return null;
    LinearLayout wrap = ui.column();
    LinearLayout head = ui.row();
    head.setPadding(dp(2), 0, dp(2), dp(8));
    head.addView(ui.text("Add again", 17, color(R.color.ink), 600));
    wrap.addView(head, ui.fill());

    HorizontalScrollView scroller = new HorizontalScrollView(this);
    scroller.setHorizontalScrollBarEnabled(false);
    LinearLayout row = ui.row();
    for (int i = 0; i < Math.min(5, habits.size()); i++) {
      Habit h = habits.get(i);
      JSONObject cat = null;
      try {
        cat = find(categories, h.categoryId);
      } catch (Exception ignored) {
      }
      int tint = ui.categoryColor(cat);
      LinearLayout chip = ui.row();
      chip.setPadding(dp(8), dp(7), dp(14), dp(7));
      chip.setBackground(
          ui.round(color(R.color.surface_raised), 999, color(R.color.surface_variant)));
      chip.addView(
          ui.tile(
              Ui.categoryIcon(cat),
              30,
              16,
              Ui.mix(tint, color(R.color.surface_raised), 0.16f),
              tint,
              0));
      LinearLayout textCol = ui.column();
      textCol.addView(ui.truncate(ui.text(h.note, 13, color(R.color.ink), 600)));
      textCol.addView(
          ui.money(Money.display(h.minor, h.currency), 12, color(R.color.muted), 400));
      chip.addView(textCol, ui.start(ui.wrap(), 8));
      ui.press(
          chip,
          0.97f,
          () -> {
            String rawAmt =
                h.currency.equals("KHR") && h.minor % 100 == 0
                    ? String.valueOf(h.minor / 100)
                    : Money.decimal(h.minor);
            String accId = null;
            for (int k = 0; k < accounts.length(); k++) {
              JSONObject a = accounts.optJSONObject(k);
              if (a != null
                  && a.optBoolean("is_active", true)
                  && h.currency.equals(a.optString("currency"))) {
                accId = a.optString("id");
                break;
              }
            }
            mode = "income".equals(h.type) ? 1 : 0;
            SharedPreferences.Editor ed =
                draft()
                    .edit()
                    .putString("amount", rawAmt)
                    .putString("note", h.note)
                    .putString("category_id", h.categoryId)
                    .putString("mode", MODES[mode])
                    .putString("date", LocalDate.now(CAMBODIA).toString());
            if (accId != null) ed.putString("account_id", accId);
            ed.apply();
            tab = 2;
            draw();
          });
      row.addView(chip, i == 0 ? ui.wrap() : ui.start(ui.wrap(), 8));
    }
    scroller.addView(row);
    wrap.addView(scroller, ui.fill());
    return wrap;
  }

  /** MonthStepper: compact or full pill with `< Month YYYY >`. */
  LinearLayout monthStepper() {
    return monthStepper(false);
  }

  LinearLayout monthStepper(boolean compact) {
    LinearLayout stepper = ui.row();
    stepper.setPadding(dp(4), dp(2), dp(4), dp(2));
    stepper.setBackground(
        ui.round(color(R.color.surface_raised), 999, color(R.color.surface_variant)));
    int btnSize = compact ? 32 : 36;
    LinearLayout previous = ui.tile("expand-left", btnSize, 16, 0, color(R.color.muted), 0);
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
        ui.text(month.format(MONTH_FORMAT), compact ? 13 : 14, color(R.color.ink), 600);
    label.setGravity(Gravity.CENTER);
    label.setPadding(dp(8), 0, dp(8), 0);
    stepper.addView(label, compact ? ui.wrap() : ui.weight(1));
    LinearLayout next = ui.tile("expand-right", btnSize, 16, 0, color(R.color.muted), 0);
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

  /**
   * MonthSpendingCard + DailySpendingChart: compact month stepper + "Day X of Y",
   * 3-column summary ("Spent", "Came in", "Left over"), conversion note, and daily
   * spending bar chart with today dot and typical-day line.
   */
  LinearLayout monthSpendingSection() throws Exception {
    LinearLayout section = ui.column();
    int totalDays = month.lengthOfMonth();
    LocalDate today = LocalDate.now(CAMBODIA);
    YearMonth currentYm = YearMonth.from(today);
    int elapsedDays =
        month.isAfter(currentYm)
            ? 0
            : month.isBefore(currentYm) ? totalDays : today.getDayOfMonth();

    LinearLayout head = ui.row();
    head.setPadding(dp(2), 0, dp(2), dp(8));
    head.addView(monthStepper(true));
    head.addView(new View(this), ui.weight(1));
    head.addView(
        ui.text("Day " + elapsedDays + " of " + totalDays, 12, color(R.color.muted), 400));
    section.addView(head, ui.fill());

    long[] flow = convertedFlow();
    long income = flow[0];
    long expense = -flow[1];
    long net = Money.add(income, flow[1]);

    LinearLayout card = ui.card();
    card.setPadding(dp(18), dp(18), dp(18), dp(18));

    LinearLayout figures = ui.row();
    figures.addView(monthFigCell("Spent", Money.display(expense, shown), color(R.color.ink)), ui.weight(1));
    figures.addView(
        monthFigCell("Came in", Money.display(income, shown), color(R.color.inflow)),
        ui.start(ui.weight(1), 10));
    String netStr = (net > 0 ? "+" : "") + Money.display(net, shown);
    int netColor =
        net == 0 ? color(R.color.ink) : color(net > 0 ? R.color.inflow : R.color.outflow);
    figures.addView(monthFigCell("Left over", netStr, netColor), ui.start(ui.weight(1), 10));
    card.addView(figures, ui.fill());

    card.addView(
        ui.text(
            "Converted to " + shown + ". Transfers left out.",
            12,
            color(R.color.muted),
            400),
        ui.top(ui.fill(), 10));

    card.addView(dailySpendingChart(totalDays, elapsedDays, today), ui.top(ui.fill(), 14));
    section.addView(card, ui.fill());
    return section;
  }

  LinearLayout monthFigCell(String label, String val, int color) {
    LinearLayout col = ui.column();
    col.addView(ui.text(label, 12, color(R.color.muted), 400));
    TextView v = ui.money(val, 20, color, 700);
    v.setAutoSizeTextTypeUniformWithConfiguration(12, 20, 1, TypedValue.COMPLEX_UNIT_SP);
    col.addView(v, ui.top(new LinearLayout.LayoutParams(-1, dp(26)), 2));
    return col;
  }

  View dailySpendingChart(int totalDays, int elapsedDays, LocalDate today) throws Exception {
    if (elapsedDays == 0) {
      TextView future =
          ui.text(
              "No spending recorded yet for " + month.format(MONTH_FORMAT) + ".",
              12,
              color(R.color.muted),
              400);
      future.setGravity(Gravity.CENTER);
      future.setPadding(0, dp(16), 0, dp(8));
      return future;
    }
    long[] daily = new long[totalDays + 1];
    for (int i = 0; i < transactions.length(); i++) {
      JSONObject t = transactions.getJSONObject(i);
      if (isTransfer(t) || !inMonth(t)) continue;
      long minor = Ledger.inCurrency(t, shown, app.usdKhr());
      if (minor >= 0) continue;
      int d = dayOf(t).getDayOfMonth();
      if (d >= 1 && d <= totalDays) daily[d] = Money.add(daily[d], -minor);
    }
    ArrayList<Long> nonZero = new ArrayList<>();
    long maxMinor = 0, secondMinor = 0;
    for (int d = 1; d <= elapsedDays; d++) {
      long m = daily[d];
      if (m > 0) nonZero.add(m);
      if (m > maxMinor) {
        secondMinor = maxMinor;
        maxMinor = m;
      } else if (m < maxMinor && m > secondMinor) {
        secondMinor = m;
      }
    }
    if (nonZero.isEmpty()) {
      TextView empty =
          ui.text(
              "Nothing spent in " + month.format(MONTH_FORMAT) + " yet.",
              12,
              color(R.color.muted),
              400);
      empty.setGravity(Gravity.CENTER);
      empty.setPadding(0, dp(16), 0, dp(8));
      return empty;
    }
    nonZero.sort(Long::compare);
    int mid = nonZero.size() / 2;
    long typicalMinor =
        nonZero.size() % 2 == 1
            ? nonZero.get(mid)
            : (nonZero.get(mid - 1) + nonZero.get(mid) + 1) / 2;
    boolean capped = secondMinor > 0 && maxMinor > secondMinor * 2;
    long chartMax = Math.max(1L, capped ? (secondMinor * 6 + 2) / 5 : maxMinor);

    LinearLayout chartWrap = ui.column();
    LinearLayout barsRow = ui.row();
    barsRow.setGravity(Gravity.BOTTOM);
    int barHeightPx = dp(64);
    for (int d = 1; d <= totalDays; d++) {
      boolean isFuture = d > elapsedDays;
      boolean isToday = month.equals(YearMonth.from(today)) && d == today.getDayOfMonth();
      long m = daily[d];
      float ratio = isFuture ? 0.04f : Math.min(1f, Math.max(0.06f, (float) m / chartMax));
      LinearLayout slot = ui.column();
      slot.setGravity(Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
      if (isToday) {
        View dot = new View(this);
        dot.setBackground(ui.round(color(R.color.brand), 999));
        LinearLayout.LayoutParams dotLp = new LinearLayout.LayoutParams(dp(4), dp(4));
        dotLp.bottomMargin = dp(3);
        slot.addView(dot, dotLp);
      }
      View bar = new View(this);
      int barColor =
          isToday
              ? color(R.color.brand)
              : isFuture
                  ? Ui.alpha(color(R.color.surface_variant), 0.55f)
                  : m == 0
                      ? color(R.color.surface_variant)
                      : Ui.alpha(color(R.color.brand), 0.58f);
      bar.setBackground(ui.round(barColor, 3));
      slot.addView(
          bar, new LinearLayout.LayoutParams(-1, Math.max(dp(3), Math.round(barHeightPx * ratio))));
      LinearLayout.LayoutParams slotLp = new LinearLayout.LayoutParams(0, barHeightPx + dp(10), 1);
      if (d > 1) slotLp.setMarginStart(dp(2));
      barsRow.addView(slot, slotLp);
    }
    chartWrap.addView(barsRow, ui.fill());
    if (typicalMinor > 0) {
      LinearLayout typRow = ui.row();
      typRow.setGravity(Gravity.END);
      TextView typ =
          ui.money(
              "typical " + Money.display(typicalMinor, shown),
              11,
              color(R.color.muted),
              500);
      typRow.addView(typ);
      chartWrap.addView(typRow, ui.top(ui.fill(), 4));
    }
    return chartWrap;
  }

  String homeDayLabel(LocalDate when) {
    LocalDate today = LocalDate.now(CAMBODIA);
    if (when.equals(today)) return "Today";
    if (when.equals(today.minusDays(1))) return "Yesterday";
    return when.format(WEEKDAY_FORMAT) + ", " + when.format(SHORT_DATE_FORMAT);
  }

  /** RecentActivityDays on Home: "Recent" + "All activity", day-grouped up to 6 entries. */
  LinearLayout recentActivitySection() throws Exception {
    LinearLayout section = ui.column();
    LinearLayout head = ui.row();
    head.setPadding(dp(2), 0, dp(2), dp(8));
    head.addView(ui.text("Recent", 17, color(R.color.ink), 600), ui.weight(1));
    head.addView(ui.link("All activity", color(R.color.brand), 14, () -> go(1)));
    section.addView(head, ui.fill());

    ArrayList<JSONObject> recent = new ArrayList<>();
    for (int i = 0; i < transactions.length() && recent.size() < 6; i++) {
      JSONObject t = transactions.getJSONObject(i);
      if (inMonth(t)) recent.add(t);
    }
    if (recent.isEmpty()) {
      LinearLayout card = ui.card();
      card.setPadding(dp(20), dp(8), dp(20), dp(20));
      card.addView(
          emptyState("paper", "A fresh start", "Your transactions will appear here."));
      section.addView(card, ui.fill());
      return section;
    }

    LinkedHashMap<LocalDate, ArrayList<JSONObject>> byDay = new LinkedHashMap<>();
    LinkedHashMap<LocalDate, Long> dayExpense = new LinkedHashMap<>();
    for (JSONObject row : recent) {
      LocalDate when = dayOf(row);
      byDay.computeIfAbsent(when, ignored -> new ArrayList<>()).add(row);
      if (!isTransfer(row)) {
        long minor = Ledger.inCurrency(row, shown, app.usdKhr());
        if (minor < 0) {
          dayExpense.put(when, Money.add(dayExpense.getOrDefault(when, 0L), -minor));
        }
      }
    }

    boolean firstDay = true;
    for (Map.Entry<LocalDate, ArrayList<JSONObject>> entry : byDay.entrySet()) {
      LocalDate when = entry.getKey();
      LinearLayout dayHead = ui.row();
      dayHead.setPadding(dp(2), firstDay ? 0 : dp(12), dp(2), dp(6));
      firstDay = false;
      dayHead.addView(
          ui.text(homeDayLabel(when), 13, color(R.color.muted), 600), ui.weight(1));
      long spent = dayExpense.getOrDefault(when, 0L);
      if (spent > 0) {
        dayHead.addView(
            ui.money(Money.display(spent, shown) + " spent", 13, color(R.color.muted), 500));
      }
      section.addView(dayHead, ui.fill());

      LinearLayout groupCard = ui.card();
      ArrayList<JSONObject> rows = entry.getValue();
      for (int i = 0; i < rows.size(); i++) {
        if (i > 0) groupCard.addView(ui.divider());
        groupCard.addView(homeTransactionRow(rows.get(i)), ui.fill());
      }
      section.addView(groupCard, ui.fill());
    }
    return section;
  }

  /** Home & Activity row matching `.tx-home-row` / `.tx-activity-row`. */
  LinearLayout homeTransactionRow(JSONObject row) throws Exception {
    boolean transfer = isTransfer(row);
    long minor = row.getLong("amount");
    String currency = row.getString("currency");
    JSONObject category = categoryOf(row);
    int tint = transfer ? color(R.color.chart_other) : ui.categoryColor(category);
    String iconName = transfer ? "horizontal-switch" : Ui.categoryIcon(category);

    LinearLayout line = ui.row();
    line.setPadding(dp(16), dp(12), dp(16), dp(12));
    line.addView(ui.rowIconTile(iconName, tint));

    LinearLayout middle = ui.column();
    middle.addView(ui.truncate(ui.text(title(row), 16, color(R.color.ink), 500)));
    String subText =
        route(row) + (row.optBoolean("_pending") ? " · Waiting to sync" : "");
    middle.addView(
        ui.truncate(ui.text(subText, 12, color(R.color.muted), 400)), ui.top(ui.wrap(), 2));
    line.addView(middle, ui.start(ui.weight(1), 12));

    LinearLayout right = ui.column();
    right.setGravity(Gravity.END);
    right.addView(rowAmountText(minor, currency, transfer, 16), ui.wrap());
    right.addView(ui.badge(currency), ui.top(ui.wrap(), 2));
    line.addView(right, ui.start(ui.wrap(), 12));
    return ui.press(line, 0.99f, () -> openEntry(row));
  }

  /**
   * Matches web `RecentActivityDays` and `TransactionRow`:
   * transfers are muted without sign, inflows are green with `+`, expenses are ink (`#000000`).
   */
  TextView rowAmountText(long minor, String currency, boolean transfer, float sp) {
    long shownMinor = transfer ? Math.abs(minor) : minor;
    String text = Money.display(shownMinor, currency);
    if (!transfer && minor > 0) text = "+" + text;
    int ink =
        transfer
            ? color(R.color.muted)
            : minor > 0 ? color(R.color.inflow) : color(R.color.ink);
    return ui.money(text, sp, ink, 600);
  }

  long spentForBudgetInMonth(JSONObject b) throws Exception {
    String bCurrency = b.optString("currency", "USD");
    String bCat = b.isNull("category_id") ? null : b.optString("category_id", null);
    long spent = 0;
    for (int i = 0; i < transactions.length(); i++) {
      JSONObject t = transactions.getJSONObject(i);
      if (isTransfer(t) || !inMonth(t)) continue;
      if (bCat != null && !bCat.equals(t.optString("category_id", ""))) continue;
      long val = Ledger.inCurrency(t, bCurrency, app.usdKhr());
      if (val < 0) spent = Money.add(spent, -val);
    }
    return spent;
  }

  /** BudgetSummaryCard on Home: top 3 active budgets with progress bar and pace caption. */
  LinearLayout budgetSummarySection() throws Exception {
    if (budgets.length() == 0) return null;
    LinearLayout section = ui.column();
    LinearLayout head = ui.row();
    head.setPadding(dp(2), 0, dp(2), dp(8));
    head.addView(ui.text("Budgets", 17, color(R.color.ink), 600), ui.weight(1));
    head.addView(ui.link("See all", color(R.color.brand), 14, () -> go(5)));
    section.addView(head, ui.fill());

    LinearLayout card = ui.card();
    int shownCount = Math.min(3, budgets.length());
    for (int i = 0; i < shownCount; i++) {
      if (i > 0) card.addView(ui.divider());
      card.addView(budgetProgressRow(budgets.getJSONObject(i)), ui.fill());
    }
    section.addView(card, ui.fill());
    return section;
  }

  LinearLayout budgetProgressRow(JSONObject b) throws Exception {
    JSONObject category = null;
    try {
      if (!b.isNull("category_id")) category = find(categories, b.getString("category_id"));
    } catch (Exception ignored) {
    }
    String name =
        b.isNull("name") || b.optString("name").isEmpty()
            ? (category == null ? "Everything" : categoryLabel(category))
            : b.optString("name");
    String bCurrency = b.optString("currency", "USD");
    long limit = Math.max(0L, b.optLong("amount", 0L));
    long spent = spentForBudgetInMonth(b);
    int pct = limit > 0 ? (int) Math.min(100L, Math.round((spent * 100.0) / limit)) : 0;
    boolean over = spent > limit;
    boolean warn = !over && limit > 0 && (spent * 100.0 / limit) >= 80.0;

    int tint = category != null ? ui.categoryColor(category) : color(R.color.brand);
    LinearLayout row = ui.column();
    row.setPadding(dp(18), dp(14), dp(18), dp(14));

    LinearLayout top = ui.row();
    top.addView(
        ui.rowIconTile(category == null ? "target" : Ui.categoryIcon(category), tint));
    top.addView(
        ui.truncate(ui.text(name, 16, color(R.color.ink), 600)),
        ui.start(ui.weight(1), 10));
    top.addView(
        ui.money(
            Money.display(spent, bCurrency) + " of " + Money.display(limit, bCurrency),
            13,
            color(R.color.muted),
            500));
    row.addView(top, ui.fill());

    LinearLayout bar = ui.row();
    bar.setBackground(ui.round(color(R.color.track), 999));
    bar.setClipToOutline(true);
    View fillView = new View(this);
    int fillColor =
        color(over ? R.color.outflow : warn ? R.color.warning : R.color.brand);
    fillView.setBackground(ui.round(fillColor, 999));
    bar.addView(fillView, new LinearLayout.LayoutParams(0, -1, Math.max(1, pct)));
    bar.addView(new View(this), new LinearLayout.LayoutParams(0, -1, Math.max(0, 100 - pct)));
    row.addView(bar, ui.top(new LinearLayout.LayoutParams(-1, dp(8)), 10));

    String paceText =
        over
            ? "Over by " + Money.display(spent - limit, bCurrency)
            : warn ? "Ahead of pace" : "On pace";
    row.addView(
        ui.text(paceText, 12, color(over ? R.color.outflow : R.color.muted), over ? 500 : 400),
        ui.top(ui.wrap(), 6));
    return row;
  }

  void home() throws Exception {
    add(twoPocketsHero());
    LinearLayout habits = addAgainStrip();
    if (habits != null) add(habits);
    add(monthSpendingSection());
    add(recentActivitySection());
    LinearLayout budgetCard = budgetSummarySection();
    if (budgetCard != null) add(budgetCard);
    add(breakdown());
  }

  boolean flowConverted;

  /** Month income and spending in the shown currency, converted like the web. Spending is negative. */
  long[] convertedFlow() throws Exception {
    long[] flow = new long[2];
    flowConverted = false;
    for (int i = 0; i < transactions.length(); i++) {
      JSONObject row = transactions.getJSONObject(i);
      if (isTransfer(row) || !inMonth(row)) continue;
      if (!shown.equals(row.getString("currency"))) flowConverted = true;
      long minor = Ledger.inCurrency(row, shown, app.usdKhr());
      if (minor >= 0) flow[0] = Money.add(flow[0], minor);
      else flow[1] = Money.add(flow[1], minor);
    }
    return flow;
  }

  /** Editing, deleting and restoring happen in the web app, which is the one source of truth. */
  void openEntry(JSONObject row) {
    if (row.optBoolean("_pending")) {
      error("This entry is still waiting to sync. You can edit it as soon as it has synced.");
      return;
    }
    String id = row.optString("id", "");
    if (!id.isEmpty()) openWeb("/transactions/" + id + "/edit");
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

  LinearLayout emptyState(String icon, String heading, String detail) {
    LinearLayout empty = ui.column();
    empty.setGravity(Gravity.CENTER_HORIZONTAL);
    empty.setPadding(0, dp(28), 0, dp(28));
    empty.addView(ui.tile(icon, 48, 22, color(R.color.brand_soft), color(R.color.brand), 0));
    empty.addView(ui.text(heading, 16, color(R.color.ink), 600), ui.top(ui.wrap(), 14));
    TextView text = ui.text(detail, 14, color(R.color.muted), 400);
    text.setGravity(Gravity.CENTER);
    empty.addView(text, ui.top(ui.wrap(), 4));
    return empty;
  }

  /** MoneyAmount with colorBySign and showPlus, which a transfer leg does not get. */
  TextView amountText(long minor, String currency, boolean transfer, float sp) {
    return rowAmountText(minor, currency, transfer, sp);
  }

  /** CategoryBreakdown: "Where it went" + "Open insights", colored dot, share %, and bar. */
  LinearLayout breakdown() throws Exception {
    LinkedHashMap<String, Long> totals = new LinkedHashMap<>();
    long all = 0;
    for (int i = 0; i < transactions.length(); i++) {
      JSONObject t = transactions.getJSONObject(i);
      if (isTransfer(t) || !inMonth(t)) continue;
      long minor = Ledger.inCurrency(t, shown, app.usdKhr());
      if (minor >= 0) continue;
      String key = t.isNull("category_id") ? "" : t.getString("category_id");
      totals.put(key, Money.add(totals.getOrDefault(key, 0L), -minor));
      all = Money.add(all, -minor);
    }
    ArrayList<Map.Entry<String, Long>> ranked = new ArrayList<>(totals.entrySet());
    ranked.sort((a, b) -> Long.compare(b.getValue(), a.getValue()));

    LinearLayout section = ui.column();
    LinearLayout head = ui.row();
    head.setPadding(dp(2), 0, dp(2), dp(8));
    head.addView(ui.text("Where it went", 17, color(R.color.ink), 600), ui.weight(1));
    head.addView(ui.link("Open insights", color(R.color.brand), 14, () -> openWeb("/reports")));
    section.addView(head, ui.fill());

    LinearLayout card = ui.card();
    LinearLayout list = ui.column();
    list.setPadding(dp(18), dp(18), dp(18), dp(18));
    if (ranked.isEmpty()) {
      TextView none = ui.text("Nothing spent yet.", 14, color(R.color.faint), 400);
      none.setGravity(Gravity.CENTER);
      none.setPadding(0, dp(16), 0, dp(16));
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
      int catColor = ui.categoryColor(category);
      LinearLayout entry = ui.column();
      LinearLayout top = ui.row();
      View dot = new View(this);
      dot.setBackground(ui.round(catColor, 999));
      top.addView(dot, new LinearLayout.LayoutParams(dp(8), dp(8)));
      top.addView(
          ui.truncate(ui.text(categoryLabel(category), 15, color(R.color.ink), 500)),
          ui.start(ui.wrap(), 8));
      top.addView(
          ui.text(percent + "%", 12, color(R.color.muted), 400),
          ui.start(ui.weight(1), 6));
      top.addView(ui.money(Money.display(spent, shown), 15, color(R.color.ink), 600));
      entry.addView(top, ui.fill());
      LinearLayout bar = ui.row();
      bar.setBackground(ui.round(color(R.color.track), 999));
      bar.setClipToOutline(true);
      View fillBar = new View(this);
      fillBar.setBackground(ui.round(catColor, 999));
      long widthPct = Math.min(100, Math.max(4, percent));
      bar.addView(fillBar, new LinearLayout.LayoutParams(0, -1, widthPct));
      bar.addView(new View(this), new LinearLayout.LayoutParams(0, -1, 100 - widthPct));
      entry.addView(bar, ui.top(new LinearLayout.LayoutParams(-1, dp(7)), 6));
      list.addView(entry, i == 0 ? ui.fill() : ui.top(ui.fill(), 14));
    }
    card.addView(list, ui.fill());
    section.addView(card, ui.fill());
    return section;
  }

  void activity() throws Exception {
    LinearLayout topBar = ui.row();
    topBar.addView(monthStepper(true));
    topBar.addView(new View(this), ui.weight(1));
    topBar.addView(currencyToggle());
    LinearLayout addBtn = ui.tile("add", 36, 18, color(R.color.brand), color(R.color.on_action), 0);
    addBtn.setBackground(ui.round(color(R.color.brand), 999));
    addBtn.setContentDescription("Add transaction");
    topBar.addView(
        ui.press(addBtn, 0.94f, () -> go(2)),
        ui.start(new LinearLayout.LayoutParams(dp(36), dp(36)), 8));
    add(topBar);

    LinearLayout filterCard = ui.card();
    filterCard.setPadding(dp(14), dp(14), dp(14), dp(14));

    LinearLayout searchBox = ui.row();
    searchBox.setPadding(dp(12), 0, dp(12), 0);
    searchBox.setBackground(ui.inputBackground());
    searchBox.addView(ui.icon("search", 16, color(R.color.faint)));
    EditText find = new EditText(this);
    find.setBackground(null);
    find.setHint("Search notes, categories, accounts...");
    find.setHintTextColor(color(R.color.faint));
    find.setTextColor(color(R.color.ink));
    find.setTextSize(14);
    find.setSingleLine(true);
    find.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
    find.setContentDescription("Search notes");
    find.setText(search);
    searchBox.addView(find, ui.start(new LinearLayout.LayoutParams(0, dp(42), 1), 8));
    filterCard.addView(searchBox, ui.fill());

    HorizontalScrollView filterScroll = new HorizontalScrollView(this);
    filterScroll.setHorizontalScrollBarEnabled(false);
    LinearLayout filterRow = ui.row();
    String[][] typeChips = {
      {"All", ""},
      {"Spending", "expense"},
      {"Income", "income"},
      {"Transfers", "transfer"}
    };
    for (int i = 0; i < typeChips.length; i++) {
      String label = typeChips[i][0];
      String val = typeChips[i][1];
      boolean on = val.equals(typeFilter);
      TextView pill = filterChip(label, on, () -> {
        typeFilter = val;
        draw();
      });
      filterRow.addView(pill, i == 0 ? ui.wrap() : ui.start(ui.wrap(), 6));
    }
    String catLabel = "Category";
    if (categoryFilter != null) {
      try {
        catLabel = categoryLabel(find(categories, categoryFilter));
      } catch (Exception ignored) {
      }
    }
    filterRow.addView(
        filterChip(catLabel, categoryFilter != null, this::pickCategoryFilterDialog),
        ui.start(ui.wrap(), 6));

    String accLabel = "Account";
    if (accountFilter != null) {
      try {
        accLabel = find(accounts, accountFilter).getString("name");
      } catch (Exception ignored) {
      }
    }
    filterRow.addView(
        filterChip(accLabel, accountFilter != null, this::pickAccountFilterDialog),
        ui.start(ui.wrap(), 6));

    if (!typeFilter.isEmpty() || categoryFilter != null || accountFilter != null) {
      TextView clearAll = ui.text("Show all", 12, color(R.color.brand), 600);
      clearAll.setGravity(Gravity.CENTER);
      clearAll.setMinHeight(dp(34));
      clearAll.setPadding(dp(10), 0, dp(10), 0);
      clearAll.setContentDescription("Show all");
      filterRow.addView(
          ui.press(
              clearAll,
              0.96f,
              () -> {
                typeFilter = "";
                categoryFilter = null;
                accountFilter = null;
                draw();
              }),
          ui.start(ui.wrap(), 6));
    }
    filterScroll.addView(filterRow);
    filterCard.addView(filterScroll, ui.top(ui.fill(), 10));
    add(filterCard);

    LinearLayout summary = ui.card();
    summary.setOrientation(LinearLayout.HORIZONTAL);
    summary.setPadding(dp(18), dp(14), dp(18), dp(14));
    add(summary);

    LinearLayout list = ui.column();
    add(list);

    Runnable refresh =
        () -> {
          summary.removeAllViews();
          try {
            long[] flow = monthFlow(search);
            int entryCount = (int) flow[2];
            summaryTextCell(summary, "Entries", String.valueOf(entryCount), R.color.ink);
            summaryCell(summary, "Spent", flow[1], R.color.ink);
            summaryCell(summary, "Came in", flow[0], R.color.inflow);
          } catch (Exception ignored) {
          }
        };
    find.addTextChangedListener(
        new TextWatcher() {
          public void beforeTextChanged(CharSequence s, int a, int b, int c) {}

          public void onTextChanged(CharSequence s, int a, int b, int c) {}

          public void afterTextChanged(Editable s) {
            search = s.toString();
            if (pendingSearch != null) timer.removeCallbacks(pendingSearch);
            pendingSearch =
                () -> {
                  pendingSearch = null;
                  refresh.run();
                  showActivity(list, search, 0);
                };
            timer.postDelayed(pendingSearch, 180);
          }
        });
    refresh.run();
    showActivity(list, search, 0);
  }

  TextView filterChip(String label, boolean on, Runnable action) {
    TextView t = ui.text(label, 13, color(on ? R.color.on_action : R.color.muted), on ? 600 : 500);
    t.setGravity(Gravity.CENTER);
    t.setMinHeight(dp(34));
    t.setPadding(dp(14), 0, dp(14), 0);
    t.setBackground(
        ui.round(
            color(on ? R.color.brand : R.color.fill),
            999));
    t.setContentDescription(label);
    return ui.press(t, 0.96f, action);
  }

  void pickCategoryFilterDialog() {
    ArrayList<String> names = new ArrayList<>();
    ArrayList<String> ids = new ArrayList<>();
    names.add("All categories");
    ids.add(null);
    for (int i = 0; i < categories.length(); i++) {
      JSONObject c = categories.optJSONObject(i);
      if (c != null) {
        names.add(categoryLabel(c));
        ids.add(c.optString("id"));
      }
    }
    new AlertDialog.Builder(this)
        .setTitle("Filter by category")
        .setItems(
            names.toArray(new String[0]),
            (d, which) -> {
              categoryFilter = ids.get(which);
              draw();
            })
        .show();
  }

  void pickAccountFilterDialog() {
    ArrayList<String> names = new ArrayList<>();
    ArrayList<String> ids = new ArrayList<>();
    names.add("All accounts");
    ids.add(null);
    for (int i = 0; i < accounts.length(); i++) {
      JSONObject a = accounts.optJSONObject(i);
      if (a != null) {
        names.add(a.optString("name"));
        ids.add(a.optString("id"));
      }
    }
    new AlertDialog.Builder(this)
        .setTitle("Filter by account")
        .setItems(
            names.toArray(new String[0]),
            (d, which) -> {
              accountFilter = ids.get(which);
              draw();
            })
        .show();
  }

  boolean matches(JSONObject row, String term) {
    if (!inMonth(row)) return false;
    if (accountFilter != null && !accountFilter.equals(row.optString("account_id"))) return false;
    if (categoryFilter != null && !categoryFilter.equals(row.optString("category_id"))) return false;
    if (!typeFilter.isEmpty() && !typeFilter.equals(row.optString("type"))) return false;
    String needle = term.toLowerCase(Locale.ROOT).trim();
    return needle.isEmpty()
        || title(row).toLowerCase(Locale.ROOT).contains(needle)
        || route(row).toLowerCase(Locale.ROOT).contains(needle)
        || row.optString("notes", "").toLowerCase(Locale.ROOT).contains(needle);
  }

  long[] monthFlow(String term) throws Exception {
    long[] flow = new long[3];
    for (int i = 0; i < transactions.length(); i++) {
      JSONObject row = transactions.getJSONObject(i);
      if (!matches(row, term)) continue;
      flow[2]++;
      if (isTransfer(row)) continue;
      long minor = Ledger.inCurrency(row, shown, app.usdKhr());
      if (minor >= 0) flow[0] = Money.add(flow[0], minor);
      else flow[1] = Money.add(flow[1], -minor);
    }
    return flow;
  }

  void summaryTextCell(LinearLayout parent, String label, String textVal, int ink) {
    LinearLayout cell = ui.column();
    TextView name = ui.text(label, 12, color(R.color.muted), 400);
    cell.addView(name, ui.fill());
    TextView value = ui.money(textVal, 18, color(ink), 700);
    value.setAutoSizeTextTypeUniformWithConfiguration(11, 18, 1, TypedValue.COMPLEX_UNIT_SP);
    cell.addView(value, ui.top(new LinearLayout.LayoutParams(-1, dp(24)), 2));
    parent.addView(cell, ui.weight(1));
  }

  void summaryCell(LinearLayout parent, String label, long minor, int ink) {
    summaryTextCell(parent, label, Money.display(minor, shown), ink);
  }

  /** TransactionHistory: day headings with their flow, then a card of that day's rows. */
  String showActivity(LinearLayout list, String term, int start) {
    list.removeAllViews();
    try {
      ArrayList<JSONObject> matched = new ArrayList<>();
      ArrayList<LocalDate> matchedDays = new ArrayList<>();
      HashMap<LocalDate, long[]> dayFlows = new HashMap<>();
      for (int i = 0; i < transactions.length(); i++) {
        JSONObject row = transactions.getJSONObject(i);
        if (matches(row, term)) {
          LocalDate when = dayOf(row);
          matched.add(row);
          matchedDays.add(when);
          if (!isTransfer(row)) {
            long minor = Ledger.inCurrency(row, shown, app.usdKhr());
            long[] flow = dayFlows.computeIfAbsent(when, ignored -> new long[2]);
            if (minor > 0) flow[0] = Money.add(flow[0], minor);
            else flow[1] = Money.add(flow[1], minor);
          }
        }
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
        LocalDate when = matchedDays.get(i);
        if (!when.equals(current)) {
          current = when;
          long[] flow = dayFlows.getOrDefault(when, new long[2]);
          list.addView(
              dayHeading(when, flow[0], flow[1]),
              list.getChildCount() == 0 ? ui.fill() : ui.top(ui.fill(), 18));
          LinearLayout card = ui.card();
          rows = ui.column();
          card.addView(rows, ui.fill());
          list.addView(card, ui.top(ui.fill(), 6));
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

  LinearLayout dayHeading(LocalDate when, long in, long out) {
    LinearLayout head = ui.row();
    head.setPadding(dp(2), 0, dp(2), 0);
    head.addView(ui.text(homeDayLabel(when), 13, color(R.color.muted), 600), ui.weight(1));
    if (out != 0) {
      head.addView(
          ui.money(Money.display(-out, shown) + " spent", 13, color(R.color.muted), 500));
    } else if (in != 0) {
      head.addView(
          ui.money("+" + Money.display(in, shown), 13, color(R.color.inflow), 500));
    }
    return head;
  }

  /** Activity row matching `.tx-activity-row`. */
  LinearLayout activityRow(JSONObject row) throws Exception {
    return homeTransactionRow(row);
  }

  void accounts() throws Exception {
    LinearLayout top = ui.row();
    top.addView(currencyToggle());
    top.addView(new View(this), ui.weight(1));
    LinearLayout addAcc =
        ui.button(
            "Add an account",
            "add",
            accounts.length() == 0 ? "primary" : "secondary",
            this::newAccount);
    top.addView(addAcc);
    add(top);

    String[][] pockets = {
      {"USD", "Dollars"},
      {"KHR", "Riel"}
    };
    boolean anyAccount = false;
    for (String[] pocket : pockets) {
      String ccy = pocket[0];
      String title = pocket[1];
      ArrayList<JSONObject> members = new ArrayList<>();
      long subtotal = 0;
      for (int i = 0; i < accounts.length(); i++) {
        JSONObject a = accounts.getJSONObject(i);
        if (ccy.equals(a.optString("currency"))) {
          members.add(a);
          if (a.optBoolean("is_active", true)) {
            subtotal = Money.add(subtotal, balance(a));
          }
        }
      }
      if (members.isEmpty()) continue;
      anyAccount = true;

      LinearLayout section = ui.column();
      LinearLayout head = ui.row();
      head.setPadding(dp(2), 0, dp(2), dp(8));
      View dot = new View(this);
      dot.setBackground(
          ui.round(color("USD".equals(ccy) ? R.color.usd : R.color.khr), 999));
      head.addView(dot, new LinearLayout.LayoutParams(dp(8), dp(8)));
      head.addView(
          ui.text(title, 17, color(R.color.ink), 600), ui.start(ui.wrap(), 8));
      head.addView(ui.badge(ccy), ui.start(ui.wrap(), 6));
      head.addView(new View(this), ui.weight(1));
      head.addView(ui.money(Money.display(subtotal, ccy), 16, color(R.color.ink), 600));
      section.addView(head, ui.fill());

      LinearLayout card = ui.card();
      for (int i = 0; i < members.size(); i++) {
        if (i > 0) card.addView(ui.divider());
        JSONObject a = members.get(i);
        int g =
            Math.max(
                0,
                java.util.Arrays.asList(ACCOUNT_TYPES).indexOf(a.optString("type", "bank")));
        boolean credit = "credit_card".equals(a.optString("type", "bank"));
        card.addView(accountRow(a, g, credit), ui.fill());
      }
      section.addView(card, ui.fill());
      add(section);
    }

    if (!anyAccount) {
      LinearLayout empty = ui.card();
      empty.addView(
          emptyState("wallet", "No accounts yet", "Add your first account to start tracking."),
          ui.fill());
      add(empty);
    } else {
      long totalCombined = convertedNetWorth(shown);
      TextView foot =
          ui.money(
              "Total ~ "
                  + Money.display(totalCombined, shown)
                  + " at $1 = "
                  + perDollarText(),
              13,
              color(R.color.muted),
              400);
      foot.setGravity(Gravity.CENTER);
      add(foot);
    }

    add(ui.button("Manage accounts", "setting-line", "outline", () -> openWeb("/accounts")));
  }

  LinearLayout accountRow(JSONObject a, int group, boolean credit) throws Exception {
    boolean active = a.optBoolean("is_active", true);
    String ccy = a.getString("currency");
    LinearLayout line = ui.row();
    line.setPadding(dp(16), dp(14), dp(16), dp(14));
    int tint =
        color(
            credit
                ? R.color.outflow
                : "USD".equals(ccy) ? R.color.usd : R.color.khr);
    line.addView(ui.rowIconTile(ACCOUNT_ICONS[group], tint));
    LinearLayout middle = ui.column();
    TextView name =
        ui.truncate(
            ui.text(
                a.getString("name"),
                16,
                color(active ? R.color.ink : R.color.faint),
                500));
    if (!active)
      name.setPaintFlags(name.getPaintFlags() | android.graphics.Paint.STRIKE_THRU_TEXT_FLAG);
    middle.addView(name);
    String detail =
        a.isNull("institution") || a.optString("institution").isEmpty()
            ? ACCOUNT_LABELS[group]
            : a.optString("institution") + " · " + ACCOUNT_LABELS[group];
    if (!active) detail += " · Archived";
    else if (!a.optBoolean("include_in_net_worth", true)) detail += " · Excluded";
    middle.addView(
        ui.truncate(ui.text(detail, 12, color(R.color.muted), 400)), ui.top(ui.wrap(), 2));
    line.addView(middle, ui.start(ui.weight(1), 12));
    LinearLayout right = ui.column();
    right.setGravity(Gravity.END);
    long minor = balance(a);
    int ink =
        credit && minor != 0
            ? color(minor < 0 ? R.color.outflow : R.color.inflow)
            : color(R.color.ink);
    right.addView(ui.money(Money.display(minor, ccy), 16, ink, 600), ui.wrap());
    if (!ccy.equals(shown)) {
      long conv = Money.convert(minor, ccy, shown, app.usdKhr());
      right.addView(
          ui.money("~ " + Money.display(conv, shown), 11, color(R.color.muted), 400),
          ui.top(ui.wrap(), 2));
    } else {
      right.addView(ui.badge(ccy), ui.top(ui.wrap(), 2));
    }
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

  /** A labelled field like the web's: muted label, then a filled rounded input. */
  EditText input(LinearLayout parent, String label, String hint, boolean numeric) {
    if (label != null) parent.addView(ui.text(label, 13, color(R.color.muted), 500), ui.fill());
    EditText e = new EditText(this);
    e.setSingleLine(true);
    e.setTextSize(14);
    e.setTextColor(color(R.color.ink));
    e.setHint(hint);
    e.setHintTextColor(color(R.color.faint));
    e.setContentDescription(label == null ? hint : label);
    e.setBackground(ui.inputBackground());
    e.setPadding(dp(14), 0, dp(14), 0);
    e.setInputType(
        numeric
            ? InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL
            : InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
    parent.addView(e, ui.top(new LinearLayout.LayoutParams(-1, dp(42)), label == null ? 0 : 6));
    return e;
  }

  /**
   * Spinner backed by choices, used both in dialogs and as the backing selection model
   * on the Add transaction screen.
   */
  Spinner picker(
      LinearLayout parent, String label, ArrayList<String> labels, ArrayList<String> details,
      ArrayList<String> icons) {
    if (label != null) parent.addView(ui.text(label, 13, color(R.color.muted), 500), ui.fill());
    Spinner s = new Spinner(this, Spinner.MODE_DROPDOWN);
    if (label != null) s.setContentDescription(label);
    s.setBackground(ui.inputBackground());
    s.setPopupBackgroundDrawable(
        ui.round(color(R.color.surface_raised), 16, color(R.color.surface_variant)));
    s.setAdapter(
        new ArrayAdapter<String>(this, 0, labels) {
          View choice(int position, boolean selected) {
            LinearLayout line = ui.row();
            line.setPadding(dp(12), dp(4), selected ? dp(8) : dp(16), dp(4));
            line.setMinimumHeight(dp(selected ? 42 : 48));
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
              line.addView(
                  ui.icon("expand-down", 15, color(R.color.brand)),
                  ui.start(new LinearLayout.LayoutParams(dp(15), dp(15)), 4));
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
    parent.addView(s, ui.top(new LinearLayout.LayoutParams(-1, dp(42)), label == null ? 0 : 6));
    return s;
  }

  /** A row of choice chips; the chosen one is brand on brand-soft, as on the web. */
  TextView chip(String label, boolean on, Runnable action) {
    TextView t = ui.text(label, 13, color(on ? R.color.brand : R.color.muted), on ? 600 : 500);
    t.setGravity(Gravity.CENTER);
    t.setMinHeight(dp(40));
    t.setPadding(dp(14), 0, dp(14), 0);
    t.setBackground(
        ui.round(
            color(on ? R.color.brand_soft : R.color.fill),
            999,
            on ? color(R.color.brand) : 0));
    t.setContentDescription(label);
    return ui.press(t, 0.97f, action);
  }

  /**
   * Ranks applicable categories by user frequency in `transactions`, tie-broken by `Ui.quickPriority`.
   */
  ArrayList<Integer> topCategoryOptionIndices(ArrayList<JSONObject> options, int limit) {
    HashMap<String, Integer> freq = new HashMap<>();
    for (int i = 0; i < transactions.length(); i++) {
      JSONObject tx = transactions.optJSONObject(i);
      if (tx == null || isTransfer(tx)) continue;
      String cid = tx.isNull("category_id") ? "" : tx.optString("category_id", "");
      if (!cid.isEmpty()) freq.put(cid, freq.getOrDefault(cid, 0) + 1);
    }
    ArrayList<Integer> indices = new ArrayList<>();
    for (int i = 1; i < options.size(); i++) indices.add(i);
    indices.sort(
        (a, b) -> {
          JSONObject ca = options.get(a);
          JSONObject cb = options.get(b);
          int fa = freq.getOrDefault(ca.optString("id"), 0);
          int fb = freq.getOrDefault(cb.optString("id"), 0);
          if (fa != fb) return Integer.compare(fb, fa);
          int pa = Ui.quickPriority(ca);
          int pb = Ui.quickPriority(cb);
          if (pa != pb) return Integer.compare(pa, pb);
          return categoryLabel(ca).compareToIgnoreCase(categoryLabel(cb));
        });
    if (indices.size() > limit) {
      return new ArrayList<>(indices.subList(0, limit));
    }
    return indices;
  }

  void showAccountPickerDialog(Spinner targetSpinner, ArrayList<JSONObject> active, String title) {
    LinearLayout rootCol = ui.column();
    rootCol.setPadding(dp(20), dp(12), dp(20), dp(8));
    EditText filterInput = input(rootCol, null, "Search accounts...", false);
    ScrollView scroller = new ScrollView(this);
    LinearLayout listCol = ui.column();
    scroller.addView(listCol);
    rootCol.addView(scroller, ui.top(new LinearLayout.LayoutParams(-1, dp(320)), 10));

    AlertDialog dialog =
        new AlertDialog.Builder(this)
            .setTitle(title)
            .setView(rootCol)
            .setNegativeButton("Cancel", null)
            .create();

    int currentSel = targetSpinner.getSelectedItemPosition();
    Runnable renderList =
        () -> {
          listCol.removeAllViews();
          String q = filterInput.getText().toString().toLowerCase(Locale.ROOT).trim();
          for (int i = 0; i < active.size(); i++) {
            JSONObject a = active.get(i);
            String accName = a.optString("name", "");
            String ccy = a.optString("currency", "USD");
            if (!q.isEmpty()
                && !accName.toLowerCase(Locale.ROOT).contains(q)
                && !ccy.toLowerCase(Locale.ROOT).contains(q)) continue;
            int idx = i;
            boolean sel = idx == currentSel;
            LinearLayout item = ui.row();
            item.setPadding(dp(12), dp(12), dp(12), dp(12));
            if (sel) item.setBackground(ui.round(color(R.color.brand_soft), 14));
            LinearLayout col = ui.column();
            col.addView(
                ui.truncate(
                    ui.text(
                        accName,
                        15,
                        color(sel ? R.color.brand : R.color.ink),
                        sel ? 600 : 500)));
            long bal = 0;
            try {
              bal = balance(a);
            } catch (Exception ignored) {
            }
            col.addView(
                ui.money(Money.display(bal, ccy), 12, color(R.color.muted), 400),
                ui.top(ui.wrap(), 2));
            item.addView(col, ui.weight(1));
            item.addView(ui.badge(ccy));
            listCol.addView(
                ui.press(
                    item,
                    0.98f,
                    () -> {
                      targetSpinner.setSelection(idx);
                      dialog.dismiss();
                    }),
                ui.fill());
          }
        };
    filterInput.addTextChangedListener(
        new TextWatcher() {
          public void beforeTextChanged(CharSequence s, int a, int b, int c) {}

          public void onTextChanged(CharSequence s, int a, int b, int c) {}

          public void afterTextChanged(Editable s) {
            renderList.run();
          }
        });
    renderList.run();
    dialog.show();
  }

  void showCategoryPickerDialog(Spinner catSpinner, ArrayList<JSONObject> options) {
    LinearLayout rootCol = ui.column();
    rootCol.setPadding(dp(20), dp(12), dp(20), dp(8));
    EditText filterInput = input(rootCol, null, "Search categories...", false);
    ScrollView scroller = new ScrollView(this);
    LinearLayout listCol = ui.column();
    scroller.addView(listCol);
    rootCol.addView(scroller, ui.top(new LinearLayout.LayoutParams(-1, dp(320)), 10));

    AlertDialog dialog =
        new AlertDialog.Builder(this)
            .setTitle("Choose category")
            .setView(rootCol)
            .setNegativeButton("Cancel", null)
            .create();

    int currentSel = catSpinner.getSelectedItemPosition();
    Runnable renderList =
        () -> {
          listCol.removeAllViews();
          String q = filterInput.getText().toString().toLowerCase(Locale.ROOT).trim();
          for (int i = 0; i < options.size(); i++) {
            JSONObject c = options.get(i);
            String label = c == null ? "No category" : categoryLabel(c);
            if (!q.isEmpty() && !label.toLowerCase(Locale.ROOT).contains(q)) continue;
            int idx = i;
            boolean sel = idx == currentSel;
            LinearLayout item = ui.row();
            item.setPadding(dp(12), dp(10), dp(12), dp(10));
            if (sel) item.setBackground(ui.round(color(R.color.brand_soft), 14));
            String iconName = c == null ? "widget" : Ui.categoryIcon(c);
            int tint = c == null ? color(R.color.muted) : ui.categoryColor(c);
            item.addView(ui.rowIconTile(iconName, tint));
            item.addView(
                ui.truncate(
                    ui.text(
                        label,
                        15,
                        color(sel ? R.color.brand : R.color.ink),
                        sel ? 600 : 500)),
                ui.start(ui.weight(1), 12));
            listCol.addView(
                ui.press(
                    item,
                    0.98f,
                    () -> {
                      catSpinner.setSelection(idx);
                      dialog.dismiss();
                    }),
                ui.fill());
          }
        };
    filterInput.addTextChangedListener(
        new TextWatcher() {
          public void beforeTextChanged(CharSequence s, int a, int b, int c) {}

          public void onTextChanged(CharSequence s, int a, int b, int c) {}

          public void afterTextChanged(Editable s) {
            renderList.run();
          }
        });
    renderList.run();
    dialog.show();
  }

  /**
   * Add transaction (`tab == 2`): 1:1 with `QuickAddForm` and `TransferForm`:
   * 1. Pill segmented control (`Expense`, `Income`, `Transfer`)
   * 2. Centered `AmountDisplay` (`$0.00` / `0៛`, inline `USD | KHR` pill switch, paste button,
   *    and `~ converted at 4,100៛` caption)
   * 3. Horizontal `From` / `Into` account chips (name + balance + `All` button)
   * 4. Horizontal `Category` chips (top 4 most-used categories + `All` button) or `To` account chips
   * 5. Single compact row: `Note (optional)` + compact date button (`Today` / `Yesterday` / date)
   * 6. Pill `AmountKeypad` (`R.color.fill` pills, including `000` when KHR) + full-width pill CTA
   */
  void entry() throws Exception {
    ArrayList<JSONObject> active = new ArrayList<>();
    ArrayList<String> names = new ArrayList<>(),
        currencies = new ArrayList<>(),
        kinds = new ArrayList<>();
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
      card.addView(ui.text("No accounts yet", 16, color(R.color.ink), 600));
      TextView why =
          ui.text(
              "A transaction has to come from somewhere. Add an account first.",
              14,
              color(R.color.muted),
              400);
      why.setGravity(Gravity.CENTER);
      card.addView(why, ui.top(ui.wrap(), 10));
      card.addView(
          ui.button("Add an account", null, "primary", this::newAccount), ui.top(ui.fill(), 14));
      add(card);
      return;
    }

    SharedPreferences saved = draft();
    boolean transfer = mode == 2;

    // 1. Segmented mode control (.seg-track + .seg-pill)
    LinearLayout modes = ui.row();
    modes.setPadding(dp(3), dp(3), dp(3), dp(3));
    modes.setBackground(ui.round(color(R.color.fill), 999));
    String[] modeLabels = {"Expense", "Income", "Transfer"};
    for (int i = 0; i < 3; i++) {
      boolean on = i == mode;
      TextView t =
          ui.text(
              modeLabels[i],
              13,
              color(on ? R.color.ink : R.color.muted),
              on ? 600 : 500);
      t.setGravity(Gravity.CENTER);
      t.setMinHeight(dp(34));
      t.setContentDescription(modeLabels[i]);
      if (on) {
        t.setBackground(ui.round(color(R.color.surface_raised), 999));
        t.setElevation(dp(1));
      }
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

    // Backing Spinners kept in view hierarchy (0dp height) so programmatic selection and tests work.
    LinearLayout hiddenSpinners = ui.column();
    account = picker(hiddenSpinners, transfer ? "From" : "Account", names, currencies, kinds);
    account.setTag(active);
    selectId(account, saved.getString("account_id", null));

    if (transfer) {
      destination = picker(hiddenSpinners, "To", names, currencies, kinds);
      destination.setTag(active);
      selectId(destination, saved.getString("destination_id", null));
      if (destination.getSelectedItemPosition() == account.getSelectedItemPosition()
          && active.size() > 1
          && saved.getString("destination_id", null) == null) {
        destination.setSelection(account.getSelectedItemPosition() == 0 ? 1 : 0);
      }
    }

    ArrayList<String> catLabels = new ArrayList<>(), catIcons = new ArrayList<>();
    ArrayList<JSONObject> catOptions = new ArrayList<>();
    if (!transfer) {
      catLabels.add("No category");
      catIcons.add("widget");
      catOptions.add(null);
      for (int i = 0; i < categories.length(); i++) {
        JSONObject c = categories.getJSONObject(i);
        JSONArray applies = c.optJSONArray("applies_to");
        boolean fits = applies == null;
        for (int k = 0; applies != null && k < applies.length(); k++) {
          fits |=
              applies.optString(k).equals(MODES[mode])
                  || (mode == 1 && applies.optString(k).equals("refund"));
        }
        if (!fits) continue;
        catLabels.add(categoryLabel(c));
        catIcons.add(Ui.categoryIcon(c));
        catOptions.add(c);
      }
      category = picker(hiddenSpinners, "Category", catLabels, null, catIcons);
      category.setTag(catOptions);
      selectId(category, saved.getString("category_id", null));
    }
    body.addView(hiddenSpinners, new LinearLayout.LayoutParams(0, 0));

    // 2. Centered AmountDisplay
    LinearLayout amountSection = ui.column();
    amountSection.setGravity(Gravity.CENTER_HORIZONTAL);
    amountSection.setPadding(dp(4), dp(8), dp(4), dp(4));

    FrameLayout amountFrame = new FrameLayout(this);
    LinearLayout centerCluster = ui.row();
    centerCluster.setGravity(Gravity.CENTER);

    int tone = color(mode == 1 ? R.color.inflow : R.color.ink);
    TextView prefix = ui.money("$", 42, tone, 700);
    centerCluster.addView(prefix);

    amount = new EditText(this);
    amount.setBackground(null);
    amount.setPadding(0, 0, 0, 0);
    amount.setTextSize(TypedValue.COMPLEX_UNIT_SP, 42);
    amount.setTypeface(Ui.font(700));
    amount.setFontFeatureSettings("tnum");
    amount.setLetterSpacing(-0.035f);
    amount.setTextColor(tone);
    amount.setHint("0.00");
    amount.setHintTextColor(color(R.color.faint));
    amount.setSingleLine(true);
    amount.setGravity(Gravity.CENTER);
    amount.setContentDescription("Amount");
    amount.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    amount.setShowSoftInputOnFocus(false);
    amount.setText(saved.getString("amount", ""));
    keypadTarget = amount;
    centerCluster.addView(amount, ui.wrap());

    TextView suffix = ui.money("៛", 42, tone, 700);
    centerCluster.addView(suffix);

    LinearLayout pills = ui.row();
    pills.setPadding(dp(2), dp(2), dp(2), dp(2));
    pills.setBackground(ui.round(color(R.color.fill), 999));
    centerCluster.addView(pills, ui.start(ui.wrap(), 10));

    FrameLayout.LayoutParams centerLp =
        new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER);
    amountFrame.addView(centerCluster, centerLp);

    LinearLayout pasteBtn =
        ui.tile("paste", 32, 16, color(R.color.fill), color(R.color.brand), 0);
    pasteBtn.setBackground(ui.round(color(R.color.fill), 999));
    pasteBtn.setContentDescription("Paste amount from clipboard");
    FrameLayout.LayoutParams pasteLp =
        new FrameLayout.LayoutParams(dp(32), dp(32), Gravity.END | Gravity.CENTER_VERTICAL);
    amountFrame.addView(
        ui.press(
            pasteBtn,
            0.94f,
            () -> {
              try {
                android.content.ClipboardManager cm =
                    (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (cm != null && cm.hasPrimaryClip() && cm.getPrimaryClip().getItemCount() > 0) {
                  CharSequence rawClip = cm.getPrimaryClip().getItemAt(0).getText();
                  if (rawClip != null) {
                    String cleaned = rawClip.toString().replaceAll("[^0-9.]", "");
                    if (!cleaned.isEmpty()) {
                      amount.setText(cleaned);
                      amount.setSelection(cleaned.length());
                    }
                  }
                }
              } catch (Exception ignored) {
              }
            }),
        pasteLp);

    amountSection.addView(amountFrame, ui.fill());

    TextView equivHint = ui.money("", 12, color(R.color.muted), 400);
    equivHint.setGravity(Gravity.CENTER);
    equivHint.setVisibility(View.GONE);
    amountSection.addView(equivHint, ui.top(ui.wrap(), 2));
    add(amountSection);

    // 3. Horizontal From / Into account chip strip
    LinearLayout fromRowWrap = ui.row();
    fromRowWrap.setGravity(Gravity.CENTER_VERTICAL);
    TextView fromLabel =
        ui.caps(mode == 1 ? "INTO" : "FROM", 11, color(R.color.muted), 0.04f);
    fromRowWrap.addView(fromLabel);
    HorizontalScrollView fromScroll = new HorizontalScrollView(this);
    fromScroll.setHorizontalScrollBarEnabled(false);
    LinearLayout fromChips = ui.row();
    fromScroll.addView(fromChips);
    fromRowWrap.addView(fromScroll, ui.start(ui.weight(1), 8));
    LinearLayout.LayoutParams fromLp = ui.fill();
    fromLp.topMargin = dp(10);
    body.addView(fromRowWrap, fromLp);

    // 4. Category chip strip (Expense/Income) OR To account chip strip (Transfer)
    LinearLayout secondRowWrap = ui.row();
    secondRowWrap.setGravity(Gravity.CENTER_VERTICAL);
    LinearLayout secondChips = ui.row();
    HorizontalScrollView secondScroll = new HorizontalScrollView(this);
    secondScroll.setHorizontalScrollBarEnabled(false);
    secondScroll.addView(secondChips);
    if (transfer) {
      TextView toLabel = ui.caps("TO", 11, color(R.color.muted), 0.04f);
      secondRowWrap.addView(toLabel);
      secondRowWrap.addView(secondScroll, ui.start(ui.weight(1), 8));
    } else {
      secondRowWrap.addView(secondScroll, ui.weight(1));
    }
    LinearLayout.LayoutParams secondLp = ui.fill();
    secondLp.topMargin = dp(8);
    body.addView(secondRowWrap, secondLp);

    // 5. Compact Note + Date row
    try {
      date = LocalDate.parse(saved.getString("date", LocalDate.now(CAMBODIA).toString()));
    } catch (Exception e) {
      date = LocalDate.now(CAMBODIA);
    }
    LinearLayout noteDateRow = ui.row();
    noteDateRow.setGravity(Gravity.CENTER_VERTICAL);
    note = new EditText(this);
    note.setSingleLine(true);
    note.setTextSize(14);
    note.setTextColor(color(R.color.ink));
    note.setHint("Note (optional)");
    note.setHintTextColor(color(R.color.faint));
    note.setContentDescription("Note");
    note.setBackground(ui.inputBackground());
    note.setPadding(dp(14), 0, dp(14), 0);
    note.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
    note.setText(saved.getString("note", ""));
    noteDateRow.addView(note, new LinearLayout.LayoutParams(0, dp(42), 1));

    LinearLayout datePill = ui.row();
    datePill.setGravity(Gravity.CENTER);
    datePill.setMinimumHeight(dp(42));
    datePill.setPadding(dp(12), 0, dp(12), 0);
    datePill.setBackground(ui.round(color(R.color.fill), 14));
    datePill.setContentDescription("Choose date");
    TextView dateBtnText = ui.text("", 13, color(R.color.ink), 500);
    datePill.addView(ui.icon("calendar", 15, color(R.color.muted)));
    datePill.addView(dateBtnText, ui.start(ui.wrap(), 6));
    Runnable updateDateText =
        () -> {
          LocalDate today = LocalDate.now(CAMBODIA);
          if (date.equals(today)) dateBtnText.setText("Today");
          else if (date.equals(today.minusDays(1))) dateBtnText.setText("Yesterday");
          else dateBtnText.setText(date.format(SHORT_DATE_FORMAT));
        };
    updateDateText.run();
    noteDateRow.addView(
        ui.press(
            datePill,
            0.96f,
            () ->
                new DatePickerDialog(
                        this,
                        (p, y, m, d) -> {
                          date = LocalDate.of(y, m + 1, d);
                          updateDateText.run();
                        },
                        date.getYear(),
                        date.getMonthValue() - 1,
                        date.getDayOfMonth())
                    .show()),
        ui.start(new LinearLayout.LayoutParams(-2, dp(42)), 8));

    if (transfer) {
      LinearLayout morePill = ui.row();
      morePill.setGravity(Gravity.CENTER);
      morePill.setMinimumHeight(dp(42));
      morePill.setPadding(dp(10), 0, dp(10), 0);
      morePill.setBackground(ui.round(color(R.color.fill), 14));
      morePill.setContentDescription("More options");
      morePill.addView(ui.icon("horizontal-switch", 15, color(R.color.ink)));
      noteDateRow.addView(
          ui.press(
              morePill,
              0.95f,
              () -> {
                int fromIdx = account.getSelectedItemPosition();
                int toIdx = destination.getSelectedItemPosition();
                account.setSelection(toIdx);
                destination.setSelection(fromIdx);
              }),
          ui.start(new LinearLayout.LayoutParams(-2, dp(42)), 6));
    }

    LinearLayout.LayoutParams noteDateLp = ui.fill();
    noteDateLp.topMargin = dp(8);
    body.addView(noteDateRow, noteDateLp);

    if (transfer) {
      LinearLayout receivedBox = ui.column();
      received = input(receivedBox, "Amount received", "0.00", true);
      received.setText(saved.getString("received", ""));
      received.setShowSoftInputOnFocus(false);
      received.setOnFocusChangeListener(
          (v, focused) -> {
            if (focused) keypadTarget = received;
          });
      amount.setOnFocusChangeListener(
          (v, focused) -> {
            if (focused) keypadTarget = amount;
          });
      TextView hint =
          ui.text(
              "The two accounts hold different currencies, so enter what arrived.",
              12,
              color(R.color.faint),
              400);
      receivedBox.addView(hint, ui.top(ui.fill(), 4));
      LinearLayout.LayoutParams recLp = ui.fill();
      recLp.topMargin = dp(8);
      body.addView(receivedBox, recLp);
    }

    // 6. Keypad + Save button
    LinearLayout keypadContainer = ui.column();
    LinearLayout.LayoutParams kpLp = ui.fill();
    kpLp.topMargin = dp(10);
    body.addView(keypadContainer, kpLp);

    LinearLayout saveBtn = ui.row();
    saveBtn.setGravity(Gravity.CENTER);
    saveBtn.setMinimumHeight(dp(48));
    saveBtn.setPadding(dp(20), dp(12), dp(20), dp(12));
    saveBtn.setContentDescription("Save " + MODES[mode]);
    TextView saveLabel = ui.text("Enter an amount", 15, color(R.color.on_action), 600);
    saveBtn.addView(saveLabel);
    ui.press(saveBtn, 0.98f, () -> save(active));
    LinearLayout.LayoutParams saveLp = ui.fill();
    saveLp.topMargin = dp(10);
    body.addView(saveBtn, saveLp);

    Runnable updateSaveAndConversion =
        () -> {
          String code =
              active
                  .get(Math.max(0, account.getSelectedItemPosition()))
                  .optString("currency", "USD");
          long parsed = 0;
          try {
            String raw = amount.getText().toString().trim();
            if (!raw.isEmpty()) parsed = Money.parse(raw);
          } catch (Exception ignored) {
          }
          if (parsed > 0) {
            saveBtn.setBackground(ui.round(color(R.color.brand), 999));
            String disp = Money.display(parsed, code);
            if (transfer) {
              saveLabel.setText("Move " + disp);
            } else {
              saveLabel.setText(
                  "Save " + MODES[mode] + ", " + disp);
            }
            String alt = other(code);
            long conv = Money.convert(parsed, code, alt, app.usdKhr());
            equivHint.setText(
                "~ " + Money.display(conv, alt) + " at " + perDollarText());
            equivHint.setVisibility(View.VISIBLE);
          } else {
            saveBtn.setBackground(ui.round(Ui.alpha(color(R.color.brand), 0.55f), 999));
            saveLabel.setText("Enter an amount");
            equivHint.setVisibility(View.GONE);
          }
        };

    amount.addTextChangedListener(
        new TextWatcher() {
          public void beforeTextChanged(CharSequence s, int a, int b, int c) {}

          public void onTextChanged(CharSequence s, int a, int b, int c) {}

          public void afterTextChanged(Editable s) {
            updateSaveAndConversion.run();
          }
        });

    Runnable renderFromChips =
        () -> {
          fromChips.removeAllViews();
          int selIdx = Math.max(0, account.getSelectedItemPosition());
          for (int i = 0; i < active.size(); i++) {
            JSONObject a = active.get(i);
            boolean on = i == selIdx;
            int idx = i;
            LinearLayout chip = ui.column();
            chip.setPadding(dp(12), dp(6), dp(12), dp(6));
            chip.setBackground(
                ui.round(
                    color(on ? R.color.brand_soft : R.color.fill),
                    14,
                    on ? color(R.color.brand) : 0));
            TextView n =
                ui.truncate(
                    ui.text(a.optString("name"), 13, color(R.color.ink), 600));
            n.setMaxWidth(dp(136));
            chip.addView(n);
            long bal = 0;
            try {
              bal = balance(a);
            } catch (Exception ignored) {
            }
            chip.addView(
                ui.money(
                    Money.display(bal, a.optString("currency", "USD")),
                    11,
                    color(on ? R.color.brand : R.color.muted),
                    500));
            ui.press(chip, 0.96f, () -> account.setSelection(idx));
            fromChips.addView(chip, i == 0 ? ui.wrap() : ui.start(ui.wrap(), 6));
          }
          if (active.size() > 3) {
            LinearLayout allBtn = ui.row();
            allBtn.setGravity(Gravity.CENTER);
            allBtn.setMinimumHeight(dp(40));
            allBtn.setPadding(dp(12), 0, dp(12), 0);
            allBtn.setBackground(ui.round(color(R.color.fill), 999));
            allBtn.addView(ui.text("All", 13, color(R.color.ink), 500));
            fromChips.addView(
                ui.press(
                    allBtn,
                    0.96f,
                    () ->
                        showAccountPickerDialog(
                            account, active, mode == 1 ? "Into account" : "From account")),
                ui.start(ui.wrap(), 6));
          }
        };

    Runnable renderSecondChips =
        () -> {
          secondChips.removeAllViews();
          if (transfer) {
            int selTo = Math.max(0, destination.getSelectedItemPosition());
            for (int i = 0; i < active.size(); i++) {
              JSONObject a = active.get(i);
              boolean on = i == selTo;
              int idx = i;
              LinearLayout chip = ui.column();
              chip.setPadding(dp(12), dp(6), dp(12), dp(6));
              chip.setBackground(
                  ui.round(
                      color(on ? R.color.brand_soft : R.color.fill),
                      14,
                      on ? color(R.color.brand) : 0));
              TextView n =
                  ui.truncate(
                      ui.text(a.optString("name"), 13, color(R.color.ink), 600));
              n.setMaxWidth(dp(136));
              chip.addView(n);
              long bal = 0;
              try {
                bal = balance(a);
              } catch (Exception ignored) {
              }
              chip.addView(
                  ui.money(
                      Money.display(bal, a.optString("currency", "USD")),
                      11,
                      color(on ? R.color.brand : R.color.muted),
                      500));
              ui.press(chip, 0.96f, () -> destination.setSelection(idx));
              secondChips.addView(chip, i == 0 ? ui.wrap() : ui.start(ui.wrap(), 6));
            }
            if (active.size() > 3) {
              LinearLayout allBtn = ui.row();
              allBtn.setGravity(Gravity.CENTER);
              allBtn.setMinimumHeight(dp(40));
              allBtn.setPadding(dp(12), 0, dp(12), 0);
              allBtn.setBackground(ui.round(color(R.color.fill), 999));
              allBtn.addView(ui.text("All", 13, color(R.color.ink), 500));
              secondChips.addView(
                  ui.press(
                      allBtn,
                      0.96f,
                      () -> showAccountPickerDialog(destination, active, "To account")),
                  ui.start(ui.wrap(), 6));
            }
          } else {
            ArrayList<Integer> topIdx = topCategoryOptionIndices(catOptions, 4);
            int selCat = Math.max(0, category.getSelectedItemPosition());
            if (selCat > 0 && !topIdx.contains(selCat)) {
              topIdx.add(0, selCat);
              if (topIdx.size() > 4) topIdx.remove(topIdx.size() - 1);
            }
            for (int k = 0; k < topIdx.size(); k++) {
              int optIdx = topIdx.get(k);
              JSONObject c = catOptions.get(optIdx);
              boolean on = optIdx == selCat;
              LinearLayout chip = ui.row();
              chip.setGravity(Gravity.CENTER_VERTICAL);
              chip.setMinimumHeight(dp(38));
              chip.setPadding(dp(12), dp(6), dp(12), dp(6));
              chip.setBackground(
                  ui.round(
                      color(on ? R.color.brand_soft : R.color.fill),
                      999,
                      on ? color(R.color.brand) : 0));
              chip.addView(
                  ui.icon(
                      Ui.categoryIcon(c),
                      15,
                      color(on ? R.color.brand : R.color.ink)));
              chip.addView(
                  ui.text(
                      categoryLabel(c),
                      13,
                      color(on ? R.color.brand : R.color.ink),
                      on ? 600 : 500),
                  ui.start(ui.wrap(), 6));
              ui.press(
                  chip,
                  0.96f,
                  () -> category.setSelection(on ? 0 : optIdx));
              secondChips.addView(chip, k == 0 ? ui.wrap() : ui.start(ui.wrap(), 6));
            }
            LinearLayout allCatBtn = ui.row();
            allCatBtn.setGravity(Gravity.CENTER_VERTICAL);
            allCatBtn.setMinimumHeight(dp(38));
            allCatBtn.setPadding(dp(12), dp(6), dp(12), dp(6));
            allCatBtn.setBackground(ui.round(color(R.color.fill), 999));
            allCatBtn.addView(ui.icon("widget", 15, color(R.color.ink)));
            allCatBtn.addView(
                ui.text("All", 13, color(R.color.ink), 500), ui.start(ui.wrap(), 6));
            secondChips.addView(
                ui.press(
                    allCatBtn,
                    0.96f,
                    () -> showCategoryPickerDialog(category, catOptions)),
                secondChips.getChildCount() == 0 ? ui.wrap() : ui.start(ui.wrap(), 6));
          }
        };

    String[] lastCurrency = {""};
    Runnable currencyChanged =
        () -> {
          String code =
              active
                  .get(Math.max(0, account.getSelectedItemPosition()))
                  .optString("currency", "USD");
          prefix.setVisibility(code.equals("USD") ? View.VISIBLE : View.GONE);
          suffix.setVisibility(code.equals("KHR") ? View.VISIBLE : View.GONE);
          amount.setHint(code.equals("KHR") ? "0" : "0.00");
          pills.removeAllViews();
          for (String c : new String[] {"USD", "KHR"}) {
            int target = currencies.indexOf(c);
            boolean on = c.equals(code);
            TextView pill =
                ui.text(c, 12, color(on ? R.color.ink : R.color.muted), on ? 600 : 500);
            pill.setGravity(Gravity.CENTER);
            pill.setMinHeight(dp(28));
            pill.setPadding(dp(10), 0, dp(10), 0);
            if (on) {
              pill.setBackground(ui.round(color(R.color.surface_raised), 999));
              pill.setElevation(dp(1));
            }
            pill.setContentDescription("Use " + c);
            if (target < 0) pill.setAlpha(0.35f);
            else ui.press(pill, 0.95f, () -> account.setSelection(target));
            pills.addView(pill, pills.getChildCount() == 0 ? ui.wrap() : ui.start(ui.wrap(), 2));
          }
          if (!code.equals(lastCurrency[0])) {
            lastCurrency[0] = code;
            keypadContainer.removeAllViews();
            keypadContainer.addView(keypad(code), ui.fill());
          }
          renderFromChips.run();
          updateSaveAndConversion.run();
        };

    account.setOnItemSelectedListener(
        new AdapterView.OnItemSelectedListener() {
          public void onNothingSelected(AdapterView<?> p) {}

          public void onItemSelected(AdapterView<?> p, View v, int n, long id) {
            currencyChanged.run();
            if (destination != null) transferCurrencies();
          }
        });
    if (destination != null) {
      destination.setOnItemSelectedListener(
          new AdapterView.OnItemSelectedListener() {
            public void onNothingSelected(AdapterView<?> p) {}

            public void onItemSelected(AdapterView<?> p, View v, int n, long id) {
              renderSecondChips.run();
              transferCurrencies();
            }
          });
    }
    if (category != null) {
      category.setOnItemSelectedListener(
          new AdapterView.OnItemSelectedListener() {
            public void onNothingSelected(AdapterView<?> p) {}

            public void onItemSelected(AdapterView<?> p, View v, int n, long id) {
              renderSecondChips.run();
            }
          });
    }

    currencyChanged.run();
    renderSecondChips.run();
    if (transfer) transferCurrencies();
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

  /** AmountKeypad: pill buttons in `R.color.fill` matching `.keypad-btn`. */
  LinearLayout keypad() {
    return keypad("USD");
  }

  LinearLayout keypad(String currency) {
    LinearLayout grid = ui.column();
    String bottomLeft = "KHR".equals(currency) ? "000" : ".";
    String[] keys = {"1", "2", "3", "4", "5", "6", "7", "8", "9", bottomLeft, "0", "del"};
    LinearLayout line = null;
    for (int i = 0; i < keys.length; i++) {
      if (i % 3 == 0) {
        line = ui.row();
        grid.addView(line, i == 0 ? ui.fill() : ui.top(ui.fill(), 8));
      }
      String key = keys[i];
      LinearLayout cell = ui.row();
      cell.setGravity(Gravity.CENTER);
      if (!key.equals("del")) {
        cell.setBackground(ui.round(color(R.color.fill), 999));
      }
      cell.setContentDescription(key.equals("del") ? "Delete last digit" : "Key " + key);
      if (key.equals("del")) cell.addView(ui.icon("back", 20, color(R.color.ink)));
      else cell.addView(ui.money(key, "000".equals(key) ? 18 : 22, color(R.color.ink), 500));
      ui.press(cell, 0.92f, () -> press(key));
      line.addView(
          cell,
          i % 3 == 0
              ? new LinearLayout.LayoutParams(0, dp(48), 1)
              : ui.start(new LinearLayout.LayoutParams(0, dp(48), 1), 8));
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
    } else if (key.equals("000")) {
      if (!value.isEmpty() && !value.equals("0") && value.length() <= 12) {
        value = value + "000";
      }
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

  /** One row of the Settings list: rounded 38dp icon tile, title, subtitle, chevron. */
  LinearLayout moreRow(String icon, String title, String detail, boolean danger, Runnable action) {
    LinearLayout line = ui.row();
    line.setPadding(dp(16), dp(14), dp(16), dp(14));
    int tint = color(danger ? R.color.outflow : R.color.brand);
    line.addView(ui.rowIconTile(icon, tint));
    LinearLayout words = ui.column();
    words.addView(ui.text(title, 16, color(danger ? R.color.outflow : R.color.ink), 500));
    if (detail != null && !detail.isEmpty()) {
      words.addView(ui.text(detail, 12, color(R.color.muted), 400), ui.top(ui.wrap(), 2));
    }
    line.addView(words, ui.start(ui.weight(1), 12));
    line.addView(ui.icon("expand-right", 18, color(R.color.faint)));
    line.setContentDescription(title);
    return ui.press(line, 0.99f, action);
  }

  void more() throws Exception {
    int pending = app.store.pendingCount();

    // Preferences group: display currency + exchange rate + sync now
    LinearLayout prefSection = ui.column();
    TextView prefHead = ui.text("Preferences", 13, color(R.color.muted), 600);
    prefHead.setPadding(dp(2), 0, dp(2), dp(6));
    prefSection.addView(prefHead, ui.fill());
    LinearLayout prefCard = ui.card();

    LinearLayout ccyRow = ui.row();
    ccyRow.setPadding(dp(16), dp(14), dp(16), dp(14));
    ccyRow.addView(ui.rowIconTile("dollar", color(R.color.brand)));
    LinearLayout ccyWords = ui.column();
    ccyWords.addView(ui.text("Display currency", 16, color(R.color.ink), 500));
    ccyWords.addView(
        ui.text("Totals and charts convert to " + shown, 12, color(R.color.muted), 400),
        ui.top(ui.wrap(), 2));
    ccyRow.addView(ccyWords, ui.start(ui.weight(1), 12));
    ccyRow.addView(currencyToggle());
    prefCard.addView(ccyRow, ui.fill());
    prefCard.addView(ui.divider());

    prefCard.addView(
        moreRow(
            "horizontal-switch",
            "Exchange rate",
            "$1 = " + perDollarText() + " · Tap to change in Settings",
            false,
            () -> openWeb("/settings")),
        ui.fill());
    prefCard.addView(ui.divider());

    prefCard.addView(
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
    prefSection.addView(prefCard, ui.fill());
    add(prefSection);

    // Navigation & Web tools group
    LinearLayout navSection = ui.column();
    TextView navHead = ui.text("More tools", 13, color(R.color.muted), 600);
    navHead.setPadding(dp(2), 0, dp(2), dp(6));
    navSection.addView(navHead, ui.fill());
    LinearLayout list = ui.card();
    if (app.reauth) {
      list.addView(
          moreRow(
              "key",
              "Sign in again",
              "Your sign-in expired. Entries stay on this phone until you do.",
              false,
              this::login),
          ui.fill());
      list.addView(ui.divider());
    }
    list.addView(
        moreRow("target", "Budgets", "Stay on top of your monthly limits", false, () -> go(5)),
        ui.fill());
    list.addView(ui.divider());
    list.addView(
        moreRow("wallet", "Accounts", "Every account in Dollars and Riel", false, () -> go(3)),
        ui.fill());
    String[][] webAreas = {
      {"colum-up", "Insights & reports", "Spending, trends and the overall report", "/reports"},
      {"calendar", "Calendar and filters", "Calendar view, filters and recently deleted", "/transactions"},
      {"target", "Manage budgets", "Create and change budgets", "/budgets"},
      {"wallet", "Manage accounts", "Add, edit and archive accounts", "/accounts"},
      {"setting-line", "Web settings", "Currency, exchange rate and Telegram", "/settings"},
      {"layers", "Full web app", "Open every screen of the website", "/"}
    };
    for (String[] area : webAreas) {
      list.addView(ui.divider());
      list.addView(moreRow(area[0], area[1], area[2], false, () -> openWeb(area[3])), ui.fill());
    }
    navSection.addView(list, ui.fill());
    add(navSection);

    if (pending > 0) {
      LinearLayout pendSection = ui.column();
      TextView head = ui.text("Waiting to sync", 13, color(R.color.muted), 600);
      head.setPadding(dp(2), 0, dp(2), dp(6));
      pendSection.addView(head, ui.fill());
      LinearLayout queued = ui.card();
      boolean first = true;
      for (JSONObject item : app.store.pending()) {
        if (!first) queued.addView(ui.divider());
        first = false;
        LinearLayout line = ui.row();
        line.setPadding(dp(16), dp(14), dp(16), dp(14));
        boolean failed = !item.optString("error").isEmpty();
        line.addView(
            ui.rowIconTile(
                failed ? "critical" : "load-circle",
                color(failed ? R.color.outflow : R.color.muted)));
        LinearLayout words = ui.column();
        String table = item.getJSONObject("operation").getString("table");
        words.addView(
            ui.text(table.equals("accounts") ? "New account" : "New entry", 15, color(R.color.ink), 500));
        words.addView(
            ui.text(
                failed
                    ? item.getString("error")
                    : app.reauth
                        ? "Waiting for you to sign in again"
                        : app.blocked
                            ? "Waiting for an app update"
                            : app.status.equals(LuyApplication.OFFLINE)
                                ? "Waiting for a connection"
                                : "Waiting to sync",
                12,
                color(R.color.faint),
                400),
            ui.top(ui.wrap(), 2));
        line.addView(words, ui.start(ui.weight(1), 12));
        queued.addView(line, ui.fill());
      }
      pendSection.addView(queued, ui.fill());
      add(pendSection);
    }

    LinearLayout telegram = ui.card();
    telegram.setPadding(dp(18), dp(18), dp(18), dp(18));
    LinearLayout tgTop = ui.row();
    tgTop.addView(ui.rowIconTile("send", color(R.color.brand)));
    LinearLayout tgWords = ui.column();
    tgWords.addView(ui.text("Telegram bot", 16, color(R.color.ink), 600));
    tgWords.addView(
        ui.text(
            "Connect @LuyManagerBot to log spending from a chat message.",
            13,
            color(R.color.muted),
            400),
        ui.top(ui.wrap(), 2));
    tgTop.addView(tgWords, ui.start(ui.weight(1), 12));
    telegram.addView(tgTop, ui.fill());
    telegram.addView(
        ui.button("Connect Telegram", null, "secondary", () -> openWeb("/settings")),
        ui.top(ui.fill(), 14));
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
    if (app.cloud == null || !app.cloud.signedIn()) {
      error("Sign in first.");
      return;
    }
    try {
      startActivity(new Intent(this, WebActivity.class).putExtra(WebActivity.PATH, path));
    } catch (Exception e) {
      error("Could not open the web app");
    }
  }

  void budgetList() throws Exception {
    LinearLayout topBar = ui.row();
    topBar.addView(monthStepper(true));
    topBar.addView(new View(this), ui.weight(1));
    topBar.addView(currencyToggle());
    add(topBar);

    add(ui.button("Manage budgets", "target", "outline", () -> openWeb("/budgets")));

    if (budgets.length() == 0) {
      LinearLayout empty = ui.card();
      empty.addView(
          emptyState("target", "No budgets yet", "Tap Manage budgets to set your first monthly limit."),
          ui.fill());
      add(empty);
      return;
    }

    long totalLimitShown = 0;
    long totalSpentShown = 0;
    for (int i = 0; i < budgets.length(); i++) {
      JSONObject b = budgets.getJSONObject(i);
      String bCurrency = b.optString("currency", "USD");
      long limit = Math.max(0L, b.optLong("amount", 0L));
      long spent = spentForBudgetInMonth(b);
      totalLimitShown =
          Money.add(totalLimitShown, Money.convert(limit, bCurrency, shown, app.usdKhr()));
      totalSpentShown =
          Money.add(totalSpentShown, Money.convert(spent, bCurrency, shown, app.usdKhr()));
    }
    int overallPct =
        totalLimitShown > 0
            ? (int) Math.min(999L, Math.round((totalSpentShown * 100.0) / totalLimitShown))
            : 0;
    boolean overallOver = totalSpentShown > totalLimitShown;

    LinearLayout summaryCard = ui.card();
    summaryCard.setPadding(dp(18), dp(18), dp(18), dp(18));
    LinearLayout sumRow = ui.row();
    LinearLayout pctBadge = ui.column();
    pctBadge.setGravity(Gravity.CENTER);
    pctBadge.setBackground(
        ui.round(
            color(overallOver ? R.color.outflow_soft : R.color.brand_soft),
            999,
            color(overallOver ? R.color.outflow : R.color.brand)));
    pctBadge.addView(
        ui.money(
            overallPct + "%",
            16,
            color(overallOver ? R.color.outflow : R.color.brand),
            700));
    sumRow.addView(pctBadge, new LinearLayout.LayoutParams(dp(64), dp(64)));

    LinearLayout sumWords = ui.column();
    sumWords.addView(ui.text("Total budgeted", 12, color(R.color.muted), 500));
    sumWords.addView(
        ui.money(
            Money.display(totalSpentShown, shown) + " of " + Money.display(totalLimitShown, shown),
            18,
            color(R.color.ink),
            700),
        ui.top(ui.wrap(), 2));
    String verdict =
        overallOver
            ? "Over by " + Money.display(totalSpentShown - totalLimitShown, shown)
            : Money.display(totalLimitShown - totalSpentShown, shown) + " left this month";
    sumWords.addView(
        ui.text(
            verdict,
            13,
            color(overallOver ? R.color.outflow : R.color.muted),
            overallOver ? 600 : 400),
        ui.top(ui.wrap(), 2));
    sumRow.addView(sumWords, ui.start(ui.weight(1), 14));
    summaryCard.addView(sumRow, ui.fill());
    add(summaryCard);

    LinearLayout card = ui.card();
    for (int i = 0; i < budgets.length(); i++) {
      if (i > 0) card.addView(ui.divider());
      card.addView(budgetProgressRow(budgets.getJSONObject(i)), ui.fill());
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
                                  WebActivity.clearWebData(getApplicationContext());
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
