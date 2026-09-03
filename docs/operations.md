# Operations

The files under `deploy/` install monitoring and backup mechanics without storing credentials. Do not enable any unit until the exact host identity and root-only secret files are proven.

## Pi watchdog

The target Pi host key must be verified out of band before the first SSH write. Record the expected key from the Pi console or another trusted channel, compare it with the client-observed key, and stop on any mismatch. Never use an SSH option that bypasses host-key validation.

Install `deploy/watchdog/cartolite_watchdog.py`, its service, and its timer with `deploy/install-operations.sh`. Create `/etc/cartolite-watch.env` from the example with mode `0600`, owned by root. Seed the expected live `bootId` without sending a message, then prove one test webhook before enabling the timer:

```sh
install -m 0600 /dev/null /etc/cartolite-watch.env
/usr/bin/python3 /usr/local/lib/cartolite/cartolite_watchdog.py --seed
systemctl enable --now cartolite-watchdog.timer
```

The timer checks public health and readiness every 60 seconds with five-second timeouts. It alerts once after three consecutive health failures, once after three consecutive readiness failures, once after two fully successful recovery checks, and once for each unexpected `bootId` change. Discord content is limited to timestamp, transition status, version/SHA, and the public readiness booleans/counters. Persistent state is atomic and mode `0600` under `/var/lib/cartolite-watch/`.

For acceptance, stop only the watchdog's network path or use a temporary failing `CARTOLITE_URL`; do not stop unrelated Pi services. Prove exactly one outage/readiness notification, no duplicate during continued failure, exactly one recovery after two successes, then restore the production URL.

## DigitalOcean Spaces and restic

Create a private Space in Toronto and a dedicated key restricted to that bucket. Enable no public listing. Install the distribution `restic` package on the CartoLite droplet. Store the repository URL, access key ID, secret access key, and Discord webhook in root-owned `/etc/cartolite-backup.env` mode `0600`. Store a generated restic password by itself in `/etc/cartolite-restic-password` mode `0600`. Never put either value in Git, shell history, process arguments, Compose, or the deployment manifest.

The repository URL form is:

```text
s3:https://tor1.digitaloceanspaces.com/<private-bucket>/cartolite
```

After installing the operations files, initialize and prove the complete path before enabling timers:

```sh
systemctl start cartolite-backup@init.service
systemctl start cartolite-backup@daily.service
systemctl start cartolite-backup@weekly.service
systemctl start cartolite-backup@monthly.service
systemctl enable --now cartolite-backup-daily.timer cartolite-backup-weekly.timer cartolite-backup-monthly.timer
```

Daily backup stages only `state-v1.json` and a nonsecret deployment manifest containing version, SHA, image identity, checkpoint byte count, and checkpoint SHA-256. It never reads `.env` into the backup and does not include MQTT credentials, API keys, raw logs, databases, or captures. Retention is 30 daily, eight weekly, and twelve monthly snapshots. Weekly checks validate repository metadata. Monthly checks read all stored data, restore the latest daily snapshot to a temporary root-only directory, and compare the restored checkpoint against the restored manifest checksum. Any failed operation sends one sanitized Discord failure message and exits nonzero.

## Cloudflare region cache

`deploy/cloudflare/apply_region_cache_rule.py` creates or updates one stable-ref rule without replacing other zone rules. Provide a scoped token and zone ID through `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID`, run the helper, then remove them from the process environment. The expression matches only the content-hashed `carto.canadaverse.org/assets/meshcore-canada-region*.geojson` and `.json` assets, sets a one-year edge TTL, and respects the origin browser TTL. `/api/state`, `/api/events`, `/healthz`, and `/readyz` cannot match and must continue returning `DYNAMIC` or `BYPASS` rather than `HIT`.

After deployment, request the exact content-hashed partition and registry URLs twice. Require `application/geo+json` for the partition, JSON for the registry, immutable origin caching, and repeat Cloudflare `HIT` responses. Also request every protected live endpoint twice and prove none becomes a cache hit.

## v0.8.0 mobile sound and terrain

Use the owner-approved [manual Pi release exception](manual-release.md) and record the exact v0.7.1 production digest, container identity, configuration, boot ID, checkpoint checksum, and resource baseline before cutover. The candidate and released `linux/amd64` image must resolve to the exact merged SHA.

In addition to the standard identity, hardening, health, readiness, MQTT, checkpoint, queue, drops, privacy, SSE, CARTO vector, region, cache, and bounded-load gates, require:

