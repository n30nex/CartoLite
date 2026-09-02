# CartoLite Labs

CartoLite Labs is the playful companion to the main live map. It runs at `/labs/` from the same CartoLite binary and turns the existing sanitized MeshCore Canada state and event stream into temporary generative art. It is not an analytics dashboard, traffic archive, MQTT client, or second backend.

## Initial experiments

- **Packet Pond** turns packet kinds into coloured droplets. Ordered public hops set each landing, geographic distance affects travel, recent route reuse deepens temporary channels, and observer-only activity creates one isolated ripple.
- **Firefly Meadow** gives recently known public nodes stable plant positions and carries one light through each ordered hop. Observer-only activity blinks locally without drawing a connection.
- **Northern Lights** lets the bounded recent packet rate and kind tint an ambient aurora. Foreground handoffs still follow the exact projected public hop endpoints. It uses WebGL2 with a Canvas fallback.
- **Mesh Loom** writes sanitized events into a bounded scrolling tapestry. Hop order becomes knots, packet kind keeps the established colour, and observer-only traffic remains an unconnected mark.

Repeater Rumble, Signal Railway, Packet Philharmonic, and Little Mesh Villages remain future experiments. Their absence from v0.8.3 is deliberate: the shared runtime and its cleanup, privacy, recovery, accessibility, and performance contracts ship first.

## Shared behavior

The shell owns one `/api/events` connection regardless of which experiment is active. Sequence gaps, backend boot changes, browser resume, and network return all use the existing snapshot recovery path. Recovery discards session counters that can no longer be trusted while leaving the existing sound preference intact.

Only one experiment is mounted. Switching uses a dynamic import, destroys the old renderer and its retained objects, replaces its canvases, applies the latest public snapshot, and resumes the shared animation frame. Exhibition mode rotates experiments every 60 seconds and requests full screen from the enabling gesture when supported.

The status, experiment picker, pause, reset, sound scene and volume, factual live caption, and explanation panel remain keyboard reachable. Coarse-pointer layouts cap pixel ratio and request a screen wake lock while visible. Reduced-motion mode retains static packet meaning without continuous travel.

## Data and privacy boundary

Labs receives only public schema v2. It may derive distance, bearing, hop count, stable visual seeds, route reuse, and bounded 10-second, 60-second, and five-minute rates in browser memory. Those values are temporary and must not be described as delivery success, network quality, permanent coverage, or all-time activity.

It receives no message content, decoded or raw payload, packet hash, public key, raw path, MQTT credential, or resolver reason. It stores no packet stream, experiment history, query, or analytics identifier. Sound shares only `{enabled, volume, scene}` under `cartolite:sound:v2` and still requires a fresh browser gesture.

The hidden `?demo=1` mode uses deterministic invented nodes and packets to exercise one-hop, multi-hop, observer-only, burst, and quiet rendering without contacting the live API.
