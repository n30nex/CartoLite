import { describe, expect, it } from 'vitest';
import { latticeStyle, ROUTE_LATTICE_DRAW_BATCH } from './routeLattice';

describe('route lattice canvas styling', () => {
  const route = { width: 1.2, glowWidth: 2.8, opacity: 0.7 };

  it('keeps each animation-frame draw batch bounded', () => {
    expect(ROUTE_LATTICE_DRAW_BATCH).toBeGreaterThan(0);
    expect(ROUTE_LATTICE_DRAW_BATCH).toBeLessThanOrEqual(64);
  });

  it('adds local-detail weight and selected-node emphasis without changing route data', () => {
    const national = latticeStyle(route, 3.4, false);
    const local = latticeStyle(route, 10, false);
    const focused = latticeStyle(route, 10, true);

    expect(local.coreWidth).toBeGreaterThan(national.coreWidth);
    expect(local.glowWidth).toBeGreaterThan(national.glowWidth);
    expect(focused.coreWidth).toBeGreaterThan(local.coreWidth);
    expect(focused.glowWidth).toBeGreaterThan(local.glowWidth);
    expect(focused.coreOpacity).toBeGreaterThan(local.coreOpacity);
    expect(focused.glowOpacity).toBeGreaterThan(local.glowOpacity);
    expect(focused.coreOpacity).toBeLessThanOrEqual(1);
  });
});
