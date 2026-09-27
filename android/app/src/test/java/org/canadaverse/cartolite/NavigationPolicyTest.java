package org.canadaverse.cartolite;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class NavigationPolicyTest {
    @Test
    public void trustedOriginRequiresExactHttpsHost() {
        assertTrue(NavigationPolicy.isTrusted("https://carto.canadaverse.org/"));
        assertTrue(NavigationPolicy.isTrusted("https://carto.canadaverse.org/labs/?experiment=packet-pond"));
        assertTrue(NavigationPolicy.isTrusted("https://CARTO.canadaverse.org/?embed=background"));
        assertTrue(NavigationPolicy.isTrusted("https://carto.canadaverse.org:443/api/state"));
        assertFalse(NavigationPolicy.isTrusted("http://carto.canadaverse.org/"));
        assertFalse(NavigationPolicy.isTrusted("https://carto.canadaverse.org.evil.example/"));
        assertFalse(NavigationPolicy.isTrusted("https://user@carto.canadaverse.org/"));
        assertFalse(NavigationPolicy.isTrusted("https://carto.canadaverse.org:444/"));
    }

    @Test
    public void onlyHttpsLinksCanLeaveTheApp() {
        assertTrue(NavigationPolicy.isExternalWebLink("https://canadaverse.org/"));
        assertFalse(NavigationPolicy.isExternalWebLink("http://example.org/"));
        assertFalse(NavigationPolicy.isExternalWebLink("intent://carto.canadaverse.org/"));
        assertFalse(NavigationPolicy.isExternalWebLink("file:///data/local/tmp/test"));
        assertFalse(NavigationPolicy.isExternalWebLink("javascript:alert(1)"));
        assertFalse(NavigationPolicy.isExternalWebLink("https://user:password@example.org/"));
        assertFalse(NavigationPolicy.isExternalWebLink("https://example.org:65536/"));
    }

    @Test
    public void lastViewDoesNotPersistQueriesOrUnrelatedPaths() {
        assertEquals("netgraph/", NavigationPolicy.viewPath("https://carto.canadaverse.org/netgraph/?node=example#focus"));
        assertEquals("", NavigationPolicy.viewPath("https://carto.canadaverse.org/?node=example"));
        assertEquals("", NavigationPolicy.viewPath("https://carto.canadaverse.org/netgraph-other/"));
        assertEquals("", NavigationPolicy.viewPath("https://other.example/netgraph/"));
        assertEquals("", NavigationPolicy.viewPath(null));
    }
}
