import { describe, expect, it } from 'vitest';
import { REGION_CANVAS_DRAW_BATCH_VERTICES, regionStyle } from './regionCanvas';

describe('region canvas rendering', () => {
  it('keeps boundary projection work bounded per animation frame', () => {
    expect(REGION_CANVAS_DRAW_BATCH_VERTICES).toBeGreaterThan(0);
    expect(REGION_CANVAS_DRAW_BATCH_VERTICES).toBeLessThanOrEqual(192);
  });

  it('keeps the observatory boundary style restrained across zoom levels', () => {
    const national = regionStyle(3);
    const local = regionStyle(10);

    expect(local.width).toBeGreaterThan(national.width);
    expect(national.opacity).toBeLessThanOrEqual(0.2);
    expect(local.opacity).toBeLessThanOrEqual(0.42);
    expect(local.dash).toBeGreaterThan(national.dash);
  });
});
