import { expect, test, type Page } from '@playwright/test';
import { visualFixture, visualPacket } from './visualFixtures';

const views = [
  { path: '/', app: '#app', renderer: '#packet-canvas' },
  { path: '/netgraph/', app: '#netgraph-app', renderer: '#netgraph-stage' },
  { path: '/labs/?experiment=mesh-loom', app: '#labs-app', renderer: null },
];

async function androidFixture(page: Page): Promise<void> {
  await visualFixture(page);
  // The published 1.0 shell already supplies this marker before page startup.
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', {
    get: () => 'Mozilla/5.0 (Linux; Android 16) CartoLiteAndroid/1.0.0',
  }));
}

async function statusAnimation(page: Page): Promise<number> {
  return page.evaluate(() => {
    const dot = document.querySelector<HTMLElement>('.status-dot')!;
    dot.parentElement!.dataset.state = 'reconnecting';
    return Number.parseFloat(getComputedStyle(dot).animationDuration);
  });
}

for (const view of views) {
  test(`Android defaults to animated Spectacle despite reduced system motion on ${view.path}`, async ({ page }, info) => {
    await androidFixture(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(view.path);
    if (view.path === '/') await expect(page.locator('#map')).toHaveAttribute('data-render-state', 'idle');
    else await expect(page.locator(view.app)).toHaveAttribute('data-loading', 'false');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
    await expect(page.locator('html')).toHaveAttribute('data-effects', 'spectacle');
    if (view.renderer) await expect(page.locator(view.renderer)).toHaveAttribute('data-motion-mode', 'animated');
    expect(await statusAnimation(page)).toBeGreaterThan(0.1);
    await expect(page.locator('html')).toHaveAttribute('data-fixture-stream', 'ready');
    await visualPacket(page, 1, 'Text');
    if (view.renderer) await expect(page.locator(view.renderer)).toHaveAttribute('data-last-packet-kind', 'Text');
    else await expect(page.locator('#live-caption')).toContainText('Text');
    await page.screenshot({ path: info.outputPath('android-full-motion.png') });
  });
}

test('Android preserves Reduced and System choices across views and can switch to Full immediately', async ({ page }) => {
  await androidFixture(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    if (!localStorage.getItem('cartolite:display:v1')) {
      localStorage.setItem('cartolite:display:v1', JSON.stringify({ motion: 'reduced', effects: 'calm', width: 3 }));
    }
  });
  await page.goto('/netgraph/');
  const stage = page.locator('#netgraph-stage');
  await expect(stage).toHaveAttribute('data-motion-mode', 'static');
  await page.getByRole('button', { name: 'Display settings', exact: true }).click();
  const motion = page.getByLabel('Motion preference');
  await expect(motion).toHaveValue('reduced');
  await expect(page.getByLabel('Effects intensity')).toHaveValue('calm');
  await motion.selectOption('full');
  await expect(stage).toHaveAttribute('data-motion-mode', 'animated');
  expect(await statusAnimation(page)).toBeGreaterThan(0.1);
  await motion.selectOption('system');
  await expect(stage).toHaveAttribute('data-motion-mode', 'static');
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.getByRole('button', { name: 'Display settings', exact: true }).click();
  await expect(page.getByLabel('Motion preference')).toHaveValue('system');
  await page.getByLabel('Motion preference').selectOption('full');
  await expect(page.locator('#packet-canvas')).toHaveAttribute('data-motion-mode', 'animated');
  await page.keyboard.press('Escape');
  // A map created under System/Reduced must animate after switching to Full.
  await page.locator('#reset-button').click();
  await expect(page.locator('#map')).toHaveAttribute('data-camera-moving', 'true');
  await expect(page.locator('#map')).toHaveAttribute('data-camera-moving', 'false');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  await expect(page.locator('html')).toHaveAttribute('data-effects', 'calm');
  await page.goto('/labs/?experiment=mesh-loom');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
});

test('the ordinary browser still follows system motion unless Full is selected', async ({ page }) => {
  await visualFixture(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/netgraph/');
  await expect(page.locator('#netgraph-stage')).toHaveAttribute('data-motion-mode', 'static');
  await page.getByRole('button', { name: 'Display settings', exact: true }).click();
  await expect(page.getByLabel('Motion preference')).toHaveValue('system');
  await page.getByLabel('Motion preference').selectOption('full');
  await expect(page.locator('#netgraph-stage')).toHaveAttribute('data-motion-mode', 'animated');
  expect(await statusAnimation(page)).toBeGreaterThan(0.1);
  await page.getByLabel('Motion preference').selectOption('reduced');
  await expect(page.locator('#netgraph-stage')).toHaveAttribute('data-motion-mode', 'static');
});
