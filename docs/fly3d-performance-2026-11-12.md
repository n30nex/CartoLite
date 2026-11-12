# Flight performance and regular-map flight

Canada 0.24.0 adds a regular-map `/fly-3d/` page using the same controller as
Terminal. It is available from Experimental and Terrain controls. Map styles,
inspection, layers and the single live feed remain shared with the existing map.

The Pi baseline uses synthetic nodes/routes and the released 0.23.0 assets. The
1,024-node/7,000-route scene runs on the Pi's V3D GPU; software-renderer runs are
diagnostic only. A fixed 180-step camera sweep keeps the path and frame count
comparable. Timed key holds travel less far at lower frame rates and should not
be used alone to claim a rendering speedup.

In that sweep, unchanged route-window refreshes fell from 180 to zero and time
inside camera updates fell from 496 ms to 277 ms. Both runs retained 7,000 routes.
Median frame gaps were 30.3 ms and 32.7 ms respectively; these measurements do
not establish an overall FPS gain. Auto detail bounds raster work separately,
and its native-resolution restoration is checked after movement. Temporarily
bypassing ASCII/history in diagnostic profiles never changes production behavior.

The patch targets unchanged route-window work triggered by tiny camera zoom
changes and excessive raster work during slow flight. Keep the existing ASCII
shader: a proposed sampling shortcut regressed the first V3D comparison and was
removed before release.
Auto flight detail caps raster density at 1.5 during terrain startup and the first
motion frame, then adapts further when rendering is slow. This avoids paying for
a full high-density frame before adaptation can react. Packet timing stays on
its existing clock. Full sharpness returns at rest
or on exit. A saved Full detail choice disables adaptation. No route or node is
discarded to improve a measurement.

Terminal also polls shader preparation without blocking the page when
`KHR_parallel_shader_compile` is available. Controls and the feed remain usable
while the graphics prepare; the loading state avoids exposing encoded map colors.
Compile/link validation, the ordinary fallback, context-loss cleanup and the
existing shader output are retained. Browsers without the extension use the
same synchronous compatibility path.

Validation covers before/after measurements, every regular map theme, Terminal
presets, camera restoration/rotation, input release, graphics recovery, shared
preferences, retained route counts, navigation and privacy. Existing applicable
scale and performance thresholds remain in place.

The region legend now refreshes after its own source renders, without waiting
for unrelated basemap loading to become idle. The touch-controls and rotation
journeys are independently bounded tests; their startup, input-release and
400 ms rotation assertions remain unchanged.

The owner explicitly authorized Pi 5 builds on 12 November 2026 after Actions
minutes ran out. Use `docs/manual-release.md`, with isolated resource-limited
build/test jobs and exact source/image hashes. Do not claim GitHub OIDC provenance
for this manual release. Keep the live Canada container hardened and MQTT-only;
verify encrypted recovery, public behavior and sustained health before completion.
