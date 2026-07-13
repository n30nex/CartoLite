# Architecture

CartoLite is designed around a single bounded event loop rather than a database-backed application platform.

```text
MeshCore MQTT
      |
 bounded ingest channel
      |
 single-owner engine ---- atomic /data/state-v1.json
      |
 immutable public projection
      +---- GET /api/state
      +---- GET /api/events (SSE)
      +---- embedded MapLibre + Canvas2D page
```

The engine alone owns nodes, observers, prefix indexes, routes, sequence numbers, and counters. MQTT callbacks decode and enqueue bounded input. Slow SSE clients are disconnected; they cannot apply backpressure to ingest. Public state is pre-serialized at a bounded cadence.

## Route truth

A public route exists only when every path prefix selects exactly one forwarder-capable node in the same allowlisted region and each segment has coordinates and RF evidence. Duplicate or ambiguous prefixes, non-forwarder roles, missing coordinates, missing RF evidence, non-trace four-byte paths, and distance-gated segments fail closed. Unresolved activity produces an observer aura, never an invented line.

## Durable state

The checkpoint contains current sanitized topology plus private resolver indexes required to recover it. It contains no packet/event history, message text, credentials, or live capture. Writes use a same-directory temporary file, fsync, mode `0600`, and atomic rename. Corrupt or incompatible existing state is an explicit startup error, not silently discarded state.

## Client recovery

`/api/state` is authoritative. SSE supplies low-latency deltas and retains a bounded 4,096-event replay window. The browser reconnects with its `bootId` and last applied sequence; a changed boot, sequence gap, expired cursor, or `reset` event triggers one state refresh. Snapshot recovery updates topology without replaying animations. MapLibre owns the collision-managed labels, stable route/node hierarchy, enlarged tap targets, and filtered selection/hover layers. Its optional heatmap derives bounded, recency-weighted activity points from the already-sanitized route projection; the optional MeshMapper region overlay is a static, hashed GeoJSON asset fetched only on first use. Canvas2D owns bounded, event-driven, distance-aware comets, relay and endpoint light, observer pings, and progressively revealed 15-second route trails. Completed residue is cached as a bitmap and refreshed at 4 Hz, so live comets do not repaint every historic line on every animation frame. Hiding the stable route lattice never hides recent packet motion. Selecting a node filters existing layers to direct connections heard within 24 hours, dims unrelated context, and emphasizes its neighbors without rebuilding topology or altering packet events.
