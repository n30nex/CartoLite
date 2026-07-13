import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapMouseEvent,
  type StyleSpecification
} from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { isRecentNeighborRoute, recentNeighborRoutes } from './routeFocus';
import type { EndpointV1, NodeV1, RouteV1, StateV1 } from './types';

export const DEFAULT_CENTER: [number, number] = [-80.35, 43.45];
export const DEFAULT_ZOOM = 8.25;
export const DETAIL_ZOOM = 7;
export const LIVE_FOLLOW_SAFE_RATIO = 0.6;
export const LIVE_FOLLOW_MIN_INTERVAL_MS = 1_200;

const EMPTY_POINTS: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] };
const EMPTY_LINES: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] };
export const ROUTE_LAYER_IDS = ['route-glow', 'routes'] as const;
export const ROUTE_HIT_LAYER_ID = 'route-hit';
export const NODE_HIT_LAYER_ID = 'node-hit';
export const ROUTE_FILTER_LAYER_IDS = [...ROUTE_LAYER_IDS, ROUTE_HIT_LAYER_ID] as const;
export const SELECTED_NODE_LAYER_ID = 'selected-node';
export const SELECTED_NODE_OUTER_LAYER_ID = 'selected-node-outer';
export const NEIGHBOR_NODE_LAYER_ID = 'neighbor-nodes';
export const ROUTE_HOVER_LAYER_IDS = ['route-hover-glow', 'route-hover-core'] as const;
export const CLUSTER_HIGHLIGHT_LAYER_ID = 'cluster-highlight';
const NODE_GLOW_LAYER_ID = 'nodes-glow';
const NODE_LAYER_ID = 'nodes';
const NODE_CORE_LAYER_ID = 'node-core';
const NODE_LABEL_LAYER_ID = 'node-labels';
const NODE_BASE_FILTER = ['!', ['has', 'point_count']] as ActiveLayerFilter;
const LOCAL_FONTS = ['Noto Sans', 'Segoe UI', 'Arial', 'Noto Color Emoji', 'Segoe UI Emoji', 'Apple Color Emoji'];

export interface LiveMapFocus {
  label: string;
  neighborCount: number;
}

export interface LiveMapOptions {
  onFocusChange?: (focus: LiveMapFocus | null) => void;
}

