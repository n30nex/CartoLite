# CartoLite for webOS TV

Installable `org.canadaverse.cartolite` webOS application. Bundles the actual
default map, LiveFeed cursor/recovery logic, PacketAnimator and RouteSonifier.
Targets webOS 5 / Chromium 68 with WebGL 2 and Canvas2D effect fallback.
The public HTTPS snapshot and event stream supply sanitized traffic only.

## Remote

- OK on **Enable live sound** unlocks audio using a real remote gesture.
- **Move map**: arrows pan; OK returns to the dock.
- Channel up/down zoom. Canada resets the view. Live Follow tracks packets.
- Red toggles sound, green toggles Follow, yellow resets, blue opens settings.
- Back leaves controls for the map; Back again closes the app.
- Sound settings retain the default map's voices, preview and volume controls.

Sound resumes only after interaction on a new launch. Hidden/replayed packets
remain silent, following the shared web app's policy. Settings are local to this
app. No root permission, shell service or browser-server bridge is required.

## Build and validation

Use the existing GitHub Actions CI webOS job. It installs locked web dependencies,
runs compatibility tests/type checking, builds Chromium 68 page/worker bundles,
and creates a deterministic IPK plus SHA256SUMS and exact-commit build metadata.
Do not build on the workstation. The website's normal build is unchanged.

Install the IPK with the webOS SDK or a rooted TV's package installer, then launch
`org.canadaverse.cartolite`. Device acceptance must verify map tiles/nodes, a
fresh live animation, a trusted-gesture audio start, remote navigation and
hide/resume recovery. CI alone does not establish physical audio audibility.

Rollback: uninstall this app. It does not modify firmware, system settings,
Developer Mode, the public website, or other installed apps.
