import pondEdgeUrl from '../assets/pond-edge.webp';
import pondWaterUrl from '../assets/pond-water.webp';
import { PACKET_KIND_COLORS } from '../../trafficVisuals';
import { CanvasSurface, drawImageCover, easeOut, loadCanvasImage, rgba } from '../canvas';
import { clamp, stableHash, type LabContext, type LabExperiment, type LabPacket, type LabPoint, type LabViewport } from '../runtime';
import { ReactiveWaterSurface } from '../water';

interface Droplet {
  from: LabPoint;
  to: LabPoint;
  start: number;
  duration: number;
  color: string;
  bend: number;
  seed: number;
}

interface Ripple {
  x: number;
  y: number;
  start: number;
  duration: number;
  color: string;
  strength: number;
  seed: number;
}

interface Channel {
  from: LabPoint;
  to: LabPoint;
  color: string;
  lastAt: number;
  seed: number;
}

class PacketPond implements LabExperiment {
  private context?: LabContext;
  private surface?: CanvasSurface;
  private waterSurface?: ReactiveWaterSurface;
  private readonly water = loadCanvasImage(pondWaterUrl);
  private readonly pondEdge = loadCanvasImage(pondEdgeUrl);
  private droplets: Droplet[] = [];
  private ripples: Ripple[] = [];
  private channels = new Map<string, Channel>();
  private paused = false;

  mount(context: LabContext): void {
    this.context = context;
    this.waterSurface = ReactiveWaterSurface.create(context.stage, this.water.image);
    this.surface = new CanvasSurface(context.stage, 'lab-canvas lab-overlay-canvas');
    context.stage.dataset.renderer = this.waterSurface ? 'webgl2+canvas2d' : 'canvas2d-fallback';
    context.stage.dataset.reactiveWater = String(Boolean(this.waterSurface));
    context.stage.dataset.assets = 'loading';
    const stage = context.stage;
    void Promise.all([this.water.ready, this.pondEdge.ready]).then(
      () => { if (this.context?.stage === stage) stage.dataset.assets = 'ready'; },
      () => { if (this.context?.stage === stage) stage.dataset.assets = 'fallback'; },
    );
  }

  applySnapshot(): void {}

  handlePacket(packet: LabPacket): void {
    if (!this.context || this.paused) return;
    const now = performance.now();
    const color = PACKET_KIND_COLORS[packet.kind];
    if (packet.mode === 'observer' && packet.observer) {
      const point = this.context.project(packet.observer);
      this.ripples.push({ ...point, start: now, duration: 3_600, color, strength: 1.05, seed: packet.seed });
      this.trim();
      return;
    }
    let handoffAt = now;
    packet.hops.forEach((hop) => {
      const from = this.context!.project(hop.from);
      const to = this.context!.project(hop.to);
      const duration = clamp(420 + Math.sqrt(hop.distanceKm) * 20, 440, 1_120);
      const seed = stableHash(`${packet.id}|${hop.routeId}`);
      const bend = ((seed % 201) - 100) / 460;
      const droplet = { from, to, start: handoffAt, duration, color, bend, seed };
      this.droplets.push(droplet);
      this.ripples.push({ ...from, start: handoffAt, duration: 2_400, color, strength: 0.36, seed });
      [0.28, 0.56, 0.79].forEach((fraction, index) => {
        const point = dropletPoint(droplet, fraction);
        this.ripples.push({
          ...point,
          start: handoffAt + duration * fraction,
          duration: 2_250 + index * 180,
          color,
          strength: 0.28 + index * 0.05,
          seed: seed + index + 1,
        });
      });
      this.ripples.push({
        ...to,
        start: handoffAt + duration,
        duration: 3_800,
        color,
        strength: clamp(0.82 + hop.distanceKm / 1_100, 0.82, 1.38),
        seed,
      });
      this.channels.set(hop.routeId, { from, to, color, lastAt: now, seed });
      handoffAt += duration;
    });
    this.trim();
  }

  resize(viewport: LabViewport): void {
    if (this.surface && this.surface.width > 1 && (this.surface.width !== viewport.width || this.surface.height !== viewport.height)) {
      this.reset();
    }
    this.surface?.resize(viewport);
    this.waterSurface?.resize(viewport);
  }

