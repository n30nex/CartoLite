import type { Feature, FeatureCollection, LineString, MultiPolygon, Point, Polygon, Position } from 'geojson';

export const EXPECTED_REGION_CODES = [
  'XCM', 'XPH', 'YBL', 'YCD', 'YEG', 'YGK', 'YKA', 'YKF', 'YLK', 'YML', 'YOW', 'YPA',
  'YQA', 'YQB', 'YQF', 'YQL', 'YQQ', 'YQT', 'YQY', 'YSE', 'YTA', 'YTF', 'YTR', 'YUL',
  'YVR', 'YWG', 'YWS', 'YXU', 'YXX', 'YYB', 'YYC', 'YYJ', 'YYY', 'YYZ'
] as const;

export const REGION_BOUNDARY_SOURCE_COUNT = 8;
export const REGION_LINE_PIECE_VERTEX_LIMIT = 4_000;

type RegionGeometry = Polygon | MultiPolygon;
type RegionFeature = Feature<RegionGeometry>;

export interface RegionSourceCollections {
  boundaries: Array<FeatureCollection<LineString>>;
  labels: FeatureCollection<Point>;
}

export function regionSourceCollections(value: unknown): RegionSourceCollections {
  const snapshot = assertRegionSnapshot(value);
  const pieces: Array<Feature<LineString>> = [];
  const labels: Array<Feature<Point>> = [];

  for (const feature of snapshot.features) {
    const properties = feature.properties!;
    const code = String(properties.code);
    const name = String(properties.name);
    const center = properties.center as Position;
    labels.push({
      type: 'Feature',
      id: code,
      geometry: { type: 'Point', coordinates: center },
      properties: { code, name }
    });

    let ringIndex = 0;
    for (const ring of polygonRings(feature.geometry)) {
      let start = 0;
      let pieceIndex = 0;
      while (start < ring.length - 1) {
        const end = Math.min(ring.length, start + REGION_LINE_PIECE_VERTEX_LIMIT);
        const coordinates = ring.slice(start, end);
        if (coordinates.length < 2) break;
        pieces.push({
          type: 'Feature',
          id: `${code}-${ringIndex}-${pieceIndex}`,
          geometry: { type: 'LineString', coordinates },
          properties: { code }
        });
        if (end === ring.length) break;
        start = end - 1;
        pieceIndex += 1;
      }
      ringIndex += 1;
    }
  }

  const boundaries = Array.from({ length: REGION_BOUNDARY_SOURCE_COUNT }, (): FeatureCollection<LineString> => ({
    type: 'FeatureCollection',
    features: []
  }));
  const vertexTotals = Array.from({ length: REGION_BOUNDARY_SOURCE_COUNT }, () => 0);
  pieces.sort((left, right) => right.geometry.coordinates.length - left.geometry.coordinates.length);
  for (const piece of pieces) {
    let target = 0;
    for (let index = 1; index < vertexTotals.length; index += 1) {
      if (vertexTotals[index]! < vertexTotals[target]!) target = index;
    }
    boundaries[target]!.features.push(piece);
    vertexTotals[target] = vertexTotals[target]! + piece.geometry.coordinates.length;
  }

  return { boundaries, labels: { type: 'FeatureCollection', features: labels } };
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
