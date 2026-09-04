# Changelog

## 0.10.4 - 2026-09-04

### Performance and animation

- Update Netgraph node and route indexes incrementally. Last-heard and packet-count updates no longer rebuild the complete topology or repaint unchanged historical ink; inspector data remains current.
- Cache node ink and slowly fading route residue, reuse projected endpoints and region text widths, and batch node shapes in small groups. Keep every node, historical link, live hop, and musical articulation.
- Bound mobile canvas resolution to 1.25 pixels per CSS pixel (1.5 on desktop), skip off-screen animation loops, and replace large live region gradients and shadow blurs with lightweight coloured rings. OUT/IN and regional label pulses remain exclusive to Netgraph.
- Refine live packets with a tapered comet, cached soft head glow, smooth travelling sparkles, and clearer relay handoffs. Repeated decorative residue refreshes instead of stacking to white; the 45-second lifetime stays unchanged.
- Remove forced layout on every packet from both map and Netgraph traffic meters. Use opaque mobile controls instead of repeatedly blurring live canvases underneath them.
- Add 4,000-node regression coverage for incremental updates, cached-label invalidation, idle animation, and phone/landscape pixel budgets. Existing APK installs receive this frontend update when reopening the app; no native package or signing change is required.

## 0.10.3 - 2026-09-02

### Corrected

- Move live region-name pulses and their explicit **OUT**, **IN**, and **LOCAL** direction badges entirely to Netgraph. Cross-region events light the sending area at departure and the receiving area at final-hop arrival in the sanitized packet-kind colour; long-distance candidates retain the **DX** prefix and a stronger bounded area halo.
- Keep the geographic map's optional MeshCore.ca Regions layer static. It no longer resolves node-to-region assignments, creates live label markers, changes polygon feature state, or shows OUT/IN cues. Its existing packet trail may still receive restrained distance-based long-haul emphasis.
- Reuse Netgraph's already-loaded exact 193-region assignments and existing packet timeline, with no backend field, additional request, history, visitor storage, or public API change.
- Add browser acceptance coverage proving regional direction cues appear in Netgraph and remain absent from the geographic map.

## 0.10.2 - 2026-09-02

### Added

- Animate the exact MeshCore.ca labels and borders for live regional traffic. Same-region packets produce one restrained protocol-coloured pulse; cross-region packets bloom outward from the sending label, keep it present through transit, and answer with an inward pulse at the receiving label when the final hop arrives.
- Mark cross-region routes of at least 75 km as long-haul DX candidates. Their live packet keeps its packet-kind colour while gaining a brighter, wider comet, stronger endpoint cues, a ten-second paired region glow after arrival, an extra bounded residue sparkle, a compact moving `DX` marker, and MapLibre-anchored high-contrast region labels marked OUT and IN.

### Performance and accuracy

- Reuse the lazy region worker and its validated 193-polygon dataset for incremental node-to-region assignment. Ordinary node updates resolve only moved or new coordinates, activity uses bounded feature-state cues, and bursts collapse to one strongest frame per active region instead of creating flashing overlays.
- Retain at most 24 recent regional cues for 12 seconds during initial lazy loading, so a packet arriving as the page starts still receives its exact label handoff once assignment is ready rather than disappearing silently.
- Pin GeoJSON working-tree and archive line endings to LF so the committed MeshCore.ca byte checksum remains reproducible on Windows and Linux manual build hosts.
- Keep regional traffic logic in a lazy chunk and raise the aggregate multipage compressed-asset cap by only 5 KiB; the optional effect stays off the path until Regions is used and the production-key build retains headroom.
- Keep route geometry, packet timing, audio articulation, public schema v2, and all privacy boundaries unchanged. DX indicates an observable cross-region geographic span, not proof of a particular propagation mechanism; reduced-motion mode replaces travel-like label motion with a stable fading highlight.

## 0.10.1 - 2026-09-02

### Improved

- Use the published MeshCore.ca national partition and registry as CartoLite's single Canadian region source. The main map now draws all 193 leaf regions, while Netgraph resolves each Canadian node against the exact same polygons instead of guessing from the nearest centre. TuxCat and HamGurnett now resolve to Hamilton; Cambridge, Kitchener, and Waterloo resolve to Waterloo.
- Spread area centres across a geography-shaped, screen-filling layout, increase dense-cluster node spacing again, and draw restrained area halos with canonical on-air tags, region names, and node counts. Reset now fits those labelled areas instead of packing every connected component around one origin, while individual node names wait until detail zoom, hover, or selection.
- Keep every historical and live route. Inter-area history is rendered as a quieter dashed link so it remains visible without visually merging local meshes; live packet cores, trails, handoffs, residue, and musical hops remain unchanged and travel across the full link.
- Preserve established node coordinates during live updates, keep all area assignment in the browser, and leave public API schema v2 and its privacy boundary unchanged.
- Keep the larger region partition and registry content-hashed, same-origin, worker-validated, and lazy. Netgraph loads them once when it starts; the map fetches them only when Regions is enabled. No location lookup, query, or node data is sent to MeshCore.ca.

