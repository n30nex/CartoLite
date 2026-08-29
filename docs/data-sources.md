# Data sources

## MeshMapper Canada regions

`web/src/assets/meshmapper-canada-regions.geojson` is an unsimplified snapshot of the 34 Canadian region boundaries shown by MeshMapper. Its inclusion in CartoLite was authorized by a MeshMapper and MeshCore Canada administrator. The repository does not claim ownership of the source boundaries.

- Source: MeshMapper's bounded zones endpoint, `https://meshmapper.net/?ajax=zones_bbox&minLat=41&maxLat=84&minLon=-141&maxLon=-52&exclude=`
- Retrieved: 2026-08-29
- Scope: the exact 34 zone codes whose MeshMapper country suffix is `CA`
- Transformation: Leaflet `[latitude, longitude]` points are converted to GeoJSON `[longitude, latitude]`, rings are explicitly closed, and features are sorted by region code
- Geometry: no coordinates are removed, rounded, or simplified
- Snapshot: 46,449 closed-ring vertices; SHA-256 `6013c8879e44904df0e91389257a43e9d4250fa5e612d1b6002bcd20d7b6fa2c`

Vite emits this snapshot as a content-hashed `.geojson` asset. CartoLite serves it as `application/geo+json` with immutable origin caching, and the production Cloudflare rule may cache only the matching `/assets/meshmapper-canada-regions-*.geojson` path. The overlay remains lazy and is fetched only when a visitor enables Regions. A Web Worker validates the exact code set and closed rings, then sends small line-piece batches to a dedicated Canvas2D renderer that preserves every source edge and paints collision-aware labels. MapLibre retains the visible MeshMapper attribution without ingesting the boundary geometry. This runtime partition changes neither the cached snapshot nor its coordinates.

Some individual outlines may ultimately incorporate data from OpenStreetMap or geoBoundaries. Their upstream provenance and licensing may therefore also apply; this snapshot preserves the geometry served by MeshMapper rather than asserting a separate origin.

Refresh the committed snapshot from the repository root with:

```sh
node scripts/update-meshmapper-regions.mjs
```

The updater checks the complete expected code set, requires every code exactly once, validates centers, radii, and every polygon coordinate, and refuses to write if the source set changes. Set `MESHMAPPER_RETRIEVED_AT=YYYY-MM-DD` to record an explicit retrieval date for a reproducible refresh.
