import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';

export const MESHCORE_REGION_VERSION = '2026-07-18-mcc-reg-1.1-proposed';
export const EXPECTED_REGION_COUNT = 193;

type RegionGeometry = Polygon | MultiPolygon;

interface RegionProperties {
  tag: string;
  label: string;
  path: string;
  registryId: string;
  jurisdiction: string;
  parent: string;
  daCount: number;
}

type RegionFeature = Feature<RegionGeometry, RegionProperties>;

export interface RegionPoint {
  id: string;
  lat: number;
  lng: number;
}

export interface RegionAreaAssignment {
  nodeID: string;
  area: {
    code: string;
    name: string;
    lat: number;
    lng: number;
  };
}

export interface RegionDataset {
  mapData: FeatureCollection<RegionGeometry, RegionProperties>;
  indexed: Array<{
    feature: RegionFeature;
    bounds: [number, number, number, number];
    area: RegionAreaAssignment['area'];
  }>;
}

export type RegionWorkerRequest =
  | { type: 'map'; partitionUrl: string; registryUrl: string }
  | { type: 'resolve'; requestId: number; partitionUrl: string; registryUrl: string; nodes: RegionPoint[] };

export type RegionWorkerOutput =
  | { type: 'map'; data: FeatureCollection<RegionGeometry, RegionProperties> }
  | { type: 'resolved'; requestId: number; assignments: RegionAreaAssignment[] }
  | { type: 'error'; requestId?: number; message: string };

export function regionDataset(partitionValue: unknown, registryValue: unknown): RegionDataset {
  if (!isRecord(partitionValue) || partitionValue.type !== 'FeatureCollection' || !Array.isArray(partitionValue.features)) {
    throw new Error('region partition is not a GeoJSON FeatureCollection');
  }
  if (!isRecord(registryValue) || registryValue.version !== MESHCORE_REGION_VERSION || !Array.isArray(registryValue.seeds)) {
    throw new Error('region registry version or seed catalog is invalid');
  }

  const seedByTag = new Map<string, RegionAreaAssignment['area']>();
  for (const candidate of registryValue.seeds) {
    if (!isRecord(candidate)
      || typeof candidate.tag !== 'string'
      || candidate.resolve !== true
      || !finiteLatitude(candidate.lat)
      || !finiteLongitude(candidate.lon)) {
      throw new Error('invalid region seed');
    }
    const tag = candidate.tag;
    if (seedByTag.has(tag)) throw new Error(`region registry contains duplicate tag ${tag}`);
    seedByTag.set(tag, {
      code: tag.toUpperCase(),
      name: '',
      lat: candidate.lat,
      lng: candidate.lon,
    });
  }
  if (seedByTag.size !== EXPECTED_REGION_COUNT) {
    throw new Error(`region registry contains ${seedByTag.size} resolving seeds, expected ${EXPECTED_REGION_COUNT}`);
  }

  const features: RegionFeature[] = [];
  const tags = new Set<string>();
  for (const candidate of partitionValue.features) {
    if (!isRecord(candidate) || candidate.type !== 'Feature' || !isRecord(candidate.properties) || !isRecord(candidate.geometry)) {
      throw new Error('region partition contains an invalid feature');
    }
    const { tag, label, path, registryId, jurisdiction, parent, daCount } = candidate.properties;
    if (typeof tag !== 'string'
      || typeof label !== 'string'
      || typeof path !== 'string'
      || typeof registryId !== 'string'
      || typeof jurisdiction !== 'string'
      || typeof parent !== 'string'
      || typeof daCount !== 'number'
      || !Number.isInteger(daCount)
      || daCount < 1) {
      throw new Error('invalid region properties');
    }
    if (tags.has(tag)) throw new Error(`region partition contains duplicate tag ${tag}`);
    if (!seedByTag.has(tag)) throw new Error(`region partition tag ${tag} has no resolving seed`);
    if ((candidate.geometry.type !== 'Polygon' && candidate.geometry.type !== 'MultiPolygon')
      || !Array.isArray(candidate.geometry.coordinates)) {
      throw new Error(`region partition ${tag} is not polygon geometry`);
    }
    const feature = { ...candidate, id: tag } as unknown as RegionFeature;
    for (const ring of polygonRings(feature.geometry)) {
      if (ring.length < 4 || !ring.every(validPosition) || !samePosition(ring[0]!, ring[ring.length - 1]!)) {
        throw new Error(`region partition ${tag} contains an invalid ring`);
      }
    }
    tags.add(tag);
    const area = seedByTag.get(tag)!;
    area.name = label;
    features.push(feature);
  }
  if (features.length !== EXPECTED_REGION_COUNT || tags.size !== seedByTag.size) {
    throw new Error(`region partition contains ${features.length} regions, expected ${EXPECTED_REGION_COUNT}`);
  }
  for (const tag of seedByTag.keys()) {
    if (!tags.has(tag)) throw new Error(`region registry tag ${tag} is absent from the partition`);
  }

  features.sort((left, right) => left.properties.registryId.localeCompare(right.properties.registryId));
  return {
    mapData: { type: 'FeatureCollection', features },
    indexed: features.map((feature) => ({
      feature,
      bounds: geometryBounds(feature.geometry),
      area: seedByTag.get(feature.properties.tag)!,
    })),
  };
}

