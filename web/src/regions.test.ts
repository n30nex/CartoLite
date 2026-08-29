import { describe, expect, it } from 'vitest';
import rawRegions from './assets/meshmapper-canada-regions.geojson?raw';
import { MESHMAP_ATTRIBUTION } from './map';

const EXPECTED_CODES = [
  'XCM', 'XPH', 'YBL', 'YCD', 'YEG', 'YGK', 'YKA', 'YKF', 'YLK', 'YML', 'YOW', 'YPA',
  'YQA', 'YQB', 'YQF', 'YQL', 'YQQ', 'YQT', 'YQY', 'YSE', 'YTA', 'YTF', 'YTR', 'YUL',
  'YVR', 'YWG', 'YWS', 'YXU', 'YXX', 'YYB', 'YYC', 'YYJ', 'YYY', 'YYZ'
] as const;

interface RegionSnapshot {
  type: string;
  metadata: {
    source: string;
    sourceUrl: string;
    retrievedAt: string;
    country: string;
    regionCount: number;
    geometry: string;
  };
  features: Array<{
    properties: { code: string; country: string };
    geometry: { type: string; coordinates: number[][][] };
  }>;
}

describe('MeshMapper region snapshot', () => {
  const snapshot = JSON.parse(rawRegions) as RegionSnapshot;

  it('keeps the exact current Canadian region code set and retrieval metadata', () => {
    expect(snapshot.type).toBe('FeatureCollection');
    expect(snapshot.metadata).toMatchObject({
      source: 'MeshMapper',
      retrievedAt: '2026-08-29',
      country: 'CA',
      regionCount: 34,
      geometry: 'unsimplified'
    });
    expect(snapshot.metadata.sourceUrl).toContain('meshmapper.net');
    expect(snapshot.features.map((feature) => feature.properties.code).sort()).toEqual(EXPECTED_CODES);
  });

  it('keeps finite, closed, unsimplified polygon rings', () => {
    for (const feature of snapshot.features) {
      expect(feature.properties.country).toBe('CA');
      expect(feature.geometry.type).toBe('Polygon');
      const ring = feature.geometry.coordinates[0]!;
      expect(ring.length).toBeGreaterThanOrEqual(4);
      expect(ring[0]).toEqual(ring.at(-1));
      for (const coordinate of ring) {
        expect(coordinate).toHaveLength(2);
        expect(coordinate.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('preserves visible source attribution', () => {
    expect(MESHMAP_ATTRIBUTION).toContain('MeshMapper');
    expect(MESHMAP_ATTRIBUTION).toContain('used with permission');
  });
});
