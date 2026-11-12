import { expect, test } from '@playwright/test';
import { visualFixture, visualPacket } from './visualFixtures';
import { openMapOptions } from './mapControls';

test.describe.configure({ retries: 0 });
test.use({ trace: 'off' });

test('manual route windows retain routes while the Auto suggestion follows zoom', async ({page},info) => {
  test.skip(info.project.name !== 'desktop');
  const state=await visualFixture(page,11);state.routes[0]!.lastHeard=state.serverTime-30*60_000;
  await page.addInitScript(()=>window.addEventListener('cartolite-map-ready',e=>Object.assign(window,{flyView:(e as CustomEvent).detail.view}),{once:true}));
  await page.goto('/');await expect(page.locator('#map')).toHaveAttribute('data-eligible-routes','1');
  const refreshes=await page.locator('#map').getAttribute('data-route-window-refreshes');
  await page.evaluate(()=>(window as any).flyView.map.jumpTo({zoom:4}));
  await expect(page.locator('#route-window option[value="auto"]')).toHaveText('Auto · 15m');
  expect(await page.locator('#map').getAttribute('data-route-window-refreshes')).toBe(refreshes);
  await expect(page.locator('#map')).toHaveAttribute('data-eligible-routes','1');
  await openMapOptions(page);await page.locator('#route-window').selectOption('auto');
  await expect(page.locator('#map')).toHaveAttribute('data-eligible-routes','0');
});

test('Fly 3D opens the regular map with one feed and preserves camera, styles and route windows', async ({page},info) => {
  test.skip(info.project.name !== 'desktop'); test.slow();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await visualFixture(page,15.5,true);
  await page.addInitScript(()=>window.addEventListener('cartolite-map-ready',e=>Object.assign(window,{flyView:(e as CustomEvent).detail.view}),{once:true}));
  await page.goto('/fly-3d/');
  const map=page.locator('#map');
  await expect(map).toHaveAttribute('data-flight-state','flying',{timeout:30000});
  await expect(page.locator('html')).not.toHaveAttribute('data-terminal');
  await expect(page.locator('#terminal-map')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-fixture-streams-active','1');
  const initial=await page.evaluate(()=>({camera:localStorage.getItem('cartolite:view:v3:desktop'),pixelRatio:(window as any).flyView.map.getPixelRatio()}));
  const refreshes=await map.getAttribute('data-route-window-refreshes');
  await page.locator('.maplibregl-canvas').focus();await page.keyboard.down('KeyE');await page.waitForTimeout(500);await page.keyboard.up('KeyE');
  expect(await map.getAttribute('data-route-window-refreshes')).toBe(refreshes);
  await visualPacket(page,1,'Text');
  for(const style of ['dark','light','streets']) {
    await openMapOptions(page);await page.locator('#basemap-style').selectOption(style);await page.keyboard.press('Escape');
    await expect(map).toHaveAttribute('data-basemap-style',style);
    await expect(map).toHaveAttribute('data-flight-state','flying');
    await page.screenshot({path:info.outputPath(`fly3d-${style}.png`)});
  }
  await page.getByRole('button',{name:'Exit map flight'}).click();
  expect(await page.evaluate(()=>localStorage.getItem('cartolite:view:v3:desktop'))).toBe(initial.camera);
  expect(await page.evaluate(()=>(window as any).flyView.map.getPixelRatio())).toBe(initial.pixelRatio);
  await expect(page.locator('html')).toHaveAttribute('data-fixture-streams-active','1');
  expect(errors).toEqual([]);
});

test('Fly 3D touch controls stay inside a 320px phone and retain the full-detail choice',async({page},info)=>{
  test.skip(!['mobile','mobile-webkit'].includes(info.project.name));test.slow();
  await page.setViewportSize({width:320,height:720});await visualFixture(page,15.5,true);await page.goto('/fly-3d/');
  await expect(page.locator('#map')).toHaveAttribute('data-flight-state','flying',{timeout:30000});
  const hud=page.locator('#terminal-flight-hud');const box=await hud.boundingBox();expect(box!.x+box!.width).toBeLessThanOrEqual(320);
  await hud.locator('summary').click();await page.getByLabel('Flight detail',{exact:true}).selectOption('full');await hud.locator('summary').click();
  await page.screenshot({path:info.outputPath('fly3d-phone.png')});
  await page.reload();await expect(page.locator('#map')).toHaveAttribute('data-flight-state','flying',{timeout:30000});
  await hud.locator('summary').click();await expect(page.getByLabel('Flight detail',{exact:true})).toHaveValue('full');
  await page.getByRole('button',{name:'Exit map flight'}).click();
});
