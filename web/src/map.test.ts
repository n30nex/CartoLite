import { describe, expect, it, vi } from 'vitest';
import type { RouteV1 } from './types';
import { NEIGHBOR_ROUTE_RECENT_MS, recentNeighborRoutes } from './routeFocus';
import {
  applyRouteHitLayerVisibility,
  applyRouteLayerVisibility,
  applyRouteSelectionFilter,
  applySelectedNodeFilter,
  darkStyle,
  neighborRouteFilter,
  ROUTE_FILTER_LAYER_IDS,
  ROUTE_HIT_LAYER_ID,
  ROUTE_LAYER_IDS,
  SELECTED_NODE_LAYER_ID,
  selectedNodeFilter
} from './map';

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
    expect(setFilter).toHaveBeenCalledWith(SELECTED_NODE_LAYER_ID, selectedNodeFilter('node-b'));

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
  });
});

function route(id: string, from: string, to: string, lastHeard: number): RouteV1 {
  return {
    id,
    from: { id: from, label: from.toUpperCase(), lat: 43.45, lng: -80.35 },
    to: { id: to, label: to.toUpperCase(), lat: 43.5, lng: -80.2 },
    packetCount: 1,
    lastHeard,
    intensity: 1
  };
}
