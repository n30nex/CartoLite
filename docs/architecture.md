# Architecture

CartoLite is designed around a single bounded event loop rather than a database-backed application platform.

```text
MeshCore MQTT
      |
 bounded ingest channel
      |
 single-owner engine ---- atomic /data/state-v1.json (internal schema)
      |
 normalized public v2 projection
      +---- GET /api/state
      +---- GET /api/events (SSE)
      +---- embedded MapLibre + Canvas2D page
```

The engine alone owns nodes, observers, prefix indexes, routes, sequence numbers, and counters. Each route retains only its newest sanitized packet kind and one activity scalar capped at 64 with a 15-minute half-life; there is no traffic history. MQTT callbacks decode and enqueue bounded input. Slow SSE clients are disconnected, so they cannot apply backpressure to ingest. Dirty public state is serialized at most once per second. Routes reference node IDs instead of embedding repeated endpoint objects.

## Route truth

A public route exists only when every path prefix selects exactly one forwarder-capable node in the same allowlisted region and each segment has coordinates and RF evidence. Duplicate or ambiguous prefixes, non-forwarder roles, missing coordinates, missing RF evidence, non-trace four-byte paths, and distance-gated segments fail closed. Unresolved activity produces an observer aura, never an invented line.

## Durable state

The checkpoint contains current sanitized topology plus private resolver keys required to recover it. It contains no packet or event history, message text, credentials, or live capture. Dirty state is saved at most once every five minutes and again during a clean shutdown. Before each save, routes older than 24 hours are removed and nodes that have been unreferenced for more than 30 days are removed. Writes use a same-directory temporary file, fsync, mode `0600`, and atomic rename. A failed write keeps the checkpoint dirty for retry and fails readiness. Corrupt or incompatible existing state is an explicit startup error, not silently discarded state.

## Client recovery

`/api/state` is authoritative. SSE supplies low-latency deltas and retains a bounded 4,096-event replay window. The browser reconnects with its `bootId` and last applied sequence; a changed boot, sequence gap, expired cursor, or `reset` event triggers one state refresh. Snapshot recovery updates topology without replaying animations.

The browser batches route events for one second and resolves endpoint IDs through its node index. Nodes and heat use incremental MapLibre GeoJSON updates. Stable route data has no visual count ceiling: every valid route in the complete 24-hour public topology is loaded once as an exact `LineString`. Two additional representations combine nearby endpoint cells into national and regional trunks. Their endpoints are fixed cell anchors, and each feature carries separate 15-minute, one-hour, six-hour, and 24-hour counts and visual weights. Trunks and exact lines use separate MapLibre sources, all preloaded before the initial map becomes idle. Route aggregation runs in animation-frame slices and retains the previous complete source until an actual topology replacement is ready. Route-window and automatic zoom-window changes update one MapLibre global style value; source geometry stays untouched. The GPU therefore keeps routes anchored during pan, zoom, window selection, and node focus without application-side reprojection or a screen-fixed bitmap swap. Actual packet and node-coordinate deltas update only changed exact lines and affected trunks. An invisible wide line layer provides selected-route hit testing and tooltips, with the same global age filter as the visible lines. A one-minute global clock expires lines without rebuilding their sources. A minimal CARTO vector style supplies land, water, boundaries, roads, and place labels below the live overlays. National scale uses clusters, an active heat layer, and a 15-minute automatic route window. The heat summary keeps the 600 strongest active-node weights, while the complete node and route topology remains available to route rendering, live processing, packet animation, and sound. The window expands through one hour and six hours to 24 hours at local detail. The optional MeshMapper regions asset is fetched only on first use. A dedicated Web Worker parses it, fails closed unless the exact 34-code snapshot and every closed ring remain valid, and sends boundary pieces to the page in bounded messages. Because CartoLite fixes pitch and bearing at zero, Canvas2D uses equivalent direct Web Mercator projection for at most 1,024 vertices per animation frame, paints collision-aware region codes on the same canvas, and preserves every polygon edge. MapLibre retains the source attribution without ingesting the geometry. This keeps the unsimplified 46,449-vertex overlay responsive over the full live topology.

Canvas2D owns only event-driven, distance-aware curved energy ribbons, comets, protocol signatures, relay and endpoint light, observer pings, four-second node wakes, and progressively revealed 15-second route trails. Completed packet residue uses its own offscreen bitmap buffer, so persistent MapLibre routes never need repainting on the animation canvas. Every visible route keeps its travel and relay cues during bursts; narrow, coarse-pointer, or heavily active views instead reduce secondary signatures, observer rings, residue, pixel ratio, and frame cadence. Effects wholly outside the viewport remain discarded. Hiding historical routes never hides recent packet motion. Live Follow can frame the complete route only for traffic already inside the current view, or traffic touching a selected node; manual dragging disables it. The saved viewport uses browser-local storage and never leaves the visitor's device.

Route sonification is opt-in and visitor-local. The browser stores only `{enabled, volume}` and never creates or resumes its native Web Audio context without a fresh user gesture. Remembered sound therefore starts as Tap to Resume. Every public route segment crossing the exact viewport becomes one warm pentatonic sine/triangle note, scheduled with the same distance weights as its Canvas2D animation and panned from its on-screen midpoint. Burst density shortens and softens envelopes but never discards a visible hop. A short delay supplies restrained ambience. Off-screen hops and observer-only events are silent, and hiding the page stops active sound. No audio, visitor telemetry, or expanded packet fields leave the browser.

Desktop and mobile view preferences use separate versioned browser keys. A restored view is accepted only when its bounds contain a node active in the last 24 hours; otherwise CartoLite returns to the live activity home view. On phones, secondary map layers and the route-age window stay in one compact disclosure while status, Follow, Sound, and Home remain directly available.
