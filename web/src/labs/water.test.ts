import { describe, expect, it } from 'vitest';
import { MAX_REACTIVE_WATER_RIPPLES, WATER_FRAGMENT_SHADER, packWaterRipples } from './water';

describe('reactive WebGL water', () => {
  it('packs only active newest ripples into bounded normalized shader uniforms', () => {
    const ripples = Array.from({ length: 22 }, (_, index) => ({
      x: 50 + index,
      y: 25,
      start: 1_000 + index,
      duration: 2_000,
      strength: 1,
    }));
    ripples.push({ x: 0, y: 0, start: 9_000, duration: 200, strength: 1 });
    const packed = packWaterRipples(ripples, 1_100, 200, 100);
    expect(packed.count).toBe(MAX_REACTIVE_WATER_RIPPLES);
    expect(packed.values).toHaveLength(MAX_REACTIVE_WATER_RIPPLES * 4);
    expect(packed.values[0]).toBeCloseTo(71 / 200);
    expect(packed.values[1]).toBeCloseTo(0.75);
    expect([...packed.values].every(Number.isFinite)).toBe(true);
  });

  it('contains procedural waves, texture detail, and packet ripple uniforms', () => {
    expect(WATER_FRAGMENT_SHADER).toContain(`u_ripples[${MAX_REACTIVE_WATER_RIPPLES}]`);
    expect(WATER_FRAGMENT_SHADER).toContain('texture(u_texture');
    expect(WATER_FRAGMENT_SHADER).toContain('distance_to_center');
    expect(WATER_FRAGMENT_SHADER).toContain('caustic');
  });
});