- Android-style suspended Web Audio starts after the Sound tap, runs one silent unlock buffer, and retains one oscillator per visible hop in every scene.
- Clusters can be disabled at national, regional, and local zooms without changing the node count; exposing all 4,000 test nodes produces no task of 100 ms or longer.
- Live Follow holds its camera for five seconds and then chooses the newest queued eligible activity. Manual movement and Home still cancel it.
- Route colours remain distinct, the live comet stays on exact route geometry, and recent live residue remains colored and sparkling for 45 seconds whether Routes is shown or hidden.
- Heat is visibly stronger and its six layers use the dominant Advert, Trace, Text, ACK, Control, or Other colour at each hotspot.
- Topography and 3D remain off by default, load attributed Mapterhorn Terrarium DEM data only after selection, retain the CARTO vector basemap, and return cleanly to zero pitch.
- Desktop, phone portrait, phone landscape, and reduced-motion browser checks complete without overflow, style errors, failed resources, or console errors.

After cutover, observe production for five minutes. Require zero restarts, drops, queue growth, console errors, or sustained CPU or memory regression. If any gate fails, restore the recorded v0.7.1 image and configuration, restore the checkpoint only if needed, recreate only CartoLite, and repeat health, readiness, privacy, SSE, vector map, and browser checks.

## v0.8.1 mobile lifecycle and route rendering

On a real or emulated Android Chrome lifecycle, require `data-screen-awake="true"` while the page is visible. Hide and restore the document, then prove the old wake-lock sentinel was released, a new screen lock was acquired, `/api/state` was fetched again with no-store semantics, and one replacement `/api/events` stream starts from the refreshed cursor. Repeat with a back-forward cache restore and an offline-to-online transition; simultaneous recovery signals must coalesce rather than leave concurrent streams.

At national, regional, and detail zooms, Routes must report `data-route-representation="individual-routes"`, `data-route-renderer="maplibre-webgl"`, `data-trunk-representations-loaded=""`, and the complete eligible route count for the selected window. `data-rendered-route-segments` must equal that complete count. Camera motion and route-window changes must not rewrite route geometry. Active packet travel, lingering sparkles, and node wakes must follow browser animation frames even in mobile low-detail mode without dropped live hops; the heavier residue glow remains cached.

## v0.5.0 cutover

The rollback boundary for this release is v0.4.3 at `ghcr.io/n30nex/cartolite@sha256:b5ee6321ae71599497ef3873bc0e8ba4c52b7b5459e26fca3bb2a13d8b023656`.

Before changing `/opt/CartoLite`, record the running container ID/image, copy Compose and protected configuration to a root-only local backup, copy the atomic checkpoint, run a daily restic backup, and prove a temporary restore/checksum. Resolve the v0.5.0 release manifest, checksums, attestation, exact Git SHA, and exact image digest. Update only `CARTOLITE_IMAGE`, pull that digest, and recreate only `cartolite-cartolite-1` with `docker compose up -d --no-deps cartolite`. Preserve the named data volume, non-root/read-only/cap-drop protections, both ports, origin restriction, and bounded logs.

Acceptance requires exact version/SHA/image identity; ready MQTT/checkpoint/queue with zero drops; public schema v2 privacy; live SSE, animation, and scheduled sound; vector TileJSON/PBF/glyph success with no raster request; desktop and both phone orientations; regional MIME/cache proof; watchdog outage/recovery proof; restic backup/check/restore checksum; and a 20-minute soak with zero restarts/drops and no sustained CPU or memory regression.

## v0.7.0 musical traffic and node inspection

Use the explicitly approved [manual Pi release exception](manual-release.md). Record the exact v0.6.9 image, container, configuration, boot ID, checkpoint checksum, and resource baseline before changing production. The candidate must be the exact merged `main` SHA, built for and reported as `linux/amd64`, tested first through Pi execution and then natively on the x86_64 droplet. The release manifest must say that the manual image has no GitHub OIDC attestation.

In addition to the standard identity, hardening, health, readiness, MQTT, checkpoint, queue, drops, privacy, SSE, vector-only, region, cache, and bounded-load gates, verify all of the following:

- Aurora, Wood, and Chimes retain one oscillator and one scheduled articulation per visible hop, with off-screen and observer-only traffic silent.
- The packet core, short tapered glow, sparks, relay handoff, destination shimmer, reduced-motion cue, and 15-second residue stay aligned to the exact straight route without a full-map flash or white saturation.
- Desktop popup and phone bottom-sheet inspectors survive camera movement, update on adjacent route and window changes, sort every active neighbour newest first, select neighbours, and close by their control, Escape, or an empty-map click.
- Finder searches 4,000 downloaded labels without a network query, returns at most eight deterministic results, distinguishes duplicate labels, and opens the selected inspector.
- Search, inspector open, route-window change, neighbour selection, and the Routes switch each finish their application work in under 100 ms in the 4,000-node/7,000-route gate. The separate software-rendered Chromium frame ceiling is 750 ms because it includes the full vector basemap, heatmap, regions, and node scene without a hardware compositor; production acceptance still requires smooth interaction on a hardware-accelerated desktop and Android browser.

