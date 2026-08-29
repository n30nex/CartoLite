import { describe, expect, it } from 'vitest';
import { cartoVectorRequestURL, cartoVectorStyle } from './basemap';

describe('CARTO vector basemap', () => {
  it('contains only vector geography and no raster or PNG fallback', () => {
    const style = cartoVectorStyle('test key');
    const serialized = JSON.stringify(style);

    expect(style.sources.carto).toMatchObject({
      type: 'vector',
      url: 'https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json?key=test%20key'
    });
    expect(style.glyphs).toBe('https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf?key=test%20key');
    expect(style.layers.some((layer) => layer.type === 'raster')).toBe(false);
    expect(serialized).not.toContain('.png');
    expect(serialized).not.toContain('dark_all');
  });

  it('adds the browser-visible project key to CARTO PBF requests only once', () => {
    const tile = 'https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/4/3/5.mvt';
    expect(cartoVectorRequestURL(tile, 'test key')).toBe(`${tile}?key=test+key`);
    expect(cartoVectorRequestURL(`${tile}?key=already`, 'test key')).toBe(`${tile}?key=already`);
    expect(cartoVectorRequestURL('https://example.com/map.mvt', 'test key')).toBe('https://example.com/map.mvt');
  });

  it('keeps all required calm-observatory geography layers', () => {
    const ids = cartoVectorStyle().layers.map((layer) => layer.id);
    expect(ids).toEqual(expect.arrayContaining([
      'basemap-landcover',
      'basemap-water',
      'basemap-country-boundary',
      'basemap-region-boundary',
      'basemap-major-roads',
      'basemap-place-labels'
    ]));
  });
});
