package org.canadaverse.cartolite;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final int BACKGROUND = Color.rgb(3, 7, 11);
    private static final int PANEL = Color.rgb(8, 20, 26);
    private static final int PRIMARY = Color.rgb(238, 255, 255);
    private static final int SECONDARY = Color.rgb(164, 192, 203);
    private static final int ACCENT = Color.rgb(91, 232, 208);
    private static final long RESUME_SIGNAL_DELAY_MS = 180L;
    private static final String RESUME_SCRIPT = "(function(){"
            + "window.dispatchEvent(new Event('pageshow'));"
            + "if(navigator.onLine){window.dispatchEvent(new Event('online'));}"
            + "document.dispatchEvent(new Event('visibilitychange'));"
            + "})();";

    private WebView webView;
    private LinearLayout connectionPanel;
    private TextView connectionTitle;
    private TextView connectionDetail;
    private ProgressBar progress;
    private Button retryButton;
    private boolean pageVisible;
    private long pausedAt;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private final Runnable resumeRunnable = this::evaluateResumeScript;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(createContentView());
        configureImmersiveWindow();
        configureWebView();
        registerNetworkCallback();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    this::handleBack);
        }

        Uri launchUri = getIntent().getData();
        String initialUrl = launchUri != null && NavigationPolicy.isTrusted(launchUri.toString())
                ? launchUri.toString()
                : BuildConfig.CARTOLITE_URL;
        webView.loadUrl(initialUrl);
    }

    private View createContentView() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BACKGROUND);

        webView = new WebView(this);
        webView.setBackgroundColor(BACKGROUND);
        webView.setAlpha(0f);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

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
        retryButton.setOnClickListener(view -> {
            showConnecting();
            webView.reload();
        });
        connectionPanel.addView(retryButton, linearParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                dp(48),
                0, 0, 0, 0));

        FrameLayout.LayoutParams panelParams = new FrameLayout.LayoutParams(
                Math.min(dp(390), getResources().getDisplayMetrics().widthPixels - dp(32)),
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER);
        root.addView(connectionPanel, panelParams);
        return root;
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
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getDecorView().getWindowInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    private void registerNetworkCallback() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                runOnUiThread(() -> {
                    if (pageVisible) {
                        signalNativeResume();
                    } else if (connectionPanel.getVisibility() == View.VISIBLE) {
                        webView.reload();
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
        if (!pageVisible || webView == null) {
            return;
        }
        webView.removeCallbacks(resumeRunnable);
        webView.postDelayed(resumeRunnable, RESUME_SIGNAL_DELAY_MS);
    }

    private void evaluateResumeScript() {
        if (pageVisible && webView != null) {
            webView.evaluateJavascript(RESUME_SCRIPT, null);
        }
    }

    private void showConnecting() {
        pageVisible = false;
        connectionTitle.setText(R.string.connecting_title);
        connectionDetail.setText(R.string.connecting_detail);
        progress.setVisibility(View.VISIBLE);
        retryButton.setVisibility(View.GONE);
        connectionPanel.animate().cancel();
        connectionPanel.setAlpha(1f);
        connectionPanel.setVisibility(View.VISIBLE);
    }

    private void showConnectionProblem(int title, int detail) {
        pageVisible = false;
        connectionTitle.setText(title);
        connectionDetail.setText(detail);
        progress.setVisibility(View.GONE);
        retryButton.setVisibility(View.VISIBLE);
        connectionPanel.animate().cancel();
        connectionPanel.setAlpha(1f);
        connectionPanel.setVisibility(View.VISIBLE);
    }

    private void revealPage() {
        pageVisible = true;
        webView.animate().alpha(1f).setDuration(220L).start();
        connectionPanel.animate()
                .alpha(0f)
                .setDuration(180L)
                .withEndAction(() -> connectionPanel.setVisibility(View.GONE))
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
            startActivity(intent);
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_SHORT).show();
        }
    }

    private boolean handleNavigation(WebResourceRequest request) {
        String url = request.getUrl().toString();
        if (NavigationPolicy.isTrusted(url)) {
            return false;
        }
        if (request.hasGesture()) {
            openExternalWebLink(url);
        }
        return true;
    }

    private void handleBack() {
        if (webView.canGoBack()) {
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
        configureImmersiveWindow();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
            if (pausedAt > 0 && SystemClock.elapsedRealtime() > pausedAt) {
                signalNativeResume();
            }
        }
    }

    @Override
    protected void onPause() {
        pausedAt = SystemClock.elapsedRealtime();
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (networkCallback != null && connectivityManager != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (IllegalArgumentException ignored) {
                // Already unregistered by the platform.
            }
        }
        if (webView != null) {
            webView.removeCallbacks(resumeRunnable);
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

    private final class CartoWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleNavigation(request);
        }

        @SuppressWarnings("deprecation")
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (NavigationPolicy.isTrusted(url)) {
                return false;
            }
            openExternalWebLink(url);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            showConnecting();
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            super.onPageCommitVisible(view, url);
            if (NavigationPolicy.isTrusted(url)) {
                revealPage();
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (NavigationPolicy.isTrusted(url) && !pageVisible) {
                revealPage();
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (request.isForMainFrame()) {
                showConnectionProblem(R.string.connection_title, R.string.connection_detail);
            }
        }

        @Override
        public void onReceivedHttpError(
                WebView view,
                WebResourceRequest request,
                WebResourceResponse errorResponse) {
            super.onReceivedHttpError(view, request, errorResponse);
            if (request.isForMainFrame() && errorResponse.getStatusCode() >= 400) {
                showConnectionProblem(R.string.service_title, R.string.service_detail);
            }
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
            showConnectionProblem(R.string.security_title, R.string.security_detail);
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            ViewGroup parent = (ViewGroup) view.getParent();
            if (parent != null) {
                parent.removeView(view);
            }
            view.destroy();
            webView = null;
            recreate();
            return true;
        }
    }

    private final class CartoWebChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            super.onProgressChanged(view, newProgress);
            if (!pageVisible && retryButton.getVisibility() != View.VISIBLE) {
                connectionDetail.setText(getString(R.string.loading_progress, newProgress));
            }
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            request.deny();
        }
    }
}