## 0.10.0 - 2026-09-02

### Added

- Add **Netgraph** at `/netgraph/`, a full-screen live topology view beside Map and Labs. It renders every connected public node and every route in the selected age window with deterministic component packing, stable straight links, role-specific node shapes, pan, zoom, whole-graph reset, a local Finder, and a persistent neighbour inspector.
- Reuse the existing sanitized state snapshot, single-flight SSE recovery, Android screen wake lock, Aurora/Wood/Chimes sound preference, and one-articulation-per-visible-hop contract without adding a backend endpoint, analytics, or runtime dependency.
- Add a separate transient canvas for protocol-coloured packet cores, tapered trails, sparks, relay handoffs, destination shimmer, observer wakes, and 45-second route residue. The topology canvas remains still while traffic animates so camera movement cannot jiggle links or nodes.

### Performance and compatibility

- Lay out connected components once and update route styling independently of the camera. New topology extends the existing layout without moving established nodes, and ordinary packet updates never rerun layout.
- Keep public API schema v2, the 24-hour topology boundary, MapLibre map, Labs, Android shell, backend storage, and privacy guarantees unchanged. Netgraph searches only already-downloaded labels and stores only its route-window preference.

## 0.9.1 - 2026-09-02

### Changed

- Replace Packet Pond's painted surface motion with a full-screen WebGL2 water renderer using layered procedural waves, moving texture detail, caustics, normals, moon glints, and the newest packet impacts as shader ripple uniforms. Canvas droplets, route currents, coloured rings, vegetation, and a Canvas2D fallback remain layered above it.
- Give every Pond hop a departure ripple, three travelling wake impacts, and a longer five-ring landing while bounding shader and Canvas ripple detail during bursts to preserve smooth animation.
- Expand the shared Labs latitude cartogram so real Canadian activity uses the full stage instead of collecting along its southern edge.
- Regenerate Firefly Meadow's foreground as widely separated vegetation clusters, spatially thin node-plants with a screen-space minimum gap, lengthen flight time, and strengthen firefly trails so live packets stay visible through the open meadow.
- Separate Mesh Loom into seven nearest-public-hub lanes from YVR through YFB, widen live fibres and knots, and add a persistent packet-kind colour legend. Lane assignment derives only from already-public endpoint coordinates and does not add or expose a backend region field.
- Split dense Village cells into bounded settlements and lay settlements out as a responsive geographic cartogram across the usable stage. Buildings retain deterministic node identity, local spacing adapts to each cell, and real routes remain the roads between them.

### Compatibility and privacy

- Keep public schema v2, SSE events, backend state, sound preferences, observer behavior, and all visitor privacy boundaries unchanged. WebGL2 failure falls back locally to the existing Canvas water path.

## 0.9.0 - 2026-09-02

### Added

- Add **Little Mesh Villages**, a deterministic 2.5D toy-Canada view where recently observed public nodes become role-specific buildings, active routes become local roads or intercity links, and ordered live hops carry porch-light couriers through the settlement.
- Add four original, locally bundled visual assets for Packet Pond and Firefly Meadow: moonlit water, pond-edge vegetation, a nocturnal meadow plate, and transparent foreground grasses. The assets load only with their experiment and make no network request after the CartoLite asset fetch.
- Add Loom and Village Web Audio characters layered under the existing Aurora, Wood, and Chimes scene choices. They retain one oscillator and one scheduled articulation per visible hop without changing saved sound preferences.

### Changed

- Rework Packet Pond with textured moving water, restrained caustics, animated route currents, curved luminous droplets, splash crowns, multi-ring landings, longer channel memory, and a moonlit botanical frame.
- Rework Firefly Meadow with a deep layered environment, richer deterministic node-plants, winged fireflies, smooth particle trails, explicit relay blooms, longer plant wakes, atmospheric haze, and burst-aware secondary detail.
- Rework Mesh Loom as a dimensional textile with animated shuttle reveal, layered fibre, woven knots, selvage beams, persistent cloth motion, richer observer patches, and a softer plucked-string sound character.

### Removed

- Remove the Northern Lights experiment and its WebGL shader/fallback code. Old `?experiment=northern-lights` links safely open Packet Pond.

### Privacy and performance

- Keep public schema v2, the single shared SSE connection, backend behavior, and visitor storage unchanged. Village grouping uses only the already-downloaded public node and route state, caps the most recently observed node set, partitions long geographic components before drawing settlements, and caches static roads and buildings offscreen.

## 0.8.3 - 2026-09-01

### Added

