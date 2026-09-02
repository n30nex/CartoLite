import { describe, expect, it } from 'vitest';
import type { PacketView } from '../types';
import {
  RollingMetrics,
  bearingDegrees,
  captionFor,
  haversineKm,
  normalizeLabPacket,
  projectCanada,
  stableNodeSample,
} from './runtime';

const toronto = { id: 'yyz', label: 'Toronto', lat: 43.6532, lng: -79.3832 };
const montreal = { id: 'yul', label: 'Montréal', lat: 45.5019, lng: -73.5674 };
const ottawa = { id: 'yow', label: 'Ottawa', lat: 45.4215, lng: -75.6972 };

describe('Labs packet normalization', () => {
  it('preserves ordered public hops and derives geographic measurements', () => {
    const view: PacketView = {
      seq: 12,
      id: 'packet-a',
      at: 10_000,
      payloadType: 'Trace',
      mode: 'route',
      segments: [
        { routeId: 'r1', from: toronto, to: ottawa },
        { routeId: 'r2', from: ottawa, to: montreal },
      ],
    };
    const packet = normalizeLabPacket(view);
    expect(packet.hops.map((hop) => hop.routeId)).toEqual(['r1', 'r2']);
    expect(packet.hops.map((hop) => hop.index)).toEqual([0, 1]);
    expect(packet.hopCount).toBe(2);
    expect(packet.totalDistanceKm).toBeGreaterThan(450);
    expect(packet.totalDistanceKm).toBeLessThan(600);
    expect(packet.seed).toBe(normalizeLabPacket(view).seed);
    expect(captionFor(packet)).toMatch(/^Trace · 2 hops · [\d,]+ km$/);
  });

  it('keeps observer-only activity distinct and never invents a route', () => {
    const packet = normalizeLabPacket({
      seq: 13,
      id: 'observer-a',
      at: 11_000,
      payloadType: 'ACK',
      mode: 'observer',
      observer: toronto,
    });
    expect(packet.mode).toBe('observer');
    expect(packet.hops).toEqual([]);
    expect(packet.totalDistanceKm).toBe(0);
    expect(captionFor(packet)).toBe('ACK · observer only');
  });
});

describe('Labs geographic helpers', () => {
  it('computes plausible distance and bearing', () => {
    expect(haversineKm(toronto, montreal)).toBeGreaterThan(495);
    expect(haversineKm(toronto, montreal)).toBeLessThan(515);
    expect(bearingDegrees(toronto, montreal)).toBeGreaterThan(45);
    expect(bearingDegrees(toronto, montreal)).toBeLessThan(80);
  });

  it('projects Canadian coordinates into a bounded stable stage', () => {
    expect(projectCanada(-141, 84, 1_000, 500)).toEqual({ x: 40, y: 20 });
    const projected = projectCanada(-52, 41, 1_000, 500);
    expect(projected.x).toBeCloseTo(960);
    expect(projected.y).toBeCloseTo(480);
  });

  it('samples nodes deterministically without changing the input', () => {
    const nodes = [
      { ...toronto, role: 'repeater' as const, observer: false, lastSeen: 3 },
      { ...montreal, role: 'companion' as const, observer: false, lastSeen: 2 },
      { ...ottawa, role: 'sensor' as const, observer: true, lastSeen: 1 },
    ];
    const original = nodes.map((node) => node.id);
    expect(stableNodeSample(nodes, 2).map((node) => node.id)).toEqual(stableNodeSample(nodes, 2).map((node) => node.id));
    expect(nodes.map((node) => node.id)).toEqual(original);
  });
});

describe('rolling Labs metrics', () => {
  it('bounds rolling windows, detects bursts, and counts route reuse', () => {
    const metrics = new RollingMetrics();
    const base = normalizeLabPacket({
      seq: 1,
      id: 'base',
      at: 1_000_000,
      payloadType: 'Advert',
      mode: 'route',
      segments: [{ routeId: 'r1', from: toronto, to: montreal }],
    });
    for (let index = 0; index < 40; index += 1) {
      metrics.record({ ...base, id: `p${index}`, at: base.at + index });
    }
    const burst = metrics.snapshot(base.at + 5_000);
    expect(burst.events10s).toBe(40);
    expect(burst.burst).toBe(true);
    expect(burst.routeReuse.get('r1')).toBe(40);

    const expired = metrics.snapshot(base.at + 5 * 60_000 + 100);
    expect(expired.events5m).toBe(0);
    expect(expired.routeReuse.size).toBe(0);
  });
});
