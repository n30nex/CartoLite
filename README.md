# CartoLite Canada

**See and hear the Canadian MeshCore network in motion.**

[Open the live map](https://carto.canadaverse.org/) · [Android app](https://canadaverse.org/cartolite/) · [Latest release](https://github.com/n30nex/CartoLite/releases/latest) · [Host your own mesh](https://github.com/n30nex/CartoLite-Server)

CartoLite turns the Canada MQTT feed into a compact live map, an interactive topology diagram and a collection of visual experiments. Packets animate only when observed; retained routes show confirmed links.

![CartoLite's map, terrain and compact layer controls](https://github.com/n30nex/CartoLite/releases/latest/download/map-overview-desktop.png)

*Current-release interface, captured in Actions with synthetic traffic. [More screenshots and verification](https://github.com/n30nex/CartoLite/releases/latest).*

## Choose a view

| View | What you can do |
|---|---|
| **Map** | Watch confirmed hops on a geographic map; explore terrain, buildings, heatmaps and optional 3D. |
| **Netgraph** | Follow the topology with recognizable geographic groups, optional 3D, region filters and draggable region layouts. |
| **Terminal** | Turn the map into a live BBS display with Braille, ASCII, pixel and cel-shaded modes, six presets, custom colours and fonts. |
| **Chronoscope** | Orbit a growing, session-only sculpture of observed packets and routes. |
| **Firehose** | Watch linked packet beads tumble into a 3D box; tilt it to pour them out. |
| **Pachinko** | Watch individual packets bounce into colour-coded buckets and overflow into a drain. |

The dock keeps **Map**, **Netgraph** and **Terminal** close at hand. **Experimental** groups Chronoscope, Firehose and Pachinko. **Labs** adds Packet Pond, Firefly Meadow, Mesh Loom and Little Mesh Villages. On phones, these live in one View picker.

<p>
  <img src="https://github.com/n30nex/CartoLite/releases/latest/download/firehose-active-flow-desktop.png" width="49%" alt="Luminous packets falling into the Firehose box">
  <img src="https://github.com/n30nex/CartoLite/releases/latest/download/pachinko-live-desktop.png" width="49%" alt="Packets falling through Pachinko into type-specific buckets">
</p>

## Everyday controls

- **Find, inspect and follow:** search public node names, inspect confirmed neighbours and routes, or use ten-second Live Follow with a countdown, area/node scopes and Hold/Next controls.
- **Make it yours:** Aurora, Glacier, Ember and Violet interface palettes; light/dark panels; Night, Daylight and Streets scenes; six route presets and advanced line controls. Terminal has its own colour/font studio.
- **Hear the mesh:** [31 opt-in sound voices](docs/sound-voices.md), including Dial-up Modem, with preview and volume controls. Only eligible visible live hops make sound.
- **Phone-friendly:** one compact view picker, coordinated sheets, touch controls, reduced-motion support and recovery after sleep or a lost connection.
- **A small service:** one Go process, bounded memory and one atomic topology checkpoint. No database, accounts, chat, visitor analytics or persistent packet history.

Canada adds maintained MQTT region coverage, detailed region outlines and a local legend. Map uses CARTO vector tiles; optional terrain uses Mapterhorn and buildings use OpenFreeMap, with attribution retained.

The **Canada-only Android app** wraps the hosted pages with immersive display, keep-awake and lifecycle recovery. Get the signed APK and installation details from [Canadaverse](https://canadaverse.org/cartolite/). The native package remains **1.1.5**; hosted interface updates arrive without an APK reinstall.

## Hosting

For another local or national mesh, use **[CartoLite Server](https://github.com/n30nex/CartoLite-Server)**: key-free maps, optional pages and published AMD64/ARM64 images.

This repository powers the Canadian instance. Its published image is `ghcr.io/n30nex/cartolite` for `linux/amd64`. Follow the [Canada deployment guide](docs/deployment.md) to configure the existing edge/origin setup, MQTT subscription, exact image digest and persistent data volume. No build tools are needed on the server.

CartoLite is an **MQTT client, not a broker**. A reachable MeshCore broker and its subscription details are required; installing CartoLite does not open an MQTT listener on port 1883. Operator logs are available with `docker compose logs --tail=100 cartolite` from the installation directory.

## Privacy and scope

Public data contains sanitized node labels, locations and confirmed topology. It does **not** expose keys, observer identities, raw paths, packet hashes, payloads, message text, credentials or resolver details. Route interpretation stays fail-closed; terrain and diagram heights are visual context, not radio coverage or antenna measurements. See [privacy](docs/privacy.md), [public API v2](docs/public-api.md) and [security reporting](SECURITY.md).

## Development and releases

Maintainer builds, tests, lockfile refreshes, screenshots and releases run in **GitHub Actions**. The toolchains are Node **24.22.1 LTS**, Go **1.27.3** and Playwright **1.64.1** with its matching pinned browser image. CI covers all npm dependencies, Go tests/vet/race, synthetic MQTT and privacy checks, browser/mobile rendering, long-session and performance checks, and container scanning.

The CI workflow's **Refresh dependency lockfiles** option exports a patch tied to its source commit for review. It does not run the qualification suite or publish an image. Apply the reviewed patch on the same branch, then run normal PR CI. See the [maintenance review](docs/maintenance-2026-10-26.md).

Green `main` publishes an attested `sha-<full-commit>` candidate. Versioned releases promote that tested digest without rebuilding and include installation files, a manifest, checksums and Actions screenshots.

Canada CI also checks the Android shell on API 26 and 36. A web release does not imply a newly signed APK or a new physical-device acceptance check.

## Documentation

[Deployment](docs/deployment.md) · [Operations and recovery](docs/operations.md) · [Architecture](docs/architecture.md) · [Data sources](docs/data-sources.md) · [Netgraph](docs/netgraph.md) · [Terminal](docs/terminal-view-plan-2026-10-17.md) · [Chronoscope](docs/chronoscope.md) · [Firehose](docs/firehose.md) · [Pachinko](docs/pachinko.md) · [Labs](docs/labs.md) · [Android](docs/android.md) · [Roadmap](docs/roadmap.md)

[MIT licensed](LICENSE).