- Add **CartoLite Labs** at `/labs/` as a same-binary, dynamically loaded generative-art surface powered only by the existing sanitized state snapshot and SSE stream.
- Ship four initial experiments: Packet Pond, Firefly Meadow, Northern Lights Relay Sky, and Mesh Loom. They preserve packet kind, ordered hops, geographic distance, route reuse, observer-only activity, and bounded session density instead of inventing traffic.
- Add a responsive shared Labs shell with direct experiment links, live status, native Aurora/Wood/Chimes sound controls, pause and reset, reduced-motion support, factual live captions, exhibition rotation, full-screen presentation, Android wake lock, and hidden-page recovery.
- Add a deterministic synthetic demo mode covering one-hop, multi-hop, observer-only, burst, and quiet cases without contacting the production API.

### Changed

- Build the map and Labs as two Vite HTML entries with shared hashed chunks; experiments load only after selection and remain absent from the main map entry.
- Resolve extensionless trailing-slash directories such as `/labs/` to their own `index.html`, keep every HTML document uncached, and retain immutable caching for hashed assets and strict 404s for unknown paths.
- Generalize the existing route sonifier to a small viewport-projector interface so Labs can reuse the proven gesture-gated sound engine without adding MapLibre or another audio dependency.

### Privacy and compatibility

- Keep public API schema v2, SSE events, MQTT isolation, checkpoint and topology limits, map behavior, and Android shell unchanged. Labs stores no packet stream, query, analytics identifier, or experiment history; only the existing `{enabled, volume, scene}` sound preference persists.
- Keep observer-only events local and unconnected in every experiment. No message contents, payloads, hashes, keys, raw paths, credentials, or resolver details enter the browser.

## 0.8.2 - 2026-08-31

### Added

- Add CartoLite for Android 1.0.0: a signed, dependency-light native shell with an immersive map, branded connection recovery, native screen-awake behavior, lifecycle and network resume signalling, predictive back navigation, and strict same-origin HTTPS browsing.
- Publish the Android release certificate and Digital Asset Links association for `org.canadaverse.cartolite`, allowing verified `carto.canadaverse.org` links to open directly in the installed app.
- Add a first-party Android download link to the in-map About panel while keeping installation outside the live map flow.

### Changed

- Use the compact Layers layout on portrait tablets up to 900 CSS pixels wide while retaining the full desktop controls in tablet landscape. This prevents the status and map controls from overlapping at intermediate widths.

### Privacy and security

- Keep the Android app free of analytics, accounts, broker credentials, JavaScript bridges, cookies, cleartext traffic, file access, backups, and optional runtime permissions. The app requests only Internet and network-state access and loads the existing public CartoLite origin.
- Keep public API schema v2, SSE event types, backend storage, topology bounds, and browser privacy guarantees unchanged.

## 0.8.1 - 2026-08-31

### Changed

- Keep the screen awake automatically on supported mobile browsers while CartoLite is visible, and reacquire the native screen wake lock after returning to the page.
- Render the ordinary individual route layer at every zoom and stop generating or displaying national and regional route trunks.
- Keep every exact route in one camera-stable MapLibre WebGL renderer: a georeferenced cached texture at national zoom and one compact line buffer at detail zoom. This removes GeoJSON retessellation from the Routes switch without replacing routes with trunks or dropping links.
- Run active packet travel, lingering route sparkles, and node wakes at the browser's animation-frame cadence on phones while keeping the heavier route glow cached.

### Fixed

- Refresh public state and replace the SSE connection after an Android page resumes from sleep, returns from the back-forward cache, or comes back online.
- Coalesce simultaneous resume signals through the existing recovery path so the page cannot create duplicate live streams.
- Give detailed map nodes a 44-pixel minimum touch target so selection remains reliable on narrow phone screens.

### Privacy and compatibility

- Keep public API schema v2, terrain, route-age windows, sound preferences, and all public-state privacy guarantees unchanged. Wake-lock and resume state remain browser-local.

## 0.8.0 - 2026-08-31

### Added

- Add a browser-local Clusters control that reveals individual nodes at every zoom without changing or trimming the public topology.
- Add lazy, attributed Mapterhorn hillshade and an optional pitched 3D terrain mode. Terrain gestures are enabled only while 3D is active.
- Split the heatmap into packet-kind colour fields so Advert, Trace, Text, ACK, Control, and Other hotspots remain visible and distinct.

### Changed

- Hold each Live Follow view for five seconds, then move to the newest waiting activity instead of chasing every packet.
- Refine the route and packet palette, strengthen exact-route detail, and extend recent live-route glow from 15 to 45 seconds with deterministic coloured sparkles independent of the historical Routes layer.
- Persist Clusters, Topography, and 3D alongside the existing browser-local layer choices.

### Fixed

- Unlock Android Chrome Web Audio from the enabling tap with one inaudible buffer frame before the first asynchronous resume, while retaining exactly one audible oscillator per visible hop.

### Privacy and compatibility

- Keep public API schema v2, SSE, health, readiness, storage, and backend behavior unchanged. Topography remains opt-in and its elevation requests go directly to the attributed terrain provider.

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
