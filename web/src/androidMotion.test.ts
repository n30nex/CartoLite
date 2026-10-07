import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('Android display defaults', () => {
  it.each([
    ['Mozilla/5.0 CartoLiteAndroid/1.0.0', 'full'],
    ['Mozilla/5.0 CartoLiteAndroid/1.1.0', 'full'],
    ['Mozilla/5.0 (Linux; Android 16) Chrome/140.0', 'system'],
  ])('uses the appropriate default for %s', async (userAgent, motion) => {
    vi.stubGlobal('navigator', { userAgent });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    vi.resetModules();
    const { DEFAULT_DISPLAY, DISPLAY_STORAGE_KEY, loadDisplayPreferences, normalizeDisplay, prefersReducedMotion } = await import('./displayPreferences');
    expect(DEFAULT_DISPLAY).toMatchObject({ motion, effects: 'spectacle', quality: 'auto' });
    expect(prefersReducedMotion()).toBe(motion === 'system');
    expect(loadDisplayPreferences({ getItem: () => null }).motion).toBe(motion);
    expect(loadDisplayPreferences({ getItem: () => '{broken' }).motion).toBe(motion);
    expect(loadDisplayPreferences({ getItem: () => { throw new Error('storage blocked'); } }).motion).toBe(motion);
    expect(normalizeDisplay({ motion: 'invalid' }).motion).toBe(motion);
    const legacy = { basemap: 'light', theme: 'dark', routeOpacity: 0.55 };
    expect(loadDisplayPreferences({ getItem: key => key === DISPLAY_STORAGE_KEY ? null : JSON.stringify(legacy) }))
      .toMatchObject({ basemap: 'light', theme: 'dark', opacity: 0.55, motion });
  });

  it('preserves saved motion, quality and style choices inside the Android shell', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 CartoLiteAndroid/1.0.0' });
    vi.resetModules();
    const { loadDisplayPreferences } = await import('./displayPreferences');
    for (const motion of ['full', 'system', 'reduced']) {
      const saved = { motion, effects: 'calm', quality: 'economy', theme: 'light', width: 3 };
      expect(loadDisplayPreferences({ getItem: () => JSON.stringify(saved) })).toMatchObject(saved);
    }
  });
});
