import { describe, expect, it, vi } from 'vitest';
import { activityLabel, assertStateV1, LiveStore, sequenceAction } from './state';
import type { StateV1 } from './types';

const initial: StateV1 = {
  schemaVersion: 1,
  bootId: 'boot-a',
  seq: 7,
  serverTime: 1,
  status: { feed: 'connected', activity: 'active', dropped: 0, version: '0.1.0', gitSha: 'abc' },
  map: { center: [-80.35, 43.45], zoom: 8.25 },
  nodes: [],
  routes: []
};

describe('sequenceAction', () => {
  it('classifies duplicates, contiguous events, and gaps', () => {
    expect(sequenceAction(7, 7)).toBe('duplicate');
    expect(sequenceAction(7, 6)).toBe('duplicate');
    expect(sequenceAction(7, 8)).toBe('next');
    expect(sequenceAction(7, 9)).toBe('gap');
  });
});

describe('LiveStore', () => {
  it('upserts nodes without duplicating IDs', () => {
    const store = new LiveStore(initial);
    const node = { id: 'n1', label: 'Relay', lat: 43.4, lng: -80.3, role: 'repeater' as const, observer: false, lastSeen: 2 };
    store.upsertNode(node, 8);
    store.upsertNode({ ...node, label: 'Relay 2' }, 9);
    expect(store.snapshot.nodes).toHaveLength(1);
    expect(store.snapshot.nodes[0]?.label).toBe('Relay 2');
    expect(store.snapshot.seq).toBe(9);
  });

  it('marks status-only notifications as map-stable', () => {
    const store = new LiveStore(initial);
    const mapChanges: boolean[] = [];
    store.subscribe((_state, mapChanged) => { mapChanges.push(mapChanged); });
    store.updateStatus({ ...initial.status, activity: 'quiet' }, 8);
    expect(mapChanges).toEqual([true, false]);
    store.destroy();
  });

  it('batches route additions and metadata while advancing sequence immediately', () => {
    vi.useFakeTimers();
    const store = new LiveStore(initial);
    let emissions = 0;
    store.subscribe(() => { emissions += 1; });
    const endpoint = { id: 'a', label: 'A', lat: 43.4, lng: -80.3 };
    const packet = {
      seq: 8,
      id: 'p1',
      at: 100,
      payloadType: 'Trace',
      mode: 'route' as const,
      segments: [{ routeId: 'r1', from: endpoint, to: { ...endpoint, id: 'b', lng: -80.2 } }]
    };
    store.applyPacket(packet);
    store.applyPacket({ ...packet, seq: 9, at: 200 });
    expect(store.snapshot.seq).toBe(9);
    expect(store.snapshot.routes).toHaveLength(0);
    expect(emissions).toBe(1);

    vi.advanceTimersByTime(250);
    expect(store.snapshot.routes).toHaveLength(1);
    expect(store.snapshot.routes[0]).toMatchObject({ id: 'r1', packetCount: 2, lastHeard: 200, intensity: 1 });
    expect(emissions).toBe(2);
    store.destroy();
    vi.useRealTimers();
  });

  it('propagates node labels and coordinates to indexed route endpoints in one batch', () => {
    vi.useFakeTimers();
    const endpointA = { id: 'a', label: 'Old A', lat: 43.4, lng: -80.3 };
    const endpointB = { id: 'b', label: 'B', lat: 43.5, lng: -80.2 };
    const store = new LiveStore({
      ...initial,
      nodes: [{ ...endpointA, role: 'repeater', observer: false, lastSeen: 1 }],
      routes: [{ id: 'r1', from: endpointA, to: endpointB, packetCount: 8, lastHeard: 1, intensity: 3 }]
    });

    store.upsertNode({ ...endpointA, label: 'New A', lat: 44, lng: -79, role: 'repeater', observer: false, lastSeen: 2 }, 8);
    expect(store.snapshot.nodes[0]).toMatchObject({ label: 'New A', lat: 44, lng: -79 });
    expect(store.snapshot.routes[0]?.from).toEqual(endpointA);

    vi.advanceTimersByTime(250);
    expect(store.snapshot.routes[0]).toMatchObject({
      packetCount: 8,
      from: { id: 'a', label: 'New A', lat: 44, lng: -79 }
    });
    store.destroy();
    vi.useRealTimers();
  });

  it('coalesces existing-route count, freshness, and intensity updates', () => {
    vi.useFakeTimers();
    const from = { id: 'a', label: 'A', lat: 43.4, lng: -80.3 };
    const to = { id: 'b', label: 'B', lat: 43.5, lng: -80.2 };
    const store = new LiveStore({
      ...initial,
      routes: [{ id: 'r1', from, to, packetCount: 3, lastHeard: 1, intensity: 1 }]
    });
    let emissions = 0;
    store.subscribe(() => { emissions += 1; });

    for (let seq = 8; seq <= 10; seq += 1) {
      store.applyPacket({
        seq,
        id: `p${seq}`,
        at: seq * 100,
        payloadType: 'Trace',
        mode: 'route',
        segments: [{ routeId: 'r1', from, to }]
      });
    }
    expect(store.snapshot.seq).toBe(10);
    expect(store.snapshot.routes[0]).toMatchObject({ packetCount: 3, lastHeard: 1, intensity: 1 });
    expect(emissions).toBe(1);

    vi.advanceTimersByTime(250);
    expect(store.snapshot.routes[0]).toMatchObject({ packetCount: 6, lastHeard: 1_000, intensity: 2 });
    expect(emissions).toBe(2);
    store.destroy();
    vi.useRealTimers();
  });

  it('keeps count-only batches internal and never regresses out-of-order freshness', () => {
    vi.useFakeTimers();
    const from = { id: 'a', label: 'A', lat: 43.4, lng: -80.3 };
    const to = { id: 'b', label: 'B', lat: 43.5, lng: -80.2 };
    const store = new LiveStore({
      ...initial,
      routes: [{ id: 'r1', from, to, packetCount: 4, lastHeard: 100, intensity: 2 }]
    });
    let emissions = 0;
    store.subscribe(() => { emissions += 1; });
    const packet = {
      seq: 8,
      id: 'p8',
      at: 200,
      payloadType: 'Trace',
      mode: 'route' as const,
      segments: [{ routeId: 'r1', from, to }]
    };

    store.applyPacket(packet);
    store.applyPacket({ ...packet, seq: 9, id: 'p9', at: 50 });
    vi.advanceTimersByTime(250);

    expect(store.snapshot).toMatchObject({ seq: 9 });
    expect(store.snapshot.routes[0]).toMatchObject({ packetCount: 6, lastHeard: 200, intensity: 2 });
    expect(emissions).toBe(1);
    store.destroy();
    vi.useRealTimers();
  });
});

describe('public state guards and status', () => {
  it('rejects unsupported schemas', () => {
    expect(() => assertStateV1({ ...initial, schemaVersion: 2 })).toThrow('unsupported state schema');
  });

  it('distinguishes reconnecting and normal RF quiet', () => {
    expect(activityLabel({ ...initial, status: { ...initial.status, activity: 'quiet' } }, true)).toEqual({
      state: 'quiet',
      text: 'Connected · quiet'
    });
    expect(activityLabel(initial, false).state).toBe('reconnecting');
  });
});