export interface ViewportPoint {
  x: number;
  y: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface TooltipSize {
  width: number;
  height: number;
}

export class LiveMap {
  readonly map: maplibregl.Map;
  private nodeSignature = '';
  private routeSignature = '';
  private lastNodes?: readonly NodeV1[];
  private lastRoutes?: readonly RouteV1[];
  private lastState?: Readonly<StateV1>;
  private routesByID = new Map<string, RouteV1>();
  private routesVisible = true;
  private selectedNodeID: string | null = null;
  private selectedNodeLabel = '';
  private neighborNodeIDs: string[] = [];
  private hoveredRouteID: string | null = null;
  private highlightedClusterID: number | null = null;
  private clusterFlashTimer?: number;
  private tooltipSignature = '';
  private tooltipSize: TooltipSize = { width: 0, height: 0 };
  private lastFocusSignature: string | undefined;
  private lastFollowMoveAt = 0;
  private readonly reducedMotion = prefersReducedMotion();
  private freshnessTimer: number;
  private renderEpoch = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly tooltip: HTMLElement,
    private readonly options: LiveMapOptions = {}
  ) {
    this.container.dataset.renderState = 'loading';
    this.container.dataset.routesVisible = 'true';
    this.container.dataset.selectedNodeId = '';
    this.container.dataset.neighborRouteCount = '0';
    this.container.dataset.hoveredRouteId = '';
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
      reduceMotion: this.reducedMotion,
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
    if (this.selectedNodeID && !state.nodes.some((node) => node.id === this.selectedNodeID)) {
      this.setSelectedNode(null);
      this.hideTooltip();
    }
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
      if (this.selectedNodeID) this.updateFocusData();
    }
    const routesChanged = forceFreshness || state.routes !== this.lastRoutes;
    if (routesChanged) {
      if (state.routes !== this.lastRoutes) this.routesByID = new Map(state.routes.map((route) => [route.id, route]));
      const routeSignature = signatureForRoutes(state.routes);
      if (forceFreshness || routeSignature !== this.routeSignature) {
        (this.map.getSource('routes') as GeoJSONSource).setData(routeCollection(state.routes));
        this.routeSignature = routeSignature;
        changed = true;
      }
      this.lastRoutes = state.routes;
      this.updateFocusData();
      if (this.hoveredRouteID && !isRouteInspectable(state.routes, this.selectedNodeID, this.hoveredRouteID)) {
        this.clearRouteInspection();
      }
      if (this.selectedNodeID) this.applyFocusState();
    }
    if (changed) this.markRendering();
  }

  reset(center: [number, number] = DEFAULT_CENTER, zoom = DEFAULT_ZOOM): void {
    this.lastFollowMoveAt = 0;
    if (this.reducedMotion) {
      this.map.jumpTo({ center, zoom, bearing: 0, pitch: 0 });
      return;
    }
    this.map.easeTo({ center, zoom, bearing: 0, pitch: 0, duration: 520, essential: false });
  }

  follow(endpoint: EndpointV1): void {
    if (!validEndpoint(endpoint)) return;
    const container = this.map.getContainer();
    const point = this.map.project([endpoint.lng, endpoint.lat]);
    if (isPointInSafeArea(point, { width: container.clientWidth, height: container.clientHeight })) return;
    const now = Date.now();
    if (!canMoveLiveFollow(this.lastFollowMoveAt, now)) return;
    this.lastFollowMoveAt = now;
    const center: [number, number] = [endpoint.lng, endpoint.lat];
    if (this.reducedMotion) {
      this.map.jumpTo({ center });
      return;
    }
    this.map.easeTo({ center, duration: 450, essential: false });
  }

  setRoutesVisible(visible: boolean): void {
    this.routesVisible = visible;
    this.container.dataset.routesVisible = String(visible);
    const stableApplied = applyRouteLayerVisibility(this.map, visible);
    const hitApplied = applyRouteHitLayerVisibility(this.map, visible && this.selectedNodeID !== null);
    const neighborsApplied = applyNeighborRingVisibility(this.map, visible && this.selectedNodeID !== null);
    if (!visible) this.clearRouteInspection();
    if (!visible) this.map.getCanvas().style.cursor = '';
    if (stableApplied || hitApplied || neighborsApplied) this.markRendering();
  }

  destroy(): void {
    window.clearInterval(this.freshnessTimer);
    if (this.clusterFlashTimer !== undefined) window.clearTimeout(this.clusterFlashTimer);
    this.map.remove();
  }

  private installLayers(): void {
    this.map.addSource('routes', { type: 'geojson', data: EMPTY_LINES, maxzoom: 14 });
    this.map.addLayer({
      id: 'route-glow',
      type: 'line',
      source: 'routes',
      paint: {
        'line-color': '#1ca69d',
        'line-width': routeGlowWidth(false),
        'line-opacity': routeGlowOpacity(false),
        'line-blur': 2.6
      }
    });
    this.map.addLayer({
      id: 'routes',
      type: 'line',
      source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#238f89',
        'line-width': routeCoreWidth(false),
        'line-opacity': routeCoreOpacity(false)
      }
    });
    this.map.addLayer({
      id: ROUTE_HOVER_LAYER_IDS[0],
      type: 'line',
      source: 'routes',
      filter: routeIDFilter(null),
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
      paint: {
        'line-color': '#52e4d5',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 4, 8, ['*', ['get', 'glowWidth'], 1.8], 14, ['*', ['get', 'glowWidth'], 2.15]],
        'line-opacity': 0.62,
        'line-blur': 4.2
      }
    });
    this.map.addLayer({
      id: ROUTE_HOVER_LAYER_IDS[1],
      type: 'line',
      source: 'routes',
      filter: routeIDFilter(null),
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
      paint: {
        'line-color': '#eafffc',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.1, 8, ['*', ['get', 'width'], 1.28], 14, ['*', ['get', 'width'], 1.65]],
        'line-opacity': 0.96
      }
    });
    this.map.addLayer({
      id: ROUTE_HIT_LAYER_ID,
      type: 'line',
      source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 9, 8, 13, 13, 18],
        'line-opacity': 0.001
      }
    });
    applyRouteSelectionFilter(this.map, this.selectedNodeID);
    applyRouteFocusAppearance(this.map, this.selectedNodeID !== null);
    applyRouteLayerVisibility(this.map, this.routesVisible);
    applyRouteHitLayerVisibility(this.map, this.routesVisible && this.selectedNodeID !== null);
    applyRouteHoverFilter(this.map, null);

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
        'circle-color': '#32c8bb',
        'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 13, 20, 18, 100, 23, 500, 28],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.1, 5.5, 0.18, DETAIL_ZOOM, 0.04],
        'circle-blur': 0.64
      }
    });
    this.map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'nodes',
      maxzoom: DETAIL_ZOOM,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#08272c',
        'circle-stroke-color': '#48d5c7',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, DETAIL_ZOOM, 1.35],
        'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 8, 20, 11, 100, 14.5, 500, 18],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.84, 6.2, 0.98, DETAIL_ZOOM, 0.5]
      }
    });
    this.map.addLayer({
      id: CLUSTER_HIGHLIGHT_LAYER_ID,
      type: 'circle',
      source: 'nodes',
      maxzoom: DETAIL_ZOOM,
      filter: clusterIDFilter(null),
      paint: {
        'circle-color': 'rgba(0,0,0,0)',
        'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 12, 20, 15, 100, 19, 500, 23],
        'circle-stroke-color': '#dffffb',
        'circle-stroke-width': 2,
        'circle-stroke-opacity': 0.9,
        'circle-blur': 0.2
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
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 8.5, DETAIL_ZOOM, 10.5]
      },
      paint: {
        'text-color': '#e5fffc',
        'text-halo-color': '#061216',
        'text-halo-width': 1
      }
    });
    this.map.addLayer({
      id: NODE_GLOW_LAYER_ID,
      type: 'circle',
      source: 'nodes',
      minzoom: DETAIL_ZOOM - 0.15,
      filter: NODE_BASE_FILTER,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 8, 10, 11, 14, 15],
        'circle-color': ['get', 'color'],
        'circle-opacity': nodeGlowOpacity(false, []),
        'circle-blur': 0.72
      }
    });
    this.map.addLayer({
      id: NEIGHBOR_NODE_LAYER_ID,
      type: 'circle',
      source: 'nodes',
      minzoom: DETAIL_ZOOM - 0.15,
      filter: nodeIDFilter([]),
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 7.5, 10, 10.5, 14, 14],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': '#f3b844',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 1.2, 12, 2.1],
        'circle-stroke-opacity': ['*', ['get', 'opacity'], 0.94]
      }
    });
    this.map.addLayer({
      id: SELECTED_NODE_OUTER_LAYER_ID,
      type: 'circle',
      source: 'nodes',
      minzoom: DETAIL_ZOOM - 0.15,
      filter: selectedNodeFilter(this.selectedNodeID),
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 10, 10, 14, 14, 18],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.1,
        'circle-stroke-opacity': 0.48,
        'circle-blur': 0.45
      }
    });
    this.map.addLayer({
      id: SELECTED_NODE_LAYER_ID,
      type: 'circle',
      source: 'nodes',
      minzoom: DETAIL_ZOOM - 0.15,
      filter: selectedNodeFilter(this.selectedNodeID),
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 7.2, 10, 10.2, 14, 13.5],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2.2,
        'circle-stroke-opacity': 0.96
      }
    });
    this.map.addLayer({
      id: NODE_LAYER_ID,
      type: 'circle',
      source: 'nodes',
      minzoom: DETAIL_ZOOM - 0.15,
      filter: NODE_BASE_FILTER,
      layout: {
        'circle-sort-key': ['-', 100, ['get', 'labelPriority']]
      },
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 3.6, 9, 4.6, 12, 6.4, 16, 7.6],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': ['case', ['get', 'observer'], '#f5cf76', '#bce9e5'],
        'circle-stroke-width': ['case', ['get', 'observer'], 1.6, 0.9],
        'circle-opacity': nodeOpacity(false, [])
      }
    });
    this.map.addLayer({
      id: NODE_CORE_LAYER_ID,
      type: 'circle',
      source: 'nodes',
      minzoom: DETAIL_ZOOM - 0.15,
      filter: NODE_BASE_FILTER,
      layout: {
        'circle-sort-key': ['-', 100, ['get', 'labelPriority']]
      },
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 1.15, 10, 1.65, 14, 2.35],
        'circle-color': '#edfffd',
        'circle-opacity': nodeCoreOpacity(false, [])
      }
    });
    this.map.addLayer({
      id: NODE_LABEL_LAYER_ID,
      type: 'symbol',
      source: 'nodes',
      minzoom: DETAIL_ZOOM - 0.05,
      filter: NODE_BASE_FILTER,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': LOCAL_FONTS,
        'text-size': ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 8.6, 9, 9.8, 12, 11.2, 16, 12.4],
        'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
        'text-radial-offset': 0.82,
        'text-justify': 'auto',
        'text-padding': 3,
        'text-max-width': 12,
        'symbol-sort-key': ['get', 'labelPriority'],
        'text-allow-overlap': false,
        'text-ignore-placement': false
      },
      paint: {
        'text-color': ['case', ['get', 'observer'], '#f6d77f', '#d2e0ef'],
        'text-halo-color': '#02070b',
        'text-halo-width': 1.35,
        'text-halo-blur': 0.3,
        'text-opacity': ['*', ['get', 'opacity'], ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 0.42, 8.3, 0.82, 10, 1]]
      }
    });
    this.map.addLayer({
      id: NODE_HIT_LAYER_ID,
      type: 'circle',
      source: 'nodes',
      minzoom: DETAIL_ZOOM - 0.15,
      filter: NODE_BASE_FILTER,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 18, 10, 20, 14, 22],
        'circle-color': '#ffffff',
        'circle-opacity': 0.001
      }
    });

    this.applyFocusState();

    this.map.on('mousemove', NODE_HIT_LAYER_ID, (event) => this.showNodeTooltip(event));
    this.map.on('mouseleave', NODE_HIT_LAYER_ID, () => {
      // Touch browsers can synthesize this after a route tap. Do not let a
      // late node leave hide the route tooltip that has just replaced it.
      if (this.tooltip.dataset.kind === 'node') this.hideTooltip();
    });
    this.map.on('mousemove', ROUTE_HIT_LAYER_ID, (event) => this.showRouteTooltip(event));
    this.map.on('mouseleave', ROUTE_HIT_LAYER_ID, () => {
      this.map.getCanvas().style.cursor = '';
      this.clearRouteInspection();
    });
    this.map.on('mousemove', 'clusters', (event) => this.highlightCluster(event));
    this.map.on('mouseleave', 'clusters', () => {
      if (this.clusterFlashTimer === undefined) this.setHighlightedCluster(null);
    });
    this.map.on('click', (event) => this.handleMapClick(event));
    this.map.on('movestart', () => {
      this.hideTooltip();
      this.clearRouteInspection();
      if (this.clusterFlashTimer === undefined) this.setHighlightedCluster(null);
    });
    for (const layer of [NODE_HIT_LAYER_ID, 'clusters']) {
      this.map.on('mouseenter', layer, () => { this.map.getCanvas().style.cursor = 'pointer'; });
      this.map.on('mouseleave', layer, () => { this.map.getCanvas().style.cursor = ''; });
    }
    this.map.on('mouseenter', ROUTE_HIT_LAYER_ID, () => { this.map.getCanvas().style.cursor = 'pointer'; });
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
    this.flashCluster(clusterId);
    const source = this.map.getSource('nodes') as GeoJSONSource;
    const zoom = await source.getClusterExpansionZoom(clusterId);
    const coordinates = feature?.geometry.type === 'Point' ? feature.geometry.coordinates : undefined;
    if (coordinates && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
      const center: [number, number] = [coordinates[0], coordinates[1]];
      if (this.reducedMotion) {
        this.map.jumpTo({ center, zoom });
      } else {
        this.map.easeTo({ center, zoom, duration: 460, essential: false });
      }
    }
  }

  private handleMapClick(event: MapMouseEvent): void {
    if (this.map.queryRenderedFeatures(event.point, { layers: [NODE_HIT_LAYER_ID] }).length > 0) {
      this.selectNode(event);
      return;
    }
    if (this.map.queryRenderedFeatures(event.point, { layers: ['clusters'] }).length > 0) {
      this.clearNodeSelection();
      void this.expandCluster(event);
      return;
    }
    if (this.showRouteTooltip(event)) return;
    this.clearNodeSelection();
  }

  private selectNode(event: MapMouseEvent): void {
    const feature = this.map.queryRenderedFeatures(event.point, { layers: [NODE_HIT_LAYER_ID] })[0];
    if (!feature) return;
    const nodeID = String(feature.properties?.id ?? feature.id ?? '');
    if (!nodeID) return;
    this.setSelectedNode(nodeID, String(feature.properties?.label ?? 'MeshCore node'));
    this.showNodeTooltip(event);
  }

  private clearNodeSelection(): void {
    this.setSelectedNode(null);
    this.hideTooltip();
    this.map.getCanvas().style.cursor = '';
  }

  private setSelectedNode(nodeID: string | null, label = ''): void {
    if (this.selectedNodeID === nodeID && (!nodeID || !label || label === this.selectedNodeLabel)) return;
    this.clearRouteInspection();
    this.selectedNodeID = nodeID;
    this.selectedNodeLabel = nodeID ? label : '';
    this.container.dataset.selectedNodeId = nodeID ?? '';
    this.updateFocusData();
    this.applyFocusState();
    if (nodeID === null && this.tooltip.dataset.kind === 'route') this.hideTooltip();
    this.markRendering();
  }

  private updateFocusData(): void {
    const routes = recentNeighborRoutes(this.lastState?.routes ?? [], this.selectedNodeID);
    this.neighborNodeIDs = neighborNodeIDs(routes, this.selectedNodeID);
    this.container.dataset.neighborRouteCount = String(routes.length);
    const stateLabel = this.lastState?.nodes.find((node) => node.id === this.selectedNodeID)?.label;
    if (stateLabel) this.selectedNodeLabel = stateLabel;
    this.emitFocusChange();
  }

  private emitFocusChange(): void {
    const focus = this.selectedNodeID
      ? { label: this.selectedNodeLabel || 'MeshCore node', neighborCount: this.neighborNodeIDs.length }
      : null;
    const signature = focus ? `${this.selectedNodeID}:${focus.label}:${focus.neighborCount}` : '';
    if (signature === this.lastFocusSignature) return;
    this.lastFocusSignature = signature;
    this.options.onFocusChange?.(focus);
  }

  private applyFocusState(): void {
    const focusIDs = this.selectedNodeID ? [this.selectedNodeID, ...this.neighborNodeIDs] : [];
    applyRouteSelectionFilter(this.map, this.selectedNodeID);
    applyRouteFocusAppearance(this.map, this.selectedNodeID !== null);
    applySelectedNodeFilter(this.map, this.selectedNodeID);
    applyNodeFocus(this.map, this.selectedNodeID, focusIDs, this.neighborNodeIDs);
    applyRouteHitLayerVisibility(this.map, this.routesVisible && this.selectedNodeID !== null);
    applyNeighborRingVisibility(this.map, this.routesVisible && this.selectedNodeID !== null);
  }

  private showNodeTooltip(event: MapMouseEvent): void {
    const feature = this.map.queryRenderedFeatures(event.point, { layers: [NODE_HIT_LAYER_ID] })[0];
    if (!feature) return;
    const properties = feature.properties ?? {};
    const role = String(properties.role ?? 'unknown').replace('_', ' ');
    const seen = Number(properties.lastSeen);
    this.presentTooltip(
      event,
      String(properties.label ?? 'MeshCore node'),
      `${role}${properties.observer ? ' · observer' : ''}${Number.isFinite(seen) ? ` · ${relativeTime(seen)}` : ''}`,
      'node'
    );
  }

  private showRouteTooltip(event: MapMouseEvent): boolean {
    if (!this.routesVisible || !this.selectedNodeID) return false;
    if (this.map.queryRenderedFeatures(event.point, { layers: [NODE_HIT_LAYER_ID] }).length > 0) return false;
    const feature = this.map.queryRenderedFeatures(event.point, { layers: [ROUTE_HIT_LAYER_ID] })[0];
    if (!feature) return false;
    const properties = feature.properties ?? {};
    const route = this.routesByID.get(String(properties.id ?? feature.id ?? ''));
    if (!route) return false;
    this.setHoveredRoute(route.id);
    const packetCount = Math.max(0, route.packetCount);
    this.presentTooltip(
      event,
      `${route.from.label} ↔ ${route.to.label}`,
      `${packetCount.toLocaleString()} ${packetCount === 1 ? 'packet' : 'packets'} · heard ${relativeTime(route.lastHeard)}`,
      'route'
    );
    return true;
  }

  private setHoveredRoute(routeID: string | null): void {
    if (this.hoveredRouteID === routeID) return;
    this.hoveredRouteID = routeID;
    this.container.dataset.hoveredRouteId = routeID ?? '';
    applyRouteHoverFilter(this.map, this.routesVisible && this.selectedNodeID ? routeID : null);
  }

  private clearRouteInspection(): void {
    this.setHoveredRoute(null);
    if (this.tooltip.dataset.kind === 'route') this.hideTooltip();
  }

  private highlightCluster(event: MapMouseEvent): void {
    const feature = this.map.queryRenderedFeatures(event.point, { layers: ['clusters'] })[0];
    const clusterID = Number(feature?.properties?.cluster_id);
    this.setHighlightedCluster(Number.isFinite(clusterID) ? clusterID : null);
  }

  private setHighlightedCluster(clusterID: number | null): void {
    if (this.highlightedClusterID === clusterID) return;
    this.highlightedClusterID = clusterID;
    applyClusterHighlightFilter(this.map, clusterID);
  }

  private flashCluster(clusterID: number): void {
    if (this.clusterFlashTimer !== undefined) window.clearTimeout(this.clusterFlashTimer);
    this.setHighlightedCluster(clusterID);
    this.clusterFlashTimer = window.setTimeout(() => {
      this.clusterFlashTimer = undefined;
      this.setHighlightedCluster(null);
    }, 540);
  }

  private presentTooltip(event: MapMouseEvent, heading: string, details: string, kind: 'node' | 'route'): void {
    const signature = `${kind}:${heading}:${details}`;
    const contentChanged = signature !== this.tooltipSignature;
    if (contentChanged) {
      const title = document.createElement('strong');
      title.textContent = heading;
      const detail = document.createElement('span');
      detail.textContent = details;
      this.tooltip.replaceChildren(title, detail);
      this.tooltipSignature = signature;
    }
    this.tooltip.dataset.kind = kind;
    this.tooltip.hidden = false;
    if (contentChanged || this.tooltipSize.width <= 0 || this.tooltipSize.height <= 0) {
      this.tooltipSize = { width: this.tooltip.offsetWidth, height: this.tooltip.offsetHeight };
    }
    const position = tooltipPosition(
      event.point,
      { width: this.container.clientWidth, height: this.container.clientHeight },
      this.tooltipSize
    );
    this.tooltip.style.left = `${position.x}px`;
    this.tooltip.style.top = `${position.y}px`;
  }

  private hideTooltip(): void {
    this.tooltip.hidden = true;
    delete this.tooltip.dataset.kind;
  }
}

