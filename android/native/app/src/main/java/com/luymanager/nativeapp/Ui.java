package com.luymanager.nativeapp;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.HashMap;
import java.util.Locale;
import org.json.JSONObject;

/**
 * Builds Android views that follow the web app's design tokens and components, so a
 * screen here reads the same as its counterpart in src/components.
 */
final class Ui {
  final Context context;

  Ui(Context context) {
    this.context = context;
  }

  int dp(float value) {
    return Math.round(value * context.getResources().getDisplayMetrics().density);
  }

  /**
   * Left, top, right and bottom padding that keeps content clear of the system bars, the camera
   * cutout and the keyboard. Since targetSdk 35 the window is always edge to edge and
   * `adjustResize` no longer shrinks it, so the keyboard must be padded for by hand.
   */
  static int[] safeInsets(android.view.WindowInsets insets) {
    if (android.os.Build.VERSION.SDK_INT >= 30) {
      int types =
          android.view.WindowInsets.Type.systemBars()
              | android.view.WindowInsets.Type.displayCutout();
      android.graphics.Insets bars = insets.getInsets(types);
      int ime = insets.getInsets(android.view.WindowInsets.Type.ime()).bottom;
      return new int[] {bars.left, bars.top, bars.right, Math.max(bars.bottom, ime)};
    }
    return new int[] {
      insets.getSystemWindowInsetLeft(),
      insets.getSystemWindowInsetTop(),
      insets.getSystemWindowInsetRight(),
      insets.getSystemWindowInsetBottom()
    };
  }

  int color(int id) {
    return context.getColor(id);
  }

  static int alpha(int color, float alpha) {
    return (Math.round(alpha * 255) << 24) | (color & 0xffffff);
  }

  /** Blend `fg` into `bg` by `ratio` (0..1), matching CSS `color-mix(in srgb, fg P%, bg)`. */
  static int mix(int fg, int bg, float ratio) {
    float inv = 1f - ratio;
    int r = Math.round(((fg >> 16) & 0xff) * ratio + ((bg >> 16) & 0xff) * inv);
    int g = Math.round(((fg >> 8) & 0xff) * ratio + ((bg >> 8) & 0xff) * inv);
    int b = Math.round((fg & 0xff) * ratio + (bg & 0xff) * inv);
    return 0xff000000 | (r << 16) | (g << 8) | b;
  }

  GradientDrawable round(int fill, float radius) {
    return round(fill, radius, 0);
  }

  /** A rounded fill with an optional 1dp hairline, like `rounded-* border bg-*`. */
  GradientDrawable round(int fill, float radius, int stroke) {
    GradientDrawable bg = new GradientDrawable();
    bg.setColor(fill);
    bg.setCornerRadius(dp(radius));
    if (stroke != 0) bg.setStroke(dp(1), stroke);
    return bg;
  }

  /**
   * The raised keycap from `.key-btn` and `.add-save-btn`: a hard contact edge underneath, a
   * thick side wall, a lit top face and a dished centre. CSS draws the contact edge as an outer
   * box-shadow that takes no layout space; a View cannot paint outside its bounds, so the edge
   * lives inside the bottom `depth` dp of the view instead and callers pad content by it.
   *
   * <p>Pressed, the cap travels down until only a 1dp edge remains, exactly as the web's
   * `translate: 0 4px` plus shrunken shadow does, so the key's footprint never moves.
   */
  android.graphics.drawable.StateListDrawable keycap(
      int face, int side, int line, int hi, int depth, int wall, int dishSide) {
    android.graphics.drawable.StateListDrawable states =
        new android.graphics.drawable.StateListDrawable();
    states.addState(
        new int[] {android.R.attr.state_pressed},
        keycapLayers(face, side, line, hi, depth, depth - 1, 2, dishSide));
    states.addState(new int[] {}, keycapLayers(face, side, line, hi, depth, 0, wall, dishSide));
    states.setExitFadeDuration(90);
    return states;
  }

