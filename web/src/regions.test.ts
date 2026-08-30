import { describe, expect, it } from 'vitest';
import rawRegions from './assets/meshmapper-canada-regions.geojson?raw';
import { MESHMAP_ATTRIBUTION } from './map';
import { EXPECTED_REGION_CODES, regionMapData } from './regions';

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
    expect(snapshot.features.map((feature) => feature.properties.code).sort()).toEqual(EXPECTED_REGION_CODES);
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
  }, 10_000);

  it('preserves visible source attribution', () => {
    expect(MESHMAP_ATTRIBUTION).toContain('MeshMapper');
    expect(MESHMAP_ATTRIBUTION).toContain('used with permission');
  });

  it('keeps every exact boundary edge in the camera-locked map source', () => {
    const data = regionMapData(snapshot);
    const inputEdges = snapshot.features.reduce((total, feature) => (
      total + feature.geometry.coordinates.reduce((ringTotal, ring) => ringTotal + ring.length - 1, 0)
    ), 0);
    const lines = data.features.filter((feature) => feature.geometry.type === 'LineString');
    const labels = data.features.filter((feature) => feature.geometry.type === 'Point');
    const outputEdges = lines.reduce((total, feature) => (
      total + (feature.geometry.type === 'LineString' ? feature.geometry.coordinates.length - 1 : 0)
    ), 0);

    expect(outputEdges).toBe(inputEdges);
    expect(lines).toHaveLength(EXPECTED_REGION_CODES.length);
    expect(labels.map((feature) => feature.properties?.code).sort()).toEqual(EXPECTED_REGION_CODES);
  });

  it('fails closed when the runtime asset contains an unexpected region code', () => {
    const changed = JSON.parse(rawRegions) as RegionSnapshot;
    changed.features[0]!.properties.code = 'BAD';
    expect(() => regionMapData(changed)).toThrow('regional asset code set changed');
  });
});
