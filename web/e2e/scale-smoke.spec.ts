import { expect, test } from '@playwright/test';
import type { NodeV2, RouteV2, StateV2 } from '../src/types';

test('keeps a 4k-node / 7k-route first view responsive', async ({ page }, testInfo) => {
  const state = scaleState();
  const firstRoute = state.routes[0];
  if (!firstRoute) throw new Error('scale fixture has no routes');
  const packet = {
    seq: 1,
    id: 'scale-packet',
    at: Date.now(),
    payloadType: 'Text',
    mode: 'route',
    segments: [{ routeId: firstRoute.id, fromId: firstRoute.fromId, toId: firstRoute.toId }]
  };

  await page.route('**/api/state', (route) => route.fulfill({ json: state }));
  await page.route('**/api/events**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: `retry: 60000\n\nevent: hello\ndata: ${JSON.stringify({ seq: 0, bootId: state.bootId })}\n\nid: 1\nevent: packet\ndata: ${JSON.stringify(packet)}\n\n`
  }));

  const started = Date.now();
  await page.goto('/');
  await expect(page.locator('#status')).toHaveAttribute('title', '4000 nodes · 7000 routes', { timeout: 10_000 });
  await expect(page.locator('#map .maplibregl-canvas')).toBeVisible();
  await expect(page.locator('#packet-canvas')).toHaveAttribute('data-power-mode', testInfo.project.name === 'mobile' ? 'low' : 'full');
  await expect(page.locator('#map')).toHaveAttribute('data-render-state', 'idle', { timeout: 10_000 });
  expect(Date.now() - started, 'large topology should hydrate inside the first-view budget').toBeLessThan(10_000);

  const heatmapButton = page.locator('#heatmap-button');
  await expect(heatmapButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#map')).toHaveAttribute('data-heatmap-visible', 'true');
  const routesButton = page.locator('#routes-button');
  await routesButton.click();
  await expect(routesButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#map')).toHaveAttribute('data-routes-visible', 'true');
  await expect(page.locator('#map')).toHaveAttribute('data-render-state', 'idle', { timeout: 10_000 });

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

function scaleState(): StateV2 {
  const now = Date.now();
  const kinds: readonly RouteV2['lastKind'][] = ['Advert', 'Trace', 'Text', 'ACK', 'Control', 'Other'];
  const trafficLevels = [0.25, 1, 4, 12, 32, 64] as const;
  const routeAges = [0, 5 * 60_000, 20 * 60_000, 2 * 60 * 60_000, 8 * 60 * 60_000, 23 * 60 * 60_000] as const;
  const nodes: NodeV2[] = Array.from({ length: 4_000 }, (_, index): NodeV2 => ({
    id: `node-${index}`,
    label: `MC ${index}`,
    role: index % 11 === 0 ? 'room_server' : index % 3 === 0 ? 'repeater' : 'companion',
    observer: index % 17 === 0,
    lat: 42.1 + (index % 40) * 0.075,
    lng: -83.5 + (Math.floor(index / 40) % 50) * 0.09,
    lastSeen: now - (index % 120) * 60_000
  }));
  const routes: RouteV2[] = Array.from({ length: 7_000 }, (_, index) => {
    const from = nodes[index % nodes.length]!;
    const to = nodes[(index * 37 + 113) % nodes.length]!;
    return {
      id: `route-${index}`,
      fromId: from.id,
      toId: to.id,
      packetCount: 1 + index % 31,
      lastHeard: now - routeAges[index % routeAges.length]!,
      intensity: (index % 5) as RouteV2['intensity'],
      lastKind: kinds[index % kinds.length]!,
      traffic: trafficLevels[index % trafficLevels.length]!
    };
  });
  return {
    schemaVersion: 2,
    bootId: 'scale-smoke',
    seq: 0,
    serverTime: now,
    status: { feed: 'connected', activity: 'active', lastPacketAt: now, dropped: 0, version: 'test', gitSha: 'scale' },
    map: { center: [-96, 56], zoom: 3.4 },
    nodes,
    routes
  };
}
