import type { NodeV2, StateV2 } from '../../types';
import { PACKET_KIND_COLORS } from '../../trafficVisuals';
import { CanvasSurface, easeOut, lerp, rgba } from '../canvas';
import { clamp, stableHash, stableNodeSample, type LabContext, type LabExperiment, type LabPacket, type LabPoint, type LabViewport } from '../runtime';

interface Firefly {
  from: LabPoint;
  to: LabPoint;
  start: number;
  duration: number;
  color: string;
  seed: number;
  local: boolean;
}

class FireflyMeadow implements LabExperiment {
  private context?: LabContext;
  private surface?: CanvasSurface;
  private plants: NodeV2[] = [];
  private fireflies: Firefly[] = [];
  private paused = false;

  mount(context: LabContext): void {
    this.context = context;
    this.surface = new CanvasSurface(context.stage);
    context.stage.dataset.renderer = 'canvas2d';
  }

  applySnapshot(snapshot: Readonly<StateV2>): void {
    this.plants = stableNodeSample(snapshot.nodes, 120);
  }

  handlePacket(packet: LabPacket): void {
    if (!this.context || this.paused) return;
    const color = PACKET_KIND_COLORS[packet.kind];
    const now = performance.now();
    if (packet.mode === 'observer' && packet.observer) {
      const point = this.context.project(packet.observer);
      this.fireflies.push({ from: point, to: point, start: now, duration: 1_100, color, seed: packet.seed, local: true });
    } else {
      let handoffAt = now;
      packet.hops.forEach((hop) => {
        const duration = clamp(360 + Math.sqrt(hop.distanceKm) * 16, 380, 1_000);
        this.fireflies.push({
          from: this.context!.project(hop.from),
          to: this.context!.project(hop.to),
          start: handoffAt,
          duration,
          color,
          seed: stableHash(`${packet.id}|${hop.routeId}`),
          local: false,
        });
        handoffAt += duration;
      });
    }
    if (this.fireflies.length > 360) this.fireflies.splice(0, this.fireflies.length - 360);
  }

  resize(viewport: LabViewport): void {
    if (this.surface && this.surface.width > 1 && (this.surface.width !== viewport.width || this.surface.height !== viewport.height)) {
      this.reset();
    }
    this.surface?.resize(viewport);
  }

  frame(now: number): void {
    const surface = this.surface;
    const context = this.context;
    if (!surface || !context || this.paused) return;
    const canvas = surface.context;
    const gradient = canvas.createLinearGradient(0, 0, 0, surface.height);
    gradient.addColorStop(0, '#07151d');
    gradient.addColorStop(0.62, '#0b2020');
    gradient.addColorStop(1, '#071510');
    canvas.fillStyle = gradient;
    canvas.fillRect(0, 0, surface.width, surface.height);
    this.drawPlants(canvas, context, surface.height, now);
    this.drawFireflies(canvas, context, now);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  reset(): void {
    this.fireflies = [];
  }

  destroy(): void {
    this.reset();
    this.plants = [];
    this.surface?.destroy();
    this.surface = undefined;
    this.context = undefined;
  }

  private drawPlants(canvas: CanvasRenderingContext2D, context: LabContext, height: number, now: number): void {
    canvas.save();
    canvas.lineWidth = 1;
    for (const node of this.plants) {
      const point = context.project(node);
      const seed = stableHash(node.id);
      const stem = 8 + seed % 20;
      const sway = context.reducedMotion() ? 0 : Math.sin(now * 0.00035 + seed) * 1.5;
      canvas.strokeStyle = node.role === 'repeater' ? 'rgba(77, 231, 196, 0.2)' : 'rgba(126, 171, 151, 0.13)';
      canvas.beginPath();
      canvas.moveTo(point.x, Math.min(height, point.y + stem * 0.35));
      canvas.quadraticCurveTo(point.x + sway, point.y, point.x + sway * 0.5, point.y - stem);
      canvas.stroke();
      canvas.fillStyle = node.observer ? 'rgba(120, 207, 255, 0.25)' : 'rgba(77, 231, 196, 0.18)';
      canvas.beginPath();
      canvas.arc(point.x + sway * 0.5, point.y - stem, node.role === 'repeater' ? 2.2 : 1.3, 0, Math.PI * 2);
      canvas.fill();
    }
    canvas.restore();
  }

  private drawFireflies(canvas: CanvasRenderingContext2D, context: LabContext, now: number): void {
    this.fireflies = this.fireflies.filter((firefly) => now <= firefly.start + firefly.duration);
    for (const firefly of this.fireflies) {
      const raw = clamp((now - firefly.start) / firefly.duration, 0, 1);
      if (now < firefly.start) continue;
      const progress = context.reducedMotion() || firefly.local ? 1 : easeOut(raw);
      const x = lerp(firefly.from.x, firefly.to.x, progress);
      const y = lerp(firefly.from.y, firefly.to.y, progress)
        + (context.reducedMotion() ? 0 : Math.sin(progress * Math.PI * 2 + firefly.seed) * 7);
      const pulse = firefly.local ? Math.sin(raw * Math.PI) : 1;
      canvas.save();
      canvas.shadowColor = firefly.color;
      canvas.shadowBlur = 18 + pulse * 8;
      canvas.fillStyle = rgba(firefly.color, (1 - raw * 0.55) * pulse);
      canvas.beginPath();
      canvas.arc(x, y, firefly.local ? 3.5 + pulse * 2 : 2.4, 0, Math.PI * 2);
      canvas.fill();
      canvas.restore();
    }
  }
}

export function createExperiment(): LabExperiment {
  return new FireflyMeadow();
}
