import { describe, expect, it } from 'vitest';
import { REGION_CANVAS_DRAW_BATCH_VERTICES, regionStyle, webMercatorPosition } from './regionCanvas';

describe('region canvas rendering', () => {
  it('keeps boundary projection work bounded per animation frame', () => {
    expect(REGION_CANVAS_DRAW_BATCH_VERTICES).toBeGreaterThan(0);
    expect(REGION_CANVAS_DRAW_BATCH_VERTICES).toBeLessThanOrEqual(1_024);
  });

  it('projects the zero-pitch map directly in normalized Web Mercator space', () => {
    expect(webMercatorPosition([-180, 0])).toEqual([0, 0.5]);
    expect(webMercatorPosition([0, 0])).toEqual([0.5, 0.5]);
    expect(webMercatorPosition([180, 0])).toEqual([1, 0.5]);
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