  frame(now: number): void {
    const surface = this.surface;
    const context = this.context;
    if (!surface || !context || this.paused) return;
    const { context: canvas, width, height } = surface;
    const reducedMotion = context.reducedMotion();
    const metrics = context.metrics();
    canvas.clearRect(0, 0, width, height);
    if (this.waterSurface) this.waterSurface.render(now, this.ripples, reducedMotion, metrics.burst);
    else this.drawWaterFallback(canvas, width, height, now, reducedMotion);
    this.drawChannels(canvas, now, metrics.routeReuse, reducedMotion);
    this.drawDroplets(canvas, now, reducedMotion);
    this.drawRipples(canvas, now, reducedMotion, metrics.burst);
    drawImageCover(canvas, this.pondEdge.image, width, height, 0.68, 1.015);
    this.drawVignette(canvas, width, height);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  reset(): void {
    this.droplets = [];
    this.ripples = [];
    this.channels.clear();
  }

  destroy(): void {
    this.reset();
    this.waterSurface?.destroy();
    this.surface?.destroy();
    this.waterSurface = undefined;
    this.surface = undefined;
    this.context = undefined;
  }

  private drawWaterFallback(canvas: CanvasRenderingContext2D, width: number, height: number, now: number, reducedMotion: boolean): void {
    const background = canvas.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, '#031117');
    background.addColorStop(0.52, '#08272e');
    background.addColorStop(1, '#020d11');
    canvas.fillStyle = background;
    canvas.fillRect(0, 0, width, height);

    const driftX = reducedMotion ? 0 : Math.sin(now * 0.000055) * 7;
    const driftY = reducedMotion ? 0 : Math.cos(now * 0.000043) * 5;
    drawImageCover(canvas, this.water.image, width, height, 0.7, 1.075, driftX, driftY);

    canvas.save();
    canvas.globalCompositeOperation = 'screen';
    const rows = this.context?.metrics().burst ? 8 : 13;
    for (let row = 0; row < rows; row += 1) {
      const y = height * (0.11 + row / Math.max(1, rows - 1) * 0.8);
      const phase = row * 1.37 + (reducedMotion ? 0 : now * 0.00016);
      canvas.strokeStyle = `rgba(114, 225, 218, ${0.018 + (row % 3) * 0.009})`;
      canvas.lineWidth = row % 4 === 0 ? 1.25 : 0.75;
      canvas.beginPath();
      for (let x = -32; x <= width + 32; x += 18) {
        const wave = Math.sin(x * 0.017 + phase) * (2.2 + row % 3)
          + Math.sin(x * 0.006 - phase * 0.7) * 1.8;
        if (x === -32) canvas.moveTo(x, y + wave);
        else canvas.lineTo(x, y + wave);
      }
      canvas.stroke();
    }

    const glints = this.context?.metrics().burst ? 12 : 26;
    for (let index = 0; index < glints; index += 1) {
      const seed = stableHash(`pond-glint-${index}`);
      const x = (seed % 10_000) / 10_000 * width;
      const y = ((seed >>> 8) % 10_000) / 10_000 * height;
      const pulse = reducedMotion ? 0.35 : 0.18 + Math.sin(now * 0.0008 + seed) * 0.16;
      canvas.fillStyle = `rgba(174, 241, 235, ${Math.max(0.015, pulse * 0.13)})`;
      canvas.beginPath();
      canvas.ellipse(x, y, 7 + seed % 13, 0.6, -0.2, 0, Math.PI * 2);
      canvas.fill();
    }
    canvas.restore();
  }

  private drawChannels(
    canvas: CanvasRenderingContext2D,
    now: number,
    reuse: ReadonlyMap<string, number>,
    reducedMotion: boolean,
  ): void {
    for (const [routeID, channel] of this.channels) {
      const age = now - channel.lastAt;
      if (age > 45_000) {
        this.channels.delete(routeID);
        continue;
      }
      const strength = (1 - age / 45_000) * clamp((reuse.get(routeID) ?? 1) / 8, 0.15, 1);
      canvas.save();
      canvas.lineCap = 'round';
      canvas.strokeStyle = rgba(channel.color, 0.025 + strength * 0.08);
      canvas.lineWidth = 5 + strength * 8;
      canvas.shadowColor = channel.color;
      canvas.shadowBlur = 15;
      canvas.beginPath();
      canvas.moveTo(channel.from.x, channel.from.y);
      canvas.lineTo(channel.to.x, channel.to.y);
      canvas.stroke();
      canvas.shadowBlur = 0;
      canvas.setLineDash([2, 8 + channel.seed % 7]);
      canvas.lineDashOffset = reducedMotion ? 0 : -now * 0.012;
      canvas.strokeStyle = rgba(channel.color, 0.12 + strength * 0.22);
      canvas.lineWidth = 1 + strength * 1.4;
      canvas.stroke();
      canvas.restore();
    }
  }

