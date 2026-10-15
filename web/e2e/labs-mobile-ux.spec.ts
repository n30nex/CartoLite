import { expect, test } from '@playwright/test';
import { openViewMenu, openDisplay, viewTool } from './dockControls';

test('phone Labs keeps scenes, menus and captions compact', async ({page},info) => {
  test.skip(info.project.name === 'desktop');
  await page.setViewportSize(info.project.name.includes('landscape') ? {width:568,height:320} : {width:320,height:640});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/labs/?demo=1&experiment=mesh-loom');
  await expect(page.locator('#labs-app')).toHaveAttribute('data-loading','false');
  const dock=(await page.locator('.labs-controls').boundingBox())!;
  expect(dock.height).toBeLessThanOrEqual(64);
  const legend=(await page.locator('.loom-legend').boundingBox())!;
  expect(legend.height).toBeLessThan(100);
  expect(legend.y+legend.height).toBeLessThan(dock.y);
  await page.screenshot({path:info.outputPath('phone-mesh-loom.png')});
  for(const id of ['packet-pond','firefly-meadow','little-mesh-villages']) {
    await page.locator('#experiment-select').selectOption(id);
    await expect(page.locator('#labs-app')).toHaveAttribute('data-loading','false');
    await expect(page.locator('#labs-stage canvas').first()).toBeVisible();
  }
  await openViewMenu(page); await page.getByRole('button',{name:'Close view menu'}).click();
  await expect(page.locator('#view-button')).toBeFocused();
  await openDisplay(page); await expect(page.locator('#labs-display')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>history.state?.cartolitePanel)).toBe('labs-display');
  await page.goBack(); await expect(page.locator('#labs-display')).toBeHidden();
  await viewTool(page,'#info-button'); await expect(page.locator('#info-dialog')).toBeVisible();
  await page.locator('#info-close').click(); await expect(page.locator('#view-button')).toBeFocused();
  expect(new URL(page.url()).searchParams.get('experiment')).toBe('little-mesh-villages');
});
