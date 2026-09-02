import type { SoundCharacter, ViewportProjector } from '../audio';
import type { EndpointV2, NodeV2, PacketView, StateV2 } from '../types';
import { normalizePacketKind, type PacketKind } from '../trafficVisuals';

const EARTH_RADIUS_KM = 6_371;
const MAX_SESSION_EVENTS = 4_096;
const MAX_ROUTE_COUNTS = 512;
const FIVE_MINUTES_MS = 5 * 60_000;

export interface LabPoint {
  x: number;
  y: number;
}

export interface LabViewport {
  width: number;
  height: number;
  pixelRatio: number;
}

export interface LabHop {
  routeId: string;
  index: number;
  from: EndpointV2;
  to: EndpointV2;
  distanceKm: number;
  bearingDeg: number;
}

export interface LabPacket {
  id: string;
  at: number;
  kind: PacketKind;
  mode: 'route' | 'observer';
  hops: LabHop[];
  hopCount: number;
  totalDistanceKm: number;
  seed: number;
  observer?: EndpointV2;
}

export interface LabMetricSnapshot {
  events10s: number;
  events60s: number;
  events5m: number;
  routeReuse: ReadonlyMap<string, number>;
  burst: boolean;
}

export interface LabContext {
  readonly stage: HTMLElement;
  readonly project: (endpoint: Pick<EndpointV2, 'lat' | 'lng'>) => LabPoint;
  readonly reducedMotion: () => boolean;
  readonly metrics: () => LabMetricSnapshot;
}

export interface LabExperiment {
  readonly soundCharacter?: SoundCharacter;
  mount(context: LabContext): void;
  applySnapshot(snapshot: Readonly<StateV2>): void;
  handlePacket(packet: LabPacket): void;
  resize(viewport: LabViewport): void;
  frame(now: number, deltaMS: number): void;
  setPaused(paused: boolean): void;
  reset(): void;
  destroy(): void;
}

export type ExperimentStatus = 'Stable' | 'Beta';

export interface ExperimentDefinition {
  id: string;
  title: string;
  summary: string;
  explanation: string;
  renderer: 'canvas2d' | 'webgl2+canvas2d';
  status: ExperimentStatus;
  load: () => Promise<{ createExperiment(): LabExperiment }>;
}

export class CanadaProjector implements ViewportProjector {
  constructor(private readonly viewport: HTMLElement) {}

  project([lng, lat]: [number, number]): LabPoint {
    return projectCanada(lng, lat, this.viewport.clientWidth, this.viewport.clientHeight);
  }
}

export class RollingMetrics {
  private eventTimes: number[] = [];
  private routeCounts = new Map<string, { count: number; lastAt: number }>();

  record(packet: LabPacket): void {
    this.eventTimes.push(packet.at);
    if (this.eventTimes.length > MAX_SESSION_EVENTS) {
      this.eventTimes.splice(0, this.eventTimes.length - MAX_SESSION_EVENTS);
    }
    for (const hop of packet.hops) {
      const previous = this.routeCounts.get(hop.routeId);
      this.routeCounts.set(hop.routeId, { count: (previous?.count ?? 0) + 1, lastAt: packet.at });
    }
    this.evict(packet.at);
  }

  snapshot(now = Date.now()): LabMetricSnapshot {
    this.evict(now);
    let events10s = 0;
    let events60s = 0;
    for (const at of this.eventTimes) {
      const age = Math.max(0, now - at);
      if (age <= 10_000) events10s += 1;
      if (age <= 60_000) events60s += 1;
    }
    return {
      events10s,
      events60s,
      events5m: this.eventTimes.length,
      routeReuse: new Map([...this.routeCounts].map(([id, value]) => [id, value.count])),
      burst: events10s >= 40,
    };
  }

  reset(): void {
    this.eventTimes = [];
    this.routeCounts.clear();
  }

