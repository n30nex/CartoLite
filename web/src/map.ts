import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type GeoJSONSourceDiff,
  type MapMouseEvent
} from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import canadaRegionsURL from './assets/meshmapper-canada-regions.geojson?url';
import { cartoVectorRequestURL, cartoVectorStyle } from './basemap';
import { isRecentNeighborRoute, recentNeighborRoutes } from './routeFocus';
import type { MapChanges } from './state';
import {
  decayedRouteTraffic,
  payloadColor,
  ROUTE_BRIGHT_AGE_MS,
  ROUTE_MAX_AGE_MS
} from './trafficVisuals';
import type { EndpointV2, NodeV2, PacketView, RouteV2, StateV2 } from './types';

export const DEFAULT_CENTER: [number, number] = [-96, 56];
export const DEFAULT_ZOOM = 3.4;
export const DETAIL_ZOOM = 8.4;
export const LIVE_FOLLOW_SAFE_RATIO = 0.6;
export const LIVE_FOLLOW_MIN_INTERVAL_MS = 1_200;
export const ACTIVE_NODE_WINDOW_MS = 24 * 60 * 60_000;

export type RouteWindow = 'auto' | '15m' | '1h' | '6h' | '24h';

const EMPTY_POINTS: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] };
const EMPTY_LINES: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] };
const EMPTY_FEATURES: FeatureCollection = { type: 'FeatureCollection', features: [] };
const ACTIVITY_HEAT_SOURCE_ID = 'activity-heat-source';
const REGION_SOURCE_ID = 'meshmapper-canada-regions';
export const HEATMAP_LAYER_ID = 'activity-heat';
export const REGION_LAYER_IDS = ['region-outline', 'region-labels'] as const;
export const ROUTE_LAYER_IDS = ['route-glow', 'routes'] as const;
export const ROUTE_HIT_LAYER_ID = 'route-hit';
export const NODE_HIT_LAYER_ID = 'node-hit';
export const ROUTE_FILTER_LAYER_IDS = [...ROUTE_LAYER_IDS, ROUTE_HIT_LAYER_ID] as const;
export const SELECTED_NODE_LAYER_ID = 'selected-node';
export const SELECTED_NODE_OUTER_LAYER_ID = 'selected-node-outer';
export const NEIGHBOR_NODE_LAYER_ID = 'neighbor-nodes';
export const MESHMAP_ATTRIBUTION = 'Canadian regions &copy; <a href="https://meshmapper.net/">MeshMapper</a>, used with permission';
export const ROUTE_HOVER_LAYER_IDS = ['route-hover-glow', 'route-hover-core'] as const;
export const CLUSTER_HIGHLIGHT_LAYER_ID = 'cluster-highlight';
const NODE_GLOW_LAYER_ID = 'nodes-glow';
const NODE_LAYER_ID = 'nodes';
const NODE_CORE_LAYER_ID = 'node-core';
const NODE_LABEL_LAYER_ID = 'node-labels';
const NODE_BASE_FILTER = ['!', ['has', 'point_count']] as ActiveLayerFilter;
const LOCAL_FONTS = ['Open Sans Regular'];
const ROUTE_HYDRATION_BATCH_SIZE = 200;

export interface LiveMapFocus {
  label: string;
  neighborCount: number;
}

