import { describe, expect, it } from 'vitest';
import { LOOM_REGIONS, loomRegionForEndpoints } from './experiments/meshLoom';

describe('Mesh Loom geographic lanes', () => {
  it('assigns public endpoint geography to the nearest Canadian hub lane', () => {
    expect(loomRegionForEndpoints([{ lat: 49.28, lng: -123.12 }])).toBe('YVR');
    expect(loomRegionForEndpoints([{ lat: 43.65, lng: -79.38 }])).toBe('YYZ');
    expect(loomRegionForEndpoints([{ lat: 64, lng: -69 }])).toBe('YFB');
  });

  it('keeps a stable bounded lane set without requiring API region fields', () => {
    expect(LOOM_REGIONS.map((region) => region.code)).toEqual(['YVR', 'YYC', 'YWG', 'YYZ', 'YUL', 'YHZ', 'YFB']);
    expect(loomRegionForEndpoints([])).toBe('YWG');
  });
});
