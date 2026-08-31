# Browser privacy

CartoLite publishes only schema v2 node, route, status, and sanitized packet-kind data. Full public keys, observer keys, raw paths, packet hashes, packet payloads, message text, credentials, resolver reasons, and visitor analytics remain outside the public response and event stream.

The Node Finder searches the public node labels already present in `/api/state`. Queries never leave the browser and are neither logged nor persisted. Duplicate labels stay distinct internally by opaque public node ID, but the Finder and inspector do not expose public or private keys.

The browser stores only these visitor choices:

- separate versioned desktop and mobile map views;
- layer, route-window, and legend preferences;
- `{enabled, volume, scene}` under `cartolite:sound:v2`.

The v1 sound record is read only for migration to the Aurora scene. Remembered sound still shows **Tap to Resume** and cannot create or resume an `AudioContext` before a user gesture. Inspector selection and Finder queries are session state only.

The node inspector uses DOM text nodes for labels and route context. Public labels are never inserted as HTML.
