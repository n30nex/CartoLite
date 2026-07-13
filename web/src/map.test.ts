import { describe, expect, it, vi } from 'vitest';
import { applyRouteLayerVisibility, darkStyle, ROUTE_LAYER_IDS } from './map';

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
});
