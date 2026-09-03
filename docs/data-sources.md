# Data sources

## Optional terrain elevation

Topography and 3D use the public Mapterhorn TileJSON endpoint at `https://tiles.mapterhorn.com/tilejson.json`. MapLibre reads its 512-pixel Terrarium-encoded elevation tiles as a `raster-dem` source for hillshade and terrain geometry only; the CARTO vector style remains the sole basemap and there is no raster basemap fallback. The source is created lazily after a visitor enables Topography or 3D, keeps Mapterhorn attribution visible, and receives no CartoLite state or visitor identifier.

## MeshCore Canada regions

CartoLite snapshots the public national region partition and registry used by [MeshCore.ca's region map](https://meshcore.ca/config/map/). These two source files power both the optional Regions overlay and Netgraph's Canadian node grouping:

- Partition source: `https://meshcore.ca/assets/regions/canada-region-partition.geojson`
- Registry source: `https://meshcore.ca/assets/regions/canada-regions.json`
- Retrieved: 2026-09-02
- Registry version: `2026-07-18-mcc-reg-1.1-proposed`
- Scope: 193 non-overlapping Canadian leaf regions
- Geometry: 7,886 closed rings and 381,683 published cartographic vertices; CartoLite removes, rounds, and simplifies none of them
- Partition: 8,869,764 bytes; SHA-256 `ff7ddd6ae9d08e46df00add98878fa2189a831d58fb37a7653a333b8d4159814`
- Registry: 186,627 bytes; SHA-256 `e91e0d394b7863ec87d9fff63bb38586eb95bfc8ee541390e043da60c4dc5d0b`

The partition derives region ownership from Statistics Canada 2021 Census geography under the Statistics Canada Open Licence. MeshCore community definitions, MeshMapper boundaries, and other inputs guide that deterministic ownership process as documented by the source project's [`NOTICE.txt`](https://meshcore.ca/assets/regions/NOTICE.txt) and [region standard](https://meshcore.ca/config/standard/). CartoLite preserves visible MeshCore Canada and Statistics Canada attribution.

Vite emits both files as content-hashed assets. They are served from CartoLite's own origin with immutable caching, so no node coordinates, search query, visitor identifier, or traffic data is sent to MeshCore.ca. A Web Worker validates the exact registry version, matching 193-tag sets, Polygon/MultiPolygon geometry, finite coordinates, and closed rings before use.

The main map fetches the pair only when a visitor enables Regions, then gives the unchanged polygon geometry directly to a zero-tolerance native MapLibre source. Netgraph loads the pair once before its first layout, resolves each Canadian node by point-in-polygon against the same partition, and keeps nearby U.S. fallback anchors separate. Boundaries, labels, routes, and the basemap share one camera transform.

Refresh both committed snapshots from the repository root with:

```sh
node scripts/update-meshcore-canada-regions.mjs
```

The updater fails closed unless the registry version, 193-feature count, uniqueness, and partition/seed tag sets remain exact. After a reviewed upstream release changes those contracts, update the expected version and documentation in the same commit.
