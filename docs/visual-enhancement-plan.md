# Visual enhancement plan

## Aim and audit

Make terrain readable and make the traffic belong to the scene, while preserving CartoLite's compact map and stable Netgraph. The baseline is v0.10.7. This patch uses the existing public feed and existing Mapterhorn elevation tiles; it adds no backend fields or dependencies.

The map already has strong protocol colours, directional cores, relay handoffs, timed residue, and synchronized sound. Its weak point in 3D is projection: it projects the two endpoints and interpolates between those screen positions. That misses intervening terrain and perspective. Its circular screen-space arrival effects also remain upright as the ground tilts. Topo is currently faint, and 3D and Topo can start independently. Netgraph already has stable geographic groupings and regional OUT/IN cues; inspected-node traffic can stand out more clearly without moving the layout.

## Research decisions

- MapLibre 5.19.0's `Map.project()` already incorporates terrain elevation and the camera. Sample the confirmed geographic segment before projection instead of interpolating only its screen endpoints. Cache these paths and invalidate them on camera or terrain-data changes. [Versioned Map implementation](https://github.com/maplibre/maplibre-gl-js/blob/v5.19.0/src/ui/map.ts), [Mercator projection](https://github.com/maplibre/maplibre-gl-js/blob/v5.19.0/src/geo/projection/mercator_transform.ts).
- Multidirectional hillshade is supported in the installed version. Use stronger, restrained highlight/shadow contrast and map-anchored illumination so rotating the camera does not rotate the sun. Separate hillshade and terrain DEM sources follow MapLibre's quality recommendation. [Multidirectional example](https://github.com/maplibre/maplibre-gl-js/blob/v5.19.0/test/examples/add-a-multidirectional-hillshade-layer.html), [terrain example](https://github.com/maplibre/maplibre-gl-js/blob/v5.19.0/test/examples/3d-terrain.html).
- Elevation comes from the existing DEM surface, not antenna metadata. The renderer remains an illustration of confirmed hops, not a radio coverage, line-of-sight, or propagation model. [Mapterhorn data](https://mapterhorn.com/).
- Keep reduced motion meaningful: static, terrain-aligned cues replace travel rather than making the feature disappear. Avoid automatic orbiting and full-screen flashes. [W3C animation guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).

## Available data and visual opportunities

| Available information | Useful visual encoding | Decision |
| --- | --- | --- |
| Node coordinates and existing DEM | Relief shading, terrain-following paths, ground-plane arrival rings | Ship |
| Confirmed ordered hop endpoints | A continuous trail, terrain-aligned sparks, relay continuity | Ship |
| Packet kind | Preserve the six colours and existing protocol signatures | Preserve |
| Selected node and actual adjacent hops | Extra emphasis on matching live Netgraph traffic | Ship |
| Last heard, packet count, bounded route activity | Quiet history behind bright live traffic | Preserve |
| Region membership and geographic distance | Existing OUT/IN and DX emphasis | Preserve |
| Camera pitch, bearing, and local projection scale | Foreshortened ground rings and restrained near/far core sizing | Ship |
| Missing antenna height, RF strength, and propagation conditions | Coverage cones, Fresnel zones, claimed signal strength | Do not invent |

## Patch

1. Strengthen Topo with multidirectional shading. Enabling 3D also enables and saves Topo if it was off. Disabling 3D leaves the visitor's Topo choice available.
2. Use bounded terrain samples for live trails, spark placement, partial reduced-motion traces, and the 45-second residue. Keep the flat-map fast path. Reproject after pan, zoom, rotation, pitch, and DEM updates without restarting a packet's clock.
3. Project expanding node/observer/arrival rings onto the local ground plane. Add modest perspective sizing to packet heads and trails in 3D, while retaining readable protocol colours.
4. Give live Netgraph segments touching the selected node a bounded emphasis. Other hops remain visible and audible; there is no invented traffic or layout motion.

## Further ideas

| Idea | Data needed | Tradeoff |
| --- | --- | --- |
| Optional packet-kind solo/dim controls | Existing kind enum | Helpful for busy meshes, but adds controls and must distinguish filtering from missing traffic |
| A restrained regional activity rhythm | Existing region assignment and short activity windows | Could make dense traffic easier to read; needs a separate contrast and motion review |
| DEM elevation readout for selected nodes | Confirmed loaded DEM coverage | Useful context, but missing tiles must never appear as a measured zero or antenna height |
| Full terrain occlusion of animated trails | Shared GPU depth in a native 3D motion layer | A larger rendering change; Canvas2D overlays do not provide true mountain occlusion |

## Validation and delivery

Use synthetic relief and packet fixtures in GitHub Actions to verify projection, caching/invalidation, auto-Topo state, perspective footprints, reduced motion, hop/audio preservation, and camera interaction. Compare flat and tilted mountain views visually. Run the existing complete browser, privacy, scale, and image gates. Preserve the current image/configuration/checkpoint, deploy only the published exact-commit image, then verify the public views and a five-minute stability window.

Size decision: Actions measured 363,905 gzip bytes across all JavaScript/CSS assets after sharing deterministic colour/hash helpers and removing the redundant residue projection cache. This is 385 bytes above the former 355 KiB ceiling. Allocate 1 KiB for terrain projection in this minor release (356 KiB total); retain the enforced gate and all data-asset budgets. The old artificial-curve helpers are removed because terrain projection replaces their remaining uses.