  private evict(now: number): void {
    const cutoff = now - FIVE_MINUTES_MS;
    this.eventTimes = this.eventTimes.filter((at) => at >= cutoff);
    for (const [routeID, value] of this.routeCounts) {
      if (value.lastAt < cutoff) this.routeCounts.delete(routeID);
    }
    if (this.routeCounts.size <= MAX_ROUTE_COUNTS) return;
    const oldest = [...this.routeCounts].sort((left, right) => left[1].lastAt - right[1].lastAt);
    for (let index = 0; index < oldest.length - MAX_ROUTE_COUNTS; index += 1) {
      this.routeCounts.delete(oldest[index]![0]);
    }
  }
}

export function normalizeLabPacket(packet: PacketView): LabPacket {
  const kind = normalizePacketKind(packet.payloadType);
  const hops = packet.mode === 'route'
    ? packet.segments.map((segment, index) => ({
      routeId: segment.routeId,
      index,
      from: segment.from,
      to: segment.to,
      distanceKm: haversineKm(segment.from, segment.to),
      bearingDeg: bearingDegrees(segment.from, segment.to),
    }))
    : [];
  return {
    id: packet.id,
    at: packet.at,
    kind,
    mode: packet.mode,
    hops,
    hopCount: hops.length,
    totalDistanceKm: hops.reduce((total, hop) => total + hop.distanceKm, 0),
    seed: stableHash(`${packet.id}|${kind}`),
    observer: packet.mode === 'observer' ? packet.observer : undefined,
  };
}

export function captionFor(packet: LabPacket): string {
  if (packet.mode === 'observer') return `${packet.kind} · observer only`;
  const hops = `${packet.hopCount} ${packet.hopCount === 1 ? 'hop' : 'hops'}`;
  return `${packet.kind} · ${hops} · ${Math.round(packet.totalDistanceKm).toLocaleString()} km`;
}

export function haversineKm(from: Pick<EndpointV2, 'lat' | 'lng'>, to: Pick<EndpointV2, 'lat' | 'lng'>): number {
  const lat1 = radians(from.lat);
  const lat2 = radians(to.lat);
  const deltaLat = radians(to.lat - from.lat);
  const deltaLng = radians(to.lng - from.lng);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

export function bearingDegrees(from: Pick<EndpointV2, 'lat' | 'lng'>, to: Pick<EndpointV2, 'lat' | 'lng'>): number {
  const fromLat = radians(from.lat);
  const toLat = radians(to.lat);
  const deltaLng = radians(to.lng - from.lng);
  const y = Math.sin(deltaLng) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function projectCanada(lng: number, lat: number, width: number, height: number): LabPoint {
  const longitude = clamp((lng + 141) / 89, 0, 1);
  const latitude = clamp((lat - 41) / 43, 0, 1);
  const x = 0.04 + longitude * 0.92;
  // Labs is a geographic cartogram: expanding southern latitudes keeps Canada's
  // inhabited band from collapsing against the bottom of a full-screen canvas.
  const y = 0.04 + (1 - Math.pow(latitude, 0.58)) * 0.92;
  return { x: x * Math.max(1, width), y: y * Math.max(1, height) };
}

export function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function stableNodeSample(nodes: readonly NodeV2[], limit: number): NodeV2[] {
  return [...nodes]
    .sort((left, right) => stableHash(left.id) - stableHash(right.id))
    .slice(0, Math.max(0, limit));
}

export function spatiallySpacedNodes(
  nodes: readonly NodeV2[],
  project: (node: NodeV2) => LabPoint,
  minimumDistance: number,
  limit: number,
): NodeV2[] {
  const accepted: NodeV2[] = [];
  const points: LabPoint[] = [];
  for (const node of stableNodeSample(nodes, nodes.length)) {
    const point = project(node);
    if (points.some((existing) => Math.hypot(existing.x - point.x, existing.y - point.y) < minimumDistance)) continue;
    accepted.push(node);
    points.push(point);
    if (accepted.length >= Math.max(0, limit)) break;
  }
  return accepted;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function radians(value: number): number {
  return value * Math.PI / 180;
}
