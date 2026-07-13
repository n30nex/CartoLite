import maplibregl, { type GeoJSONSource, type MapMouseEvent, type StyleSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { EndpointV1, NodeV1, RouteV1, StateV1 } from './types';

export const DEFAULT_CENTER: [number, number] = [-80.35, 43.45];
export const DEFAULT_ZOOM = 8.25;
export const DETAIL_ZOOM = 7;

const EMPTY_POINTS: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] };
const EMPTY_LINES: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] };
export const ROUTE_LAYER_IDS = ['route-glow', 'routes'] as const;
const ROUTE_PALETTE = ['#1d8c86', '#26a69a', '#1687a0', '#d58fb0', '#dbc22c'] as const;
const LOCAL_FONTS = ['Noto Sans', 'Segoe UI', 'Arial', 'Noto Color Emoji', 'Segoe UI Emoji', 'Apple Color Emoji'];

export class LiveMap {
  readonly map: maplibregl.Map;
  private nodeSignature = '';
  private routeSignature = '';
  private lastNodes?: readonly NodeV1[];
  private lastRoutes?: readonly RouteV1[];
  private lastState?: Readonly<StateV1>;
  private routesVisible = true;
  private freshnessTimer: number;
  private renderEpoch = 0;

  constructor(private readonly container: HTMLElement, private readonly tooltip: HTMLElement) {
    this.container.dataset.renderState = 'loading';
    this.container.dataset.routesVisible = 'true';
    this.map = new maplibregl.Map({
      container: this.container,
      style: darkStyle(),
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: 3,
      maxZoom: 16,
      attributionControl: false,
      pitchWithRotate: false,
      dragRotate: false,
      touchPitch: false,
      cooperativeGestures: false,
      renderWorldCopies: false,
      maxBounds: [[-142, 38], [-48, 72]]
    });
    this.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    this.map.on('load', () => this.installLayers());
    this.freshnessTimer = window.setInterval(() => this.render(this.lastState, true), 60_000);
  }

  render(state: Readonly<StateV1> | undefined, forceFreshness = false): void {
    if (!state) return;
    this.lastState = state;
    if (!this.map.getSource('nodes')) return;
    let changed = false;
    if (forceFreshness || state.nodes !== this.lastNodes) {
      const nodeSignature = signatureForNodes(state.nodes);
      if (forceFreshness || nodeSignature !== this.nodeSignature) {
        (this.map.getSource('nodes') as GeoJSONSource).setData(nodeCollection(state.nodes));
        this.nodeSignature = nodeSignature;
        changed = true;
      }
      this.lastNodes = state.nodes;
    }
    if (forceFreshness || state.routes !== this.lastRoutes) {
      const routeSignature = signatureForRoutes(state.routes);
      if (forceFreshness || routeSignature !== this.routeSignature) {
        (this.map.getSource('routes') as GeoJSONSource).setData(routeCollection(state.routes));
        this.routeSignature = routeSignature;
        changed = true;
      }
      this.lastRoutes = state.routes;
    }
    if (changed) this.markRendering();
  }

  reset(center: [number, number] = DEFAULT_CENTER, zoom = DEFAULT_ZOOM): void {
    this.map.easeTo({ center, zoom, bearing: 0, pitch: 0, duration: 700 });
  }

  follow(endpoint: EndpointV1): void {
    this.map.easeTo({ center: [endpoint.lng, endpoint.lat], duration: 700, essential: true });
  }

  setRoutesVisible(visible: boolean): void {
    this.routesVisible = visible;
    this.container.dataset.routesVisible = String(visible);
    if (applyRouteLayerVisibility(this.map, visible)) this.markRendering();
  }

  destroy(): void {
    window.clearInterval(this.freshnessTimer);
    this.map.remove();
  }

