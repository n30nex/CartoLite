import { expect, test } from '@playwright/test';
import type { StateV2 } from '../src/types';

test('Netgraph keeps all 4,000 nodes and 7,000 links responsive', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the scale timing gate runs once on desktop');
  const now = Date.now();
  const nodes = Array.from({ length: 4_000 }, (_, index) => ({
    id: `node-${index}`,
    label: `Scale Node ${index.toString().padStart(4, '0')}`,
    lat: 42 + index % 30 * 0.1,
    lng: -130 + index % 80 * 0.5,
    role: index % 5 === 0 ? 'companion' as const : 'repeater' as const,
    observer: false,
    lastSeen: now - index,
  }));
  const routes = Array.from({ length: 7_000 }, (_, index) => ({
    id: `route-${index}`,
    fromId: `node-${index % nodes.length}`,
    toId: `node-${index < nodes.length ? (index + 1) % nodes.length : (index * 17 + 31) % nodes.length}`,
    packetCount: 1 + index % 32,
    lastHeard: now - index,
    intensity: Math.min(4, index % 5) as 0 | 1 | 2 | 3 | 4,
    lastKind: (['Advert', 'Trace', 'Text', 'ACK', 'Control'] as const)[index % 5]!,
    traffic: 1 + index % 32,
  }));
  const state: StateV2 = {
    schemaVersion: 2,
    bootId: 'netgraph-scale',
    seq: 0,
    serverTime: now,
    status: { feed: 'connected', activity: 'quiet', dropped: 0, version: 'test', gitSha: 'test' },
    map: { center: [-96, 56], zoom: 3 },
    nodes,
    routes,
  };
  await page.route('**/api/state', (route) => route.fulfill({ json: state }));
  await page.route('**/api/events**', (route) => route.fulfill({
    contentType: 'text/event-stream',
    body: `event: hello\ndata: ${JSON.stringify({ seq: 0, bootId: state.bootId })}\n\n`,
  }));

  await page.goto('/netgraph/');
  const stage = page.locator('#netgraph-stage');
  await expect(stage).toHaveAttribute('data-render-state', 'idle', { timeout: 15_000 });
  await expect(stage).toHaveAttribute('data-connected-nodes', '4000');
  await expect(stage).toHaveAttribute('data-visible-routes', '7000');
  expect(Number(await stage.getAttribute('data-render-apply-ms')), 'topology indexing and layout should stay bounded').toBeLessThan(250);
  expect(Number(await stage.getAttribute('data-static-draw-ms')), 'drawing every link should not block interaction').toBeLessThan(100);

  await page.locator('#route-window').selectOption('15m');
  await expect(stage).toHaveAttribute('data-visible-routes', '7000');
  expect(Number(await stage.getAttribute('data-route-window-apply-ms')), 'age-window filtering should finish within one task').toBeLessThan(100);

  await page.locator('#find-button').click();
  await page.locator('#node-search').fill('Scale Node 3999');
  await page.locator('.node-search-result').first().click();
  await expect(stage).toHaveAttribute('data-selected-node-id', 'node-3999');
  await expect(page.locator('#node-inspector-sheet')).toBeVisible();
  expect(Number(await stage.getAttribute('data-node-search-apply-ms'))).toBeLessThan(100);
  expect(Number(await stage.getAttribute('data-node-selection-apply-ms'))).toBeLessThan(100);
});
