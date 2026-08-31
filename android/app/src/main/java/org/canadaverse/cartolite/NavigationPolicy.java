package org.canadaverse.cartolite;

import java.net.URI;
import java.net.URISyntaxException;

final class NavigationPolicy {
    private static final String TRUSTED_SCHEME = "https";
    private static final String TRUSTED_HOST = "carto.canadaverse.org";

    private NavigationPolicy() {
    }

    static boolean isTrusted(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) {
            return false;
        }
        try {
            URI uri = new URI(rawUrl);
            return TRUSTED_SCHEME.equalsIgnoreCase(uri.getScheme())
                    && TRUSTED_HOST.equalsIgnoreCase(uri.getHost())
                    && uri.getUserInfo() == null
                    && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (URISyntaxException ignored) {
            return false;
        }
    }

    static boolean isExternalWebLink(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) {
            return false;
        }
        try {
            URI uri = new URI(rawUrl);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null;
        } catch (URISyntaxException ignored) {
            return false;
        }
    }
}
