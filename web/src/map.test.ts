import { describe, expect, it, vi } from 'vitest';
import type { RouteV1 } from './types';
import { NEIGHBOR_ROUTE_RECENT_MS, recentNeighborRoutes } from './routeFocus';
import {
  activityHeatCollection,
  applyClusterHighlightFilter,
  applyHeatmapFocus,
  applyHeatmapLayerVisibility,
  applyNodeFocus,
  applyNeighborRingVisibility,
  applyRegionLayerVisibility,
  applyRouteFocusAppearance,
  applyRouteHoverFilter,
  applyRouteHitLayerVisibility,
  applyRouteLayerVisibility,
  applyRouteSelectionFilter,
  applySelectedNodeFilter,
  canMoveLiveFollow,
  CLUSTER_HIGHLIGHT_LAYER_ID,
  darkStyle,
  HEATMAP_LAYER_ID,
  isRouteInspectable,
  isPointInSafeArea,
  labelSortKey,
  LIVE_FOLLOW_MIN_INTERVAL_MS,
  neighborNodeIDs,
  NEIGHBOR_NODE_LAYER_ID,
  NODE_HIT_LAYER_ID,
  neighborRouteFilter,
  nodeIDFilter,
  nodeLabelPriority,
  ROUTE_FILTER_LAYER_IDS,
  ROUTE_HOVER_LAYER_IDS,
  ROUTE_HIT_LAYER_ID,
  ROUTE_LAYER_IDS,
  REGION_LAYER_IDS,
  routeCollection,
  routeColorExpression,
  routeVisualProperties,
  SELECTED_NODE_OUTER_LAYER_ID,
  SELECTED_NODE_LAYER_ID,
  selectedNodeFilter,
  tooltipPosition
} from './map';
import { PACKET_KIND_COLORS, ROUTE_MAX_AGE_MS } from './trafficVisuals';

describe('darkStyle', () => {
  it('uses local fonts without an external glyph dependency', () => {
    expect(darkStyle().glyphs).toBeUndefined();
  });
});

describe('route layer visibility', () => {
  it.each([
    [true, 'visible'],
    [false, 'none']
  ] as const)('applies visible=%s to both stable route layers', (visible, expected) => {
    const setLayoutProperty = vi.fn();
    const map = {
      getLayer: vi.fn(() => ({})),
      setLayoutProperty
    } as unknown as Parameters<typeof applyRouteLayerVisibility>[0];

    expect(applyRouteLayerVisibility(map, visible)).toBe(true);
    expect(setLayoutProperty.mock.calls).toEqual(ROUTE_LAYER_IDS.map((layerID) => [layerID, 'visibility', expected]));
  });

  it('stores pre-load intent safely by skipping layers that are not installed yet', () => {
    const setLayoutProperty = vi.fn();
    const map = {
      getLayer: vi.fn(() => undefined),
      setLayoutProperty
    } as unknown as Parameters<typeof applyRouteLayerVisibility>[0];

    expect(applyRouteLayerVisibility(map, false)).toBe(false);
    expect(setLayoutProperty).not.toHaveBeenCalled();
  });

  it('shows the wide route hit target only while neighbor routes are interactive', () => {
    const setLayoutProperty = vi.fn();
    const map = {
      getLayer: vi.fn(() => ({})),
      setLayoutProperty
    } as unknown as Parameters<typeof applyRouteHitLayerVisibility>[0];

    expect(applyRouteHitLayerVisibility(map, true)).toBe(true);
    expect(applyRouteHitLayerVisibility(map, false)).toBe(true);
    expect(setLayoutProperty.mock.calls).toEqual([
      [ROUTE_HIT_LAYER_ID, 'visibility', 'visible'],
      [ROUTE_HIT_LAYER_ID, 'visibility', 'none']
    ]);
  });

  it('keeps recent-neighbor rings in lockstep with the Routes toggle', () => {
    const setLayoutProperty = vi.fn();
    const map = {
      getLayer: vi.fn(() => ({})),
      setLayoutProperty
    } as unknown as Parameters<typeof applyNeighborRingVisibility>[0];

    expect(applyNeighborRingVisibility(map, true)).toBe(true);
    expect(applyNeighborRingVisibility(map, false)).toBe(true);
    expect(setLayoutProperty.mock.calls).toEqual([
      [NEIGHBOR_NODE_LAYER_ID, 'visibility', 'visible'],
      [NEIGHBOR_NODE_LAYER_ID, 'visibility', 'none']
    ]);
  });

  it('changes focus emphasis without overwriting packet-driven route colors', () => {
    const setPaintProperty = vi.fn();
    const map = {
      getLayer: vi.fn(() => ({})),
      setPaintProperty
    } as unknown as Parameters<typeof applyRouteFocusAppearance>[0];

    expect(applyRouteFocusAppearance(map, true)).toBe(true);
    expect(applyRouteFocusAppearance(map, false)).toBe(true);
    expect(setPaintProperty).toHaveBeenCalledWith('route-glow', 'line-width', expect.any(Array));
    expect(setPaintProperty).toHaveBeenCalledWith('routes', 'line-opacity', expect.any(Array));
    expect(setPaintProperty.mock.calls.some((call) => call[1] === 'line-color')).toBe(false);
  });
});

