import { describe, expect, it } from 'vitest';
import type { NodeV2, RouteV2, StateV2 } from '../types';
import { buildVillageModel, settlementTier } from './villageModel';

const SERVER_TIME = 1_800_000_000_000;

function node(id: string, lat: number, lng: number, lastSeen = SERVER_TIME): NodeV2 {
  return { id, label: id, lat, lng, lastSeen, role: 'companion', observer: false };
}

function route(id: string, fromId: string, toId: string, traffic = 4): RouteV2 {
  return { id, fromId, toId, packetCount: 2, lastHeard: SERVER_TIME, intensity: 2, lastKind: 'Trace', traffic };
}

function state(nodes: NodeV2[], routes: RouteV2[]): StateV2 {
  return {
    schemaVersion: 2,
    bootId: 'test-boot',
    seq: 1,
    serverTime: SERVER_TIME,
    status: { feed: 'connected', activity: 'active', dropped: 0, version: 'test', gitSha: 'test' },
    map: { center: [-96, 58], zoom: 3 },
    nodes,
    routes,
  };
}

describe('Little Mesh Villages model', () => {
  it('builds deterministic buildings, degree, traffic, and roads from public state', () => {
    const snapshot = state(
      [node('a', 43.65, -79.38), node('b', 43.67, -79.4), node('c', 43.7, -79.32)],
      [route('ab', 'a', 'b', 8), route('bc', 'b', 'c', 3)],
    );
    const first = buildVillageModel(snapshot);
    const second = buildVillageModel(snapshot);

    expect(second).toEqual(first);
    expect(first.nodeCount).toBe(3);
    expect(first.routeCount).toBe(2);
    expect(first.settlements).toHaveLength(1);
    const buildings = first.settlements[0]!.buildings;
    expect(buildings.find((building) => building.nodeId === 'b')?.degree).toBe(2);
    expect(buildings.find((building) => building.nodeId === 'a')?.traffic).toBe(8);
  });

  it('keeps a long route as an intercity link instead of merging distant communities visually', () => {
    const snapshot = state(
      [node('toronto', 43.65, -79.38), node('vancouver', 49.28, -123.12)],
      [route('cross-country', 'toronto', 'vancouver')],
    );
    const model = buildVillageModel(snapshot);

    expect(model.settlements).toHaveLength(2);
    expect(model.roads).toEqual([expect.objectContaining({ routeId: 'cross-country', intercity: true })]);
  });

  it('uses only the newest bounded public nodes', () => {
    const nodes = Array.from({ length: 1_260 }, (_, index) => node(`node-${index}`, 42 + index / 10_000, -80));
    const model = buildVillageModel(state(nodes, []));
    expect(model.nodeCount).toBe(1_200);
  });

  it('names settlement tiers by observed-node count only', () => {
    expect(settlementTier(1)).toBe('homestead');
    expect(settlementTier(2)).toBe('hamlet');
    expect(settlementTier(9)).toBe('village');
    expect(settlementTier(30)).toBe('town');
    expect(settlementTier(100)).toBe('city');
  });
});
