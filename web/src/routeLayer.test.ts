import { describe, expect, it } from 'vitest';
import type { Feature, LineString } from 'geojson';
import { historicalRouteVertices } from './routeLayer';

describe('historical route WebGL geometry', () => {
  it('keeps one exact line segment for every route', () => {
    const routes: Feature<LineString>[] = [
      route('a', [[-80, 43], [-79, 44]], '#54d7c6', 0),
      route('b', [[-82, 45], [-81, 46]], '#f0ca54', 3),
    ];

    const vertices = historicalRouteVertices(routes);

    expect(vertices).toHaveLength(routes.length * 2 * 7);
    expect(vertices[6]).toBe(0);
    expect(vertices[20]).toBe(3);
    expect(routes[0]?.geometry.coordinates).toEqual([[-80, 43], [-79, 44]]);
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
