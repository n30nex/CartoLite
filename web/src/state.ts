import type { NodeV1, PacketV1, RouteV1, StateV1, StatusV1 } from './types';
import { normalizePacketKind, routeTrafficAfterPacket, trafficRenderBucket } from './trafficVisuals';

const ROUTE_BATCH_MS = 250;

export type SequenceAction = 'duplicate' | 'next' | 'gap';

export function sequenceAction(current: number, incoming: number): SequenceAction {
  if (incoming <= current) return 'duplicate';
  if (incoming === current + 1) return 'next';
  return 'gap';
}

export function assertStateV1(value: unknown): asserts value is StateV1 {
  if (!value || typeof value !== 'object') throw new Error('state response is not an object');
  const state = value as Partial<StateV1>;
  if (state.schemaVersion !== 1) throw new Error(`unsupported state schema: ${String(state.schemaVersion)}`);
  if (typeof state.bootId !== 'string' || !state.bootId) throw new Error('state is missing bootId');
  if (typeof state.seq !== 'number' || !Number.isSafeInteger(state.seq) || state.seq < 0) throw new Error('state has invalid sequence');
  if (!state.status || !state.map || !Array.isArray(state.nodes) || !Array.isArray(state.routes)) {
    throw new Error('state response is incomplete');
  }
}

type Listener = (state: Readonly<StateV1>, mapChanged: boolean) => void;

export class LiveStore {
  private current: StateV1;
  private listeners = new Set<Listener>();
  private nodeIndexes = new Map<string, number>();
  private routeIndexes = new Map<string, number>();
  private nodeRoutes = new Map<string, Set<string>>();
  private pendingRoutes = new Map<string, RouteV1>();
  private routeTimer?: number;

  constructor(initial: StateV1) {
    this.current = initial;
    this.rebuildIndexes();
  }

