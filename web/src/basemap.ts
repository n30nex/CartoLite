import type { StyleSpecification } from 'maplibre-gl';

const CARTO_VECTOR_TILEJSON = 'https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json';
const CARTO_GLYPHS = 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf';
const CARTO_BASEMAP_API_KEY = import.meta.env.VITE_CARTO_BASEMAP_API_KEY?.trim() ?? '';

export function cartoVectorStyle(apiKey = CARTO_BASEMAP_API_KEY): StyleSpecification {
  return {
    version: 8,
    name: 'CartoLite Observatory',
    glyphs: withKey(CARTO_GLYPHS, apiKey),
    sources: {
      carto: {
        type: 'vector',
        url: withKey(CARTO_VECTOR_TILEJSON, apiKey),
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      }
    },
    layers: [
      {
        id: 'basemap-background',
        type: 'background',
        paint: { 'background-color': '#071016' }
      },
      {
        id: 'basemap-landcover',
        type: 'fill',
        source: 'carto',
        'source-layer': 'landcover',
        paint: {
          'fill-color': [
            'match', ['get', 'class'],
            'wood', '#0d211e',
            'grass', '#10231f',
            '#0c191b'
          ],
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 10, 0.72]
        }
      },
      {
        id: 'basemap-landuse',
        type: 'fill',
        source: 'carto',
        'source-layer': 'landuse',
        minzoom: 6,
        paint: {
          'fill-color': [
            'match', ['get', 'class'],
            'residential', '#111d22',
            'cemetery', '#12241f',
            'stadium', '#15231f',
            '#0e1a1e'
          ],
          'fill-opacity': 0.62
        }
      },
      {
        id: 'basemap-water',
        type: 'fill',
        source: 'carto',
        'source-layer': 'water',
        paint: { 'fill-color': '#071b26', 'fill-opacity': 0.96 }
      },
      {
        id: 'basemap-waterway',
        type: 'line',
        source: 'carto',
        'source-layer': 'waterway',
        minzoom: 7,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#173744',
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.35, 13, 1.15],
          'line-opacity': 0.72
        }
      },
      {
        id: 'basemap-country-boundary',
        type: 'line',
        source: 'carto',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['==', ['get', 'maritime'], 0]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#627985',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 9, 1.4],
          'line-opacity': 0.72
        }
      },
      {
        id: 'basemap-region-boundary',
        type: 'line',
        source: 'carto',
        'source-layer': 'boundary',
        minzoom: 4,
        filter: ['all', ['==', ['get', 'admin_level'], 4], ['==', ['get', 'maritime'], 0]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#3c515b',
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.45, 10, 0.9],
          'line-opacity': 0.7,
          'line-dasharray': [2, 1.5]
        }
      },
      {
        id: 'basemap-major-roads',
        type: 'line',
        source: 'carto',
        'source-layer': 'transportation',
        minzoom: 5,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#27343b',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            5, ['match', ['get', 'class'], ['motorway', 'trunk'], 0.65, 0.3],
            10, ['match', ['get', 'class'], ['motorway', 'trunk'], 1.45, 0.78],
            15, ['match', ['get', 'class'], ['motorway', 'trunk'], 3.5, 1.9]
          ],
          'line-opacity': 0.78
        }
      },
      {
        id: 'basemap-local-roads',
        type: 'line',
        source: 'carto',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#202c32',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.3, 16, 1.05],
          'line-opacity': 0.62
        }
      },
      {
        id: 'basemap-water-labels',
        type: 'symbol',
        source: 'carto',
        'source-layer': 'water_name',
        minzoom: 3,
        filter: ['has', 'name'],
        layout: {
          'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
          'text-font': ['Open Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 9, 9, 11.5, 14, 13],
          'text-letter-spacing': 0.04,
          'text-max-width': 10,
          'text-allow-overlap': false
        },
        paint: {
          'text-color': '#557887',
          'text-halo-color': '#07131a',
          'text-halo-width': 1.2,
          'text-opacity': 0.84
        }
      },
      {
        id: 'basemap-country-labels',
        type: 'symbol',
        source: 'carto',
        'source-layer': 'place',
        minzoom: 2,
        maxzoom: 7,
        filter: ['==', ['get', 'class'], 'country'],
        layout: {
          'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
          'text-font': ['Open Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 9.5, 6, 13],
          'text-letter-spacing': 0.1,
          'text-transform': 'uppercase',
          'text-allow-overlap': false
        },
        paint: {
          'text-color': '#80909a',
          'text-halo-color': '#071016',
          'text-halo-width': 1.4,
          'text-opacity': 0.78
        }
      },
      {
        id: 'basemap-region-labels',
        type: 'symbol',
        source: 'carto',
        'source-layer': 'place',
        minzoom: 4,
        maxzoom: 10,
        filter: ['==', ['get', 'class'], 'state'],
        layout: {
          'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
          'text-font': ['Open Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 8.5, 9, 11],
          'text-letter-spacing': 0.05,
          'text-max-width': 9,
          'text-allow-overlap': false
        },
        paint: {
          'text-color': '#788993',
          'text-halo-color': '#071016',
          'text-halo-width': 1.25,
          'text-opacity': 0.76
        }
      },
      {
        id: 'basemap-place-labels',
        type: 'symbol',
        source: 'carto',
        'source-layer': 'place',
        minzoom: 4,
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village']]],
        layout: {
          'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
          'text-font': ['Open Sans Regular'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            4, ['match', ['get', 'class'], 'city', 9.5, 8],
            10, ['match', ['get', 'class'], 'city', 12, 10],
            15, ['match', ['get', 'class'], 'city', 14, 12]
          ],
          'text-max-width': 9,
          'text-padding': 3,
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
          'text-allow-overlap': false
        },
        paint: {
          'text-color': '#a6b6bf',
          'text-halo-color': '#071016',
          'text-halo-width': 1.35,
          'text-halo-blur': 0.25,
          'text-opacity': 0.9
        }
      }
    ]
  } as StyleSpecification;
}

export function cartoVectorRequestURL(url: string, apiKey = CARTO_BASEMAP_API_KEY): string {
  const key = apiKey.trim();
  if (!key) return url;
  try {
    const parsed = new URL(url);
    if (!/(^|\.)basemaps\.cartocdn\.com$/i.test(parsed.hostname) || parsed.searchParams.has('key')) return url;
    parsed.searchParams.set('key', key);
    return parsed.toString();
  } catch {
    return url;
  }
}

function withKey(url: string, apiKey: string): string {
  const key = apiKey.trim();
  return key ? `${url}?key=${encodeURIComponent(key)}` : url;
}
