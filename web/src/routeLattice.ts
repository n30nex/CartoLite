import maplibregl from 'maplibre-gl';

export const ROUTE_LATTICE_DRAW_BATCH = 64;

export interface LatticeRoute {
  id: string;
  from: [number, number];
  to: [number, number];
  color: string;
  width: number;
  glowWidth: number;
  opacity: number;
}

interface LatticeStyle {
  coreWidth: number;
  glowWidth: number;
  coreOpacity: number;
  glowOpacity: number;
}

export class RouteLatticeCanvas {
  private readonly context: CanvasRenderingContext2D;
  private readonly buffer: HTMLCanvasElement;
  private readonly bufferContext: CanvasRenderingContext2D;
  private routes: readonly LatticeRoute[] = [];
  private focused = false;
  private visible = true;
  private renderEpoch = 0;
  private frameID = 0;
  private dpr = 1;
  private renderWaiters: Array<() => void> = [];

  constructor(private readonly map: maplibregl.Map, private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Route lattice Canvas2D is unavailable');
    this.context = context;
    this.buffer = canvas.ownerDocument.createElement('canvas');
    const bufferContext = this.buffer.getContext('2d');
    if (!bufferContext) throw new Error('Route lattice buffer Canvas2D is unavailable');
    this.bufferContext = bufferContext;
    this.resize();
    this.map.on('resize', this.handleResize);
    this.map.on('movestart', this.handleMoveStart);
    this.map.on('moveend', this.handleMoveEnd);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.canvas.hidden = !visible;
    if (visible && this.frameID === 0) this.canvas.style.visibility = 'visible';
  }

  setRoutes(routes: readonly LatticeRoute[], focused: boolean): Promise<void> {
    this.routes = routes;
    this.focused = focused;
    return new Promise((resolve) => {
      this.renderWaiters.push(resolve);
      this.render();
    });
  }

  destroy(): void {
    this.renderEpoch += 1;
    window.cancelAnimationFrame(this.frameID);
    this.frameID = 0;
    this.map.off('resize', this.handleResize);
    this.map.off('movestart', this.handleMoveStart);
    this.map.off('moveend', this.handleMoveEnd);
    this.clearVisible();
    this.resolveRenderWaiters();
  }

  private handleResize = (): void => {
    this.resize();
    this.render();
  };

  private handleMoveStart = (): void => {
    this.canvas.style.visibility = 'hidden';
  };

  private handleMoveEnd = (): void => {
    this.render();
  };

  private resize(): void {
    const rect = this.map.getContainer().getBoundingClientRect();
    const lowPower = window.matchMedia('(max-width: 620px), (pointer: coarse)').matches;
    this.dpr = Math.min(lowPower ? 1.25 : 1.5, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(rect.width * this.dpr));
    const height = Math.max(1, Math.floor(rect.height * this.dpr));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.buffer.width = width;
    this.buffer.height = height;
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.bufferContext.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private render(): void {
    const epoch = ++this.renderEpoch;
    window.cancelAnimationFrame(this.frameID);
    this.frameID = 0;
    this.resize();
    const width = this.buffer.width / this.dpr;
    const height = this.buffer.height / this.dpr;
    this.bufferContext.clearRect(0, 0, width, height);
    this.bufferContext.lineCap = 'round';
    this.bufferContext.lineJoin = 'round';
    const zoom = this.map.getZoom();
    let offset = 0;
    let rendered = 0;

    const drawBatch = (): void => {
      this.frameID = 0;
      if (epoch !== this.renderEpoch) return;
      const end = Math.min(this.routes.length, offset + ROUTE_LATTICE_DRAW_BATCH);
      for (; offset < end; offset += 1) {
        const route = this.routes[offset]!;
        const from = this.map.project(route.from);
        const to = this.map.project(route.to);
        if (!segmentTouchesViewport(from, to, width, height)) continue;
        const style = latticeStyle(route, zoom, this.focused);
        drawLine(this.bufferContext, from, to, route.color, style.glowWidth, style.glowOpacity);
        drawLine(this.bufferContext, from, to, route.color, style.coreWidth, style.coreOpacity);
        rendered += 1;
      }
      if (offset < this.routes.length) {
        this.frameID = window.requestAnimationFrame(drawBatch);
        return;
      }
      this.clearVisible();
      this.context.drawImage(this.buffer, 0, 0, width, height);
      this.canvas.dataset.renderedRoutes = String(rendered);
      this.canvas.style.visibility = this.visible ? 'visible' : 'hidden';
      this.resolveRenderWaiters();
    };
    this.frameID = window.requestAnimationFrame(drawBatch);
  }

  private clearVisible(): void {
    this.context.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    this.canvas.dataset.renderedRoutes = '0';
  }

  private resolveRenderWaiters(): void {
    for (const resolve of this.renderWaiters.splice(0)) resolve();
  }
}

export function latticeStyle(route: Pick<LatticeRoute, 'width' | 'glowWidth' | 'opacity'>, zoom: number, focused: boolean): LatticeStyle {
  const zoomOpacity = interpolateStops(zoom, [[3, 0.1], [5, 0.24], [7, 0.58], [9, 1]]);
  const coreWidth = interpolateStops(zoom, [
    [3, 0.3],
    [7, route.width * 0.7 * (focused ? 1.18 : 1)],
    [10, route.width * (focused ? 1.18 : 1)],
    [14, route.width * 1.15 * (focused ? 1.18 : 1)]
  ]);
  const glowWidth = interpolateStops(zoom, [
    [3, 0.65],
    [7, route.glowWidth * 0.68 * (focused ? 1.36 : 1)],
    [10, route.glowWidth * (focused ? 1.36 : 1)],
    [14, route.glowWidth * 1.18 * (focused ? 1.36 : 1)]
  ]);
  return {
    coreWidth,
    glowWidth,
    coreOpacity: route.opacity * zoomOpacity * (focused ? 1 : 0.72),
    glowOpacity: route.opacity * zoomOpacity * (focused ? 0.52 : 0.16)
  };
}

function drawLine(
  context: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  width: number,
  opacity: number
): void {
  if (width <= 0 || opacity <= 0) return;
  context.globalAlpha = Math.min(1, opacity);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.globalAlpha = 1;
}

function segmentTouchesViewport(
  from: { x: number; y: number },
  to: { x: number; y: number },
  width: number,
  height: number,
  margin = 8
): boolean {
  return Math.max(from.x, to.x) >= -margin
    && Math.min(from.x, to.x) <= width + margin
    && Math.max(from.y, to.y) >= -margin
    && Math.min(from.y, to.y) <= height + margin;
}

function interpolateStops(value: number, stops: ReadonlyArray<readonly [number, number]>): number {
  const first = stops[0]!;
  if (value <= first[0]) return first[1];
  for (let index = 1; index < stops.length; index += 1) {
    const right = stops[index]!;
    if (value > right[0]) continue;
    const left = stops[index - 1]!;
    const progress = (value - left[0]) / (right[0] - left[0]);
    return left[1] + (right[1] - left[1]) * progress;
  }
  return stops[stops.length - 1]![1];
}
