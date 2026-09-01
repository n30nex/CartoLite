import type { PacketEventV2, StateV2 } from '../types';
import type { PacketKind } from '../trafficVisuals';

const now = Date.now();

export function demoState(): StateV2 {
  return {
    schemaVersion: 2,
    bootId: 'cartolite-labs-demo',
    seq: 0,
    serverTime: now,
    status: { feed: 'connected', activity: 'active', lastPacketAt: now, dropped: 0, version: '0.8.3-demo', gitSha: 'synthetic' },
    map: { center: [-96, 58], zoom: 3 },
    nodes: [
      { id: 'demo-yvr', label: 'Demo Pacific', role: 'repeater', observer: false, lat: 49.28, lng: -123.12, lastSeen: now },
      { id: 'demo-yyc', label: 'Demo Prairies', role: 'repeater', observer: false, lat: 51.05, lng: -114.07, lastSeen: now },
      { id: 'demo-ywg', label: 'Demo Central', role: 'companion', observer: false, lat: 49.9, lng: -97.14, lastSeen: now },
      { id: 'demo-yyz', label: 'Demo Great Lakes', role: 'repeater', observer: false, lat: 43.65, lng: -79.38, lastSeen: now },
      { id: 'demo-yul', label: 'Demo St Lawrence', role: 'room_server', observer: false, lat: 45.5, lng: -73.57, lastSeen: now },
      { id: 'demo-yhz', label: 'Demo Atlantic', role: 'sensor', observer: true, lat: 44.65, lng: -63.57, lastSeen: now },
    ],
    routes: [
      route('demo-r1', 'demo-yvr', 'demo-yyc'),
      route('demo-r2', 'demo-yyc', 'demo-ywg'),
      route('demo-r3', 'demo-ywg', 'demo-yyz'),
      route('demo-r4', 'demo-yyz', 'demo-yul'),
    ],
  };
}

export class DemoFeed {
  private timer?: number;
  private seq = 0;
  private index = 0;

  constructor(private readonly onPacket: (packet: PacketEventV2) => void) {}

  start(): void {
    if (this.timer !== undefined) return;
    this.schedule(250);
  }

  stop(): void {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(delay: number): void {
    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      const packet = this.packet(this.index);
      this.index = (this.index + 1) % 12;
      this.onPacket(packet);
      const nextDelay = this.index === 0 ? 4_000 : this.index >= 7 ? 110 : 820;
      this.schedule(nextDelay);
    }, delay);
  }

  private packet(index: number): PacketEventV2 {
    const kinds: readonly PacketKind[] = ['Advert', 'Trace', 'Text', 'ACK', 'Control', 'Other'];
    const at = Date.now();
    this.seq += 1;
    if (index === 3) {
      return { seq: this.seq, id: `demo-observer-${this.seq}`, at, payloadType: 'ACK', mode: 'observer', observer: { id: 'demo-yhz', label: 'Demo Atlantic', lat: 44.65, lng: -63.57 } };
    }
    const hopCount = index === 0 ? 1 : index % 3 + 2;
    const pairs = [
      ['demo-yvr', 'demo-yyc'],
      ['demo-yyc', 'demo-ywg'],
      ['demo-ywg', 'demo-yyz'],
      ['demo-yyz', 'demo-yul'],
    ] as const;
    return {
      seq: this.seq,
      id: `demo-route-${this.seq}`,
      at,
      payloadType: kinds[index % kinds.length]!,
      mode: 'route',
      segments: pairs.slice(0, hopCount).map(([fromId, toId], hop) => ({ routeId: `demo-r${hop + 1}`, fromId, toId })),
    };
  }
}

function route(id: string, fromId: string, toId: string): StateV2['routes'][number] {
  return { id, fromId, toId, packetCount: 1, lastHeard: now, intensity: 0, lastKind: 'Advert', traffic: 1 };
}
