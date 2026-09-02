# Netgraph

`/netgraph/` is CartoLite's live topology view. It is a third frontend entry inside the existing binary and uses the same public schema v2 snapshot, SSE stream, recovery behavior, privacy boundary, and sound preference as the geographic map.

## What it shows

- Every public node that participates in at least one current 24-hour route. Isolated nodes remain available on the geographic map but are omitted because a topology graph has no edge on which to place them.
- Every route inside the visitor's 15-minute, one-hour, six-hour, or 24-hour window. There is no display-count limit and no trunk aggregation.
- Deterministic connected-component packing. High-degree nodes anchor each component and established positions do not change during ordinary traffic or camera movement.
- Straight topology links coloured by the latest sanitized packet kind. Selecting a node dims unrelated links and gives all active-window neighbour links a clear glow.
- The existing public node details and newest-first neighbour list, plus an in-memory Finder that searches only downloaded public labels.

## Live motion and sound

Static topology and transient traffic use separate Canvas2D layers. A route packet travels hop by hop as a coloured core, tapered glow, sparks, relay handoff, destination shimmer, and 45-second sparkling residue. Both drawing and native Web Audio use the same distance-weighted hop timeline. Each segment crossing the viewport produces exactly one articulation after the visitor enables sound. Observer-only events may wake an existing graph node but never fabricate a link or sound.

## Interaction and recovery

Drag to pan, use the wheel or trackpad to zoom, double-click to move closer, and use Reset to fit all components. Finder and selection never send or persist queries. The page stores only its route-window choice under `cartolite:netgraph:v1`; audio continues to use `cartolite:sound:v2`.

On coarse-pointer devices, controls move to their own row, the inspector becomes a bounded bottom sheet, and the page requests a screen wake lock while visible. Returning from sleep, the back-forward cache, or an offline period replaces public state and reconnects the single SSE stream without creating parallel streams.
