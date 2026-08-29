import { beforeEach, describe, expect, it } from 'vitest';
import { loadSavedView, saveView, viewClass, viewStorageKey } from './preferences';

describe('viewport preferences', () => {
  beforeEach(() => localStorage.clear());

  it('uses separate versioned storage for desktop and mobile views', () => {
    const desktop = { center: [-79.38, 43.65] as [number, number], zoom: 9 };
    const mobile = { center: [-123.12, 49.28] as [number, number], zoom: 7 };
    saveView(localStorage, 'desktop', desktop);
    saveView(localStorage, 'mobile', mobile);

    expect(viewStorageKey('desktop')).not.toBe(viewStorageKey('mobile'));
    expect(loadSavedView(localStorage, 'desktop')).toEqual(desktop);
    expect(loadSavedView(localStorage, 'mobile')).toEqual(mobile);
  });

  it('classifies portrait and landscape phones by their short edge', () => {
    expect(viewClass(390, 844)).toBe('mobile');
    expect(viewClass(620, 900)).toBe('mobile');
    expect(viewClass(844, 390)).toBe('mobile');
    expect(viewClass(1280, 720)).toBe('desktop');
  });

  it('fails closed on malformed or out-of-bounds saved views', () => {
    localStorage.setItem(viewStorageKey('mobile'), JSON.stringify({ center: [0, 0], zoom: 20 }));
    expect(loadSavedView(localStorage, 'mobile')).toBeNull();
  });
});
