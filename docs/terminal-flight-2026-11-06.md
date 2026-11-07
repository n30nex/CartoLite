# Terminal flight - Canada 0.23.0

An opt-in, glowing **Fly 3D** control opens the existing geographic Terminal
scene to first-person flight. Use MapLibre 6.15's public camera APIs and the
existing GPU ASCII pass; retain one feed, the packet clock and the current map.

- Keyboard movement, drag-to-look, height controls and touch movement buttons.
  Drag up to look up; Look down restores a useful downward angle without moving.
- Real terrain and OpenFreeMap building extrusions, with ASCII face shading.
- Polygon node beacons at public node coordinates; their size is illustrative,
  not an antenna-height measurement. Existing inspection and Find remain usable.
- Near-camera clipping prevents behind-camera packet projections from appearing
  in the sky. Route identity and progress remain unchanged.
- No automatic flight on startup. Exit restores the prior camera and map layers;
  Terminal fonts, colours, route style, sound and volume remain intact.
- Pause input on focus loss, hidden tabs, menus and graphics loss. Release all
  camera controls and resources on exit. Missing terrain is labelled explicitly.

All automated builds, tests and browser artifacts run in Actions. Acceptance
covers mouse/keyboard/touch, looked-up views, buildings and node polygons,
packet progression, settings restoration, context recovery, missing terrain,
phone bounds and the existing performance/privacy/topology gates. Deploy the
exact tested Canada image after encrypted backup and isolated restore, then
verify public pages, traffic, checkpoint progress and sustained health.

References: [MapLibre first-person example](https://github.com/maplibre/maplibre-gl-js/blob/v6.15.0/test/examples/walk-around-a-map-in-first-person.html)
and [camera centre/elevation model](https://github.com/maplibre/maplibre-gl-js/blob/v6.15.0/developer-guides/center-point.md).

The source includes implementation and focused acceptance checks. Exact Actions,
image and live deployment evidence belongs to the tagged release record;
source implementation alone is not deployment proof. Worldwide is outside this patch.
