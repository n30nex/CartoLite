# Changelog

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

### Security

- Add a restrictive Permissions Policy and one-year HSTS response policy.
- Build with Go 1.25.13 and `golang.org/x/net` 0.56.0 to include the current upstream security fixes.

## 0.3.1 - 2026-08-27

### Fixed

- Authenticate CARTO raster basemap tile requests so the live map no longer displays the API key warning.

### Changed

- Supply the CARTO basemap key to frontend image builds through a BuildKit secret.
- Require the `CARTO_BASEMAP_API_KEY` repository secret for publishable builds and document the deployment requirement.
