import meadowForegroundUrl from '../assets/meadow-foreground.webp';
import meadowNightUrl from '../assets/meadow-night.webp';
import type { NodeV2, StateV2 } from '../../types';
import { PACKET_KIND_COLORS } from '../../trafficVisuals';
import { CanvasSurface, drawImageCover, easeOut, loadCanvasImage, rgba } from '../canvas';
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

interface PlantWake extends LabPoint {
  start: number;
  duration: number;
  color: string;
  seed: number;
}

const DAY_MS = 24 * 60 * 60_000;

class FireflyMeadow implements LabExperiment {
  private context?: LabContext;
  private surface?: CanvasSurface;
  private readonly backdrop = loadCanvasImage(meadowNightUrl);
  private readonly foreground = loadCanvasImage(meadowForegroundUrl);
  private plants: NodeV2[] = [];
  private fireflies: Firefly[] = [];
  private wakes: PlantWake[] = [];
  private paused = false;

  mount(context: LabContext): void {
    this.context = context;
    this.surface = new CanvasSurface(context.stage);
    context.stage.dataset.renderer = 'canvas2d';
    context.stage.dataset.assets = 'loading';
    const stage = context.stage;
    void Promise.all([this.backdrop.ready, this.foreground.ready]).then(
      () => { if (this.context?.stage === stage) stage.dataset.assets = 'ready'; },
      () => { if (this.context?.stage === stage) stage.dataset.assets = 'fallback'; },
    );
  }

  applySnapshot(snapshot: Readonly<StateV2>): void {
    const recent = snapshot.nodes.filter((node) => snapshot.serverTime - node.lastSeen <= DAY_MS);
    const candidates = recent.length > 0 ? recent : snapshot.nodes;
    this.plants = stableNodeSample(candidates, 180);
  }

  handlePacket(packet: LabPacket): void {
    if (!this.context || this.paused) return;
    const color = PACKET_KIND_COLORS[packet.kind];
    const now = performance.now();
    if (packet.mode === 'observer' && packet.observer) {
      const point = this.context.project(packet.observer);
      this.fireflies.push({ from: point, to: point, start: now, duration: 1_450, color, seed: packet.seed, local: true });
      this.wakes.push({ ...point, start: now + 180, duration: 3_200, color, seed: packet.seed });
    } else {
      let handoffAt = now;
      packet.hops.forEach((hop) => {
        const duration = clamp(460 + Math.sqrt(hop.distanceKm) * 18, 480, 1_120);
        const seed = stableHash(`${packet.id}|${hop.routeId}`);
        const to = this.context!.project(hop.to);
        this.fireflies.push({
          from: this.context!.project(hop.from),
          to,
          start: handoffAt,
          duration,
          color,
          seed,
          local: false,
        });
        this.wakes.push({ ...to, start: handoffAt + duration - 80, duration: 4_600, color, seed });
        handoffAt += duration;
      });
    }
    if (this.fireflies.length > 380) this.fireflies.splice(0, this.fireflies.length - 380);
    if (this.wakes.length > 460) this.wakes.splice(0, this.wakes.length - 460);
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
    const reducedMotion = context.reducedMotion();
    this.drawBackdrop(canvas, surface.width, surface.height, now, reducedMotion);
    this.drawPlants(canvas, context, surface.height, now);
    this.drawWakes(canvas, now, reducedMotion);
    drawImageCover(canvas, this.foreground.image, surface.width, surface.height, 0.54, 1.02, 0, surface.height * 0.02);
    this.drawFireflies(canvas, context, now);
    this.drawAtmosphere(canvas, surface.width, surface.height);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  reset(): void {
    this.fireflies = [];
    this.wakes = [];
  }

  destroy(): void {
    this.reset();
    this.plants = [];
    this.surface?.destroy();
    this.surface = undefined;
    this.context = undefined;
  }

  private drawBackdrop(
    canvas: CanvasRenderingContext2D,
    width: number,
    height: number,
    now: number,
    reducedMotion: boolean,
  ): void {
    canvas.fillStyle = '#061119';
    canvas.fillRect(0, 0, width, height);
    const offsetX = reducedMotion ? 0 : Math.sin(now * 0.000025) * 6;
    drawImageCover(canvas, this.backdrop.image, width, height, 0.88, 1.035, offsetX);
    const sky = canvas.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, 'rgba(2, 9, 20, 0.18)');
    sky.addColorStop(0.55, 'rgba(7, 24, 29, 0.12)');
    sky.addColorStop(1, 'rgba(2, 12, 9, 0.58)');
    canvas.fillStyle = sky;
    canvas.fillRect(0, 0, width, height);

    canvas.save();
    canvas.globalCompositeOperation = 'screen';
    for (let band = 0; band < 3; band += 1) {
      const y = height * (0.56 + band * 0.07);
      const haze = canvas.createLinearGradient(0, y - 32, 0, y + 32);
      haze.addColorStop(0, 'rgba(90, 151, 161, 0)');
      haze.addColorStop(0.5, `rgba(90, 151, 161, ${0.025 + band * 0.012})`);
      haze.addColorStop(1, 'rgba(90, 151, 161, 0)');
      canvas.fillStyle = haze;
      canvas.fillRect(0, y - 32, width, 64);
    }
    canvas.restore();
  }

