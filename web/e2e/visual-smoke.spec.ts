import { expect, test } from '@playwright/test';

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
  await expect.poll(async () => page.locator('#packet-canvas').evaluate((canvas) => {
    const element = canvas as HTMLCanvasElement;
    const context = element.getContext('2d');
    if (!context || element.width === 0 || element.height === 0) return false;
    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] !== 0) return true;
    }
    return false;
  }), { message: 'packet animation canvas should receive a live frame', timeout: 15_000 }).toBe(true);
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
  await expect(page.locator('#reset-button')).toBeVisible();
  await page.locator('#follow-button').click();
  await expect(page.locator('#follow-button')).toHaveAttribute('aria-pressed', 'true');
});
