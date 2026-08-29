import { describe, expect, it } from 'vitest';
import type { EndpointV2, RoutePacketView } from './types';
import { routeSoundPlan } from './audio';

function endpoint(id: string, x: number, y: number): EndpointV2 {
  return { id, label: id, lng: x, lat: y };
}

function packet(points: EndpointV2[]): RoutePacketView {
  return {
    seq: 7,
    id: 'packet-7',
    at: 1_700_000_000_000,
    payloadType: 'Trace',
    mode: 'route',
    segments: points.slice(1).map((to, index) => ({
      routeId: `route-${index}`,
      from: points[index]!,
      to,
    })),
  };
}

const projector = { project: ([x, y]: [number, number]) => ({ x, y }) };

describe('route hop sonification', () => {
  it('plays one deterministic pentatonic note for every hop of a visible route', () => {
    const route = packet([
      endpoint('a', -20, 50),
      endpoint('b', 40, 50),
      endpoint('c', 80, 60),
      endpoint('d', 140, 60),
    ]);
    const first = routeSoundPlan(route, projector, 100, 100);
    const second = routeSoundPlan(route, projector, 100, 100);

    expect(first).toHaveLength(route.segments.length);
    expect(second).toEqual(first);
    expect(first.map((note) => note.startMS)).toEqual([...first.map((note) => note.startMS)].sort((a, b) => a - b));
    expect(first.every((note) => note.frequency >= 220 && note.frequency <= 1_100)).toBe(true);
    expect(first.every((note) => note.pan >= -0.75 && note.pan <= 0.75)).toBe(true);
  });

  it('stays silent when no part of the route is on screen', () => {
    const route = packet([
      endpoint('a', 180, 180),
      endpoint('b', 220, 220),
      endpoint('c', 260, 260),
    ]);
    expect(routeSoundPlan(route, projector, 100, 100)).toEqual([]);
  });

  it('does not sound a diagonal whose bounding box only grazes the viewport', () => {
    const route = packet([
      endpoint('a', -20, 90),
      endpoint('b', 10, 120),
    ]);
    expect(routeSoundPlan(route, projector, 100, 100)).toEqual([]);
  });

  it('sounds every visible hop but skips off-screen hops in a partially visible route', () => {
    const route = packet([
      endpoint('a', -140, 50),
      endpoint('b', -100, 50),
      endpoint('c', 20, 50),
      endpoint('d', 70, 50),
      endpoint('e', 160, 50),
      endpoint('f', 200, 50),
    ]);
    const notes = routeSoundPlan(route, projector, 100, 100);

    expect(notes).toHaveLength(3);
    expect(notes[0]!.startMS).toBeGreaterThan(0);
    expect(notes[1]!.startMS).toBeGreaterThan(notes[0]!.startMS);
    expect(notes[2]!.startMS).toBeGreaterThan(notes[1]!.startMS);
  });

  it('does not sonify observer-only activity because it has no public hops', () => {
    expect(routeSoundPlan({
      seq: 8,
      id: 'observer-8',
      at: 1_700_000_000_000,
      payloadType: 'Advert',
      mode: 'observer',
      observer: endpoint('observer', 50, 50),
    }, projector, 100, 100)).toEqual([]);
  });
});