export function regionMapData(partitionValue: unknown, registryValue: unknown): RegionDataset['mapData'] {
  return regionDataset(partitionValue, registryValue).mapData;
}

export function resolveRegionAreas(dataset: RegionDataset, nodes: readonly RegionPoint[]): RegionAreaAssignment[] {
  const assignments: RegionAreaAssignment[] = [];
  for (const node of nodes) {
    if (typeof node.id !== 'string' || !finiteLatitude(node.lat) || !finiteLongitude(node.lng)) continue;
    const match = dataset.indexed.find(({ bounds, feature }) => (
      node.lng >= bounds[0]
      && node.lat >= bounds[1]
      && node.lng <= bounds[2]
      && node.lat <= bounds[3]
      && geometryContains(feature.geometry, node.lng, node.lat)
    ));
    if (match) assignments.push({ nodeID: node.id, area: match.area });
  }
  return assignments;
}

function geometryContains(geometry: RegionGeometry, x: number, y: number): boolean {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => (
    polygon.length > 0
    && ringContains(polygon[0]!, x, y)
    && !polygon.slice(1).some((hole) => ringContains(hole, x, y))
  ));
}

function ringContains(ring: Position[], x: number, y: number): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index]!;
    const previousPoint = ring[previous]!;
    const currentX = currentPoint[0]!;
    const currentY = currentPoint[1]!;
    const previousX = previousPoint[0]!;
    const previousY = previousPoint[1]!;
    if (pointOnSegment(x, y, currentX, currentY, previousX, previousY)) return true;
    if ((currentY > y) !== (previousY > y)
      && x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX) {
      inside = !inside;
    }
  }
  return inside;
}

function pointOnSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): boolean {
  const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
  return Math.abs(cross) <= 1e-10
    && x >= Math.min(ax, bx) - 1e-12
    && x <= Math.max(ax, bx) + 1e-12
    && y >= Math.min(ay, by) - 1e-12
    && y <= Math.max(ay, by) + 1e-12;
}

function geometryBounds(geometry: RegionGeometry): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of polygonRings(geometry)) {
    for (const position of ring) {
      minX = Math.min(minX, position[0]!);
      minY = Math.min(minY, position[1]!);
      maxX = Math.max(maxX, position[0]!);
      maxY = Math.max(maxY, position[1]!);
    }
  }
  return [minX, minY, maxX, maxY];
}

function polygonRings(geometry: RegionGeometry): Position[][] {
  return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
}

function validPosition(value: unknown): value is Position {
  return Array.isArray(value)
    && value.length === 2
    && value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate));
}

function finiteLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 90;
}

function finiteLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 180;
}

function samePosition(left: Position, right: Position): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
