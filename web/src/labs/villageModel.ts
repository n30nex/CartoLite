import type { NodeRole, StateV2 } from '../types';
import type { PacketKind } from '../trafficVisuals';
import { stableHash } from './runtime';

const ACTIVE_NODE_WINDOW_MS = 24 * 60 * 60_000;
const MAX_VILLAGE_NODES = 1_200;
const LATITUDE_CELL = 4;
const LONGITUDE_CELL = 8;

export interface VillageBuildingModel {
  nodeId: string;
  role: NodeRole;
  observer: boolean;
  degree: number;
  traffic: number;
  seed: number;
  localX: number;
  localY: number;
}

export type SettlementTier = 'homestead' | 'hamlet' | 'village' | 'town' | 'city';

export interface VillageSettlementModel {
  id: string;
  center: { lat: number; lng: number };
  buildings: VillageBuildingModel[];
  tier: SettlementTier;
  routeCount: number;
  traffic: number;
}

export interface VillageRoadModel {
  routeId: string;
  fromId: string;
  toId: string;
  traffic: number;
  kind: PacketKind;
  intercity: boolean;
}

export interface VillageModel {
  settlements: VillageSettlementModel[];
  roads: VillageRoadModel[];
  nodeCount: number;
  routeCount: number;
}

export function buildVillageModel(snapshot: Readonly<StateV2>): VillageModel {
  const active = snapshot.nodes.filter((node) => snapshot.serverTime - node.lastSeen <= ACTIVE_NODE_WINDOW_MS);
  const candidates = (active.length > 0 ? active : snapshot.nodes)
    .slice()
    .sort((left, right) => right.lastSeen - left.lastSeen || stableHash(left.id) - stableHash(right.id))
    .slice(0, MAX_VILLAGE_NODES);
  const nodes = new Map(candidates.map((node) => [node.id, node]));
  const routes = snapshot.routes.filter((route) => nodes.has(route.fromId) && nodes.has(route.toId));
  const parent = new Map(candidates.map((node) => [node.id, node.id]));
  const find = (id: string): string => {
    let root = parent.get(id) ?? id;
    while ((parent.get(root) ?? root) !== root) root = parent.get(root)!;
    let current = id;
    while ((parent.get(current) ?? current) !== root) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const first = stableHash(leftRoot) <= stableHash(rightRoot) ? leftRoot : rightRoot;
    parent.set(first === leftRoot ? rightRoot : leftRoot, first);
  };
  routes.forEach((route) => union(route.fromId, route.toId));

  const groups = new Map<string, typeof candidates>();
  for (const node of candidates) {
    const latitude = Math.floor((node.lat - 40) / LATITUDE_CELL);
    const longitude = Math.floor((node.lng + 144) / LONGITUDE_CELL);
    const key = `${find(node.id)}:${latitude}:${longitude}`;
    const group = groups.get(key) ?? [];
    group.push(node);
    groups.set(key, group);
  }

  const nodeToSettlement = new Map<string, string>();
  for (const [id, group] of groups) for (const node of group) nodeToSettlement.set(node.id, id);
  const degree = new Map<string, number>();
  const traffic = new Map<string, number>();
  const settlementRoutes = new Map<string, number>();
  const settlementTraffic = new Map<string, number>();
  for (const route of routes) {
    degree.set(route.fromId, (degree.get(route.fromId) ?? 0) + 1);
    degree.set(route.toId, (degree.get(route.toId) ?? 0) + 1);
    traffic.set(route.fromId, (traffic.get(route.fromId) ?? 0) + route.traffic);
    traffic.set(route.toId, (traffic.get(route.toId) ?? 0) + route.traffic);
    const fromSettlement = nodeToSettlement.get(route.fromId)!;
    const toSettlement = nodeToSettlement.get(route.toId)!;
    settlementRoutes.set(fromSettlement, (settlementRoutes.get(fromSettlement) ?? 0) + 1);
    settlementTraffic.set(fromSettlement, (settlementTraffic.get(fromSettlement) ?? 0) + route.traffic);
    if (toSettlement !== fromSettlement) {
      settlementRoutes.set(toSettlement, (settlementRoutes.get(toSettlement) ?? 0) + 1);
      settlementTraffic.set(toSettlement, (settlementTraffic.get(toSettlement) ?? 0) + route.traffic);
    }
  }

  const settlements = [...groups].map(([id, group]): VillageSettlementModel => {
    const ordered = group.slice().sort((left, right) => stableHash(left.id) - stableHash(right.id));
    const columns = Math.max(1, Math.ceil(Math.sqrt(ordered.length)));
    const rows = Math.ceil(ordered.length / columns);
    return {
      id,
      center: {
        lat: group.reduce((sum, node) => sum + node.lat, 0) / group.length,
        lng: group.reduce((sum, node) => sum + node.lng, 0) / group.length,
      },
      buildings: ordered.map((node, index) => ({
        nodeId: node.id,
        role: node.role,
        observer: node.observer,
        degree: degree.get(node.id) ?? 0,
        traffic: traffic.get(node.id) ?? 0,
        seed: stableHash(node.id),
        localX: index % columns - (columns - 1) / 2 + ((stableHash(`${node.id}:x`) % 21) - 10) / 45,
        localY: Math.floor(index / columns) - (rows - 1) / 2 + ((stableHash(`${node.id}:y`) % 21) - 10) / 45,
      })),
      tier: settlementTier(group.length),
      routeCount: settlementRoutes.get(id) ?? 0,
      traffic: settlementTraffic.get(id) ?? 0,
    };
  }).sort((left, right) => right.buildings.length - left.buildings.length || stableHash(left.id) - stableHash(right.id));

  return {
    settlements,
    roads: routes.map((route) => ({
      routeId: route.id,
      fromId: route.fromId,
      toId: route.toId,
      traffic: route.traffic,
      kind: route.lastKind,
      intercity: nodeToSettlement.get(route.fromId) !== nodeToSettlement.get(route.toId),
    })),
    nodeCount: candidates.length,
    routeCount: routes.length,
  };
}

export function settlementTier(size: number): SettlementTier {
  if (size >= 100) return 'city';
  if (size >= 30) return 'town';
  if (size >= 9) return 'village';
  if (size >= 2) return 'hamlet';
  return 'homestead';
}
