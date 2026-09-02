import { PACKET_KIND_COLORS } from '../../trafficVisuals';
import type { EndpointV2 } from '../../types';
import { CanvasSurface, rgba } from '../canvas';
import { clamp, projectCanada, type LabContext, type LabExperiment, type LabPacket, type LabViewport } from '../runtime';

interface LoomThread {
  at: number;
  color: string;
  points: number[];
  observer: boolean;
  seed: number;
}

class MeshLoom implements LabExperiment {
  private context?: LabContext;
  private surface?: CanvasSurface;
  private threads: LoomThread[] = [];
  private paused = false;

  mount(context: LabContext): void {
    this.context = context;
    this.surface = new CanvasSurface(context.stage);
    context.stage.dataset.renderer = 'canvas2d';
  }

  applySnapshot(): void {}

  handlePacket(packet: LabPacket): void {
    if (this.paused) return;
    const points = packet.mode === 'route'
      ? [packet.hops[0]?.from, ...packet.hops.map((hop) => hop.to)]
        .filter((point): point is EndpointV2 => point !== undefined)
        .map((point) => projectCanada(point.lng, point.lat, 1, 1).x)
      : packet.observer ? [projectCanada(packet.observer.lng, packet.observer.lat, 1, 1).x] : [];
    this.threads.push({ at: performance.now(), color: PACKET_KIND_COLORS[packet.kind], points, observer: packet.mode === 'observer', seed: packet.seed });
    if (this.threads.length > 220) this.threads.splice(0, this.threads.length - 220);
  }

  resize(viewport: LabViewport): void {
    this.surface?.resize(viewport);
  }

  frame(now: number): void {
    const surface = this.surface;
    const context = this.context;
    if (!surface || !context || this.paused) return;
    const canvas = surface.context;
    canvas.fillStyle = '#08151b';
    canvas.fillRect(0, 0, surface.width, surface.height);
    this.drawWarp(canvas, surface.width, surface.height);
    this.threads = this.threads.filter((thread) => now - thread.at <= 60_000);
    const reducedMotion = context.reducedMotion();
    this.threads.forEach((thread, index) => {
      const age = now - thread.at;
      const y = reducedMotion
        ? surface.height - 34 - (this.threads.length - 1 - index) * Math.max(3, Math.min(11, surface.height / 90))
        : surface.height - 28 - age * 0.018;
      if (y < -20) return;
      const alpha = clamp(1 - age / 60_000, 0.08, 0.88);
      this.drawThread(canvas, thread, y, surface.width, alpha);
    });
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  reset(): void {
    this.threads = [];
  }

  destroy(): void {
    this.reset();
    this.surface?.destroy();
    this.surface = undefined;
    this.context = undefined;
  }

  private drawWarp(canvas: CanvasRenderingContext2D, width: number, height: number): void {
    canvas.strokeStyle = 'rgba(115, 186, 190, 0.05)';
    canvas.lineWidth = 1;
    for (let x = 24; x < width; x += 32) {
      canvas.beginPath();
      canvas.moveTo(x, 0);
      canvas.lineTo(x, height);
      canvas.stroke();
    }
  }

  private drawThread(canvas: CanvasRenderingContext2D, thread: LoomThread, y: number, width: number, alpha: number): void {
    if (thread.points.length === 0) return;
    const points = thread.points.map((point, index) => ({
      x: clamp(point, 0.04, 0.96) * width,
      y: y + Math.sin(index * 1.9 + thread.seed) * 5,
    }));
    canvas.save();
    canvas.strokeStyle = rgba(thread.color, alpha * 0.72);
    canvas.lineWidth = thread.observer ? 0 : 1.4;
    canvas.shadowColor = thread.color;
    canvas.shadowBlur = 8;
    if (!thread.observer) {
      canvas.beginPath();
      points.forEach((point, index) => {
        if (index === 0) canvas.moveTo(point.x, point.y);
        else canvas.lineTo(point.x, point.y);
      });
      canvas.stroke();
    }
    canvas.fillStyle = rgba(thread.color, alpha);
    for (const point of points) {
      canvas.beginPath();
      canvas.arc(point.x, point.y, thread.observer ? 3.8 : 2.2, 0, Math.PI * 2);
      canvas.fill();
    }
    canvas.restore();
  }
}

export function createExperiment(): LabExperiment {
  return new MeshLoom();
}
