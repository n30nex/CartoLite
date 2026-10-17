import { expect, test } from '@playwright/test';
import { viewTool } from './dockControls';

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
