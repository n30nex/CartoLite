package org.canadaverse.cartolite;

import android.net.Uri;
import android.content.Context;
import android.webkit.RenderProcessGoneDetail;
import android.view.View;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.Before;
import org.junit.After;
import org.junit.runner.RunWith;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.CountDownLatch;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ShellTest {
    @Before public void resetSyntheticPreferences() {
        ApplicationProvider.<Context>getApplicationContext().getSharedPreferences("android", Context.MODE_PRIVATE).edit().clear().commit();
    }
    @After public void releaseFixture() {
        if (FixtureActivity.pendingResponse != null) FixtureActivity.pendingResponse.countDown();
        FixtureActivity.pendingResponse = null;
    }

    @Test public void opensTheChosenCanadaViewWithoutRewritingOtherPreferences() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        context.getSharedPreferences("android", Context.MODE_PRIVATE).edit()
                .putString("start_view", "labs/").putString("last_view", "netgraph/")
                .putBoolean("fullscreen", false).putBoolean("keep_awake", false).commit();
        try (ActivityScenario<FixtureActivity> scenario = ActivityScenario.launch(FixtureActivity.class)) {
            awaitPage(scenario);
            scenario.onActivity(activity -> {
                WebView web = activity.findViewById(R.id.web_view);
                assertEquals(NavigationPolicy.CANADA_URL + "labs/", web.getUrl());
                assertFalse(activity.getSharedPreferences("android", Context.MODE_PRIVATE).getBoolean("fullscreen", true));
                assertEquals(0, activity.getWindow().getAttributes().flags & android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
    }
    @Test public void syntheticPageSurvivesRecreationAndHasOneNativeOptionsControl() throws Exception {
        try (ActivityScenario<FixtureActivity> scenario = ActivityScenario.launch(FixtureActivity.class)) {
            awaitPage(scenario);
            scenario.onActivity(activity -> {
                assertNotNull(activity.findViewById(R.id.app_button));
                assertNull(activity.findViewById(R.id.map_button));
                assertNull(activity.findViewById(R.id.netgraph_button));
                WebView web = activity.findViewById(R.id.web_view);
                assertFalse(web.getSettings().getAllowFileAccess());
                assertFalse(web.getSettings().getAllowContentAccess());
                assertTrue(web.getSettings().getMediaPlaybackRequiresUserGesture());
                web.loadUrl(NavigationPolicy.CANADA_URL + "netgraph/");
            });
            awaitPage(scenario);
            scenario.onActivity(activity -> assertTrue(((WebView) activity.findViewById(R.id.web_view)).canGoBack()));
            scenario.recreate();
            awaitPage(scenario);
            scenario.onActivity(activity -> {
                WebView web = activity.findViewById(R.id.web_view);
                assertTrue(web.getUrl().contains("netgraph"));
                assertTrue("Back history survives recreation", web.canGoBack());
                web.goBack();
            });
            awaitPage(scenario);
            scenario.onActivity(activity -> assertEquals(NavigationPolicy.CANADA_URL, ((WebView)activity.findViewById(R.id.web_view)).getUrl()));
        }
    }
    @Test public void httpErrorIsNotHiddenByPageFinished() throws Exception {
        try (ActivityScenario<FixtureActivity> scenario = ActivityScenario.launch(FixtureActivity.class)) {
            awaitPage(scenario);
            scenario.onActivity(activity -> {
                WebView web = activity.findViewById(R.id.web_view);
                final Uri current = Uri.parse(web.getUrl());
                android.webkit.WebResourceRequest request = new android.webkit.WebResourceRequest() {
                    public Uri getUrl() { return current; }
                    public boolean isForMainFrame() { return true; }
                    public boolean isRedirect() { return false; }
                    public boolean hasGesture() { return false; }
                    public String getMethod() { return "GET"; }
                    public java.util.Map<String,String> getRequestHeaders() { return java.util.Collections.emptyMap(); }
                };
                android.webkit.WebResourceResponse response = new android.webkit.WebResourceResponse("text/html", "UTF-8", 503, "Unavailable", java.util.Collections.emptyMap(), null);
                // Intercepted synthetic responses do not generate the platform HTTP callback.
                // Exercise the real installed client's error -> finish ordering explicitly.
                web.getWebViewClient().onReceivedHttpError(web, request, response);
                web.getWebViewClient().onPageFinished(web, NavigationPolicy.CANADA_URL);
                web.getWebViewClient().onPageCommitVisible(web, current.toString());
                assertEquals(View.VISIBLE, activity.findViewById(R.id.retry_button).getVisibility());
            });
            Thread.sleep(600);
            scenario.onActivity(activity -> assertEquals(View.VISIBLE,activity.findViewById(R.id.connection_panel).getVisibility()));
        }
    }

    @Test public void rendererFailureRequiresRetryAndRecreatesOnlyTheWebView() throws Exception {
        try (ActivityScenario<FixtureActivity> scenario = ActivityScenario.launch(FixtureActivity.class)) {
            awaitPage(scenario);
            scenario.onActivity(activity -> {
                WebView web = activity.findViewById(R.id.web_view);
                assertTrue(web.getWebViewClient().onRenderProcessGone(web, new RenderProcessGoneDetail() {
                    public boolean didCrash() { return true; }
                    public int rendererPriorityAtExit() { return WebView.RENDERER_PRIORITY_IMPORTANT; }
                }));
                assertNull(activity.findViewById(R.id.web_view));
                assertNotNull(activity.findViewById(R.id.app_button));
                assertEquals(View.VISIBLE, activity.findViewById(R.id.retry_button).getVisibility());
                activity.findViewById(R.id.retry_button).performClick();
            });
            awaitPage(scenario);
            scenario.onActivity(activity -> assertNotNull(activity.findViewById(R.id.web_view)));
        }
    }

    @Test public void aLateCommittedPageRecoversTheTimeoutWithoutAnotherReload() throws Exception {
        try (ActivityScenario<FixtureActivity> scenario = ActivityScenario.launch(FixtureActivity.class)) {
            awaitPage(scenario);
            FixtureActivity.pendingResponse = new CountDownLatch(1);
            scenario.onActivity(activity -> ((WebView) activity.findViewById(R.id.web_view)).loadUrl(NavigationPolicy.CANADA_URL + "fixture-wait/"));
            AtomicBoolean retryVisible = new AtomicBoolean();
            for (int i = 0; i < 400 && !retryVisible.get(); i++) {
                scenario.onActivity(activity -> retryVisible.set(activity.findViewById(R.id.retry_button).getVisibility() == View.VISIBLE));
                Thread.sleep(100);
            }
            assertTrue("A stalled page offers recovery after the bounded timeout", retryVisible.get());
            FixtureActivity.pendingResponse.countDown();
            awaitPage(scenario);
            scenario.onActivity(activity -> assertEquals(NavigationPolicy.CANADA_URL + "fixture-wait/", ((WebView) activity.findViewById(R.id.web_view)).getUrl()));
        }
    }
    @Test public void staleCompletionCannotRevealANewerNavigation() throws Exception {
        try (ActivityScenario<FixtureActivity> scenario = ActivityScenario.launch(FixtureActivity.class)) {
            awaitPage(scenario);
            scenario.onActivity(activity -> {
                WebView web = activity.findViewById(R.id.web_view);
                web.getWebViewClient().onPageStarted(web, NavigationPolicy.CANADA_URL + "netgraph/", null);
                web.getWebViewClient().onPageCommitVisible(web, NavigationPolicy.CANADA_URL);
                web.getWebViewClient().onPageFinished(web, NavigationPolicy.CANADA_URL);
            });
            Thread.sleep(600);
            scenario.onActivity(activity -> {
                assertEquals(View.GONE, activity.findViewById(R.id.connection_panel).getVisibility());
                assertEquals(View.VISIBLE, activity.findViewById(R.id.load_progress).getVisibility());
                WebView web = activity.findViewById(R.id.web_view);
                web.getWebViewClient().onPageFinished(web, NavigationPolicy.CANADA_URL + "netgraph/");
                assertEquals("Finished is not a visible frame", View.VISIBLE, activity.findViewById(R.id.load_progress).getVisibility());
                web.getWebViewClient().onPageCommitVisible(web, NavigationPolicy.CANADA_URL + "netgraph/");
            });
            awaitPage(scenario);
        }
    }
    private static void awaitPage(ActivityScenario<FixtureActivity> scenario) throws Exception {
        AtomicBoolean ready = new AtomicBoolean();
        for(int i=0;i<150&&!ready.get();i++) {
            scenario.onActivity(activity -> {
                WebView web = activity.findViewById(R.id.web_view);
                ready.set(web != null && web.getProgress() == 100
                        && activity.findViewById(R.id.connection_panel).getVisibility()!=View.VISIBLE
                        && activity.findViewById(R.id.load_progress).getVisibility()!=View.VISIBLE);
            });
            Thread.sleep(100);
        }
        assertTrue("Synthetic WebView should become visible",ready.get());
    }
}
