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

The browser batches route events for one second and resolves endpoint IDs through its node index. Nodes and heat use incremental MapLibre GeoJSON updates. Stable route data has no visual count ceiling: every valid route in the complete 24-hour public topology is loaded once as an exact `LineString`. Two additional representations combine nearby endpoint cells into national and regional trunks. Their endpoints are fixed cell anchors, and each feature carries separate 15-minute, one-hour, six-hour, and 24-hour counts and visual weights. Same-cell totals remain accounted for but their artificial loop glyphs are not drawn. National, regional, and exact layers occupy mutually exclusive zoom bands. Route-window changes select precomputed trunk metrics through MapLibre state without rewriting geometry, and only the active route representation is enabled. Route aggregation runs in animation-frame slices and retains the previous complete source until an actual topology replacement is ready. Exact lines are assigned to four static age-band layers. The GPU therefore keeps routes anchored during pan, zoom, window selection, and node focus without application-side reprojection or a screen-fixed bitmap swap. Actual packet and node-coordinate deltas update only changed exact lines and affected trunks. A small selected-route source provides the visible connected-route glow and hit testing admits only selected-node routes inside the active age window. A one-minute clock incrementally moves only routes that cross an age boundary and removes routes that expire. A minimal CARTO vector style supplies land, water, boundaries, roads, and place labels below the live overlays. National scale uses clusters, an active heat layer, and a 15-minute automatic route window. The heat summary keeps the 600 strongest active-node weights, while the complete node and route topology remains available to route rendering, live processing, packet animation, and sound. The window expands through one hour and six hours to 24 hours at local detail. The optional MeshMapper regions asset is fetched only on first use. A dedicated Web Worker parses it and fails closed unless the exact 34-code snapshot and every closed ring remain valid. It then supplies the unsimplified 46,449 vertices and region labels to a zero-tolerance native MapLibre source, so regions and the basemap use the same camera frame and cannot drift during pan or zoom.

Canvas2D owns only event-driven packet motion: a sharp coloured core, short tapered glow, restrained trailing sparks, protocol signature, relay handoff, endpoint light, observer pings, four-second node wakes, and 15-second route residue. All travel uses the same straight projected segment as the MapLibre historical route. Completed residue uses its own offscreen bitmap buffer, so persistent routes never need repainting on the animation canvas. Every visible route keeps its travel and relay cues during bursts; narrow, coarse-pointer, or heavily active views instead reduce sparks, signatures, observer rings, residue resolution, pixel ratio, and frame cadence. Effects wholly outside the viewport remain discarded. Hiding historical routes never hides recent packet motion. Live Follow frames valid live activity even when it begins off-screen; selecting a node narrows Follow to traffic touching that node, and manual pan or zoom cancels it. The saved viewport uses browser-local storage and never leaves the visitor's device.

Route sonification is opt-in and visitor-local. The browser stores only `{enabled, volume, scene}` under `cartolite:sound:v2` and never creates or resumes its native Web Audio context without a fresh user gesture. Remembered sound therefore starts as Tap to Resume. Aurora, Wood, and Chimes use cached native `PeriodicWave` definitions with deterministic packet, route, and hop variation. Every public route segment crossing the exact viewport becomes one articulation and one oscillator, scheduled with the same distance-weighted handoff timeline as its Canvas2D animation and panned from its on-screen midpoint. Burst density shortens and softens envelopes but never discards a visible hop. Off-screen hops and observer-only events are silent, and hiding the page stops active sound. No audio, query, visitor telemetry, or expanded packet fields leave the browser.

The browser maintains a node-to-route adjacency index as topology deltas arrive. Inspector and selected-route work therefore scales with one node's degree instead of the complete route set. Desktop uses a camera-stable native MapLibre popup; phones use a bounded bottom sheet. The Node Finder ranks matching public labels entirely in memory and discards its query. Desktop and mobile view preferences use separate versioned browser keys. A restored view is accepted only when its bounds contain a node active in the last 24 hours; otherwise CartoLite returns to the live activity home view. Layer visibility, route window, and legend state use a separate versioned browser-local preference. On phones, Finder, secondary map layers, and the route-age window stay in one compact disclosure while status, Follow, Sound, and Home remain directly available.
