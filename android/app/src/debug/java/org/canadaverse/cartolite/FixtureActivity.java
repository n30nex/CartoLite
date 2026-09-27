package org.canadaverse.cartolite;

import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/** No live broker, tiles or public site requests in instrumentation tests. */
public final class FixtureActivity extends MainActivity {
    @Override protected WebResourceResponse fixtureResponse(WebResourceRequest request) {
        boolean error = request.getUrl().getPath().contains("fixture-error");
        String body = "<!doctype html><meta name='viewport' content='width=device-width'><title>Synthetic CartoLite</title>"
                + "<style>body{background:#071319;color:#efffff;font:18px sans-serif}a,button{padding:16px;color:inherit}</style>"
                + "<h1>Synthetic Canada map</h1><p>Fixture traffic only</p><a href='/netgraph/'>Netgraph</a>"
                + "<a href='/'>Map</a><button onclick=\"history.pushState({},'', '?panel=layers');document.getElementById('panel').hidden=false\">Layers</button>"
                + "<section id='panel' hidden>Fixture layers</section><script>onpopstate=()=>document.getElementById('panel').hidden=true</script>";
        return new WebResourceResponse("text/html", "UTF-8", error ? 503 : 200, error ? "Unavailable" : "OK", Collections.emptyMap(),
                new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    }
}
