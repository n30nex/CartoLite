import type { EndpointV2, StateV2 } from '../../types';
import { PACKET_KIND_COLORS } from '../../trafficVisuals';
import { CanvasSurface, easeOut, rgba } from '../canvas';
import { clamp, stableHash, type LabContext, type LabExperiment, type LabPacket, type LabPoint, type LabViewport } from '../runtime';
import { buildVillageModel, type VillageBuildingModel, type VillageModel, type VillageSettlementModel } from '../villageModel';

interface VillageCourier {
  points: LabPoint[];
  start: number;
  hopDuration: number;
  color: string;
  seed: number;
  observer: boolean;
}

interface Lantern extends LabPoint {
  start: number;
  duration: number;
  color: string;
  seed: number;
}

class LittleMeshVillages implements LabExperiment {
  readonly soundCharacter = 'village' as const;
  private context?: LabContext;
  private surface?: CanvasSurface;
  private cache?: HTMLCanvasElement;
  private model?: VillageModel;
  private pendingSnapshot?: Readonly<StateV2>;
  private layout = new Map<string, LabPoint>();
  private settlementCenters = new Map<string, LabPoint>();
  private couriers: VillageCourier[] = [];
  private lanterns: Lantern[] = [];
  private truthNote?: HTMLParagraphElement;
  private viewport: LabViewport = { width: 1, height: 1, pixelRatio: 1 };
  private lastModelAt = Number.NEGATIVE_INFINITY;
  private cacheDirty = true;
  private paused = false;

  mount(context: LabContext): void {
    this.context = context;
    this.surface = new CanvasSurface(context.stage);
    this.cache = document.createElement('canvas');
    this.truthNote = document.createElement('p');
    this.truthNote.className = 'village-truth glass';
    this.truthNote.textContent = 'Settlement size represents recently observed MeshCore nodes and connectivity, not real-world population or permanent network coverage.';
    context.stage.append(this.truthNote);
    context.stage.dataset.renderer = 'canvas2d';
  }

  applySnapshot(snapshot: Readonly<StateV2>): void {
    this.pendingSnapshot = snapshot;
    if (!this.model) this.rebuildModel(performance.now());
  }

  handlePacket(packet: LabPacket): void {
    if (!this.context || this.paused) return;
    const now = performance.now();
    const color = PACKET_KIND_COLORS[packet.kind];
    if (packet.mode === 'observer' && packet.observer) {
      const point = this.pointFor(packet.observer);
      this.couriers.push({ points: [point], start: now, hopDuration: 900, color, seed: packet.seed, observer: true });
      this.lanterns.push({ ...point, start: now, duration: 5_500, color, seed: packet.seed });
    } else {
      const endpoints = [packet.hops[0]?.from, ...packet.hops.map((hop) => hop.to)]
        .filter((endpoint): endpoint is EndpointV2 => endpoint !== undefined);
      const points = endpoints.map((endpoint) => this.pointFor(endpoint));
      const hopDuration = clamp(430 + packet.totalDistanceKm / Math.max(1, packet.hopCount) * 0.65, 460, 980);
      this.couriers.push({ points, start: now, hopDuration, color, seed: packet.seed, observer: false });
      points.slice(1).forEach((point, index) => {
        this.lanterns.push({ ...point, start: now + (index + 1) * hopDuration - 100, duration: 8_500, color, seed: packet.seed + index });
      });
    }
    if (this.couriers.length > 220) this.couriers.splice(0, this.couriers.length - 220);
    if (this.lanterns.length > 420) this.lanterns.splice(0, this.lanterns.length - 420);
  }

  resize(viewport: LabViewport): void {
    const changed = this.viewport.width !== viewport.width || this.viewport.height !== viewport.height || this.viewport.pixelRatio !== viewport.pixelRatio;
    this.viewport = viewport;
    this.surface?.resize(viewport);
    if (!changed) return;
    this.couriers = [];
    this.lanterns = [];
    this.cacheDirty = true;
  }

