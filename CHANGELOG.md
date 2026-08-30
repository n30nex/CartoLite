# Changelog

## 0.6.4 - 2026-08-29

### Fixed

- Remove the 700-route ceiling completely: every valid route inside the selected 15-minute, one-hour, six-hour, or 24-hour window is retained in the map source.
- Replace the screen-fixed historical route canvas with native MapLibre line layers so routes remain locked to geography throughout camera movement instead of hiding, jumping, or jiggling after pan and zoom.
- Stop live traffic from applying full-canvas filters to the route and region overlays, and avoid clearing the packet canvas when a resize event does not change its dimensions.
- Update the build-only PostCSS dependency past its source-map file disclosure advisory; the runtime continues to serve compiled static assets without Node.js.

### Changed

- Combine nearby low-zoom links into fixed national and regional trunks whose counts account for every eligible route, loading only the current and adjacent crossfade levels before resolving into individual lines as the map zooms in.
- Build large route-source updates in animation-frame slices and keep the previous source visible until the complete replacement is ready, so changing the time window does not freeze interaction or flash a partial network.
- Extend the 4,000-node/7,000-route browser gate to require all 7,000 routes in the 24-hour source, complete trunk accounting, camera responsiveness, and no task longer than 100 ms.

## 0.6.3 - 2026-08-29

### Fixed

- Make 15-minute, one-hour, six-hour, and 24-hour route windows visibly distinct even when live traffic exceeds the 700-route render budget by retaining the newest half and sampling the rest across the complete selected period.
- Apply the selected route window to focused-node connections, neighbor counts, and route inspection instead of silently expanding focused nodes to 24 hours.
- Keep the Auto option labelled with its zoom-derived window instead of renaming it to the currently selected fixed duration.

## 0.6.2 - 2026-08-29

### Changed

- Remove the traffic-reactive full-map aurora wash and its repeated colour flashes.
- Keep packet ribbons, protocol signatures, node wakes, region and route emphasis, the compact traffic meter, and musical hop cues localized to actual live activity.
- Add browser coverage that fails if live traffic reintroduces a full-map colour pulse pseudo-layer.

## 0.6.1 - 2026-08-29

### Fixed

- Keep the authorized MeshMapper credit in MapLibre's attribution control so it remains available when the exact Canadian regions overlay is rendered on its dedicated canvas.
- Add browser coverage that verifies the live attribution control includes MeshMapper after Regions is enabled.

## 0.6.0 - 2026-08-29

### Added

- Add deterministic curved energy ribbons with an origin charge, directional comet, relay spark, destination bloom, and a four-second node wake for every visible live route.
- Add distinct restrained packet signatures: expanding Advert ripples, Trace echoes, orbiting Text sparks, double-ring ACKs, and Control ticks, while retaining the established protocol palette.
- Add a protocol-coloured aurora wake, live traffic meter, route/region glow response, selected-node vignette, and a cinematic camera indicator without introducing telemetry or new data sources.
- Add route-wide cinematic framing while Live Follow is enabled; manual map movement still disables Follow and reduced-motion visitors receive an immediate non-animated camera update.

### Changed

- Replace straight transient packet paths and residue with stable quadratic curves whose direction and shape remain consistent while the map moves.
- Reduce heatmap radius, intensity, opacity, and white-hot saturation so dense corridors remain geographic and packet colours stay distinguishable.
- Keep every visible route animation during bursts while automatically reducing only secondary signatures, observer rings, lingering residue, resolution, and frame cadence on phones or under heavy activity.
- Make active nodes breathe after each completed hop and keep stable route and exact MeshMapper region canvases visually synchronized with live traffic.

### Accessibility and verification

- Preserve 44-pixel phone controls, separate saved views, static reduced-motion route illumination, visitor-local audio preferences, and the existing privacy-safe public schema.
- Extend unit and browser coverage for curved geometry, protocol signatures, node wakes, adaptive quality, uncapped visible route cues, cinematic route framing, responsive layouts, and the 4,000-node/7,000-route interaction budget.

## 0.5.0 - 2026-08-29

### Added

- Add a calm, minimal CARTO vector basemap with land, water, waterways, national and regional boundaries, roads, and place labels; the runtime contains no raster source or PNG fallback.
- Add an anchored Sound panel with explicit On, Off, and Tap to Resume states, a visitor-local 0–100% volume control defaulting to 80%, and an activity lamp that pulses only when notes are scheduled.
- Add compact phone Layers disclosure for Routes, Heatmap, Regions, and the route-age window, including portrait and landscape browser coverage with 44-pixel targets.
- Add a Python standard-library Pi watchdog with three-failure alerting, two-success recovery, unexpected boot-ID detection, sanitized Discord messages, and systemd hardening.
- Add root-only restic operations for private DigitalOcean Spaces: daily checkpoint and deployment-manifest backups, 30/8/12 retention, weekly metadata checks, and monthly full-data restore/checksum verification.
- Add an idempotent Cloudflare Rulesets helper that makes only the content-hashed MeshMapper GeoJSON eligible for one-year edge caching.

### Changed

