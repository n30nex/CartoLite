import type maplibregl from 'maplibre-gl';
import type { EndpointV1, ObserverPacketV1, PacketV1, RoutePacketV1, RouteSegmentV1 } from './types';

export const SINGLE_HOP_MS = 2100;
export const MAX_ROUTE_MS = 3200;
export const AFTERGLOW_MS = 1200;
export const RESIDUE_MS = 15_000;
export const RESIDUE_REDRAW_MS = 250;
const MAX_ACTIVE = 32;
const MAX_RESIDUE = 240;

interface ActiveRoute {
  packet: RoutePacketV1;
  color: string;
  started: number;
  duration: number;
}

interface ActiveObserver {
  packet: ObserverPacketV1;
  color: string;
  started: number;
}

interface Residue {
  segment: RouteSegmentV1;
  color: string;
  addedAt: number;
}

export function packetDuration(hops: number): number {
  return Math.min(MAX_ROUTE_MS, SINGLE_HOP_MS + Math.max(0, hops - 1) * 360);
}

export function payloadColor(payloadType: string): string {
  const value = payloadType.toLowerCase();
  if (value.includes('trace')) return '#e9d72f';
  if (value.includes('text')) return '#ec79b0';
  if (value.includes('ack')) return '#8bd4ff';
  if (value.includes('advert')) return '#48dcc1';
  return '#7dbfff';
}

export function observerRadius(age: number): number {
  return 10 + (Math.max(0, age) / 4200) * 40;
}

export function residueLife(age: number): number {
  return Math.max(0, 1 - Math.max(0, age) / RESIDUE_MS);
}

export class PacketAnimator {
  private readonly context: CanvasRenderingContext2D;
  private activeRoutes: ActiveRoute[] = [];
  private activeObservers: ActiveObserver[] = [];
  private residue: Residue[] = [];
  private frameId = 0;
  private residueTimer?: number;
  private paused = false;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private dpr = 1;

  constructor(private readonly map: maplibregl.Map, private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas2D is unavailable');
    this.context = context;
    this.draw = this.draw.bind(this);
    this.resize = this.resize.bind(this);
    this.map.on('resize', this.resize);
    this.map.on('move', this.requestFrame);
    this.resize();
  }

