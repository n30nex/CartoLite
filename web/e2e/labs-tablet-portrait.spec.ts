import { expect, test } from '@playwright/test';

test('keeps the Labs tablet portrait shell clear and touch sized', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/labs/?demo=1&experiment=packet-pond');
  await expect(page.locator('#labs-app')).toHaveAttribute('data-loading', 'false');
  await expect(page.locator('#labs-stage canvas')).toHaveCount(2);
  await expect(page.locator('#labs-stage')).toHaveAttribute('data-assets', 'ready');
  await expect(page.locator('#labs-stage')).toHaveAttribute('data-reactive-water', 'true');

  const targets = await page.locator('.labs-controls button, .labs-controls select, .labs-back').evaluateAll((elements) => elements.map((element) => {
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
  await page.locator('#experiment-select').selectOption('little-mesh-villages');
  await expect(page.locator('#labs-stage')).toHaveAttribute('aria-label', 'Little Mesh Villages live traffic experiment');
  await expect(page.locator('.village-truth')).toBeVisible();
  await expect(page.locator('#labs-stage')).toHaveAttribute('data-settlement-columns', /[2-9][0-9]*/);
  expect(consoleErrors).toEqual([]);
});
