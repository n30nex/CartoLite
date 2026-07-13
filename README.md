# CartoLite

CartoLite is a compact, privacy-safe live map of high-confidence MeshCore Canada RF traffic. The default page is the product: a dark radio-constellation map with collision-managed labels, jewel-like nodes, packet-colored topology, and event-driven, distance-aware Canvas2D packet light with 15-second fading trails. Stable routes use the latest sanitized packet kind, stay bright for the first hour, dim with age, disappear after 24 hours, and grow only within a tightly capped, decaying traffic range relative to the active network. Selecting a node focuses and illuminates its recent connections; hovering or tapping a focused route shows its endpoints, packet kind, packet count, and last-heard time. Optional GPU-rendered Heatmap and MeshMapper Canada Regions layers stay off until requested, preserving the fast default view. It deliberately omits history, chat, PacketTV, search, phonebooks, operator tools, analytics, and databases.

## Runtime shape

- One static Go binary subscribes to MeshCore MQTT, validates routes, maintains bounded in-memory state, serves the public API/SSE stream, and embeds the frontend.
- One vanilla TypeScript page uses MapLibre GL JS for stable map geometry and Canvas2D for transient packet motion.
- One `/data/state-v1.json` checkpoint preserves current nodes and routes across restarts. It is not packet history.
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

The production example preserves the current direct origin on port 80 and a loopback health endpoint on port 39476. Public SSE is same-origin and validates the browser `Origin` against the request host.

## Development and verification

This repository intentionally does not build or test on the workstation. Make source changes on a branch, push them, and use the `CI / Required` GitHub check. CI runs Go tests/vet/race, frontend tests/build/budgets, a Mosquitto-backed integration and bounded-load smoke, desktop/mobile Playwright, privacy checks, and a HIGH/CRITICAL Trivy gate.

Green `main` publishes `sha-<full-git-sha>`. A signed or annotated `vX.Y.Z` tag promotes that exact tested digest to `X.Y.Z`, `X.Y`, and `latest`; the release workflow does not rebuild it.

## Privacy

Public responses never contain full public keys, observer keys, raw paths, packet hashes, raw or decoded payloads, message text, credentials, or resolver debug reasons. Please report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

MIT
