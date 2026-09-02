# CartoLite Labs

CartoLite Labs is the playful companion to the main live map. It runs at `/labs/` from the same CartoLite binary and turns the existing sanitized MeshCore Canada state and event stream into temporary generative art. It is not an analytics dashboard, traffic archive, MQTT client, or second backend.

## Current experiments

- **Packet Pond** composites an original moonlit water texture and transparent pond-edge vegetation with procedural caustics, currents, droplets, splashes, and multi-ring landings. Ordered public hops set each landing, geographic distance affects travel, recent route reuse deepens temporary channels, and observer-only activity creates one isolated ripple.
- **Firefly Meadow** combines original nocturnal meadow artwork with deterministic public-node plants, winged live fireflies, short trails, relay blooms, and fading plant wakes. Observer-only activity blinks locally without drawing a connection.
- **Mesh Loom** writes sanitized events into a bounded dimensional tapestry. Animated shuttle movement reveals each ordered path, knots preserve hop order, packet kind keeps the established colour, and observer-only traffic remains an unconnected patch. Its Loom sound character adds a soft plucked-fibre timbre beneath the visitor's chosen sound scene.
- **Little Mesh Villages** turns recently observed nodes into deterministic role-specific buildings, active routes into local roads or intercity links, and live ordered hops into moving lantern couriers. Settlement size represents observed MeshCore nodes and connectivity, not real-world population or permanent network coverage.

Northern Lights was removed in v0.9.0; old direct links safely fall back to Packet Pond. Repeater Rumble, Signal Railway, and Packet Philharmonic remain future experiments.

## Scene assets and rendering

Packet Pond and Firefly Meadow each import two original locally bundled WebP assets created for CartoLite: one background plate and one transparent vegetation layer. Vite gives them content-hashed names, and the browser fetches them only after that experiment's dynamic module is selected. They contain no scripts, identifiers, external URLs, telemetry, or data-derived marks. Every route, packet, observer cue, node-plant, building, road, knot, lantern, and glow remains deterministic Canvas output from the sanitized state or live event.

Little Mesh Villages limits work to the newest bounded public node set. It first joins nodes through active routes, then partitions connected components into fixed geographic cells so one long route cannot create an enormous false city. Cross-cell routes remain visible as intercity links. Static terrain, roads, buildings, windows, and labels render into one offscreen cache; only live couriers and fading lanterns repaint each frame.

## Shared behavior

The shell owns one `/api/events` connection regardless of which experiment is active. Sequence gaps, backend boot changes, browser resume, and network return all use the existing snapshot recovery path. Recovery discards session counters that can no longer be trusted while leaving the existing sound preference intact.

Only one experiment is mounted. Switching uses a dynamic import, destroys the old renderer and its retained objects, replaces its canvas and experiment-local elements, applies the latest public snapshot, and resumes the shared animation frame. Exhibition mode rotates experiments every 60 seconds and requests full screen from the enabling gesture when supported.

The status, experiment picker, pause, reset, sound scene and volume, factual live caption, and explanation panel remain keyboard reachable. Coarse-pointer layouts cap pixel ratio and request a screen wake lock while visible. Reduced-motion mode retains static packet meaning without continuous travel.

## Data and privacy boundary

Labs receives only public schema v2. It may derive distance, bearing, hop count, stable visual seeds, route reuse, and bounded 10-second, 60-second, and five-minute rates in browser memory. Those values are temporary and must not be described as delivery success, network quality, permanent coverage, or all-time activity.

It receives no message content, decoded or raw payload, packet hash, public key, raw path, MQTT credential, or resolver reason. It stores no packet stream, experiment history, query, or analytics identifier. Sound shares only `{enabled, volume, scene}` under `cartolite:sound:v2` and still requires a fresh browser gesture. Loom and Village sound characters are ephemeral renderer choices and are not added to storage.

The hidden `?demo=1` mode uses deterministic invented nodes and packets to exercise one-hop, multi-hop, observer-only, burst, and quiet rendering without contacting the live API.
