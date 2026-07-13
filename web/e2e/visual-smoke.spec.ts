import { expect, test, type Locator } from '@playwright/test';
import { AFTERGLOW_MS, RESIDUE_MS, SINGLE_HOP_MS } from '../src/packetAnimator';
import type { StateV1 } from '../src/types';

test('renders the live route map and privacy-safe state', async ({ page }, testInfo) => {
  const stateResponse = page.waitForResponse((response) => response.url().endsWith('/api/state') && response.ok());
  await page.goto('/');
  const response = await stateResponse;
  const state = await response.json() as Record<string, unknown>;

  await expect(page.locator('#map .maplibregl-canvas')).toBeVisible();
  await expect(page.locator('#map')).toHaveAttribute('data-render-state', 'idle');
  await expect(page.locator('#packet-canvas')).toBeVisible();
  await expect(page.locator('#status-text')).not.toHaveText('Starting…');
  await expect(page.locator('.legend')).toContainText('RF route');
  const routesButton = page.locator('#routes-button');
  await expect(routesButton).toBeVisible();
  await expect(routesButton).toHaveAttribute('aria-pressed', 'true');
  await expect(routesButton).toHaveAttribute('title', 'Hide routes');
  await expect(page.locator('#map')).toHaveAttribute('data-routes-visible', 'true');
  await routesButton.click();
  await expect(routesButton).toHaveAttribute('aria-pressed', 'false');
  await expect(routesButton).toHaveAttribute('title', 'Show routes');
  await expect(page.locator('#map')).toHaveAttribute('data-routes-visible', 'false');
  await expect.poll(() => canvasHasPixels(page.locator('#packet-canvas')), { message: 'packet animation canvas should receive a live frame while routes are hidden', timeout: 15_000 }).toBe(true);
  await routesButton.click();
  await expect(routesButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#map')).toHaveAttribute('data-routes-visible', 'true');
  expect(state.schemaVersion).toBe(1);

  const serialized = JSON.stringify(state).toLowerCase();
  for (const forbidden of ['packet_hash', 'raw_payload', 'raw_path', 'public_key', 'observer_public_key', 'resolver_reason', 'message_text']) {
    expect(serialized, `public state contains ${forbidden}`).not.toContain(forbidden);
  }

  await page.screenshot({ path: testInfo.outputPath('cartolite.png'), fullPage: true });
});

test('keeps the map primary on mobile with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#follow-button')).toBeVisible();
  await expect(page.locator('#routes-button')).toBeVisible();
  await expect(page.locator('#routes-button')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#routes-button').click();
  await expect(page.locator('#routes-button')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#reset-button')).toBeVisible();
  await page.locator('#follow-button').click();
  await expect(page.locator('#follow-button')).toHaveAttribute('aria-pressed', 'true');
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
  const afterglowWindow = SINGLE_HOP_MS + AFTERGLOW_MS + 600;
  await page.waitForTimeout(afterglowWindow);
  await expect.poll(() => canvasHasPixels(packetCanvas), { message: '15-second trail should outlive the moving comet and afterglow', timeout: 2_000 }).toBe(true);
  await page.waitForTimeout(RESIDUE_MS - afterglowWindow + 600);
  await expect.poll(() => canvasHasPixels(packetCanvas), { message: 'recent packet trail should clear after 15 seconds', timeout: 2_000 }).toBe(false);
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
