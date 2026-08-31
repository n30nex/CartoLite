# Browser and Android app privacy

CartoLite publishes only schema v2 node, route, status, and sanitized packet-kind data. Full public keys, observer keys, raw paths, packet hashes, packet payloads, message text, credentials, resolver reasons, and visitor analytics remain outside the public response and event stream.

The Node Finder searches the public node labels already present in `/api/state`. Queries never leave the browser and are neither logged nor persisted. Duplicate labels stay distinct internally by opaque public node ID, but the Finder and inspector do not expose public or private keys.

The browser stores only these visitor choices:

- separate versioned desktop and mobile map views;
- layer choices including Clusters, Topography, and 3D, plus route-window and legend preferences;
- `{enabled, volume, scene}` under `cartolite:sound:v2`.

The v1 sound record is read only for migration to the Aurora scene. Remembered sound still shows **Tap to Resume** and cannot create or resume an `AudioContext` before a user gesture. Inspector selection and Finder queries are session state only.

The node inspector uses DOM text nodes for labels and route context. Public labels are never inserted as HTML.

Topography and 3D are off by default. Enabling either makes normal attributed elevation-tile requests from the visitor's browser to Mapterhorn; CartoLite adds no identifier, query, analytics, or packet data to those requests. The CARTO vector map and optional MeshMapper region request retain their documented browser-network behavior.

The Android app requests only `INTERNET` and `ACCESS_NETWORK_STATE`, both normal permissions with no runtime prompt. It disables cookies, cleartext traffic, file and content access, cloud backup, device transfer, JavaScript bridges, and all WebView permission requests. Top-level navigation stays on the exact CartoLite HTTPS origin; deliberate external web links open in the visitor's browser. The APK contains no MQTT credentials, CARTO key, live state, visitor identifier, or update tracker.
