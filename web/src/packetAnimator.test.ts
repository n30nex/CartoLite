import { describe, expect, it } from 'vitest';
import { MAX_ROUTE_MS, observerRadius, packetDuration, payloadColor, RESIDUE_MS, residueLife, SINGLE_HOP_MS } from './packetAnimator';

describe('packet animation limits', () => {
  it('uses the intended single-hop duration and caps long routes', () => {
    expect(packetDuration(1)).toBe(SINGLE_HOP_MS);
    expect(packetDuration(100)).toBe(MAX_ROUTE_MS);
  });

  it('maps only payload categories to visual colours', () => {
    expect(payloadColor('Trace')).toBe('#e9d72f');
    expect(payloadColor('TextMessage')).toBe('#ec79b0');
    expect(payloadColor('unknown')).toBe('#7dbfff');
  });

  it('never gives observer gradients a negative radius', () => {
    expect(observerRadius(-10_000)).toBe(10);
    expect(observerRadius(0)).toBe(10);
    expect(observerRadius(4200)).toBe(50);
  });

  it('fades recent route trails completely over 15 seconds', () => {
    expect(RESIDUE_MS).toBe(15_000);
    expect(residueLife(-100)).toBe(1);
    expect(residueLife(0)).toBe(1);
    expect(residueLife(7_500)).toBe(0.5);
    expect(residueLife(15_000)).toBe(0);
    expect(residueLife(60_000)).toBe(0);
  });
});
