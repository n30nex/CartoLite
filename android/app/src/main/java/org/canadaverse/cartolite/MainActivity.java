package org.canadaverse.cartolite;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Parcel;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.Menu;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebBackForwardList;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final int BACKGROUND = Color.rgb(3, 7, 11);
    private static final int PANEL = Color.rgb(8, 20, 26);
    private static final int PRIMARY = Color.rgb(238, 255, 255);
    private static final int SECONDARY = Color.rgb(164, 192, 203);
    private static final int ACCENT = Color.rgb(91, 232, 208);
    private static final long RESUME_SIGNAL_DELAY_MS = 180L;
    private static final long LOAD_TIMEOUT_MS = 30000L;
    private static final String RESUME_SCRIPT = "(function(){"
            + "window.dispatchEvent(new Event('pageshow'));"
            + "if(navigator.onLine){window.dispatchEvent(new Event('online'));}"
            + "document.dispatchEvent(new Event('visibilitychange'));"
            + "})();";

    private WebView webView;
    private FrameLayout webContainer;
    private ScrollView connectionOverlay;
    private LinearLayout connectionPanel;
    private TextView connectionTitle;
    private TextView connectionDetail;
    private ProgressBar progress;
    private ProgressBar loadProgress;
    private Button retryButton;
    private Button browserButton;
    private android.window.OnBackInvokedCallback backCallback;
    private boolean backRegistered;
    private SharedPreferences preferences;
    private String currentUrl = NavigationPolicy.CANADA_URL;
    private boolean pageVisible;
    private boolean hadContent;
    private boolean loadFailed;
    private boolean timedOut;
    private boolean retryOnNetwork;
    private boolean resumed;
    private long pausedAt;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private final Runnable resumeRunnable = this::evaluateResumeScript;
    private final Runnable loadTimeout = () -> {
        if (pageVisible || loadFailed || !resumed) return;
        showConnectionProblem(R.string.timeout_title, R.string.timeout_detail, true);
        timedOut = true;
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences("android", MODE_PRIVATE);
        setContentView(createContentView());
        configureImmersiveWindow();
        configureWebView();
        registerNetworkCallback();

        Uri launchUri = getIntent().getData();
        String savedUrl = savedInstanceState == null ? null : savedInstanceState.getString("current_url");
        String initialUrl = NavigationPolicy.isTrusted(savedUrl) ? savedUrl
                : launchUri != null && NavigationPolicy.isTrusted(launchUri.toString()) ? launchUri.toString()
                : NavigationPolicy.startViewUrl(preferences.getString("start_view", "last"), preferences.getString("last_view", ""));
        // Only this app's bounded, trusted history is saved. Restore it before
        // loading a URL, otherwise WebView discards its existing Back entries.
        Bundle history = savedInstanceState == null ? null : savedInstanceState.getBundle("web_history");
        if (history != null && NavigationPolicy.isTrusted(savedUrl)) {
            currentUrl = savedUrl;
            showConnecting();
            if (webView.restoreState(history) != null) {
                updateBackHandler();
                return;
            }
        }
        loadPage(initialUrl);
    }

    private View createContentView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BACKGROUND);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                int types = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime();
                android.graphics.Insets safe = insets.getInsets(types);
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                // The native container owns this spacing. Pass zeros so WebView also clears old IME insets.
                return new WindowInsets.Builder(insets).setInsets(types, android.graphics.Insets.NONE).build();
            }
            int left = insets.getSystemWindowInsetLeft();
            int top = insets.getSystemWindowInsetTop();
            int right = insets.getSystemWindowInsetRight();
            int bottom = insets.getSystemWindowInsetBottom();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && insets.getDisplayCutout() != null) {
                left = Math.max(left, insets.getDisplayCutout().getSafeInsetLeft());
                top = Math.max(top, insets.getDisplayCutout().getSafeInsetTop());
                right = Math.max(right, insets.getDisplayCutout().getSafeInsetRight());
                bottom = Math.max(bottom, insets.getDisplayCutout().getSafeInsetBottom());
            }
            view.setPadding(left, top, right, bottom);
            return insets.consumeSystemWindowInsets();
        });
        webContainer = new FrameLayout(this);
        root.addView(webContainer, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        createWebView();

        connectionOverlay = new ScrollView(this);
        connectionOverlay.setId(R.id.connection_panel);
        connectionOverlay.setFillViewport(true);
        connectionOverlay.setBackgroundColor(BACKGROUND);
        LinearLayout center = new LinearLayout(this);
        center.setGravity(Gravity.CENTER);
        center.setPadding(dp(16), dp(16), dp(16), dp(16));
        connectionOverlay.addView(center, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        connectionPanel = new LinearLayout(this);
        connectionPanel.setOrientation(LinearLayout.VERTICAL);
        connectionPanel.setGravity(Gravity.CENTER_HORIZONTAL);
        connectionPanel.setPadding(dp(28), dp(30), dp(28), dp(30));
        GradientDrawable panelBackground = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[]{Color.rgb(8, 26, 32), PANEL});
        panelBackground.setCornerRadius(dp(24));
        panelBackground.setStroke(dp(1), Color.argb(90, 91, 232, 208));
        connectionPanel.setBackground(panelBackground);

        ImageView mark = new ImageView(this);
        mark.setImageResource(R.drawable.ic_cartolite_mark);
        mark.setContentDescription(getString(R.string.app_name));
        connectionPanel.addView(mark, linearParams(dp(92), dp(92), 0, 0, 0, dp(16)));

        connectionTitle = new TextView(this);
        connectionTitle.setText(R.string.connecting_title);
        connectionTitle.setTextColor(PRIMARY);
        connectionTitle.setTextSize(22);
        connectionTitle.setGravity(Gravity.CENTER);
        connectionTitle.setTypeface(connectionTitle.getTypeface(), android.graphics.Typeface.BOLD);
        connectionTitle.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        connectionPanel.addView(connectionTitle, linearParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                0, 0, 0, dp(8)));

        connectionDetail = new TextView(this);
        connectionDetail.setText(R.string.connecting_detail);
        connectionDetail.setTextColor(SECONDARY);
        connectionDetail.setTextSize(14);
        connectionDetail.setGravity(Gravity.CENTER);
        connectionDetail.setLineSpacing(0, 1.15f);
        connectionPanel.addView(connectionDetail, linearParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                0, 0, 0, dp(18)));

        progress = new ProgressBar(this);
        progress.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(ACCENT));
        connectionPanel.addView(progress, linearParams(dp(36), dp(36), 0, 0, 0, dp(12)));

        retryButton = new Button(this);
        retryButton.setId(R.id.retry_button);
        retryButton.setText(R.string.retry);
        retryButton.setTextColor(Color.rgb(2, 18, 20));
        retryButton.setTextSize(15);
        retryButton.setAllCaps(false);
        retryButton.setMinHeight(dp(48));
        retryButton.setPadding(dp(24), 0, dp(24), 0);
        GradientDrawable retryBackground = new GradientDrawable();
        retryBackground.setColor(ACCENT);
        retryBackground.setCornerRadius(dp(14));
        retryButton.setBackground(retryBackground);
        retryButton.setVisibility(View.GONE);
        retryButton.setOnClickListener(view -> loadPage(currentUrl));
        connectionPanel.addView(retryButton, linearParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                dp(48),
                0, 0, 0, 0));

        browserButton = new Button(this);
        browserButton.setId(R.id.browser_button);
        browserButton.setText(R.string.open_browser);
        browserButton.setAllCaps(false);
        browserButton.setTextColor(PRIMARY);
        browserButton.setBackgroundTintList(android.content.res.ColorStateList.valueOf(PANEL));
        browserButton.setMinHeight(dp(48));
        browserButton.setVisibility(View.GONE);
        browserButton.setOnClickListener(view -> openExternalWebLink(currentUrl));
        connectionPanel.addView(browserButton, linearParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, 0, dp(8), 0, 0));

        LinearLayout.LayoutParams panelParams = new LinearLayout.LayoutParams(
                Math.min(dp(390), getResources().getDisplayMetrics().widthPixels - dp(32)),
                ViewGroup.LayoutParams.WRAP_CONTENT);
        center.addView(connectionPanel, panelParams);
        webContainer.addView(connectionOverlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webContainer.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            int width = Math.min(dp(390), Math.max(dp(100), right - left - dp(32)));
            if (connectionPanel.getLayoutParams().width != width) {
                connectionPanel.getLayoutParams().width = width;
                connectionPanel.requestLayout();
            }
        });

        loadProgress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        loadProgress.setId(R.id.load_progress);
        loadProgress.setProgressTintList(android.content.res.ColorStateList.valueOf(ACCENT));
        loadProgress.setContentDescription(getString(R.string.loading_view));
        loadProgress.setVisibility(View.GONE);
        webContainer.addView(loadProgress, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(4), Gravity.TOP));

        Button appButton = new Button(this);
        appButton.setId(R.id.app_button);
        appButton.setText("⋮");
        appButton.setTextColor(PRIMARY);
        appButton.setTextSize(22);
        appButton.setMinHeight(dp(48));
        appButton.setMinimumWidth(dp(48));
        appButton.setPadding(0, 0, 0, 0);
        appButton.setBackgroundTintList(android.content.res.ColorStateList.valueOf(PANEL));
        appButton.setContentDescription(getString(R.string.app_options_description));
        appButton.setOnClickListener(this::showAppOptions);
        FrameLayout.LayoutParams options = new FrameLayout.LayoutParams(dp(48), dp(48), Gravity.TOP | Gravity.END);
        options.setMargins(dp(8), dp(8), dp(8), 0);
        webContainer.addView(appButton, options);
        return root;
    }

    private void createWebView() {
        webView = new WebView(this);
        webView.setId(R.id.web_view);
        webView.setBackgroundColor(BACKGROUND);
        webView.setAlpha(0f);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        webContainer.addView(webView, 0, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void loadPage(String url) {
        if (!NavigationPolicy.isTrusted(url) || isFinishing() || isDestroyed()) {
            return;
        }
        if (webView == null) {
            createWebView();
            configureWebView();
            if (!resumed) webView.onPause();
        }
        currentUrl = url;
        webView.stopLoading();
        showConnecting();
        updateBackHandler();
        webView.loadUrl(url);
    }

    private void showAppOptions(View anchor) {
        PopupMenu popup = new PopupMenu(this, anchor);
        Menu menu = popup.getMenu();
        menu.add(0, 1, 0, R.string.keep_awake).setCheckable(true)
                .setChecked(preferences.getBoolean("keep_awake", true));
        menu.add(0, 2, 3, R.string.reload);
        menu.add(0, 3, 5, R.string.open_browser);
        menu.add(0, 4, 6, R.string.about_app);
        menu.add(0, 5, 1, R.string.fullscreen).setCheckable(true)
                .setChecked(preferences.getBoolean("fullscreen", true));
        menu.add(0, 6, 2, R.string.start_view);
        menu.add(0, 7, 4, R.string.share_view);
        popup.setOnMenuItemClickListener(item -> {
            switch (item.getItemId()) {
                case 1:
                    preferences.edit().putBoolean("keep_awake", !item.isChecked()).apply();
                    applyKeepAwake();
                    return true;
                case 2:
                    if (webView == null || loadFailed) loadPage(currentUrl);
                    else { webView.stopLoading(); showConnecting(); webView.reload(); }
                    return true;
                case 3: openExternalWebLink(currentUrl); return true;
                case 4:
                    new AlertDialog.Builder(this).setTitle(R.string.about_app)
                            .setMessage(getString(R.string.about_detail, BuildConfig.VERSION_NAME))
                            .setPositiveButton(android.R.string.ok, null).show();
                    return true;
                case 5:
                    preferences.edit().putBoolean("fullscreen", !item.isChecked()).apply();
                    configureImmersiveWindow();
                    webContainer.requestApplyInsets();
                    return true;
                case 6: chooseStartView(); return true;
                case 7:
                    Intent share = new Intent(Intent.ACTION_SEND).setType("text/plain")
                            .putExtra(Intent.EXTRA_TEXT, NavigationPolicy.CANADA_URL + NavigationPolicy.viewPath(currentUrl));
                    try { startActivity(Intent.createChooser(share, getString(R.string.share_view))); }
                    catch (ActivityNotFoundException ignored) {
                        Toast.makeText(this, R.string.no_share_target, Toast.LENGTH_SHORT).show();
                    }
                    return true;
                default: return false;
            }
        });
        popup.show();
    }

    private void chooseStartView() {
        String[] values = {"last", "", "netgraph/", "terminal/", "chronoscope/", "firehose/", "pachinko/", "labs/"};
        String[] labels = {getString(R.string.start_last), getString(R.string.start_map),
                getString(R.string.start_netgraph), getString(R.string.start_terminal), getString(R.string.start_chronoscope), getString(R.string.start_firehose), getString(R.string.start_pachinko), getString(R.string.start_labs)};
        String selected = preferences.getString("start_view", "last");
        int checked = 0;
        for (int i = 0; i < values.length; i++) if (values[i].equals(selected)) checked = i;
        new AlertDialog.Builder(this).setTitle(R.string.start_view)
                .setSingleChoiceItems(labels, checked, (dialog, which) -> {
                    preferences.edit().putString("start_view", values[which]).apply();
                    dialog.dismiss();
                }).setNegativeButton(android.R.string.cancel, null).show();
    }

    private void applyKeepAwake() {
        if (resumed && preferences.getBoolean("keep_awake", true)) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportMultipleWindows(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString()
                + " CartoLiteAndroid/" + BuildConfig.VERSION_NAME);
        settings.setSafeBrowsingEnabled(true);

        android.webkit.CookieManager cookies = android.webkit.CookieManager.getInstance();
        cookies.setAcceptCookie(false);
        cookies.setAcceptThirdPartyCookies(webView, false);

        webView.setWebViewClient(new CartoWebViewClient());
        webView.setWebChromeClient(new CartoWebChromeClient());
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
                openExternalWebLink(url));
    }

    private void configureImmersiveWindow() {
        boolean fullscreen = preferences.getBoolean("fullscreen", true);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getDecorView().getWindowInsetsController();
            if (controller != null) {
                int bars = WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars();
                if (fullscreen) controller.hide(bars);
                else controller.show(bars);
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            int layout = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            getWindow().getDecorView().setSystemUiVisibility(fullscreen ? layout
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION : layout);
        }
    }

    private void registerNetworkCallback() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                runOnUiThread(() -> {
                    if (!resumed || isFinishing() || isDestroyed()) return;
                    if (pageVisible && webView != null) {
                        signalNativeResume();
                    } else if (loadFailed && retryOnNetwork) {
                        loadPage(currentUrl);
                    }
                });
            }
        };
        try {
            connectivityManager.registerDefaultNetworkCallback(networkCallback);
        } catch (SecurityException ignored) {
            networkCallback = null;
        }
    }

    private void signalNativeResume() {
        if (!resumed || !pageVisible || webView == null) {
            return;
        }
        webView.removeCallbacks(resumeRunnable);
        webView.postDelayed(resumeRunnable, RESUME_SIGNAL_DELAY_MS);
    }

    private void evaluateResumeScript() {
        if (resumed && pageVisible && webView != null) {
            webView.evaluateJavascript(RESUME_SCRIPT, null);
        }
    }

    private void showConnecting() {
        hideKeyboard();
        pageVisible = false;
        loadFailed = false;
        timedOut = false;
        retryOnNetwork = false;
        String path = NavigationPolicy.viewPath(currentUrl);
        int name = "netgraph/".equals(path) ? R.string.start_netgraph : "terminal/".equals(path) ? R.string.start_terminal : "chronoscope/".equals(path) ? R.string.start_chronoscope : "firehose/".equals(path) ? R.string.start_firehose : "pachinko/".equals(path) ? R.string.start_pachinko : "labs/".equals(path) ? R.string.start_labs : R.string.start_map;
        connectionTitle.setText(getString(R.string.opening_view, getString(name)));
        connectionDetail.setText(R.string.connecting_detail);
        progress.setVisibility(View.VISIBLE);
        retryButton.setVisibility(View.GONE);
        browserButton.setVisibility(View.GONE);
        loadProgress.setProgress(0);
        loadProgress.setVisibility(hadContent ? View.VISIBLE : View.GONE);
        connectionOverlay.animate().cancel();
        connectionOverlay.setAlpha(1f);
        connectionOverlay.setVisibility(hadContent ? View.GONE : View.VISIBLE);
        webContainer.removeCallbacks(loadTimeout);
        webContainer.postDelayed(loadTimeout, LOAD_TIMEOUT_MS);
    }

    private void showConnectionProblem(int title, int detail, boolean recoverWithNetwork) {
        hideKeyboard();
        pageVisible = false;
        hadContent = false;
        loadFailed = true;
        timedOut = false;
        retryOnNetwork = recoverWithNetwork;
        webContainer.removeCallbacks(loadTimeout);
        connectionTitle.setText(title);
        connectionDetail.setText(detail);
        progress.setVisibility(View.GONE);
        retryButton.setVisibility(View.VISIBLE);
        browserButton.setVisibility(title == R.string.security_title ? View.GONE : View.VISIBLE);
        loadProgress.setVisibility(View.GONE);
        if (webView != null) webView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        connectionOverlay.animate().cancel();
        connectionOverlay.setAlpha(1f);
        connectionOverlay.setVisibility(View.VISIBLE);
    }

    private void hideKeyboard() {
        if (!resumed) return;
        View focused = getCurrentFocus();
        if (focused != null) focused.clearFocus();
        InputMethodManager input = getSystemService(InputMethodManager.class);
        if (input != null) input.hideSoftInputFromWindow(webContainer.getWindowToken(), 0);
    }

    private void revealPage() {
        if (loadFailed || webView == null) return;
        pageVisible = true;
        hadContent = true;
        webContainer.removeCallbacks(loadTimeout);
        preferences.edit().putString("last_view", NavigationPolicy.viewPath(currentUrl)).apply();
        webView.animate().alpha(1f).setDuration(220L).start();
        webView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        loadProgress.setVisibility(View.GONE);
        connectionOverlay.animate()
                .alpha(0f)
                .setDuration(180L)
                .withEndAction(() -> {
                    if (pageVisible && !loadFailed) connectionOverlay.setVisibility(View.GONE);
                })
                .start();
        signalNativeResume();
    }

    private void openExternalWebLink(String url) {
        if (!NavigationPolicy.isExternalWebLink(url)) {
            Toast.makeText(this, R.string.link_blocked, Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            // Verified Canada links would otherwise reopen this same Activity.
            Intent chooser = Intent.createChooser(intent, getString(R.string.open_browser));
            chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS,
                    new ComponentName[]{new ComponentName(this, MainActivity.class)});
            startActivity(chooser);
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_SHORT).show();
        }
    }

    private boolean isCurrentPage(WebView view, String url) {
        return view == webView && NavigationPolicy.isTrusted(url)
                && Uri.parse(url).buildUpon().fragment(null).build().equals(
                        Uri.parse(currentUrl).buildUpon().fragment(null).build());
    }

    private boolean isCurrentMainRequest(WebView view, WebResourceRequest request) {
        return request.isForMainFrame() && isCurrentPage(view, request.getUrl().toString());
    }

    private boolean handleNavigation(WebResourceRequest request) {
        String url = request.getUrl().toString();
        if (NavigationPolicy.isTrusted(url)) {
            // Some WebView versions wait for response headers before page-start.
            // Arm recovery at the navigation request; hash-only changes need no loader.
            if (request.isForMainFrame() && (request.getUrl().getFragment() == null || !isCurrentPage(webView, url))) {
                currentUrl = url;
                showConnecting();
            }
            return false;
        }
        if (request.isForMainFrame() && request.hasGesture()) {
            openExternalWebLink(url);
        }
        return true;
    }

    private void updateBackHandler() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (backCallback == null) backCallback = this::handleBack;
        boolean wanted = webView != null && webView.canGoBack();
        if (wanted && !backRegistered) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        } else if (!wanted && backRegistered) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        }
        backRegistered = wanted;
    }

    private void handleBack() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            finish();
        }
    }

    @SuppressLint("GestureBackNavigation")
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // Android 13+ uses the native OnBackInvokedDispatcher registered in onCreate.
        // This override exists only for API 26-32 where onBackPressed is still correct.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            handleBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        configureImmersiveWindow();
        applyKeepAwake();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
            if (pausedAt > 0 && SystemClock.elapsedRealtime() > pausedAt) {
                signalNativeResume();
            }
        }
        if (loadFailed && retryOnNetwork && connectivityManager != null
                && connectivityManager.getActiveNetwork() != null) {
            loadPage(currentUrl);
        } else if (!pageVisible && !loadFailed) {
            webContainer.removeCallbacks(loadTimeout);
            webContainer.postDelayed(loadTimeout, LOAD_TIMEOUT_MS);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // InsetsController may not exist yet during onCreate/onResume.
        if (hasFocus && preferences != null) configureImmersiveWindow();
    }

    @Override
    protected void onPause() {
        resumed = false;
        applyKeepAwake();
        pausedAt = SystemClock.elapsedRealtime();
        webContainer.removeCallbacks(loadTimeout);
        if (webView != null) {
            webView.removeCallbacks(resumeRunnable);
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri uri = intent.getData();
        if (uri != null && NavigationPolicy.isTrusted(uri.toString())) {
            loadPage(uri.toString());
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        state.putString("current_url", currentUrl);
        if (webView != null && pageVisible && trustedHistory(webView.copyBackForwardList())) {
            Bundle history = new Bundle();
            webView.saveState(history);
            Parcel parcel = Parcel.obtain();
            try {
                parcel.writeBundle(history);
                // Keep Activity state bounded; a URL-only restore remains available.
                if (parcel.dataSize() <= 128 * 1024) state.putBundle("web_history", history);
            } finally { parcel.recycle(); }
        }
        super.onSaveInstanceState(state);
    }

    private boolean trustedHistory(WebBackForwardList history) {
        if (history == null || history.getSize() == 0 || history.getSize() > 32) return false;
        for (int i = 0; i < history.getSize(); i++) {
            if (!NavigationPolicy.isTrusted(history.getItemAtIndex(i).getUrl())) return false;
            String original = history.getItemAtIndex(i).getOriginalUrl();
            if (original != null && !NavigationPolicy.isTrusted(original)) return false;
        }
        return true;
    }

    @Override
    protected void onDestroy() {
        resumed = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && backRegistered) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
            backRegistered = false;
        }
        webContainer.removeCallbacks(loadTimeout);
        connectionOverlay.animate().cancel();
        if (networkCallback != null && connectivityManager != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (IllegalArgumentException ignored) {
                // Already unregistered by the platform.
            }
        }
        if (webView != null) {
            webView.removeCallbacks(resumeRunnable);
            webView.animate().cancel();
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) {
                parent.removeView(webView);
            }
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private LinearLayout.LayoutParams linearParams(
            int width,
            int height,
            int left,
            int top,
            int right,
            int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width, height);
        params.setMargins(left, top, right, bottom);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    // Debug-only subclass supplies synthetic pages; release always uses the network.
    protected WebResourceResponse fixtureResponse(WebResourceRequest request) { return null; }

    private final class CartoWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return fixtureResponse(request);
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            super.doUpdateVisitedHistory(view, url, isReload);
            if (view == webView && NavigationPolicy.isTrusted(url)) currentUrl = url;
            updateBackHandler();
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return view != webView || handleNavigation(request);
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            if (view != webView) return;
            if (!NavigationPolicy.isTrusted(url)) {
                view.stopLoading();
                showConnectionProblem(R.string.security_title, R.string.security_detail, false);
                return;
            }
            currentUrl = url;
            showConnecting();
            updateBackHandler();
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            super.onPageCommitVisible(view, url);
            if (isCurrentPage(view, url) && (!loadFailed || timedOut)) {
                loadFailed = false;
                timedOut = false;
                revealPage();
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (isCurrentMainRequest(view, request)) {
                showConnectionProblem(R.string.connection_title, R.string.connection_detail, true);
            }
        }

        @Override
        public void onReceivedHttpError(
                WebView view,
                WebResourceRequest request,
                WebResourceResponse errorResponse) {
            super.onReceivedHttpError(view, request, errorResponse);
            if (isCurrentMainRequest(view, request) && errorResponse.getStatusCode() >= 400) {
                showConnectionProblem(R.string.service_title, R.string.service_detail, false);
            }
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
            if (view == webView && (error.getUrl() == null
                    || Uri.parse(error.getUrl()).buildUpon().fragment(null).build().equals(
                            Uri.parse(currentUrl).buildUpon().fragment(null).build()))) {
                showConnectionProblem(R.string.security_title, R.string.security_detail, false);
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            if (view != webView) return true;
            view.removeCallbacks(resumeRunnable);
            ViewGroup parent = (ViewGroup) view.getParent();
            if (parent != null) {
                parent.removeView(view);
            }
            webView = null;
            hadContent = false;
            updateBackHandler();
            view.destroy();
            showConnectionProblem(R.string.renderer_title, R.string.renderer_detail, false);
            return true;
        }
    }

    private final class CartoWebChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            super.onProgressChanged(view, newProgress);
            if (view == webView && !pageVisible && !loadFailed) {
                connectionDetail.setText(getString(R.string.loading_progress, newProgress));
                loadProgress.setProgress(newProgress);
            }
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            request.deny();
        }
    }
}