describe('optional map layers', () => {
  it.each([
    [true, 'visible'],
    [false, 'none']
  ] as const)('applies visible=%s to the heatmap independently', (visible, expected) => {
    const setLayoutProperty = vi.fn();
    const map = {
      getLayer: vi.fn(() => ({})),
      setLayoutProperty
    } as unknown as Parameters<typeof applyHeatmapLayerVisibility>[0];

    expect(applyHeatmapLayerVisibility(map, visible)).toBe(true);
    expect(setLayoutProperty).toHaveBeenCalledWith(HEATMAP_LAYER_ID, 'visibility', expected);
  });

  it.each([
    [true, 'visible'],
    [false, 'none']
  ] as const)('applies visible=%s to every regional layer', (visible, expected) => {
    const setLayoutProperty = vi.fn();
    const map = {
      getLayer: vi.fn(() => ({})),
      setLayoutProperty
    } as unknown as Parameters<typeof applyRegionLayerVisibility>[0];

    expect(applyRegionLayerVisibility(map, visible)).toBe(true);
    expect(setLayoutProperty.mock.calls).toEqual(REGION_LAYER_IDS.map((layerID) => [layerID, 'visibility', expected]));
  });

  it('filters heat to the selected node neighborhood and clears on deselect', () => {
    const setFilter = vi.fn();
    const map = {
      getLayer: vi.fn(() => ({})),
      setFilter
    } as unknown as Parameters<typeof applyHeatmapFocus>[0];

    expect(applyHeatmapFocus(map, ['selected', 'neighbor'])).toBe(true);
    expect(setFilter).toHaveBeenLastCalledWith(HEATMAP_LAYER_ID, nodeIDFilter(['selected', 'neighbor']));
    expect(applyHeatmapFocus(map, [])).toBe(true);
    expect(setFilter).toHaveBeenLastCalledWith(HEATMAP_LAYER_ID, null);
  });
});

describe('activity heatmap data', () => {
  it('deduplicates route endpoints and accumulates repeated activity', () => {
    const now = 1_900_000_000_000;
    const collection = activityHeatCollection([
      route('a-b', 'a', 'b', now),
      route('a-c', 'a', 'c', now)
    ], now);

    expect(collection.features.map((feature) => feature.id)).toEqual(['a', 'b', 'c']);
    expect(heatWeight(collection, 'a')).toBeGreaterThan(heatWeight(collection, 'b'));
    expect(heatWeight(collection, 'a')).toBeGreaterThan(heatWeight(collection, 'c'));
  });

  it('counts a self route once and excludes endpoints with invalid coordinates', () => {
    const now = 1_900_000_000_000;
    const invalid = route('invalid-valid', 'invalid', 'valid', now);
    invalid.from.lat = 91;
    const collection = activityHeatCollection([
      route('self', 'self', 'self', now),
      route('pair', 'pair-a', 'pair-b', now),
      invalid
    ], now);

    expect(heatWeight(collection, 'self')).toBe(heatWeight(collection, 'pair-a'));
    expect(collection.features.some((feature) => feature.id === 'invalid')).toBe(false);
    expect(collection.features.some((feature) => feature.id === 'valid')).toBe(true);
  });

  it('bounds every weight and expires heat activity after 24 hours', () => {
    const now = 1_900_000_000_000;
    const fresh = route('fresh', 'fresh-a', 'fresh-b', now);
    const boundary = route('boundary', 'boundary-a', 'boundary-b', now - ROUTE_MAX_AGE_MS);
    const expired = route('expired', 'expired-a', 'expired-b', now - ROUTE_MAX_AGE_MS - 1);
    const collection = activityHeatCollection([fresh, boundary, expired], now);

    for (const feature of collection.features) {
      expect(Number(feature.properties?.weight)).toBeGreaterThanOrEqual(0);
      expect(Number(feature.properties?.weight)).toBeLessThanOrEqual(1);
    }
    expect(collection.features.some((feature) => feature.id === 'boundary-a')).toBe(true);
    expect(collection.features.some((feature) => feature.id === 'expired-a')).toBe(false);
    expect(heatWeight(collection, 'fresh-a')).toBeGreaterThan(heatWeight(collection, 'boundary-a'));
  });
});