  private drawPlants(canvas: CanvasRenderingContext2D, context: LabContext, height: number, now: number): void {
    canvas.save();
    canvas.lineCap = 'round';
    for (const node of this.plants) {
      const point = context.project(node);
      const seed = stableHash(node.id);
      const stem = 10 + seed % 28 + (node.role === 'repeater' ? 9 : 0);
      const sway = context.reducedMotion() ? 0 : Math.sin(now * 0.00032 + seed) * (1.2 + seed % 3);
      const baseY = Math.min(height + 4, point.y + stem * 0.45);
      const tipX = point.x + sway * 0.6;
      const tipY = point.y - stem;
      canvas.strokeStyle = node.role === 'repeater' ? 'rgba(92, 218, 192, 0.32)' : 'rgba(121, 174, 139, 0.18)';
      canvas.lineWidth = node.role === 'repeater' ? 1.35 : 0.85;
      canvas.beginPath();
      canvas.moveTo(point.x, baseY);
      canvas.quadraticCurveTo(point.x + sway, point.y, tipX, tipY);
      canvas.stroke();

      const leaves = 2 + seed % 3;
      for (let leaf = 0; leaf < leaves; leaf += 1) {
        const fraction = 0.35 + leaf / Math.max(2, leaves) * 0.46;
        const leafX = point.x + sway * fraction;
        const leafY = baseY + (tipY - baseY) * fraction;
        const side = (leaf + seed) % 2 === 0 ? -1 : 1;
        canvas.strokeStyle = 'rgba(98, 163, 129, 0.16)';
        canvas.beginPath();
        canvas.moveTo(leafX, leafY);
        canvas.quadraticCurveTo(leafX + side * 5, leafY - 2, leafX + side * (7 + seed % 4), leafY - 5);
        canvas.stroke();
      }

      canvas.fillStyle = node.observer ? 'rgba(124, 203, 255, 0.3)' : 'rgba(93, 224, 193, 0.25)';
      canvas.beginPath();
      if (node.role === 'repeater') {
        for (let petal = 0; petal < 4; petal += 1) {
          const angle = petal * Math.PI / 2 + seed;
          canvas.ellipse(tipX + Math.cos(angle) * 2.3, tipY + Math.sin(angle) * 2.3, 1.8, 0.8, angle, 0, Math.PI * 2);
        }
      } else {
        canvas.arc(tipX, tipY, 1.2 + seed % 2, 0, Math.PI * 2);
      }
      canvas.fill();
    }
    canvas.restore();
  }

  private drawWakes(canvas: CanvasRenderingContext2D, now: number, reducedMotion: boolean): void {
    this.wakes = this.wakes.filter((wake) => now <= wake.start + wake.duration);
    for (const wake of this.wakes) {
      if (now < wake.start) continue;
      const progress = clamp((now - wake.start) / wake.duration, 0, 1);
      const pulse = reducedMotion ? 0.65 : 0.72 + Math.sin(progress * Math.PI * 8 + wake.seed) * 0.22;
      const radius = 8 + easeOut(progress) * 19;
      const glow = canvas.createRadialGradient(wake.x, wake.y, 0, wake.x, wake.y, radius);
      glow.addColorStop(0, rgba(wake.color, (1 - progress) * 0.28 * pulse));
      glow.addColorStop(0.38, rgba(wake.color, (1 - progress) * 0.11));
      glow.addColorStop(1, rgba(wake.color, 0));
      canvas.fillStyle = glow;
      canvas.beginPath();
      canvas.arc(wake.x, wake.y, radius, 0, Math.PI * 2);
      canvas.fill();
      canvas.strokeStyle = rgba(wake.color, (1 - progress) * 0.2);
      canvas.lineWidth = 0.8;
      canvas.beginPath();
      canvas.arc(wake.x, wake.y, radius * 0.42, 0, Math.PI * 2);
      canvas.stroke();
    }
  }

