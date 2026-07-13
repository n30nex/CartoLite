import { expect, test } from '@playwright/test';
import type { NodeV1, RouteV1, StateV1 } from '../src/types';

test('keeps a 2k-node / 5k-route first view responsive', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'large-topology renderer budget runs once on desktop');
  const state = scaleState();
  const firstRoute = state.routes[0];
  if (!firstRoute) throw new Error('scale fixture has no routes');
  const packet = {
    seq: 1,
    id: 'scale-packet',
    at: Date.now(),
    payloadType: 'Text',
    mode: 'route',
    segments: [{ routeId: firstRoute.id, from: firstRoute.from, to: firstRoute.to }]
  };

  await page.route('**/api/state', (route) => route.fulfill({ json: state }));
  await page.route('**/api/events**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: `retry: 60000\n\nevent: hello\ndata: ${JSON.stringify({ seq: 0, bootId: state.bootId })}\n\nid: 1\nevent: packet\ndata: ${JSON.stringify(packet)}\n\n`
  }));

  const started = Date.now();
  await page.goto('/');
  await expect(page.locator('#status')).toHaveAttribute('title', '2000 nodes · 5000 routes', { timeout: 10_000 });
  await expect(page.locator('#map .maplibregl-canvas')).toBeVisible();
  await expect(page.locator('#map')).toHaveAttribute('data-render-state', 'idle', { timeout: 10_000 });
  expect(Date.now() - started, 'large topology should hydrate inside the first-view budget').toBeLessThan(10_000);

  const eventLoopWindow = await page.evaluate(() => new Promise<number>((resolve) => {
    const start = performance.now();
    let turns = 0;
    const tick = (): void => {
      turns += 1;
      if (turns >= 50) resolve(performance.now() - start);
      else window.setTimeout(tick, 0);
    };
    window.setTimeout(tick, 0);
  }));
  expect(eventLoopWindow, 'main thread should remain interactive after topology hydration').toBeLessThan(2_000);
  await page.screenshot({ path: testInfo.outputPath('cartolite-scale.png') });
});

function scaleState(): StateV1 {
  const now = Date.now();
  const nodes: NodeV1[] = Array.from({ length: 2_000 }, (_, index): NodeV1 => ({
    id: `node-${index}`,
    label: `MC ${index}`,
    role: index % 11 === 0 ? 'room_server' : index % 3 === 0 ? 'repeater' : 'companion',
    observer: index % 17 === 0,
    lat: 42.1 + (index % 40) * 0.075,
    lng: -83.5 + (Math.floor(index / 40) % 50) * 0.09,
    lastSeen: now - (index % 120) * 60_000
  }));
  const routes: RouteV1[] = Array.from({ length: 5_000 }, (_, index) => {
    const from = nodes[index % nodes.length]!;
    const to = nodes[(index * 37 + 113) % nodes.length]!;
    return {
      id: `route-${index}`,
      from: endpoint(from),
      to: endpoint(to),
      packetCount: 1 + index % 31,
      lastHeard: now - (index % 90) * 60_000,
      intensity: (index % 5) as RouteV1['intensity']
    };
  });
  return {
    schemaVersion: 1,
    bootId: 'scale-smoke',
    seq: 0,
    serverTime: now,
    status: { feed: 'connected', activity: 'active', lastPacketAt: now, dropped: 0, version: 'test', gitSha: 'scale' },
    map: { center: [-80.35, 43.45], zoom: 8.25 },
    nodes,
    routes
  };
}

function endpoint(node: NodeV1): RouteV1['from'] {
  return { id: node.id, label: node.label, lat: node.lat, lng: node.lng };
}
