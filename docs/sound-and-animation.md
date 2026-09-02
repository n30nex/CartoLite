# Sound and packet animation

## Sound scenes

CartoLite uses native Web Audio with no samples or audio dependency. **Aurora** is the warm default, **Wood** uses short rounded attacks, and **Chimes** uses a brighter soft-bell spectrum. Cached `PeriodicWave` tables provide each timbre. Packet kind still controls the scale, register, brightness, and duration, while a stable hash of packet, route, hop, and scene selects subtle variation.

One visible route hop always schedules one articulation and one oscillator. The hop start time comes from the same geographic distance weights used by the animation. A segment crossing the viewport is audible even when both endpoints are outside; an off-screen segment and observer-only activity are silent. Density may shorten and soften envelopes but cannot remove a visible hop.

Sound remains opt-in. Enabling or resuming requires a fresh browser gesture. During that tap CartoLite starts one inaudible buffer frame before awaiting `AudioContext.resume()`, which unlocks Android Chrome output without adding a preview tone or an oscillator. The panel reports **On**, **Off**, or **Tap to Resume**, displays the chosen scene and 0–100% volume, and pulses only when a live note is scheduled.

CartoLite Labs reuses this exact sonifier and preference record through a renderer-neutral viewport projector. Because a Labs experiment presents the full Canadian stage, each public route hop on that stage keeps one articulation; observer-only events stay silent. Mesh Loom applies a plucked-fibre character and Little Mesh Villages applies a restrained bell-and-knock character beneath the visitor's selected scene. These characters are deterministic, ephemeral, and preserve the one-oscillator-per-visible-hop rule. The page stops active voices when paused or hidden and never starts remembered sound without a new tap.

## Labs motion

Packet Pond maps ordered hops to arcing droplets, route-reuse currents, travelling wakes, splashes, and resolving five-ring landings over a reactive WebGL2 water simulation with a Canvas fallback. Firefly Meadow hands one winged light through spatially thinned public-node plants and leaves bounded relay blooms across a widely opened night landscape. Mesh Loom reveals wide packet-coloured fibres inside nearest-public-hub lanes with shuttle movement, knots, and an explicit colour legend. Little Mesh Villages maps recently observed nodes and active connectivity into cached, screen-filling cartogram settlements, then moves live lantern couriers through ordered hops. All four retain the established packet-kind palette, distinguish observer-only activity, cap their session objects, and clear temporary live memory on reset or stream recovery.

## Packet motion

Each hop stays on the exact straight geographic segment used by the historical route layer. The moving cue consists of a sharp packet core, a short screen-bounded tapered glow, up to three restrained sparks, a relay ring and forward tick, and a destination shimmer. Completed segments enter a low-opacity 45-second residue cache with deterministic coloured sparkles. This recent-live layer remains visible whether the historical Routes layer is on or off.

All drawing uses source-over composition. CartoLite does not use full-map traffic flashes, additive white blending, curved historical geometry, camera-relative route geometry, or animation that survives its route expiry.

Adaptive quality preserves route travel, handoff timing, and animation-frame cadence. During bursts or on coarse-pointer devices it reduces sparks, signatures, observer decoration, residue resolution, and pixel ratio. Lingering route sparkles and node wakes stay on the display-cadence canvas while the heavier residue glow remains cached. Reduced-motion mode renders static route and endpoint cues without continuous travel.
