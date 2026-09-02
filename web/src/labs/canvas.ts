import type { LabViewport } from './runtime';

export class CanvasSurface {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  width = 1;
  height = 1;
  pixelRatio = 1;

  constructor(stage: HTMLElement, className = 'lab-canvas') {
    this.canvas = document.createElement('canvas');
    this.canvas.className = className;
    this.canvas.setAttribute('aria-hidden', 'true');
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Canvas2D is unavailable');
    this.context = context;
    stage.append(this.canvas);
  }

  resize(viewport: LabViewport): void {
    this.width = Math.max(1, viewport.width);
    this.height = Math.max(1, viewport.height);
    this.pixelRatio = viewport.pixelRatio;
    this.canvas.width = Math.round(this.width * this.pixelRatio);
    this.canvas.height = Math.round(this.height * this.pixelRatio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
  }

  destroy(): void {
    this.canvas.remove();
  }
}

export interface CanvasImageAsset {
  image: HTMLImageElement;
  ready: Promise<void>;
}

export function loadCanvasImage(source: string): CanvasImageAsset {
  const image = new Image();
  image.decoding = 'async';
  const ready = new Promise<void>((resolve, reject) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error(`Could not load visual asset: ${source}`)), { once: true });
  });
  image.src = source;
  return { image, ready };
}

export function drawImageCover(
  canvas: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  alpha = 1,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
): void {
  if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) return;
  const ratio = Math.max(width / image.naturalWidth, height / image.naturalHeight) * scale;
  const drawWidth = image.naturalWidth * ratio;
  const drawHeight = image.naturalHeight * ratio;
  canvas.save();
  canvas.globalAlpha = alpha;
  canvas.drawImage(
    image,
    (width - drawWidth) / 2 + offsetX,
    (height - drawHeight) / 2 + offsetY,
    drawWidth,
    drawHeight,
  );
  canvas.restore();
}

export function rgba(color: string, alpha: number): string {
  const hex = color.replace('#', '');
  const value = Number.parseInt(hex, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function easeOut(value: number): number {
  const bounded = Math.max(0, Math.min(1, value));
  return 1 - (1 - bounded) ** 3;
}

export function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}