describe('stable route visual data', () => {
  it('keeps the exact 24-hour boundary, expires older routes, and assigns trail colors', () => {
    const now = 1_900_000_000_000;
    const text = route('text', 'text-a', 'text-b', now, 'Text', 8);
    const boundary = route('boundary', 'boundary-a', 'boundary-b', now - ROUTE_MAX_AGE_MS, 'Trace', 4);
    const expired = route('expired', 'expired-a', 'expired-b', now - ROUTE_MAX_AGE_MS - 1, 'Advert', 16);
    const collection = routeCollection([text, boundary, expired], now);

    expect(collection.features.map((feature) => feature.id)).toEqual(['text', 'boundary']);
    expect(collection.features.find((feature) => feature.id === 'text')?.properties).toMatchObject({
      color: PACKET_KIND_COLORS.Text,
      lastKind: 'Text'
    });
    expect(collection.features.find((feature) => feature.id === 'boundary')?.properties).toMatchObject({
      color: PACKET_KIND_COLORS.Trace,
      lastKind: 'Trace'
    });
    expect(routeColorExpression()).toEqual(['to-color', ['get', 'color']]);
  });

  it('keeps relative widths bounded and lets quiet routes thin naturally', () => {
    const now = 1_900_000_000_000;
    const quiet = route('quiet', 'quiet-a', 'quiet-b', now, 'Advert', 1);
    const busy = route('busy', 'busy-a', 'busy-b', now, 'ACK', 16);
    const collection = routeCollection([quiet, busy], now);
    const quietProperties = collection.features.find((feature) => feature.id === 'quiet')?.properties;
    const busyProperties = collection.features.find((feature) => feature.id === 'busy')?.properties;

    expect(Number(busyProperties?.width)).toBeGreaterThan(Number(quietProperties?.width));
    expect(Number(busyProperties?.glowWidth)).toBeGreaterThan(Number(quietProperties?.glowWidth));
    for (const properties of [quietProperties, busyProperties]) {
      expect(Number(properties?.width)).toBeGreaterThanOrEqual(0.68);
      expect(Number(properties?.width)).toBeLessThanOrEqual(1.5);
      expect(Number(properties?.glowWidth)).toBeGreaterThanOrEqual(1.8);
      expect(Number(properties?.glowWidth)).toBeLessThanOrEqual(3.4);
    }
  });
});

