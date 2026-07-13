# Deployment

## Requirements

- Docker Engine with Compose v2
- a private MeshCore MQTT endpoint reachable from the container
- a persistent Docker volume for `/data`
- a TLS edge or reverse proxy for public use

## Install

Copy `.env.example` to `.env`, pin `CARTOLITE_IMAGE` to a release digest, add private MQTT values, and use an exact comma-separated region allowlist. Then:

```bash
docker compose pull
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:39476/readyz
```

The production defaults publish `0.0.0.0:80` for the current direct origin and `127.0.0.1:39476` for local health checks. Restrict the public port with the host firewall to the intended traffic sources. Do not make `.env` or the data volume public. The Compose service has a read-only root filesystem, no Linux capabilities, a non-root user, a 256 MiB memory limit, and bounded JSON logs.

## Upgrade

1. Record the current `CARTOLITE_IMAGE` digest and copy the named `cartolite-data` volume using your normal encrypted backup process.
2. Set `CARTOLITE_IMAGE` to the new digest from the GitHub release manifest.
3. Run `docker compose pull && docker compose up -d`.
4. Verify `/healthz`, `/readyz`, `/api/state`, and the browser map.

## Roll back

Restore the previous image digest. If the new release changed the checkpoint schema and cannot read the old schema, also restore the checkpoint backup taken before upgrade. Never delete a checkpoint merely to force readiness without first preserving it for investigation.

## Replace MC-CartoLive at carto.canadaverse.org

Preserve both existing handoffs: public `0.0.0.0:80` and local verification at `127.0.0.1:39476`. No DNS change should be needed.

1. Record the old container/image digest and configuration for the short cutover window. Keep copied credentials outside the repository.
2. Stop the old MC-CartoLive container and its watchdog/release-audit/mount systemd units so its MQTT client and both ports are released. Do not start CartoLite with the old MQTT client ID; use a unique value such as `cartolite-production`.
3. Start CartoLite with the release-manifest digest, public port `80`, loopback port `39476`, and a new CartoLite-only data volume.
4. Require local `/healthz`, `/readyz`, `/api/state`, the public HTTPS page, and a live SSE/packet animation check to pass. Confirm the public response contains none of the forbidden fields before declaring cutover.
5. Once acceptance passes, disable and remove the old systemd units and mounts, then remove the stopped container, CartoLive images, `/opt/MC-CartoLive`, CartoLive-only `/var/lib` state, logs, snapshots, and the old multi-gigabyte SQLite/WAL state. Do not copy old state into CartoLite and do not leave a CartoLive rollback copy on this droplet.

If any check fails before cleanup, stop CartoLite, restart the old service, and re-run the public privacy and readiness checks. Destructive cleanup occurs only after CartoLite is proven live.

## Operations

`healthz` answers whether the process lives. `readyz` answers whether it is safe to serve current data. A disconnected broker, corrupt checkpoint, subscription failure, queue drops, or missing frontend assets must fail readiness. A connected but quiet RF feed remains ready and reports `activity: quiet`.