  frame(now: number): void {
    const surface = this.surface;
    if (!surface || !this.context || this.paused) return;
    if (this.pendingSnapshot && now - this.lastModelAt >= 4_000) this.rebuildModel(now);
    if (this.cacheDirty) this.rebuildCache();
    const canvas = surface.context;
    canvas.clearRect(0, 0, surface.width, surface.height);
    if (this.cache) canvas.drawImage(this.cache, 0, 0, surface.width, surface.height);
    this.drawLanterns(canvas, now, this.context.reducedMotion());
    this.drawCouriers(canvas, now, this.context.reducedMotion());
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  reset(): void {
    this.couriers = [];
    this.lanterns = [];
  }

  destroy(): void {
    this.reset();
    this.truthNote?.remove();
    this.surface?.destroy();
    this.model = undefined;
    this.pendingSnapshot = undefined;
    this.cache = undefined;
    this.layout.clear();
    this.settlementCenters.clear();
    this.truthNote = undefined;
    this.surface = undefined;
    this.context = undefined;
  }

  private rebuildModel(now: number): void {
    if (!this.pendingSnapshot) return;
    this.model = buildVillageModel(this.pendingSnapshot);
    this.pendingSnapshot = undefined;
    this.lastModelAt = now;
    this.cacheDirty = true;
  }

  private rebuildCache(): void {
    const cache = this.cache;
    const context = this.context;
    const model = this.model;
    if (!cache || !context || !model) return;
    const width = Math.max(1, this.viewport.width);
    const height = Math.max(1, this.viewport.height);
    const pixelRatio = this.viewport.pixelRatio;
    cache.width = Math.round(width * pixelRatio);
    cache.height = Math.round(height * pixelRatio);
    const canvas = cache.getContext('2d');
    if (!canvas) return;
    canvas.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.layout.clear();
    this.settlementCenters.clear();
    this.layoutSettlements(model.settlements, width, height);
    this.drawNight(canvas, width, height);
    this.drawRoads(canvas, model);
    this.drawSettlements(canvas, model.settlements);
    this.drawSettlementLabels(canvas, model.settlements, width, height);
    this.drawVignette(canvas, width, height);
    this.cacheDirty = false;
  }

  private layoutSettlements(settlements: readonly VillageSettlementModel[], width: number, height: number): void {
    const context = this.context!;
    const safeTop = Math.max(132, height * 0.18);
    const safeBottom = height * (width < 900 ? 0.68 : 0.84);
    for (const settlement of settlements) {
      const projected = context.project(settlement.center);
      const normalizedX = clamp((projected.x / width - 0.04) / 0.92, 0, 1);
      const normalizedY = clamp((projected.y / height - 0.04) / 0.92, 0, 1);
      const center = {
        x: clamp(width * (0.08 + normalizedX * 0.84), 46, Math.max(46, width - 46)),
        y: clamp(safeTop + normalizedY * Math.max(1, safeBottom - safeTop), safeTop, safeBottom),
      };
      this.settlementCenters.set(settlement.id, center);
      const cell = clamp(6.8 + Math.sqrt(settlement.buildings.length) * 0.32, 7.2, 11.5);
      for (const building of settlement.buildings) {
        const x = center.x + (building.localX - building.localY) * cell;
        const y = center.y + (building.localX + building.localY) * cell * 0.46;
        this.layout.set(building.nodeId, { x, y });
      }
    }
  }

  private drawNight(canvas: CanvasRenderingContext2D, width: number, height: number): void {
    const sky = canvas.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#050c18');
    sky.addColorStop(0.48, '#0a1a24');
    sky.addColorStop(1, '#08120f');
    canvas.fillStyle = sky;
    canvas.fillRect(0, 0, width, height);
    canvas.save();
    for (let index = 0; index < 80; index += 1) {
      const seed = stableHash(`village-star-${index}`);
      const x = (seed % 10_000) / 10_000 * width;
      const y = ((seed >>> 8) % 10_000) / 10_000 * height * 0.55;
      canvas.fillStyle = `rgba(177, 218, 218, ${0.035 + (seed % 5) * 0.012})`;
      canvas.fillRect(x, y, seed % 7 === 0 ? 1.2 : 0.7, 0.7);
    }
    const horizon = canvas.createLinearGradient(0, height * 0.45, 0, height * 0.82);
    horizon.addColorStop(0, 'rgba(69, 117, 119, 0)');
    horizon.addColorStop(0.5, 'rgba(69, 117, 119, 0.07)');
    horizon.addColorStop(1, 'rgba(9, 27, 20, 0)');
    canvas.fillStyle = horizon;
    canvas.fillRect(0, height * 0.45, width, height * 0.37);
    const moon = canvas.createRadialGradient(width * 0.72, height * 0.24, 0, width * 0.72, height * 0.24, Math.min(width, height) * 0.22);
    moon.addColorStop(0, 'rgba(156, 207, 196, 0.09)');
    moon.addColorStop(1, 'rgba(60, 104, 101, 0)');
    canvas.fillStyle = moon;
    canvas.fillRect(0, 0, width, height * 0.58);
    canvas.fillStyle = 'rgba(5, 21, 22, 0.74)';
    canvas.beginPath();
    canvas.moveTo(0, height * 0.62);
    for (let x = 0; x <= width; x += Math.max(24, width / 42)) {
      canvas.lineTo(x, height * (0.57 + Math.sin(x * 0.009) * 0.025 + Math.sin(x * 0.021) * 0.012));
    }
    canvas.lineTo(width, height * 0.76);
    canvas.lineTo(0, height * 0.76);
    canvas.closePath();
    canvas.fill();
    canvas.restore();
  }

  private drawRoads(canvas: CanvasRenderingContext2D, model: VillageModel): void {
    for (const road of model.roads) {
      const from = this.layout.get(road.fromId);
      const to = this.layout.get(road.toId);
      if (!from || !to) continue;
      const color = PACKET_KIND_COLORS[road.kind];
      const strength = clamp(road.traffic / 20, 0.08, 1);
      canvas.save();
      canvas.lineCap = 'round';
      canvas.strokeStyle = road.intercity ? 'rgba(42, 62, 65, 0.78)' : 'rgba(34, 52, 49, 0.9)';
      canvas.lineWidth = road.intercity ? 4.2 : 3.1;
      canvas.beginPath();
      canvas.moveTo(from.x, from.y);
      canvas.lineTo(to.x, to.y);
      canvas.stroke();
      canvas.strokeStyle = rgba(color, 0.12 + strength * (road.intercity ? 0.3 : 0.2));
      canvas.lineWidth = road.intercity ? 1.45 : 1;
      if (road.intercity) canvas.setLineDash([4, 5]);
      canvas.stroke();
      canvas.restore();
    }
  }

  private drawSettlements(canvas: CanvasRenderingContext2D, settlements: readonly VillageSettlementModel[]): void {
    for (const settlement of settlements) {
      const center = this.settlementCenters.get(settlement.id);
      if (!center) continue;
      const radius = clamp(17 + Math.sqrt(settlement.buildings.length) * 5.2, 21, 76);
      const ground = canvas.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius);
      ground.addColorStop(0, settlement.traffic > 0 ? 'rgba(76, 104, 74, 0.17)' : 'rgba(47, 69, 54, 0.13)');
      ground.addColorStop(1, 'rgba(14, 27, 21, 0)');
      canvas.fillStyle = ground;
      canvas.beginPath();
      canvas.ellipse(center.x, center.y + 4, radius, radius * 0.47, 0, 0, Math.PI * 2);
      canvas.fill();
      this.drawSettlementTrees(canvas, settlement, center, radius);
      const ordered = settlement.buildings.slice().sort((left, right) => {
        const leftPoint = this.layout.get(left.nodeId)?.y ?? 0;
        const rightPoint = this.layout.get(right.nodeId)?.y ?? 0;
        return leftPoint - rightPoint || left.seed - right.seed;
      });
      for (const building of ordered) {
        const point = this.layout.get(building.nodeId);
        if (point) this.drawBuilding(canvas, building, point);
      }
    }
  }

