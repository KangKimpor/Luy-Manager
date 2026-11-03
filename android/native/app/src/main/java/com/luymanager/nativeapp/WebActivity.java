package com.luymanager.nativeapp;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;
import org.json.JSONObject;

/**
 * Hosts the real web app inside the APK, signed in with the same session the native screens use,
 * so every web feature (editing, reports, budgets, categories, settings, import and export) is
 * available and behaves exactly as it does on the website.
 */
public final class WebActivity extends Activity {
  static final String PATH = "path";
  private static final int PICK = 41;
  private static final String HOST = Uri.parse(MainActivity.WEB).getHost();
  private LuyApplication app;
  private WebView web;
  private ProgressBar bar;
  private LinearLayout failure;
  private TextView failureText;
  private View retryButton;
  private ValueCallback<Uri[]> chooser;
  private String path = "/";
  private boolean started;
  private final String ref = WebSession.ref(BuildConfig.SUPABASE_URL);

  static String safePath(String value) {
    if (value == null || !value.startsWith("/") || value.startsWith("//") || value.contains("\\"))
      return "/";
    return value;
  }

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    app = (LuyApplication) getApplication();
    path = safePath(getIntent().getStringExtra(PATH));
    Ui ui = new Ui(this);
    LinearLayout root = ui.column();
    root.setBackgroundColor(ui.color(R.color.surface));
    root.setOnApplyWindowInsetsListener(
        (v, insets) -> {
          v.setPadding(
              0, insets.getSystemWindowInsetTop(), 0, insets.getSystemWindowInsetBottom());
          return insets;
        });

    LinearLayout barRow = ui.row();
    barRow.setPadding(ui.dp(8), ui.dp(4), ui.dp(8), ui.dp(4));
    barRow.setBackgroundColor(ui.color(R.color.surface_raised));
    LinearLayout back = ui.row();
    back.setGravity(Gravity.CENTER_VERTICAL);
    back.setMinimumHeight(ui.dp(48));
    back.setPadding(ui.dp(8), 0, ui.dp(12), 0);
    back.setContentDescription("Back to Luy Manager");
    back.addView(ui.icon("expand-left", 20, ui.color(R.color.brand)));
    back.addView(ui.text("Luy Manager", 16, ui.color(R.color.ink), 600), ui.start(ui.wrap(), 6));
    barRow.addView(ui.press(back, 0.98f, this::finish), ui.weight(1));
    LinearLayout reload = ui.row();
    reload.setGravity(Gravity.CENTER);
    reload.setMinimumHeight(ui.dp(48));
    reload.setMinimumWidth(ui.dp(48));
    reload.setContentDescription("Reload");
    reload.addView(ui.icon("refresh", 20, ui.color(R.color.muted)));
    barRow.addView(ui.press(reload, 0.95f, () -> inject(true)), ui.wrap());
    root.addView(barRow, new LinearLayout.LayoutParams(-1, -2));