  private drawFireflies(canvas: CanvasRenderingContext2D, context: LabContext, now: number): void {
    this.fireflies = this.fireflies.filter((firefly) => now <= firefly.start + firefly.duration + 160);
    const secondaryDetail = context.metrics().burst ? 4 : 8;
    for (const firefly of this.fireflies) {
      const raw = clamp((now - firefly.start) / firefly.duration, 0, 1);
      if (now < firefly.start) continue;
      const progress = context.reducedMotion() || firefly.local ? 1 : easeOut(raw);
      const point = fireflyPoint(firefly, progress, context.reducedMotion());
      const previous = fireflyPoint(firefly, clamp(progress - 0.035, 0, 1), context.reducedMotion());
      const angle = Math.atan2(point.y - previous.y, point.x - previous.x);
      const pulse = firefly.local ? Math.sin(raw * Math.PI) : 0.82 + Math.sin(now * 0.012 + firefly.seed) * 0.18;

      if (!firefly.local && !context.reducedMotion()) {
        for (let trailIndex = secondaryDetail; trailIndex >= 1; trailIndex -= 1) {
          const trailProgress = clamp(progress - trailIndex * 0.018, 0, 1);
          const trailPoint = fireflyPoint(firefly, trailProgress, false);
          const alpha = (1 - trailIndex / (secondaryDetail + 1)) * 0.28 * (1 - raw * 0.35);
          canvas.fillStyle = rgba(firefly.color, alpha);
          canvas.beginPath();
          canvas.arc(trailPoint.x, trailPoint.y, 0.7 + alpha * 2.2, 0, Math.PI * 2);
          canvas.fill();
        }
      }

      canvas.save();
      canvas.translate(point.x, point.y);
      canvas.rotate(angle);
      canvas.strokeStyle = rgba(firefly.color, 0.45 * pulse);
      canvas.lineWidth = 0.8;
      canvas.beginPath();
      canvas.ellipse(-1.8, -1.8, 2.6, 1, -0.45, 0, Math.PI * 2);
      canvas.ellipse(-1.8, 1.8, 2.6, 1, 0.45, 0, Math.PI * 2);
      canvas.stroke();
      canvas.shadowColor = firefly.color;
      canvas.shadowBlur = 22 + pulse * 8;
      const body = canvas.createRadialGradient(0, 0, 0, 0, 0, firefly.local ? 7 : 5.5);
      body.addColorStop(0, '#f5fff2');
      body.addColorStop(0.22, firefly.color);
      body.addColorStop(1, rgba(firefly.color, 0));
      canvas.fillStyle = body;
      canvas.beginPath();
      canvas.arc(0, 0, firefly.local ? 6.5 * pulse : 5, 0, Math.PI * 2);
      canvas.fill();
      canvas.restore();
    }
  }

  private drawAtmosphere(canvas: CanvasRenderingContext2D, width: number, height: number): void {
    const vignette = canvas.createRadialGradient(width / 2, height * 0.46, Math.min(width, height) * 0.1, width / 2, height * 0.5, Math.max(width, height) * 0.72);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(1, 8, 12, 0.48)');
    canvas.fillStyle = vignette;
    canvas.fillRect(0, 0, width, height);
  }
}

function fireflyPoint(firefly: Firefly, progress: number, reducedMotion: boolean): LabPoint {
  const x = firefly.from.x + (firefly.to.x - firefly.from.x) * progress;
  const y = firefly.from.y + (firefly.to.y - firefly.from.y) * progress;
  if (reducedMotion || firefly.local) return { x, y };
  const distance = Math.hypot(firefly.to.x - firefly.from.x, firefly.to.y - firefly.from.y);
  const flutter = Math.min(10, 3 + distance * 0.025);
  return {
    x: x + Math.cos(progress * Math.PI * 3 + firefly.seed) * flutter * 0.28,
    y: y + Math.sin(progress * Math.PI * 2 + firefly.seed) * flutter,
  };
}

export function createExperiment(): LabExperiment {
  return new FireflyMeadow();
}
