import { PACKET_KIND_COLORS } from '../../trafficVisuals';
import type { EndpointV2, StateV2 } from '../../types';
import { CanvasSurface, easeOut, rgba } from '../canvas';
import { clamp, projectCanada, stableHash, type LabContext, type LabExperiment, type LabPacket, type LabPoint, type LabViewport } from '../runtime';

interface LoomThread {
  at: number;
  color: string;
  points: number[];
  observer: boolean;
  seed: number;
}

const THREAD_LIFETIME_MS = 72_000;

class MeshLoom implements LabExperiment {
  readonly soundCharacter = 'loom' as const;
  private context?: LabContext;
  private surface?: CanvasSurface;
  private threads: LoomThread[] = [];
  private topologyThreads: LoomThread[] = [];
  private paused = false;

  mount(context: LabContext): void {
    this.context = context;
    this.surface = new CanvasSurface(context.stage);
    context.stage.dataset.renderer = 'canvas2d';
  }

  applySnapshot(snapshot: Readonly<StateV2>): void {
    const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
    this.topologyThreads = snapshot.routes
      .filter((route) => nodes.has(route.fromId) && nodes.has(route.toId))
      .sort((left, right) => stableHash(left.id) - stableHash(right.id))
      .slice(0, 96)
      .map((route) => {
        const from = nodes.get(route.fromId)!;
        const to = nodes.get(route.toId)!;
        return {
          at: 0,
          color: PACKET_KIND_COLORS[route.lastKind],
          points: [
            projectCanada(from.lng, from.lat, 1, 1).x,
            projectCanada(to.lng, to.lat, 1, 1).x,
          ],
          observer: false,
          seed: stableHash(route.id),
        };
      });
    if (this.context) this.context.stage.dataset.topologyThreadCount = String(this.topologyThreads.length);
  }

  handlePacket(packet: LabPacket): void {
    if (this.paused) return;
    const points = packet.mode === 'route'
      ? [packet.hops[0]?.from, ...packet.hops.map((hop) => hop.to)]
        .filter((point): point is EndpointV2 => point !== undefined)
        .map((point) => projectCanada(point.lng, point.lat, 1, 1).x)
      : packet.observer ? [projectCanada(packet.observer.lng, packet.observer.lat, 1, 1).x] : [];
    this.threads.push({ at: performance.now(), color: PACKET_KIND_COLORS[packet.kind], points, observer: packet.mode === 'observer', seed: packet.seed });
    if (this.threads.length > 240) this.threads.splice(0, this.threads.length - 240);
  }

  resize(viewport: LabViewport): void {
    this.surface?.resize(viewport);
  }

