import { expect, test, type Page } from '@playwright/test';
import type { StateV2 } from '../src/types';

test('Netgraph renders stable topology, inspection, and synchronized musical hops', async ({ page }, testInfo) => {
  const now = Date.now();
  const state = netgraphState(now);
  await instrumentAudioContext(page);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.route('**/api/state', (route) => route.fulfill({ json: state }));
  await page.route('**/api/events**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const packet = {
      seq: 1,
      id: 'netgraph-packet',
      at: now,
      payloadType: 'Text',
      mode: 'route',
      segments: [
        { routeId: 'a-b', fromId: 'a', toId: 'b' },
        { routeId: 'b-c', fromId: 'b', toId: 'c' },
        { routeId: 'c-d', fromId: 'c', toId: 'd' },
      ],
    };
    await route.fulfill({
      contentType: 'text/event-stream',
      body: `retry: 60000\n\nevent: hello\ndata: ${JSON.stringify({ seq: 0, bootId: state.bootId })}\n\nid: 1\nevent: packet\ndata: ${JSON.stringify(packet)}\n\n`,
    });
  });

  await page.goto('/netgraph/');
  const stage = page.locator('#netgraph-stage');
  await expect(page.locator('#netgraph-app')).toHaveAttribute('data-loading', 'false');
  await expect(stage).toHaveAttribute('data-render-state', 'idle');
  await expect(stage).toHaveAttribute('data-connected-nodes', '4');
  await expect(stage).toHaveAttribute('data-visible-routes', '4');
  await expect(page.locator('#graph-canvas')).toBeVisible();
  await expect.poll(() => canvasHasPixels(page, '#graph-canvas')).toBe(true);

  await page.locator('#sound-button').click();
  await page.locator('#sound-toggle').click();
  await expect(page.locator('#sound-state')).toHaveText('On');
  await expect.poll(() => page.locator('#sound-activity').getAttribute('data-scheduled').then(Number), { timeout: 6_000 }).toBe(3);
  expect(await page.evaluate(() => (window as unknown as { __netgraphOscillators: number }).__netgraphOscillators)).toBe(3);
  await expect(stage).toHaveAttribute('data-last-packet-hops', '3');
  await expect.poll(() => canvasHasPixels(page, '#packet-canvas'), { timeout: 5_000 }).toBe(true);

  await page.locator('#find-button').click();
  await page.locator('#node-search').fill('Alpha');
  await page.locator('.node-search-result').first().click();
  await expect(stage).toHaveAttribute('data-selected-node-id', 'a');
  await expect(page.locator('#node-inspector-sheet')).toBeVisible();
  await expect(page.locator('#node-inspector-sheet')).toContainText('Alpha Repeater');
  await expect(page.locator('#node-inspector-sheet .neighbor-row').first()).toContainText('Bravo');
  expect(Number(await stage.getAttribute('data-node-search-apply-ms'))).toBeLessThan(100);
  expect(Number(await stage.getAttribute('data-node-selection-apply-ms'))).toBeLessThan(100);

  const initialScale = Number(await stage.getAttribute('data-view-scale'));
  await stage.dispatchEvent('wheel', { deltaY: -180, clientX: 500, clientY: 400 });
  await expect.poll(() => stage.getAttribute('data-view-scale').then(Number)).toBeGreaterThan(initialScale);
  await expect(stage).toHaveAttribute('data-visible-routes', '4');

  await page.locator('#route-window').selectOption('15m');
  await expect(stage).toHaveAttribute('data-visible-routes', '3');
  await expect(page.locator('#node-inspector-sheet')).not.toContainText('Delta Sensor');

  if (testInfo.project.name !== 'desktop') {
    const targets = await page.locator('.control-button:visible, #route-window').evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }));
    for (const target of targets) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(38);
    }
    const overflow = await page.locator('#topbar, .controls').evaluateAll((elements) => elements.some((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < -0.5 || rect.right > innerWidth + 0.5 || rect.top < -0.5 || rect.bottom > innerHeight + 0.5;
    }));
    expect(overflow).toBe(false);
  }
  expect(consoleErrors).toEqual([]);
});

