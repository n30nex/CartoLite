import type { Feature, FeatureCollection, LineString, MultiPolygon, Point, Polygon, Position } from 'geojson';

export const EXPECTED_REGION_CODES = [
  'XCM', 'XPH', 'YBL', 'YCD', 'YEG', 'YGK', 'YKA', 'YKF', 'YLK', 'YML', 'YOW', 'YPA',
  'YQA', 'YQB', 'YQF', 'YQL', 'YQQ', 'YQT', 'YQY', 'YSE', 'YTA', 'YTF', 'YTR', 'YUL',
  'YVR', 'YWG', 'YWS', 'YXU', 'YXX', 'YYB', 'YYC', 'YYJ', 'YYY', 'YYZ'
] as const;

type RegionGeometry = Polygon | MultiPolygon;
type RegionFeature = Feature<RegionGeometry>;

export type RegionWorkerOutput =
  | { type: 'data'; data: FeatureCollection<LineString | Point> }
  | { type: 'error'; message: string };

export function regionMapData(value: unknown): FeatureCollection<LineString | Point> {
  const snapshot = assertRegionSnapshot(value);
  const features: Array<Feature<LineString | Point>> = [];

  for (const feature of snapshot.features) {
    const properties = feature.properties!;
    const code = String(properties.code);
    const name = String(properties.name);
    const center = properties.center as Position;
    polygonRings(feature.geometry).forEach((coordinates, index) => {
      features.push({
        type: 'Feature',
        id: `${code}:boundary:${index}`,
        geometry: { type: 'LineString', coordinates },
        properties: { kind: 'boundary', code, name }
      });
    });
    features.push({
      type: 'Feature',
      id: `${code}:label`,
      geometry: { type: 'Point', coordinates: center },
      properties: { kind: 'label', code, name }
    });
  }

  return { type: 'FeatureCollection', features };
}

function assertRegionSnapshot(value: unknown): FeatureCollection<RegionGeometry> {
  if (!isRecord(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features)) {
    throw new Error('regional asset is not a GeoJSON FeatureCollection');
  }
  const features: RegionFeature[] = [];
  const codes: string[] = [];
  for (const candidate of value.features) {
    if (!isRecord(candidate) || candidate.type !== 'Feature' || !isRecord(candidate.properties) || !isRecord(candidate.geometry)) {
      throw new Error('regional asset contains an invalid feature');
    }
    const { code, name, country, center } = candidate.properties;
    if (typeof code !== 'string' || typeof name !== 'string' || country !== 'CA' || !validPosition(center)) {
      throw new Error('regional asset contains invalid properties');
    }
    if ((candidate.geometry.type !== 'Polygon' && candidate.geometry.type !== 'MultiPolygon')
      || !Array.isArray(candidate.geometry.coordinates)) {
      throw new Error(`regional asset ${code} is not polygon geometry`);
    }
    const feature = candidate as unknown as RegionFeature;
    for (const ring of polygonRings(feature.geometry)) {
      if (ring.length < 4 || !ring.every(validPosition) || !samePosition(ring[0]!, ring[ring.length - 1]!)) {
        throw new Error(`regional asset ${code} contains an invalid ring`);
      }
    }
    codes.push(code);
    features.push(feature);
  }
  const expected = [...EXPECTED_REGION_CODES];
  if (codes.length !== expected.length || JSON.stringify(codes.sort()) !== JSON.stringify(expected)) {
    throw new Error('regional asset code set changed');
  }
  return { type: 'FeatureCollection', features };
}

function polygonRings(geometry: RegionGeometry): Position[][] {
  return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
}

function validPosition(value: unknown): value is Position {
  return Array.isArray(value)
    && value.length === 2
    && value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate));
}

function samePosition(left: Position, right: Position): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
