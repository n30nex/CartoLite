import type { ViewportProjector } from '../audio';
import {
  DESTINATION_BLOOM_MS,
  RELAY_SPARK_MS,
  RESIDUE_MS,
  SOURCE_IGNITION_MS,
  capNewest,
  interpolateScreenPoint,
  nodeWakeRadius,
  packetTrail,
  residueSparkleProgress,
  residueStyle,
  routeDuration,
  routeMotion,
  segmentNearViewport,
  segmentTravelWeights,
  type ScreenPoint,
} from '../packetAnimator';
import type { MapChanges } from '../state';
import {
  PACKET_KIND_COLORS,
  decayedRouteTraffic,
  normalizePacketKind,
  packetSignature,
  payloadColor,
  type PacketKind,
  type PacketSignature,
} from '../trafficVisuals';
import type { EndpointV2, NodeRole, NodeV2, PacketView, RoutePacketView, RouteV2, StateV2 } from '../types';
import {
  buildNetgraphLayout,
  graphTopologyChanged,
  netgraphWindowMS,
  routeTopology,
  routesInWindow,
  type NetgraphLayout,
  type NetgraphPosition,
  type NetgraphWindow,
} from './layout';

const ROLE_COLORS: Readonly<Record<NodeRole, string>> = {
  repeater: '#67ead2',
  companion: '#78cfff',
  room_server: '#d694ff',
  sensor: '#ffd06c',
  unknown: '#a6b4bf',
};

const MAX_RESIDUE = 480;
const LOW_POWER_MAX_RESIDUE = 240;
const VIEW_ANIMATION_MS = 360;

interface ActiveRoute {
  packet: RoutePacketView;
  color: string;
  signature: PacketSignature;
  started: number;
  duration: number;
  weights: number[];
  completedSegments: number;
}

interface ObserverWake {
  endpoint: EndpointV2;
  color: string;
  signature: PacketSignature;
  started: number;
}

interface Residue {
  routeId: string;
  fromId: string;
  toId: string;
  color: string;
  signature: PacketSignature;
  addedAt: number;
}

interface ScreenNode {
  node: NodeV2;
  point: ScreenPoint;
  radius: number;
  degree: number;
}

export interface NetgraphRendererCallbacks {
  onNodeSelect(nodeID: string | null): void;
  onNodeHover(node: NodeV2 | null, point?: ScreenPoint): void;
}

export class NetgraphRenderer implements ViewportProjector {
  private readonly graphContext: CanvasRenderingContext2D;
  private readonly packetContext: CanvasRenderingContext2D;
  private readonly reducedMotionQuery: MediaQueryList;
  private readonly lowPowerQuery: MediaQueryList;
  private readonly resizeObserver?: ResizeObserver;
  private nodesByID = new Map<string, NodeV2>();
  private routesByID = new Map<string, RouteV2>();
  private adjacentRouteIDs = new Map<string, Set<string>>();
  private coordinateNodeIDs = new Map<string, string>();
  private topology = new Map<string, string>();
  private layout: NetgraphLayout = buildNetgraphLayout([], []);
  private visibleRoutes: RouteV2[] = [];
  private visibleRouteIDs = new Set<string>();
  private screenNodes: ScreenNode[] = [];
  private routeWindow: NetgraphWindow = '24h';
  private selectedNodeID: string | null = null;
  private hoveredNodeID: string | null = null;
  private activeRoutes: ActiveRoute[] = [];
  private observerWakes: ObserverWake[] = [];
  private residue: Residue[] = [];
  private staticFrame = 0;
  private motionFrame = 0;
  private viewFrame = 0;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private centerX = 0;
  private centerY = 0;
  private scale = 1;
  private initializedView = false;
  private paused = false;
  private dragging = false;
  private dragMoved = false;
  private pointerID?: number;
  private pointerStart = { x: 0, y: 0 };
  private viewStart = { x: 0, y: 0 };

