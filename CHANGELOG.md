# Changelog

## 0.7.2 - 2026-08-31

### Added

- Add a map-only background embed that can be framed exclusively by `https://canadaverse.org` while every other route remains unframeable.
- Publish a readiness message only after the live state and MapLibre scene have loaded, so the homepage never promotes an empty frame as live.

## 0.7.1 - 2026-08-31

### Fixed

- Keep full public node labels in Finder, tooltips, and the inspector while removing emoji-only glyph ranges from MapLibre map labels, preventing CARTO font CORS failures and repeated console noise.

## 0.7.0 - 2026-08-30

### Added

- Add three dependency-free native Web Audio scenes: the refined warm Aurora default, rounded percussive Wood, and soft bright Chimes. Deterministic packet, route, and hop variation keeps repeat events stable while every visible hop retains exactly one articulation and one oscillator.
- Replace the transient node tooltip with a persistent native MapLibre inspector on desktops and a bounded bottom sheet on phones. It shows public node details and every active-window neighbour, sorted newest first, with packet kind, count, role, and last-heard context.
- Add a privacy-safe Node Finder that searches only downloaded public labels, ranks exact and prefix matches first, keeps duplicate labels distinct, and never sends or stores the query.

### Changed

- Replace broad progressive packet ribbons with a sharp coloured core, short tapered glow, two or three restrained sparks, explicit relay handoffs, a destination shimmer, and the existing 15-second low-opacity residue.
- Share the same hop timeline between motion and sound, preserve every visible hop under burst load, and reduce only decoration and frame cadence through adaptive quality.
- Build and incrementally maintain a node-to-route adjacency index so inspector updates and connected-route emphasis are proportional to the selected node's degree.
- Build source stages on the Pi's native BuildKit platform while using `TARGETOS` and `TARGETARCH` for the final `linux/amd64` binary.

### Fixed

- Keep selection and inspector content stable across camera movement, close only through the explicit control, Escape, or an empty-map click, and refresh immediately when the route window or an adjacent route changes.
- Keep live trails on the exact straight geographic route segment and prohibit full-map flashes, additive white saturation, moving historical geometry, and expired animation overlays.

### Privacy and compatibility

- Preserve public API schema v2, SSE events, health/readiness contracts, the 24-hour topology boundary, and all existing public-state redaction assertions.
- Store only `{enabled, volume, scene}` under `cartolite:sound:v2`; migrate v1 preferences to Aurora without creating or resuming an AudioContext.

## 0.6.9 - 2026-08-30

### Fixed

- Render the validated 34-region MeshMapper snapshot as native MapLibre geometry so boundaries and labels stay locked to geography while the camera moves.
- Make Live Follow react to valid off-screen traffic, narrow to a selected node when present, and stop cleanly after a visitor pans or zooms the map.
- Give selected nodes a dedicated connected-route glow that remains clear above the historical network without filtering or rebuilding the complete route source.
- Remove same-cell trunk loop glyphs and switch national, regional, and exact route representations at non-overlapping zoom boundaries so layers no longer fight or jump.
- Restore saved map controls only after their required sources exist, preventing reloads from touching MapLibre style state too early.

### Changed

- Strengthen live packet trails with restrained glow and traveling sparks while preserving the existing fade, reduced-motion behavior, and one musical note per visible hop.
- Give packet kinds warmer sine and triangle voice shading, and persist Routes, Heatmap, Regions, route window, and legend state locally alongside the existing separate desktop and mobile views.

### Performance

- Select precomputed trunk counts for each route window without replacing trunk geometry, and enable only the route representation used at the current zoom.

## 0.6.8 - 2026-08-30

### Performance

- Give the initial complete route source a clean settle window on slower renderers by widening only the historical-route refresh cadence from two to eight seconds.
- Keep live animation, musical hops, nodes, heat, and 15-second route residue immediate, so the calmer background refresh does not hide current activity.
- Make public browser acceptance account for the bounded live-to-history handoff while still requiring national and regional trunk totals to agree.

## 0.6.7 - 2026-08-30

### Performance

- Coalesce busy historical-route source refreshes to a two-second cadence so sustained live traffic cannot keep rebuilding the complete route topology back-to-back.
- Keep live packet animation, viewport audio, nodes, and heat immediate while the stable historical layer catches up in one bounded update without dropping any route.
- Stop restarting the map settle indicator for every incremental node or heat delta, allowing the interface to remain idle and responsive during active bursts.

## 0.6.6 - 2026-08-30

### Fixed

- Keep live packet travel on the same straight geographic path as its historical route so animations no longer bow, shift, or feel detached while the camera moves.
- Replace low-zoom same-cell route slashes with compact fixed hubs, keep grouped geometry stable across camera movement, and label aggregate colours as connection density instead of packet type.
- Delay water labels and keep symbols away from tile edges to stop repeated large-water names at the national view.

### Changed

- Rebalance the custom CARTO vector palette with clearer land, water, boundaries, roads, cities, and restrained map grading so the vector map regains the geographic clarity of the previous raster experience.
- Split national city labels from detailed town and village labels, reduce dense route glow, and keep the phone route legend compact.

### Performance

- Cap MapLibre rendering at 1.5 device pixels on phones and 2 on desktops while retaining crisp controls and overlays.
- Use lightweight solid comets and ring blooms on phones and during bursts while preserving every visible hop and its musical articulation.

## 0.6.5 - 2026-08-30

### Fixed

- Keep every route layer's zoom interpolation at the top level of its MapLibre opacity expression so the renderer accepts the layers and the Routes control draws national trunks, regional trunks, and individual routes again.

## 0.6.4 - 2026-08-30

### Fixed

- Remove the 700-route ceiling completely: every valid route from the complete 24-hour public topology is retained in the map source and the selected window reveals all matching routes.
- Replace the screen-fixed historical route canvas with native MapLibre line layers so routes remain locked to geography throughout camera movement instead of hiding, jumping, or jiggling after pan and zoom.
- Stop live traffic from applying full-canvas filters to the route and region overlays, and avoid clearing the packet canvas when a resize event does not change its dimensions.
- Keep the map in its loading state until both CartoLite route sources settle across consecutive frames, without waiting forever on unrelated basemap tiles or continuous live packets.
- Update the build-only PostCSS dependency past its source-map file disclosure advisory; the runtime continues to serve compiled static assets without Node.js.

### Changed

- Combine nearby low-zoom links into national and regional trunks with fixed geographic cell anchors and per-window counts, then resolve them into individual lines at detail zoom without moving the underlying topology.
- Build the complete 24-hour topology once in animation-frame slices, divide exact lines into static age bands, and switch route windows by revealing complete bands rather than reevaluating every line. Window changes, automatic zoom windows, node focus, pan, and zoom do not rebuild or replace route geometry; actual live topology and age-boundary deltas use incremental feature updates.
- Keep route shaders prewarmed at zero opacity, switch visibility through one MapLibre global value, update only the compact trunks' active properties when the time window changes, and defer exact-line window work until detail zoom.
- Extend the 4,000-node/7,000-route browser gate to require all 7,000 routes in the 24-hour source, complete trunk accounting, unchanged source revisions across window and camera interactions, camera responsiveness, and no task longer than 100 ms.

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