  private installLayers(): void {
    this.map.addSource('routes', { type: 'geojson', data: EMPTY_LINES, maxzoom: 14 });
    this.map.addLayer({
      id: 'route-glow',
      type: 'line',
      source: 'routes',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.2, 8, ['get', 'glowWidth'], 13, ['*', ['get', 'glowWidth'], 1.35]],
        'line-opacity': ['*', ['get', 'opacity'], 0.2],
        'line-blur': 3
      }
    });
    this.map.addLayer({
      id: 'routes',
      type: 'line',
      source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.55, 8, ['get', 'width'], 13, ['*', ['get', 'width'], 1.2]],
        'line-opacity': ['get', 'opacity']
      }
    });
    applyRouteLayerVisibility(this.map, this.routesVisible);

    this.map.addSource('nodes', {
      type: 'geojson',
      data: EMPTY_POINTS,
      cluster: true,
      clusterMaxZoom: 6,
      clusterRadius: 46,
      maxzoom: 14
    });
    this.map.addLayer({
      id: 'clusters-glow',
      type: 'circle',
      source: 'nodes',
      maxzoom: DETAIL_ZOOM,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#27a69a',
        'circle-radius': ['step', ['get', 'point_count'], 15, 20, 19, 100, 24],
        'circle-opacity': 0.16,
        'circle-blur': 0.5
      }
    });
    this.map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'nodes',
      maxzoom: DETAIL_ZOOM,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#092b30',
        'circle-stroke-color': '#3ec7bb',
        'circle-stroke-width': 1.2,
        'circle-radius': ['step', ['get', 'point_count'], 9, 20, 12, 100, 16]
      }
    });
    this.map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'nodes',
      maxzoom: DETAIL_ZOOM,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': LOCAL_FONTS,
        'text-size': 10
      },
      paint: { 'text-color': '#d9fffb' }
    });
    this.map.addLayer({
      id: 'observer-rings',
      type: 'circle',
      source: 'nodes',
      minzoom: DETAIL_ZOOM,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'observer'], true]],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 6, 12, 10],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': '#f1b548',
        'circle-stroke-width': 1.8,
        'circle-opacity': ['get', 'opacity']
      }
    });
    this.map.addLayer({
      id: 'nodes',
      type: 'circle',
      source: 'nodes',
      minzoom: DETAIL_ZOOM,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 3.5, 12, 6.5],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#dffeff',
        'circle-stroke-width': ['case', ['get', 'observer'], 1.5, 0.8],
        'circle-opacity': ['get', 'opacity']
      }
    });
    this.map.addLayer({
      id: 'node-labels',
      type: 'symbol',
      source: 'nodes',
      minzoom: DETAIL_ZOOM,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': LOCAL_FONTS,
        'text-size': ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 9, 11, 11.5],
        'text-offset': [0, 1.05],
        'text-anchor': 'top',
        'text-allow-overlap': true,
        'text-ignore-placement': true
      },
      paint: {
        'text-color': ['case', ['get', 'observer'], '#f5d57d', '#b9c8df'],
        'text-halo-color': '#02070b',
        'text-halo-width': 1.5,
        'text-opacity': ['get', 'opacity']
      }
    });

    this.map.on('click', 'clusters', (event) => void this.expandCluster(event));
    this.map.on('mousemove', 'nodes', (event) => this.showTooltip(event));
    this.map.on('mouseleave', 'nodes', () => this.hideTooltip());
    this.map.on('click', 'nodes', (event) => this.showTooltip(event, true));
    this.map.on('click', (event) => {
      if (this.map.queryRenderedFeatures(event.point, { layers: ['nodes', 'clusters'] }).length === 0) this.hideTooltip();
    });
    for (const layer of ['nodes', 'clusters']) {
      this.map.on('mouseenter', layer, () => { this.map.getCanvas().style.cursor = 'pointer'; });
      this.map.on('mouseleave', layer, () => { this.map.getCanvas().style.cursor = ''; });
    }
    this.render(this.lastState, true);
  }

  private markRendering(): void {
    const epoch = ++this.renderEpoch;
    this.container.dataset.renderState = 'rendering';
    this.map.once('idle', () => {
      if (epoch === this.renderEpoch) this.container.dataset.renderState = 'idle';
    });
  }

  private async expandCluster(event: MapMouseEvent): Promise<void> {
    const feature = this.map.queryRenderedFeatures(event.point, { layers: ['clusters'] })[0];
    const clusterId = Number(feature?.properties?.cluster_id);
    if (!Number.isFinite(clusterId)) return;
    const source = this.map.getSource('nodes') as GeoJSONSource;
    const zoom = await source.getClusterExpansionZoom(clusterId);
    const coordinates = feature?.geometry.type === 'Point' ? feature.geometry.coordinates : undefined;
    if (coordinates && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
      this.map.easeTo({ center: { lng: coordinates[0], lat: coordinates[1] }, zoom, duration: 500 });
    }
  }

  private showTooltip(event: MapMouseEvent, pin = false): void {
    const feature = this.map.queryRenderedFeatures(event.point, { layers: ['nodes'] })[0];
    if (!feature) return;
    const properties = feature.properties ?? {};
    this.tooltip.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = String(properties.label ?? 'MeshCore node');
    const detail = document.createElement('span');
    const role = String(properties.role ?? 'unknown').replace('_', ' ');
    const seen = Number(properties.lastSeen);
    detail.textContent = `${role}${properties.observer ? ' · observer' : ''}${Number.isFinite(seen) ? ` · ${relativeTime(seen)}` : ''}`;
    this.tooltip.append(title, detail);
    this.tooltip.style.left = `${event.point.x}px`;
    this.tooltip.style.top = `${event.point.y}px`;
    this.tooltip.dataset.pinned = String(pin);
    this.tooltip.hidden = false;
  }

  private hideTooltip(): void {
    this.tooltip.hidden = true;
    delete this.tooltip.dataset.pinned;
  }
}