    FrameLayout stage = new FrameLayout(this);
    web = new WebView(this);
    configure(web);
    stage.addView(web, new FrameLayout.LayoutParams(-1, -1));
    bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
    bar.setMax(100);
    bar.setVisibility(View.GONE);
    stage.addView(bar, new FrameLayout.LayoutParams(-1, ui.dp(3)));
    failure = ui.column();
    failure.setGravity(Gravity.CENTER);
    failure.setBackgroundColor(ui.color(R.color.surface));
    failure.setPadding(ui.dp(32), ui.dp(32), ui.dp(32), ui.dp(32));
    failureText = ui.text("", 16, ui.color(R.color.ink), 500);
    failureText.setGravity(Gravity.CENTER);
    failure.addView(failureText, ui.fill());
    retryButton = ui.button("Try again", "refresh", "primary", () -> inject(true));
    failure.addView(retryButton, ui.top(ui.wrap(), 20));
    failure.addView(ui.button("Back to the app", null, "outline", this::finish), ui.top(ui.wrap(), 12));
    failure.setVisibility(View.GONE);
    stage.addView(failure, new FrameLayout.LayoutParams(-1, -1));
    root.addView(stage, new LinearLayout.LayoutParams(-1, 0, 1));
    setContentView(root);
    root.requestApplyInsets();
    inject(true);
  }
  private void configure(WebView view) {
    WebSettings s = view.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);
    s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    s.setSupportMultipleWindows(false);
    s.setJavaScriptCanOpenWindowsAutomatically(false);
    s.setUserAgentString(s.getUserAgentString() + " LuyManagerAndroid/" + BuildConfig.VERSION_NAME);
    CookieManager.getInstance().setAcceptCookie(true);
    view.setWebViewClient(
        new WebViewClient() {
          @Override
          public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())) {
              String p = uri.getPath();
              if (p != null && p.startsWith("/login")) {
                showFailure(
                    "Your web sign-in expired. Go back, open More and tap Sign in again.", false);
                return true;
              }
              return false;
            }
            try {
              startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
            }
            return true;
          }

          @Override
          public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
            bar.setVisibility(View.VISIBLE);
          }

          @Override
          public void onPageFinished(WebView v, String url) {
            bar.setVisibility(View.GONE);
          }

          @Override
          public void onReceivedError(
              WebView v, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame())
              showFailure("This part of Luy Manager needs an internet connection.", true);
          }

          @Override
          public boolean onRenderProcessGone(
              WebView v, android.webkit.RenderProcessGoneDetail detail) {
            finish();
            return true;
          }
        });
    view.setWebChromeClient(
        new WebChromeClient() {
          @Override
          public void onProgressChanged(WebView v, int progress) {
            bar.setProgress(progress);
          }

          @Override
          public boolean onShowFileChooser(
              WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (chooser != null) chooser.onReceiveValue(null);
            chooser = callback;
            try {
              startActivityForResult(params.createIntent(), PICK);
              return true;
            } catch (Exception e) {
              chooser = null;
              return false;
            }
          }
        });
    view.setDownloadListener(
        (DownloadListener)
            (url, agent, disposition, mime, length) -> download(url, agent, disposition, mime));
  }

  private void showFailure(String message, boolean retry) {
    runOnUiThread(
        () -> {
          bar.setVisibility(View.GONE);
          failureText.setText(message);
          retryButton.setVisibility(retry ? View.VISIBLE : View.GONE);
          failure.setVisibility(View.VISIBLE);
        });
  }
  /** Give the web view the phone's current sign-in, then (re)load the page. */
  private void inject(boolean load) {
    runOnUiThread(() -> failure.setVisibility(View.GONE));
    app.webOpen = true;
    app.network.execute(
        () -> {
          try {
            if (app.cloud == null || !app.cloud.signedIn())
              throw new CloudClient.AuthException("Sign in from the More tab first.", true);
            app.cloud.ensureFresh(900);
            JSONObject session = new JSONObject(app.cloud.session.toString());
            runOnUiThread(
                () -> {
                  writeCookies(session);
                  if (load) web.loadUrl(MainActivity.WEB + path);
                });
          } catch (Exception e) {
            boolean offline = e instanceof java.io.IOException;
            showFailure(
                offline ? "This part of Luy Manager needs an internet connection." : e.getMessage(),
                offline);
          }
        });
  }

  private void writeCookies(JSONObject session) {
    CookieManager cm = CookieManager.getInstance();
    Map<String, String> fresh = WebSession.cookies(ref, session);
    String base = WebSession.name(ref);
    for (String stale : new String[] {base, base + ".0", base + ".1", base + ".2", base + ".3"})
      if (!fresh.containsKey(stale))
        cm.setCookie(MainActivity.WEB, stale + "=; Path=/; Max-Age=0; Secure");
    for (Map.Entry<String, String> e : fresh.entrySet())
      cm.setCookie(
          MainActivity.WEB,
          e.getKey() + "=" + e.getValue() + "; Path=/; Max-Age=34560000; Secure; SameSite=Lax");
    cm.flush();
  }

  /** Take back a sign-in the web app refreshed, so the phone and the web view stay in step. */
  private void takeBack(boolean last) {
    JSONObject taken = null;
    try {
      CookieManager.getInstance().flush();
      taken =
          WebSession.parse(
              ref, WebSession.parseHeader(CookieManager.getInstance().getCookie(MainActivity.WEB)));
    } catch (Exception ignored) {
    }
    JSONObject fromWeb = taken;
    app.worker.execute(
        () -> {
          if (fromWeb != null && app.cloud != null) app.cloud.adoptWebSession(fromWeb);
          app.webOpen = false;
          if (last) app.sync(app.synced);
        });
  }

  @Override
  protected void onResume() {
    super.onResume();
    if (started) inject(false);
    started = true;
  }

  @Override
  protected void onPause() {
    takeBack(isFinishing());
    super.onPause();
  }

  @Override
  public void onBackPressed() {
    if (web.canGoBack() && failure.getVisibility() != View.VISIBLE) web.goBack();
    else super.onBackPressed();
  }

  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    if (request == PICK && chooser != null) {
      chooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
      chooser = null;
    } else super.onActivityResult(request, result, data);
  }

  @Override
  protected void onDestroy() {
    if (chooser != null) chooser.onReceiveValue(null);
    web.destroy();
    super.onDestroy();
  }

  /** Save an export from the web app to the Downloads folder using the web session. */
  private void download(String url, String agent, String disposition, String mime) {
    Uri uri = Uri.parse(url);
    if (!"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost())) return;
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      Toast.makeText(this, "Saving files needs Android 10 or newer.", Toast.LENGTH_LONG).show();
      return;
    }
    String cookie = CookieManager.getInstance().getCookie(url);
    String file = URLUtil.guessFileName(url, disposition, mime);
    Toast.makeText(this, "Downloading " + file, Toast.LENGTH_SHORT).show();
    app.network.execute(
        () -> {
          try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(60000);
            c.setInstanceFollowRedirects(false);
            if (cookie != null) c.setRequestProperty("Cookie", cookie);
            if (agent != null) c.setRequestProperty("User-Agent", agent);
            if (c.getResponseCode() != 200)
              throw new Exception("Server answered " + c.getResponseCode());
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, file);
            if (mime != null && !mime.isEmpty()) values.put(MediaStore.Downloads.MIME_TYPE, mime);
            Uri target =
                getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (target == null) throw new Exception("Could not create the file");
            try (InputStream in = c.getInputStream();
                OutputStream out = getContentResolver().openOutputStream(target)) {
              byte[] buffer = new byte[8192];
              int n;
              while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            }
            runOnUiThread(
                () ->
                    Toast.makeText(this, "Saved " + file + " to Downloads", Toast.LENGTH_LONG)
                        .show());
          } catch (Exception e) {
            runOnUiThread(
                () ->
                    Toast.makeText(this, "Download failed: " + e.getMessage(), Toast.LENGTH_LONG)
                        .show());
          }
        });
  }

  /** Remove the web sign-in and cached pages, used when signing out of the app. */
  static void clearWebData(android.content.Context context) {
    CookieManager.getInstance().removeAllCookies(null);
    CookieManager.getInstance().flush();
    WebStorage.getInstance().deleteAllData();
    new WebView(context).clearCache(true);
  }
}