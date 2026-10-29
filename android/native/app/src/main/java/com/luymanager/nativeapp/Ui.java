package com.luymanager.nativeapp;

import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.StateListAnimator;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
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

  int color(int id) {
    return context.getColor(id);
  }

  static int alpha(int color, float alpha) {
    return (Math.round(alpha * 255) << 24) | (color & 0xffffff);
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

  static Typeface font(int weight) {
    return Typeface.create(Typeface.SANS_SERIF, weight, false);
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

  int iconRes(String name) {
    int id =
        context
            .getResources()
            .getIdentifier("ic_" + name.replace('-', '_'), "drawable", context.getPackageName());
    return id == 0 ? R.drawable.ic_widget : id;
  }

  /** A square tile holding an icon, the `flex size-10 rounded-2xl bg-*-soft` pattern. */
  LinearLayout tile(String name, float size, float iconSize, int fill, int tint, float rotation) {
    LinearLayout box = new LinearLayout(context);
    box.setGravity(Gravity.CENTER);
    box.setBackground(round(fill, size >= 40 ? 16 : 12));
    box.addView(icon(name, iconSize, tint, rotation));
    box.setLayoutParams(new LinearLayout.LayoutParams(dp(size), dp(size)));
    return box;
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

  /** `rounded-card bg-surface-raised border border-surface-variant`. */
  LinearLayout card() {
    LinearLayout box = column();
    box.setBackground(round(color(R.color.surface_raised), 24, color(R.color.surface_variant)));
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

  /** The `active:scale-*` press feedback the web gives every tappable surface. */
  <T extends View> T press(T view, float scale, Runnable action) {
    view.setClickable(true);
    view.setFocusable(true);
    StateListAnimator animator = new StateListAnimator();
    animator.addState(
        new int[] {android.R.attr.state_pressed},
        ObjectAnimator.ofPropertyValuesHolder(
                view,
                PropertyValuesHolder.ofFloat("scaleX", scale),
                PropertyValuesHolder.ofFloat("scaleY", scale))
            .setDuration(110));
    animator.addState(
        new int[0],
        ObjectAnimator.ofPropertyValuesHolder(
                view,
                PropertyValuesHolder.ofFloat("scaleX", 1f),
                PropertyValuesHolder.ofFloat("scaleY", 1f))
            .setDuration(160));
    view.setStateListAnimator(animator);
    view.setOnClickListener(v -> action.run());
    return view;
  }

  /** `buttonVariants`: primary, secondary, outline. Full width at 52dp, like size "full". */
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
    b.setBackground(round(fill, 16, stroke));
    b.setContentDescription(label);
    if (icon != null) b.addView(icon(icon, 18, ink));
    TextView t = text(label, 16, ink, 600);
    b.addView(t, icon == null ? wrap() : start(wrap(), 8));
    return press(b, 0.97f, action);
  }

  /** A text link with a trailing arrow, like "View all" and "Add income". */
  LinearLayout link(String label, int ink, float sp, Runnable action) {
    LinearLayout l = row();
    l.setMinimumHeight(dp(44));
    l.setContentDescription(label);
    l.addView(text(label, sp, ink, 600));
    l.addView(icon("arrow-top", 14, ink, 45), start(new LinearLayout.LayoutParams(dp(14), dp(14)), 4));
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

  /** The bordered single-line input the web uses for notes and search. */
  GradientDrawable inputBackground() {
    return round(color(R.color.surface_raised), 12, color(R.color.border_subtle));
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
   * The dark net worth card with the two faint rings in its corner, the `.hero-orbit`
   * pseudo-elements in globals.css.
   */
  static final class Hero extends Drawable {
    final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG), ring = new Paint(Paint.ANTI_ALIAS_FLAG);
    final float radius, density;

    Hero(Ui ui) {
      density = ui.context.getResources().getDisplayMetrics().density;
      radius = 24 * density;
      fill.setColor(ui.color(R.color.hero));
      ring.setStyle(Paint.Style.STROKE);
      ring.setStrokeWidth(density);
      ring.setColor(alpha(ui.color(R.color.brand_fixed), 0.15f));
    }

    @Override
    public void draw(Canvas canvas) {
      Rect b = getBounds();
      Path clip = new Path();
      clip.addRoundRect(new RectF(b), radius, radius, Path.Direction.CW);
      canvas.save();
      canvas.clipPath(clip);
      canvas.drawPath(clip, fill);
      float r = 152 * density;
      canvas.drawCircle(b.right - 24 * density, b.top + 8 * density, r, ring);
      canvas.drawCircle(b.right - 88 * density, b.top + 72 * density, r, ring);
      canvas.restore();
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
  }

  /** categoryIconKey on the web: catalog name first, then the stored icon, then the grid. */
  static String categoryIcon(JSONObject category) {
    if (category == null) return "widget";
    String key =
        category
            .optString("name", "")
            .toLowerCase(Locale.ROOT)
            .replaceAll("[^\\p{L}\\p{N}]+", " ")
            .trim();
    String known = CATEGORY_ICONS.get(key);
    return known != null ? known : category.optString("icon", "widget");
  }
}
