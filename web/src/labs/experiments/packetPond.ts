import { PACKET_KIND_COLORS } from '../../trafficVisuals';
import { CanvasSurface, easeOut, lerp, rgba } from '../canvas';
import { clamp, stableHash, type LabContext, type LabExperiment, type LabPacket, type LabViewport } from '../runtime';

interface Droplet {
  from: { x: number; y: number };
  to: { x: number; y: number };
  start: number;
  duration: number;
  color: string;
  bend: number;
}

interface Ripple {
  x: number;
  y: number;
  start: number;
  duration: number;
  color: string;
}

interface Channel {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  lastAt: number;
}

class PacketPond implements LabExperiment {
  private context?: LabContext;
  private surface?: CanvasSurface;
  private droplets: Droplet[] = [];
  private ripples: Ripple[] = [];
  private channels = new Map<string, Channel>();
  private paused = false;

  mount(context: LabContext): void {
    this.context = context;
    this.surface = new CanvasSurface(context.stage);
    context.stage.dataset.renderer = 'canvas2d';
  }

  applySnapshot(): void {}

  handlePacket(packet: LabPacket): void {
    if (!this.context || this.paused) return;
    const now = performance.now();
    const color = PACKET_KIND_COLORS[packet.kind];
    if (packet.mode === 'observer' && packet.observer) {
      const point = this.context.project(packet.observer);
      this.ripples.push({ ...point, start: now, duration: 1_500, color });
      this.trim();
      return;
    }
    let handoffAt = now;
    packet.hops.forEach((hop) => {
      const from = this.context!.project(hop.from);
      const to = this.context!.project(hop.to);
      const duration = clamp(300 + Math.sqrt(hop.distanceKm) * 18, 320, 920);
      const start = handoffAt;
      handoffAt += duration;
      const bend = ((stableHash(`${packet.id}|${hop.routeId}`) % 201) - 100) / 500;
      this.droplets.push({ from, to, start, duration, color, bend });
      this.ripples.push({ ...to, start: start + duration, duration: 1_350, color });
      this.channels.set(hop.routeId, { from, to, color, lastAt: now });
    });
    this.trim();
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
    const { context: canvas, width, height } = surface;
    const background = canvas.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, '#071820');
    background.addColorStop(0.56, '#08242b');
    background.addColorStop(1, '#041216');
    canvas.fillStyle = background;
    canvas.fillRect(0, 0, width, height);
    this.drawWater(canvas, width, height, now);
    this.drawChannels(canvas, now, context.metrics().routeReuse);
    this.drawDroplets(canvas, now, context.reducedMotion());
    this.drawRipples(canvas, now, context.reducedMotion());
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
    this.surface?.destroy();
    this.surface = undefined;
    this.context = undefined;
  }

  private drawWater(canvas: CanvasRenderingContext2D, width: number, height: number, now: number): void {
    canvas.save();
    canvas.strokeStyle = 'rgba(97, 218, 214, 0.055)';
    canvas.lineWidth = 1;
    for (let row = 0; row < 9; row += 1) {
      const y = height * (0.2 + row * 0.085);
      canvas.beginPath();
      for (let x = -20; x <= width + 20; x += 24) {
        const wave = Math.sin(x * 0.018 + row * 1.7 + now * 0.00018) * 3;
        if (x === -20) canvas.moveTo(x, y + wave);
        else canvas.lineTo(x, y + wave);
      }
      canvas.stroke();
    }
    canvas.restore();
  }

  private drawChannels(canvas: CanvasRenderingContext2D, now: number, reuse: ReadonlyMap<string, number>): void {
    for (const [routeID, channel] of this.channels) {
      const age = now - channel.lastAt;
      if (age > 30_000) {
        this.channels.delete(routeID);
        continue;
      }
      const strength = (1 - age / 30_000) * clamp((reuse.get(routeID) ?? 1) / 8, 0.15, 1);
      canvas.save();
      canvas.strokeStyle = rgba(channel.color, 0.08 + strength * 0.16);
      canvas.lineWidth = 1 + strength * 3;
      canvas.beginPath();
      canvas.moveTo(channel.from.x, channel.from.y);
      canvas.lineTo(channel.to.x, channel.to.y);
      canvas.stroke();
      canvas.restore();
    }
  }

  private drawDroplets(canvas: CanvasRenderingContext2D, now: number, reducedMotion: boolean): void {
    this.droplets = this.droplets.filter((drop) => now <= drop.start + drop.duration + 250);
    for (const drop of this.droplets) {
      const raw = (now - drop.start) / drop.duration;
      if (raw < 0 || raw > 1) continue;
      const progress = reducedMotion ? 1 : easeOut(raw);
      const x = lerp(drop.from.x, drop.to.x, progress);
      const baseline = lerp(drop.from.y, drop.to.y, progress);
      const arc = Math.sin(progress * Math.PI) * Math.hypot(drop.to.x - drop.from.x, drop.to.y - drop.from.y) * drop.bend;
      const y = baseline - arc;
      canvas.save();
      canvas.shadowColor = drop.color;
      canvas.shadowBlur = 18;
      canvas.fillStyle = drop.color;
      canvas.beginPath();
      canvas.arc(x, y, 2.7, 0, Math.PI * 2);
      canvas.fill();
      canvas.restore();
    }
  }

  private drawRipples(canvas: CanvasRenderingContext2D, now: number, reducedMotion: boolean): void {
    this.ripples = this.ripples.filter((ripple) => now <= ripple.start + ripple.duration);
    for (const ripple of this.ripples) {
      const progress = clamp((now - ripple.start) / ripple.duration, 0, 1);
      if (now < ripple.start) continue;
      const radius = reducedMotion ? 11 : 4 + progress * 34;
      canvas.strokeStyle = rgba(ripple.color, (1 - progress) * 0.68);
      canvas.lineWidth = 1.5;
      canvas.beginPath();
      canvas.ellipse(ripple.x, ripple.y, radius, radius * 0.42, 0, 0, Math.PI * 2);
      canvas.stroke();
    }
  }

  private trim(): void {
    if (this.droplets.length > 320) this.droplets.splice(0, this.droplets.length - 320);
    if (this.ripples.length > 420) this.ripples.splice(0, this.ripples.length - 420);
    if (this.channels.size <= 256) return;
    const oldest = [...this.channels].sort((left, right) => left[1].lastAt - right[1].lastAt);
    for (let index = 0; index < oldest.length - 256; index += 1) this.channels.delete(oldest[index]![0]);
  }
}

export function createExperiment(): LabExperiment {
  return new PacketPond();
}