After cutover, observe production for five minutes. Require zero restarts, drops, queue growth, browser console errors, or sustained CPU or memory regression. If any gate fails, restore the recorded v0.6.9 image and configuration, restore the checkpoint only if needed, recreate only CartoLite, and repeat health, readiness, privacy, SSE, vector map, and browser checks.

## v0.6.9 camera and interaction stability

Require Regions to report `data-region-renderer="maplibre"`, load all 193 polygon features from the validated MeshCore.ca partition, and retain the exact registry revision across pan, zoom, hide, and show. Require national, regional, and exact route representations to switch at 4.8 and 6.5 without overlap; same-cell trunk totals remain counted but are not drawn as loop glyphs. At detail zoom, selecting a node must set `data-focused-route-count` to the active-window neighbor count and visibly light the matching exact lines. Live Follow must accept valid off-screen traffic, while manual pan or zoom cancels it. Reload once after changing Routes, Heatmap, Regions, the route window, and legend state, then prove those browser-local settings return without an early style-load error.

Run the 4,000-node/7,000-route browser gate against the production image rather than Vite development mode. Route-window changes must leave both route-source revision and geometry unchanged; only the active zoom representation may be enabled. Preserve the standard exact-image, health, readiness, MQTT, checkpoint, queue, drops, privacy, SSE, vector-only, audio, mobile, region MIME/cache, and container-hardening checks. GitHub Actions minutes are unavailable for this cutover, so build the exact merged SHA locally with the browser key supplied only as a BuildKit secret, verify the candidate locally, and deploy the matching image archive. Per operator direction, skip the soak.

## v0.6.4 complete route rendering

v0.6.4 removes the route-count ceiling. On a 24-hour selection, require `data-eligible-routes` to equal the complete valid route count. At national and regional zooms, require both preloaded trunk representations' route totals to match that count; detailed zooms use the preloaded individual MapLibre lines. Changing the route window and moving the camera must leave `data-route-source-revision` unchanged, keep every trunk anchored to the same geographic cells, and produce no task of 100 ms or longer. Pan and zoom with Routes enabled and verify the native route layers remain attached to the basemap, the packet layer does not clear on unchanged resize events, and no full-canvas traffic filter returns. Preserve the existing privacy, health, readiness, vector-only, audio, mobile, region, hardening, and rollback gates. Per operator direction, this release does not include a soak period.

## v0.6.3 route-window correction

v0.6.3 keeps the 700-route performance ceiling while sampling across the complete chosen age window after the ceiling is reached. Verify that 15m, 1h, 6h, and 24h produce distinct candidate sets under saturated traffic, fixed selections do not rename the Auto option, and selected-node routes and neighbor counts obey the same window.

## v0.6.2 full-map pulse removal

v0.6.2 removes the traffic-reactive aurora pseudo-layer and its repeated full-map colour wash. Verify that live packets still produce localized ribbons, signatures, wakes, layer emphasis, meter activity, and sound while `#map-grade::before` has no background or animation.

## v0.6.1 attribution hotfix

v0.6.1 preserves the v0.6.0 visual runtime and adds the authorized MeshMapper credit directly to MapLibre's attribution control. Deploy it through the same digest-pinned release process and verify the attribution control contains `MeshMapper` after enabling Regions.

## v0.6.0 visual cutover

The rollback boundary for this release is v0.5.0 at `ghcr.io/n30nex/cartolite@sha256:46ef8248811593f8bc1717fb2e426828e990693462b63961ebae2af8d54b7fbb`.

Promote only the Actions-tested `sha-<full-sha>` image digest; do not rebuild during release. Record the live v0.5.0 image, container ID, boot ID, protected Compose/configuration backup, and checkpoint checksum before recreating only `cartolite-cartolite-1`. Preserve the named data volume, non-root/read-only/cap-drop protections, ports, origin restriction, and bounded logs.

In addition to the standard health, readiness, privacy, SSE, vector-basemap, exact-region, and soak checks, verify curved direction on a multi-hop route, one visible relay cue per scheduled note, all five protocol signatures, traffic-meter response without a full-map colour wash, node wakes, route-wide framing only under Live Follow, manual-drag cancellation, reduced motion, phone portrait/landscape overflow, burst colour separation, adaptive quality state, and the 4,000-node/7,000-route long-task gate. External watchdog, backup, and edge-cache services are unchanged by this visual release.

If any gate fails, restore the recorded v0.5.0 digest, restore the checkpoint only if the existing checkpoint is unusable, recreate only CartoLite, and re-run health, readiness, privacy, SSE, vector basemap, sound, and browser checks before declaring recovery.
