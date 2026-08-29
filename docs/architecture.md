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

The browser batches route events for one second, resolves endpoint IDs through its node index, and sends only touched features through MapLibre's incremental GeoJSON API. A node move refreshes just that node and its connected route geometry. Hidden route and heat sources are marked dirty and rebuilt only when shown; one minute refresh handles age, decay, and expiry. A minimal CARTO vector style supplies land, water, boundaries, roads, and place labels below the live GeoJSON layers. National scale uses clusters, an active heat layer, and a 15-minute automatic route window. The window expands through one hour and six hours to 24 hours at local detail, while selecting a node always uses the full 24-hour neighborhood. The historical lattice renders at most the 700 freshest routes in the active window, with selected-node routes first; this budget does not cap live packet animation or sound. The optional MeshMapper regions asset is fetched only on first use. Its unsimplified source geometry is rendered as boundaries and labels with capped tiling and reduced overscan so it remains responsive over the full live topology.

Canvas2D owns bounded, event-driven, distance-aware comets, relay and endpoint light, observer pings, and progressively revealed 15-second route trails. Completed residue is cached as a bitmap instead of repainting every historic line on every frame. Narrow or coarse-pointer devices cap animation at 30 fps, reduce pixel ratio and effect counts, and discard effects outside the viewport. Hiding the stable route lattice never hides recent packet motion. Live follow moves only for traffic already inside the current view, or traffic touching a selected node. The saved viewport uses browser-local storage and never leaves the visitor's device.

Route sonification is opt-in and visitor-local. The browser stores only `{enabled, volume}` and never creates or resumes its native Web Audio context without a fresh user gesture. Remembered sound therefore starts as Tap to Resume. Every public route segment crossing the exact viewport becomes one warm pentatonic sine/triangle note, scheduled with the same distance weights as its Canvas2D animation and panned from its on-screen midpoint. Burst density shortens and softens envelopes but never discards a visible hop. A short delay supplies restrained ambience. Off-screen hops and observer-only events are silent, and hiding the page stops active sound. No audio, visitor telemetry, or expanded packet fields leave the browser.

Desktop and mobile view preferences use separate versioned browser keys. A restored view is accepted only when its bounds contain a node active in the last 24 hours; otherwise CartoLite returns to the live activity home view. On phones, secondary map layers and the route-age window stay in one compact disclosure while status, Follow, Sound, and Home remain directly available.
