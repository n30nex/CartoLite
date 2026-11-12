# Flight performance and regular-map flight

Canada 0.24.0 adds a regular-map `/fly-3d/` page using the same controller as
Terminal. It is available from Experimental and Terrain controls. Map styles,
inspection, layers and the single live feed remain shared with the existing map.

The Pi baseline uses synthetic nodes/routes and the released 0.23.0 assets. A
1,024-node/7,000-route stress scene showed substantial rendering pressure under
the one-CPU software renderer. Temporarily bypassing ASCII and history passes is
diagnostic only; the shipped view retains all network geometry. Measurements on
this constrained test host are not desktop GPU frame-rate claims.

The patch targets unchanged route-window work triggered by tiny camera zoom
changes, redundant ASCII samples, and excessive raster work during slow flight.
Auto flight detail reduces map raster resolution only while moving; labels and
packet timing retain their own presentation/clock. Full sharpness returns at rest
or on exit. A saved Full detail choice disables adaptation. No route or node is
discarded to improve a measurement.

Validation covers before/after measurements, every regular map theme, Terminal
presets, camera restoration/rotation, input release, graphics recovery, shared
preferences, retained route counts, navigation and privacy. Existing applicable
scale and performance thresholds remain in place.

The owner explicitly authorized Pi 5 builds on 12 November 2026 after Actions
minutes ran out. Use `docs/manual-release.md`, with isolated resource-limited
build/test jobs and exact source/image hashes. Do not claim GitHub OIDC provenance
for this manual release. Keep the live Canada container hardened and MQTT-only;
verify encrypted recovery, public behavior and sustained health before completion.