  frame(now: number): void {
    const surface = this.surface;
    const context = this.context;
    if (!surface || !context || this.paused) return;
    const canvas = surface.context;
    this.drawCloth(canvas, surface.width, surface.height, now, context.reducedMotion());
    this.topologyThreads.forEach((thread, index) => {
      const band = (index + 1) / (this.topologyThreads.length + 1);
      const y = surface.height * (0.15 + band * 0.68);
      const alpha = 0.18 + (thread.seed % 5) * 0.018;
      this.drawThread(canvas, thread, y, surface.width, alpha, 4_000, true);
    });
    this.threads = this.threads.filter((thread) => now - thread.at <= THREAD_LIFETIME_MS);
    const reducedMotion = context.reducedMotion();
    this.threads.forEach((thread, index) => {
      const age = now - thread.at;
      const spacing = Math.max(3.4, Math.min(11, surface.height / 86));
      const y = reducedMotion
        ? surface.height - 50 - (this.threads.length - 1 - index) * spacing
        : surface.height - 48 - age * 0.0155;
      if (y < 34 || y > surface.height - 22) return;
      const alpha = clamp(1 - age / THREAD_LIFETIME_MS, 0.07, 0.94);
      this.drawThread(canvas, thread, y, surface.width, alpha, age, reducedMotion);
    });
    this.drawFrame(canvas, surface.width, surface.height);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  reset(): void {
    this.threads = [];
  }

  destroy(): void {
    this.reset();
    this.topologyThreads = [];
    this.surface?.destroy();
    this.surface = undefined;
    this.context = undefined;
  }

  private drawCloth(
    canvas: CanvasRenderingContext2D,
    width: number,
    height: number,
    now: number,
    reducedMotion: boolean,
  ): void {
    const background = canvas.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#061016');
    background.addColorStop(0.45, '#0b2026');
    background.addColorStop(1, '#07131a');
    canvas.fillStyle = background;
    canvas.fillRect(0, 0, width, height);

    canvas.save();
    const drift = reducedMotion ? 0 : now * 0.00014;
    for (let x = 18; x < width; x += 22) {
      const alpha = 0.035 + ((x / 22) % 3) * 0.006;
      canvas.strokeStyle = `rgba(132, 202, 198, ${alpha})`;
      canvas.lineWidth = (x / 22) % 5 === 0 ? 1.2 : 0.65;
      canvas.beginPath();
      for (let y = 26; y <= height - 24; y += 18) {
        const offset = Math.sin(y * 0.015 + x * 0.02 + drift) * 1.4;
        if (y === 26) canvas.moveTo(x + offset, y);
        else canvas.lineTo(x + offset, y);
      }
      canvas.stroke();
    }
    canvas.strokeStyle = 'rgba(125, 180, 184, 0.026)';
    canvas.lineWidth = 0.7;
    for (let y = 38; y < height - 26; y += 14) {
      canvas.beginPath();
      canvas.moveTo(12, y);
      canvas.lineTo(width - 12, y);
      canvas.stroke();
    }
    canvas.restore();

    const sheen = canvas.createLinearGradient(0, height * 0.12, width, height * 0.86);
    sheen.addColorStop(0, 'rgba(112, 207, 195, 0)');
    sheen.addColorStop(0.48, 'rgba(112, 207, 195, 0.045)');
    sheen.addColorStop(0.56, 'rgba(112, 207, 195, 0)');
    canvas.fillStyle = sheen;
    canvas.fillRect(0, 28, width, Math.max(1, height - 52));
  }

  private drawThread(
    canvas: CanvasRenderingContext2D,
    thread: LoomThread,
    y: number,
    width: number,
    alpha: number,
    age: number,
    reducedMotion: boolean,
  ): void {
    if (thread.points.length === 0) return;
    const points = thread.points.map((point, index) => ({
      x: 28 + clamp(point, 0.04, 0.96) * Math.max(1, width - 56),
      y: y + Math.sin(index * 1.83 + thread.seed) * (3.2 + thread.seed % 4),
    }));
    const reveal = reducedMotion ? 1 : easeOut(clamp(age / 1_050, 0, 1));

    canvas.save();
    if (thread.observer) {
      const point = points[0]!;
      canvas.translate(point.x, point.y);
      canvas.rotate(Math.PI / 4);
      canvas.fillStyle = rgba(thread.color, alpha * 0.24);
      canvas.strokeStyle = rgba(thread.color, alpha * 0.8);
      canvas.lineWidth = 1;
      canvas.shadowColor = thread.color;
      canvas.shadowBlur = 9;
      canvas.fillRect(-4.5, -4.5, 9, 9);
      canvas.strokeRect(-5.5, -5.5, 11, 11);
      canvas.restore();
      return;
    }

    const visible = revealPath(points, reveal);
    if (visible.length < 2) {
      canvas.restore();
      return;
    }
    canvas.lineJoin = 'round';
    canvas.lineCap = 'round';
    canvas.strokeStyle = 'rgba(0, 5, 8, 0.5)';
    canvas.lineWidth = 5.6;
    drawSmoothPath(canvas, visible);
    canvas.stroke();
    canvas.strokeStyle = rgba(thread.color, alpha * 0.28);
    canvas.lineWidth = 4;
    canvas.shadowColor = thread.color;
    canvas.shadowBlur = age < 2_200 ? 14 : 5;
    drawSmoothPath(canvas, visible);
    canvas.stroke();
    canvas.shadowBlur = 0;
    canvas.setLineDash([1.4, 3.4]);
    canvas.lineDashOffset = thread.seed % 9;
    canvas.strokeStyle = rgba(thread.color, alpha * 0.88);
    canvas.lineWidth = 1.15;
    drawSmoothPath(canvas, visible);
    canvas.stroke();
    canvas.setLineDash([]);

    const visibleKnots = Math.max(1, Math.ceil(points.length * reveal));
    for (let index = 0; index < visibleKnots; index += 1) {
      const point = points[index];
      if (!point) continue;
      canvas.save();
      canvas.translate(point.x, point.y);
      canvas.rotate((index + thread.seed) % 2 === 0 ? Math.PI / 4 : 0);
      canvas.fillStyle = rgba(thread.color, alpha * 0.86);
      canvas.strokeStyle = rgba('#e9ffff', alpha * 0.34);
      canvas.lineWidth = 0.6;
      canvas.fillRect(-2.35, -2.35, 4.7, 4.7);
      canvas.strokeRect(-2.35, -2.35, 4.7, 4.7);
      canvas.restore();
    }

    if (!reducedMotion && reveal < 1) {
      const shuttle = visible[visible.length - 1]!;
      canvas.translate(shuttle.x, shuttle.y);
      canvas.rotate(Math.PI / 4);
      canvas.fillStyle = '#e8f4dc';
      canvas.shadowColor = thread.color;
      canvas.shadowBlur = 14;
      canvas.fillRect(-3.4, -3.4, 6.8, 6.8);
    }
    canvas.restore();
  }

  private drawFrame(canvas: CanvasRenderingContext2D, width: number, height: number): void {
    const beam = canvas.createLinearGradient(0, 0, 0, 26);
    beam.addColorStop(0, '#142b31');
    beam.addColorStop(0.45, '#0d1f25');
    beam.addColorStop(1, '#061116');
    canvas.fillStyle = beam;
    canvas.fillRect(0, 0, width, 28);
    canvas.save();
    canvas.translate(0, height);
    canvas.scale(1, -1);
    canvas.fillStyle = beam;
    canvas.fillRect(0, 0, width, 24);
    canvas.restore();
    canvas.strokeStyle = 'rgba(139, 214, 207, 0.2)';
    canvas.lineWidth = 1;
    canvas.beginPath();
    canvas.moveTo(0, 28.5);
    canvas.lineTo(width, 28.5);
    canvas.moveTo(0, height - 24.5);
    canvas.lineTo(width, height - 24.5);
    canvas.stroke();
    canvas.fillStyle = '#10272c';
    canvas.fillRect(0, 18, 10, Math.max(1, height - 36));
    canvas.fillRect(width - 10, 18, 10, Math.max(1, height - 36));
    canvas.strokeStyle = 'rgba(138, 211, 203, 0.14)';
    canvas.strokeRect(10.5, 28.5, Math.max(1, width - 21), Math.max(1, height - 53));

    const vignette = canvas.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.18, width / 2, height / 2, Math.max(width, height) * 0.76);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 5, 8, 0.58)');
    canvas.fillStyle = vignette;
    canvas.fillRect(0, 0, width, height);
  }
}

function revealPath(points: readonly LabPoint[], progress: number): LabPoint[] {
  if (points.length < 2) return [...points];
  const scaled = progress * (points.length - 1);
  const fullSegments = Math.floor(scaled);
  const result = points.slice(0, fullSegments + 1);
  if (fullSegments < points.length - 1) {
    const from = points[fullSegments]!;
    const to = points[fullSegments + 1]!;
    const partial = scaled - fullSegments;
    result.push({ x: from.x + (to.x - from.x) * partial, y: from.y + (to.y - from.y) * partial });
  }
  return result;
}

function drawSmoothPath(canvas: CanvasRenderingContext2D, points: readonly LabPoint[]): void {
  canvas.beginPath();
  canvas.moveTo(points[0]!.x, points[0]!.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    const previous = points[index - 1]!;
    canvas.quadraticCurveTo(previous.x, previous.y, (previous.x + point.x) / 2, (previous.y + point.y) / 2);
  }
  const last = points[points.length - 1]!;
  canvas.lineTo(last.x, last.y);
}

export function createExperiment(): LabExperiment {
  return new MeshLoom();
}
