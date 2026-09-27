package org.canadaverse.cartolite;

import java.net.URI;
import java.net.URISyntaxException;

final class NavigationPolicy {
    static final String CANADA_URL = "https://carto.canadaverse.org/";

    private NavigationPolicy() {
    }

    static boolean isTrusted(String rawUrl) {
        URI uri = secureUri(rawUrl);
        return uri != null && "carto.canadaverse.org".equalsIgnoreCase(uri.getHost())
                && effectivePort(uri) == 443;
    }

    static boolean isExternalWebLink(String rawUrl) {
        return secureUri(rawUrl) != null;
    }

    static String viewPath(String rawUrl) {
        URI uri = isTrusted(rawUrl) ? secureUri(rawUrl) : null;
        if (uri != null && ("/netgraph/".equals(uri.getPath()) || "/netgraph".equals(uri.getPath()))) {
            return "netgraph/";
        }
        if (uri != null && ("/labs/".equals(uri.getPath()) || "/labs".equals(uri.getPath()))) return "labs/";
        return "";
    }

    static String lastViewUrl(String view) {
        return CANADA_URL + ("netgraph/".equals(view) || "labs/".equals(view) ? view : "");
    }

    private static int effectivePort(URI uri) {
        return uri.getPort() == -1 ? 443 : uri.getPort();
    }

    private static URI secureUri(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            return null;
        }
        try {
            URI uri = new URI(rawUrl);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
                    && !uri.getHost().contains("%") && uri.getRawUserInfo() == null
                    && (uri.getPort() == -1 || (uri.getPort() > 0 && uri.getPort() <= 65535))
                    ? uri : null;
        } catch (URISyntaxException ignored) {
            return null;
        }
    }
}
