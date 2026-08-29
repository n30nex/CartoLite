# CartoLite

CartoLite is a compact, privacy-safe live map of high-confidence MeshCore Canada RF traffic. It opens on a national activity view: recent nodes cluster cleanly, the heatmap shows where traffic is active, and the heavier route lattice stays off until requested. Route windows narrow automatically from 24 hours at local detail to 15 minutes at national scale. Selecting a node focuses its recent connections; hovering or tapping a focused route shows its endpoints, packet kind, packet count, and last-heard time. Live packets remain visible as bounded, distance-aware light with 15-second trails even when stable routes are hidden. An optional 34-region MeshMapper boundary-and-label overlay stays lazy until requested and avoids polygon-fill work over the live topology. The opt-in Sound control turns every live hop crossing the current view into one soft note; off-screen hops and observer-only traffic stay silent. The visitor's viewport and audio state remain local to that browser. CartoLite deliberately omits history, chat, PacketTV, search, phonebooks, operator tools, visitor analytics, and databases.

## Runtime shape

- One static Go binary subscribes to MeshCore MQTT, validates routes, maintains bounded in-memory state, serves normalized public schema v2 and SSE, and embeds the frontend.
- One vanilla TypeScript page uses MapLibre GL JS incremental GeoJSON updates for stable geometry and Canvas2D for transient packet motion.
- One internal `/data/state-v1.json` checkpoint preserves current topology across restarts. Routes expire after 24 hours and unreferenced nodes after 30 days; it is not packet history.
- One non-root, read-only, `linux/amd64` container is published to `ghcr.io/n30nex/cartolite`.

See [Architecture](docs/architecture.md), [data sources](docs/data-sources.md), [public API](docs/public-api.md), and [deployment](docs/deployment.md).

## Deploy a published image

No build tools are required on the host.

```bash
cp .env.example .env
# Edit .env: pin CARTOLITE_IMAGE by digest and provide the private MQTT values.
docker compose pull
docker compose up -d
curl --fail http://127.0.0.1:39476/readyz
```

The production example exposes port 80 for a TLS edge and a loopback health endpoint on port 39476. Restrict origin traffic to the edge, redirect public HTTP to HTTPS, and use strict certificate validation between the edge and origin. Public SSE is same-origin and validates the browser `Origin` against the request host.

## Development and verification

This repository intentionally does not build or test on the workstation. Make source changes on a branch, push them, and use the `CI / Required` GitHub check. CI runs Go tests/vet/race, frontend tests/build/budgets, a Mosquitto-backed integration and bounded-load smoke, desktop/mobile Playwright, privacy checks, and a HIGH/CRITICAL Trivy gate.

Green `main` publishes `sha-<full-git-sha>`. A signed or annotated `vX.Y.Z` tag promotes that exact tested digest to `X.Y.Z`, `X.Y`, and `latest`; the release workflow does not rebuild it.

## Privacy

Public responses never contain full public keys, observer keys, raw paths, packet hashes, raw or decoded payloads, message text, credentials, or resolver debug reasons. Please report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

MIT