  add(packet: PacketV1): void {
    const color = payloadColor(packet.payloadType);
    const started = performance.now();
    if (packet.mode === 'route') {
      if (packet.segments.length === 0) return;
      this.activeRoutes.push({ packet, color, started, duration: this.reducedMotion ? 0 : packetDuration(packet.segments.length) });
      for (const segment of packet.segments) this.residue.push({ segment, color, addedAt: started });
      this.activeRoutes = this.activeRoutes.slice(-MAX_ACTIVE);
      this.residue = this.residue.slice(-MAX_RESIDUE);
    } else {
      this.activeObservers.push({ packet, color, started });
      this.activeObservers = this.activeObservers.slice(-MAX_ACTIVE);
    }
    this.requestFrame();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.activeRoutes = [];
      this.activeObservers = [];
      this.residue = [];
      window.cancelAnimationFrame(this.frameId);
      if (this.residueTimer !== undefined) window.clearTimeout(this.residueTimer);
      this.frameId = 0;
      this.residueTimer = undefined;
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.requestFrame();
    }
  }

  destroy(): void {
    this.setPaused(true);
    this.map.off('resize', this.resize);
    this.map.off('move', this.requestFrame);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.requestFrame();
  }

  private requestFrame = (): void => {
    if (this.paused || this.frameId !== 0) return;
    if (this.residueTimer !== undefined) window.clearTimeout(this.residueTimer);
    this.residueTimer = undefined;
    this.frameId = window.requestAnimationFrame(this.draw);
  };

  private requestResidueFrame(now: number): void {
    if (this.paused || this.residueTimer !== undefined || this.frameId !== 0) return;
    let delay = RESIDUE_REDRAW_MS;
    for (const item of this.residue) delay = Math.min(delay, Math.max(0, item.addedAt + RESIDUE_MS - now));
    this.residueTimer = window.setTimeout(() => {
      this.residueTimer = undefined;
      this.requestFrame();
    }, delay);
  }

  private draw(now: number): void {
    this.frameId = 0;
    if (this.paused) return;
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;
    this.context.clearRect(0, 0, width, height);
    this.residue = this.residue.filter((item) => now - item.addedAt < RESIDUE_MS);
    this.context.save();
    this.context.globalCompositeOperation = 'lighter';
    this.context.lineCap = 'round';
    for (const item of this.residue) this.drawResidue(item, now);
    this.context.restore();
    this.activeRoutes = this.activeRoutes.filter((item) => now - item.started <= item.duration + AFTERGLOW_MS);
    this.activeObservers = this.activeObservers.filter((item) => now - item.started <= (this.reducedMotion ? AFTERGLOW_MS : 4200));
    for (const route of this.activeRoutes) this.drawRoute(route, now);
    for (const observer of this.activeObservers) this.drawObserver(observer, now);
    if (this.activeRoutes.length || this.activeObservers.length) this.requestFrame();
    else if (this.residue.length) this.requestResidueFrame(now);
  }

  private drawResidue(item: Residue, now: number): void {
    const from = this.point(item.segment.from);
    const to = this.point(item.segment.to);
    const life = residueLife(now - item.addedAt);
    this.context.beginPath();
    this.context.moveTo(from.x, from.y);
    this.context.lineTo(to.x, to.y);
    this.context.strokeStyle = withAlpha(item.color, life * 0.5);
    this.context.lineWidth = 2.6;
    this.context.stroke();
  }

  private drawRoute(item: ActiveRoute, now: number): void {
    const elapsed = now - item.started;
    const movingProgress = item.duration === 0 ? 1 : Math.min(1, elapsed / item.duration);
    const afterglow = item.duration === 0 ? Math.max(0, 1 - elapsed / AFTERGLOW_MS) : Math.max(0, 1 - (elapsed - item.duration) / AFTERGLOW_MS);
    if (this.reducedMotion) {
      const opacity = Math.max(0, afterglow);
      const first = item.packet.segments[0];
      const last = item.packet.segments[item.packet.segments.length - 1];
      if (first) this.flash(this.point(first.from), item.color, opacity);
      if (last) this.flash(this.point(last.to), item.color, opacity);
      return;
    }
    const segmentFloat = movingProgress * item.packet.segments.length;
    const segmentIndex = Math.min(item.packet.segments.length - 1, Math.floor(segmentFloat));
    const segment = item.packet.segments[segmentIndex];
    if (!segment) return;
    const local = movingProgress >= 1 ? 1 : segmentFloat - segmentIndex;
    const from = this.point(segment.from);
    const to = this.point(segment.to);
    const x = from.x + (to.x - from.x) * local;
    const y = from.y + (to.y - from.y) * local;
    const opacity = elapsed <= item.duration ? 1 : afterglow;

    this.ring(this.point(item.packet.segments[0]?.from ?? segment.from), item.color, Math.min(1, elapsed / 500), opacity);
    for (let index = 0; index < item.packet.segments.length - 1; index += 1) {
      const boundary = (index + 1) / item.packet.segments.length;
      const delta = Math.abs(movingProgress - boundary);
      if (delta < 0.16) this.ring(this.point(item.packet.segments[index]?.to ?? segment.to), item.color, Math.min(1, delta / 0.16), opacity * (1 - delta / 0.16));
    }
    if (movingProgress > 0.72) {
      const last = item.packet.segments[item.packet.segments.length - 1];
      if (last) this.ring(this.point(last.to), item.color, (movingProgress - 0.72) / 0.28, opacity);
    }
    this.comet(from.x, from.y, x, y, item.color, opacity);
  }

  private drawObserver(item: ActiveObserver, now: number): void {
    const age = Math.max(0, now - item.started);
    const life = Math.max(0, 1 - age / (this.reducedMotion ? AFTERGLOW_MS : 4200));
    const point = this.point(item.packet.observer);
    if (this.reducedMotion) {
      this.flash(point, item.color, life);
      return;
    }
    const radius = observerRadius(age);
    const gradient = this.context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    gradient.addColorStop(0, withAlpha(item.color, 0.28 * life));
    gradient.addColorStop(1, withAlpha(item.color, 0));
    this.context.fillStyle = gradient;
    this.context.beginPath();
    this.context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    this.context.fill();
    this.ring(point, item.color, Math.min(1, age / 1100), life);
  }

  private comet(fromX: number, fromY: number, x: number, y: number, color: string, opacity: number): void {
    const gradient = this.context.createLinearGradient(fromX, fromY, x, y);
    gradient.addColorStop(0, withAlpha(color, 0));
    gradient.addColorStop(0.72, withAlpha(color, 0.14 * opacity));
    gradient.addColorStop(1, withAlpha(color, 0.9 * opacity));
    this.context.lineCap = 'round';
    this.context.strokeStyle = gradient;
    this.context.lineWidth = 5;
    this.context.beginPath();
    this.context.moveTo(fromX, fromY);
    this.context.lineTo(x, y);
    this.context.stroke();
    this.context.shadowBlur = 14;
    this.context.shadowColor = color;
    this.context.fillStyle = withAlpha('#ffffff', opacity);
    this.context.beginPath();
    this.context.arc(x, y, 2.4, 0, Math.PI * 2);
    this.context.fill();
    this.context.shadowBlur = 0;
  }

  private ring(point: { x: number; y: number }, color: string, progress: number, opacity: number): void {
    const p = Math.max(0, Math.min(1, progress));
    this.context.strokeStyle = withAlpha(color, (1 - p) * 0.9 * opacity);
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    this.context.arc(point.x, point.y, 5 + p * 15, 0, Math.PI * 2);
    this.context.stroke();
  }

  private flash(point: { x: number; y: number }, color: string, opacity: number): void {
    const gradient = this.context.createRadialGradient(point.x, point.y, 0, point.x, point.y, 17);
    gradient.addColorStop(0, withAlpha('#ffffff', 0.85 * opacity));
    gradient.addColorStop(0.25, withAlpha(color, 0.55 * opacity));
    gradient.addColorStop(1, withAlpha(color, 0));
    this.context.fillStyle = gradient;
    this.context.beginPath();
    this.context.arc(point.x, point.y, 17, 0, Math.PI * 2);
    this.context.fill();
  }

  private point(endpoint: EndpointV1): { x: number; y: number } {
    return this.map.project([endpoint.lng, endpoint.lat]);
  }
}

function withAlpha(color: string, alpha: number): string {
  const value = color.startsWith('#') ? color.slice(1) : 'ffffff';
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${Math.max(0, Math.min(1, alpha))})`;
}
