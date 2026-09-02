import { expect, test } from '@playwright/test';

test('Labs supports direct links, bounded experiment switching, and synthetic demo traffic', async ({ page }) => {
  const apiRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/labs/?demo=1&experiment=mesh-loom');
  await expect(page.locator('#labs-app')).toHaveAttribute('data-loading', 'false');
  await expect(page.locator('#experiment-select')).toHaveValue('mesh-loom');
  await expect(page.locator('#experiment-select option[value="northern-lights"]')).toHaveCount(0);
  await expect(page.locator('#labs-status-text')).toHaveText('Demo · synthetic');
  await expect(page.locator('#labs-stage')).toHaveAttribute('aria-label', 'Mesh Loom live traffic experiment');
  await expect(page.locator('#labs-stage canvas')).toHaveCount(1);
  await expect(page.locator('#live-caption')).not.toHaveText('Waiting for live traffic…', { timeout: 5_000 });
  expect(apiRequests, 'hidden demo mode must not contact live APIs').toEqual([]);

  await page.locator('#experiment-select').selectOption('packet-pond');
  await expect(page.locator('#labs-stage')).toHaveAttribute('aria-label', 'Packet Pond live traffic experiment');
  await expect(page.locator('#labs-stage canvas')).toHaveCount(1);
  await expect(page.locator('#labs-stage')).toHaveAttribute('data-assets', 'ready');

  await page.locator('#experiment-select').selectOption('firefly-meadow');
  await expect(page.locator('#labs-stage')).toHaveAttribute('aria-label', 'Firefly Meadow live traffic experiment');
  await expect(page.locator('#labs-stage canvas')).toHaveCount(1);
  await expect(page.locator('#labs-stage')).toHaveAttribute('data-assets', 'ready');

  await page.locator('#experiment-select').selectOption('little-mesh-villages');
  await expect(page.locator('#labs-stage')).toHaveAttribute('aria-label', 'Little Mesh Villages live traffic experiment');
  await expect(page.locator('#labs-stage canvas')).toHaveCount(1);
  await expect(page.locator('.village-truth')).toContainText('not real-world population or permanent network coverage');

  await page.locator('#info-button').click();
  await expect(page.locator('#info-dialog')).toContainText('same sanitized live state and event stream');
  await expect(page.locator('#info-dialog')).toContainText('never receives message contents, keys, raw paths, or MQTT credentials');
  await page.locator('#info-close').click();
  await expect(page.locator('#info-dialog')).toBeHidden();
  await expect(page.locator('.labs-back')).toHaveAttribute('href', '/');
  expect(consoleErrors).toEqual([]);
});

test('Labs controls stay usable on small screens and respect reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/labs/?demo=1&experiment=firefly-meadow');
  await expect(page.locator('#labs-app')).toHaveAttribute('data-loading', 'false');

  const targets = await page.locator('.labs-controls button:visible, .labs-controls select:visible, .labs-back:visible').evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  }));
  for (const target of targets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }

  const overflow = await page.locator('.labs-topbar, .labs-controls, .live-caption').evaluateAll((elements) => elements.some((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.left < -0.5 || bounds.right > innerWidth + 0.5 || bounds.top < -0.5 || bounds.bottom > innerHeight + 0.5;
  }));
  expect(overflow).toBe(false);
  await page.locator('#pause-button').click();
  await expect(page.locator('#pause-button')).toHaveText('Resume');
  await expect(page.locator('#pause-button')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#reset-button').click();
  await expect(page.locator('#live-caption')).toContainText('Live traffic continues');
});
