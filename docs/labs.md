# CartoLite Labs

CartoLite Labs is the playful companion to the main live map. It runs at `/labs/` from the same CartoLite binary and turns the existing sanitized MeshCore Canada state and event stream into temporary generative art. It is not an analytics dashboard, traffic archive, MQTT client, or second backend.

## Current experiments

- **Packet Pond** renders a full-screen WebGL2 water surface beneath the existing artwork. Layered procedural waves, textured flow, caustics, surface normals, and moon glints react to the newest live impacts; Canvas droplets, route currents, five-ring wakes, splashes, and pond-edge vegetation remain crisp above it. WebGL2 failure uses a local Canvas fallback.
- **Firefly Meadow** combines original nocturnal meadow artwork with widely separated foreground clusters, screen-space-thinned public-node plants, larger winged live fireflies, longer trails, relay blooms, and fading plant wakes. Observer-only activity blinks locally without drawing a connection.
- **Mesh Loom** writes sanitized events as wide fibres into seven geographic lanes labelled by the nearest public Canadian hub from YVR through YFB. Animated shuttle movement reveals each ordered path, knots preserve hop order, the on-screen legend identifies packet colour, and observer-only traffic remains an unconnected patch. Lane assignment uses public endpoint coordinates rather than an API or MQTT region field.
- **Little Mesh Villages** turns recently observed nodes into deterministic role-specific buildings, active routes into local roads or intercity links, and live ordered hops into moving lantern couriers. Dense geographic cells split into bounded settlements, then a responsive geographic cartogram spreads those settlements across the stage. Settlement size represents observed MeshCore nodes and connectivity, not real-world population or permanent coverage.

Northern Lights was removed in v0.9.0; old direct links safely fall back to Packet Pond. Repeater Rumble, Signal Railway, and Packet Philharmonic remain future experiments.

## Scene assets and rendering

Packet Pond and Firefly Meadow each import two original locally bundled WebP assets created for CartoLite: one background plate and one transparent vegetation layer. Vite gives them content-hashed names, and the browser fetches them only after that experiment's dynamic module is selected. They contain no scripts, identifiers, external URLs, telemetry, or data-derived marks. Pond water uses a small dependency-free WebGL2 shader fed by the local texture and bounded live ripple uniforms; all packet colour and route meaning remains deterministic Canvas output from the sanitized state or live event.

Little Mesh Villages limits work to the newest bounded public node set. It groups nearby nodes into fixed geographic cells, splits dense cells into bounded settlements, and lays those settlements out across a responsive cartogram while preserving west-to-east and north-to-south ordering. Cross-settlement routes remain visible as intercity links. Static terrain, roads, buildings, windows, and labels render into one offscreen cache; only live couriers and fading lanterns repaint each frame.

## Shared behavior

The shell owns one `/api/events` connection regardless of which experiment is active. Sequence gaps, backend boot changes, browser resume, and network return all use the existing snapshot recovery path. Recovery discards session counters that can no longer be trusted while leaving the existing sound preference intact.

Only one experiment is mounted. Switching uses a dynamic import, destroys the old renderer and its retained objects, replaces its canvases and experiment-local elements, applies the latest public snapshot, and resumes the shared animation frame. Exhibition mode rotates experiments every 60 seconds and requests full screen from the enabling gesture when supported.

The status, experiment picker, pause, reset, sound scene and volume, factual live caption, and explanation panel remain keyboard reachable. Coarse-pointer layouts cap pixel ratio and request a screen wake lock while visible. Reduced-motion mode retains static packet meaning without continuous travel.

## Data and privacy boundary

Labs receives only public schema v2. It may derive distance, bearing, hop count, stable visual seeds, route reuse, and bounded 10-second, 60-second, and five-minute rates in browser memory. Those values are temporary and must not be described as delivery success, network quality, permanent coverage, or all-time activity.

It receives no message content, decoded or raw payload, packet hash, public key, raw path, MQTT credential, or resolver reason. It stores no packet stream, experiment history, query, or analytics identifier. Sound shares only `{enabled, volume, scene}` under `cartolite:sound:v2` and still requires a fresh browser gesture. Loom and Village sound characters are ephemeral renderer choices and are not added to storage.

The hidden `?demo=1` mode uses deterministic invented nodes and packets to exercise one-hop, multi-hop, observer-only, burst, and quiet rendering without contacting the live API.
