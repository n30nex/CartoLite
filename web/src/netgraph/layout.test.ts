import { describe, expect, it } from 'vitest';
import type { NodeV2, RouteV2 } from '../types';
import { EXPECTED_REGION_CODES } from '../regions';
import { NETGRAPH_AREA_ANCHORS, nearestNetgraphArea } from './areas';
import { buildNetgraphLayout, extendNetgraphLayout, graphTopologyChanged, routesInWindow, routeTopology } from './layout';

function node(id: string, label = id, lat = 45, lng = -75): NodeV2 {
  return { id, label, lat, lng, role: 'repeater', observer: false, lastSeen: 2_000_000 };
}

function route(id: string, fromId: string, toId: string, lastHeard = 2_000_000): RouteV2 {
  return { id, fromId, toId, lastHeard, packetCount: 1, intensity: 0, lastKind: 'Advert', traffic: 1 };
}

describe('netgraph layout', () => {
  it('includes every MeshMapper region plus metro anchors for gaps in that snapshot', () => {
    const codes = NETGRAPH_AREA_ANCHORS.map(({ code }) => code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of EXPECTED_REGION_CODES) expect(codes).toContain(code);
    expect(nearestNetgraphArea(43.36, -80.31)).toMatchObject({ code: 'YKF', name: 'Waterloo' });
    expect(nearestNetgraphArea(43.68, -79.39)).toMatchObject({ code: 'YYZ', name: 'Toronto' });
    expect(nearestNetgraphArea(43.243158, -79.94833)).toMatchObject({ code: 'YHM', name: 'Hamilton' });
    expect(nearestNetgraphArea(43.22294, -79.92149)).toMatchObject({ code: 'YHM', name: 'Hamilton' });
    expect(nearestNetgraphArea(47.51, -121.99)).toMatchObject({ code: 'SEA', name: 'Seattle' });
    expect(nearestNetgraphArea(45.5, -122.5)).toMatchObject({ code: 'PDX', name: 'Portland' });
    expect(NETGRAPH_AREA_ANCHORS.find(({ code }) => code === 'YYY')?.name).toBe('Bas-St-Laurent-Gaspésie');
  });

  it('lays out every connected node and excludes only isolated nodes', () => {
    const nodes = [node('a'), node('b'), node('c'), node('isolated')];
    const routes = [route('ab', 'a', 'b'), route('bc', 'b', 'c')];
    const layout = buildNetgraphLayout(nodes, routes);

    expect([...layout.connectedNodeIDs].sort()).toEqual(['a', 'b', 'c']);
    expect(layout.positions.size).toBe(3);
    expect(layout.componentCount).toBe(1);
    expect(layout.positions.get('b')?.degree).toBe(2);
    expect(layout.positions.has('isolated')).toBe(false);
  });

  it('is deterministic regardless of source ordering', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')];
    const routes = [route('ab', 'a', 'b'), route('cd', 'c', 'd')];
    const first = buildNetgraphLayout(nodes, routes);
    const second = buildNetgraphLayout([...nodes].reverse(), [...routes].reverse());

    expect([...second.positions]).toEqual([...first.positions]);
    expect(second.bounds).toEqual(first.bounds);
  });

  it('keeps all routes inside the selected age window', () => {
    const now = 100_000_000;
    const routes = [
      route('recent', 'a', 'b', now - 14 * 60_000),
      route('hour', 'b', 'c', now - 59 * 60_000),
      route('old', 'c', 'd', now - 25 * 60 * 60_000),
    ];

    expect(routesInWindow(routes, now, '15m').map(({ id }) => id)).toEqual(['recent']);
    expect(routesInWindow(routes, now, '1h').map(({ id }) => id)).toEqual(['recent', 'hour']);
    expect(routesInWindow(routes, now, '24h').map(({ id }) => id)).toEqual(['recent', 'hour']);
  });

  it('distinguishes traffic updates from topology changes', () => {
    const routes = [route('ab', 'a', 'b')];
    const topology = routeTopology(routes);

    expect(graphTopologyChanged(topology, [{ ...routes[0]!, packetCount: 2 }], 1)).toBe(false);
    expect(graphTopologyChanged(topology, [route('ab', 'a', 'c')], 1)).toBe(true);
    expect(graphTopologyChanged(topology, [], 2)).toBe(true);
  });

  it('keeps established coordinates while reconciling components joined by a new route', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')];
    const initial = buildNetgraphLayout(nodes, [route('ab', 'a', 'b'), route('cd', 'c', 'd')]);
    const next = extendNetgraphLayout(initial, nodes, [
      route('ab', 'a', 'b'),
      route('cd', 'c', 'd'),
      route('bc', 'b', 'c'),
    ]);

    expect(next.componentCount).toBe(1);
    expect(new Set([...next.positions.values()].map(({ component }) => component))).toEqual(new Set([0]));
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(next.positions.get(id)?.x).toBe(initial.positions.get(id)?.x);
      expect(next.positions.get(id)?.y).toBe(initial.positions.get(id)?.y);
    }
    expect(next.positions.get('b')?.degree).toBe(2);
    expect(next.positions.get('c')?.degree).toBe(2);
  });

  it('keeps nearby city areas apart even when an intermittent route joins them', () => {
    const nodes = [
      node('waterloo', 'Waterloo node', 43.46, -80.52),
      node('cambridge', 'Cambridge node', 43.36, -80.31),
      node('toronto', 'Toronto node', 43.68, -79.39),
      node('scarborough', 'Scarborough node', 43.77, -79.25),
    ];
    const layout = buildNetgraphLayout(nodes, [
      route('waterloo-local', 'waterloo', 'cambridge'),
      route('toronto-local', 'toronto', 'scarborough'),
      route('ducting', 'cambridge', 'toronto'),
    ]);

    expect(layout.componentCount).toBe(1);
    expect(layout.areas.map(({ code }) => code)).toEqual(['YKF', 'YYZ']);
    expect(layout.positions.get('cambridge')?.areaCode).toBe('YKF');
    expect(layout.positions.get('toronto')?.areaCode).toBe('YYZ');
    const waterloo = layout.areas.find(({ code }) => code === 'YKF')!;
    const toronto = layout.areas.find(({ code }) => code === 'YYZ')!;
    expect(Math.hypot(waterloo.x - toronto.x, waterloo.y - toronto.y))
      .toBeGreaterThanOrEqual(waterloo.radius + toronto.radius + 85);
  });

  it('places multiple newly connected components apart in the same update', () => {
    const initial = buildNetgraphLayout([node('a'), node('b')], [route('ab', 'a', 'b')]);
    const next = extendNetgraphLayout(
      initial,
      ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => node(id)),
      [route('ab', 'a', 'b'), route('cd', 'c', 'd'), route('ef', 'e', 'f')],
    );

    const coordinates = ['c', 'd', 'e', 'f'].map((id) => {
      const position = next.positions.get(id)!;
      return `${position.x},${position.y}`;
    });
    expect(new Set(coordinates).size).toBe(4);
    expect(next.componentCount).toBe(3);
    expect(next.positions.size).toBe(6);
  });

  it('keeps every populated geographic area outside every other area', () => {
    const nodes = NETGRAPH_AREA_ANCHORS.flatMap((area) => [
      node(`${area.code}-a`, `${area.name} A`, area.lat, area.lng),
      node(`${area.code}-b`, `${area.name} B`, area.lat + 0.001, area.lng + 0.001),
    ]);
    const routes = NETGRAPH_AREA_ANCHORS.map((area) => route(
      `${area.code}-local`,
      `${area.code}-a`,
      `${area.code}-b`,
    ));
    const layout = buildNetgraphLayout(nodes, routes);

    expect(layout.areas).toHaveLength(NETGRAPH_AREA_ANCHORS.length);
    for (let leftIndex = 0; leftIndex < layout.areas.length; leftIndex += 1) {
      const left = layout.areas[leftIndex]!;
      for (let rightIndex = leftIndex + 1; rightIndex < layout.areas.length; rightIndex += 1) {
        const right = layout.areas[rightIndex]!;
        expect(Math.hypot(left.x - right.x, left.y - right.y))
          .toBeGreaterThanOrEqual(left.radius + right.radius + 85);
      }
    }
  });

  it('keeps the complete 4,000-node and 7,000-link topology without a display cap', () => {
    const nodes = Array.from({ length: 4_000 }, (_, index) => node(`node-${index}`, `Node ${index}`));
    const routes = Array.from({ length: 7_000 }, (_, index) => route(
      `route-${index}`,
      `node-${index % nodes.length}`,
      `node-${(index * 17 + 1) % nodes.length}`,
    ));
    const layout = buildNetgraphLayout(nodes, routes);

    expect(layout.positions.size).toBe(4_000);
    expect(layout.connectedNodeIDs.size).toBe(4_000);
    expect(routesInWindow(routes, 2_000_000, '24h')).toHaveLength(7_000);
  });
});