  private drawSettlementTrees(
    canvas: CanvasRenderingContext2D,
    settlement: VillageSettlementModel,
    center: LabPoint,
    radius: number,
  ): void {
    const count = Math.min(14, 4 + Math.ceil(Math.sqrt(settlement.buildings.length) * 1.8));
    canvas.save();
    for (let index = 0; index < count; index += 1) {
      const seed = stableHash(`${settlement.id}:tree:${index}`);
      const angle = (seed % 6_283) / 1_000;
      const distance = radius * (0.56 + ((seed >>> 9) % 36) / 100);
      const x = center.x + Math.cos(angle) * distance;
      const y = center.y + Math.sin(angle) * distance * 0.38;
      const size = 3.5 + (seed % 30) / 10;
      canvas.fillStyle = index % 3 === 0 ? 'rgba(30, 69, 57, 0.72)' : 'rgba(19, 51, 45, 0.78)';
      canvas.beginPath();
      canvas.moveTo(x, y - size * 1.9);
      canvas.lineTo(x + size, y + size * 0.35);
      canvas.lineTo(x - size, y + size * 0.35);
      canvas.closePath();
      canvas.fill();
      canvas.fillStyle = 'rgba(13, 35, 32, 0.86)';
      canvas.fillRect(x - 0.6, y - 1, 1.2, size * 0.75);
    }
    canvas.restore();
  }

