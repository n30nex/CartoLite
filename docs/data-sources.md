# Data sources

## MeshMapper Canada regions

`web/src/assets/meshmapper-canada-regions.geojson` is an unsimplified snapshot of the 29 Canadian region boundaries shown by MeshMapper. Its inclusion in CartoLite was authorized by a MeshMapper and MeshCore Canada administrator. The repository does not claim ownership of the source boundaries.

- Source: MeshMapper's bounded zones endpoint, `https://meshmapper.net/?ajax=zones_bbox&minLat=41&maxLat=84&minLon=-141&maxLon=-52&exclude=`
- Retrieved: 2026-07-13
- Scope: the exact 29 zone codes whose MeshMapper country suffix is `CA`
- Transformation: Leaflet `[latitude, longitude]` points are converted to GeoJSON `[longitude, latitude]`, rings are explicitly closed, and features are sorted by region code
- Geometry: no coordinates are removed, rounded, or simplified
- Snapshot: 16,514 closed-ring vertices; SHA-256 `4f37eda7b90106bd4afbcbd3f866e28caabdc592bd3c44d9152def90e7ae3676`

Some individual outlines may ultimately incorporate data from OpenStreetMap or geoBoundaries. Their upstream provenance and licensing may therefore also apply; this snapshot preserves the geometry served by MeshMapper rather than asserting a separate origin.

Refresh the committed snapshot from the repository root with:

```sh
node scripts/update-meshmapper-regions.mjs
```

The updater checks the complete expected code set, requires every code exactly once, validates centers, radii, and every polygon coordinate, and refuses to write if the source set changes. Set `MESHMAPPER_RETRIEVED_AT=YYYY-MM-DD` to record an explicit retrieval date for a reproducible refresh.