describe('node neighbor focus', () => {
  it('filters every route layer to recent edges touching the selected node', () => {
    const setFilter = vi.fn();
    const map = {
      getLayer: vi.fn(() => ({})),
      setFilter
    } as unknown as Parameters<typeof applyRouteSelectionFilter>[0];
    const expected = neighborRouteFilter('node-a');

    expect(applyRouteSelectionFilter(map, 'node-a')).toBe(true);
    expect(setFilter.mock.calls).toEqual(ROUTE_FILTER_LAYER_IDS.map((layerID) => [layerID, expected]));

    setFilter.mockClear();
    expect(applyRouteSelectionFilter(map, null)).toBe(true);
    expect(setFilter.mock.calls).toEqual(ROUTE_FILTER_LAYER_IDS.map((layerID) => [layerID, null]));
  });

  it('highlights only the selected node and safely skips a missing layer', () => {
    const setFilter = vi.fn();
    const present = {
      getLayer: vi.fn(() => ({})),
      setFilter
    } as unknown as Parameters<typeof applySelectedNodeFilter>[0];

    expect(applySelectedNodeFilter(present, 'node-b')).toBe(true);
    expect(setFilter.mock.calls).toEqual([
      [SELECTED_NODE_OUTER_LAYER_ID, selectedNodeFilter('node-b')],
      [SELECTED_NODE_LAYER_ID, selectedNodeFilter('node-b')]
    ]);

    const missing = {
      getLayer: vi.fn(() => undefined),
      setFilter: vi.fn()
    } as unknown as Parameters<typeof applySelectedNodeFilter>[0];
    expect(applySelectedNodeFilter(missing, 'node-b')).toBe(false);
    expect(missing.setFilter).not.toHaveBeenCalled();
  });

  it('keeps both route directions at the 24-hour boundary and excludes stale or unrelated edges', () => {
    const now = 1_900_000_000_000;
    const routes: RouteV1[] = [
      route('a-b', 'a', 'b', now),
      route('c-a', 'c', 'a', now - NEIGHBOR_ROUTE_RECENT_MS),
      route('a-d-stale', 'a', 'd', now - NEIGHBOR_ROUTE_RECENT_MS - 1),
      route('b-c', 'b', 'c', now)
    ];

    expect(recentNeighborRoutes(routes, 'a', now).map((item) => item.id)).toEqual(['a-b', 'c-a']);
    expect(recentNeighborRoutes(routes, null, now)).toEqual([]);
    expect(isRouteInspectable(routes, 'a', 'a-b', now)).toBe(true);
    expect(isRouteInspectable(routes, 'a', 'a-d-stale', now)).toBe(false);
    expect(isRouteInspectable(routes, 'a', 'b-c', now)).toBe(false);
  });

  it('deduplicates and sorts the neighbor node IDs without including the selected node', () => {
    const now = 1_900_000_000_000;
    const routes = [
      route('a-c', 'a', 'c', now),
      route('b-a', 'b', 'a', now),
      route('a-b', 'a', 'b', now),
      route('a-a', 'a', 'a', now)
    ];

    expect(neighborNodeIDs(routes, 'a')).toEqual(['b', 'c']);
    expect(neighborNodeIDs(routes, null)).toEqual([]);
  });

  it('dims context nodes, limits labels and glow, and prioritizes the selected label', () => {
    const setFilter = vi.fn();
    const setPaintProperty = vi.fn();
    const setLayoutProperty = vi.fn();
    const map = {
      getLayer: vi.fn(() => ({})),
      setFilter,
      setPaintProperty,
      setLayoutProperty
    } as unknown as Parameters<typeof applyNodeFocus>[0];

    expect(applyNodeFocus(map, 'a', ['a', 'b'], ['b'])).toBe(true);
    expect(setFilter).toHaveBeenCalledWith('nodes-glow', nodeIDFilter(['a', 'b']));
    expect(setFilter).toHaveBeenCalledWith(NEIGHBOR_NODE_LAYER_ID, nodeIDFilter(['b']));
    expect(setFilter).toHaveBeenCalledWith('node-labels', nodeIDFilter(['a', 'b']));
    expect(setLayoutProperty).toHaveBeenCalledWith('node-labels', 'symbol-sort-key', labelSortKey('a', ['b']));
    expect(setPaintProperty).toHaveBeenCalledWith('nodes', 'circle-opacity', expect.any(Array));
    expect(setPaintProperty).toHaveBeenCalledWith('node-core', 'circle-opacity', expect.any(Array));
  });

  it('adds and clears the filtered route spotlight without touching source data', () => {
    const setFilter = vi.fn();
    const setLayoutProperty = vi.fn();
    const map = {
      getLayer: vi.fn(() => ({})),
      setFilter,
      setLayoutProperty
    } as unknown as Parameters<typeof applyRouteHoverFilter>[0];

    expect(applyRouteHoverFilter(map, 'route-a')).toBe(true);
    expect(setFilter.mock.calls).toEqual(ROUTE_HOVER_LAYER_IDS.map((layerID) => [layerID, ['==', ['get', 'id'], 'route-a']]));
    expect(setLayoutProperty.mock.calls).toEqual(ROUTE_HOVER_LAYER_IDS.map((layerID) => [layerID, 'visibility', 'visible']));

    setFilter.mockClear();
    setLayoutProperty.mockClear();
    applyRouteHoverFilter(map, null);
    expect(setLayoutProperty.mock.calls).toEqual(ROUTE_HOVER_LAYER_IDS.map((layerID) => [layerID, 'visibility', 'none']));
  });

  it('targets one cluster for hover polish and clears it with an impossible ID', () => {
    const setFilter = vi.fn();
    const map = {
      getLayer: vi.fn(() => ({})),
      setFilter
    } as unknown as Parameters<typeof applyClusterHighlightFilter>[0];

    expect(applyClusterHighlightFilter(map, 42)).toBe(true);
    expect(applyClusterHighlightFilter(map, null)).toBe(true);
    expect(setFilter.mock.calls).toEqual([
      [CLUSTER_HIGHLIGHT_LAYER_ID, ['==', ['get', 'cluster_id'], 42]],
      [CLUSTER_HIGHLIGHT_LAYER_ID, ['==', ['get', 'cluster_id'], -1]]
    ]);
  });
});

