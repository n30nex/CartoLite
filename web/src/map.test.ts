import { describe, expect, it } from 'vitest';
import { darkStyle } from './map';

describe('darkStyle', () => {
  it('loads PBF glyph ranges from the MapLibre demo endpoint', () => {
    expect(darkStyle().glyphs).toBe('https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf');
  });
});
