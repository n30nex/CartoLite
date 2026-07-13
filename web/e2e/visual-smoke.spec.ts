import { expect, test, type Locator, type Page } from '@playwright/test';
import { DESTINATION_BLOOM_MS, RESIDUE_MS, RESIDUE_REDRAW_MS, routeDuration } from '../src/packetAnimator';
import { NEIGHBOR_ROUTE_RECENT_MS } from '../src/routeFocus';
import type { StateV1 } from '../src/types';

test('renders the live route map and privacy-safe state', async ({ page }, testInfo) => {
  const mapStyleErrors = captureMapStyleErrors(page);
  const regionAssetRequests: string[] = [];
  page.on('request', (request) => {
    if (isRegionAssetURL(request.url())) regionAssetRequests.push(request.url());
  });
  const stateResponse = page.waitForResponse((response) => response.url().endsWith('/api/state') && response.ok());
  await page.goto('/');
  const response = await stateResponse;
  const state = await response.json() as Record<string, unknown>;

  await expect(page.locator('#map .maplibregl-canvas')).toBeVisible();
  await expect(page.locator('.map-grade')).toBeVisible();
  await expect(page.locator('.map-grade')).toHaveCSS('pointer-events', 'none');
  await expect(page.locator('#map')).toHaveAttribute('data-render-state', 'idle');
  expect(mapStyleErrors, 'MapLibre should accept every installed layer expression').toEqual([]);
  await expect(page.locator('#packet-canvas')).toBeVisible();
  await expect(page.locator('#status-text')).not.toHaveText('Starting…');
  await expect(page.locator('.legend')).toContainText('RF route');
  if (testInfo.project.name === 'mobile') {
    await expect(page.locator('#legend-toggle')).toBeVisible();
    await expect(page.locator('#legend')).toHaveAttribute('data-collapsed', 'true');
    await expect(page.locator('#legend-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#legend-items')).toBeHidden();
    await page.locator('#legend-toggle').click();
    await expect(page.locator('#legend-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#legend-toggle')).toHaveAttribute('aria-label', 'Hide map legend');
    await expect(page.locator('#legend-items')).toBeVisible();
    await page.locator('#legend-toggle').click();
  } else {
    await expect(page.locator('#legend-items')).toBeVisible();
  }
  const routesButton = page.locator('#routes-button');
  await expect(routesButton).toBeVisible();
  await expect(routesButton).toHaveAttribute('aria-pressed', 'true');
  await expect(routesButton).toHaveAttribute('title', 'Hide routes');
  await expect(page.locator('#map')).toHaveAttribute('data-routes-visible', 'true');
  const heatmapButton = page.locator('#heatmap-button');
  await expect(heatmapButton).toBeVisible();
  await expect(heatmapButton).toHaveAttribute('aria-label', 'Heatmap');
  await expect(heatmapButton).toHaveAttribute('aria-pressed', 'false');
  await expect(heatmapButton).toHaveAttribute('title', 'Show heatmap');
  await expect(page.locator('#map')).toHaveAttribute('data-heatmap-visible', 'false');
  const regionsButton = page.locator('#regions-button');
  await expect(regionsButton).toBeVisible();
  await expect(regionsButton).toHaveAttribute('aria-label', 'Regions');
  await expect(regionsButton).toHaveAttribute('aria-pressed', 'false');
  await expect(regionsButton).toHaveAttribute('title', 'Show regions');
  await expect(page.locator('#map')).toHaveAttribute('data-regions-visible', 'false');
  await expect(page.locator('#map')).toHaveAttribute('data-regions-loaded', 'false');
  expect(regionAssetRequests, 'regional GeoJSON should stay lazy while the layer is off').toEqual([]);

  await heatmapButton.click();
  await expect(heatmapButton).toHaveAttribute('aria-pressed', 'true');
  await expect(heatmapButton).toHaveAttribute('title', 'Hide heatmap');
  await expect(page.locator('#map')).toHaveAttribute('data-heatmap-visible', 'true');
  await expect(routesButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#map')).toHaveAttribute('data-render-state', 'idle');
  await routesButton.click();
  await expect(routesButton).toHaveAttribute('aria-pressed', 'false');
  await expect(routesButton).toHaveAttribute('title', 'Show routes');
  await expect(page.locator('#map')).toHaveAttribute('data-routes-visible', 'false');
  await expect(heatmapButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#map')).toHaveAttribute('data-heatmap-visible', 'true');
  await expect.poll(() => canvasHasPixels(page.locator('#packet-canvas')), { message: 'packet animation canvas should receive a live frame while routes are hidden', timeout: 15_000 }).toBe(true);
  await heatmapButton.click();
  await expect(heatmapButton).toHaveAttribute('aria-pressed', 'false');
  await expect(heatmapButton).toHaveAttribute('title', 'Show heatmap');
  await expect(page.locator('#map')).toHaveAttribute('data-heatmap-visible', 'false');
  await expect(routesButton).toHaveAttribute('aria-pressed', 'false');
  await routesButton.click();
  await expect(routesButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#map')).toHaveAttribute('data-routes-visible', 'true');

  const regionResponsePromise = page.waitForResponse((assetResponse) => isRegionAssetURL(assetResponse.url()));
  await regionsButton.click();
  const regionResponse = await regionResponsePromise;
  expect(regionResponse.ok(), `regional GeoJSON should load successfully from ${regionResponse.url()}`).toBe(true);
  await expect(regionsButton).toHaveAttribute('aria-pressed', 'true');
  await expect(regionsButton).toHaveAttribute('title', 'Hide regions');
  await expect(page.locator('#map')).toHaveAttribute('data-regions-loaded', 'true');
  await expect(page.locator('#map')).toHaveAttribute('data-regions-visible', 'true');
  await expect(page.locator('#map')).toHaveAttribute('data-render-state', 'idle');
  expect(regionAssetRequests).toHaveLength(1);
  await heatmapButton.click();
  await expect(page.locator('#map')).toHaveAttribute('data-heatmap-visible', 'true');
  await expect(page.locator('#map')).toHaveAttribute('data-render-state', 'idle');
  await page.screenshot({ path: testInfo.outputPath('cartolite-overlays.png'), fullPage: true });
  await regionsButton.click();
  await expect(regionsButton).toHaveAttribute('aria-pressed', 'false');
  await expect(regionsButton).toHaveAttribute('title', 'Show regions');
  await expect(page.locator('#map')).toHaveAttribute('data-regions-visible', 'false');
  await expect(page.locator('#map')).toHaveAttribute('data-regions-loaded', 'true');
  await expect(routesButton).toHaveAttribute('aria-pressed', 'true');
  await heatmapButton.click();
  await expect(page.locator('#map')).toHaveAttribute('data-heatmap-visible', 'false');
  expect(state.schemaVersion).toBe(1);

  const serialized = JSON.stringify(state).toLowerCase();
  for (const forbidden of ['packet_hash', 'raw_payload', 'raw_path', 'public_key', 'observer_public_key', 'resolver_reason', 'message_text']) {
    expect(serialized, `public state contains ${forbidden}`).not.toContain(forbidden);
  }

  await page.screenshot({ path: testInfo.outputPath('cartolite.png'), fullPage: true });
});

test('keeps the map primary with reduced motion and releases live follow on drag', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#packet-canvas')).toHaveAttribute('data-motion-mode', 'static');
  await expect(page.locator('#follow-button')).toBeVisible();
  await expect(page.locator('#routes-button')).toBeVisible();
  await expect(page.locator('#routes-button')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#routes-button').click();
  await expect(page.locator('#routes-button')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#reset-button')).toBeVisible();
  await page.locator('#follow-button').click();
  await expect(page.locator('#follow-button')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#follow-button')).toHaveClass(/selected/);
  await expect(page.locator('#follow-button')).toHaveAttribute('title', 'Stop following live packets');
  const mapCanvas = page.locator('#map .maplibregl-canvas');
  const box = await mapCanvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  if (testInfo.project.name !== 'mobile') {
    await page.mouse.move(box.x + box.width * 0.54, box.y + box.height * 0.54);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.64, box.y + box.height * 0.58, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator('#follow-button')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#follow-button')).not.toHaveClass(/selected/);
    await expect(page.locator('#follow-button')).toHaveAttribute('title', 'Follow live packets');
    await page.locator('#follow-button').click();
    await expect(page.locator('#follow-button')).toHaveAttribute('aria-pressed', 'true');
  }
  await page.locator('#reset-button').click();
  await expect(page.locator('#follow-button')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => canvasHasPixels(page.locator('#packet-canvas')), {
    message: 'reduced motion should render a restrained static traffic cue',
    timeout: 15_000
  }).toBe(true);
});

test('keeps a recent packet trail after stable routes are hidden', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'trail lifetime is covered once on desktop');
  const now = Date.now();
  const from = { id: 'a', label: 'Alpha', lat: 43.45, lng: -80.42 };
  const to = { id: 'b', label: 'Bravo', lat: 43.5, lng: -80.28 };
  const state: StateV1 = {
    schemaVersion: 1,
    bootId: 'trail-smoke',
    seq: 0,
    serverTime: now,
    status: { feed: 'connected', activity: 'active', lastPacketAt: now, dropped: 0, version: 'test', gitSha: 'trail' },
    map: { center: [-80.35, 43.45], zoom: 8.25 },
    nodes: [
      { ...from, role: 'repeater', observer: false, lastSeen: now },
      { ...to, role: 'companion', observer: false, lastSeen: now }
    ],
    routes: [{ id: 'route-a-b', from, to, packetCount: 1, lastHeard: now, intensity: 1 }]
  };
  const packet = {
    seq: 1,
    id: 'trail-packet',
    at: now,
    payloadType: 'Text',
    mode: 'route' as const,
    segments: [{ routeId: 'route-a-b', from, to }]
  };

  await page.route('**/api/state', (route) => route.fulfill({ json: state }));
  let eventStreamRequested = false;
  await page.route('**/api/events**', (route) => {
    eventStreamRequested = true;
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: `retry: 60000\n\nevent: hello\ndata: ${JSON.stringify({ seq: 0, bootId: state.bootId })}\n\nid: 1\nevent: packet\ndata: ${JSON.stringify(packet)}\n\n`
    });
  });

  await page.goto('/');
  await expect(page.locator('#map')).toHaveAttribute('data-render-state', 'idle');
  await expect.poll(() => eventStreamRequested, { message: 'mock event stream should receive the query-bearing SSE request' }).toBe(true);
  await page.locator('#routes-button').click();
  await expect(page.locator('#map')).toHaveAttribute('data-routes-visible', 'false');
  const packetCanvas = page.locator('#packet-canvas');
  await expect.poll(() => canvasHasPixels(packetCanvas), { timeout: 5_000 }).toBe(true);
  const afterglowWindow = routeDuration(packet.segments) + DESTINATION_BLOOM_MS + 600;
  await page.waitForTimeout(afterglowWindow);
  await expect.poll(() => canvasHasPixels(packetCanvas), { message: '15-second trail should outlive the moving comet and afterglow', timeout: 2_000 }).toBe(true);
  await page.waitForTimeout(RESIDUE_MS + RESIDUE_REDRAW_MS + 600);
  await expect.poll(() => canvasHasPixels(packetCanvas), { message: 'recent packet trail should clear after 15 seconds', timeout: 2_000 }).toBe(false);
});

test('focuses recent route neighbors and clears selection on the map', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  const now = Date.now();
  const center: [number, number] = [-80.35, 43.45];
  const alpha = { id: 'a', label: 'Alpha', lng: center[0], lat: center[1] };
  const bravo = { id: 'b', label: 'Bravo', lng: -80.1, lat: 43.45 };
  const charlie = { id: 'c', label: 'Charlie', lng: -80.35, lat: 43.6 };
  const delta = { id: 'd', label: 'Delta', lng: -80.6, lat: 43.3 };
  const state: StateV1 = {
    schemaVersion: 1,
    bootId: 'neighbor-smoke',
    seq: 0,
    serverTime: now,
    status: { feed: 'connected', activity: 'active', lastPacketAt: now, dropped: 0, version: 'test', gitSha: 'neighbor' },
    map: { center, zoom: 8.25 },
    nodes: [
      { ...alpha, role: 'repeater', observer: false, lastSeen: now },
      { ...bravo, role: 'companion', observer: false, lastSeen: now },
      { ...charlie, role: 'room_server', observer: false, lastSeen: now },
      { ...delta, role: 'sensor', observer: false, lastSeen: now }
    ],
    routes: [
      { id: 'a-b', from: alpha, to: bravo, packetCount: 12, lastHeard: now, intensity: 3 },
      { id: 'a-c', from: alpha, to: charlie, packetCount: 7, lastHeard: now - NEIGHBOR_ROUTE_RECENT_MS + 60 * 60_000, intensity: 2 },
      { id: 'a-d', from: alpha, to: delta, packetCount: 3, lastHeard: now - NEIGHBOR_ROUTE_RECENT_MS - 60 * 60_000, intensity: 1 },
      { id: 'b-c', from: bravo, to: charlie, packetCount: 5, lastHeard: now, intensity: 2 }
    ]
  };

  await page.route('**/api/state', (route) => route.fulfill({ json: state }));
  await page.route('**/api/events**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: `retry: 60000\n\nevent: hello\ndata: ${JSON.stringify({ seq: 0, bootId: state.bootId })}\n\n`
  }));

  await page.goto('/');
  const map = page.locator('#map');
  const canvas = page.locator('#map .maplibregl-canvas');
  const tooltip = page.locator('#tooltip');
  const focusChip = page.locator('#focus-chip');
  await expect(map).toHaveAttribute('data-render-state', 'idle');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const alphaPoint = projectToViewport(alpha, center, state.map.zoom, box);
  const bravoPoint = projectToViewport(bravo, center, state.map.zoom, box);
  const charliePoint = projectToViewport(charlie, center, state.map.zoom, box);
  const deltaPoint = projectToViewport(delta, center, state.map.zoom, box);

  await clickPoint(page, { x: alphaPoint.x + (mobile ? 12 : 0), y: alphaPoint.y }, mobile);
  await expect(map).toHaveAttribute('data-selected-node-id', 'a');
  await expect(map).toHaveAttribute('data-neighbor-route-count', '2');
  await expect(map).toHaveAttribute('data-render-state', 'idle');
  await expect(focusChip).toBeVisible();
  await expect(focusChip).toContainText('Alpha · 2 neighbors');
  await expect(page.locator('#legend')).toHaveAttribute('data-focused', 'true');
  await expect(page.locator('#legend-items')).toBeHidden();
  await expect(page.locator('#legend-toggle')).toBeHidden();

  await inspectRoute(page, alphaPoint, bravoPoint, mobile);
  await expect(map).toHaveAttribute('data-hovered-route-id', 'a-b');
  await expect(tooltip).toHaveAttribute('data-kind', 'route');
  await expect(tooltip).toContainText('Alpha ↔ Bravo');
  await expect(tooltip).toContainText('12 packets');
  await expectTooltipInsideViewport(tooltip, page);
  await page.screenshot({ path: testInfo.outputPath(`cartolite-neighbors-focus-${testInfo.project.name}.png`) });

  if (!mobile) {
    await hoverMidpoint(page, bravoPoint, charliePoint);
    await expect(tooltip).toBeHidden();
    await expect(map).toHaveAttribute('data-hovered-route-id', '');
    await hoverMidpoint(page, alphaPoint, deltaPoint);
    await expect(tooltip).toBeHidden();
  }

  const routesButton = page.locator('#routes-button');
  await routesButton.click();
  await expect(map).toHaveAttribute('data-routes-visible', 'false');
  await expect(map).toHaveAttribute('data-selected-node-id', 'a');
  await expect(map).toHaveAttribute('data-hovered-route-id', '');
  await expect(map).toHaveAttribute('data-render-state', 'idle');
  await expect(tooltip).toBeHidden();
  await expect(focusChip).toContainText('Alpha · 2 neighbors');
  await expect(page.locator('#legend')).toHaveAttribute('data-focused', 'true');

  await routesButton.click();
  await expect(map).toHaveAttribute('data-routes-visible', 'true');
  await expect(map).toHaveAttribute('data-render-state', 'idle');
  await inspectRoute(page, alphaPoint, charliePoint, mobile);
  await expect(map).toHaveAttribute('data-hovered-route-id', 'a-c');
  await expect(tooltip).toHaveAttribute('data-kind', 'route');
  await expect(tooltip).toContainText('Alpha ↔ Charlie');

  await clickPoint(page, bravoPoint, mobile);
  await expect(map).toHaveAttribute('data-selected-node-id', 'b');
  await expect(map).toHaveAttribute('data-neighbor-route-count', '2');
  await expect(map).toHaveAttribute('data-render-state', 'idle');
  await expect(focusChip).toContainText('Bravo · 2 neighbors');
  await inspectRoute(page, bravoPoint, charliePoint, mobile);
  await expect(map).toHaveAttribute('data-hovered-route-id', 'b-c');
  await expect(tooltip).toHaveAttribute('data-kind', 'route');
  await expect(tooltip).toContainText('Bravo ↔ Charlie');
  if (!mobile) {
    await hoverMidpoint(page, alphaPoint, charliePoint);
    await expect(tooltip).toBeHidden();
  }

  await clickPoint(page, { x: box.x + box.width * 0.84, y: box.y + box.height * 0.82 }, mobile);
  await expect(map).toHaveAttribute('data-selected-node-id', '');
  await expect(map).toHaveAttribute('data-neighbor-route-count', '0');
  await expect(map).toHaveAttribute('data-render-state', 'idle');
  await expect(tooltip).toBeHidden();
  await expect(focusChip).toBeHidden();
  await expect(page.locator('#legend')).toHaveAttribute('data-focused', 'false');
  if (mobile) {
    await expect(page.locator('#legend-toggle')).toBeVisible();
    await expect(page.locator('#legend')).toHaveAttribute('data-collapsed', 'true');
    await expect(page.locator('#legend-items')).toBeHidden();
  } else {
    await expect(page.locator('#legend-items')).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath('cartolite-neighbors.png') });
});

