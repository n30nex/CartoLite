package org.canadaverse.cartolite;

import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
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
        Intent intent = new Intent(ApplicationProvider.getApplicationContext(), FixtureActivity.class);
        intent.setData(Uri.parse(NavigationPolicy.CANADA_URL + "fixture-error"));
        try (ActivityScenario<FixtureActivity> scenario = ActivityScenario.launch(intent)) {
            AtomicBoolean failed = new AtomicBoolean();
            for (int i=0;i<100&&!failed.get();i++) {
                scenario.onActivity(activity -> failed.set(activity.findViewById(R.id.retry_button).getVisibility()==View.VISIBLE));
                Thread.sleep(100);
            }
            assertTrue("HTTP failure should offer retry", failed.get());
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
