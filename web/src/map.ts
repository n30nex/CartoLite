import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type GeoJSONSourceDiff,
  type MapMouseEvent
} from 'maplibre-gl';
import type {
  Feature,
  FeatureCollection,
  LineString,
  Point
} from 'geojson';
import canadaRegionsURL from './assets/meshmapper-canada-regions.geojson?url';
import { cartoVectorRequestURL, cartoVectorStyle } from './basemap';
import { RegionCanvas } from './regionCanvas';
import type { RegionLinePiece, RegionWorkerOutput } from './regions';
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
const ACTIVITY_HEAT_SOURCE_ID = 'activity-heat-source';
const REGION_ATTRIBUTION_SOURCE_ID = 'meshmapper-canada-regions';
const ROUTE_TRUNK_SOURCE_ID = 'route-trunks';
const ROUTE_DETAIL_SOURCE_ID = 'route-details';
export const HEATMAP_LAYER_ID = 'activity-heat';
export const ROUTE_HIT_LAYER_ID = 'route-hit';
export const NODE_HIT_LAYER_ID = 'node-hit';
export const ROUTE_FILTER_LAYER_IDS = [ROUTE_HIT_LAYER_ID] as const;
export const SELECTED_NODE_LAYER_ID = 'selected-node';
export const SELECTED_NODE_OUTER_LAYER_ID = 'selected-node-outer';
export const NEIGHBOR_NODE_LAYER_ID = 'neighbor-nodes';
export const MESHMAP_ATTRIBUTION = 'Canadian regions &copy; <a href="https://meshmapper.net/">MeshMapper</a>, used with permission';
export const ROUTE_HOVER_LAYER_IDS = ['route-hover-glow', 'route-hover-core'] as const;
export const ROUTE_VISUAL_LAYER_IDS = [
  'route-national-glow',
  'route-national-core',
  'route-regional-glow',
  'route-regional-core',
  'route-exact-glow',
  'route-exact-core'
] as const;
export const CLUSTER_HIGHLIGHT_LAYER_ID = 'cluster-highlight';
const NODE_GLOW_LAYER_ID = 'nodes-glow';
const NODE_LAYER_ID = 'nodes';
const NODE_CORE_LAYER_ID = 'node-core';
const NODE_LABEL_LAYER_ID = 'node-labels';
const NODE_BASE_FILTER = ['!', ['has', 'point_count']] as ActiveLayerFilter;
const LOCAL_FONTS = ['Open Sans Regular'];
export const HEAT_RENDER_BUDGET = 600;
const ROUTE_REPRESENTATION_EXACT = 'exact';
const ROUTE_REPRESENTATION_NATIONAL = 'national';
const ROUTE_REPRESENTATION_REGIONAL = 'regional';
const ROUTE_EXACT_SOURCE_MIN_ZOOM = 6.5;
const ROUTE_NATIONAL_MAX_ZOOM = 5.25;
const ROUTE_REGIONAL_MIN_ZOOM = 4.35;
const ROUTE_REGIONAL_MAX_ZOOM = 7.2;
const ROUTE_SOURCE_BUILD_BATCH = 256;
const ROUTE_GLOBAL_NOW = 'routeNow';
const ROUTE_GLOBAL_WINDOW_MS = 'routeWindowMS';
const ROUTE_WINDOW_BUCKETS = [
  { key: '15m', suffix: '15m', ms: 15 * 60_000 },
  { key: '1h', suffix: '1h', ms: 60 * 60_000 },
  { key: '6h', suffix: '6h', ms: 6 * 60 * 60_000 },
  { key: '24h', suffix: '24h', ms: ROUTE_MAX_AGE_MS }
] as const;
const ROUTE_TRUNK_LEVELS = [
  { representation: ROUTE_REPRESENTATION_NATIONAL, zoom: 3.6, gridPixels: 52 },
  { representation: ROUTE_REPRESENTATION_REGIONAL, zoom: 5.4, gridPixels: 80 }
] as const;

export interface LiveMapFocus {
  label: string;
  neighborCount: number;
}

