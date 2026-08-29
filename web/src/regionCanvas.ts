import maplibregl from 'maplibre-gl';
import type { Position } from 'geojson';
import type { RegionLinePiece } from './regions';

export const REGION_CANVAS_DRAW_BATCH_VERTICES = 192;

interface RegionStyle {
  width: number;
  opacity: number;
  dash: number;
}

export class RegionCanvas {
  private readonly context: CanvasRenderingContext2D;
  private readonly buffer: HTMLCanvasElement;
  private readonly bufferContext: CanvasRenderingContext2D;
  private pieces: readonly RegionLinePiece[] = [];
  private visible = false;
  private renderEpoch = 0;
  private frameID = 0;
  private dpr = 1;
  private renderWaiters: Array<() => void> = [];

  constructor(private readonly map: maplibregl.Map, private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Region Canvas2D is unavailable');
    this.context = context;
    this.buffer = canvas.ownerDocument.createElement('canvas');
    const bufferContext = this.buffer.getContext('2d');
    if (!bufferContext) throw new Error('Region buffer Canvas2D is unavailable');
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

  setPieces(pieces: readonly RegionLinePiece[]): Promise<void> {
    this.pieces = pieces;
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
    const style = regionStyle(this.map.getZoom());
    this.bufferContext.strokeStyle = '#69d1ca';
    this.bufferContext.globalAlpha = style.opacity;
    this.bufferContext.lineWidth = style.width;
    this.bufferContext.setLineDash([style.dash, style.dash]);
    let pieceIndex = 0;
    let renderedVertices = 0;

    const drawBatch = (): void => {
      this.frameID = 0;
      if (epoch !== this.renderEpoch) return;
      let batchVertices = 0;
      while (pieceIndex < this.pieces.length) {
        const piece = this.pieces[pieceIndex]!;
        if (batchVertices > 0 && batchVertices + piece.coordinates.length > REGION_CANVAS_DRAW_BATCH_VERTICES) break;
        drawPiece(this.bufferContext, this.map, piece.coordinates);
        batchVertices += piece.coordinates.length;
        renderedVertices += piece.coordinates.length;
        pieceIndex += 1;
      }
      if (pieceIndex < this.pieces.length) {
        this.frameID = window.requestAnimationFrame(drawBatch);
        return;
      }
      this.bufferContext.globalAlpha = 1;
      this.bufferContext.setLineDash([]);
      this.clearVisible();
      this.context.drawImage(this.buffer, 0, 0, width, height);
      this.canvas.dataset.renderedVertices = String(renderedVertices);
      this.canvas.style.visibility = this.visible ? 'visible' : 'hidden';
      this.resolveRenderWaiters();
    };
    this.frameID = window.requestAnimationFrame(drawBatch);
  }

  private clearVisible(): void {
    this.context.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    this.canvas.dataset.renderedVertices = '0';
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

function drawPiece(context: CanvasRenderingContext2D, map: maplibregl.Map, coordinates: readonly Position[]): void {
  const first = coordinates[0];
  if (!first) return;
  const start = map.project([first[0]!, first[1]!]);
  context.beginPath();
  context.moveTo(start.x, start.y);
  for (let index = 1; index < coordinates.length; index += 1) {
    const coordinate = coordinates[index]!;
    const point = map.project([coordinate[0]!, coordinate[1]!]);
    context.lineTo(point.x, point.y);
  }
  context.stroke();
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
