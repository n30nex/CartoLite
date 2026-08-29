import maplibregl from 'maplibre-gl';
import type { FeatureCollection, Point, Position } from 'geojson';
import type { RegionLinePiece } from './regions';

export const REGION_CANVAS_DRAW_BATCH_VERTICES = 1_024;

const EMPTY_LABELS: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] };

interface RegionStyle {
  width: number;
  opacity: number;
  dash: number;
}

export class RegionCanvas {
  private readonly context: CanvasRenderingContext2D;
  private pieces: readonly RegionLinePiece[] = [];
  private labels: FeatureCollection<Point> = EMPTY_LABELS;
  private visible = false;
  private renderEpoch = 0;
  private frameID = 0;
  private dpr = 1;
  private renderWaiters: Array<() => void> = [];

  constructor(private readonly map: maplibregl.Map, private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Region Canvas2D is unavailable');
    this.context = context;
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

  setData(pieces: readonly RegionLinePiece[], labels: FeatureCollection<Point>): Promise<void> {
    this.pieces = pieces;
    this.labels = labels;
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
    this.dpr = Math.min(lowPower ? 1.15 : 1.35, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(rect.width * this.dpr));
    const height = Math.max(1, Math.floor(rect.height * this.dpr));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private render(): void {
    const epoch = ++this.renderEpoch;
    window.cancelAnimationFrame(this.frameID);
    this.frameID = 0;
    this.resize();
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;
    this.canvas.style.visibility = 'hidden';
    this.context.clearRect(0, 0, width, height);
    this.context.lineCap = 'round';
    this.context.lineJoin = 'round';
    const style = regionStyle(this.map.getZoom());
    this.context.strokeStyle = '#69d1ca';
    this.context.globalAlpha = style.opacity;
    this.context.lineWidth = style.width;
    this.context.setLineDash([style.dash, style.dash]);
    const project = regionProjector(this.map);
    let pieceIndex = 0;
    let renderedVertices = 0;

    const drawBatch = (): void => {
      this.frameID = 0;
      if (epoch !== this.renderEpoch) return;
      let batchVertices = 0;
      while (pieceIndex < this.pieces.length) {
        const piece = this.pieces[pieceIndex]!;
        if (batchVertices > 0 && batchVertices + piece.coordinates.length > REGION_CANVAS_DRAW_BATCH_VERTICES) break;
        drawPiece(this.context, project, piece.coordinates);
        batchVertices += piece.coordinates.length;
        renderedVertices += piece.coordinates.length;
        pieceIndex += 1;
      }
      if (pieceIndex < this.pieces.length) {
        this.frameID = window.requestAnimationFrame(drawBatch);
        return;
      }
      this.context.globalAlpha = 1;
      this.context.setLineDash([]);
      const renderedLabels = drawLabels(this.context, project, this.labels, this.map.getZoom(), width, height);
      this.canvas.dataset.renderedVertices = String(renderedVertices);
      this.canvas.dataset.renderedLabels = String(renderedLabels);
      this.canvas.style.visibility = this.visible ? 'visible' : 'hidden';
      this.resolveRenderWaiters();
    };
    this.frameID = window.requestAnimationFrame(drawBatch);
  }

  private clearVisible(): void {
    this.context.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    this.canvas.dataset.renderedVertices = '0';
    this.canvas.dataset.renderedLabels = '0';
  }

  private resolveRenderWaiters(): void {
    for (const resolve of this.renderWaiters.splice(0)) resolve();
  }
}

export function regionStyle(zoom: number): RegionStyle {
  return {
    width: interpolateStops(zoom, [[3, 0.45], [6, 0.7], [10, 1.1], [14, 1.35]]),
    opacity: interpolateStops(zoom, [[3, 0.18], [6, 0.3], [10, 0.42], [14, 0.28]]),
    dash: interpolateStops(zoom, [[3, 2.2], [8, 3.2], [14, 4.4]])
  };
}

type RegionProjector = (position: Position) => readonly [number, number];

function drawPiece(context: CanvasRenderingContext2D, project: RegionProjector, coordinates: readonly Position[]): void {
  const first = coordinates[0];
  if (!first) return;
  const start = project(first);
  context.beginPath();
  context.moveTo(start[0], start[1]);
  for (let index = 1; index < coordinates.length; index += 1) {
    const point = project(coordinates[index]!);
    context.lineTo(point[0], point[1]);
  }
  context.stroke();
}

function regionProjector(map: maplibregl.Map): RegionProjector {
  const center = map.getCenter();
  const centerPoint = map.project(center);
  const centerMercator = webMercatorPosition([center.lng, center.lat]);
  const worldSize = 512 * (2 ** map.getZoom());
  return (position) => {
    const point = webMercatorPosition(position);
    return [
      centerPoint.x + (point[0] - centerMercator[0]) * worldSize,
      centerPoint.y + (point[1] - centerMercator[1]) * worldSize
    ];
  };
}

export function webMercatorPosition(position: Position): readonly [number, number] {
  const longitude = position[0]!;
  const latitude = Math.max(-85.0511287798, Math.min(85.0511287798, position[1]!));
  const radians = latitude * Math.PI / 180;
  return [
    (longitude + 180) / 360,
    (1 - Math.log(Math.tan(radians) + (1 / Math.cos(radians))) / Math.PI) / 2
  ];
}

function drawLabels(
  context: CanvasRenderingContext2D,
  project: RegionProjector,
  labels: FeatureCollection<Point>,
  zoom: number,
  width: number,
  height: number
): number {
  if (zoom < 5) return 0;
  const fontSize = interpolateStops(zoom, [[5, 8], [9, 9.2], [13, 10.5]]);
  context.font = `650 ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 2.4;
  context.strokeStyle = '#02070b';
  context.fillStyle = '#8ec5c1';
  context.globalAlpha = interpolateStops(zoom, [[5, 0.58], [9, 0.76], [13, 0.68]]);
  const occupied: Array<readonly [number, number, number, number]> = [];
  let rendered = 0;
  for (const feature of labels.features) {
    const code = String(feature.properties?.code ?? '');
    if (!code) continue;
    const point = project(feature.geometry.coordinates);
    const halfWidth = context.measureText(code).width / 2 + 8;
    const halfHeight = fontSize / 2 + 5;
    const bounds = [point[0] - halfWidth, point[1] - halfHeight, point[0] + halfWidth, point[1] + halfHeight] as const;
    if (bounds[2] < 0 || bounds[0] > width || bounds[3] < 0 || bounds[1] > height) continue;
    if (occupied.some((other) => bounds[0] < other[2] && bounds[2] > other[0] && bounds[1] < other[3] && bounds[3] > other[1])) continue;
    occupied.push(bounds);
    context.strokeText(code, point[0], point[1]);
    context.fillText(code, point[0], point[1]);
    rendered += 1;
  }
  context.globalAlpha = 1;
  return rendered;
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
