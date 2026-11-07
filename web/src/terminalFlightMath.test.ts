import { expect, it } from 'vitest';
import { flightBeacons, flightDepth, flightDirection, moveFlight } from './terminalFlightMath';
import { clipSurfacePath, surfacePathPoint, surfaceTrail } from './terrainProjection';

it('flies in camera direction, normalizes diagonals and bounds resumed time and geography', () => {
  const start = { lng: -80, lat: 43, altitude: 300, bearing: 0, pitch: 90 };
  const north = moveFlight(start, { forward: 1, right: 0, up: 0 }, .05, 100);
  expect(north.lat).toBeGreaterThan(start.lat); expect(north.lng).toBe(start.lng);
  expect(north.altitude).toBeCloseTo(300);
  const diagonal = moveFlight(start, { forward: 1, right: 1, up: 0 }, .05, 100);
  expect(diagonal.lat - start.lat).toBeCloseTo((north.lat - start.lat) / Math.SQRT2, 9);
  expect(moveFlight(start, { forward: 1, right: 0, up: 0 }, 120, 100)).toEqual(north);
  expect(moveFlight({ ...start, lng: -48, lat: 84 }, { forward: 1, right: 1, up: 0 }, .05, 100).lat).toBe(84);
  expect(flightDirection({ bearing: 90, pitch: 120 })[2]).toBeCloseTo(.5);
  expect(moveFlight({ ...start, pitch: 120 }, { forward: 1, right: 0, up: 0 }, .05, 100).altitude).toBeGreaterThan(300);
});

it('distinguishes points in front of the camera from mirrored points behind it', () => {
  const pose = { lng: -80, lat: 43, altitude: 300, bearing: 0, pitch: 90 };
  expect(flightDepth(pose, [-80, 43.001], 300)).toBeGreaterThan(0);
  expect(flightDepth(pose, [-80, 42.999], 300)).toBeLessThan(0);
  expect(flightDepth({ ...pose, pitch: 170 }, [-80, 43], 0)).toBeLessThan(0);
});

it('builds closed geographic polygons without adding radio-height or private metadata', () => {
  const data = flightBeacons({ type: 'FeatureCollection', features: [{ type: 'Feature', id: 'node-a',
    properties: { id: 'node-a', label: 'Demo', role: 'repeater', unrelated: 'not copied' }, geometry: { type: 'Point', coordinates: [-80, 43] } }] });
  const node = data.features[0]!; const ring = node.geometry.coordinates[0]!;
  expect(ring).toHaveLength(7); expect(ring[0]).toEqual(ring[6]);
  expect(node.id).toBe('node-a'); expect(node.properties).toEqual({ id: 'node-a', label: 'Demo', role: 'repeater' });
  expect(Math.max(...ring.map(p => p[0]!)) - Math.min(...ring.map(p => p[0]!))).toBeLessThan(.001);
});

it('clips near-camera paths without retiming packets or bridging hidden sections', () => {
  const project = (t: number) => ({ x: t * 100, y: 0 });
  const points = Array.from({ length: 11 }, (_, i) => ({ ...project(i / 10), progress: i / 10 }));
  const entering = clipSurfacePath(points, t => (t - .4) * 100, project);
  expect(entering[0]!.progress).toBeCloseTo(.44, 4);
  expect(surfacePathPoint(entering, .2).visible).toBe(false);
  expect(surfacePathPoint(entering, .8).x).toBeCloseTo(80);
  const split = clipSurfacePath(points, t => Math.abs(t - .5) * 100 - 10, project);
  expect(split.some(p => p.breakBefore && p.progress! > .6)).toBe(true);
  expect(surfacePathPoint(split, .5).visible).toBe(false);
  expect(surfaceTrail(split,.5,Infinity)).toEqual([]);
  expect(surfacePathPoint(split, .8).x).toBeCloseTo(80);
  expect(surfacePathPoint(points, -1).x).toBe(0);
});
