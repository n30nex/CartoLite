# CartoLite

CartoLite is a compact, privacy-safe live map of high-confidence MeshCore Canada RF traffic. Its calm CARTO vector geography keeps the live topology readable: recent nodes cluster cleanly, the heatmap shows where traffic is active, and the heavier route lattice stays off until requested. Route windows narrow automatically from 24 hours at local detail to 15 minutes at national scale. Selecting a node focuses its recent connections; hovering or tapping a focused route shows its endpoints, packet kind, packet count, and last-heard time. Every visible packet hop travels as a curved protocol-coloured energy ribbon with a directional comet, relay articulation, destination bloom, and short node wake; finished paths linger for 15 seconds even when stable routes are hidden. A traffic-driven aurora and meter wake only while the network is active. An optional 34-region MeshMapper boundary-and-label overlay stays lazy until requested. The opt-in Sound control gives every live hop crossing the current view one warm musical note with local volume control; off-screen hops and observer-only traffic stay silent. Desktop, mobile, and audio preferences remain local to that browser. CartoLite deliberately omits history, chat, PacketTV, search, phonebooks, operator tools, visitor analytics, and databases.

## Runtime shape

- One static Go binary subscribes to MeshCore MQTT, validates routes, maintains bounded in-memory state, serves normalized public schema v2 and SSE, and embeds the frontend.
- One vanilla TypeScript page uses MapLibre GL JS for vector geography, clustered nodes, bounded heat, and exact selected-route interaction. Dedicated Canvas2D layers keep exact regional boundaries and labels, the pre-rendered stable route lattice, and transient packet motion responsive.
- One internal `/data/state-v1.json` checkpoint preserves current topology across restarts. Routes expire after 24 hours and unreferenced nodes after 30 days; it is not packet history.
- One non-root, read-only, `linux/amd64` container is published to `ghcr.io/n30nex/cartolite`.

See [Architecture](docs/architecture.md), [data sources](docs/data-sources.md), [public API](docs/public-api.md), [deployment](docs/deployment.md), and [operations](docs/operations.md).

## Deploy a published image

No build tools are required on the host.

```bash
cp .env.example .env
# Edit .env: pin CARTOLITE_IMAGE by digest and provide the private MQTT values.
docker compose pull
docker compose up -d
curl --fail http://127.0.0.1:39476/readyz
```

The production example exposes port 80 for a TLS edge and a loopback health endpoint on port 39476. Restrict origin traffic to the edge, redirect public HTTP to HTTPS, and use strict certificate validation between the edge and origin. Public SSE is same-origin and validates the browser `Origin` against the request host. Only the content-hashed regional GeoJSON should receive a Cloudflare cache-eligibility rule; health, readiness, state, and events stay uncached.

## Development and verification

This repository intentionally does not build or test on the workstation. Make source changes on a branch, push them, and use the `CI / Required` GitHub check. CI runs Go tests/vet/race, frontend tests/build/budgets, a Mosquitto-backed integration and bounded-load smoke, desktop/phone portrait/phone landscape Playwright, privacy and vector-only checks, operations transition tests, and a HIGH/CRITICAL Trivy gate.

Green `main` publishes `sha-<full-git-sha>`. A signed or annotated `vX.Y.Z` tag promotes that exact tested digest to `X.Y.Z`, `X.Y`, and `latest`; the release workflow does not rebuild it.

## Privacy

Public responses never contain full public keys, observer keys, raw paths, packet hashes, raw or decoded payloads, message text, credentials, or resolver debug reasons. Please report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

MIT
