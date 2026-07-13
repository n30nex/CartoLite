export type NodeRole = 'repeater' | 'companion' | 'room_server' | 'sensor' | 'unknown';

export interface EndpointV1 {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export interface NodeV1 extends EndpointV1 {
  role: NodeRole;
  observer: boolean;
  lastSeen: number;
}

export interface RouteV1 {
  id: string;
  from: EndpointV1;
  to: EndpointV1;
  packetCount: number;
  lastHeard: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface StatusV1 {
  feed: 'connected' | 'disconnected';
  activity: 'active' | 'quiet';
  lastPacketAt?: number;
  dropped: number;
  version: string;
  gitSha: string;
}

export interface StateV1 {
  schemaVersion: 1;
  bootId: string;
  seq: number;
  serverTime: number;
  status: StatusV1;
  map: { center: [number, number]; zoom: number };
  nodes: NodeV1[];
  routes: RouteV1[];
}

export interface RouteSegmentV1 {
  routeId: string;
  from: EndpointV1;
  to: EndpointV1;
}

interface PacketBaseV1 {
  seq: number;
  id: string;
  at: number;
  payloadType: string;
}

export interface RoutePacketV1 extends PacketBaseV1 {
  mode: 'route';
  segments: RouteSegmentV1[];
}

export interface ObserverPacketV1 extends PacketBaseV1 {
  mode: 'observer';
  observer: EndpointV1;
}

export type PacketV1 = RoutePacketV1 | ObserverPacketV1;
export type HelloV1 = { seq: number; bootId: string };
export type NodeEventV1 = { seq: number; node: NodeV1 };
export type StatusEventV1 = { seq: number; status: StatusV1 };
export type ResetV1 = { seq: number; bootId: string };
