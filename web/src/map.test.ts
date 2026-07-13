import { describe, expect, it } from 'vitest';
import { darkStyle } from './map';

describe('darkStyle', () => {
  it('uses local fonts without an external glyph dependency', () => {
    expect(darkStyle().glyphs).toBeUndefined();
  });
});
