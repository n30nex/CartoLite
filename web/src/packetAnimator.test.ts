import { afterEach, describe, expect, it, vi } from 'vitest';
import type maplibregl from 'maplibre-gl';
import type { EndpointV1, RoutePacketV1, RouteSegmentV1 } from './types';
import {
  capCombinedNewest,
  capNewest,
  DESTINATION_BLOOM_MS,
  geographicDistanceKm,
  interpolateScreenPoint,
  MAX_ACTIVE_EFFECTS,
  MAX_RESIDUE,
  MAX_ROUTE_MS,
  MIN_ROUTE_MS,
  OBSERVER_PING_MS,
  observerRadius,
  PacketAnimator,
  packetDuration,
  payloadColor,
  pulseTiming,
  RESIDUE_HOT_MS,
  RESIDUE_MS,
  residueLife,
  residueStyle,
  routeDistanceKm,
  routeDuration,
  routeMotion,
  segmentTravelWeights,
  shouldRefreshResidueCache,
  SINGLE_HOP_MS,
  SOURCE_IGNITION_MS,
} from './packetAnimator';

function endpoint(id: string, lat: number, lng: number): EndpointV1 {
  return { id, label: id, lat, lng };
}

function segment(id: string, from: EndpointV1, to: EndpointV1): RouteSegmentV1 {
  return { routeId: id, from, to };
}

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

  it('uses geographic segment length to weight travel time', () => {
    const a = endpoint('a', 0, 0);
    const b = endpoint('b', 0, 1);
    const c = endpoint('c', 0, 3);
    const segments = [segment('ab', a, b), segment('bc', b, c)];
    const weights = segmentTravelWeights(segments);

    expect(geographicDistanceKm(a, b)).toBeCloseTo(111.2, 0);
    expect(weights).toHaveLength(2);
    expect(weights[0]).toBeCloseTo(1 / 3, 4);
    expect(weights[1]).toBeCloseTo(2 / 3, 4);
    expect(weights[0]! + weights[1]!).toBeCloseTo(1, 10);
  });

  it('keeps total travel bounded while making longer packets take longer', () => {
    const a = endpoint('a', 0, 0);
    const nearby = endpoint('nearby', 0, 0.01);
    const distant = endpoint('distant', 0, 2);
    const shortRoute = [segment('short', a, nearby)];
    const longRoute = [segment('long', a, distant)];

    expect(routeDistanceKm(longRoute)).toBeGreaterThan(routeDistanceKm(shortRoute));
    expect(routeDuration(longRoute)).toBeGreaterThan(routeDuration(shortRoute));
    expect(routeDuration(shortRoute)).toBeGreaterThanOrEqual(MIN_ROUTE_MS);
    expect(routeDuration(longRoute)).toBeLessThanOrEqual(MAX_ROUTE_MS);
    expect(packetDuration(3, 100_000)).toBe(MAX_ROUTE_MS);
  });

  it('reveals only segments whose weighted travel has completed', () => {
    expect(routeMotion([0.25, 0.75], 0, 1000)).toEqual({ segmentIndex: 0, localProgress: 0, completedSegments: 0 });
    expect(routeMotion([0.25, 0.75], 249, 1000)).toMatchObject({ segmentIndex: 0, completedSegments: 0 });
    expect(routeMotion([0.25, 0.75], 250, 1000)).toEqual({ segmentIndex: 1, localProgress: 0, completedSegments: 1 });
    expect(routeMotion([0.25, 0.75], 999, 1000)).toMatchObject({ segmentIndex: 1, completedSegments: 1 });
    expect(routeMotion([0.25, 0.75], 1000, 1000)).toEqual({ segmentIndex: 1, localProgress: 1, completedSegments: 2 });
  });

  it('grows the current segment trail continuously to the comet head', () => {
    const from = { x: 10, y: 20 };
    const to = { x: 110, y: 60 };

    expect(interpolateScreenPoint(from, to, 0)).toEqual(from);
    expect(interpolateScreenPoint(from, to, 0.25)).toEqual({ x: 35, y: 30 });
    expect(interpolateScreenPoint(from, to, 1)).toEqual(to);
  });

  it('refreshes the residue bitmap on content, projection, or 250ms fade ticks', () => {
    expect(shouldRefreshResidueCache(1000, 1100, false, false)).toBe(false);
    expect(shouldRefreshResidueCache(1000, 1250, false, false)).toBe(true);
    expect(shouldRefreshResidueCache(1000, 1001, true, false)).toBe(true);
    expect(shouldRefreshResidueCache(1000, 1001, false, true)).toBe(true);
  });

  it('keeps ignition and destination bloom inside their short timing windows', () => {
    expect(SOURCE_IGNITION_MS).toBeGreaterThanOrEqual(120);
    expect(SOURCE_IGNITION_MS).toBeLessThanOrEqual(180);
    expect(DESTINATION_BLOOM_MS).toBeGreaterThanOrEqual(350);
    expect(DESTINATION_BLOOM_MS).toBeLessThanOrEqual(500);
    expect(pulseTiming(-1, SOURCE_IGNITION_MS).opacity).toBe(0);
    expect(pulseTiming(SOURCE_IGNITION_MS / 2, SOURCE_IGNITION_MS).opacity).toBeCloseTo(1);
    expect(pulseTiming(SOURCE_IGNITION_MS + 1, SOURCE_IGNITION_MS).opacity).toBe(0);
    expect(pulseTiming(DESTINATION_BLOOM_MS / 2, DESTINATION_BLOOM_MS).opacity).toBeCloseTo(1);
  });

  it('uses one bounded, crisp observer ping', () => {
    expect(observerRadius(-10_000)).toBe(8);
    expect(observerRadius(0)).toBe(8);
    expect(observerRadius(OBSERVER_PING_MS)).toBe(32);
    expect(observerRadius(OBSERVER_PING_MS * 4)).toBe(32);
  });

  it('fades and narrows residue nonlinearly over 15 seconds', () => {
    expect(RESIDUE_MS).toBe(15_000);
    expect(RESIDUE_HOT_MS).toBe(900);
    expect(residueLife(-100)).toBe(1);
    expect(residueLife(0)).toBe(1);
    expect(residueLife(7_500)).toBeLessThan(0.5);
    expect(residueLife(15_000)).toBe(0);
    expect(residueLife(60_000)).toBe(0);

    const ages = [0, 900, 7_500, 14_000, 15_000];
    const styles = ages.map(residueStyle);
    for (let index = 1; index < styles.length; index += 1) {
      const current = styles[index]!;
      const previous = styles[index - 1]!;
      expect(current.life).toBeLessThanOrEqual(previous.life);
      expect(current.bloomOpacity).toBeLessThanOrEqual(previous.bloomOpacity);
      expect(current.coreOpacity).toBeLessThanOrEqual(previous.coreOpacity);
      expect(current.bloomWidth).toBeLessThanOrEqual(previous.bloomWidth);
      expect(current.coreWidth).toBeLessThanOrEqual(previous.coreWidth);
    }
    expect(styles[0]!.hot).toBe(1);
    expect(styles[1]!.hot).toBe(0);
  });

  it('caps residue and mixed active effects to their shared budgets', () => {
    const values = Array.from({ length: 300 }, (_, index) => index);
    expect(MAX_RESIDUE).toBe(240);
    expect(capNewest(values, MAX_RESIDUE)).toEqual(values.slice(60));
    expect(capNewest(values, 0)).toEqual([]);

    const routes = Array.from({ length: 20 }, (_, index) => ({ started: index * 2 }));
    const observers = Array.from({ length: 20 }, (_, index) => ({ started: index * 2 + 1 }));
    const kept = capCombinedNewest(routes, observers, (route) => route.started, (observer) => observer.started);
    expect(MAX_ACTIVE_EFFECTS).toBe(32);
    expect(kept.routes).toHaveLength(16);
    expect(kept.observers).toHaveLength(16);
    expect(kept.routes[0]?.started).toBe(8);
    expect(kept.observers[0]?.started).toBe(9);
  });
});