  constructor(
    private readonly stage: HTMLElement,
    private readonly graphCanvas: HTMLCanvasElement,
    private readonly packetCanvas: HTMLCanvasElement,
    private readonly callbacks: NetgraphRendererCallbacks,
  ) {
    const graphContext = graphCanvas.getContext('2d');
    const packetContext = packetCanvas.getContext('2d');
    if (!graphContext || !packetContext) throw new Error('Canvas2D is unavailable');
    this.graphContext = graphContext;
    this.packetContext = packetContext;
    this.reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.lowPowerQuery = matchMedia('(max-width: 700px), (pointer: coarse)');
    this.stage.dataset.motionMode = this.reducedMotionQuery.matches ? 'static' : 'animated';
    this.handleResize = this.handleResize.bind(this);
    this.drawMotion = this.drawMotion.bind(this);
    this.stage.addEventListener('pointerdown', this.handlePointerDown);
    this.stage.addEventListener('pointermove', this.handlePointerMove);
    this.stage.addEventListener('pointerup', this.handlePointerUp);
    this.stage.addEventListener('pointercancel', this.handlePointerCancel);
    this.stage.addEventListener('wheel', this.handleWheel, { passive: false });
    this.stage.addEventListener('dblclick', this.handleDoubleClick);
    this.reducedMotionQuery.addEventListener('change', this.handleMotionPreference);
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(stage);
    } else {
      window.addEventListener('resize', this.handleResize);
    }
    this.handleResize();
  }

  render(state: Readonly<StateV2>, changes: MapChanges | null): void {
    if (!changes) return;
    const started = performance.now();
    const firstLayout = this.layout.positions.size === 0;
    this.nodesByID = new Map(state.nodes.map((node) => [node.id, node]));
    this.coordinateNodeIDs = new Map(state.nodes.map((node) => [coordinateKey(node.lng, node.lat), node.id]));
    this.routesByID = new Map(state.routes.map((route) => [route.id, route]));

    if (changes.reset || graphTopologyChanged(this.topology, changes.routes ?? [], state.routes.length)) {
      if (changes.reset || firstLayout) {
        this.layout = buildNetgraphLayout(state.nodes, state.routes);
      } else {
        this.extendStableLayout(state.routes);
      }
      this.topology = routeTopology(state.routes);
      this.rebuildAdjacency(state.routes);
    }

    this.visibleRoutes = routesInWindow(state.routes, Date.now(), this.routeWindow);
    this.visibleRouteIDs = new Set(this.visibleRoutes.map((route) => route.id));
    this.stage.dataset.totalNodes = String(state.nodes.length);
    this.stage.dataset.connectedNodes = String(this.layout.connectedNodeIDs.size);
    this.stage.dataset.totalRoutes = String(state.routes.length);
    this.stage.dataset.visibleRoutes = String(this.visibleRoutes.length);
    this.stage.dataset.components = String(this.layout.componentCount);
    this.stage.dataset.renderApplyMs = (performance.now() - started).toFixed(1);
    this.stage.dataset.renderState = 'scheduled';
    if (!this.initializedView && this.layout.positions.size > 0) this.home(false);
    this.requestStaticDraw();
  }

  setRouteWindow(window: NetgraphWindow): void {
    const started = performance.now();
    this.routeWindow = window;
    this.visibleRoutes = routesInWindow([...this.routesByID.values()], Date.now(), window);
    this.visibleRouteIDs = new Set(this.visibleRoutes.map((route) => route.id));
    this.stage.dataset.routeWindow = window;
    this.stage.dataset.visibleRoutes = String(this.visibleRoutes.length);
    this.stage.dataset.routeWindowApplyMs = (performance.now() - started).toFixed(1);
    this.requestStaticDraw();
  }

  getRouteWindowMS(): number {
    return netgraphWindowMS(this.routeWindow);
  }

  getNodes(): ReadonlyMap<string, NodeV2> {
    return this.nodesByID;
  }

  connectedNodes(): NodeV2[] {
    return [...this.layout.connectedNodeIDs]
      .map((nodeID) => this.nodesByID.get(nodeID))
      .filter((node): node is NodeV2 => Boolean(node));
  }

  adjacentRoutes(nodeID: string): RouteV2[] {
    return [...(this.adjacentRouteIDs.get(nodeID) ?? [])]
      .map((routeID) => this.routesByID.get(routeID))
      .filter((route): route is RouteV2 => Boolean(route));
  }

  setSelectedNode(nodeID: string | null): void {
    this.selectedNodeID = nodeID && this.nodesByID.has(nodeID) ? nodeID : null;
    this.stage.dataset.selectedNodeId = this.selectedNodeID ?? '';
    this.requestStaticDraw();
  }

  focusNode(nodeID: string): void {
    const position = this.layout.positions.get(nodeID);
    if (!position) return;
    this.animateView(position.x, position.y, Math.max(this.scale, 1.5));
  }

  home(animate = true): void {
    const bounds = this.layout.bounds;
    const boundsWidth = Math.max(1, bounds.maxX - bounds.minX);
    const boundsHeight = Math.max(1, bounds.maxY - bounds.minY);
    const nextScale = clamp(Math.min((this.width - 52) / boundsWidth, (this.height - 80) / boundsHeight), 0.04, 3);
    const nextX = (bounds.minX + bounds.maxX) / 2;
    const nextY = (bounds.minY + bounds.maxY) / 2;
    this.initializedView = true;
    if (animate && !this.reducedMotionQuery.matches) this.animateView(nextX, nextY, nextScale);
    else {
      this.cancelViewAnimation();
      this.centerX = nextX;
      this.centerY = nextY;
      this.scale = nextScale;
      this.viewChanged();
    }
  }

  addPacket(packet: PacketView): void {
    if (this.paused) return;
    const now = performance.now();
    const color = payloadColor(packet.payloadType);
    const signature = packetSignature(packet.payloadType);
    if (packet.mode === 'observer') {
      if (this.layout.positions.has(packet.observer.id)) {
        this.observerWakes.push({ endpoint: packet.observer, color, signature, started: now });
      }
    } else if (packet.segments.length > 0) {
      const active: ActiveRoute = {
        packet,
        color,
        signature,
        started: now,
        duration: routeDuration(packet.segments),
        weights: segmentTravelWeights(packet.segments),
        completedSegments: 0,
      };
      if (this.reducedMotionQuery.matches) {
        for (const segment of packet.segments) this.addResidue(segment.routeId, segment.from.id, segment.to.id, color, signature, now);
      } else {
        this.activeRoutes.push(active);
      }
      this.stage.dataset.lastPacketKind = normalizePacketKind(packet.payloadType);
      this.stage.dataset.lastPacketHops = String(packet.segments.length);
    }
    this.trimResidue();
    this.requestMotionFrame();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.activeRoutes = [];
      this.observerWakes = [];
      this.residue = [];
      if (this.motionFrame) cancelAnimationFrame(this.motionFrame);
      this.motionFrame = 0;
      this.packetContext.clearRect(0, 0, this.width, this.height);
    }
  }

  project(coordinates: [number, number]): ScreenPoint {
    const nodeID = this.coordinateNodeIDs.get(coordinateKey(coordinates[0], coordinates[1]));
    return nodeID ? this.screenPoint(nodeID) : { x: -1_000_000, y: -1_000_000 };
  }

  projectEndpoint(endpoint: EndpointV2): ScreenPoint {
    return this.screenPoint(endpoint.id);
  }

  destroy(): void {
    this.stage.removeEventListener('pointerdown', this.handlePointerDown);
    this.stage.removeEventListener('pointermove', this.handlePointerMove);
    this.stage.removeEventListener('pointerup', this.handlePointerUp);
    this.stage.removeEventListener('pointercancel', this.handlePointerCancel);
    this.stage.removeEventListener('wheel', this.handleWheel);
    this.stage.removeEventListener('dblclick', this.handleDoubleClick);
    this.reducedMotionQuery.removeEventListener('change', this.handleMotionPreference);
    this.resizeObserver?.disconnect();
    if (!this.resizeObserver) window.removeEventListener('resize', this.handleResize);
    if (this.staticFrame) cancelAnimationFrame(this.staticFrame);
    if (this.motionFrame) cancelAnimationFrame(this.motionFrame);
    this.cancelViewAnimation();
  }

  private handleResize(): void {
    const rect = this.stage.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(2, Math.max(1, devicePixelRatio || 1));
    this.sizeCanvas(this.graphCanvas, this.graphContext);
    this.sizeCanvas(this.packetCanvas, this.packetContext);
    if (!this.initializedView && this.layout.positions.size > 0) this.home(false);
    this.viewChanged();
  }

  private sizeCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): void {
    canvas.width = Math.round(this.width * this.dpr);
    canvas.height = Math.round(this.height * this.dpr);
    canvas.style.width = `${this.width}px`;
    canvas.style.height = `${this.height}px`;
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private requestStaticDraw(): void {
    if (this.staticFrame) return;
    this.staticFrame = requestAnimationFrame(() => {
      this.staticFrame = 0;
      this.drawStatic();
    });
  }

  private drawStatic(): void {
    const started = performance.now();
    const context = this.graphContext;
    context.clearRect(0, 0, this.width, this.height);
    this.drawGrid(context);
    this.drawRoutes(context);
    this.drawNodes(context);
    this.stage.dataset.staticDrawMs = (performance.now() - started).toFixed(1);
    this.stage.dataset.renderState = 'idle';
  }

  private drawGrid(context: CanvasRenderingContext2D): void {
    const spacing = Math.max(42, Math.min(96, 64 * this.scale));
    const offsetX = modulo(this.width / 2 - this.centerX * this.scale, spacing);
    const offsetY = modulo(this.height / 2 - this.centerY * this.scale, spacing);
    context.save();
    context.strokeStyle = 'rgba(93, 176, 183, 0.055)';
    context.lineWidth = 1;
    context.beginPath();
    for (let x = offsetX; x <= this.width; x += spacing) {
      context.moveTo(Math.round(x) + 0.5, 0);
      context.lineTo(Math.round(x) + 0.5, this.height);
    }
    for (let y = offsetY; y <= this.height; y += spacing) {
      context.moveTo(0, Math.round(y) + 0.5);
      context.lineTo(this.width, Math.round(y) + 0.5);
    }
    context.stroke();
    context.restore();
  }

  private drawRoutes(context: CanvasRenderingContext2D): void {
    const now = Date.now();
    const selected = this.selectedNodeID;
    const selectedRoutes = selected ? this.adjacentRouteIDs.get(selected) ?? new Set<string>() : new Set<string>();
    const groups = new Map<PacketKind, RouteV2[]>();
    for (const route of this.visibleRoutes) {
      if (selectedRoutes.has(route.id)) continue;
      const kind = normalizePacketKind(route.lastKind);
      const routes = groups.get(kind) ?? [];
      routes.push(route);
      groups.set(kind, routes);
    }

    context.save();
    context.lineCap = 'round';
    for (const [kind, routes] of groups) {
      context.beginPath();
      for (const route of routes) this.appendRoute(context, route);
      context.strokeStyle = colorWithAlpha(PACKET_KIND_COLORS[kind], selected ? 0.045 : 0.16);
      context.lineWidth = selected ? 0.65 : 0.8;
      context.stroke();
    }

    for (const route of this.visibleRoutes) {
      if (selectedRoutes.has(route.id)) continue;
      const age = Math.max(0, now - route.lastHeard);
      if (age > 60 * 60_000) continue;
      const traffic = decayedRouteTraffic(route.traffic, route.lastHeard, now);
      const alpha = (1 - age / (60 * 60_000)) * (selected ? 0.08 : 0.28);
      context.beginPath();
      this.appendRoute(context, route);
      context.strokeStyle = colorWithAlpha(PACKET_KIND_COLORS[normalizePacketKind(route.lastKind)], alpha);
      context.lineWidth = 0.9 + Math.min(1.6, Math.log2(1 + traffic) * 0.32);
      context.stroke();
    }

    if (selected) {
      for (const routeID of selectedRoutes) {
        const route = this.routesByID.get(routeID);
        if (!route || !this.visibleRouteIDs.has(route.id)) continue;
        const color = PACKET_KIND_COLORS[normalizePacketKind(route.lastKind)];
        context.beginPath();
        this.appendRoute(context, route);
        context.strokeStyle = colorWithAlpha(color, 0.18);
        context.lineWidth = 7;
        context.stroke();
        context.beginPath();
        this.appendRoute(context, route);
        context.strokeStyle = colorWithAlpha(color, 0.86);
        context.lineWidth = 2.1;
        context.stroke();
      }
    }
    context.restore();
  }

  private appendRoute(context: CanvasRenderingContext2D, route: RouteV2): void {
    const from = this.screenPoint(route.fromId);
    const to = this.screenPoint(route.toId);
    if (!segmentNearViewport(from, to, this.width, this.height, 8)) return;
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
  }

  private drawNodes(context: CanvasRenderingContext2D): void {
    const selectedRoutes = this.selectedNodeID ? this.adjacentRouteIDs.get(this.selectedNodeID) ?? new Set<string>() : new Set<string>();
    const selectedNeighbors = new Set<string>();
    for (const routeID of selectedRoutes) {
      const route = this.routesByID.get(routeID);
      if (!route) continue;
      selectedNeighbors.add(route.fromId === this.selectedNodeID ? route.toId : route.fromId);
    }
    const nodeRecords: ScreenNode[] = [];
    for (const position of this.layout.positions.values()) {
      const node = this.nodesByID.get(position.id);
      if (!node) continue;
      const point = this.worldToScreen(position.x, position.y);
      if (point.x < -24 || point.x > this.width + 24 || point.y < -24 || point.y > this.height + 24) continue;
      const radius = clamp(2.5 + Math.log2(1 + position.degree) * 0.7 + Math.sqrt(this.scale) * 0.55, 3, 8);
      nodeRecords.push({ node, point, radius, degree: position.degree });
    }
    this.screenNodes = nodeRecords;

    context.save();
    for (const record of nodeRecords) {
      const { node, point, radius } = record;
      const selected = node.id === this.selectedNodeID;
      const neighbor = selectedNeighbors.has(node.id);
      const muted = Boolean(this.selectedNodeID) && !selected && !neighbor;
      const color = ROLE_COLORS[node.role];
      if (selected || neighbor) {
        context.beginPath();
        context.arc(point.x, point.y, radius + (selected ? 11 : 6), 0, Math.PI * 2);
        context.fillStyle = colorWithAlpha(color, selected ? 0.16 : 0.09);
        context.fill();
      }
      this.nodeShape(context, node.role, point, radius);
      context.fillStyle = colorWithAlpha(color, muted ? 0.24 : selected ? 1 : neighbor ? 0.9 : 0.68);
      context.fill();
      context.strokeStyle = colorWithAlpha('#eaffff', muted ? 0.08 : selected ? 0.92 : 0.36);
      context.lineWidth = selected ? 1.8 : 0.8;
      context.stroke();
      if (node.observer) {
        context.beginPath();
        context.arc(point.x, point.y, radius + 3.3, 0, Math.PI * 2);
        context.strokeStyle = colorWithAlpha(color, muted ? 0.12 : 0.55);
        context.lineWidth = 0.8;
        context.stroke();
      }
    }

    const labelCandidates = nodeRecords
      .filter(({ node, degree }) => node.id === this.selectedNodeID || node.id === this.hoveredNodeID || degree >= (this.scale < 0.7 ? 18 : this.scale < 1.3 ? 8 : 3))
      .sort((left, right) => Number(right.node.id === this.selectedNodeID) - Number(left.node.id === this.selectedNodeID) || right.degree - left.degree)
      .slice(0, this.scale < 0.7 ? 22 : this.scale < 1.3 ? 54 : 120);
    context.font = '600 10px Inter, ui-sans-serif, system-ui, sans-serif';
    context.textBaseline = 'middle';
    for (const { node, point, radius } of labelCandidates) {
      const label = truncateLabel(node.label, 28);
      const width = context.measureText(label).width;
      const x = point.x + radius + 6;
      const y = point.y;
      context.fillStyle = 'rgba(4, 14, 19, 0.78)';
      roundRect(context, x - 3, y - 8, width + 6, 16, 5);
      context.fill();
      context.fillStyle = node.id === this.selectedNodeID ? '#f2ffff' : 'rgba(205, 229, 234, 0.78)';
      context.fillText(label, x, y + 0.5);
    }
    context.restore();
  }

  private nodeShape(context: CanvasRenderingContext2D, role: NodeRole, point: ScreenPoint, radius: number): void {
    context.beginPath();
    if (role === 'room_server') {
      context.moveTo(point.x, point.y - radius * 1.2);
      context.lineTo(point.x + radius * 1.2, point.y);
      context.lineTo(point.x, point.y + radius * 1.2);
      context.lineTo(point.x - radius * 1.2, point.y);
      context.closePath();
    } else if (role === 'sensor') {
      context.rect(point.x - radius, point.y - radius, radius * 2, radius * 2);
    } else if (role === 'companion') {
      const angle = -Math.PI / 2;
      for (let index = 0; index < 3; index += 1) {
        const current = angle + index * Math.PI * 2 / 3;
        const x = point.x + Math.cos(current) * radius * 1.2;
        const y = point.y + Math.sin(current) * radius * 1.2;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
    } else {
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    }
  }

  private requestMotionFrame(): void {
    if (this.paused || this.motionFrame) return;
    this.motionFrame = requestAnimationFrame(this.drawMotion);
  }

  private drawMotion(now: number): void {
    this.motionFrame = 0;
    const context = this.packetContext;
    context.clearRect(0, 0, this.width, this.height);
    this.activeRoutes = this.activeRoutes.filter((route) => now - route.started <= route.duration + DESTINATION_BLOOM_MS);
    this.observerWakes = this.observerWakes.filter((wake) => now - wake.started <= 6_000);
    this.residue = this.residue.filter((item) => now - item.addedAt <= RESIDUE_MS);
    this.drawResidue(context, now);
    for (const route of this.activeRoutes) this.drawActiveRoute(context, route, now);
    for (const wake of this.observerWakes) this.drawObserverWake(context, wake, now);
    this.stage.dataset.activePackets = String(this.activeRoutes.length + this.observerWakes.length);
    this.stage.dataset.residueCount = String(this.residue.length);
    if (!this.reducedMotionQuery.matches && (this.activeRoutes.length || this.observerWakes.length || this.residue.length)) this.requestMotionFrame();
  }

  private drawResidue(context: CanvasRenderingContext2D, now: number): void {
    const sparkleCount = this.lowPowerQuery.matches ? 1 : 2;
    context.save();
    context.lineCap = 'round';
    for (const residue of this.residue) {
      const from = this.screenPoint(residue.fromId);
      const to = this.screenPoint(residue.toId);
      if (!segmentNearViewport(from, to, this.width, this.height, 12)) continue;
      const age = now - residue.addedAt;
      const style = residueStyle(age);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.strokeStyle = colorWithAlpha(residue.color, style.bloomOpacity);
      context.lineWidth = style.bloomWidth;
      context.stroke();
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.strokeStyle = colorWithAlpha(residue.color, style.coreOpacity);
      context.lineWidth = style.coreWidth;
      context.stroke();
      for (let index = 0; index < sparkleCount; index += 1) {
        const progress = residueSparkleProgress(residue.routeId, age, index);
        const spark = interpolateScreenPoint(from, to, progress);
        context.beginPath();
        context.arc(spark.x, spark.y, 0.9 + style.hot * 0.8, 0, Math.PI * 2);
        context.fillStyle = colorWithAlpha(residue.color, style.life * (0.24 + style.hot * 0.42));
        context.fill();
      }
    }
    context.restore();
  }

  private drawActiveRoute(context: CanvasRenderingContext2D, active: ActiveRoute, now: number): void {
    const age = now - active.started;
    const motion = routeMotion(active.weights, age, active.duration);
    while (active.completedSegments < motion.completedSegments) {
      const segment = active.packet.segments[active.completedSegments];
      if (segment) this.addResidue(segment.routeId, segment.from.id, segment.to.id, active.color, active.signature, now);
      active.completedSegments += 1;
    }
    this.trimResidue();

    for (let index = 0, boundary = 0; index < active.weights.length; index += 1) {
      boundary += active.weights[index] ?? 0;
      const handoffAge = age - boundary * active.duration;
      const endpoint = active.packet.segments[index]?.to;
      if (endpoint && handoffAge >= 0 && handoffAge <= RELAY_SPARK_MS) {
        this.drawHandoff(context, this.screenPoint(endpoint.id), active.color, handoffAge / RELAY_SPARK_MS);
      }
    }

    const source = active.packet.segments[0]?.from;
    if (source && age <= SOURCE_IGNITION_MS) this.drawHandoff(context, this.screenPoint(source.id), active.color, age / SOURCE_IGNITION_MS);
    if (age >= active.duration) {
      const destination = active.packet.segments.at(-1)?.to;
      if (destination) this.drawDestination(context, this.screenPoint(destination.id), active.color, (age - active.duration) / DESTINATION_BLOOM_MS);
      return;
    }

    const segment = active.packet.segments[motion.segmentIndex];
    if (!segment) return;
    const from = this.screenPoint(segment.from.id);
    const to = this.screenPoint(segment.to.id);
    if (!segmentNearViewport(from, to, this.width, this.height, 24)) return;
    const head = interpolateScreenPoint(from, to, easeInOut(motion.localProgress));
    const trail = packetTrail(from, head, clamp(Math.hypot(to.x - from.x, to.y - from.y) * 0.28, 18, 68));
    const gradient = context.createLinearGradient(trail.tail.x, trail.tail.y, head.x, head.y);
    gradient.addColorStop(0, colorWithAlpha(active.color, 0));
    gradient.addColorStop(0.46, colorWithAlpha(active.color, 0.32));
    gradient.addColorStop(1, colorWithAlpha(active.color, 0.96));
    context.save();
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(trail.tail.x, trail.tail.y);
    context.lineTo(head.x, head.y);
    context.strokeStyle = colorWithAlpha(active.color, 0.16);
    context.lineWidth = 12;
    context.stroke();
    context.beginPath();
    context.moveTo(trail.tail.x, trail.tail.y);
    context.lineTo(head.x, head.y);
    context.strokeStyle = gradient;
    context.lineWidth = 3.1;
    context.stroke();
    const sparkCount = this.lowPowerQuery.matches ? 2 : 3;
    for (let index = 1; index <= sparkCount; index += 1) {
      const amount = Math.max(0, 1 - index * 0.2);
      const spark = interpolateScreenPoint(trail.tail, head, amount);
      context.beginPath();
      context.arc(spark.x, spark.y, 1.5 - index * 0.18, 0, Math.PI * 2);
      context.fillStyle = colorWithAlpha(active.color, 0.68 - index * 0.13);
      context.fill();
    }
    context.beginPath();
    context.arc(head.x, head.y, 7.5, 0, Math.PI * 2);
    context.fillStyle = colorWithAlpha(active.color, 0.18);
    context.fill();
    context.beginPath();
    context.arc(head.x, head.y, 3.25, 0, Math.PI * 2);
    context.fillStyle = active.color;
    context.fill();
    this.drawSignature(context, head, from, to, active.color, active.signature, age);
    context.restore();
  }

  private drawSignature(
    context: CanvasRenderingContext2D,
    point: ScreenPoint,
    from: ScreenPoint,
    to: ScreenPoint,
    color: string,
    signature: PacketSignature,
    age: number,
  ): void {
    if (signature === 'ripple') {
      context.beginPath();
      context.arc(point.x, point.y, 5 + (age % 420) / 105, 0, Math.PI * 2);
      context.strokeStyle = colorWithAlpha(color, 0.44);
      context.lineWidth = 1;
      context.stroke();
      return;
    }
    if (signature === 'echo') {
      const echo = interpolateScreenPoint(from, point, 0.82);
      context.beginPath();
      context.arc(echo.x, echo.y, 2.1, 0, Math.PI * 2);
      context.fillStyle = colorWithAlpha(color, 0.62);
      context.fill();
      return;
    }
    if (signature === 'orbit') {
      for (const phase of [0, Math.PI]) {
        const angle = age * 0.009 + phase;
        context.beginPath();
        context.arc(point.x + Math.cos(angle) * 6, point.y + Math.sin(angle) * 6, 1.25, 0, Math.PI * 2);
        context.fillStyle = colorWithAlpha(color, 0.74);
        context.fill();
      }
      return;
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const px = -dy / length;
    const py = dx / length;
    const offset = signature === 'double' ? 3 : 0;
    for (const side of signature === 'double' ? [-1, 1] : [0]) {
      context.beginPath();
      context.moveTo(point.x + dx / length * offset * side - px * 3.5, point.y + dy / length * offset * side - py * 3.5);
      context.lineTo(point.x + dx / length * offset * side + px * 3.5, point.y + dy / length * offset * side + py * 3.5);
      context.strokeStyle = colorWithAlpha(color, 0.76);
      context.lineWidth = 1.2;
      context.stroke();
    }
  }

  private drawHandoff(context: CanvasRenderingContext2D, point: ScreenPoint, color: string, progress: number): void {
    context.beginPath();
    context.arc(point.x, point.y, 5 + progress * 10, 0, Math.PI * 2);
    context.strokeStyle = colorWithAlpha(color, (1 - progress) * 0.8);
    context.lineWidth = 1.6;
    context.stroke();
  }

  private drawDestination(context: CanvasRenderingContext2D, point: ScreenPoint, color: string, progress: number): void {
    const opacity = Math.sin(Math.PI * clamp(progress, 0, 1));
    context.beginPath();
    context.arc(point.x, point.y, 7 + progress * 14, 0, Math.PI * 2);
    context.fillStyle = colorWithAlpha(color, opacity * 0.18);
    context.fill();
    context.beginPath();
    context.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    context.fillStyle = colorWithAlpha(color, opacity * 0.92);
    context.fill();
  }

  private drawObserverWake(context: CanvasRenderingContext2D, wake: ObserverWake, now: number): void {
    const age = now - wake.started;
    const point = this.screenPoint(wake.endpoint.id);
    const radius = nodeWakeRadius(age, wake.signature, this.reducedMotionQuery.matches);
    const life = Math.pow(1 - clamp(age / 6_000, 0, 1), 2);
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.strokeStyle = colorWithAlpha(wake.color, life * 0.72);
    context.lineWidth = 1.4;
    context.stroke();
  }

  private addResidue(routeId: string, fromId: string, toId: string, color: string, signature: PacketSignature, addedAt: number): void {
    this.residue.push({ routeId, fromId, toId, color, signature, addedAt });
  }

  private trimResidue(): void {
    this.residue = capNewest(this.residue, this.lowPowerQuery.matches ? LOW_POWER_MAX_RESIDUE : MAX_RESIDUE);
  }

  private rebuildAdjacency(routes: readonly RouteV2[]): void {
    this.adjacentRouteIDs.clear();
    for (const route of routes) {
      this.addAdjacentRoute(route.fromId, route.id);
      this.addAdjacentRoute(route.toId, route.id);
    }
  }

  private addAdjacentRoute(nodeID: string, routeID: string): void {
    const routes = this.adjacentRouteIDs.get(nodeID) ?? new Set<string>();
    routes.add(routeID);
    this.adjacentRouteIDs.set(nodeID, routes);
  }

  private extendStableLayout(routes: readonly RouteV2[]): void {
    const positions = new Map(this.layout.positions);
    const connectedNodeIDs = new Set(this.layout.connectedNodeIDs);
    let added = 0;
    for (const route of routes) {
      for (const [nodeID, neighborID] of [[route.fromId, route.toId], [route.toId, route.fromId]] as const) {
        connectedNodeIDs.add(nodeID);
        if (positions.has(nodeID)) continue;
        const anchor = positions.get(neighborID);
        const phase = stableHash(nodeID) / 0xffffffff * Math.PI * 2;
        const ring = 30 + (stableHash(`${nodeID}:ring`) % 5) * 7;
        positions.set(nodeID, {
          id: nodeID,
          x: (anchor?.x ?? this.layout.bounds.maxX + 70) + Math.cos(phase) * ring,
          y: (anchor?.y ?? this.layout.bounds.minY) + Math.sin(phase) * ring,
          degree: 1,
          component: anchor?.component ?? this.layout.componentCount + added,
        });
        added += 1;
      }
    }
    const degree = new Map<string, number>();
    for (const route of routes) {
      degree.set(route.fromId, (degree.get(route.fromId) ?? 0) + 1);
      degree.set(route.toId, (degree.get(route.toId) ?? 0) + 1);
    }
    for (const [nodeID, position] of positions) positions.set(nodeID, { ...position, degree: degree.get(nodeID) ?? 0 });
    this.layout = {
      positions,
      connectedNodeIDs,
      componentCount: Math.max(0, ...[...positions.values()].map((position) => position.component + 1)),
      bounds: boundsForPositions(positions),
    };
  }

  private screenPoint(nodeID: string): ScreenPoint {
    const position = this.layout.positions.get(nodeID);
    return position ? this.worldToScreen(position.x, position.y) : { x: -1_000_000, y: -1_000_000 };
  }

  private worldToScreen(x: number, y: number): ScreenPoint {
    return {
      x: (x - this.centerX) * this.scale + this.width / 2,
      y: (y - this.centerY) * this.scale + this.height / 2,
    };
  }

  private screenToWorld(x: number, y: number): ScreenPoint {
    return {
      x: (x - this.width / 2) / this.scale + this.centerX,
      y: (y - this.height / 2) / this.scale + this.centerY,
    };
  }

  private viewChanged(): void {
    this.stage.dataset.viewScale = this.scale.toFixed(4);
    this.stage.dataset.viewCenter = `${this.centerX.toFixed(2)},${this.centerY.toFixed(2)}`;
    this.requestStaticDraw();
    if (this.activeRoutes.length || this.observerWakes.length || this.residue.length) this.requestMotionFrame();
  }

  private animateView(centerX: number, centerY: number, scale: number): void {
    this.cancelViewAnimation();
    if (this.reducedMotionQuery.matches) {
      this.centerX = centerX;
      this.centerY = centerY;
      this.scale = scale;
      this.viewChanged();
      return;
    }
    const fromX = this.centerX;
    const fromY = this.centerY;
    const fromScale = this.scale;
    const started = performance.now();
    const tick = (now: number): void => {
      const progress = clamp((now - started) / VIEW_ANIMATION_MS, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.centerX = fromX + (centerX - fromX) * eased;
      this.centerY = fromY + (centerY - fromY) * eased;
      this.scale = fromScale + (scale - fromScale) * eased;
      this.viewChanged();
      if (progress < 1) this.viewFrame = requestAnimationFrame(tick);
      else this.viewFrame = 0;
    };
    this.viewFrame = requestAnimationFrame(tick);
  }

  private cancelViewAnimation(): void {
    if (this.viewFrame) cancelAnimationFrame(this.viewFrame);
    this.viewFrame = 0;
  }

  private nearestNode(x: number, y: number): ScreenNode | null {
    let closest: ScreenNode | null = null;
    let closestDistance = Infinity;
    for (const node of this.screenNodes) {
      const distance = Math.hypot(node.point.x - x, node.point.y - y);
      const hitRadius = Math.max(12, node.radius + 6);
      if (distance <= hitRadius && distance < closestDistance) {
        closest = node;
        closestDistance = distance;
      }
    }
    return closest;
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.cancelViewAnimation();
    this.dragging = true;
    this.dragMoved = false;
    this.pointerID = event.pointerId;
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.viewStart = { x: this.centerX, y: this.centerY };
    this.stage.setPointerCapture(event.pointerId);
    this.stage.classList.add('is-dragging');
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const rect = this.stage.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (this.dragging && event.pointerId === this.pointerID) {
      const deltaX = event.clientX - this.pointerStart.x;
      const deltaY = event.clientY - this.pointerStart.y;
      if (Math.hypot(deltaX, deltaY) > 4) this.dragMoved = true;
      this.centerX = this.viewStart.x - deltaX / this.scale;
      this.centerY = this.viewStart.y - deltaY / this.scale;
      this.viewChanged();
      return;
    }
    const hovered = this.nearestNode(x, y);
    const nextID = hovered?.node.id ?? null;
    if (nextID === this.hoveredNodeID) return;
    this.hoveredNodeID = nextID;
    this.stage.classList.toggle('node-hover', Boolean(hovered));
    this.callbacks.onNodeHover(hovered?.node ?? null, hovered?.point);
    this.requestStaticDraw();
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.dragging || event.pointerId !== this.pointerID) return;
    const rect = this.stage.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.finishDrag(event.pointerId);
    if (this.dragMoved) return;
    this.callbacks.onNodeSelect(this.nearestNode(x, y)?.node.id ?? null);
  };

  private handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerID) this.finishDrag(event.pointerId);
  };

  private finishDrag(pointerID: number): void {
    this.dragging = false;
    this.pointerID = undefined;
    this.stage.classList.remove('is-dragging');
    if (this.stage.hasPointerCapture(pointerID)) this.stage.releasePointerCapture(pointerID);
  }

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.cancelViewAnimation();
    const rect = this.stage.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const anchor = this.screenToWorld(x, y);
    const nextScale = clamp(this.scale * Math.exp(-event.deltaY * 0.0012), 0.035, 8);
    this.scale = nextScale;
    this.centerX = anchor.x - (x - this.width / 2) / nextScale;
    this.centerY = anchor.y - (y - this.height / 2) / nextScale;
    this.viewChanged();
  };

  private handleDoubleClick = (event: MouseEvent): void => {
    const rect = this.stage.getBoundingClientRect();
    const anchor = this.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    this.animateView(anchor.x, anchor.y, clamp(this.scale * 1.65, 0.035, 8));
  };

  private handleMotionPreference = (): void => {
    this.stage.dataset.motionMode = this.reducedMotionQuery.matches ? 'static' : 'animated';
    if (this.reducedMotionQuery.matches) this.activeRoutes = [];
    this.requestMotionFrame();
  };
}

function boundsForPositions(positions: ReadonlyMap<string, NetgraphPosition>): NetgraphLayout['bounds'] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const position of positions.values()) {
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x);
    maxY = Math.max(maxY, position.y);
  }
  if (!Number.isFinite(minX)) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  return { minX: minX - 34, minY: minY - 34, maxX: maxX + 34, maxY: maxY + 34 };
}

function coordinateKey(lng: number, lat: number): string {
  return `${lng.toFixed(6)},${lat.toFixed(6)}`;
}

function colorWithAlpha(color: string, alpha: number): string {
  const value = color.startsWith('#') ? color.slice(1) : color;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`;
}

function truncateLabel(label: string, length: number): string {
  return label.length <= length ? label : `${label.slice(0, Math.max(1, length - 1))}…`;
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function modulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function easeInOut(value: number): number {
  const amount = clamp(value, 0, 1);
  return amount < 0.5 ? 2 * amount * amount : 1 - Math.pow(-2 * amount + 2, 2) / 2;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