type RouteLayerMap = Pick<maplibregl.Map, 'getLayer' | 'setLayoutProperty'>;
type RouteFilterMap = Pick<maplibregl.Map, 'getLayer' | 'setFilter'>;
type PaintMap = Pick<maplibregl.Map, 'getLayer' | 'setPaintProperty'>;
type FocusMap = Pick<maplibregl.Map, 'getLayer' | 'setFilter' | 'setPaintProperty' | 'setLayoutProperty'>;
type InteractiveLayerMap = Pick<maplibregl.Map, 'getLayer' | 'setFilter' | 'setLayoutProperty'>;
type LayerFilter = Parameters<maplibregl.Map['setFilter']>[1];
type ActiveLayerFilter = Exclude<LayerFilter, null | undefined>;

export function applyRouteLayerVisibility(map: RouteLayerMap, visible: boolean): boolean {
  let applied = false;
  for (const layerID of ROUTE_LAYER_IDS) {
    if (!map.getLayer(layerID)) continue;
    map.setLayoutProperty(layerID, 'visibility', visible ? 'visible' : 'none');
    applied = true;
  }
  return applied;
}

export function applyRouteHitLayerVisibility(map: RouteLayerMap, visible: boolean): boolean {
  if (!map.getLayer(ROUTE_HIT_LAYER_ID)) return false;
  map.setLayoutProperty(ROUTE_HIT_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
  return true;
}

export function applyNeighborRingVisibility(map: RouteLayerMap, visible: boolean): boolean {
  if (!map.getLayer(NEIGHBOR_NODE_LAYER_ID)) return false;
  map.setLayoutProperty(NEIGHBOR_NODE_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
  return true;
}

export function applyRouteSelectionFilter(map: RouteFilterMap, selectedNodeID: string | null): boolean {
  const filter = neighborRouteFilter(selectedNodeID);
  let applied = false;
  for (const layerID of ROUTE_FILTER_LAYER_IDS) {
    if (!map.getLayer(layerID)) continue;
    map.setFilter(layerID, filter);
    applied = true;
  }
  return applied;
}

export function applySelectedNodeFilter(map: RouteFilterMap, selectedNodeID: string | null): boolean {
  let applied = false;
  for (const layerID of [SELECTED_NODE_OUTER_LAYER_ID, SELECTED_NODE_LAYER_ID]) {
    if (!map.getLayer(layerID)) continue;
    map.setFilter(layerID, selectedNodeFilter(selectedNodeID));
    applied = true;
  }
  return applied;
}

export function applyRouteFocusAppearance(map: PaintMap, focused: boolean): boolean {
  let applied = false;
  if (map.getLayer('route-glow')) {
    map.setPaintProperty('route-glow', 'line-color', focused ? '#35d4c6' : '#1ca69d');
    map.setPaintProperty('route-glow', 'line-width', routeGlowWidth(focused));
    map.setPaintProperty('route-glow', 'line-opacity', routeGlowOpacity(focused));
    applied = true;
  }
  if (map.getLayer('routes')) {
    map.setPaintProperty('routes', 'line-color', focused ? '#67e7da' : '#238f89');
    map.setPaintProperty('routes', 'line-width', routeCoreWidth(focused));
    map.setPaintProperty('routes', 'line-opacity', routeCoreOpacity(focused));
    applied = true;
  }
  return applied;
}

export function applyRouteHoverFilter(map: InteractiveLayerMap, routeID: string | null): boolean {
  let applied = false;
  for (const layerID of ROUTE_HOVER_LAYER_IDS) {
    if (!map.getLayer(layerID)) continue;
    map.setFilter(layerID, routeIDFilter(routeID));
    map.setLayoutProperty(layerID, 'visibility', routeID ? 'visible' : 'none');
    applied = true;
  }
  return applied;
}

export function applyClusterHighlightFilter(map: RouteFilterMap, clusterID: number | null): boolean {
  if (!map.getLayer(CLUSTER_HIGHLIGHT_LAYER_ID)) return false;
  map.setFilter(CLUSTER_HIGHLIGHT_LAYER_ID, clusterIDFilter(clusterID));
  return true;
}

export function applyNodeFocus(
  map: FocusMap,
  selectedNodeID: string | null,
  focusIDs: readonly string[],
  neighborIDs: readonly string[]
): boolean {
  let applied = false;
  if (map.getLayer(NODE_GLOW_LAYER_ID)) {
    map.setFilter(NODE_GLOW_LAYER_ID, selectedNodeID ? nodeIDFilter(focusIDs) : NODE_BASE_FILTER);
    map.setPaintProperty(NODE_GLOW_LAYER_ID, 'circle-opacity', nodeGlowOpacity(selectedNodeID !== null, focusIDs));
    applied = true;
  }
  if (map.getLayer(NEIGHBOR_NODE_LAYER_ID)) {
    map.setFilter(NEIGHBOR_NODE_LAYER_ID, nodeIDFilter(neighborIDs));
    applied = true;
  }
  if (map.getLayer(NODE_LAYER_ID)) {
    map.setPaintProperty(NODE_LAYER_ID, 'circle-opacity', nodeOpacity(selectedNodeID !== null, focusIDs));
    applied = true;
  }
  if (map.getLayer(NODE_CORE_LAYER_ID)) {
    map.setPaintProperty(NODE_CORE_LAYER_ID, 'circle-opacity', nodeCoreOpacity(selectedNodeID !== null, focusIDs));
    applied = true;
  }
  if (map.getLayer(NODE_LABEL_LAYER_ID)) {
    map.setFilter(NODE_LABEL_LAYER_ID, selectedNodeID ? nodeIDFilter(focusIDs) : NODE_BASE_FILTER);
    map.setLayoutProperty(NODE_LABEL_LAYER_ID, 'symbol-sort-key', labelSortKey(selectedNodeID, neighborIDs));
    applied = true;
  }
  return applied;
}

export function neighborRouteFilter(selectedNodeID: string | null): LayerFilter {
  if (!selectedNodeID) return null;
  return [
    'all',
    ['==', ['get', 'recent'], true],
    ['any', ['==', ['get', 'fromId'], selectedNodeID], ['==', ['get', 'toId'], selectedNodeID]]
  ] as LayerFilter;
}

export function selectedNodeFilter(selectedNodeID: string | null): ActiveLayerFilter {
  return ['==', ['get', 'id'], selectedNodeID ?? ''] as ActiveLayerFilter;
}

export function nodeIDFilter(nodeIDs: readonly string[]): ActiveLayerFilter {
  return ['in', ['get', 'id'], ['literal', [...nodeIDs]]] as ActiveLayerFilter;
}

export function routeIDFilter(routeID: string | null): ActiveLayerFilter {
  return ['==', ['get', 'id'], routeID ?? ''] as ActiveLayerFilter;
}

export function clusterIDFilter(clusterID: number | null): ActiveLayerFilter {
  return ['==', ['get', 'cluster_id'], clusterID ?? -1] as ActiveLayerFilter;
}

export function labelSortKey(selectedNodeID: string | null, neighborIDs: readonly string[]): ExpressionSpecification {
  if (!selectedNodeID) return ['get', 'labelPriority'];
  return [
    'case',
    ['==', ['get', 'id'], selectedNodeID],
    0,
    ['in', ['get', 'id'], ['literal', [...neighborIDs]]],
    1,
    ['get', 'labelPriority']
  ];
}

export function neighborNodeIDs(routes: readonly RouteV1[], selectedNodeID: string | null): string[] {
  if (!selectedNodeID) return [];
  const ids = new Set<string>();
  for (const route of routes) {
    if (route.from.id === selectedNodeID && route.to.id !== selectedNodeID) ids.add(route.to.id);
    if (route.to.id === selectedNodeID && route.from.id !== selectedNodeID) ids.add(route.from.id);
  }
  return [...ids].sort();
}

export function isRouteInspectable(
  routes: readonly RouteV1[],
  selectedNodeID: string | null,
  routeID: string | null,
  now = Date.now()
): boolean {
  if (!routeID) return false;
  return recentNeighborRoutes(routes, selectedNodeID, now).some((route) => route.id === routeID);
}

export function isPointInSafeArea(
  point: ViewportPoint,
  viewport: ViewportSize,
  safeRatio = LIVE_FOLLOW_SAFE_RATIO
): boolean {
  if (viewport.width <= 0 || viewport.height <= 0) return false;
  const ratio = Math.max(0, Math.min(1, safeRatio));
  const marginX = viewport.width * (1 - ratio) / 2;
  const marginY = viewport.height * (1 - ratio) / 2;
  return point.x >= marginX
    && point.x <= viewport.width - marginX
    && point.y >= marginY
    && point.y <= viewport.height - marginY;
}

export function canMoveLiveFollow(
  lastMoveAt: number,
  now: number,
  minimumInterval = LIVE_FOLLOW_MIN_INTERVAL_MS
): boolean {
  return lastMoveAt <= 0 || now - lastMoveAt >= minimumInterval;
}

export function tooltipPosition(
  anchor: ViewportPoint,
  viewport: ViewportSize,
  tooltip: TooltipSize,
  margin = 8,
  gap = 12
): ViewportPoint {
  const width = Math.max(0, tooltip.width);
  const height = Math.max(0, tooltip.height);
  const halfWidth = width / 2;
  const minimumX = margin + halfWidth;
  const maximumX = Math.max(minimumX, viewport.width - margin - halfWidth);
  const x = Math.max(minimumX, Math.min(maximumX, anchor.x));
  const above = anchor.y - gap - height;
  const below = anchor.y + gap;
  const maximumY = Math.max(margin, viewport.height - margin - height);
  const preferredY = above >= margin ? above : below;
  return { x, y: Math.max(margin, Math.min(maximumY, preferredY)) };
}

export interface RouteVisualProperties {
  width: number;
  glowWidth: number;
  opacity: number;
}

export function routeVisualProperties(route: Pick<RouteV1, 'intensity' | 'lastHeard'>, now: number): RouteVisualProperties {
  const intensity = Math.max(0, Math.min(4, route.intensity));
  const ageOpacity = freshness(route.lastHeard, now);
  return {
    width: 0.72 + intensity * 0.24,
    glowWidth: 2.4 + intensity * 0.58,
    opacity: Math.max(0.06, Math.min(0.84, ageOpacity * (0.58 + intensity * 0.065)))
  };
}

export function nodeLabelPriority(node: Pick<NodeV1, 'role' | 'observer' | 'lastSeen'>, now: number): number {
  const age = Math.max(0, now - node.lastSeen);
  const ageRank = age < 15 * 60_000 ? 0 : age < 6 * 60 * 60_000 ? 1 : age < 24 * 60 * 60_000 ? 2 : 3;
  const roleRank = node.observer
    ? 0
    : node.role === 'repeater'
      ? 1
      : node.role === 'room_server'
        ? 2
        : node.role === 'companion'
          ? 3
          : node.role === 'sensor'
            ? 4
            : 5;
  return ageRank * 10 + roleRank;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function routeZoomOpacity(): ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], 3, 0.1, 5, 0.24, 7, 0.58, 9, 1];
}

