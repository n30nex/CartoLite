# Sound and packet animation

## Sound scenes

CartoLite uses native Web Audio with no samples or audio dependency. **Aurora** is the warm default, **Wood** uses short rounded attacks, and **Chimes** uses a brighter soft-bell spectrum. Cached `PeriodicWave` tables provide each timbre. Packet kind still controls the scale, register, brightness, and duration, while a stable hash of packet, route, hop, and scene selects subtle variation.

One visible route hop always schedules one articulation and one oscillator. The hop start time comes from the same geographic distance weights used by the animation. A segment crossing the viewport is audible even when both endpoints are outside; an off-screen segment and observer-only activity are silent. Density may shorten and soften envelopes but cannot remove a visible hop.

Sound remains opt-in. Enabling or resuming requires a fresh browser gesture. During that tap CartoLite starts one inaudible buffer frame before awaiting `AudioContext.resume()`, which unlocks Android Chrome output without adding a preview tone or an oscillator. The panel reports **On**, **Off**, or **Tap to Resume**, displays the chosen scene and 0–100% volume, and pulses only when a live note is scheduled.

Netgraph and CartoLite Labs reuse this exact sonifier and preference record through a renderer-neutral viewport projector. Netgraph projects endpoints by opaque node ID into its fixed topology layout; each link crossing its viewport keeps one articulation and the visual handoff uses the same timing. Because a Labs experiment presents the full Canadian stage, each public route hop on that stage also keeps one articulation; observer-only events stay silent in every view. Mesh Loom applies a plucked-fibre character and Little Mesh Villages applies a restrained bell-and-knock character beneath the visitor's selected scene. These characters are deterministic, ephemeral, and preserve the one-oscillator-per-visible-hop rule. Each page stops active voices when paused or hidden and never starts remembered sound without a new tap.

## Labs motion

Packet Pond maps ordered hops to arcing droplets, route-reuse currents, travelling wakes, splashes, and resolving five-ring landings over a reactive WebGL2 water simulation with a Canvas fallback. Firefly Meadow hands one winged light through spatially thinned public-node plants and leaves bounded relay blooms across a widely opened night landscape. Mesh Loom reveals wide packet-coloured fibres inside nearest-public-hub lanes with shuttle movement, knots, and an explicit colour legend. Little Mesh Villages maps recently observed nodes and active connectivity into cached, screen-filling cartogram settlements, then moves live lantern couriers through ordered hops. All four retain the established packet-kind palette, distinguish observer-only activity, cap their session objects, and clear temporary live memory on reset or stream recovery.

## Packet motion

Each hop stays on the exact straight geographic segment used by the historical route layer. The moving cue consists of a sharp packet core, a short screen-bounded tapered glow, up to three restrained sparks, a relay ring and forward tick, and a destination shimmer. Completed segments enter a low-opacity 45-second residue cache with deterministic coloured sparkles. This recent-live layer remains visible whether the historical Routes layer is on or off.

When the lazy MeshCore.ca region dataset is available, a same-region packet gives its label and border one restrained packet-coloured pulse. Cross-region traffic starts an outward OUT pulse at the sending label and schedules an inward IN answer at the receiving label on the same final-hop arrival timeline used by animation and sound. A cross-region endpoint span of at least 75 km is presented as a long-haul DX candidate: its colour-faithful comet is wider and brighter, endpoint and region glow lasts longer, residue gains one bounded sparkle, a compact `DX` marker follows the live head, and both anchored region pills carry the DX prefix. This is evidence of geographic span, not proof that tropospheric ducting caused the reception.

Region activity is stored only as a bounded browser-memory cue list and collapsed to the strongest active cue per region on each frame. It does not add a history or a backend field. Disabling Regions hides and pauses these label effects; enabling it reuses the already-validated worker dataset rather than parsing another copy.

All drawing uses source-over composition. CartoLite does not use full-map traffic flashes, additive white blending, curved historical geometry, camera-relative route geometry, or animation that survives its route expiry.

Adaptive quality preserves route travel, handoff timing, and animation-frame cadence. During bursts or on coarse-pointer devices it reduces sparks, signatures, observer decoration, residue resolution, and pixel ratio. Lingering route sparkles and node wakes stay on the display-cadence canvas while the heavier residue glow remains cached. Reduced-motion mode renders static route and endpoint cues without continuous travel.
