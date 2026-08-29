import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon, Position } from 'geojson';

export const EXPECTED_REGION_CODES = [
  'XCM', 'XPH', 'YBL', 'YCD', 'YEG', 'YGK', 'YKA', 'YKF', 'YLK', 'YML', 'YOW', 'YPA',
  'YQA', 'YQB', 'YQF', 'YQL', 'YQQ', 'YQT', 'YQY', 'YSE', 'YTA', 'YTF', 'YTR', 'YUL',
  'YVR', 'YWG', 'YWS', 'YXU', 'YXX', 'YYB', 'YYC', 'YYJ', 'YYY', 'YYZ'
] as const;

export const REGION_LINE_PIECE_VERTEX_LIMIT = 192;
export const REGION_WORKER_MESSAGE_VERTEX_LIMIT = 768;

type RegionGeometry = Polygon | MultiPolygon;
type RegionFeature = Feature<RegionGeometry>;

export interface RegionLinePiece {
  code: string;
  coordinates: Position[];
}

export interface RegionCanvasData {
  pieces: RegionLinePiece[];
  labels: FeatureCollection<Point>;
}

export type RegionWorkerOutput =
  | { type: 'labels'; labels: FeatureCollection<Point> }
  | { type: 'pieces'; pieces: RegionLinePiece[] }
  | { type: 'done' }
  | { type: 'error'; message: string };

export function regionCanvasData(value: unknown): RegionCanvasData {
  const snapshot = assertRegionSnapshot(value);
  const pieces: RegionLinePiece[] = [];
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

    for (const ring of polygonRings(feature.geometry)) {
      let start = 0;
      while (start < ring.length - 1) {
        const end = Math.min(ring.length, start + REGION_LINE_PIECE_VERTEX_LIMIT);
        const coordinates = ring.slice(start, end);
        if (coordinates.length < 2) break;
        pieces.push({ code, coordinates });
        if (end === ring.length) break;
        start = end - 1;
      }
    }
  }

  return { pieces, labels: { type: 'FeatureCollection', features: labels } };
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
