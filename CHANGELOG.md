# Changelog

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
