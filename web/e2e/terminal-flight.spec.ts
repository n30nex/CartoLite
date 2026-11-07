import { expect, test, type Page } from '@playwright/test';
import { visualFixture, visualPacket } from './visualFixtures';
import { openMapOptions } from './mapControls';

test.describe.configure({ retries: 0 });
test.use({ trace: 'off' });
test.afterEach(async({page},info)=>{
  if(!page.isClosed())await info.attach('flight-render-diagnostics',{body:JSON.stringify(await page.evaluate(()=>({timing:(window as any).flightTiming,metrics:{...document.querySelector<HTMLElement>('#map')?.dataset}}))),contentType:'application/json'});
});

async function fixture(page: Page) {
  const state=await visualFixture(page,15.5,true);
  state.nodes[1]!.lng=-80.348;state.nodes[1]!.lat=43.451;
  state.nodes[2]!.lng=-80.352;state.nodes[2]!.lat=43.451;
  await page.route('**/api/state',route=>route.fulfill({json:state}));
  await page.addInitScript(()=>window.addEventListener('cartolite-map-ready',event=>{
    const {view,animator}=(event as CustomEvent).detail;
    const timing={frames:[] as number[],longTasks:[] as number[]};let started=0;
    Object.assign(window,{flightView:view,flightAnimator:animator,flightTiming:timing});
    view.map.on('renderstart',()=>started=performance.now());
    view.map.on('render',()=>{timing.frames.push(performance.now()-started);if(timing.frames.length>60)timing.frames.shift();});
    if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>{for(const entry of list.getEntries())timing.longTasks.push(entry.duration);timing.longTasks=timing.longTasks.slice(-40);}).observe({type:'longtask'});
  },{once:true}));
  await page.goto('/terminal/');
  await expect(page.locator('#map')).toHaveAttribute('data-terminal-renderer','webgl2',{timeout:20000});
  await expect(page.locator('#map')).toHaveAttribute('data-render-state','idle');
  await expect(page.locator('#terminal-flight-button')).toBeEnabled();
}

async function enter(page: Page) {
  await page.locator('#terminal-flight-button').click();
  await expect(page.locator('#map')).toHaveAttribute('data-flight-state','flying',{timeout:20000});
  await expect(page.locator('#map')).toHaveAttribute('data-building-extrusions','true');
  await expect(page.locator('#map')).toHaveAttribute('data-flight-beacons','3');
}

test('@terminal-flight Terminal flies through ASCII buildings and polygon nodes, then restores the map',async({page},info)=>{
  test.skip(info.project.name!=='desktop');
  test.slow(); // Two terrain loads and inspection, using Actions software graphics.
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await fixture(page);
  const saved=await page.evaluate(()=>{const map=(window as any).flightView.map;return {center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),layers:localStorage.getItem('cartolite:terminal-ui:v1'),profile:localStorage.getItem('cartolite:terminal-display:v1'),camera:localStorage.getItem('cartolite:view:v3:desktop')};});
  await enter(page);
  expect(await page.evaluate(()=>{const map=(window as any).flightView.map;return {clamped:map.getCenterClampedToGround(),layer:map.getLayer('terminal-flight-nodes').type,height:map.getPaintProperty('terminal-flight-nodes','fill-extrusion-height')};})).toEqual({clamped:false,layer:'fill-extrusion',height:36});
  await page.screenshot({path:info.outputPath('terminal-flight-buildings.png')});
  const before=Number(await page.locator('#map').getAttribute('data-flight-lng'));
  await page.locator('.maplibregl-canvas').focus();await page.keyboard.down('KeyD');await page.waitForTimeout(500);await page.keyboard.up('KeyD');
  await expect.poll(()=>page.locator('#map').getAttribute('data-flight-lng').then(Number)).toBeGreaterThan(before);
  const altitude=Number(await page.locator('#map').getAttribute('data-flight-altitude'));
  await page.keyboard.down('KeyE');await page.waitForTimeout(400);await page.keyboard.up('KeyE');
  await expect.poll(()=>page.locator('#map').getAttribute('data-flight-altitude').then(Number)).toBeGreaterThan(altitude);
  await page.waitForTimeout(250);const frames=await page.locator('#map').getAttribute('data-flight-frames');await page.waitForTimeout(600);
  expect(await page.locator('#map').getAttribute('data-flight-frames')).toBe(frames);
  // Find retains the flight camera; typing must never move it.
  await page.locator('#find-button').click();await page.locator('#node-search').fill('Visual Bravo');
  expect(await page.locator('#map').getAttribute('data-flight-frames')).toBe(frames);
  await page.locator('.node-search-result').first().click();
  await expect(page.locator('#map')).toHaveAttribute('data-flight-state','flying',{timeout:20000});
  await expect(page.locator('#map')).toHaveAttribute('data-selected-node-id','visual-b');
  await page.keyboard.press('Escape');
  await page.locator('#terminal-flight-hud [data-exit]').click();
  await expect(page.locator('#terminal-flight-button')).toHaveAttribute('aria-pressed','false');
  const restored=await page.evaluate(()=>{const map=(window as any).flightView.map;return {center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),layers:localStorage.getItem('cartolite:terminal-ui:v1'),profile:localStorage.getItem('cartolite:terminal-display:v1'),camera:localStorage.getItem('cartolite:view:v3:desktop')};});
  expect(restored).toEqual(saved);expect(errors).toEqual([]);
  expect(await page.locator('html').getAttribute('data-fixture-streams-active')).toBe('1');
});

