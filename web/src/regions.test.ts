import { describe, expect, it } from 'vitest';
import rawPartition from './assets/meshcore-canada-region-partition.geojson?raw';
import rawRegistry from './assets/meshcore-canada-regions.json?raw';
import { MESHCORE_REGION_ATTRIBUTION } from './map';
import {
  EXPECTED_REGION_COUNT,
  MESHCORE_REGION_VERSION,
  regionDataset,
  regionMapData,
  resolveRegionAreas,
} from './regions';

interface RegionPartition {
  type: string;
  features: Array<{
    properties: { tag: string; label: string; registryId: string };
    geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown[] };
  }>;
}

describe('MeshCore Canada region partition', () => {
  const partition = JSON.parse(rawPartition) as RegionPartition;
  const registry = JSON.parse(rawRegistry) as { version: string; seeds: Array<{ tag: string; resolve: boolean }> };

  it('keeps the exact published registry version and complete leaf set', () => {
    expect(partition.type).toBe('FeatureCollection');
    expect(partition.features).toHaveLength(EXPECTED_REGION_COUNT);
    expect(registry.version).toBe(MESHCORE_REGION_VERSION);
    const partitionTags = partition.features.map(({ properties }) => properties.tag).sort();
    const seedTags = registry.seeds.filter(({ resolve }) => resolve).map(({ tag }) => tag).sort();
    expect(new Set(partitionTags).size).toBe(EXPECTED_REGION_COUNT);
    expect(partitionTags).toEqual(seedTags);
  });

  it('keeps finite, closed Polygon and MultiPolygon rings', () => {
    const data = regionMapData(partition, registry);
    let ringCount = 0;
    let vertexCount = 0;
    let allRingsClosed = true;
    let allCoordinatesFinite = true;
    for (const feature of data.features) {
      const polygons = feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
      for (const polygon of polygons) {
        for (const ring of polygon) {
          ringCount += 1;
          vertexCount += ring.length;
          allRingsClosed &&= ring.length >= 4
            && ring[0]?.[0] === ring.at(-1)?.[0]
            && ring[0]?.[1] === ring.at(-1)?.[1];
          for (const coordinate of ring) {
            allCoordinatesFinite &&= coordinate.length === 2 && coordinate.every(Number.isFinite);
          }
        }
      }
    }
    expect(ringCount).toBe(7_886);
    expect(vertexCount).toBe(381_683);
    expect(allRingsClosed).toBe(true);
    expect(allCoordinatesFinite).toBe(true);
    expect(data.features.every((feature) => feature.id === feature.properties.tag)).toBe(true);
  }, 10_000);

  it('resolves Hamilton and Waterloo nodes from the authoritative partition', () => {
    const dataset = regionDataset(partition, registry);
    const assignments = new Map(resolveRegionAreas(dataset, [
      { id: 'tuxcat', lat: 43.243158, lng: -79.94833 },
      { id: 'hamgurnett', lat: 43.22294, lng: -79.92149 },
      { id: 'cambridge', lat: 43.3616, lng: -80.3123 },
      { id: 'kitchener', lat: 43.4516, lng: -80.4925 },
    ]).map(({ nodeID, area }) => [nodeID, area]));

    expect(assignments.get('tuxcat')).toMatchObject({ code: 'HAM', name: 'Hamilton' });
    expect(assignments.get('hamgurnett')).toMatchObject({ code: 'HAM', name: 'Hamilton' });
    expect(assignments.get('cambridge')).toMatchObject({ code: 'WAT', name: 'Waterloo' });
    expect(assignments.get('kitchener')).toMatchObject({ code: 'WAT', name: 'Waterloo' });
  });

  it('preserves source attribution for the shared main-map layer', () => {
    expect(MESHCORE_REGION_ATTRIBUTION).toContain('MeshCore Canada');
    expect(MESHCORE_REGION_ATTRIBUTION).toContain('Statistics Canada Open Licence');
  });

  it('fails closed when partition and registry tags disagree', () => {
    const changed = JSON.parse(rawPartition) as RegionPartition;
    changed.features[0]!.properties.tag = 'bad';
    expect(() => regionMapData(changed, registry)).toThrow('has no resolving seed');
  });
});