function routeGlowOpacity(focused: boolean): ExpressionSpecification {
  return ['*', ['get', 'opacity'], routeZoomOpacity(), focused ? 0.52 : 0.16];
}

function routeCoreOpacity(focused: boolean): ExpressionSpecification {
  return ['*', ['get', 'opacity'], routeZoomOpacity(), focused ? 1 : 0.72];
}

function routeGlowWidth(focused: boolean): ExpressionSpecification {
  const boost = focused ? 1.45 : 1;
  return [
    'interpolate', ['linear'], ['zoom'],
    3, 0.75,
    7, ['*', ['get', 'glowWidth'], 0.7 * boost],
    10, ['*', ['get', 'glowWidth'], boost],
    14, ['*', ['get', 'glowWidth'], 1.25 * boost]
  ];
}

function routeCoreWidth(focused: boolean): ExpressionSpecification {
  const boost = focused ? 1.24 : 1;
  return [
    'interpolate', ['linear'], ['zoom'],
    3, 0.34,
    7, ['*', ['get', 'width'], 0.7 * boost],
    10, ['*', ['get', 'width'], boost],
    14, ['*', ['get', 'width'], 1.18 * boost]
  ];
}

function focusMembership(focusIDs: readonly string[]): ExpressionSpecification {
  return ['in', ['get', 'id'], ['literal', [...focusIDs]]];
}