  get snapshot(): Readonly<StateV1> {
    return this.current;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.current, true);
    return () => this.listeners.delete(listener);
  }

  replace(next: StateV1): void {
    this.clearRouteBatch();
    this.current = next;
    this.rebuildIndexes();
    this.emit(true);
  }

  upsertNode(node: NodeV1, seq: number): void {
    const index = this.nodeIndexes.get(node.id);
    const nodes = [...this.current.nodes];
    if (index !== undefined) nodes[index] = node;
    else {
      this.nodeIndexes.set(node.id, nodes.length);
      nodes.push(node);
    }
    this.current = { ...this.current, seq, nodes };
    this.syncRouteEndpoints(node);
    this.emit(true);
  }

  updateStatus(status: StatusV1, seq: number): void {
    this.current = { ...this.current, seq, status };
    this.emit(false);
  }

  advance(seq: number): void {
    this.current = { ...this.current, seq };
  }

  applyPacket(packet: PacketV1): void {
    this.advance(packet.seq);
    if (packet.mode === 'observer') {
      return;
    }
    for (const segment of packet.segments) {
      const existing = this.pendingRoutes.get(segment.routeId) ?? this.routeByID(segment.routeId);
      const packetCount = (existing?.packetCount ?? 0) + 1;
      const previousLastHeard = existing?.lastHeard ?? 0;
      const isNewest = packet.at >= previousLastHeard;
      this.queueRoute({
        id: segment.routeId,
        from: segment.from,
        to: segment.to,
        packetCount,
        lastHeard: Math.max(previousLastHeard, packet.at),
        intensity: routeIntensity(packetCount),
        lastKind: isNewest ? normalizePacketKind(packet.payloadType) : existing?.lastKind ?? 'Other',
        traffic: routeTrafficAfterPacket(existing?.traffic ?? 0, previousLastHeard, packet.at)
      });
    }
  }

  destroy(): void {
    this.clearRouteBatch();
    this.listeners.clear();
  }

  private routeByID(id: string): RouteV1 | undefined {
    const index = this.routeIndexes.get(id);
    return index === undefined ? undefined : this.current.routes[index];
  }

  private queueRoute(route: RouteV1): void {
    const previous = this.pendingRoutes.get(route.id) ?? this.routeByID(route.id);
    if (previous && (previous.from.id !== route.from.id || previous.to.id !== route.to.id)) {
      this.unindexRoute(previous);
    }
    this.pendingRoutes.set(route.id, route);
    this.indexRoute(route);
    if (this.routeTimer === undefined) {
      this.routeTimer = window.setTimeout(() => this.flushRoutes(), ROUTE_BATCH_MS);
    }
  }

  private flushRoutes(): void {
    this.routeTimer = undefined;
    if (this.pendingRoutes.size === 0) return;
    const routes = [...this.current.routes];
    let shouldEmit = false;
    for (const route of this.pendingRoutes.values()) {
      const index = this.routeIndexes.get(route.id);
      if (index === undefined) {
        this.routeIndexes.set(route.id, routes.length);
        routes.push(route);
        shouldEmit = true;
      } else {
        const previous = routes[index];
        if (!previous || routeNeedsRender(previous, route)) shouldEmit = true;
        routes[index] = route;
      }
    }
    this.pendingRoutes.clear();
    this.current = { ...this.current, routes };
    if (shouldEmit) this.emit(true);
  }

  private syncRouteEndpoints(node: NodeV1): void {
    const routeIDs = this.nodeRoutes.get(node.id);
    if (!routeIDs) return;
    const endpoint = { id: node.id, label: node.label, lat: node.lat, lng: node.lng };
    for (const routeID of routeIDs) {
      const route = this.pendingRoutes.get(routeID) ?? this.routeByID(routeID);
      if (!route) continue;
      const from = route.from.id === node.id ? endpoint : route.from;
      const to = route.to.id === node.id ? endpoint : route.to;
      if (sameEndpoint(from, route.from) && sameEndpoint(to, route.to)) continue;
      this.queueRoute({ ...route, from, to });
    }
  }

  private rebuildIndexes(): void {
    this.nodeIndexes.clear();
    this.routeIndexes.clear();
    this.nodeRoutes.clear();
    this.current.nodes.forEach((node, index) => this.nodeIndexes.set(node.id, index));
    this.current.routes.forEach((route, index) => {
      this.routeIndexes.set(route.id, index);
      this.indexRoute(route);
    });
  }

  private indexRoute(route: RouteV1): void {
    for (const nodeID of new Set([route.from.id, route.to.id])) {
      let routes = this.nodeRoutes.get(nodeID);
      if (!routes) {
        routes = new Set<string>();
        this.nodeRoutes.set(nodeID, routes);
      }
      routes.add(route.id);
    }
  }

  private unindexRoute(route: RouteV1): void {
    for (const nodeID of new Set([route.from.id, route.to.id])) {
      const routes = this.nodeRoutes.get(nodeID);
      routes?.delete(route.id);
      if (routes?.size === 0) this.nodeRoutes.delete(nodeID);
    }
  }

  private clearRouteBatch(): void {
    if (this.routeTimer !== undefined) window.clearTimeout(this.routeTimer);
    this.routeTimer = undefined;
    this.pendingRoutes.clear();
  }

  private emit(mapChanged: boolean): void {
    for (const listener of this.listeners) listener(this.current, mapChanged);
  }
}

function routeIntensity(packetCount: number): RouteV1['intensity'] {
  if (packetCount >= 16) return 4;
  if (packetCount >= 8) return 3;
  if (packetCount >= 4) return 2;
  if (packetCount >= 2) return 1;
  return 0;
}

function sameEndpoint(left: RouteV1['from'], right: RouteV1['from']): boolean {
  return left.id === right.id && left.label === right.label && left.lat === right.lat && left.lng === right.lng;
}

function routeNeedsRender(previous: RouteV1, next: RouteV1): boolean {
  return !sameEndpoint(previous.from, next.from)
    || !sameEndpoint(previous.to, next.to)
    || previous.intensity !== next.intensity
    || previous.lastKind !== next.lastKind
    || trafficRenderBucket(previous.traffic) !== trafficRenderBucket(next.traffic)
    || Math.floor(previous.lastHeard / 60_000) !== Math.floor(next.lastHeard / 60_000);
}

export function activityLabel(state: Readonly<StateV1>, streamConnected: boolean): {
  state: 'active' | 'quiet' | 'reconnecting' | 'offline';
  text: string;
} {
  if (!streamConnected && state.status.feed === 'connected') return { state: 'reconnecting', text: 'Reconnecting' };
  if (state.status.feed === 'disconnected') return { state: 'offline', text: 'Feed offline' };
  if (state.status.activity === 'quiet') return { state: 'quiet', text: 'Connected · quiet' };
  return { state: 'active', text: 'Live' };
}
