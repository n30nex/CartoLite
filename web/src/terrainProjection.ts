import type { EndpointV2, RouteSegmentView } from './types';

export interface SurfacePoint {
  x: number;
  y: number;
  scale?: number;
  ground?: readonly [number, number, number, number];
}

interface TerrainMap {
  project(coordinates: [number, number]): { x: number; y: number };
  getTerrain?(): { source: string } | null;
  getZoom?(): number;
}

const radians = Math.PI / 180;
const mercatorY = (latitude: number): number => Math.log(Math.tan(Math.PI / 4 + latitude * radians / 2));

export function geographicSegmentPoint(from: EndpointV2, to: EndpointV2, progress: number): [number, number] {
  const t = Math.max(0, Math.min(1, progress));
  const y = mercatorY(from.lat) + (mercatorY(to.lat) - mercatorY(from.lat)) * t;
  return [from.lng + (to.lng - from.lng) * t, Math.atan(Math.sinh(y)) / radians];
}

export class TerrainProjector {
  private points = new Map<string, SurfacePoint>();
  private paths = new Map<string, readonly SurfacePoint[]>();

  constructor(private readonly map: TerrainMap) {}

  enabled(): boolean { return Boolean(this.map.getTerrain?.()); }
  project(coordinates: [number, number]): SurfacePoint { return this.map.project(coordinates); }

  reset(): void {
    this.points.clear();
    this.paths.clear();
  }

  projectEndpoint(endpoint: EndpointV2): SurfacePoint {
    if (!this.enabled()) return this.project([endpoint.lng, endpoint.lat]);
    const key = `${endpoint.lng}:${endpoint.lat}`;
    const cached = this.points.get(key);
    if (cached) return cached;
    const point: SurfacePoint = this.project([endpoint.lng, endpoint.lat]);
    const step = 360 * 8 / (512 * 2 ** (this.map.getZoom?.() ?? 0));
    const east = this.project([endpoint.lng + step, endpoint.lat]);
    const north = this.project([endpoint.lng, endpoint.lat + step * Math.cos(endpoint.lat * radians)]);
    const ground = [(east.x - point.x) / 8, (east.y - point.y) / 8, (north.x - point.x) / 8, (north.y - point.y) / 8] as const;
    if (ground.every(Number.isFinite) && Math.max(...ground.map(Math.abs)) < 4) {
      point.ground = ground;
      point.scale = Math.max(0.55, Math.min(1.45, Math.hypot(ground[0], ground[1])));
    }
    if (this.points.size >= 1024) this.points.delete(this.points.keys().next().value!);
    this.points.set(key, point);
    return point;
  }

  projectSegment(segment: RouteSegmentView): readonly SurfacePoint[] {
    const { from, to } = segment;
    if (!this.enabled()) return [this.projectEndpoint(from), this.projectEndpoint(to)];
    const key = `${from.lng}:${from.lat}:${to.lng}:${to.lat}`;
    const cached = this.paths.get(key);
    if (cached) return cached;
    const first = this.projectEndpoint(from);
    const last = this.projectEndpoint(to);
    const points = Array.from({ length: 17 }, (_, index): SurfacePoint => {
      const t = index / 16;
      if (index === 0) return first;
      if (index === 16) return last;
      const point = this.project(geographicSegmentPoint(from, to, t));
      return { ...point, scale: (first.scale ?? 1) + ((last.scale ?? 1) - (first.scale ?? 1)) * t };
    });
    if (this.paths.size >= 1024) this.paths.delete(this.paths.keys().next().value!);
    this.paths.set(key, points);
    return points;
  }
}

export function surfacePathPoint(points: readonly SurfacePoint[], progress: number): SurfacePoint {
  if (points.length === 1) return points[0]!;
  const position = Math.max(0, Math.min(1, progress)) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(position));
  const from = points[index]!;
  const to = points[index + 1]!;
  const t = position - index;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t,
    scale: (from.scale ?? 1) + ((to.scale ?? 1) - (from.scale ?? 1)) * t };
}

export function surfaceTrail(points: readonly SurfacePoint[], progress: number, maxLength: number): SurfacePoint[] {
  progress = Math.max(0, Math.min(1, progress));
  const head = surfacePathPoint(points, progress);
  const trail = [head];
  let remaining = maxLength;
  for (let index = Math.min(points.length - 1, Math.floor(progress * (points.length - 1))); index >= 0 && remaining > 0; index -= 1) {
    const next = points[index]!;
    const previous = trail[trail.length - 1]!;
    const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
    if (distance < 0.001) continue;
    trail.push(distance > remaining ? surfacePathPoint([previous, next], remaining / distance) : next);
    remaining -= distance;
  }
  return trail.reverse();
}

export function traceSurfacePath(context: CanvasRenderingContext2D, points: readonly SurfacePoint[]): void {
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
}

export function surfaceArc(context: CanvasRenderingContext2D, point: SurfacePoint, radius: number): void {
  if (!point.ground) { context.arc(point.x, point.y, radius, 0, Math.PI * 2); return; }
  context.save();
  context.transform(...point.ground, point.x, point.y);
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.restore();
}
