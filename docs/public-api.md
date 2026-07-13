# Public API v1

All endpoints are public and intentionally sanitized. Responses use `Cache-Control: no-store` where state could become stale.

## Endpoints

- `GET /healthz` reports process liveness and build identity.
- `GET /readyz` is successful only when static assets and checkpoint state are healthy, MQTT is connected/subscribed, and the ingest queue reports no drops. Normal RF silence remains ready.
- `GET /api/state` returns the authoritative `StateV1` snapshot.
- `GET /api/events?bootId=<boot>&after=<seq>` is a same-origin `text/event-stream` with 15-second keepalives. It replays a bounded sequence window before switching to live events; `Last-Event-ID` is honored on native reconnects. An expired cursor or changed boot receives `reset` and must rehydrate from `/api/state`.

## State schema

```ts
type StateV1 = {
  schemaVersion: 1;
  bootId: string;
  seq: number;
  serverTime: number;
  status: {
    feed: "connected" | "disconnected";
    activity: "active" | "quiet";
    lastPacketAt?: number;
    dropped: number;
    version: string;
    gitSha: string;
  };
  map: { center: [-80.35, 43.45]; zoom: 8.25 };
  nodes: NodeV1[];
  routes: RouteV1[];
};

type NodeV1 = {
  id: string;
  label: string;
  role: "repeater" | "companion" | "room_server" | "sensor" | "unknown";
  observer: boolean;
  lat: number;
  lng: number;
  lastSeen: number;
};

type EndpointV1 = { id: string; label: string; lat: number; lng: number };

type RouteV1 = {
  id: string;
  from: EndpointV1;
  to: EndpointV1;
  packetCount: number;
  lastHeard: number;
  intensity: 0 | 1 | 2 | 3 | 4;
};
```

SSE event names are `hello`, `node`, `packet`, `status`, and `reset`; state-changing events carry the increasing sequence as `id`. `hello` deliberately has no SSE ID so a disconnect cannot skip its following replay. Packet events contain either ordered sanitized route segments or one observer point and a safe traffic kind. They never include message content.

## Compatibility

Clients must reject unknown `schemaVersion` values. Additive fields may appear within v1. Removing or changing an existing field requires a new schema version and explicit client compatibility handling.