  private android.graphics.drawable.LayerDrawable keycapLayers(
      int face, int side, int line, int hi, int depth, int travel, int wall, int dishSide) {
    int stroke = Math.max(1, Math.round(1.5f * context.getResources().getDisplayMetrics().density));
    float radius = dp(999);
    GradientDrawable contact = new GradientDrawable();
    contact.setColor(line);
    contact.setCornerRadius(radius);
    GradientDrawable body = new GradientDrawable();
    body.setColor(side);
    body.setCornerRadius(radius);
    body.setStroke(stroke, line);
    GradientDrawable top =
        new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] {hi, face});
    top.setCornerRadius(radius);
    GradientDrawable dish =
        new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] {face, hi});
    dish.setCornerRadius(radius);
    android.graphics.drawable.LayerDrawable layers =
        new android.graphics.drawable.LayerDrawable(
            new android.graphics.drawable.Drawable[] {contact, body, top, dish});
    int t = dp(travel), d = dp(depth);
    layers.setLayerInset(0, 0, t + dp(6), 0, 0);
    layers.setLayerInset(1, 0, t, 0, d - t);
    layers.setLayerInset(2, stroke, t + stroke, stroke, d - t + dp(wall));
    layers.setLayerInset(3, dp(dishSide), t + dp(5), dp(dishSide), d - t + dp(11));
    return layers;
  }

  /**
   * Press feedback for a keycap: the content rides down with the cap instead of the whole view
   * scaling, which is what `.key-btn:active` does. Reduced motion is honoured by the system
   * animator scale, so no separate branch is needed.
   */
  <T extends ViewGroup> T keycapPress(T view, int travel, Runnable action) {
    view.setClickable(true);
    view.setFocusable(true);
    view.setHapticFeedbackEnabled(true);
    view.setOnTouchListener(
        (v, event) -> {
          int act = event.getActionMasked();
          float to =
              act == android.view.MotionEvent.ACTION_DOWN
                  ? dp(travel)
                  : act == android.view.MotionEvent.ACTION_UP
                          || act == android.view.MotionEvent.ACTION_CANCEL
                      ? 0
                      : -1;
          if (to >= 0) {
            ViewGroup group = (ViewGroup) v;
            for (int i = 0; i < group.getChildCount(); i++)
              group.getChildAt(i).animate().translationY(to).setDuration(to > 0 ? 0 : 90).start();
          }
          return false;
        });
    view.setOnClickListener(
        v -> {
          v.performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP);
          action.run();
        });
    return view;
  }

  private static final android.util.SparseArray<Typeface> FONTS = new android.util.SparseArray<>();

  static Typeface font(int weight) {
    Typeface cached = FONTS.get(weight);
    if (cached != null) return cached;
    Typeface created = Typeface.create(Typeface.SANS_SERIF, weight, false);
    FONTS.put(weight, created);
    return created;
  }

  TextView text(String value, float sp, int color, int weight) {
    TextView t = new TextView(context);
    t.setText(value);
    t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
    t.setTextColor(color);
    t.setTypeface(font(weight));
    t.setIncludeFontPadding(false);
    t.setLineSpacing(0, 1.2f);
    return t;
  }

  /** Amounts use tabular figures and the tight tracking the web applies to money. */
  TextView money(String value, float sp, int color, int weight) {
    TextView t = text(value, sp, color, weight);
    t.setFontFeatureSettings("tnum");
    t.setLetterSpacing(-0.02f);
    t.setSingleLine(true);
    return t;
  }

  TextView caps(String value, float sp, int color, float tracking) {
    TextView t = text(value.toUpperCase(Locale.ROOT), sp, color, 600);
    t.setLetterSpacing(tracking);
    return t;
  }

  TextView truncate(TextView t) {
    t.setSingleLine(true);
    t.setEllipsize(TextUtils.TruncateAt.END);
    return t;
  }

  ImageView icon(String name, float size, int color) {
    ImageView v = new ImageView(context);
    v.setImageResource(iconRes(name));
    v.setImageTintList(ColorStateList.valueOf(color));
    v.setLayoutParams(new LinearLayout.LayoutParams(dp(size), dp(size)));
    v.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    return v;
  }

  /** The web rotates arrow-top and arrow-down to get its diagonal arrows. */
  ImageView icon(String name, float size, int color, float rotation) {
    ImageView v = icon(name, size, color);
    v.setRotation(rotation);
    return v;
  }

  private final HashMap<String, Integer> iconIds = new HashMap<>();

  int iconRes(String name) {
    String key = name.replace('-', '_');
    Integer cached = iconIds.get(key);
    if (cached != null) return cached;
    int id = context.getResources().getIdentifier("ic_" + key, "drawable", context.getPackageName());
    if (id == 0) id = R.drawable.ic_widget;
    iconIds.put(key, id);
    return id;
  }

  /** A square tile holding an icon, the `.row-icon-tile` (`36dp`, `11dp` radius) pattern. */
  LinearLayout tile(String name, float size, float iconSize, int fill, int tint, float rotation) {
    LinearLayout box = new LinearLayout(context);
    box.setGravity(Gravity.CENTER);
    box.setBackground(round(fill, size >= 44 ? 14 : 11));
    box.addView(icon(name, iconSize, tint, rotation));
    box.setLayoutParams(new LinearLayout.LayoutParams(dp(size), dp(size)));
    return box;
  }

  /** RowIconTile on the web: `color-mix(in srgb, color 16%, var(--color-surface))`. */
  LinearLayout rowIconTile(String iconName, int tintColor) {
    int fill = mix(tintColor, color(R.color.surface_raised), 0.16f);
    return tile(iconName, 36, 17, fill, tintColor, 0);
  }

  LinearLayout row() {
    LinearLayout r = new LinearLayout(context);
    r.setOrientation(LinearLayout.HORIZONTAL);
    r.setGravity(Gravity.CENTER_VERTICAL);
    return r;
  }

  LinearLayout column() {
    LinearLayout c = new LinearLayout(context);
    c.setOrientation(LinearLayout.VERTICAL);
    return c;
  }

  /** `.proto-card` / `.group-card`: `rounded-[22px] bg-surface-raised border border-surface-variant`. */
  LinearLayout card() {
    LinearLayout box = column();
    box.setBackground(round(color(R.color.surface_raised), 22, color(R.color.surface_variant)));
    box.setClipToOutline(true);
    return box;
  }

  LinearLayout.LayoutParams wrap() {
    return new LinearLayout.LayoutParams(-2, -2);
  }

  LinearLayout.LayoutParams fill() {
    return new LinearLayout.LayoutParams(-1, -2);
  }

  LinearLayout.LayoutParams weight(float w) {
    return new LinearLayout.LayoutParams(0, -2, w);
  }

  LinearLayout.LayoutParams top(LinearLayout.LayoutParams p, float margin) {
    p.topMargin = dp(margin);
    return p;
  }

  LinearLayout.LayoutParams start(LinearLayout.LayoutParams p, float margin) {
    p.setMarginStart(dp(margin));
    return p;
  }

  View divider() {
    View line = new View(context);
    line.setBackgroundColor(color(R.color.surface_variant));
    line.setLayoutParams(new LinearLayout.LayoutParams(-1, dp(1)));
    return line;
  }

  View space(float height) {
    View gap = new View(context);
    gap.setLayoutParams(new LinearLayout.LayoutParams(1, dp(height)));
    return gap;
  }

  /**
   * The `active:scale-*` press feedback the web gives every tappable surface.
   *
   * Uses `ViewPropertyAnimator` on touch rather than attaching a `StateListAnimator`
   * and two `ObjectAnimator`s to every row at draw time, so building a screen of
   * fifty rows does not allocate a hundred animators upfront.
   */
  <T extends View> T press(T view, float scale, Runnable action) {
    view.setClickable(true);
    view.setFocusable(true);
    view.setOnTouchListener(
        (v, event) -> {
          int act = event.getActionMasked();
          if (act == android.view.MotionEvent.ACTION_DOWN)
            v.animate().scaleX(scale).scaleY(scale).setDuration(110).start();
          else if (act == android.view.MotionEvent.ACTION_UP
              || act == android.view.MotionEvent.ACTION_CANCEL)
            v.animate().scaleX(1f).scaleY(1f).setDuration(160).start();
          return false;
        });
    view.setOnClickListener(v -> action.run());
    return view;
  }

  /** `buttonVariants`: primary, secondary, outline. Full width at 52dp, pill radius like the web. */
  LinearLayout button(String label, String icon, String variant, Runnable action) {
    int fill, ink, stroke = 0;
    switch (variant) {
      case "secondary":
        fill = color(R.color.brand_soft);
        ink = color(R.color.brand);
        break;
      case "outline":
        fill = color(R.color.surface_raised);
        ink = color(R.color.ink);
        stroke = color(R.color.border_subtle);
        break;
      default:
        fill = color(R.color.brand);
        ink = color(R.color.on_hero);
    }
    LinearLayout b = row();
    b.setGravity(Gravity.CENTER);
    b.setMinimumHeight(dp(52));
    b.setPadding(dp(24), dp(8), dp(24), dp(8));
    b.setBackground(round(fill, 999, stroke));
    b.setContentDescription(label);
    if (icon != null) b.addView(icon(icon, 18, ink));
    TextView t = text(label, 16, ink, 600);
    b.addView(t, icon == null ? wrap() : start(wrap(), 8));
    return press(b, 0.97f, action);
  }

  /** A text link, like "All activity", "See all" and "Open insights". */
  LinearLayout link(String label, int ink, float sp, Runnable action) {
    LinearLayout l = row();
    l.setMinimumHeight(dp(36));
    l.setContentDescription(label);
    l.addView(text(label, sp, ink, 500));
    return press(l, 0.985f, action);
  }

  /** `rounded-pill px-2 py-0.5 text-[0.625rem] font-bold`, blue for USD, amber for KHR. */
  TextView badge(String currency) {
    boolean usd = currency.equals("USD");
    TextView t = text(currency, 10, color(usd ? R.color.usd : R.color.khr), 700);
    t.setLetterSpacing(0.025f);
    t.setPadding(dp(8), dp(2), dp(8), dp(2));
    t.setBackground(round(color(usd ? R.color.usd_soft : R.color.khr_soft), 999));
    return t;
  }

  /** `.field-input`: `bg-fill rounded-[12px]`. */
  GradientDrawable inputBackground() {
    return round(color(R.color.fill), 12);
  }

  static final int[] CHART_COLOR_RES = {
    R.color.chart_1,
    R.color.chart_2,
    R.color.chart_3,
    R.color.chart_4,
    R.color.chart_5,
    R.color.chart_6
  };

  /** Mirrors `categoryColorToken` in `src/components/category-icon.tsx`. */
  int categoryColor(JSONObject category) {
    if (category == null || "Other".equals(category.optString("name"))) {
      return color(R.color.chart_other);
    }
    int sortOrder = Math.abs(category.optInt("sort_order", 0));
    return color(CHART_COLOR_RES[sortOrder % CHART_COLOR_RES.length]);
  }

  static int parseColor(JSONObject row, int fallback) {
    try {
      String value = row == null ? "" : row.optString("color", "");
      return value.matches("#[0-9a-fA-F]{6}") ? android.graphics.Color.parseColor(value) : fallback;
    } catch (Exception e) {
      return fallback;
    }
  }

  /**
   * The `.hero-panel` gradient card (`linear-gradient(155deg, hero 0%, hero-2 100%)`,
   * `32dp` radius) from `src/app/globals.css`.
   */
  static final class Hero extends Drawable {
    final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    final int c1, c2;
    final float radius;

    Hero(Ui ui) {
      float density = ui.context.getResources().getDisplayMetrics().density;
      radius = 32 * density;
      c1 = ui.color(R.color.hero);
      c2 = ui.color(R.color.hero_2);
    }

    @Override
    protected void onBoundsChange(Rect bounds) {
      super.onBoundsChange(bounds);
      fill.setShader(
          new LinearGradient(
              bounds.left,
              bounds.top,
              bounds.right * 0.45f,
              bounds.bottom,
              c1,
              c2,
              Shader.TileMode.CLAMP));
    }

    @Override
    public void draw(Canvas canvas) {
      Rect b = getBounds();
      Path clip = new Path();
      clip.addRoundRect(new RectF(b), radius, radius, Path.Direction.CW);
      canvas.drawPath(clip, fill);
    }

    @Override
    public void getOutline(android.graphics.Outline outline) {
      outline.setRoundRect(getBounds(), radius);
    }

    @Override
    public void setAlpha(int alpha) {}

    @Override
    public void setColorFilter(ColorFilter filter) {}

    @Override
    public int getOpacity() {
      return PixelFormat.TRANSLUCENT;
    }
  }

  static final HashMap<String, String> CATEGORY_ICONS = new HashMap<>();
  static final HashMap<String, Integer> QUICK_PRIORITIES = new HashMap<>();

  static {
    String[] catalog = {
      "food=pizza", "drinks=drink", "groceries=basket", "transportation=road", "housing=home",
      "utilities=lamp", "phone internet=wifi", "shopping=bag", "health=stethoscope",
      "personal care=pipette", "fitness=trophy", "social life=chat-smile", "game=gamepad",
      "subscription=refresh", "trip=suitcase", "family kids=group", "pets=pets", "gifts=gift",
      "charity=charity", "education=mortarboard", "fees charges=paper", "insurance=chield-check",
      "taxes=notebook", "debt payments=credit-card", "repairs maintenance=setting-alt-line",
      "business=tie", "savings contributions=wallet-alt", "trading=candlestick",
      "betting=betting", "other=widget", "salary=money", "freelance=desktop", "gift=star",
      "investment income=chart", "refund=refund-back", "bonus=sparkle", "sales=shop",
      "rental income=key", "interest=line-up", "allowance=wallet", "petty cash=petty-cash",
      "tournament prize=tournament-prize", "other income=layers",
      "balance adjustment=colum-up",
      // CATEGORY_ALIASES and NAME_ICONS in src/lib/domain/categories.ts.
      "food drink=pizza", "food drinks=pizza", "restaurant=pizza", "delivery=pizza",
      "coffee=drink", "transport=road", "fuel=road", "tuk tuk grab=road", "rent=home",
      "electricity=lamp", "water=lamp", "clothing=bag", "electronics=bag", "medical=stethoscope",
      "dental=stethoscope", "entertainment=chat-smile", "subscriptions=refresh", "travel=suitcase",
      "flights=suitcase", "hotels=suitcase", "gifts donations=gift", "internet=wifi",
      "selfcare=sparkle", "modified bal=colum-up"
    };
    for (String pair : catalog) {
      String[] parts = pair.split("=");
      CATEGORY_ICONS.put(parts[0], parts[1]);
    }
    QUICK_PRIORITIES.put("food", 0);
    QUICK_PRIORITIES.put("drinks", 1);
    QUICK_PRIORITIES.put("transportation", 2);
    QUICK_PRIORITIES.put("shopping", 3);
    QUICK_PRIORITIES.put("groceries", 4);
    QUICK_PRIORITIES.put("other", 5);
    QUICK_PRIORITIES.put("salary", 0);
    QUICK_PRIORITIES.put("freelance", 1);
  }

  static String normCategoryKey(JSONObject category) {
    if (category == null) return "";
    return category
        .optString("name", "")
        .toLowerCase(Locale.ROOT)
        .replaceAll("[^\\p{L}\\p{N}]+", " ")
        .trim();
  }

  static int quickPriority(JSONObject category) {
    if (category == null) return 1000;
    Integer prio = QUICK_PRIORITIES.get(normCategoryKey(category));
    return prio != null ? prio : 1000 + category.optInt("sort_order", 0);
  }

  /** categoryIconKey on the web: catalog name first, then the stored icon, then the grid. */
  static String categoryIcon(JSONObject category) {
    if (category == null) return "widget";
    String known = CATEGORY_ICONS.get(normCategoryKey(category));
    return known != null ? known : category.optString("icon", "widget");
  }
}
