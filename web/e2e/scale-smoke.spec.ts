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
  await expect(page.locator('#packet-canvas')).toHaveAttribute('data-power-mode', testInfo.project.name.startsWith('mobile') ? 'low' : 'full');
  await expect(page.locator('#packet-canvas')).toHaveAttribute('data-quality-mode', testInfo.project.name.startsWith('mobile') ? 'low' : 'full');
  await expect(page.locator('#map')).toHaveAttribute('data-render-state', 'idle', { timeout: 10_000 });
  expect(Date.now() - started, 'large topology should hydrate inside the first-view budget').toBeLessThan(10_000);
  const map = page.locator('#map');
  await expect(page.locator('#route-canvas')).toHaveCount(0);
  await expect(map).toHaveAttribute('data-route-renderer', 'maplibre');
  await installLongTaskObserver(page);

  const heatmapButton = page.locator('#heatmap-button');
  if (testInfo.project.name.startsWith('mobile')) {
    await page.locator('#layers-summary').click();
    await expect(page.locator('#layers-disclosure')).toHaveAttribute('open', '');
  }
  await resetLongTasks(page);
  await page.locator('#route-window').selectOption('24h');
  await expect.poll(() => map.getAttribute('data-eligible-routes').then(Number), {
    message: 'the 24-hour source must keep every route, with no visual cap'
  }).toBe(7_000);
  await expect(map).toHaveAttribute('data-trunk-representations-loaded', /^(?:national|regional)(?:,(?:national|regional))?$/);
  await expect.poll(async () => {
    const loaded = (await map.getAttribute('data-trunk-representations-loaded') ?? '').split(',');
    const national = Number(await map.getAttribute('data-national-routes-represented'));
    const regional = Number(await map.getAttribute('data-regional-routes-represented'));
    return national === (loaded.includes('national') ? 7_000 : 0)
      && regional === (loaded.includes('regional') ? 7_000 : 0);
  }, { message: 'every loaded trunk representation must account for all 7,000 routes' }).toBe(true);
  const loadedTrunks = (await map.getAttribute('data-trunk-representations-loaded') ?? '').split(',');
  if (loadedTrunks.includes('national')) {
    expect(Number(await map.getAttribute('data-national-route-trunks')), 'national links should collapse into a compact trunk set').toBeLessThan(100);
  }
  if (loadedTrunks.includes('regional')) {
    expect(Number(await map.getAttribute('data-regional-route-trunks')), 'regional links should collapse before exact lines load').toBeLessThan(300);
  }
  await expect(map).toHaveAttribute('data-render-state', 'idle', { timeout: 10_000 });
  await expect(map).toHaveAttribute('data-exact-routes-loaded', 'false');
  expect(await maximumLongTask(page), 'selecting the complete 24-hour window must not block the main thread for 100 ms').toBeLessThan(100);
  await expect(heatmapButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#map')).toHaveAttribute('data-heatmap-visible', 'true');
  const routesButton = page.locator('#routes-button');
  await resetLongTasks(page);
  await routesButton.click();
  await expect(routesButton).toHaveAttribute('aria-pressed', 'true');
  await expect(map).toHaveAttribute('data-routes-visible', 'true');
  await expect(map).toHaveAttribute('data-route-representation', /^(?:national|regional)-trunks$/);
  await expect(map).toHaveAttribute('data-render-state', 'idle', { timeout: 10_000 });
  expect(await maximumLongTask(page), 'enabling Routes must not block the main thread for 100 ms').toBeLessThan(100);

  const mapBox = await page.locator('#map .maplibregl-canvas').boundingBox();
  expect(mapBox).not.toBeNull();
  if (mapBox) {
    await resetLongTasks(page);
    await page.mouse.move(mapBox.x + mapBox.width * 0.58, mapBox.y + mapBox.height * 0.52);
    await page.mouse.down();
    await page.mouse.move(mapBox.x + mapBox.width * 0.42, mapBox.y + mapBox.height * 0.45, { steps: 8 });
    await page.mouse.up();
    await expect(map).toHaveAttribute('data-render-state', 'idle', { timeout: 10_000 });
    await expect(map).toHaveAttribute('data-eligible-routes', '7000');
    expect(await maximumLongTask(page), 'camera movement with all routes visible must stay responsive').toBeLessThan(100);
  }

  const regionStarted = Date.now();
  const regionsButton = page.locator('#regions-button');
  await resetLongTasks(page);
  await regionsButton.click();
  await expect(page.locator('#map')).toHaveAttribute('data-regions-loaded', 'true', { timeout: 10_000 });
  const regionCanvas = page.locator('#region-canvas');
  await expect(regionCanvas).toBeVisible();
  await expect.poll(() => regionCanvas.getAttribute('data-rendered-vertices').then(Number)).toBeGreaterThan(0);
  await expect(page.locator('#map')).toHaveAttribute('data-render-state', 'idle', { timeout: 10_000 });
  expect(Date.now() - regionStarted, 'regional overlay should become interactive inside its load budget').toBeLessThan(10_000);
  expect(await maximumLongTask(page), 'enabling Regions must not block the main thread for 100 ms').toBeLessThan(100);

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
  expect(eventLoopWindow, 'main thread should remain interactive with topology and regions visible').toBeLessThan(2_000);
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

async function installLongTaskObserver(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const state = { durations: [] as number[], since: performance.now() };
    Object.defineProperty(window, '__cartoliteLongTasks', { configurable: true, value: state });
    if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) return;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.startTime >= state.since) state.durations.push(entry.duration);
      }
    }).observe({ type: 'longtask', buffered: false });
  });
}

async function resetLongTasks(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const state = (window as unknown as {
      __cartoliteLongTasks: { durations: number[]; since: number };
    }).__cartoliteLongTasks;
    state.durations = [];
    state.since = performance.now();
  });
}

async function maximumLongTask(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => Math.max(0, ...(window as unknown as {
    __cartoliteLongTasks: { durations: number[] };
  }).__cartoliteLongTasks.durations));
}

async function canvasHasPixels(canvas: import('@playwright/test').Locator): Promise<boolean> {
  return canvas.evaluate((node) => {
    const element = node as HTMLCanvasElement;
    const context = element.getContext('2d');
    if (!context || element.width === 0 || element.height === 0) return false;
    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] !== 0) return true;
    }
    return false;
  });
}