type RouteLayerMap = Pick<maplibregl.Map, 'getLayer' | 'setLayoutProperty'>;

export function applyRouteLayerVisibility(map: RouteLayerMap, visible: boolean): boolean {
  let applied = false;
  for (const layerID of ROUTE_LAYER_IDS) {
    if (!map.getLayer(layerID)) continue;
    map.setLayoutProperty(layerID, 'visibility', visible ? 'visible' : 'none');
    applied = true;
  }
  return applied;
}

export function darkStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'CartoLite Dark',
    sources: {
      carto: {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        maxzoom: 20,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      }
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#03070b' } },
      { id: 'carto', type: 'raster', source: 'carto', paint: { 'raster-opacity': 0.64, 'raster-saturation': -0.65, 'raster-contrast': 0.12 } }
    ]
  };
}

function nodeCollection(nodes: readonly NodeV1[]): FeatureCollection<Point> {
  const now = Date.now();
  return {
    type: 'FeatureCollection',
    features: nodes.filter(validEndpoint).map((node): Feature<Point> => ({
      type: 'Feature',
      id: node.id,
      geometry: { type: 'Point', coordinates: [node.lng, node.lat] },
      properties: {
        id: node.id,
        label: node.label,
        role: node.role,
        observer: node.observer,
        lastSeen: node.lastSeen,
        color: roleColor(node.role),
        opacity: freshness(node.lastSeen, now)
      }
    }))
  };
}

function routeCollection(routes: readonly RouteV1[]): FeatureCollection<LineString> {
  const now = Date.now();
  return {
    type: 'FeatureCollection',
    features: routes.filter((route) => validEndpoint(route.from) && validEndpoint(route.to)).map((route): Feature<LineString> => {
      const intensity = Math.max(0, Math.min(4, route.intensity));
      return {
        type: 'Feature',
        id: route.id,
        geometry: { type: 'LineString', coordinates: [[route.from.lng, route.from.lat], [route.to.lng, route.to.lat]] },
        properties: {
          id: route.id,
          color: ROUTE_PALETTE[stableIndex(route.id, ROUTE_PALETTE.length)],
          width: 0.85 + intensity * 0.42,
          glowWidth: 3 + intensity * 0.65,
          opacity: freshness(route.lastHeard, now) * (0.55 + intensity * 0.08)
        }
      };
    })
  };
}

function validEndpoint(endpoint: EndpointV1): boolean {
  return Number.isFinite(endpoint.lat) && Number.isFinite(endpoint.lng) && Math.abs(endpoint.lat) <= 90 && Math.abs(endpoint.lng) <= 180;
}

function roleColor(role: NodeV1['role']): string {
  if (role === 'repeater') return '#45c27f';
  if (role === 'companion') return '#53a7e8';
  if (role === 'room_server') return '#ab76dc';
  if (role === 'sensor') return '#a2ad57';
  return '#8794a6';
}

function freshness(timestamp: number, now: number): number {
  const age = Math.max(0, now - timestamp);
  if (age < 15 * 60_000) return 1;
  if (age < 6 * 60 * 60_000) return 0.68;
  if (age < 24 * 60 * 60_000) return 0.4;
  return 0.2;
}

function stableIndex(value: string, length: number): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0) % length;
}

function signatureForNodes(nodes: readonly NodeV1[]): string {
  return nodes.map((node) => `${node.id}:${node.lng}:${node.lat}:${node.role}:${node.observer}:${Math.floor(node.lastSeen / 60_000)}`).join('|');
}

function signatureForRoutes(routes: readonly RouteV1[]): string {
  return routes.map((route) => `${route.id}:${route.from.lng}:${route.from.lat}:${route.to.lng}:${route.to.lat}:${route.intensity}:${Math.floor(route.lastHeard / 60_000)}`).join('|');
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