  private drawBuilding(canvas: CanvasRenderingContext2D, building: VillageBuildingModel, point: LabPoint): void {
    const footprint = clamp(4.5 + building.degree * 0.38, 4.5, 8.6);
    const roleHeight = building.role === 'repeater' ? 18
      : building.role === 'room_server' ? 15
        : building.role === 'sensor' ? 11
          : building.role === 'companion' ? 13 : 10;
    const height = roleHeight + Math.min(8, building.degree * 0.78);
    const hue = building.seed % 4;
    const walls = ['#35565c', '#415a50', '#514d52', '#3d5960'][hue]!;
    const side = ['#1c3338', '#273b34', '#302f36', '#263b41'][hue]!;
    const roof = building.role === 'sensor' ? '#487074' : ['#29454d', '#38463f', '#463d46', '#30474c'][hue]!;
    canvas.save();
    canvas.translate(point.x, point.y);
    canvas.fillStyle = 'rgba(0, 4, 7, 0.36)';
    canvas.beginPath();
    canvas.ellipse(1.5, 3.2, footprint * 1.35, footprint * 0.58, 0, 0, Math.PI * 2);
    canvas.fill();
    canvas.fillStyle = walls;
    canvas.beginPath();
    canvas.moveTo(0, -height);
    canvas.lineTo(footprint, -height + footprint * 0.48);
    canvas.lineTo(footprint, footprint * 0.62);
    canvas.lineTo(0, 0);
    canvas.closePath();
    canvas.fill();
    canvas.fillStyle = side;
    canvas.beginPath();
    canvas.moveTo(0, -height);
    canvas.lineTo(-footprint, -height + footprint * 0.48);
    canvas.lineTo(-footprint, footprint * 0.62);
    canvas.lineTo(0, 0);
    canvas.closePath();
    canvas.fill();
    canvas.fillStyle = roof;
    canvas.beginPath();
    canvas.moveTo(0, -height - footprint * 0.55);
    canvas.lineTo(footprint * 1.16, -height + footprint * 0.18);
    canvas.lineTo(0, -height + footprint * 0.72);
    canvas.lineTo(-footprint * 1.16, -height + footprint * 0.18);
    canvas.closePath();
    canvas.fill();

    if (building.traffic > 0) {
      const glow = building.observer ? '#8bdcff' : '#f0ca6d';
      canvas.fillStyle = glow;
      canvas.shadowColor = glow;
      canvas.shadowBlur = 10;
      canvas.fillRect(footprint * 0.18, -height * 0.54, Math.max(1.4, footprint * 0.3), Math.max(1.8, height * 0.18));
    }
    if (building.role === 'repeater') {
      canvas.shadowBlur = 0;
      canvas.strokeStyle = building.observer ? '#8bdcff' : '#72d6c5';
      canvas.lineWidth = 0.8;
      canvas.beginPath();
      canvas.moveTo(0, -height - footprint * 0.55);
      canvas.lineTo(0, -height - footprint * 0.55 - 7 - building.degree * 0.35);
      canvas.stroke();
      canvas.beginPath();
      canvas.arc(0, -height - footprint * 0.55 - 5, 2.5, Math.PI * 1.15, Math.PI * 1.85);
      canvas.stroke();
    } else if (building.role === 'sensor') {
      canvas.strokeStyle = 'rgba(143, 220, 211, 0.45)';
      canvas.lineWidth = 0.65;
      canvas.strokeRect(-footprint * 0.55, -height * 0.68, footprint * 1.1, height * 0.36);
    }
    canvas.restore();
  }

