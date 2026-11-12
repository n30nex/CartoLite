import { expect, test } from '@playwright/test';
import { visualFixture } from './visualFixtures';

// Explicit diagnostics: never substitutes for the normal rendering/scale gates.
test('Fly 3D bounded synthetic camera profile', async ({ page }, info) => {
  test.skip(process.env.CARTOLITE_FLIGHT_PROFILE !== '1' || info.project.name !== 'desktop');
  test.setTimeout(240_000);
  const state = await visualFixture(page, 15.5, true), now = Date.now();
  if (process.env.CARTOLITE_FLIGHT_DETAIL) await page.addInitScript(detail => localStorage.setItem('cartolite:flight-detail:v1', detail), process.env.CARTOLITE_FLIGHT_DETAIL);
  state.nodes = Array.from({ length: 1024 }, (_, i) => ({
    id: `profile-${i}`, label: `Radio ${i}`, role: 'repeater' as const, observer: false, lastSeen: now,
    lng: -80.35 + (i % 32 - 16) * .00015, lat: 43.45 + (Math.floor(i / 32) - 16) * .00015,
  }));
  state.routes = Array.from({ length: 7000 }, (_, i) => ({
    id: `profile-hop-${i}`, fromId: state.nodes[i % 1024]!.id,
    toId: state.nodes[(i % 1024 + 1 + Math.floor(i / 1024) * 31) % 1024]!.id,
    packetCount: 4, lastHeard: now, intensity: 2, traffic: 4, lastKind: 'Text' as const,
  }));
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.addInitScript(() => {
    const stats = { active: false, skipAscii: false, counts: {} as Record<string, { calls: number; ms: number }>, gaps: [] as number[], last: 0 };
    (window as any).flightProfile = stats;
    const wrap = (owner: any, method: string, name = method) => {
      const original = owner[method]; if (typeof original !== 'function') return;
      owner[method] = function (...args: unknown[]) {
        if (!stats.active) return original.apply(this, args);
        const started = performance.now();
        try { return original.apply(this, args); }
        finally { const row = stats.counts[name] ??= { calls: 0, ms: 0 }; row.calls++; row.ms += performance.now() - started; }
      };
    };
    wrap(WebGL2RenderingContext.prototype, 'getParameter', 'gl.getParameter');
    window.addEventListener('cartolite-map-ready', event => {
      const { view } = (event as CustomEvent).detail, map = view.map;
      (window as any).profileMap = map; (window as any).profileView = view;
      for (const name of ['jumpTo', 'project', 'queryRenderedFeatures', 'queryTerrainElevation', 'isSourceLoaded', 'getPaintProperty', 'setPaintProperty', 'setLayoutProperty', 'setFilter', 'setFeatureState']) wrap(map, name);
      const add = map.addLayer.bind(map);
      map.addLayer = (layer: any, ...args: any[]) => {
        if (layer.id === 'terminal-graphics') {
          const render = layer.render;
          layer.render = function (...args: any[]) { if (!stats.skipAscii) return render.apply(this, args); };
        }
        return add(layer, ...args);
      };
      map.on('render', () => { const now = performance.now(); if (stats.active && stats.last) stats.gaps.push(now - stats.last); stats.last = now; });
    }, { once: true });
  });
  await page.goto(process.env.CARTOLITE_PROFILE_PAGE || '/terminal/');
  await expect(page.locator('#map')).toHaveAttribute('data-rendered-route-segments', '7000', { timeout: 90_000 });
  if (await page.locator('#terminal-flight-button').getAttribute('aria-pressed') !== 'true') await page.locator('#terminal-flight-button').click();
  await expect(page.locator('#map')).toHaveAttribute('data-flight-state', 'flying', { timeout: 60_000 });
  await page.waitForTimeout(1500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  for (const phase of ['full', 'without-ascii-pass', 'without-history']) {
    await page.evaluate(phase => { const p = (window as any).flightProfile; p.skipAscii = phase !== 'full'; (window as any).profileView.setRoutesVisible(phase !== 'without-history'); p.counts = {}; p.gaps = []; p.last = 0; p.active = true; }, phase);
    await cdp.send('Profiler.start');
    await page.locator('.maplibregl-canvas').focus();
    await page.keyboard.down('KeyD'); await page.waitForTimeout(8000); await page.keyboard.up('KeyD');
    const profile = await cdp.send('Profiler.stop');
    const stats = await page.evaluate(() => {
      const p = (window as any).flightProfile; p.active = false;
      return { counts: p.counts, gaps: p.gaps, pixelRatio: (window as any).profileMap.getPixelRatio(), metrics: { ...document.querySelector<HTMLElement>('#map')!.dataset } };
    });
    await info.attach(`flight-${phase}`, { body: JSON.stringify(stats), contentType: 'application/json' });
    await info.attach(`flight-${phase}.cpuprofile`, { body: JSON.stringify(profile.profile), contentType: 'application/json' });
  }
  await page.evaluate(() => { (window as any).flightProfile.skipAscii = false; (window as any).profileView.setRoutesVisible(true); });
  await page.screenshot({ path: info.outputPath('flight-profile.png') });
});