test('the map exposes Netgraph beside Labs', async ({ page }) => {
  await page.route('**/api/state', (route) => route.fulfill({ json: netgraphState(Date.now()) }));
  await page.route('**/api/events**', (route) => route.fulfill({
    contentType: 'text/event-stream',
    body: `event: hello\ndata: ${JSON.stringify({ seq: 0, bootId: 'netgraph-test' })}\n\n`,
  }));
  await page.goto('/');
  await expect(page.locator('#labs-link')).toHaveAttribute('href', '/labs/');
  await expect(page.locator('#netgraph-link')).toHaveAttribute('href', '/netgraph/');
});

function netgraphState(now: number): StateV2 {
  return {
    schemaVersion: 2,
    bootId: 'netgraph-test',
    seq: 0,
    serverTime: now,
    status: { feed: 'connected', activity: 'active', lastPacketAt: now, dropped: 0, version: 'test', gitSha: 'test' },
    map: { center: [-79, 44], zoom: 5 },
    nodes: [
      { id: 'a', label: 'Alpha Repeater', lat: 44, lng: -80, role: 'repeater', observer: false, lastSeen: now },
      { id: 'b', label: 'Bravo Companion', lat: 45, lng: -79, role: 'companion', observer: false, lastSeen: now - 1_000 },
      { id: 'c', label: 'Charlie Room', lat: 46, lng: -78, role: 'room_server', observer: false, lastSeen: now - 2_000 },
      { id: 'd', label: 'Delta Sensor', lat: 47, lng: -77, role: 'sensor', observer: false, lastSeen: now - 3_000 },
      { id: 'isolated', label: 'Isolated', lat: 48, lng: -76, role: 'unknown', observer: false, lastSeen: now },
    ],
    routes: [
      { id: 'a-b', fromId: 'a', toId: 'b', packetCount: 12, lastHeard: now, intensity: 3, lastKind: 'Text', traffic: 12 },
      { id: 'b-c', fromId: 'b', toId: 'c', packetCount: 8, lastHeard: now - 30_000, intensity: 3, lastKind: 'ACK', traffic: 8 },
      { id: 'c-d', fromId: 'c', toId: 'd', packetCount: 5, lastHeard: now - 60_000, intensity: 2, lastKind: 'Trace', traffic: 5 },
      { id: 'a-d', fromId: 'a', toId: 'd', packetCount: 2, lastHeard: now - 30 * 60_000, intensity: 1, lastKind: 'Advert', traffic: 2 },
    ],
  };
}

async function canvasHasPixels(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).evaluate((canvas) => {
    const element = canvas as HTMLCanvasElement;
    const context = element.getContext('2d');
    if (!context || element.width === 0 || element.height === 0) return false;
    const sample = context.getImageData(0, 0, element.width, element.height).data;
    for (let index = 3; index < sample.length; index += 64) if ((sample[index] ?? 0) > 0) return true;
    return false;
  });
}

async function instrumentAudioContext(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const parameter = () => ({
      value: 0,
      cancelScheduledValues() {},
      exponentialRampToValueAtTime() {},
      setTargetAtTime() {},
      setValueAtTime() {},
    });
    const audioNode = (extra: Record<string, unknown> = {}) => Object.assign(extra, {
      connect(destination: unknown) { return destination; },
      disconnect() {},
    });
    class TestAudioContext {
      currentTime = 0;
      destination = audioNode();
      sampleRate = 48_000;
      state = 'running';
      onstatechange: (() => void) | null = null;
      createGain() { return audioNode({ gain: parameter() }); }
      createDelay() { return audioNode({ delayTime: parameter() }); }
      createBiquadFilter() { return audioNode({ type: 'lowpass', frequency: parameter(), Q: parameter() }); }
      createStereoPanner() { return audioNode({ pan: parameter() }); }
      createDynamicsCompressor() { return audioNode({ threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter() }); }
      createPeriodicWave() { return {}; }
      createBuffer() { return {}; }
      createBufferSource() { return audioNode({ buffer: null, onended: null, start() {} }); }
      createOscillator() {
        (window as unknown as { __netgraphOscillators: number }).__netgraphOscillators += 1;
        return audioNode({ frequency: parameter(), onended: null, setPeriodicWave() {}, start() {}, stop() {} });
      }
      async resume() { this.state = 'running'; this.onstatechange?.(); }
      async close() {}
    }
    (window as unknown as { __netgraphOscillators: number }).__netgraphOscillators = 0;
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: TestAudioContext });
  });
}