describe('visual hierarchy and soft follow', () => {
  it('keeps tooltips inside the viewport near every edge', () => {
    const viewport = { width: 360, height: 640 };
    const tooltip = { width: 180, height: 54 };
    expect(tooltipPosition({ x: 2, y: 2 }, viewport, tooltip)).toEqual({ x: 98, y: 14 });
    expect(tooltipPosition({ x: 358, y: 638 }, viewport, tooltip)).toEqual({ x: 262, y: 572 });
  });

  it('defines a dedicated enlarged node hit target', () => {
    expect(NODE_HIT_LAYER_ID).toBe('node-hit');
  });

  it('keeps only the central 60 percent inside the safe area', () => {
    const viewport = { width: 1_000, height: 500 };
    expect(isPointInSafeArea({ x: 200, y: 100 }, viewport)).toBe(true);
    expect(isPointInSafeArea({ x: 800, y: 400 }, viewport)).toBe(true);
    expect(isPointInSafeArea({ x: 199, y: 250 }, viewport)).toBe(false);
    expect(isPointInSafeArea({ x: 500, y: 401 }, viewport)).toBe(false);
    expect(isPointInSafeArea({ x: 0, y: 0 }, { width: 0, height: 0 })).toBe(false);
  });

  it('throttles follow moves to one per 1.2 seconds', () => {
    expect(canMoveLiveFollow(0, 100)).toBe(true);
    expect(canMoveLiveFollow(10_000, 10_000 + LIVE_FOLLOW_MIN_INTERVAL_MS - 1)).toBe(false);
    expect(canMoveLiveFollow(10_000, 10_000 + LIVE_FOLLOW_MIN_INTERVAL_MS)).toBe(true);
  });

  it('uses decaying traffic for width while route age controls brightness', () => {
    const now = 1_900_000_000_000;
    const quiet = routeVisualProperties({ traffic: 0, lastHeard: now }, now, 1);
    const active = routeVisualProperties({ traffic: 64, lastHeard: now }, now, 1);
    const old = routeVisualProperties({ traffic: 64, lastHeard: now - 60 * 60_000 }, now, 1);

    expect(active.width).toBeGreaterThan(quiet.width);
    expect(active.glowWidth).toBeGreaterThan(quiet.glowWidth);
    expect(active.opacity).toBeGreaterThan(old.opacity);
    expect(active.width).toBeLessThanOrEqual(1.5);
    expect(active.glowWidth).toBeLessThanOrEqual(3.4);
    expect(old.width).toBeLessThan(active.width);
    expect(old.glowWidth).toBeLessThan(active.glowWidth);
    for (const visual of [quiet, active, old]) {
      expect(visual.trafficLevel).toBeGreaterThanOrEqual(0);
      expect(visual.trafficLevel).toBeLessThanOrEqual(1);
      expect(visual.opacity).toBeGreaterThanOrEqual(0);
      expect(visual.opacity).toBeLessThanOrEqual(1);
    }
  });

  it('prioritizes fresh observers and repeaters over stale leaf nodes', () => {
    const now = 1_900_000_000_000;
    const observer = nodeLabelPriority({ role: 'companion', observer: true, lastSeen: now }, now);
    const repeater = nodeLabelPriority({ role: 'repeater', observer: false, lastSeen: now }, now);
    const stale = nodeLabelPriority({ role: 'unknown', observer: false, lastSeen: now - 48 * 60 * 60_000 }, now);

    expect(observer).toBeLessThan(repeater);
    expect(repeater).toBeLessThan(stale);
  });
});

function route(
  id: string,
  from: string,
  to: string,
  lastHeard: number,
  lastKind: RouteV1['lastKind'] = 'Other',
  traffic = 1
): RouteV1 {
  return {
    id,
    from: { id: from, label: from.toUpperCase(), lat: 43.45, lng: -80.35 },
    to: { id: to, label: to.toUpperCase(), lat: 43.5, lng: -80.2 },
    packetCount: 1,
    lastHeard,
    intensity: 1,
    lastKind,
    traffic
  };
}

function heatWeight(collection: ReturnType<typeof activityHeatCollection>, id: string): number {
  const feature = collection.features.find((item) => item.id === id);
  if (!feature) throw new Error(`missing heat feature ${id}`);
  return Number(feature.properties?.weight);
}