test('@terminal-flight Terminal looks above the horizon without mirrored packet ghosts and stops hidden input',async({page},info)=>{
  test.skip(info.project.name!=='desktop');
  test.slow(); // Exercise native terrain across the horizon, not a timing benchmark.
  await fixture(page);await enter(page);
  await page.mouse.move(1000,300);await page.mouse.down();await page.mouse.move(1000,760,{steps:8});await page.mouse.up();
  await expect.poll(()=>page.locator('#map').getAttribute('data-flight-pitch').then(Number)).toBeGreaterThan(110);
  await visualPacket(page,1,'Text');
  const geometry=await page.evaluate(()=>{const animator=(window as any).flightAnimator;return animator.projection.projectEndpoint({id:'visual-a',lng:-80.35,lat:43.45});});
  expect(geometry.visible).toBe(false);
  await page.screenshot({path:info.outputPath('terminal-flight-look-up.png')});
  await page.locator('.maplibregl-canvas').focus();await page.keyboard.down('KeyW');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  const pos=await page.locator('#map').getAttribute('data-flight-lat');await page.waitForTimeout(700);await page.keyboard.up('KeyW');
  expect(await page.locator('#map').getAttribute('data-flight-lat')).toBe(pos);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(200);expect(await page.locator('#map').getAttribute('data-flight-lat')).toBe(pos);
  await page.locator('#terminal-flight-hud [data-exit]').click();
});

test('@terminal-flight Terminal has an explicit flat fallback and keeps the existing display presets',async({page},info)=>{
  test.skip(info.project.name!=='desktop');
  await fixture(page);
  await page.route('https://tiles.mapterhorn.com/fixture/**',route=>route.abort());
  await enter(page);await expect(page.locator('#map')).toHaveAttribute('data-terminal-flight','flat');
  await expect(page.locator('.flight-state')).toContainText('terrain unavailable');
  await openMapOptions(page);await page.getByLabel('Terminal palette',{exact:true}).selectOption('ega');await page.keyboard.press('Escape');
  await expect(page.locator('#map')).toHaveAttribute('data-terminal-renderer','webgl2');
  await expect(page.locator('#terminal-flight-button')).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:info.outputPath('terminal-flight-ega.png')});
  await page.locator('#terminal-flight-hud [data-exit]').click();
});

test('@terminal-flight Terminal touch flight fits 320px and releases held controls',async({page},info)=>{
  test.skip(info.project.name!=='mobile-webkit');
  await page.setViewportSize({width:320,height:720});await fixture(page);await enter(page);
  const hud=page.locator('#terminal-flight-hud'),button=page.locator('[data-move="KeyE"]');
  const bounds=await hud.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(320);
  expect(await hud.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  const altitude=Number(await page.locator('#map').getAttribute('data-flight-altitude'));
  const pad=await button.boundingBox();await page.mouse.move(pad!.x+pad!.width/2,pad!.y+pad!.height/2);await page.mouse.down();
  await page.waitForTimeout(350);await page.mouse.move(319,710);await page.mouse.up();
  await expect.poll(()=>page.locator('#map').getAttribute('data-flight-altitude').then(Number)).toBeGreaterThan(altitude);
  await page.waitForTimeout(150);const settled=await page.locator('#map').getAttribute('data-flight-altitude');await page.waitForTimeout(400);
  expect(await page.locator('#map').getAttribute('data-flight-altitude')).toBe(settled);
  await page.screenshot({path:info.outputPath('terminal-flight-phone.png')});
  const pose=await page.locator('#map').getAttribute('data-flight-lng');
  await page.setViewportSize({width:720,height:320});await page.waitForTimeout(400);
  expect(await page.locator('#map').getAttribute('data-flight-lng')).toBe(pose);
  const rotated=await hud.boundingBox();expect(rotated!.y+rotated!.height).toBeLessThan(280);
  await page.screenshot({path:info.outputPath('terminal-flight-landscape.png')});
  await page.locator('#terminal-flight-hud [data-exit]').click();
});

test('@terminal-flight Terminal recovers its flight camera and ASCII node layer after graphics loss',async({page},info)=>{
  test.skip(info.project.name!=='desktop');
  test.slow(); // Recreate native terrain and ASCII shaders on software graphics.
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await fixture(page);await enter(page);
  const pose=await page.locator('#map').getAttribute('data-flight-lng');
  await page.evaluate(()=>{
    const gl=(window as any).flightView.map.getCanvas().getContext('webgl2'),extension=gl.getExtension('WEBGL_lose_context');
    if(!extension)throw Error('Context-loss fixture unavailable');
    extension.loseContext();setTimeout(()=>extension.restoreContext(),120);
  });
  await expect(page.locator('#map')).toHaveAttribute('data-route-context-restores','1');
  await expect(page.locator('#map')).toHaveAttribute('data-terminal-renderer','webgl2');
  await expect.poll(()=>page.evaluate(()=>Boolean((window as any).flightView.map.getLayer('terminal-flight-nodes')))).toBe(true);
  expect(await page.locator('#map').getAttribute('data-flight-lng')).toBe(pose);
  await page.locator('.maplibregl-canvas').focus();await page.keyboard.down('KeyD');await page.waitForTimeout(350);await page.keyboard.up('KeyD');
  await expect.poll(()=>page.locator('#map').getAttribute('data-flight-lng').then(Number)).toBeGreaterThan(Number(pose));
  await visualPacket(page,1,'Text');
  await page.screenshot({path:info.outputPath('terminal-flight-recovered.png')});
  await page.locator('#terminal-flight-hud [data-exit]').click();expect(errors).toEqual([]);
});
