import type { NodeV2, RouteV2 } from '../types';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const LABEL_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base' });

export type NetgraphWindow = '15m' | '1h' | '6h' | '24h';

export interface NetgraphPosition {
  id: string;
  x: number;
  y: number;
  degree: number;
  component: number;
}

export interface NetgraphLayout {
  positions: Map<string, NetgraphPosition>;
  connectedNodeIDs: Set<string>;
  componentCount: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

interface Component {
  ids: string[];
  rootID: string;
  radius: number;
  x: number;
  y: number;
}

export function netgraphWindowMS(window: NetgraphWindow): number {
  switch (window) {
    case '15m': return 15 * 60_000;
    case '1h': return 60 * 60_000;
    case '6h': return 6 * 60 * 60_000;
    case '24h': return 24 * 60 * 60_000;
  }
}

export function routesInWindow(routes: readonly RouteV2[], now: number, window: NetgraphWindow): RouteV2[] {
  const cutoff = now - netgraphWindowMS(window);
  return routes.filter((route) => route.lastHeard >= cutoff);
}

export function buildNetgraphLayout(nodes: readonly NodeV2[], routes: readonly RouteV2[]): NetgraphLayout {
  const nodeByID = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, Set<string>>();
  for (const route of routes) {
    if (route.fromId === route.toId || !nodeByID.has(route.fromId) || !nodeByID.has(route.toId)) continue;
    addNeighbor(adjacency, route.fromId, route.toId);
    addNeighbor(adjacency, route.toId, route.fromId);
  }

  const connectedNodeIDs = new Set(adjacency.keys());
  const components = connectedComponents(adjacency, nodeByID);
  packComponents(components);
  const positions = new Map<string, NetgraphPosition>();

  components.forEach((component, componentIndex) => {
    const ordered = component.ids.slice().sort((left, right) => (
      (adjacency.get(right)?.size ?? 0) - (adjacency.get(left)?.size ?? 0)
      || compareNode(nodeByID.get(left), nodeByID.get(right), left, right)
    ));
    const phase = (stableHash(component.rootID) % 6283) / 1000;
    const count = Math.max(1, ordered.length - 1);
    ordered.forEach((id, index) => {
      const degree = adjacency.get(id)?.size ?? 0;
      if (index === 0) {
        positions.set(id, { id, x: component.x, y: component.y, degree, component: componentIndex });
        return;
      }
      const radius = component.radius * 0.86 * Math.sqrt(index / count);
      const angle = phase + GOLDEN_ANGLE * index;
      positions.set(id, {
        id,
        x: component.x + Math.cos(angle) * radius,
        y: component.y + Math.sin(angle) * radius,
        degree,
        component: componentIndex,
      });
    });
  });

  return {
    positions,
    connectedNodeIDs,
    componentCount: components.length,
    bounds: layoutBounds(positions),
  };
}

export function extendNetgraphLayout(
  previous: Readonly<NetgraphLayout>,
  nodes: readonly NodeV2[],
  routes: readonly RouteV2[],
): NetgraphLayout {
  if (previous.positions.size === 0) return buildNetgraphLayout(nodes, routes);

  const canonical = buildNetgraphLayout(nodes, routes);
  const positions = new Map<string, NetgraphPosition>();
  const componentIDs = new Map<number, string[]>();
  for (const position of canonical.positions.values()) {
    const ids = componentIDs.get(position.component) ?? [];
    ids.push(position.id);
    componentIDs.set(position.component, ids);
    const established = previous.positions.get(position.id);
    if (established) positions.set(position.id, { ...position, x: established.x, y: established.y });
  }

  for (const [component, ids] of [...componentIDs].sort(([left], [right]) => left - right)) {
    const missing = ids.filter((id) => !positions.has(id));
    if (missing.length === 0) continue;
    const anchorID = ids.find((id) => previous.positions.has(id));
    if (anchorID) {
      const established = previous.positions.get(anchorID)!;
      const reference = canonical.positions.get(anchorID)!;
      for (const id of missing) {
        const position = canonical.positions.get(id)!;
        const candidate = distinctPoint(
          position.x + established.x - reference.x,
          position.y + established.y - reference.y,
          id,
          positions,
        );
        positions.set(id, { ...position, ...candidate, component });
      }
      continue;
    }

    let componentMinX = Infinity;
    let componentMinY = Infinity;
    for (const id of ids) {
      const position = canonical.positions.get(id)!;
      componentMinX = Math.min(componentMinX, position.x);
      componentMinY = Math.min(componentMinY, position.y);
    }
    const occupiedRight = positions.size > 0
      ? Math.max(...[...positions.values()].map((position) => position.x))
      : previous.bounds.maxX;
    const shiftX = occupiedRight + 68 - componentMinX;
    const shiftY = previous.bounds.minY + 34 - componentMinY;
    for (const id of ids) {
      const position = canonical.positions.get(id)!;
      positions.set(id, { ...position, x: position.x + shiftX, y: position.y + shiftY, component });
    }
  }

  return { ...canonical, positions, bounds: layoutBounds(positions) };
}

export function graphTopologyChanged(
  previous: ReadonlyMap<string, string>,
  changedRoutes: readonly RouteV2[],
  routeCount: number,
): boolean {
  if (previous.size !== routeCount) return true;
  return changedRoutes.some((route) => previous.get(route.id) !== `${route.fromId}>${route.toId}`);
}

export function routeTopology(routes: readonly RouteV2[]): Map<string, string> {
  return new Map(routes.map((route) => [route.id, `${route.fromId}>${route.toId}`]));
}

function connectedComponents(adjacency: ReadonlyMap<string, Set<string>>, nodeByID: ReadonlyMap<string, NodeV2>): Component[] {
  const visited = new Set<string>();
  const components: Component[] = [];
  const orderedIDs = [...adjacency.keys()].sort((left, right) => compareNode(nodeByID.get(left), nodeByID.get(right), left, right));
  for (const start of orderedIDs) {
    if (visited.has(start)) continue;
    const queue = [start];
    const ids: string[] = [];
    visited.add(start);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      ids.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    const rootID = ids.slice().sort((left, right) => (
      (adjacency.get(right)?.size ?? 0) - (adjacency.get(left)?.size ?? 0)
      || compareNode(nodeByID.get(left), nodeByID.get(right), left, right)
    ))[0]!;
    components.push({
      ids,
      rootID,
      radius: Math.max(48, 18 + 14 * Math.sqrt(ids.length)),
      x: 0,
      y: 0,
    });
  }
  return components.sort((left, right) => right.ids.length - left.ids.length || left.rootID.localeCompare(right.rootID));
}

function packComponents(components: Component[]): void {
  const placed: Component[] = [];
  let rightEdge = 0;
  for (const component of components) {
    if (placed.length === 0) {
      placed.push(component);
      rightEdge = component.radius;
      continue;
    }
    const phase = (stableHash(component.rootID) % 360) * Math.PI / 180;
    let assigned = false;
    for (let step = 1; step < 20_000; step += 1) {
      const distance = 20 * Math.sqrt(step);
      const angle = phase + GOLDEN_ANGLE * step;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      if (placed.every((other) => Math.hypot(x - other.x, y - other.y) >= component.radius + other.radius + 34)) {
        component.x = x;
        component.y = y;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      component.x = rightEdge + component.radius + 34;
      component.y = 0;
    }
    placed.push(component);
    rightEdge = Math.max(rightEdge, component.x + component.radius);
  }
}

function distinctPoint(
  x: number,
  y: number,
  id: string,
  positions: ReadonlyMap<string, NetgraphPosition>,
): { x: number; y: number } {
  if (isDistinct(x, y, positions)) return { x, y };
  const phase = (stableHash(id) % 6283) / 1000;
  for (let step = 1; step <= 512; step += 1) {
    const radius = 8 + 5 * Math.sqrt(step);
    const candidateX = x + Math.cos(phase + GOLDEN_ANGLE * step) * radius;
    const candidateY = y + Math.sin(phase + GOLDEN_ANGLE * step) * radius;
    if (isDistinct(candidateX, candidateY, positions)) return { x: candidateX, y: candidateY };
  }
  const rightEdge = Math.max(...[...positions.values()].map((position) => position.x));
  return { x: rightEdge + 18, y };
}

function isDistinct(x: number, y: number, positions: ReadonlyMap<string, NetgraphPosition>): boolean {
  for (const position of positions.values()) {
    if (Math.hypot(x - position.x, y - position.y) < 8) return false;
  }
  return true;
}

function layoutBounds(positions: ReadonlyMap<string, NetgraphPosition>): NetgraphLayout['bounds'] {
  if (positions.size === 0) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of positions.values()) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX: minX - 34, minY: minY - 34, maxX: maxX + 34, maxY: maxY + 34 };
}

function addNeighbor(adjacency: Map<string, Set<string>>, nodeID: string, neighborID: string): void {
  const neighbors = adjacency.get(nodeID) ?? new Set<string>();
  neighbors.add(neighborID);
  adjacency.set(nodeID, neighbors);
}

function compareNode(left: NodeV2 | undefined, right: NodeV2 | undefined, leftID: string, rightID: string): number {
  return LABEL_COLLATOR.compare(left?.label ?? leftID, right?.label ?? rightID) || leftID.localeCompare(rightID);
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