describe('PacketAnimator motion preference lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('marks its canvas mode and switches without completing or restarting an active route', () => {
    const motionListener: { current?: (event: MediaQueryListEvent) => void } = {};
    const motionQuery = {
      matches: false,
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        motionListener.current = listener as (event: MediaQueryListEvent) => void;
      }),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(() => motionQuery));
    vi.spyOn(performance, 'now').mockReturnValue(900).mockReturnValueOnce(500);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    const context = {
      clearRect: vi.fn(),
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);

    const map = {
      on: vi.fn(),
      off: vi.fn(),
      project: vi.fn((coordinates: [number, number]) => ({ x: coordinates[0], y: coordinates[1] })),
    } as unknown as maplibregl.Map;
    const canvas = document.createElement('canvas');
    const a = endpoint('a', 43.6, -79.4);
    const b = endpoint('b', 43.7, -79.2);
    const packet: RoutePacketV1 = {
      seq: 1,
      id: 'packet-1',
      at: 1,
      payloadType: 'Trace',
      mode: 'route',
      segments: [segment('ab', a, b)],
    };

    const animator = new PacketAnimator(map, canvas);
    animator.add(packet);
    const state = animator as unknown as {
      activeRoutes: Array<{ started: number }>;
      residue: unknown[];
    };

    expect(canvas.dataset.motionMode).toBe('animated');
    expect(state.activeRoutes[0]?.started).toBe(500);
    expect(state.residue).toHaveLength(0);

    motionListener.current?.({ matches: true } as MediaQueryListEvent);

    expect(canvas.dataset.motionMode).toBe('static');
    expect(state.activeRoutes[0]?.started).toBe(500);
    expect(state.residue).toHaveLength(0);

    motionListener.current?.({ matches: false } as MediaQueryListEvent);
    expect(canvas.dataset.motionMode).toBe('animated');
    expect(state.activeRoutes[0]?.started).toBe(500);
    animator.setPaused(true);
    animator.add(packet);
    expect(state.activeRoutes).toHaveLength(0);
    expect(state.residue).toHaveLength(0);
    animator.destroy();
  });

  it('shows a newly received reduced-motion route as a static 15-second residue', () => {
    const motionQuery = {
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(() => motionQuery));
    vi.spyOn(performance, 'now').mockReturnValue(500);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const context = {
      clearRect: vi.fn(),
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      project: vi.fn((coordinates: [number, number]) => ({ x: coordinates[0], y: coordinates[1] })),
    } as unknown as maplibregl.Map;
    const canvas = document.createElement('canvas');
    const a = endpoint('a', 43.6, -79.4);
    const b = endpoint('b', 43.7, -79.2);
    const animator = new PacketAnimator(map, canvas);

    animator.add({
      seq: 1,
      id: 'packet-static',
      at: 1,
      payloadType: 'Trace',
      mode: 'route',
      segments: [segment('ab', a, b)],
    });

    const state = animator as unknown as {
      activeRoutes: Array<{ completedSegments: number }>;
      residue: Array<{ addedAt: number }>;
    };
    expect(canvas.dataset.motionMode).toBe('static');
    expect(state.activeRoutes[0]?.completedSegments).toBe(1);
    expect(state.residue).toEqual([expect.objectContaining({ addedAt: 500 })]);
    animator.destroy();
  });
});
