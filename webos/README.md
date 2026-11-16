# CartoLite for webOS TV

Installable `org.canadaverse.cartolite` webOS application. Bundles the actual
default map, LiveFeed cursor/recovery logic, PacketAnimator and RouteSonifier.
Targets webOS 5 / Chromium 68 with WebGL 2 and Canvas2D effect fallback.
The public HTTPS snapshot and event stream supply sanitized traffic only.

## Remote

- OK on **Enable live sound** unlocks audio using a real remote gesture.
- **Move map**: arrows pan; OK returns to the dock.
- Channel up/down zoom. YKF area returns to Cambridge–Kitchener–Guelph. Live Follow tracks packets.
- Red toggles sound, green toggles Follow, yellow resets, blue opens settings.
- Back leaves controls for the map; Back again closes the app.
- Sound settings retain the default map's voices, preview and volume controls.

Sound resumes only after interaction on a new launch. Hidden/replayed packets
remain silent, following the shared web app's policy. Settings are local to this
app. No root permission, shell service or browser-server bridge is required.

## Build and validation

Use the existing GitHub Actions CI webOS job. It installs locked web dependencies,
runs compatibility tests/type checking, builds Chromium 68 page/worker bundles,
and uses the official webOS CLI 3.2.6 to create an IPK plus SHA256SUMS and exact-commit build metadata.
Do not build on the workstation. The website's normal build is unchanged.

Install the IPK with the webOS SDK or a rooted TV's package installer, then launch
`org.canadaverse.cartolite`. Device acceptance must verify map tiles/nodes, a
fresh live animation, a trusted-gesture audio start, remote navigation and
hide/resume recovery. CI alone does not establish physical audio audibility.

Rollback: uninstall this app. It does not modify firmware, system settings,
Developer Mode, the public website, or other installed apps.

## TV layout and performance

The app starts in the YKF area on every launch. Its 1280×720 UI is scaled by the TV, with 1× drawing buffers and a 30 fps effect budget. Route timing and live sound remain shared with the default map; only lingering decoration is bounded more tightly.

Options opens a fixed, scrollable panel inside the screen. Map/display, sound and Find share that panel. Focus stays in the open panel; Back closes it and returns focus to Options. Up/down moves between controls; left/right adjusts selects and sliders. The floating website toolbar is hidden in this package.