  private drawSettlementLabels(
    canvas: CanvasRenderingContext2D,
    settlements: readonly VillageSettlementModel[],
    width: number,
    height: number,
  ): void {
    canvas.save();
    canvas.font = '600 10px Inter, system-ui, sans-serif';
    canvas.textAlign = 'center';
    canvas.textBaseline = 'bottom';
    const labelled = settlements
      .filter((settlement) => settlement.buildings.length >= 4 || settlement.routeCount > 0)
      .slice(0, width < 700 ? 4 : 8);
    for (const settlement of labelled) {
      const center = this.settlementCenters.get(settlement.id);
      if (!center || center.y < 72 || center.y > height - 48) continue;
      const label = `${settlement.tier} · ${settlement.buildings.length} observed nodes`;
      const textWidth = canvas.measureText(label).width;
      canvas.fillStyle = 'rgba(3, 12, 16, 0.66)';
      canvas.fillRect(center.x - textWidth / 2 - 5, center.y - 48, textWidth + 10, 15);
      canvas.fillStyle = 'rgba(203, 228, 224, 0.86)';
      canvas.fillText(label, center.x, center.y - 35);
    }
    canvas.restore();
  }

  private drawLanterns(canvas: CanvasRenderingContext2D, now: number, reducedMotion: boolean): void {
    this.lanterns = this.lanterns.filter((lantern) => now <= lantern.start + lantern.duration);
    for (const lantern of this.lanterns) {
      if (now < lantern.start) continue;
      const progress = clamp((now - lantern.start) / lantern.duration, 0, 1);
      const pulse = reducedMotion ? 0.72 : 0.7 + Math.sin(progress * Math.PI * 9 + lantern.seed) * 0.25;
      const radius = 8 + pulse * 6;
      const glow = canvas.createRadialGradient(lantern.x, lantern.y, 0, lantern.x, lantern.y, radius);
      glow.addColorStop(0, rgba(lantern.color, (1 - progress) * 0.52));
      glow.addColorStop(1, rgba(lantern.color, 0));
      canvas.fillStyle = glow;
      canvas.beginPath();
      canvas.arc(lantern.x, lantern.y, radius, 0, Math.PI * 2);
      canvas.fill();
    }
  }

  private drawCouriers(canvas: CanvasRenderingContext2D, now: number, reducedMotion: boolean): void {
    this.couriers = this.couriers.filter((courier) => now <= courier.start + Math.max(1, courier.points.length - 1) * courier.hopDuration + 600);
    for (const courier of this.couriers) {
      if (courier.points.length === 0 || now < courier.start) continue;
      if (courier.observer || courier.points.length === 1) {
        const point = courier.points[0]!;
        const progress = clamp((now - courier.start) / courier.hopDuration, 0, 1);
        canvas.strokeStyle = rgba(courier.color, (1 - progress) * 0.7);
        canvas.lineWidth = 1.2;
        canvas.beginPath();
        canvas.arc(point.x, point.y, reducedMotion ? 8 : 5 + easeOut(progress) * 17, 0, Math.PI * 2);
        canvas.stroke();
        continue;
      }
      const elapsed = now - courier.start;
      const hopIndex = Math.min(courier.points.length - 2, Math.floor(elapsed / courier.hopDuration));
      const raw = clamp((elapsed - hopIndex * courier.hopDuration) / courier.hopDuration, 0, 1);
      const progress = reducedMotion ? 1 : easeOut(raw);
      const from = courier.points[hopIndex]!;
      const to = courier.points[hopIndex + 1]!;
      const x = from.x + (to.x - from.x) * progress;
      const y = from.y + (to.y - from.y) * progress;
      canvas.save();
      canvas.lineCap = 'round';
      canvas.strokeStyle = rgba(courier.color, 0.42);
      canvas.lineWidth = 2.2;
      canvas.shadowColor = courier.color;
      canvas.shadowBlur = 13;
      canvas.beginPath();
      canvas.moveTo(from.x, from.y);
      canvas.lineTo(x, y);
      canvas.stroke();
      canvas.translate(x, y);
      canvas.rotate(Math.atan2(to.y - from.y, to.x - from.x) + Math.PI / 4);
      canvas.fillStyle = '#efffe9';
      canvas.shadowBlur = 18;
      canvas.fillRect(-3, -3, 6, 6);
      canvas.restore();
    }
  }

  private drawVignette(canvas: CanvasRenderingContext2D, width: number, height: number): void {
    const vignette = canvas.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.15, width / 2, height / 2, Math.max(width, height) * 0.75);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 4, 9, 0.56)');
    canvas.fillStyle = vignette;
    canvas.fillRect(0, 0, width, height);
  }

  private pointFor(endpoint: EndpointV2): LabPoint {
    return this.layout.get(endpoint.id) ?? this.context!.project(endpoint);
  }
}

export function createExperiment(): LabExperiment {
  return new LittleMeshVillages();
}