function nodeOpacity(focused: boolean, focusIDs: readonly string[]): ExpressionSpecification {
  if (!focused) return ['get', 'opacity'];
  return ['case', focusMembership(focusIDs), ['get', 'opacity'], ['*', ['get', 'opacity'], 0.2]];
}

function nodeCoreOpacity(focused: boolean, focusIDs: readonly string[]): ExpressionSpecification {
  if (!focused) return ['*', ['get', 'opacity'], 0.86];
  return ['case', focusMembership(focusIDs), ['*', ['get', 'opacity'], 0.94], ['*', ['get', 'opacity'], 0.11]];
}

function nodeGlowOpacity(focused: boolean, focusIDs: readonly string[]): ExpressionSpecification {
  const zoomFade: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 0.08, 9, 0.2, 13, 0.28];
  if (!focused) return ['*', ['get', 'opacity'], zoomFade];
  return ['case', focusMembership(focusIDs), ['*', ['get', 'opacity'], zoomFade, 1.35], 0];
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
        opacity: freshness(node.lastSeen, now),
        labelPriority: nodeLabelPriority(node, now)
      }
    }))
  };
}

function routeCollection(routes: readonly RouteV1[]): FeatureCollection<LineString> {
  const now = Date.now();
  return {
    type: 'FeatureCollection',
    features: routes.filter((route) => validEndpoint(route.from) && validEndpoint(route.to)).map((route): Feature<LineString> => {
      const visual = routeVisualProperties(route, now);
      return {
        type: 'Feature',
        id: route.id,
        geometry: { type: 'LineString', coordinates: [[route.from.lng, route.from.lat], [route.to.lng, route.to.lat]] },
        properties: {
          id: route.id,
          fromId: route.from.id,
          toId: route.to.id,
          recent: isRecentNeighborRoute(route, now),
          width: visual.width,
          glowWidth: visual.glowWidth,
          opacity: visual.opacity
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

function signatureForNodes(nodes: readonly NodeV1[]): string {
  return nodes.map((node) => `${node.id}:${node.label}:${node.lng}:${node.lat}:${node.role}:${node.observer}:${Math.floor(node.lastSeen / 60_000)}`).join('|');
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