async function canvasHasPixels(canvas: Locator): Promise<boolean> {
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

function captureMapStyleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && text.includes('layers.') && text.includes('.paint.')) errors.push(text);
  });
  return errors;
}

function isRegionAssetURL(url: string): boolean {
  return url.includes('meshmapper-canada-regions') && url.includes('.geojson');
}

interface ViewportBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ViewportPoint {
  x: number;
  y: number;
}

function projectToViewport(
  endpoint: { lng: number; lat: number },
  center: [number, number],
  zoom: number,
  box: ViewportBox
): ViewportPoint {
  const worldSize = 512 * (2 ** zoom);
  const projected = mercator(endpoint.lng, endpoint.lat);
  const projectedCenter = mercator(center[0], center[1]);
  return {
    x: box.x + box.width / 2 + (projected.x - projectedCenter.x) * worldSize,
    y: box.y + box.height / 2 + (projected.y - projectedCenter.y) * worldSize
  };
}

function mercator(lng: number, lat: number): ViewportPoint {
  const sin = Math.sin(lat * Math.PI / 180);
  return {
    x: (lng + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)
  };
}

async function hoverMidpoint(page: Page, from: ViewportPoint, to: ViewportPoint): Promise<void> {
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
}

async function inspectRoute(page: Page, from: ViewportPoint, to: ViewportPoint, mobile: boolean): Promise<void> {
  const x = (from.x + to.x) / 2;
  const y = (from.y + to.y) / 2;
  if (mobile) {
    await page.touchscreen.tap(x, y);
    // Prove the tap stays pinned after Chromium's delayed synthetic mouseleave.
    await page.waitForTimeout(550);
    return;
  }
  await page.mouse.move(x, y, { steps: 4 });
}

async function clickPoint(page: Page, point: ViewportPoint, mobile: boolean): Promise<void> {
  if (mobile) {
    await page.touchscreen.tap(point.x, point.y);
    return;
  }
  await page.mouse.click(point.x, point.y);
}

async function expectTooltipInsideViewport(tooltip: Locator, page: Page): Promise<void> {
  const box = await tooltip.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;
  expect(box.x).toBeGreaterThanOrEqual(7);
  expect(box.y).toBeGreaterThanOrEqual(7);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 7);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 7);
}
