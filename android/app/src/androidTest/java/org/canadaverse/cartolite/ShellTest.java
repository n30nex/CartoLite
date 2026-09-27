package org.canadaverse.cartolite;

import android.net.Uri;
import android.view.View;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ShellTest {
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
            scenario.recreate();
            awaitPage(scenario);
            scenario.onActivity(activity -> assertTrue(((WebView)activity.findViewById(R.id.web_view)).getUrl().contains("netgraph")));
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
                assertEquals(View.VISIBLE, activity.findViewById(R.id.retry_button).getVisibility());
            });
            Thread.sleep(600);
            scenario.onActivity(activity -> assertEquals(View.VISIBLE,activity.findViewById(R.id.connection_panel).getVisibility()));
        }
    }
    private static void awaitPage(ActivityScenario<FixtureActivity> scenario) throws Exception {
        AtomicBoolean ready = new AtomicBoolean();
        for(int i=0;i<150&&!ready.get();i++) {
            scenario.onActivity(activity -> ready.set(activity.findViewById(R.id.connection_panel).getVisibility()!=View.VISIBLE));
            Thread.sleep(100);
        }
        assertTrue("Synthetic WebView should become visible",ready.get());
    }
}
