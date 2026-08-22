# CartoLite agent instructions

These instructions apply to the whole repository.

## Purpose

CartoLite is intentionally one small, public, Canada-focused MeshCore traffic map: a Go MQTT/HTTP process, a vanilla TypeScript/MapLibre page, a Canvas2D animation layer, and one atomic state checkpoint. Do not reintroduce the panels, history, chat, SQLite, analytics, or operator tooling from MC-CartoLive.

## Build policy

Do not build, test, run containers, install dependencies, or generate browser artifacts on the workstation. Push a scoped branch and use GitHub Actions as the only build/test environment. Local read-only inspection and source editing are allowed.

## Boundaries

- Keep public routes fail-closed: never infer ambiguous, non-forwarder, missing-coordinate, missing-RF, or distance-gated hops.
- Never expose public keys, observer keys, raw path hex, packet hashes, payloads, decoded message text, credentials, or resolver reasons.
- The only public traffic category is a sanitized kind such as Advert, Trace, Text, ACK, or Control.
- Keep `web/src/types.ts` synchronized with the public Go state/event schema.
- Keep stable map state in MapLibre and transient motion on Canvas2D.
- Treat `backend/internal/httpapi/static` as generated Docker build input except for its placeholder.
- Use synthetic fixtures only. Never commit live broker data, databases, captures, or `.env` files.

## Delivery

- Runtime changes must preserve the scratch, non-root, read-only container.
- `compose.yml` consumes a published image and must not gain a `build:` section.
- GitHub Actions must remain the only CI/build/release path. Releases promote the already-tested `sha-<full-sha>` digest without rebuilding.

## Shared Canadaverse hygiene

- Inspect `git status --short --branch` and recent commits before editing; preserve unrelated and concurrent work.
- Use a scoped `codex/<task>` branch or isolated worktree. Never force-push or reset shared work.
- Keep builds, caches, worktrees, and temporary files on `F:`; do not commit generated caches, logs, device backups, or downloaded artifacts.
- Never commit credentials, `.env` files, Wi-Fi/MQTT passwords, API keys, Cloudflare tokens, MeshCore private keys, live databases, packet captures, or user messages.
- Resolve the exact device, build environment, artifact, offset, host, service, and rollback boundary before hardware or deployment work.
- Preserve firmware identity/settings and unrelated Pi services by default.
- Run focused checks plus `git diff --check`; use the repository's existing CI/release path rather than creating a parallel one.
- Release and deployment claims require exact-commit artifacts and observable verification. Mark anything not physically or publicly tested as unverified.
