# Sound and packet animation

## Sound scenes

CartoLite uses native Web Audio with no samples or audio dependency. **Aurora** is the warm default, **Wood** uses short rounded attacks, and **Chimes** uses a brighter soft-bell spectrum. Cached `PeriodicWave` tables provide each timbre. Packet kind still controls the scale, register, brightness, and duration, while a stable hash of packet, route, hop, and scene selects subtle variation.

One visible route hop always schedules one articulation and one oscillator. The hop start time comes from the same geographic distance weights used by the animation. A segment crossing the viewport is audible even when both endpoints are outside; an off-screen segment and observer-only activity are silent. Density may shorten and soften envelopes but cannot remove a visible hop.

Sound remains opt-in. Enabling or resuming requires a fresh browser gesture. The panel reports **On**, **Off**, or **Tap to Resume**, displays the chosen scene and 0–100% volume, and pulses only when a note is scheduled.

## Packet motion

Each hop stays on the exact straight geographic segment used by the historical route layer. The moving cue consists of a sharp packet core, a short screen-bounded tapered glow, up to three restrained sparks, a relay ring and forward tick, and a destination shimmer. Completed segments enter the low-opacity 15-second residue cache.

All drawing uses source-over composition. CartoLite does not use full-map traffic flashes, additive white blending, curved historical geometry, camera-relative route geometry, or animation that survives its route expiry.

Adaptive quality preserves route travel and handoff timing. During bursts or on coarse-pointer devices it reduces sparks, signatures, observer decoration, residue resolution, pixel ratio, and frame cadence. Reduced-motion mode renders static route and endpoint cues without continuous travel.