export interface LiveMapOptions {
  regionCanvas: HTMLCanvasElement;
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
  private heatFeatureIDs = new Set<string>();
  private heatScores = new Map<string, number>();
  private routeHeat = new Map<string, { endpointIDs: string[]; score: number }>();
  private heatEpoch = 0;
  private routeDataDirty = true;
  private routeHydrating = false;
  private routeHydrationEpoch = 0;
  private routeSourceRevision = 0;
  private routeClock = 0;
  private appliedRouteWindowMS = 0;
  private routeCollections?: RouteSourceCollections;
  private routeTrunkFeatures = new Map<string, Feature<LineString>>();
  private routeDetailFeatures = new Map<string, Feature<LineString>>();
  private dirtyRouteIDs = new Set<string>();
  private rebuildAllRoutes = true;
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
  private directorTimer?: number;
  private readonly reducedMotion = prefersReducedMotion();
  private readonly regionCanvas: RegionCanvas;
  private freshnessTimer: number;
  private renderEpoch = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly tooltip: HTMLElement,
    private readonly options: LiveMapOptions
  ) {
    this.container.dataset.renderState = 'loading';
    this.container.dataset.routesVisible = 'true';
    this.container.dataset.heatmapVisible = 'true';
    this.container.dataset.regionsVisible = 'false';
    this.container.dataset.regionsLoaded = 'false';
    this.container.dataset.selectedNodeId = '';
    this.container.dataset.neighborRouteCount = '0';
    this.container.dataset.hoveredRouteId = '';
    this.container.dataset.cameraMode = 'idle';
    this.container.dataset.routeSourceRevision = '0';
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
    this.regionCanvas = new RegionCanvas(this.map, options.regionCanvas);
    this.container.dataset.routeRenderer = 'maplibre';
    this.updateRouteRepresentation();
    this.map.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: MESHMAP_ATTRIBUTION
    }), 'bottom-right');
    this.map.on('load', () => this.installLayers());
    this.map.on('zoom', this.updateRouteRepresentation);
    this.map.on('zoomend', this.handleZoomEnd);
    this.freshnessTimer = window.setInterval(() => this.refreshRouteClock(), 60_000);
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
      for (const routeID of routeFeatureIDs) this.dirtyRouteIDs.add(routeID);
      this.routeDataDirty = true;
      if (!this.routeHydrating && this.map.getSource(ROUTE_DETAIL_SOURCE_ID)) this.hydrateRouteSource();
    }
    if (heatNodeIDs.size > 0) {
      if (this.heatmapVisible) changed = this.updateHeatFeatures([...heatNodeIDs]) || changed;
      else this.heatDataDirty = true;
    }
    if (changes?.nodes?.length || changes?.routes?.length || routeFeatureIDs.size > 0) {
      this.updateFocusData();
      if (this.hoveredRouteID && !isRouteInspectable(
        state.routes,
        this.selectedNodeID,
        this.hoveredRouteID,
        Date.now(),
        this.effectiveRouteAgeMS()
      )) this.clearRouteInspection();
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

    this.routeDataDirty = true;
    this.rebuildAllRoutes = true;
    this.dirtyRouteIDs.clear();
    this.hydrateRouteSource(now);

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

  private hydrateRouteSource(now = Date.now()): void {
    const detailSource = this.map.getSource(ROUTE_DETAIL_SOURCE_ID) as GeoJSONSource | undefined;
    const trunkSource = this.map.getSource(ROUTE_TRUNK_SOURCE_ID) as GeoJSONSource | undefined;
    if (!detailSource || !trunkSource) return;
    const hydrationEpoch = ++this.routeHydrationEpoch;
    const allRoutes = [...this.routesByID.values()];
    const routeBaseline = routeTrafficBaseline(allRoutes, now);
    const rebuildAll = this.rebuildAllRoutes || this.routeDetailFeatures.size === 0;
    const dirtyRouteIDs = new Set(this.dirtyRouteIDs);
    this.rebuildAllRoutes = false;
    this.dirtyRouteIDs.clear();
    this.routeHydrating = true;
    this.routeDataDirty = false;
    this.markRendering();

    const active = (): boolean => hydrationEpoch === this.routeHydrationEpoch
      && Boolean(this.map.getSource(ROUTE_DETAIL_SOURCE_ID))
      && Boolean(this.map.getSource(ROUTE_TRUNK_SOURCE_ID));
    const fail = (error: unknown): void => {
      if (!active()) return;
      this.routeHydrating = false;
      this.routeDataDirty = true;
      this.rebuildAllRoutes = true;
      this.container.dataset.renderState = 'idle';
      console.warn('Route source update failed:', error instanceof Error ? error.message : error);
    };
    const finish = (): void => {
      if (!active()) return;
      this.routeHydrating = false;
      if (this.routeDataDirty) {
        this.hydrateRouteSource();
        return;
      }
      this.emitRouteWindowChange();
      this.markRendering();
    };
    void buildRouteSourceCollections(
      allRoutes,
      this.nodesByID,
      now,
      ROUTE_MAX_AGE_MS,
      routeBaseline,
      this.routeDetailFeatures,
      dirtyRouteIDs,
      rebuildAll,
      active
    ).then((collections) => {
      if (!collections || !active()) return;
      this.routeCollections = collections;
      this.container.dataset.exactRoutesLoaded = 'true';
      this.container.dataset.trunkRepresentationsLoaded = `${ROUTE_REPRESENTATION_NATIONAL},${ROUTE_REPRESENTATION_REGIONAL}`;
      this.container.dataset.routeBuildMaxSliceMs = collections.maxSliceMS.toFixed(1);
      const sourceStarted = performance.now();
      const trunkChanged = this.updateRouteSource(
        ROUTE_TRUNK_SOURCE_ID,
        trunkSource,
        this.routeTrunkFeatures,
        [...collections.national.features, ...collections.regional.features]
      );
      const detailChanged = this.updateRouteSource(
        ROUTE_DETAIL_SOURCE_ID,
        detailSource,
        this.routeDetailFeatures,
        collections.exact.features
      );
      this.container.dataset.routeSourceDispatchMs = (performance.now() - sourceStarted).toFixed(1);
      if (trunkChanged || detailChanged) {
        this.routeSourceRevision += 1;
        this.container.dataset.routeSourceRevision = String(this.routeSourceRevision);
      }
      this.applyRouteTimeState(now, this.routeClock === 0);
    })
      .then(finish)
      .catch(fail);
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
      if (sourceID === ACTIVITY_HEAT_SOURCE_ID) this.heatDataDirty = true;
    }
    return true;
  }

  private updateRouteSource(
    sourceID: string,
    source: GeoJSONSource,
    previous: Map<string, Feature<LineString>>,
    features: readonly Feature<LineString>[]
  ): boolean {
    const next = new Map<string, Feature<LineString>>();
    const diff: GeoJSONSourceDiff = {};
    for (const feature of features) {
      if (feature.id === undefined) continue;
      const id = String(feature.id);
      next.set(id, feature);
      const old = previous.get(id);
      if (!old) {
        (diff.add ??= []).push(feature);
        continue;
      }
      if (sameLineFeature(old, feature)) continue;
      (diff.update ??= []).push({
        id,
        newGeometry: feature.geometry,
        addOrUpdateProperties: Object.entries(feature.properties ?? {}).map(([key, value]) => ({ key, value }))
      });
    }
    for (const id of previous.keys()) {
      if (!next.has(id)) (diff.remove ??= []).push(id);
    }
    if (!diff.add?.length && !diff.update?.length && !diff.remove?.length) return false;
    try {
      if (previous.size === 0) {
        source.setData({ type: 'FeatureCollection', features: [...next.values()] });
      } else {
        source.updateData(diff);
      }
      previous.clear();
      for (const [id, feature] of next) previous.set(id, feature);
      return true;
    } catch (error: unknown) {
      throw new Error(`${sourceID} update failed`, { cause: error });
    }
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

  follow(packet: PacketView): void {
    const endpoints = packetEndpoints(packet).filter(validEndpoint);
    if (endpoints.length === 0) return;
    const container = this.map.getContainer();
    const viewport = { width: container.clientWidth, height: container.clientHeight };
    const inside = endpoints.every((endpoint) => isPointInSafeArea(
      this.map.project([endpoint.lng, endpoint.lat]),
      viewport,
    ));
    if (inside || this.map.isMoving()) return;
    const now = Date.now();
    if (!canMoveLiveFollow(this.lastFollowMoveAt, now)) return;
    this.lastFollowMoveAt = now;
    this.container.dataset.cameraMode = 'director';
    if (this.directorTimer !== undefined) window.clearTimeout(this.directorTimer);
    this.directorTimer = window.setTimeout(() => {
      this.directorTimer = undefined;
      this.container.dataset.cameraMode = 'idle';
    }, 900);
    if (endpoints.length === 1) {
      const center: [number, number] = [endpoints[0]!.lng, endpoints[0]!.lat];
      if (this.reducedMotion) this.map.jumpTo({ center });
      else this.map.easeTo({ center, duration: 620, essential: false });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    for (const endpoint of endpoints) bounds.extend([endpoint.lng, endpoint.lat]);
    const horizontal = container.clientWidth <= 620 ? 56 : 104;
    this.map.fitBounds(bounds, {
      padding: { top: 86, right: horizontal, bottom: 72, left: horizontal },
      maxZoom: this.map.getZoom(),
      duration: this.reducedMotion ? 0 : 720,
      essential: false,
    });
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
    const detailSource = this.map.getSource(ROUTE_DETAIL_SOURCE_ID) as GeoJSONSource | undefined;
    const needsHydration = visible && this.routeDataDirty && Boolean(detailSource);
    const visualApplied = applyRouteVisualLayerVisibility(this.map, visible);
    const hitApplied = this.selectedNodeID !== null && applyRouteHitLayerVisibility(this.map, visible);
    const neighborsApplied = this.selectedNodeID !== null && applyNeighborRingVisibility(this.map, visible);
    if (needsHydration) this.hydrateRouteSource();
    if (!visible) this.clearRouteInspection();
    if (!visible) this.map.getCanvas().style.cursor = '';
    if (!needsHydration && (visualApplied || Boolean(detailSource) || hitApplied || neighborsApplied)) this.markRendering();
  }

  setHeatmapVisible(visible: boolean): void {
    this.heatmapVisible = visible;
    this.container.dataset.heatmapVisible = String(visible);
    const source = this.map.getSource(ACTIVITY_HEAT_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    if (visible && this.heatDataDirty) {
      this.refreshHeatSource();
    } else if (!visible) {
      source.setData(EMPTY_POINTS);
      this.heatFeatureIDs.clear();
      this.heatDataDirty = true;
    }
    this.markRendering();
  }

  setRouteWindow(window: RouteWindow): void {
    if (this.routeWindow === window) return;
    this.routeWindow = window;
    this.applyRouteTimeState();
    if (this.selectedNodeID) {
      this.updateFocusData();
      this.applyFocusState();
    }
    if (this.hoveredRouteID && !isRouteInspectable(
      this.lastState?.routes ?? [],
      this.selectedNodeID,
      this.hoveredRouteID,
      Date.now(),
      this.effectiveRouteAgeMS()
    )) this.clearRouteInspection();
    this.emitRouteWindowChange();
    this.markRendering();
  }

  setRegionsVisible(visible: boolean): void {
    this.regionsVisible = visible;
    this.container.dataset.regionsVisible = String(visible);
    this.regionCanvas.setVisible(visible);
    if (visible) {
      if (this.regionsLoaded) return;
      this.container.dataset.renderState = 'rendering';
      this.ensureRegionsData();
      return;
    }
  }

  destroy(): void {
    this.routeHydrationEpoch += 1;
    this.routeHydrating = false;
    this.renderEpoch += 1;
    window.clearInterval(this.freshnessTimer);
    if (this.directorTimer !== undefined) window.clearTimeout(this.directorTimer);
    if (this.clusterFlashTimer !== undefined) window.clearTimeout(this.clusterFlashTimer);
    this.map.off('zoom', this.updateRouteRepresentation);
    this.map.off('zoomend', this.handleZoomEnd);
    this.regionCanvas.destroy();
    this.map.remove();
  }

  private updateRouteRepresentation = (): void => {
    this.container.dataset.routeRepresentation = routeRepresentationForZoom(this.map.getZoom());
  };

  private handleZoomEnd = (): void => {
    if (this.routeWindow !== 'auto') {
      this.emitRouteWindowChange();
      return;
    }
    this.applyRouteTimeState();
    if (this.selectedNodeID) {
      this.updateFocusData();
      this.applyFocusState();
    }
    this.emitRouteWindowChange();
    this.markRendering();
  };

  private refreshRouteClock(): void {
    this.applyRouteTimeState(Date.now(), true);
    if (this.selectedNodeID) {
      this.updateFocusData();
      this.applyFocusState();
    }
    if (this.hoveredRouteID && !isRouteInspectable(
      this.lastState?.routes ?? [],
      this.selectedNodeID,
      this.hoveredRouteID,
      Date.now(),
      this.effectiveRouteAgeMS()
    )) this.clearRouteInspection();
    this.markRendering();
  }

  private applyRouteTimeState(now = Date.now(), refreshClock = false): void {
    const maxAge = this.effectiveRouteAgeMS();
    if (this.map.getSource(ROUTE_TRUNK_SOURCE_ID)) {
      if (refreshClock || this.routeClock === 0) {
        this.routeClock = now;
        this.map.setGlobalStateProperty(ROUTE_GLOBAL_NOW, now);
      }
      if (this.appliedRouteWindowMS !== maxAge) {
        this.appliedRouteWindowMS = maxAge;
        this.map.setGlobalStateProperty(ROUTE_GLOBAL_WINDOW_MS, maxAge);
      }
    }
    this.updateRouteWindowDiagnostics(this.routeClock || now, maxAge);
  }

  private updateRouteWindowDiagnostics(now: number, maxAge: number): void {
    const eligible = countEligibleRoutes(this.routesByID.values(), this.nodesByID, now, maxAge);
    this.container.dataset.eligibleRoutes = String(eligible);
    const collections = this.routeCollections;
    if (!collections) return;
    const national = routeWindowSummary(collections.national.features, maxAge);
    const regional = routeWindowSummary(collections.regional.features, maxAge);
    this.container.dataset.nationalRouteTrunks = String(national.trunks);
    this.container.dataset.regionalRouteTrunks = String(regional.trunks);
    this.container.dataset.nationalRoutesRepresented = String(national.routes);
    this.container.dataset.regionalRoutesRepresented = String(regional.routes);
  }

  private emitRouteWindowChange(): void {
    this.options.onRouteWindowChange?.(routeWindowLabel('auto', this.map.getZoom()));
  }

  private effectiveRouteAgeMS(): number {
    return effectiveRouteWindowMS(this.routeWindow, this.map.getZoom());
  }

  private installLayers(): void {
    this.map.addSource(REGION_ATTRIBUTION_SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_POINTS,
      maxzoom: 12,
      attribution: MESHMAP_ATTRIBUTION
    });

    this.map.addSource(ACTIVITY_HEAT_SOURCE_ID, { type: 'geojson', data: EMPTY_POINTS, maxzoom: 14 });
    this.map.addLayer({
      id: HEATMAP_LAYER_ID,
      type: 'heatmap',
      source: ACTIVITY_HEAT_SOURCE_ID,
      paint: {
        'heatmap-weight': [
          'interpolate', ['linear'], ['number', ['get', 'weight'], 0],
          0, 0,
          0.2, 0.1,
          0.55, 0.6,
          1, 1.25
        ],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.42, 7, 0.7, 10, 0.9, 16, 1.05],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 12, 6, 19, 9, 26, 13, 33, 16, 38],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(3,7,11,0)',
          0.08, 'rgba(20,109,118,0.13)',
          0.25, 'rgba(29,166,157,0.34)',
          0.48, 'rgba(69,223,195,0.52)',
          0.7, 'rgba(235,187,75,0.67)',
          0.88, 'rgba(248,137,88,0.76)',
          1, 'rgba(255,202,107,0.84)'
        ],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.62, 7, 0.53, 10, 0.34, 14, 0.16, 16, 0.08]
      }
    });
    this.map.addSource(ROUTE_TRUNK_SOURCE_ID, { type: 'geojson', data: EMPTY_LINES, maxzoom: 8 });
    this.map.addSource(ROUTE_DETAIL_SOURCE_ID, { type: 'geojson', data: EMPTY_LINES, maxzoom: 16 });
    this.applyRouteTimeState(Date.now(), true);
    const routeVisibility = this.routesVisible ? 'visible' : 'none';
    this.map.addLayer({
      id: ROUTE_VISUAL_LAYER_IDS[0],
      type: 'line',
      source: ROUTE_TRUNK_SOURCE_ID,
      maxzoom: ROUTE_NATIONAL_MAX_ZOOM,
      filter: routeTrunkFilter(ROUTE_REPRESENTATION_NATIONAL),
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: routeVisibility },
      paint: {
        'line-color': routeTrunkColorExpression(),
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, ['*', routeTrunkMetricExpression('glowWidth'), 0.72], 5.25, ['*', routeTrunkMetricExpression('glowWidth'), 0.46]],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, ['*', routeTrunkMetricExpression('opacity'), 0.34], 4.45, ['*', routeTrunkMetricExpression('opacity'), 0.28], 5.25, 0],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 3, 2.4, 5.25, 1.5]
      }
    });
    this.map.addLayer({
      id: ROUTE_VISUAL_LAYER_IDS[1],
      type: 'line',
      source: ROUTE_TRUNK_SOURCE_ID,
      maxzoom: ROUTE_NATIONAL_MAX_ZOOM,
      filter: routeTrunkFilter(ROUTE_REPRESENTATION_NATIONAL),
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: routeVisibility },
      paint: {
        'line-color': routeTrunkColorExpression(),
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, ['*', routeTrunkMetricExpression('width'), 0.72], 5.25, ['*', routeTrunkMetricExpression('width'), 0.9]],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, ['*', routeTrunkMetricExpression('opacity'), 0.72], 4.45, ['*', routeTrunkMetricExpression('opacity'), 0.58], 5.25, 0]
      }
    });
    this.map.addLayer({
      id: ROUTE_VISUAL_LAYER_IDS[2],
      type: 'line',
      source: ROUTE_TRUNK_SOURCE_ID,
      minzoom: ROUTE_REGIONAL_MIN_ZOOM,
      maxzoom: ROUTE_REGIONAL_MAX_ZOOM,
      filter: routeTrunkFilter(ROUTE_REPRESENTATION_REGIONAL),
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: routeVisibility },
      paint: {
        'line-color': routeTrunkColorExpression(),
        'line-width': ['interpolate', ['linear'], ['zoom'], 4.35, ['*', routeTrunkMetricExpression('glowWidth'), 0.38], 5.2, ['*', routeTrunkMetricExpression('glowWidth'), 0.66], 7.2, ['*', routeTrunkMetricExpression('glowWidth'), 0.42]],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 4.35, 0, 5.1, ['*', routeTrunkMetricExpression('opacity'), 0.3], 6.35, ['*', routeTrunkMetricExpression('opacity'), 0.24], 7.2, 0],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 4.35, 1.5, 7.2, 2.1]
      }
    });
    this.map.addLayer({
      id: ROUTE_VISUAL_LAYER_IDS[3],
      type: 'line',
      source: ROUTE_TRUNK_SOURCE_ID,
      minzoom: ROUTE_REGIONAL_MIN_ZOOM,
      maxzoom: ROUTE_REGIONAL_MAX_ZOOM,
      filter: routeTrunkFilter(ROUTE_REPRESENTATION_REGIONAL),
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: routeVisibility },
      paint: {
        'line-color': routeTrunkColorExpression(),
        'line-width': ['interpolate', ['linear'], ['zoom'], 4.35, ['*', routeTrunkMetricExpression('width'), 0.58], 5.2, ['*', routeTrunkMetricExpression('width'), 0.88], 7.2, routeTrunkMetricExpression('width')],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 4.35, 0, 5.1, ['*', routeTrunkMetricExpression('opacity'), 0.68], 6.35, ['*', routeTrunkMetricExpression('opacity'), 0.6], 7.2, 0]
      }
    });
    this.map.addLayer({
      id: ROUTE_VISUAL_LAYER_IDS[4],
      type: 'line',
      source: ROUTE_DETAIL_SOURCE_ID,
      minzoom: ROUTE_EXACT_SOURCE_MIN_ZOOM,
      filter: routeExactFilter(),
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        'line-sort-key': ['get', 'lastHeard'],
        visibility: routeVisibility
      },
      paint: {
        'line-color': routeColorExpression(),
        'line-width': ['interpolate', ['linear'], ['zoom'], 5.8, ['*', ['get', 'glowWidth'], 0.48], 8, ['*', ['get', 'glowWidth'], 0.78], 12, ['get', 'glowWidth']],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 5.8, 0, 6.55, ['*', ['get', 'opacity'], 0.08], 8, ['*', ['get', 'opacity'], 0.16], 12, ['*', ['get', 'opacity'], 0.2]],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 5.8, 1.2, 9, 2.2, 14, 2.8]
      }
    });
    this.map.addLayer({
      id: ROUTE_VISUAL_LAYER_IDS[5],
      type: 'line',
      source: ROUTE_DETAIL_SOURCE_ID,
      minzoom: ROUTE_EXACT_SOURCE_MIN_ZOOM,
      filter: routeExactFilter(),
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        'line-sort-key': ['get', 'lastHeard'],
        visibility: routeVisibility
      },
      paint: {
        'line-color': routeColorExpression(),
        'line-width': ['interpolate', ['linear'], ['zoom'], 5.8, ['*', ['get', 'width'], 0.58], 8, ['*', ['get', 'width'], 0.78], 12, ['*', ['get', 'width'], 1.08], 16, ['*', ['get', 'width'], 1.18]],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 5.8, 0, 6.55, ['*', ['get', 'opacity'], 0.34], 8, ['*', ['get', 'opacity'], 0.64], 12, ['*', ['get', 'opacity'], 0.82]]
      }
    });
    this.map.addLayer({
      id: ROUTE_HOVER_LAYER_IDS[0],
      type: 'line',
      source: ROUTE_DETAIL_SOURCE_ID,
      filter: routeHoverFilter(null),
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
      source: ROUTE_DETAIL_SOURCE_ID,
      filter: routeHoverFilter(null),
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
      source: ROUTE_DETAIL_SOURCE_ID,
      filter: routeWindowFilter(),
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 9, 8, 13, 13, 18],
        'line-opacity': 0.001
      }
    });
    applyRouteVisualLayerVisibility(this.map, this.routesVisible);
    applyRouteSelectionFilter(this.map, this.selectedNodeID);
    applyRouteHitLayerVisibility(this.map, this.routesVisible && this.selectedNodeID !== null);
    applyRouteHoverFilter(this.map, null);
    if (this.regionsVisible) this.ensureRegionsData();

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
    if (!this.map.getSource(REGION_ATTRIBUTION_SOURCE_ID)) return;
    this.regionsLoad = this.loadRegionsData()
      .then(() => {
        this.regionsLoaded = true;
        this.container.dataset.regionsLoaded = 'true';
        if (this.regionsVisible) this.markRendering();
      })
      .catch((error: unknown) => {
        console.warn('Region boundary load failed:', error instanceof Error ? error.message : error);
        this.container.dataset.renderState = 'idle';
      })
      .finally(() => {
        this.regionsLoad = undefined;
      });
  }

  private loadRegionsData(): Promise<void> {
    const worker = new Worker(new URL('./regionWorker.ts', import.meta.url), {
      type: 'module',
      name: 'cartolite-regions'
    });
    const pieces: RegionLinePiece[] = [];
    let labels: FeatureCollection<Point> | undefined;

    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        worker.terminate();
        reject(error);
      };
      worker.onerror = (event): void => fail(new Error(event.message || 'regional worker failed'));
      worker.onmessage = (event: MessageEvent<RegionWorkerOutput>): void => {
        const message = event.data;
        if (message.type === 'labels') {
          labels = message.labels;
          return;
        }
        if (message.type === 'pieces') {
          pieces.push(...message.pieces);
          return;
        }
        if (message.type === 'error') {
          fail(new Error(message.message));
          return;
        }
        if (settled) return;
        settled = true;
        if (!labels) {
          reject(new Error('regional worker returned no labels'));
          return;
        }
        void this.regionCanvas.setData(pieces, labels).then(() => resolve()).catch(reject);
      };
      worker.postMessage({ url: canadaRegionsURL });
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
        if (!this.routeHydrating && source && this.map.isSourceLoaded(sourceID)) {
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
    this.updateFocusData();
    this.applyFocusState();
    if (nodeID === null && this.tooltip.dataset.kind === 'route') this.hideTooltip();
    this.markRendering();
  }

  private updateFocusData(): void {
    const routes = recentNeighborRoutes(
      this.lastState?.routes ?? [],
      this.selectedNodeID,
      Date.now(),
      this.effectiveRouteAgeMS()
    );
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
type FocusMap = Pick<maplibregl.Map, 'getLayer' | 'setFilter' | 'setPaintProperty' | 'setLayoutProperty'>;
type InteractiveLayerMap = Pick<maplibregl.Map, 'getLayer' | 'setFilter' | 'setLayoutProperty'>;
type LayerFilter = Parameters<maplibregl.Map['setFilter']>[1];
type ActiveLayerFilter = Exclude<LayerFilter, null | undefined>;

export function applyRouteHitLayerVisibility(map: RouteLayerMap, visible: boolean): boolean {
  if (!map.getLayer(ROUTE_HIT_LAYER_ID)) return false;
  map.setLayoutProperty(ROUTE_HIT_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
  return true;
}

export function applyRouteVisualLayerVisibility(map: RouteLayerMap, visible: boolean): boolean {
  let applied = false;
  for (const layerID of ROUTE_VISUAL_LAYER_IDS) {
    if (!map.getLayer(layerID)) continue;
    map.setLayoutProperty(layerID, 'visibility', visible ? 'visible' : 'none');
    applied = true;
  }
  return applied;
}

export function applyNeighborRingVisibility(map: RouteLayerMap, visible: boolean): boolean {
  if (!map.getLayer(NEIGHBOR_NODE_LAYER_ID)) return false;
  map.setLayoutProperty(NEIGHBOR_NODE_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
  return true;
}

export function applyRouteSelectionFilter(map: RouteFilterMap, selectedNodeID: string | null): boolean {
  const neighbor = neighborRouteFilter(selectedNodeID);
  const filter = neighbor
    ? ['all', routeWindowFilter(), neighbor] as ActiveLayerFilter
    : routeWindowFilter();
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

export function applyRouteHoverFilter(map: InteractiveLayerMap, routeID: string | null): boolean {
  let applied = false;
  for (const layerID of ROUTE_HOVER_LAYER_IDS) {
    if (!map.getLayer(layerID)) continue;
    map.setFilter(layerID, routeHoverFilter(routeID));
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

export function routeRepresentationFilter(representation: string): ActiveLayerFilter {
  return ['==', ['get', 'representation'], representation] as ActiveLayerFilter;
}

export function routeWindowFilter(): ActiveLayerFilter {
  return [
    '>=',
    ['get', 'lastHeard'],
    ['-',
      ['number', ['global-state', ROUTE_GLOBAL_NOW], 0],
      ['number', ['global-state', ROUTE_GLOBAL_WINDOW_MS], ROUTE_MAX_AGE_MS]
    ]
  ] as ActiveLayerFilter;
}

export function routeExactFilter(): ActiveLayerFilter {
  return ['all', routeRepresentationFilter(ROUTE_REPRESENTATION_EXACT), routeWindowFilter()] as ActiveLayerFilter;
}

export function routeHoverFilter(routeID: string | null): ActiveLayerFilter {
  return ['all', routeIDFilter(routeID), routeWindowFilter()] as ActiveLayerFilter;
}

export function routeTrunkFilter(representation: string): ActiveLayerFilter {
  return [
    'all',
    routeRepresentationFilter(representation),
    ['>', routeTrunkMetricExpression('routeCount'), 0]
  ] as ActiveLayerFilter;
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
  now = Date.now(),
  maxAge = ROUTE_MAX_AGE_MS
): boolean {
  if (!routeID) return false;
  return recentNeighborRoutes(routes, selectedNodeID, now, maxAge).some((route) => route.id === routeID);
}

export function packetEndpoints(packet: PacketView): EndpointV2[] {
  if (packet.mode === 'observer') return [packet.observer];
  const endpoints: EndpointV2[] = [];
  const seen = new Set<string>();
  for (const segment of packet.segments) {
    for (const endpoint of [segment.from, segment.to]) {
      const key = `${endpoint.id}|${endpoint.lat}|${endpoint.lng}`;
      if (seen.has(key)) continue;
      seen.add(key);
      endpoints.push(endpoint);
    }
  }
  return endpoints;
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

export function routeTrunkMetricExpression(
  metric: 'routeCount' | 'width' | 'glowWidth' | 'opacity' | 'color'
): ExpressionSpecification {
  return [
    'match',
    ['number', ['global-state', ROUTE_GLOBAL_WINDOW_MS], ROUTE_MAX_AGE_MS],
    ...ROUTE_WINDOW_BUCKETS.flatMap((bucket) => [bucket.ms, ['get', `${metric}${bucket.suffix}`]]),
    ['get', `${metric}24h`]
  ] as ExpressionSpecification;
}

export function routeTrunkColorExpression(): ExpressionSpecification {
  return ['to-color', routeTrunkMetricExpression('color')];
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
      .map((id) => heatFeature(id, nodes, scores))
      .filter((feature): feature is Feature<Point> => feature !== undefined)
      .sort((left, right) => {
        const leftID = String(left.id);
        const rightID = String(right.id);
        return (scores.get(rightID) ?? 0) - (scores.get(leftID) ?? 0) || leftID.localeCompare(rightID);
      })
      .slice(0, HEAT_RENDER_BUDGET)
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

export function routeRenderCandidates(
  routes: readonly RouteV2[],
  now = Date.now(),
  maxAge = ROUTE_MAX_AGE_MS
): RouteV2[] {
  return routes
    .filter((route) => Math.max(0, now - route.lastHeard) <= maxAge)
    .sort((left, right) => left.lastHeard - right.lastHeard || left.id.localeCompare(right.id));
}

export function routeVisualCollection(
  routes: readonly RouteV2[],
  nodes: ReadonlyMap<string, NodeV2>,
  now = Date.now(),
  maxAge = ROUTE_MAX_AGE_MS,
  trafficBaseline = routeTrafficBaseline(routes, now)
): FeatureCollection<LineString> {
  const exact = routeCollection(routes, nodes, now, maxAge, trafficBaseline);
  return {
    type: 'FeatureCollection',
    features: [
      ...routeTrunkFeatures(exact.features, ROUTE_TRUNK_LEVELS[0], now),
      ...routeTrunkFeatures(exact.features, ROUTE_TRUNK_LEVELS[1], now),
      ...exact.features
    ]
  };
}

export function routeCollection(
  routes: readonly RouteV2[],
  nodes: ReadonlyMap<string, NodeV2>,
  now = Date.now(),
  maxAge = ROUTE_MAX_AGE_MS,
  trafficBaseline = routeTrafficBaseline(routes, now)
): FeatureCollection<LineString> {
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
      representation: ROUTE_REPRESENTATION_EXACT,
      routeCount: 1,
      color: payloadColor(route.lastKind),
      lastKind: route.lastKind,
      lastHeard: route.lastHeard,
      width: visual.width,
      glowWidth: visual.glowWidth,
      opacity: visual.opacity
    }
  };
}

interface RouteTrunkWindowAccumulator {
  count: number;
  newestAt: number;
  color: string;
  opacity: number;
}

interface RouteTrunkAccumulator {
  key: string;
  count: number;
  fromCell: string;
  toCell: string;
  windows: Record<(typeof ROUTE_WINDOW_BUCKETS)[number]['key'], RouteTrunkWindowAccumulator>;
}

interface RouteSourceCollections {
  exact: FeatureCollection<LineString>;
  national: FeatureCollection<LineString>;
  regional: FeatureCollection<LineString>;
  maxSliceMS: number;
}

async function buildRouteSourceCollections(
  routes: readonly RouteV2[],
  nodes: ReadonlyMap<string, NodeV2>,
  now: number,
  maxAge: number,
  trafficBaseline: number,
  previous: ReadonlyMap<string, Feature<LineString>>,
  dirtyRouteIDs: ReadonlySet<string>,
  rebuildAll: boolean,
  active: () => boolean
): Promise<RouteSourceCollections | undefined> {
  const exact: Feature<LineString>[] = [];
  const national = new Map<string, RouteTrunkAccumulator>();
  const regional = new Map<string, RouteTrunkAccumulator>();
  let maxSliceMS = 0;

  for (let offset = 0; offset < routes.length; offset += ROUTE_SOURCE_BUILD_BATCH) {
    await nextAnimationFrame();
    if (!active()) return undefined;
    const sliceStarted = performance.now();
    const end = Math.min(routes.length, offset + ROUTE_SOURCE_BUILD_BATCH);
    for (let index = offset; index < end; index += 1) {
      const route = routes[index];
      if (!route || Math.max(0, now - route.lastHeard) > maxAge) continue;
      const cached = !rebuildAll && !dirtyRouteIDs.has(route.id) ? previous.get(route.id) : undefined;
      const feature = cached ?? routeFeature(route, nodes, now, trafficBaseline, maxAge);
      if (!feature) continue;
      exact.push(feature);
      addRouteToTrunks(national, feature, ROUTE_TRUNK_LEVELS[0], now);
      addRouteToTrunks(regional, feature, ROUTE_TRUNK_LEVELS[1], now);
    }
    maxSliceMS = Math.max(maxSliceMS, performance.now() - sliceStarted);
  }

  if (!active()) return undefined;
  return {
    exact: { type: 'FeatureCollection', features: exact },
    national: { type: 'FeatureCollection', features: routeTrunksFromMap(national, ROUTE_TRUNK_LEVELS[0]) },
    regional: { type: 'FeatureCollection', features: routeTrunksFromMap(regional, ROUTE_TRUNK_LEVELS[1]) },
    maxSliceMS
  };
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function routeTrunkFeatures(
  routes: readonly Feature<LineString>[],
  level: typeof ROUTE_TRUNK_LEVELS[number],
  now: number
): Feature<LineString>[] {
  const trunks = new Map<string, RouteTrunkAccumulator>();
  for (const route of routes) addRouteToTrunks(trunks, route, level, now);
  return routeTrunksFromMap(trunks, level);
}

function addRouteToTrunks(
  trunks: Map<string, RouteTrunkAccumulator>,
  route: Feature<LineString>,
  level: typeof ROUTE_TRUNK_LEVELS[number],
  now: number
): void {
  const first = route.geometry.coordinates[0];
  const last = route.geometry.coordinates[route.geometry.coordinates.length - 1];
  if (!first || !last) return;
  let from = [first[0]!, first[1]!] as [number, number];
  let to = [last[0]!, last[1]!] as [number, number];
  let fromCell = routeCellKey(from, level.zoom, level.gridPixels);
  let toCell = routeCellKey(to, level.zoom, level.gridPixels);
  if (fromCell > toCell || (fromCell === toCell && compareCoordinates(from, to) > 0)) {
    [from, to] = [to, from];
    [fromCell, toCell] = [toCell, fromCell];
  }
  const key = `${fromCell}|${toCell}`;
  const properties = route.properties ?? {};
  const lastHeard = Number(properties.lastHeard ?? 0);
  const opacity = Number(properties.opacity ?? 0);
  let trunk = trunks.get(key);
  if (!trunk) {
    trunk = {
      key,
      count: 0,
      fromCell,
      toCell,
      windows: Object.fromEntries(ROUTE_WINDOW_BUCKETS.map((bucket) => [bucket.key, {
        count: 0,
        newestAt: 0,
        color: '#73d9cf',
        opacity: 0
      }])) as RouteTrunkAccumulator['windows']
    };
    trunks.set(key, trunk);
  }
  trunk.count += 1;
  const age = Math.max(0, now - lastHeard);
  for (const bucket of ROUTE_WINDOW_BUCKETS) {
    if (age > bucket.ms) continue;
    const metrics = trunk.windows[bucket.key];
    metrics.count += 1;
    metrics.opacity = Math.max(metrics.opacity, opacity);
    if (lastHeard >= metrics.newestAt) {
      metrics.newestAt = lastHeard;
      metrics.color = String(properties.color ?? metrics.color);
    }
  }
}

function routeTrunksFromMap(
  trunks: ReadonlyMap<string, RouteTrunkAccumulator>,
  level: typeof ROUTE_TRUNK_LEVELS[number]
): Feature<LineString>[] {
  return [...trunks.values()]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((trunk): Feature<LineString> => {
      const anchors = routeTrunkAnchors(trunk.fromCell, trunk.toCell, level.zoom, level.gridPixels);
      const properties: Record<string, string | number> = { representation: level.representation };
      for (const bucket of ROUTE_WINDOW_BUCKETS) {
        const metrics = trunk.windows[bucket.key];
        const density = Math.log2(metrics.count + 1);
        properties[`routeCount${bucket.suffix}`] = metrics.count;
        properties[`color${bucket.suffix}`] = metrics.color;
        properties[`lastHeard${bucket.suffix}`] = metrics.newestAt;
        properties[`width${bucket.suffix}`] = Math.min(5.4, 0.72 + density * 0.6);
        properties[`glowWidth${bucket.suffix}`] = Math.min(10, 1.8 + density * 1.05);
        properties[`opacity${bucket.suffix}`] = metrics.count === 0
          ? 0
          : Math.min(1, metrics.opacity * (0.66 + Math.min(0.34, density / 8)));
      }
      properties.routeCount = properties.routeCount24h ?? 0;
      properties.color = properties.color24h ?? '#73d9cf';
      properties.lastHeard = properties.lastHeard24h ?? 0;
      properties.width = properties.width24h ?? 0;
      properties.glowWidth = properties.glowWidth24h ?? 0;
      properties.opacity = properties.opacity24h ?? 0;
      return {
        type: 'Feature',
        id: `trunk:${level.representation}:${trunk.key}`,
        geometry: {
          type: 'LineString',
          coordinates: anchors
        },
        properties
      };
    });
}

function routeCellKey(coordinate: readonly [number, number], zoom: number, gridPixels: number): string {
  const longitude = Math.max(-180, Math.min(180, coordinate[0]));
  const latitude = Math.max(-85.0511287798, Math.min(85.0511287798, coordinate[1]));
  const radians = latitude * Math.PI / 180;
  const x = (longitude + 180) / 360;
  const y = (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
  const cellSize = gridPixels / (512 * (2 ** zoom));
  return `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
}

function routeTrunkAnchors(
  fromCell: string,
  toCell: string,
  zoom: number,
  gridPixels: number
): [[number, number], [number, number]] {
  const cellSize = gridPixels / (512 * (2 ** zoom));
  const center = (cell: string): [number, number] => {
    const [column = 0, row = 0] = cell.split(':').map(Number);
    return [(column + 0.5) * cellSize, (row + 0.5) * cellSize];
  };
  const from = center(fromCell);
  const to = center(toCell);
  if (fromCell === toCell) {
    return [
      normalizedMercatorToLngLat(from[0] - cellSize * 0.18, from[1] + cellSize * 0.12),
      normalizedMercatorToLngLat(from[0] + cellSize * 0.18, from[1] - cellSize * 0.12)
    ];
  }
  return [normalizedMercatorToLngLat(from[0], from[1]), normalizedMercatorToLngLat(to[0], to[1])];
}

function normalizedMercatorToLngLat(x: number, y: number): [number, number] {
  const boundedY = Math.max(0, Math.min(1, y));
  const longitude = x * 360 - 180;
  const latitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * boundedY))) * 180 / Math.PI;
  return [longitude, latitude];
}

function compareCoordinates(left: readonly [number, number], right: readonly [number, number]): number {
  return left[0] - right[0] || left[1] - right[1];
}

function routeWindowSummary(
  features: readonly Feature<LineString>[],
  maxAge: number
): { trunks: number; routes: number } {
  const suffix = ROUTE_WINDOW_BUCKETS.find((bucket) => bucket.ms === maxAge)?.suffix ?? '24h';
  let trunks = 0;
  let routes = 0;
  for (const feature of features) {
    const count = Number(feature.properties?.[`routeCount${suffix}`] ?? 0);
    if (count <= 0) continue;
    trunks += 1;
    routes += count;
  }
  return { trunks, routes };
}

function countEligibleRoutes(
  routes: Iterable<RouteV2>,
  nodes: ReadonlyMap<string, NodeV2>,
  now: number,
  maxAge: number
): number {
  let count = 0;
  for (const route of routes) {
    if (Math.max(0, now - route.lastHeard) > maxAge) continue;
    const from = nodes.get(route.fromId);
    const to = nodes.get(route.toId);
    if (from && to && validEndpoint(from) && validEndpoint(to)) count += 1;
  }
  return count;
}

function sameLineFeature(left: Feature<LineString>, right: Feature<LineString>): boolean {
  const leftCoordinates = left.geometry.coordinates;
  const rightCoordinates = right.geometry.coordinates;
  if (leftCoordinates.length !== rightCoordinates.length) return false;
  for (let index = 0; index < leftCoordinates.length; index += 1) {
    const leftPoint = leftCoordinates[index];
    const rightPoint = rightCoordinates[index];
    if (!leftPoint || !rightPoint || leftPoint.length !== rightPoint.length) return false;
    for (let coordinate = 0; coordinate < leftPoint.length; coordinate += 1) {
      if (leftPoint[coordinate] !== rightPoint[coordinate]) return false;
    }
  }
  const leftProperties = left.properties ?? {};
  const rightProperties = right.properties ?? {};
  const leftKeys = Object.keys(leftProperties);
  const rightKeys = Object.keys(rightProperties);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of rightKeys) {
    if (leftProperties[key] !== rightProperties[key]) return false;
  }
  return true;
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

export function routeRepresentationForZoom(zoom: number): 'national-trunks' | 'regional-trunks' | 'individual-routes' {
  if (zoom < 4.8) return 'national-trunks';
  if (zoom < 6.5) return 'regional-trunks';
  return 'individual-routes';
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
