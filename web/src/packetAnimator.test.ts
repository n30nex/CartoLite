import { describe, expect, it } from 'vitest';
import { MAX_ROUTE_MS, packetDuration, payloadColor, SINGLE_HOP_MS } from './packetAnimator';

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
});
