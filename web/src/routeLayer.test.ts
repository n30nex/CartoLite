import { describe, expect, it } from 'vitest';
import type { Feature, LineString } from 'geojson';
import { historicalRouteVertices, STROKE_VERTEX_FLOATS } from './routeLayer';

describe('historical route WebGL geometry', () => {
  it('keeps one exact line segment for every route', () => {
    const routes: Feature<LineString>[] = [
      route('a', [[-80, 43], [-79, 44]], '#54d7c6', 0),
      route('b', [[-82, 45], [-81, 46]], '#f0ca54', 3),
    ];

    const vertices = historicalRouteVertices(routes);

    expect(vertices).toHaveLength(routes.length * 6 * STROKE_VERTEX_FLOATS);
    expect(vertices[12]).toBe(0);
    expect(vertices[6 * STROKE_VERTEX_FLOATS + 12]).toBe(3);
    expect([...vertices].every(Number.isFinite)).toBe(true);
    expect(routes[0]?.geometry.coordinates).toEqual([[-80, 43], [-79, 44]]);
  });
  it('splits the date line into short strokes instead of crossing the world', () => {
    const data = historicalRouteVertices([route('seam', [[179, 40], [-179, 41]], '#4de7c4', 1)]);
    expect(data).toHaveLength(12 * STROKE_VERTEX_FLOATS);
    for (let i = 0; i < data.length; i += STROKE_VERTEX_FLOATS) expect(Math.abs(data[i]! - data[i + 3]!)).toBeLessThan(0.01);
  });
});

function route(
  id: string,
  coordinates: LineString['coordinates'],
  color: string,
  windowBand: number,
): Feature<LineString> {
  return {
    type: 'Feature',
    id,
    geometry: { type: 'LineString', coordinates },
    properties: { color, opacity: 0.7, windowBand },
  };
}
