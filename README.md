# CartoLite

CartoLite is a compact, privacy-safe live map of high-confidence MeshCore Canada RF traffic. Its calm CARTO vector geography keeps the live topology readable: visitors can switch between clusters and individual nodes at every zoom, while the stronger heatmap separates activity by packet type. Optional attributed hillshade and 3D terrain add geographic context only when requested. Route windows narrow automatically from 24 hours at local detail to 15 minutes at national scale and also constrain focused-node connections. Every eligible route in the chosen window remains an individual geographic line at every zoom. Selecting a node opens a persistent inspector, lights its recent connected routes, and lists its active neighbours newest first. The local Node Finder searches only already-downloaded public labels. Every visible packet hop travels as a sharp protocol-coloured core with a short tapered glow, restrained sparks, relay handoff, destination shimmer, node wake, and 45-second sparkling residue independent of the historical Routes layer. Live Follow rests on each activity for five seconds. An optional 34-region MeshMapper boundary-and-label overlay stays lazy until requested and remains locked to the basemap during camera movement. The opt-in Sound control gives every live hop crossing the current view one note in Aurora, Wood, or Chimes, including an Android-safe gesture unlock; off-screen hops and observer-only traffic stay silent. [Netgraph](https://carto.canadaverse.org/netgraph/) presents the same live feed as a stable, full-screen topology with every connected node and active-window link, synchronized packet travel and sound, local search, and neighbour inspection. [CartoLite Labs](https://carto.canadaverse.org/labs/) interprets that same sanitized live feed as Packet Pond, Firefly Meadow, Mesh Loom, and Little Mesh Villages without adding another service or data source. On supported phones CartoLite keeps the screen awake while visible and refreshes its state and live stream whenever the page resumes. The signed [CartoLite Android app](https://canadaverse.org/cartolite/) adds an immersive shell, native keep-awake, and stronger lifecycle recovery without changing those privacy boundaries. View, layer, route-window, legend, and audio preferences remain local to that browser or app. CartoLite deliberately omits history, chat, PacketTV, phonebooks, operator tools, visitor analytics, and databases.

## Runtime shape

- One static Go binary subscribes to MeshCore MQTT, validates routes, maintains bounded in-memory state, serves normalized public schema v2 and SSE, and embeds the frontend.
- One vanilla TypeScript multi-page build serves the MapLibre map, native Canvas2D Netgraph, and lazy-loaded Labs shell from the same binary. Netgraph separates stable topology from transient packet motion; Labs uses bounded Canvas2D experiments plus one dependency-free reactive WebGL2 water surface. Every view shares the existing public feed and sound engine.
- One internal `/data/state-v1.json` checkpoint preserves current topology across restarts. Routes expire after 24 hours and unreferenced nodes after 30 days; it is not packet history.
- One non-root, read-only, `linux/amd64` container is published to `ghcr.io/n30nex/cartolite`.

See [Architecture](docs/architecture.md), [Netgraph](docs/netgraph.md), [Labs](docs/labs.md), [Android app](docs/android.md), [data sources](docs/data-sources.md), [public API](docs/public-api.md), [browser and app privacy](docs/privacy.md), [sound and animation](docs/sound-and-animation.md), [deployment](docs/deployment.md), and [operations](docs/operations.md).

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

This repository intentionally does not build or test on the workstation. The normal release path uses `CI / Required`; an explicitly approved no-Actions exception must follow the fail-closed Pi procedure in [manual release](docs/manual-release.md). The complete gate runs Go tests/vet/race, frontend tests/build/budgets, a Mosquitto-backed integration and bounded-load smoke, desktop/phone portrait/phone landscape Playwright, privacy and vector-only checks, operations transition tests, and a HIGH/CRITICAL Trivy scan.

Green `main` publishes `sha-<full-git-sha>`. A signed or annotated `vX.Y.Z` tag promotes that exact tested digest to `X.Y.Z`, `X.Y`, and `latest`; the release workflow does not rebuild it.

## Privacy

Public responses never contain full public keys, observer keys, raw paths, packet hashes, raw or decoded payloads, message text, credentials, or resolver debug reasons. Please report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

MIT
