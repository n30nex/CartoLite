import { expect, test } from '@playwright/test';
import { visualFixture, visualPacket } from './visualFixtures';

for (const path of ['/', '/netgraph/']) {
  test(`reconnect catch-up stays silent and does not animate on ${path}`, async ({page}) => {
    await visualFixture(page);
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-fixture-stream', 'ready');
    await expect(page.locator(path === '/' ? '#map' : '#netgraph-stage')).toHaveAttribute('data-render-state', 'idle');
    await page.locator('#sound-button').click();
    await page.locator('#sound-toggle').click();
    await expect(page.locator('#sound-state')).toHaveText('On');
    await page.keyboard.press('Escape');
    const renderer = page.locator(path === '/' ? '#packet-canvas' : '#netgraph-stage');
    const before = await renderer.getAttribute('data-last-packet-kind');
    const scheduledBefore = Number(await page.locator('#sound-activity').getAttribute('data-scheduled'));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('visual-hello', {detail:{bootId:'visual-fixture',seq:2}})));
    await visualPacket(page, 1, 'Trace');
    await visualPacket(page, 2, 'Advert');
    expect(await renderer.getAttribute('data-last-packet-kind')).toBe(before);
    expect(Number(await page.locator('#sound-activity').getAttribute('data-scheduled'))).toBe(scheduledBefore);
    await visualPacket(page, 3, 'Text');
    await expect(renderer).toHaveAttribute('data-last-packet-kind', 'Text');
    await expect.poll(() => page.locator('#sound-activity').getAttribute('data-scheduled').then(Number)).toBeGreaterThan(scheduledBefore);
  });
}

test('Labs catch-up does not announce old observations as a live packet', async ({page}) => {
  await visualFixture(page);
  await page.goto('/labs/?experiment=mesh-loom');
  await expect(page.locator('#labs-app')).toHaveAttribute('data-loading', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-fixture-stream', 'ready');
  const caption = page.locator('#live-caption');
  const before = await caption.textContent();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('visual-hello', {detail:{bootId:'visual-fixture',seq:1}})));
  await visualPacket(page, 1, 'Trace');
  await expect(caption).toHaveText(before!);
  await visualPacket(page, 2, 'Text');
  await expect(caption).toContainText('Text');
});