export interface LiveMapOptions {
  onFocusChange?: (focus: LiveMapFocus | null) => void;
  onRouteWindowChange?: (label: string) => void;
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
  private lastState?: Readonly<StateV2>;
  private nodesByID = new Map<string, NodeV2>();
  private routesByID = new Map<string, RouteV2>();
  private nodeFeatureIDs = new Set<string>();
  private routeFeatureIDs = new Set<string>();
  private heatFeatureIDs = new Set<string>();
  private heatScores = new Map<string, number>();
  private routeHeat = new Map<string, { endpointIDs: string[]; score: number }>();
  private heatEpoch = 0;
  private routeBaseline = 1;
  private routeDataDirty = true;
  private routeHydrating = false;
  private routeHydrationEpoch = 0;
  private heatDataDirty = true;
  private routeWindow: RouteWindow = 'auto';
  private routesVisible = true;
  private heatmapVisible = true;
  private regionsVisible = false;
  private regionsLoaded = false;
  private regionsLoad?: Promise<void>;
  private selectedNodeID: string | null = null;
  private selectedNodeLabel = '';
  private neighborNodeIDs: string[] = [];
  private hoveredRouteID: string | null = null;
  private routeInspectionPinned = false;
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
    this.container.dataset.heatmapVisible = 'true';
    this.container.dataset.regionsVisible = 'false';
    this.container.dataset.regionsLoaded = 'false';
    this.container.dataset.selectedNodeId = '';
    this.container.dataset.neighborRouteCount = '0';
    this.container.dataset.hoveredRouteId = '';
    this.map = new maplibregl.Map({
      container: this.container,
      style: cartoVectorStyle(),
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
      maxBounds: [[-142, 38], [-48, 84]],
      transformRequest: (url) => ({ url: cartoVectorRequestURL(url) })
    });
    this.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    this.map.on('load', () => this.installLayers());
    this.map.on('zoomend', this.handleZoomEnd);
    this.freshnessTimer = window.setInterval(() => this.render(this.lastState, { reset: true }, true), 60_000);
  }

  render(state: Readonly<StateV2> | undefined, changes: MapChanges | null = { reset: true }, forceFreshness = false): void {
    if (!state) return;
    this.lastState = state;
    if (this.selectedNodeID && !state.nodes.some((node) => node.id === this.selectedNodeID)) {
      this.setSelectedNode(null);
      this.hideTooltip();
    }
    if (!this.map.getSource('nodes')) return;
    if (forceFreshness || changes?.reset || this.nodesByID.size === 0) {
      this.resetSources(state);
      return;
    }

    let changed = false;
    const heatNodeIDs = new Set<string>();
    const routeFeatureIDs = new Set(changes?.routeGeometry ?? []);
    if (changes?.nodes?.length) {
      for (const node of changes.nodes) {
        this.nodesByID.set(node.id, node);
        heatNodeIDs.add(node.id);
      }
      changed = this.updateNodeFeatures(changes.nodes.map((node) => node.id)) || changed;
    }
    if (changes?.routes?.length) {
      const routeIDs: string[] = [];
      for (const route of changes.routes) {
        this.routesByID.set(route.id, route);
        routeIDs.push(route.id);
        routeFeatureIDs.add(route.id);
      }
      for (const endpointID of this.updateHeatIndex(routeIDs)) heatNodeIDs.add(endpointID);
    }
    if (routeFeatureIDs.size > 0) {
      if (this.routesVisible && !this.routeHydrating) changed = this.updateRouteFeatures([...routeFeatureIDs]) || changed;
      else this.routeDataDirty = true;
    }
    if (heatNodeIDs.size > 0) {
      if (this.heatmapVisible) changed = this.updateHeatFeatures([...heatNodeIDs]) || changed;
      else this.heatDataDirty = true;
    }
    if (changes?.nodes?.length || changes?.routes?.length || routeFeatureIDs.size > 0) {
      this.updateFocusData();
      if (this.hoveredRouteID && !isRouteInspectable(state.routes, this.selectedNodeID, this.hoveredRouteID)) this.clearRouteInspection();
      if (this.selectedNodeID) this.applyFocusState();
    }
    if (changed) this.markRendering();
  }

  private resetSources(state: Readonly<StateV2>): void {
    const now = Date.now();
    this.nodesByID = new Map(state.nodes.map((node) => [node.id, node]));
    this.routesByID = new Map(state.routes.map((route) => [route.id, route]));

    const nodes = nodeCollection(state.nodes, now);
    (this.map.getSource('nodes') as GeoJSONSource).setData(nodes);
    this.nodeFeatureIDs = new Set(nodes.features.map((feature) => String(feature.id)));

    this.routeBaseline = routeTrafficBaseline(state.routes, now);
    this.routeDataDirty = true;
    if (this.routesVisible) this.hydrateRouteSource(now);

    this.rebuildHeatIndex(now);
    this.heatDataDirty = true;
    if (this.heatmapVisible) this.refreshHeatSource();

    this.updateFocusData();
    if (this.selectedNodeID) this.applyFocusState();
    this.markRendering();
  }

  private updateNodeFeatures(ids: readonly string[]): boolean {
    const now = Date.now();
    const features = new Map<string, Feature<Point> | undefined>();
    for (const id of new Set(ids)) {
      const node = this.nodesByID.get(id);
      features.set(id, node && validEndpoint(node) ? nodeFeature(node, now) : undefined);
    }
    return this.applyFeatureDiff('nodes', this.nodeFeatureIDs, features);
  }

  private updateRouteFeatures(ids: readonly string[]): boolean {
    const now = Date.now();
    const maxAge = this.effectiveRouteAgeMS();
    const features = new Map<string, Feature<LineString> | undefined>();
    for (const id of new Set(ids)) {
      const route = this.routesByID.get(id);
      features.set(id, routeFeature(route, this.nodesByID, now, this.routeBaseline, maxAge));
    }
    const changed = this.applyFeatureDiff('routes', this.routeFeatureIDs, features);
    if (changed) this.routeDataDirty = false;
    return changed;
  }

  private hydrateRouteSource(now = Date.now()): void {
    const source = this.map.getSource('routes') as GeoJSONSource | undefined;
    if (!source) return;
    const hydrationEpoch = ++this.routeHydrationEpoch;
    const routes = [...this.routesByID.values()];
    this.routeBaseline = routeTrafficBaseline(routes, now);
    const maxAge = this.effectiveRouteAgeMS();
    this.routeHydrating = true;
    this.routeDataDirty = false;
    this.routeFeatureIDs.clear();
    this.markRendering();

    const active = (): boolean => hydrationEpoch === this.routeHydrationEpoch
      && this.routesVisible
      && Boolean(this.map.getSource('routes'));
    source.updateData({ removeAll: true });
    let offset = 0;
    const addBatch = (): void => {
      if (!active()) return;
      const additions: Feature<LineString>[] = [];
      const end = Math.min(routes.length, offset + ROUTE_HYDRATION_BATCH_SIZE);
      for (; offset < end; offset += 1) {
        const feature = routeFeature(routes[offset], this.nodesByID, now, this.routeBaseline, maxAge);
        if (!feature) continue;
        additions.push(feature);
        this.routeFeatureIDs.add(String(feature.id));
      }
      if (additions.length > 0) source.updateData({ add: additions });
      if (offset < routes.length) {
        window.requestAnimationFrame(addBatch);
        return;
      }
      this.routeHydrating = false;
      if (this.routeDataDirty) {
        this.hydrateRouteSource();
        return;
      }
      this.emitRouteWindowChange();
      this.markRendering('routes');
    };
    window.requestAnimationFrame(addBatch);
  }

  private rebuildHeatIndex(now = Date.now()): void {
    this.heatEpoch = now;
    this.heatScores.clear();
    this.routeHeat.clear();
    for (const route of this.routesByID.values()) this.addRouteHeat(route);
  }

  private updateHeatIndex(routeIDs: readonly string[]): string[] {
    const touched = new Set<string>();
    for (const id of new Set(routeIDs)) {
      const previous = this.routeHeat.get(id);
      if (previous) {
        for (const endpointID of previous.endpointIDs) {
          this.heatScores.set(endpointID, Math.max(0, (this.heatScores.get(endpointID) ?? 0) - previous.score));
          touched.add(endpointID);
        }
        this.routeHeat.delete(id);
      }
      const route = this.routesByID.get(id);
      if (route) {
        this.addRouteHeat(route);
        for (const endpointID of new Set([route.fromId, route.toId])) touched.add(endpointID);
      }
    }
    return [...touched];
  }

  private addRouteHeat(route: RouteV2): void {
    if (Math.max(0, this.heatEpoch - route.lastHeard) > ROUTE_MAX_AGE_MS) return;
    const score = decayedRouteTraffic(route.traffic, route.lastHeard, this.heatEpoch);
    const endpointIDs = [...new Set([route.fromId, route.toId])];
    this.routeHeat.set(route.id, { endpointIDs, score });
    for (const endpointID of endpointIDs) this.heatScores.set(endpointID, (this.heatScores.get(endpointID) ?? 0) + score);
  }

  private updateHeatFeatures(ids: readonly string[]): boolean {
    const features = new Map<string, Feature<Point> | undefined>();
    for (const id of new Set(ids)) features.set(id, heatFeature(id, this.nodesByID, this.heatScores));
    const changed = this.applyFeatureDiff(ACTIVITY_HEAT_SOURCE_ID, this.heatFeatureIDs, features);
    if (changed) this.heatDataDirty = false;
    return changed;
  }

  private refreshHeatSource(): void {
    const collection = heatCollection(this.nodesByID, this.heatScores);
    (this.map.getSource(ACTIVITY_HEAT_SOURCE_ID) as GeoJSONSource).setData(collection);
    this.heatFeatureIDs = new Set(collection.features.map((feature) => String(feature.id)));
    this.heatDataDirty = false;
  }

  private applyFeatureDiff<G extends Point | LineString>(
    sourceID: string,
    knownIDs: Set<string>,
    features: ReadonlyMap<string, Feature<G> | undefined>
  ): boolean {
    const diff: GeoJSONSourceDiff = {};
    for (const [id, feature] of features) {
      if (!feature) {
        if (knownIDs.has(id)) {
          (diff.remove ??= []).push(id);
          knownIDs.delete(id);
        }
        continue;
      }
      if (!knownIDs.has(id)) {
        (diff.add ??= []).push(feature);
        knownIDs.add(id);
        continue;
      }
      (diff.update ??= []).push({
        id,
        newGeometry: feature.geometry,
        addOrUpdateProperties: Object.entries(feature.properties ?? {}).map(([key, value]) => ({ key, value }))
      });
    }
    if (!diff.add?.length && !diff.update?.length && !diff.remove?.length) return false;
    try {
      (this.map.getSource(sourceID) as GeoJSONSource).updateData(diff);
    } catch (error: unknown) {
      console.warn(`Incremental ${sourceID} update failed:`, error instanceof Error ? error.message : error);
      if (sourceID === 'routes') this.routeDataDirty = true;
      if (sourceID === ACTIVITY_HEAT_SOURCE_ID) this.heatDataDirty = true;
    }
    return true;
  }

  reset(center: [number, number] = DEFAULT_CENTER, zoom = DEFAULT_ZOOM): void {
    this.lastFollowMoveAt = 0;
    if (this.reducedMotion) {
      this.map.jumpTo({ center, zoom, bearing: 0, pitch: 0 });
      return;
    }
    this.map.easeTo({ center, zoom, bearing: 0, pitch: 0, duration: 520, essential: false });
  }

  home(nodes: readonly NodeV2[]): void {
    this.lastFollowMoveAt = 0;
    const now = Date.now();
    const active = nodes.filter((node) => validEndpoint(node) && Math.max(0, now - node.lastSeen) <= ACTIVE_NODE_WINDOW_MS);
    const visible = active.length > 0 ? active : nodes.filter(validEndpoint);
    if (visible.length === 0) {
      this.reset();
      return;
    }
    if (visible.length === 1) {
      this.reset([visible[0]!.lng, visible[0]!.lat], 6);
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    for (const node of visible) bounds.extend([node.lng, node.lat]);
    const options = { padding: this.container.clientWidth <= 620 ? 48 : 72, maxZoom: 6, duration: this.reducedMotion ? 0 : 620 };
    this.map.fitBounds(bounds, options);
  }

  restore(center: [number, number], zoom: number, nodes: readonly NodeV2[]): boolean {
    this.lastFollowMoveAt = 0;
    this.map.jumpTo({ center, zoom, bearing: 0, pitch: 0 });
    if (this.hasCurrentActivity(nodes)) return true;
    this.home(nodes);
    return false;
  }

  hasCurrentActivity(nodes: readonly NodeV2[], now = Date.now()): boolean {
    const bounds = this.map.getBounds();
    return nodes.some((node) => validEndpoint(node)
      && Math.max(0, now - node.lastSeen) <= ACTIVE_NODE_WINDOW_MS
      && bounds.contains([node.lng, node.lat]));
  }

  view(): { center: [number, number]; zoom: number } {
    const center = this.map.getCenter();
    return { center: [center.lng, center.lat], zoom: this.map.getZoom() };
  }

  follow(endpoint: EndpointV2): void {
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

  shouldFollow(packet: PacketView): boolean {
    if (this.selectedNodeID) {
      if (packet.mode === 'observer') return packet.observer.id === this.selectedNodeID;
      return packet.segments.some((segment) => segment.from.id === this.selectedNodeID || segment.to.id === this.selectedNodeID);
    }
    const endpoint = packet.mode === 'observer'
      ? packet.observer
      : packet.segments[packet.segments.length - 1]?.to ?? packet.segments[0]?.from;
    return Boolean(endpoint && this.map.getBounds().contains([endpoint.lng, endpoint.lat]));
  }

  setRoutesVisible(visible: boolean): void {
    this.routesVisible = visible;
    this.container.dataset.routesVisible = String(visible);
    if (!visible && this.routeHydrating) {
      this.routeHydrationEpoch += 1;
      this.routeHydrating = false;
      this.routeDataDirty = true;
    }
    const needsHydration = visible && this.routeDataDirty && Boolean(this.map.getSource('routes'));
    const stableApplied = applyRouteLayerVisibility(this.map, visible);
    const hitApplied = applyRouteHitLayerVisibility(this.map, visible && this.selectedNodeID !== null);
    const neighborsApplied = applyNeighborRingVisibility(this.map, visible && this.selectedNodeID !== null);
    if (needsHydration) this.hydrateRouteSource();
    if (!visible) this.clearRouteInspection();
    if (!visible) this.map.getCanvas().style.cursor = '';
    if (!needsHydration && (stableApplied || hitApplied || neighborsApplied)) this.markRendering();
  }

  setHeatmapVisible(visible: boolean): void {
    this.heatmapVisible = visible;
    this.container.dataset.heatmapVisible = String(visible);
    if (visible && this.heatDataDirty && this.map.getSource(ACTIVITY_HEAT_SOURCE_ID)) this.refreshHeatSource();
    if (applyHeatmapLayerVisibility(this.map, visible)) this.markRendering();
  }

  setRouteWindow(window: RouteWindow): void {
    if (this.routeWindow === window) return;
    this.routeWindow = window;
    this.routeDataDirty = true;
    if (this.routesVisible && this.map.getSource('routes')) {
      this.hydrateRouteSource();
    } else {
      this.emitRouteWindowChange();
    }
  }

  setRegionsVisible(visible: boolean): void {
    this.regionsVisible = visible;
    this.container.dataset.regionsVisible = String(visible);
    if (visible) this.ensureRegionsData();
    const applied = applyRegionLayerVisibility(this.map, visible);
    if (applied) this.markRendering();
  }

  destroy(): void {
    this.routeHydrationEpoch += 1;
    this.routeHydrating = false;
    this.renderEpoch += 1;
    window.clearInterval(this.freshnessTimer);
    if (this.clusterFlashTimer !== undefined) window.clearTimeout(this.clusterFlashTimer);
    this.map.off('zoomend', this.handleZoomEnd);
    this.map.remove();
  }

  private handleZoomEnd = (): void => {
    if (this.routeWindow !== 'auto') return;
    this.routeDataDirty = true;
    if (this.routesVisible && this.map.getSource('routes')) {
      this.hydrateRouteSource();
    } else {
      this.emitRouteWindowChange();
    }
  };

  private emitRouteWindowChange(): void {
    this.options.onRouteWindowChange?.(routeWindowLabel(this.routeWindow, this.map.getZoom()));
  }

  private effectiveRouteAgeMS(): number {
    return this.selectedNodeID ? ROUTE_MAX_AGE_MS : effectiveRouteWindowMS(this.routeWindow, this.map.getZoom());
  }

  private installLayers(): void {
    this.map.addSource(REGION_SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_FEATURES,
      maxzoom: 12,
      buffer: 32,
      tolerance: 0.75,
      attribution: MESHMAP_ATTRIBUTION
    });

    this.map.addSource(ACTIVITY_HEAT_SOURCE_ID, { type: 'geojson', data: EMPTY_POINTS, maxzoom: 14 });
    this.map.addLayer({
      id: HEATMAP_LAYER_ID,
      type: 'heatmap',
      source: ACTIVITY_HEAT_SOURCE_ID,
      layout: { visibility: 'none' },
      paint: {
        'heatmap-weight': [
          'interpolate', ['linear'], ['number', ['get', 'weight'], 0],
          0, 0,
          0.2, 0.1,
          0.55, 0.6,
          1, 1.25
        ],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.55, 7, 0.85, 10, 1.1, 16, 1.25],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 14, 6, 22, 9, 30, 13, 38, 16, 44],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(3,7,11,0)',
          0.08, 'rgba(20,109,118,0.18)',
          0.25, 'rgba(29,166,157,0.42)',
          0.48, 'rgba(69,223,195,0.62)',
          0.7, 'rgba(242,191,79,0.80)',
          0.88, 'rgba(255,145,82,0.90)',
          1, 'rgba(255,244,177,0.98)'
        ],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.72, 7, 0.62, 10, 0.4, 14, 0.18, 16, 0.1]
      }
    });
    this.map.addLayer({
      id: REGION_LAYER_IDS[0],
      type: 'line',
      source: REGION_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
      paint: {
        'line-color': '#69d1ca',
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.45, 6, 0.7, 10, 1.1, 14, 1.35],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.18, 6, 0.3, 10, 0.42, 14, 0.28],
        'line-dasharray': [2, 2],
        'line-blur': 0.18
      }
    });

    this.map.addSource('routes', { type: 'geojson', data: EMPTY_LINES, maxzoom: 14 });
    this.map.addLayer({
      id: 'route-glow',
      type: 'line',
      source: 'routes',
      paint: {
        'line-color': routeColorExpression(),
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
        'line-color': routeColorExpression(),
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
        'line-color': routeColorExpression(),
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
    applyHeatmapLayerVisibility(this.map, this.heatmapVisible);
    applyRegionLayerVisibility(this.map, this.regionsVisible);
    if (this.regionsVisible) this.ensureRegionsData();

    this.map.addLayer({
      id: REGION_LAYER_IDS[1],
      type: 'symbol',
      source: REGION_SOURCE_ID,
      minzoom: 5,
      layout: {
        visibility: 'none',
        'text-field': ['get', 'code'],
        'text-font': LOCAL_FONTS,
        'text-size': ['interpolate', ['linear'], ['zoom'], 5, 8, 9, 9.2, 13, 10.5],
        'text-letter-spacing': 0.13,
        'text-padding': 8,
        'text-allow-overlap': false,
        'text-ignore-placement': false
      },
      paint: {
        'text-color': '#8ec5c1',
        'text-halo-color': '#02070b',
        'text-halo-width': 1.2,
        'text-halo-blur': 0.25,
        'text-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.42, 8, 0.68, 12, 0.82]
      }
    });
    applyRegionLayerVisibility(this.map, this.regionsVisible);

    this.map.addSource('nodes', {
      type: 'geojson',
      data: EMPTY_POINTS,
      cluster: true,
      clusterMaxZoom: 8,
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
        'circle-stroke-color': '#f2bd55',
        'circle-stroke-width': 2.4,
        'circle-stroke-opacity': 0.62,
        'circle-blur': 0.7
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
        'circle-color': 'rgba(242,189,85,0.12)',
        'circle-stroke-color': '#fff0b8',
        'circle-stroke-width': 2.7,
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
        'text-opacity': [
          'interpolate', ['linear'], ['zoom'],
          DETAIL_ZOOM, ['*', ['get', 'opacity'], 0.42],
          9.5, ['*', ['get', 'opacity'], 0.82],
          11, ['get', 'opacity']
        ]
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
    this.map.on('mousemove', ROUTE_HIT_LAYER_ID, (event) => {
      if (!this.routeInspectionPinned) this.showRouteTooltip(event);
    });
    this.map.on('mouseleave', ROUTE_HIT_LAYER_ID, () => {
      this.map.getCanvas().style.cursor = '';
      if (!this.routeInspectionPinned) this.clearRouteInspection();
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
    this.render(this.lastState, { reset: true }, true);
  }

  private ensureRegionsData(): void {
    if (this.regionsLoaded || this.regionsLoad) return;
    const source = this.map.getSource(REGION_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    this.regionsLoad = source.setData(canadaRegionsURL, true)
      .then(() => {
        this.regionsLoaded = true;
        this.container.dataset.regionsLoaded = 'true';
      })
      .catch((error: unknown) => {
        console.warn('Region boundary load failed:', error instanceof Error ? error.message : error);
      })
      .finally(() => {
        this.regionsLoad = undefined;
      });
  }

  private markRendering(sourceID?: string): void {
    const epoch = ++this.renderEpoch;
    this.container.dataset.renderState = 'rendering';
    if (sourceID) {
      const sourceEpoch = this.routeHydrationEpoch;
      const settleSource = (): void => {
        if (sourceEpoch !== this.routeHydrationEpoch) return;
        const source = this.map.getSource(sourceID) as GeoJSONSource | undefined;
        if (!this.routeHydrating && source?.loaded()) {
          this.container.dataset.renderState = 'idle';
          return;
        }
        window.requestAnimationFrame(settleSource);
      };
      window.requestAnimationFrame(settleSource);
      return;
    }
    if (!this.routeHydrating && this.map.loaded()) {
      this.container.dataset.renderState = 'idle';
      return;
    }
    this.map.once('idle', () => {
      if (epoch === this.renderEpoch && !this.routeHydrating) this.container.dataset.renderState = 'idle';
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
    if (this.showRouteTooltip(event, true)) return;
    this.clearNodeSelection();
  }

  private selectNode(event: MapMouseEvent): void {
    const feature = this.map.queryRenderedFeatures(event.point, { layers: [NODE_HIT_LAYER_ID] })[0];
    if (!feature) return;
    const nodeID = String(feature.properties?.id ?? feature.id ?? '');
    if (!nodeID) return;
    this.clearRouteInspection();
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
    this.routeDataDirty = true;
    if (this.routesVisible && this.map.getSource('routes')) this.hydrateRouteSource();
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
    applyHeatmapFocus(this.map, focusIDs);
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

  private showRouteTooltip(event: MapMouseEvent, pin = false): boolean {
    if (!this.routesVisible || !this.selectedNodeID) return false;
    if (this.map.queryRenderedFeatures(event.point, { layers: [NODE_HIT_LAYER_ID] }).length > 0) return false;
    const feature = this.map.queryRenderedFeatures(event.point, { layers: [ROUTE_HIT_LAYER_ID] })[0];
    if (!feature) return false;
    const properties = feature.properties ?? {};
    const route = this.routesByID.get(String(properties.id ?? feature.id ?? ''));
    if (!route) return false;
    const from = this.nodesByID.get(route.fromId);
    const to = this.nodesByID.get(route.toId);
    if (!from || !to) return false;
    this.routeInspectionPinned = pin;
    this.setHoveredRoute(route.id);
    const packetCount = Math.max(0, route.packetCount);
    this.presentTooltip(
      event,
      `${from.label} ↔ ${to.label}`,
      `${route.lastKind} · ${packetCount.toLocaleString()} ${packetCount === 1 ? 'packet' : 'packets'} · heard ${relativeTime(route.lastHeard)}`,
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
    this.routeInspectionPinned = false;
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
  return applyLayerVisibility(map, ROUTE_LAYER_IDS, visible);
}

export function applyHeatmapLayerVisibility(map: RouteLayerMap, visible: boolean): boolean {
  return applyLayerVisibility(map, [HEATMAP_LAYER_ID], visible);
}

export function applyRegionLayerVisibility(map: RouteLayerMap, visible: boolean): boolean {
  return applyLayerVisibility(map, REGION_LAYER_IDS, visible);
}

function applyLayerVisibility(map: RouteLayerMap, layerIDs: readonly string[], visible: boolean): boolean {
  let applied = false;
  for (const layerID of layerIDs) {
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
    map.setPaintProperty('route-glow', 'line-width', routeGlowWidth(focused));
    map.setPaintProperty('route-glow', 'line-opacity', routeGlowOpacity(focused));
    applied = true;
  }
  if (map.getLayer('routes')) {
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

export function applyHeatmapFocus(map: RouteFilterMap, focusIDs: readonly string[]): boolean {
  if (!map.getLayer(HEATMAP_LAYER_ID)) return false;
  map.setFilter(HEATMAP_LAYER_ID, focusIDs.length > 0 ? nodeIDFilter(focusIDs) : null);
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

export function neighborNodeIDs(routes: readonly RouteV2[], selectedNodeID: string | null): string[] {
  if (!selectedNodeID) return [];
  const ids = new Set<string>();
  for (const route of routes) {
    if (route.fromId === selectedNodeID && route.toId !== selectedNodeID) ids.add(route.toId);
    if (route.toId === selectedNodeID && route.fromId !== selectedNodeID) ids.add(route.fromId);
  }
  return [...ids].sort();
}

export function isRouteInspectable(
  routes: readonly RouteV2[],
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
  trafficLevel: number;
}

export function routeVisualProperties(
  route: Pick<RouteV2, 'traffic' | 'lastHeard'>,
  now: number,
  trafficBaseline = 1
): RouteVisualProperties {
  const score = decayedRouteTraffic(route.traffic, route.lastHeard, now);
  const relative = clamp(score / Math.max(1, trafficBaseline * 3), 0, 1);
  const absolute = clamp(Math.log1p(score) / Math.log(9), 0, 1);
  const trafficLevel = Math.sqrt(relative * absolute);
  const age = Math.max(0, now - route.lastHeard);
  const recent = 1 - smoothstep(55 * 60_000, 65 * 60_000, age);
  const oldProgress = clamp((age - ROUTE_BRIGHT_AGE_MS) / (ROUTE_MAX_AGE_MS - ROUTE_BRIGHT_AGE_MS), 0, 1);
  return {
    width: Math.min(1.5, 0.68 + 0.82 * trafficLevel),
    glowWidth: Math.min(3.4, 1.8 + 1.6 * trafficLevel),
    opacity: 0.36 - 0.28 * oldProgress + 0.58 * recent,
    trafficLevel
  };
}

export function routeColorExpression(): ExpressionSpecification {
  return ['to-color', ['get', 'color']];
}

export function nodeLabelPriority(node: Pick<NodeV2, 'role' | 'observer' | 'lastSeen'>, now: number): number {
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

function routeZoomOpacity(scale: number): ExpressionSpecification {
  return [
    'interpolate', ['linear'], ['zoom'],
    3, ['*', ['get', 'opacity'], 0.1 * scale],
    5, ['*', ['get', 'opacity'], 0.24 * scale],
    7, ['*', ['get', 'opacity'], 0.58 * scale],
    9, ['*', ['get', 'opacity'], scale]
  ];
}

function routeGlowOpacity(focused: boolean): ExpressionSpecification {
  return routeZoomOpacity(focused ? 0.52 : 0.16);
}

function routeCoreOpacity(focused: boolean): ExpressionSpecification {
  return routeZoomOpacity(focused ? 1 : 0.72);
}

function routeGlowWidth(focused: boolean): ExpressionSpecification {
  const boost = focused ? 1.36 : 1;
  return [
    'interpolate', ['linear'], ['zoom'],
    3, 0.65,
    7, ['*', ['get', 'glowWidth'], 0.68 * boost],
    10, ['*', ['get', 'glowWidth'], boost],
    14, ['*', ['get', 'glowWidth'], 1.18 * boost]
  ];
}

function routeCoreWidth(focused: boolean): ExpressionSpecification {
  const boost = focused ? 1.18 : 1;
  return [
    'interpolate', ['linear'], ['zoom'],
    3, 0.3,
    7, ['*', ['get', 'width'], 0.7 * boost],
    10, ['*', ['get', 'width'], boost],
    14, ['*', ['get', 'width'], 1.15 * boost]
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
  const atZoom = (fade: number): ExpressionSpecification => (
    focused
      ? ['case', focusMembership(focusIDs), ['*', ['get', 'opacity'], fade * 1.35], 0]
      : ['*', ['get', 'opacity'], fade]
  );
  return [
    'interpolate', ['linear'], ['zoom'],
    DETAIL_ZOOM, atZoom(0.08),
    9, atZoom(0.2),
    13, atZoom(0.28)
  ];
}

function nodeCollection(nodes: readonly NodeV2[], now = Date.now()): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: nodes.filter(validEndpoint).map((node) => nodeFeature(node, now))
  };
}

function nodeFeature(node: NodeV2, now: number): Feature<Point> {
  return {
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
  };
}

export function activityHeatCollection(
  routes: readonly RouteV2[],
  nodes: ReadonlyMap<string, NodeV2>,
  now = Date.now()
): FeatureCollection<Point> {
  const scores = new Map<string, number>();
  for (const route of routes) {
    const age = Math.max(0, now - route.lastHeard);
    if (age > ROUTE_MAX_AGE_MS) continue;
    const contribution = decayedRouteTraffic(route.traffic, route.lastHeard, now);
    for (const id of new Set([route.fromId, route.toId])) scores.set(id, (scores.get(id) ?? 0) + contribution);
  }
  return heatCollection(nodes, scores);
}

function heatCollection(nodes: ReadonlyMap<string, NodeV2>, scores: ReadonlyMap<string, number>): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: [...scores.keys()]
      .sort()
      .map((id) => heatFeature(id, nodes, scores))
      .filter((feature): feature is Feature<Point> => feature !== undefined)
  };
}

function heatFeature(
  id: string,
  nodes: ReadonlyMap<string, NodeV2>,
  scores: ReadonlyMap<string, number>
): Feature<Point> | undefined {
  const node = nodes.get(id);
  const score = scores.get(id) ?? 0;
  if (!node || !validEndpoint(node) || score <= 0) return undefined;
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates: [node.lng, node.lat] },
    properties: { id, weight: Math.round(Math.min(1, Math.log1p(score) / Math.log1p(16)) * 1_000) / 1_000 }
  };
}

export function routeCollection(
  routes: readonly RouteV2[],
  nodes: ReadonlyMap<string, NodeV2>,
  now = Date.now(),
  maxAge = ROUTE_MAX_AGE_MS
): FeatureCollection<LineString> {
  const trafficBaseline = routeTrafficBaseline(routes, now);
  return {
    type: 'FeatureCollection',
    features: routes
      .map((route) => routeFeature(route, nodes, now, trafficBaseline, maxAge))
      .filter((feature): feature is Feature<LineString> => feature !== undefined)
  };
}

function routeFeature(
  route: RouteV2 | undefined,
  nodes: ReadonlyMap<string, NodeV2>,
  now: number,
  trafficBaseline: number,
  maxAge: number
): Feature<LineString> | undefined {
  if (!route || Math.max(0, now - route.lastHeard) > maxAge) return undefined;
  const from = nodes.get(route.fromId);
  const to = nodes.get(route.toId);
  if (!from || !to || !validEndpoint(from) || !validEndpoint(to)) return undefined;
  const visual = routeVisualProperties(route, now, trafficBaseline);
  return {
    type: 'Feature',
    id: route.id,
    geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [to.lng, to.lat]] },
    properties: {
      id: route.id,
      fromId: route.fromId,
      toId: route.toId,
      recent: isRecentNeighborRoute(route, now),
      color: payloadColor(route.lastKind),
      lastKind: route.lastKind,
      width: visual.width,
      glowWidth: visual.glowWidth,
      opacity: visual.opacity
    }
  };
}

function routeTrafficBaseline(routes: readonly RouteV2[], now: number): number {
  if (routes.length === 0) return 0;
  let logTotal = 0;
  for (const route of routes) logTotal += Math.log1p(decayedRouteTraffic(route.traffic, route.lastHeard, now));
  return Math.expm1(logTotal / routes.length);
}

function validEndpoint(endpoint: EndpointV2): boolean {
  return Number.isFinite(endpoint.lat) && Number.isFinite(endpoint.lng) && Math.abs(endpoint.lat) <= 90 && Math.abs(endpoint.lng) <= 180;
}

function roleColor(role: NodeV2['role']): string {
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

export function effectiveRouteWindowMS(window: RouteWindow, zoom: number): number {
  if (window === '15m') return 15 * 60_000;
  if (window === '1h') return 60 * 60_000;
  if (window === '6h') return 6 * 60 * 60_000;
  if (window === '24h') return ROUTE_MAX_AGE_MS;
  if (zoom < 5.5) return 15 * 60_000;
  if (zoom < 7.5) return 60 * 60_000;
  if (zoom < 9.5) return 6 * 60 * 60_000;
  return ROUTE_MAX_AGE_MS;
}

export function routeWindowLabel(window: RouteWindow, zoom: number): string {
  const age = effectiveRouteWindowMS(window, zoom);
  const label = age === 15 * 60_000 ? '15m' : age === 60 * 60_000 ? '1h' : age === 6 * 60 * 60_000 ? '6h' : '24h';
  return window === 'auto' ? `Auto · ${label}` : label;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const progress = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
