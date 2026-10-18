import { expect, test } from '@playwright/test';
import { openDisplay, viewTool } from './dockControls';

test.describe('UI audit Labs', () => {
  test('captures every experiment with full and reduced motion', async ({ page }, info) => {
    test.slow();
    for (const scene of ['packet-pond', 'firefly-meadow', 'mesh-loom', 'little-mesh-villages']) {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto(`/labs/?demo=1&experiment=${scene}`);
      await expect(page.locator('#labs-app')).toHaveAttribute('data-loading', 'false');
      await expect(page.locator('#live-caption')).not.toHaveText('Waiting for live traffic…');
      await page.screenshot({ path: info.outputPath(`${scene}-motion.png`) });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(120);
      await page.screenshot({ path: info.outputPath(`${scene}-reduced.png`) });
    }
  });

  test('pause and reset feedback remains readable while demo packets continue', async ({ page }, info) => {
    await page.goto('/labs/?demo=1&experiment=mesh-loom');
    await expect(page.locator('#labs-app')).toHaveAttribute('data-loading', 'false');
    await page.locator('#pause-button').click();
    await viewTool(page, '#reset-button');
    await page.waitForTimeout(1600);
    await page.screenshot({ path: info.outputPath('paused-reset-feedback.png') });
    await expect(page.locator('#live-caption')).toContainText('Live traffic continues');
    await expect(page.locator('#live-caption')).toContainText('Paused');
    await expect(page.locator('#live-caption')).toHaveAttribute('aria-live', 'off');
    await page.locator('#pause-button').click();
    await expect(page.locator('#live-caption')).toContainText('Resumed');
    await expect(page.locator('#labs-announcement')).toContainText('Resumed');
  });
});


test.describe('UI audit Labs controls', () => {
  test('manual High recovers after automatic economy and irrelevant network options stay saved', async ({ page }, info) => {
    await page.addInitScript(() => {
      localStorage.setItem('cartolite:display:v1', JSON.stringify({ basemap: 'streets', preset: 'dashed', detail: 'complete', quality: 'auto' }));
      Object.assign(window, { slowLab: true });
      const fill = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (...args) {
        if ((window as unknown as { slowLab: boolean }).slowLab && args[0] === 0 && args[1] === 0) {
          const until = performance.now() + 18; while (performance.now() < until) { /* Synthetic expensive frame. */ }
        }
        return fill.apply(this, args);
      };
    });
    await page.goto('/labs/?demo=1&experiment=firefly-meadow');
    await expect(page.locator('#labs-stage')).toHaveAttribute('data-quality-mode', 'economy', { timeout: 20000 });
    await page.evaluate(() => Object.assign(window, { slowLab: false }));
    await openDisplay(page);
    await expect(page.getByLabel('Route style', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Scene style', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Detail level', { exact: true })).toHaveCount(0);
    await page.getByLabel('Graphics quality').selectOption('high');
    await expect(page.locator('#labs-stage')).toHaveAttribute('data-quality-mode', 'high');
    await expect.poll(() => page.locator('#labs-stage canvas').first().evaluate(element => Math.abs((element as HTMLCanvasElement).width / element.clientWidth - Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2)))).toBeLessThan(.02);
    await page.screenshot({ path: info.outputPath('labs-relevant-display.png') });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cartolite:display:v1')!))).toMatchObject({ basemap: 'streets', preset: 'dashed', detail: 'complete', quality: 'high' });
    await page.keyboard.press('Escape'); await viewTool(page, '#info-button');
    await expect(page.locator('#info-dialog')).toContainText('Controls & shortcuts');
    await page.evaluate(() => history.back()); await expect(page.locator('#info-dialog')).toBeHidden();
    await expect(page.locator('#labs-app')).toHaveAttribute('data-loading', 'false');
  });
});