  private drawDroplets(canvas: CanvasRenderingContext2D, now: number, reducedMotion: boolean): void {
    this.droplets = this.droplets.filter((drop) => now <= drop.start + drop.duration + 350);
    for (const drop of this.droplets) {
      const raw = (now - drop.start) / drop.duration;
      if (raw < 0 || raw > 1) continue;
      const progress = reducedMotion ? 1 : easeOut(raw);
      const point = dropletPoint(drop, progress);
      const previous = dropletPoint(drop, clamp(progress - 0.075, 0, 1));
      const angle = Math.atan2(point.y - previous.y, point.x - previous.x);

      canvas.save();
      canvas.lineCap = 'round';
      const trail = canvas.createLinearGradient(previous.x, previous.y, point.x, point.y);
      trail.addColorStop(0, rgba(drop.color, 0));
      trail.addColorStop(1, rgba(drop.color, 0.72));
      canvas.strokeStyle = trail;
      canvas.lineWidth = 2.2;
      canvas.shadowColor = drop.color;
      canvas.shadowBlur = 18;
      canvas.beginPath();
      canvas.moveTo(previous.x, previous.y);
      canvas.lineTo(point.x, point.y);
      canvas.stroke();

      canvas.translate(point.x, point.y);
      canvas.rotate(angle);
      canvas.fillStyle = rgba(drop.color, 0.18);
      canvas.beginPath();
      canvas.ellipse(0, 6, 5.5, 1.4, 0, 0, Math.PI * 2);
      canvas.fill();
      const body = canvas.createRadialGradient(-1, -1, 0, 0, 0, 5.5);
      body.addColorStop(0, '#efffff');
      body.addColorStop(0.24, drop.color);
      body.addColorStop(1, rgba(drop.color, 0));
      canvas.fillStyle = body;
      canvas.beginPath();
      canvas.ellipse(0, 0, 5.2, 3.2, 0, 0, Math.PI * 2);
      canvas.fill();
      canvas.restore();
    }
  }

  private drawRipples(canvas: CanvasRenderingContext2D, now: number, reducedMotion: boolean, burst: boolean): void {
    this.ripples = this.ripples.filter((ripple) => now <= ripple.start + ripple.duration);
    const visible = this.ripples.slice(-(burst ? 96 : 240));
    for (const ripple of visible) {
      if (now < ripple.start) continue;
      const progress = clamp((now - ripple.start) / ripple.duration, 0, 1);
      const fade = (1 - progress) * ripple.strength;
      const baseRadius = reducedMotion ? 18 : 4 + easeOut(progress) * (58 + ripple.strength * 12);
      canvas.save();
      canvas.globalCompositeOperation = 'screen';
      canvas.translate(ripple.x, ripple.y);
      canvas.rotate(((ripple.seed % 31) - 15) * Math.PI / 180);
      const ringCount = burst ? 3 : 5;
      for (let ring = 0; ring < ringCount; ring += 1) {
        const delayed = clamp(progress - ring * 0.075, 0, 1);
        if (delayed <= 0 && ring > 0) continue;
        const radius = baseRadius * (0.48 + ring * 0.18);
        canvas.strokeStyle = rgba(ripple.color, fade * (0.5 - ring * 0.075));
        canvas.lineWidth = Math.max(0.55, 2 - ring * 0.28);
        canvas.shadowColor = ripple.color;
        canvas.shadowBlur = 9;
        canvas.beginPath();
        canvas.ellipse(0, 0, radius, radius * 0.38, 0, 0, Math.PI * 2);
        canvas.stroke();
      }
      if (progress < 0.22 && !reducedMotion) {
        const splash = 1 - progress / 0.22;
        canvas.fillStyle = rgba(ripple.color, splash * 0.8);
        for (let index = 0; index < 5; index += 1) {
          const angle = -Math.PI * 0.85 + index * Math.PI * 0.42;
          const distance = (7 + (ripple.seed + index * 13) % 10) * (1 - splash * 0.35);
          canvas.beginPath();
          canvas.arc(Math.cos(angle) * distance, -Math.abs(Math.sin(angle)) * distance * 0.6, 1.1, 0, Math.PI * 2);
          canvas.fill();
        }
      }
      canvas.restore();
    }
  }

  private drawVignette(canvas: CanvasRenderingContext2D, width: number, height: number): void {
    const vignette = canvas.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.16, width / 2, height / 2, Math.max(width, height) * 0.72);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 8, 11, 0.55)');
    canvas.fillStyle = vignette;
    canvas.fillRect(0, 0, width, height);
  }

  private trim(): void {
    if (this.droplets.length > 360) this.droplets.splice(0, this.droplets.length - 360);
    if (this.ripples.length > 720) this.ripples.splice(0, this.ripples.length - 720);
    if (this.channels.size <= 256) return;
    const oldest = [...this.channels].sort((left, right) => left[1].lastAt - right[1].lastAt);
    for (let index = 0; index < oldest.length - 256; index += 1) this.channels.delete(oldest[index]![0]);
  }
}

function dropletPoint(drop: Droplet, progress: number): LabPoint {
  const deltaX = drop.to.x - drop.from.x;
  const deltaY = drop.to.y - drop.from.y;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  const controlX = (drop.from.x + drop.to.x) / 2 - deltaY / distance * distance * drop.bend;
  const controlY = (drop.from.y + drop.to.y) / 2 + deltaX / distance * distance * drop.bend - Math.min(54, distance * 0.12);
  const inverse = 1 - progress;
  return {
    x: inverse * inverse * drop.from.x + 2 * inverse * progress * controlX + progress * progress * drop.to.x,
    y: inverse * inverse * drop.from.y + 2 * inverse * progress * controlY + progress * progress * drop.to.y,
  };
}

export function createExperiment(): LabExperiment {
  return new PacketPond();
}
