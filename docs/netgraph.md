# Netgraph

`/netgraph/` is CartoLite's live topology view. It is a third frontend entry inside the existing binary and uses the same public schema v2 snapshot, SSE stream, recovery behavior, privacy boundary, and sound preference as the geographic map.

## What it shows

- Every public node that participates in at least one current 24-hour route. Isolated nodes remain available on the geographic map but are omitted because a topology graph has no edge on which to place them.
- Every route inside the visitor's 15-minute (default), one-hour, six-hour, or 24-hour window. There is no display-count limit and no trunk aggregation. An explicitly saved window still takes precedence over the default.
- Deterministic geographic-area packing. Canadian nodes are resolved in a Web Worker against the published 193-leaf MeshCore.ca partition also used by the main map. Nodes outside that partition use a small browser-local nearby-metro catalogue. Nodes are arranged with generous spacing around the region seed and high-degree nodes near the centre. Area labels show the canonical on-air tag, region name, and node count. This is geographic grouping, not a claim about MQTT origin or RF propagation.
- Intermittent inter-area links never merge city clusters. They remain individual, quieter dashed historical links, while their live animation and musical hops cross the full straight segment normally.
- Straight topology links coloured by the latest sanitized packet kind. Selecting a node dims unrelated links and gives all active-window neighbour links a clear glow.
- The existing public node details and newest-first neighbour list, plus an in-memory Finder that searches only downloaded public labels.

## Live motion and sound

Static topology and transient traffic use separate Canvas2D layers. Subtle geographic-area halos and labels are painted with the static graph. Live regional cues belong only to Netgraph: a local packet briefly marks one area as LOCAL, while cross-region traffic pulses the sending label as OUT at departure and the receiving label as IN at final-hop arrival. Long-distance candidates add a DX prefix and stronger bounded halo without flashing the whole page. A route packet travels hop by hop as a coloured core, tapered glow, sparks, relay handoff, destination shimmer, and 45-second sparkling residue. Both drawing and native Web Audio use the same distance-weighted hop timeline. Each segment crossing the viewport produces exactly one articulation after the visitor enables sound. Observer-only events may wake an existing graph node but never fabricate a link or sound.

## Interaction and recovery

Node and route indexes update incrementally. Changes to counts or last-heard timestamps do not repaint unchanged historical ink; route styles, window changes, node labels, selection, and camera movement invalidate only the necessary caches. Node shapes use small batches, node ink uses a separate cache, and completed route glow refreshes at most every 125 ms unless its contents or projection change. The moving packet, handoffs, and sparkles still use animation-frame cadence. Repeated same-kind residue refreshes rather than stacking, without coalescing live packets or sound. Off-screen effects wake on expiry or when the camera returns, and reduced motion also wakes for a delayed receiving-region cue.

The mobile canvas pixel ratio is capped at 1.25 (desktop 1.5), matching the map's animation budget. Mobile controls avoid backdrop blur over live canvases. Large per-frame blurred region fills have been replaced by coloured outline rings, while label colour, OUT/IN timing, and long-haul emphasis are preserved.

Drag with one finger to pan; pinch with two fingers to zoom and pan together in Android Chrome and the APK. Lifting one finger continues the drag without jumping or clearing selection. Cancelled touches and backgrounding release all gesture state. Desktop wheel/trackpad and double-click zoom remain available, alongside 44-pixel Zoom in/out buttons. Reset fits all components. Finder and selection never send or persist queries. The page stores only its route-window choice under `cartolite:netgraph:v1`; audio continues to use `cartolite:sound:v2`.

The content-hashed partition and registry are bundled with CartoLite, fetched from the same origin, and never receive a node, query, or visitor identifier. They load once before the first layout and are reused by the worker for recovery snapshots, so classification cannot visibly jump after the graph appears.

On coarse-pointer devices, controls move to their own row, the inspector becomes a bounded bottom sheet, and the page requests a screen wake lock while visible. Returning from sleep, the back-forward cache, or an offline period replaces public state and reconnects the single SSE stream without creating parallel streams.