- Give every visible route hop one warm pentatonic articulation with viewport panning, adaptive burst envelopes, and short native Web Audio ambience; no visible hop is discarded.
- Store desktop and mobile map views separately and return home when a restored view contains no node active in the last 24 hours.
- Strengthen selected-node focus and preserve cyan/amber traffic colour during bursts by removing additive white saturation from packet bloom and residue.
- Keep the historical Routes overlay responsive by pre-rendering at most the 700 freshest routes in the chosen window into a dedicated Canvas2D bitmap in frame-bounded batches; selected-node routes retain a separate exact MapLibre hit-test source, and live packet animation and sound remain uncapped.
- Keep the national heat summary calm and responsive by rendering the 600 strongest active-node weights while preserving the complete topology and live event stream.
- Toggle the prewarmed Routes lattice by revealing its finished canvas bitmap, toggle Heatmap through its bounded GeoJSON source, and keep the first Regions reveal data-driven so primary interactions avoid bulk source ingestion or a full style recompile.
- Refresh the exact unsimplified 34-region MeshMapper snapshot on 2026-08-29 and validate its metadata, code set, geometry, checksum, lazy loading, MIME type, and attribution; validate and partition it in a Web Worker, then paint every unchanged boundary edge to a dedicated canvas in frame-bounded batches.
- Extend CI with vector authorization, phone landscape, oscillator-count, no-raster, stale-view, operations transition, region checksum, and sub-100 ms layer-interaction gates.

### Security

- Keep the CARTO project key in the existing BuildKit secret path and verify TileJSON, vector PBF, and glyph authorization without logging the key.
- Keep Discord, Spaces, restic, Cloudflare, MQTT, and API credentials outside Git and command arguments in root-only environment/password files.

## 0.4.3 - 2026-08-29

### Changed

- Raise live-hop output by about 22 dB so the route music is clearly audible on typical laptop and phone speakers while retaining density limiting and compression.
- Pulse the Sound control only when an in-view live hop actually schedules a note, making silence from an idle viewport easy to distinguish from muted output.

### Fixed

- Extend the browser gate to prove that visible synthetic traffic reaches the active sound path instead of checking only that Web Audio can be enabled.

## 0.4.2 - 2026-08-29

- Keep the refreshed 34-region overlay responsive over a live 4,000-node / 7,000-route topology by rendering boundaries and labels without the nearly invisible polygon fill.
- Cap regional GeoJSON tiling at zoom 12, reduce tile overscan, and preserve close-range boundary detail through controlled worker-side simplification.
- Extend the scale browser gate to load regions over the full topology and enforce both overlay-load and main-thread responsiveness budgets.

## 0.4.1 - 2026-08-28

### Added

- Add opt-in, visitor-local route sonification using the native Web Audio API: every live hop crossing the exact viewport plays one soft pentatonic note, aligned with the on-screen animation and panned across the current view; off-screen hops and observer-only traffic stay silent.

### Changed

- Refresh the authorized MeshMapper Canada snapshot from 29 to all 34 current regions, including Bas-St-Laurent-Gaspésie, Cape Breton Island, London, North Bay, and Thunder Bay, while retaining exact-code validation and lazy loading.
- Raise the separately measured lazy region-asset budget to cover the larger unsimplified source geometry without weakening the initial JavaScript and CSS budget.

### Fixed

- Serve the install manifest as `application/manifest+json` instead of relying on host MIME defaults.

## 0.4.0 - 2026-08-28

### Added

- Start on a national, activity-first Canada view with clustered nodes, an active heatmap, automatic route-age windows, and a visitor-local saved viewport.
- Add an in-page map and privacy guide, live update time, favicon, install manifest, crawler policy, canonical metadata, and a social preview.
- Report bounded five-minute operational summaries for ingest, queue, public projection, SSE clients, checkpoint size, checkpoint duration, and retention pruning.
- Cover 4,000-node and 7,000-route desktop and mobile views, compact protocol integrity, touch-target sizing, retention pruning, and process write amplification in CI.

### Changed

- Normalize public schema v2 so routes and packet segments reference node IDs instead of repeating endpoint labels and coordinates.
- Batch live route mutations for one second and update only touched MapLibre features; hidden route and heat sources remain deferred until shown.
- Refresh public snapshots at most once per second and durable checkpoints at most once every five minutes, while still saving dirty state during a clean shutdown.
- Retain public routes for 24 hours and prune unreferenced nodes after 30 days when durable state is saved.
- Keep live-follow movement inside the current view or selected-node neighborhood instead of jumping across the country.
- Use a 30 fps, lower-resolution, lower-cap animation path on narrow or coarse-pointer devices and ignore packet effects entirely outside the viewport.
- Make map controls at least 44 pixels tall, increase compact-screen type sizes, remove duplicate route-legend announcements, and brighten the basemap treatment.
- Return true 404 responses for missing frontend assets and give only hashed build assets year-long immutable caching.
- Rehydrate connected browsers immediately when checkpoint retention removes routes or nodes.

### Security

- Add a restrictive Permissions Policy and one-year HSTS response policy.
- Build with Go 1.25.13 and `golang.org/x/net` 0.56.0 to include the current upstream security fixes.

## 0.3.1 - 2026-08-27

### Fixed

- Authenticate CARTO raster basemap tile requests so the live map no longer displays the API key warning.

### Changed

- Supply the CARTO basemap key to frontend image builds through a BuildKit secret.
- Require the `CARTO_BASEMAP_API_KEY` repository secret for publishable builds and document the deployment requirement.
