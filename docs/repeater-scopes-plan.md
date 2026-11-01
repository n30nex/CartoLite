# Repeater scopes implementation plan

## Evidence contract

Count accepted live MQTT FLOOD and TRANSPORT_FLOOD hearing reports only. Exclude
retained/delayed traffic, DIRECT/preloaded paths and TRACE signal bytes. Resolve
full private identities without choosing among prefix collisions, accept only
known repeaters and count each identity once per path. Ordinary unscoped flood is
`*`; unresolved scoped traffic is `?`. These are observer reports, not unique RF
transmissions. Membership never attributes a scope to an edge.

Preserve case-sensitive names, reported lists, explicit empty lists, default
scope and receiver-heard evidence separately. Configuration never contributes a
repeat vote. Scope colors require a unique largest observed repeat count; ties,
missing evidence, dominant unresolved counts and palette overflow stay neutral.
Windows use the current partial UTC hour plus the preceding 0, 5 or 23 buckets.
No backfill or complete-history claim is made for unsupported old checkpoints.

## Small implementation

1. Add bounded, expiring native aggregates and report metadata inside the current
   engine and atomic checkpoint. A policy marker rejects foreign/provider scope
   state on MQTT-only restoration while preserving existing nodes/routes.
2. Serve a cached batch scope summary separately from traffic API v2. Refresh
   evidence at bounded cadence, never per packet/frame or through N+1 requests.
3. Add Repeater scopes, 1h/6h/24h, highlight/isolate, a visible-area legend and
   compact inspector evidence. Persist settings and copy/restore deep links.
   Filter before clustering; sum repeat reports, not membership counts. Use
   ordinary scopeNames/scopeRepeatValues arrays in worker-bound GeoJSON and at
   most 64 colored names. Preserve camera, selection, Follow, packet/audio timing,
   style recovery, reduced motion, mobile bounds and world-copy geometry.
4. Qualify synthetic parser, collision, serializer, window, recovery, privacy and
   dense-scene scenarios in the existing GitHub Actions pipeline. Keep all current
   rendering budgets. Promote only an exact tested main-image digest.

Beacon is a behavioral reference. Its AGPL modules and database/UI stack are not
copied into this MIT project; the implementation uses existing CartoLite helpers
and standard libraries. The optional cross-observer sample metric is not needed
for the map's hearing-report counts and is not represented as RF transmissions.

## Canada policy and delivery

Target 0.22.0. Native measurements use this instance's MQTT only. MeshMapper may
supply a separate name catalogue and reported/default-list evidence, never native
repeat counts, new node positions or routes. Join by full private identity only.
Use allowlisted HTTPS endpoints, no redirects, bounded responses and requests,
ETags, credential-separated caches, durable cooldowns and Retry-After. Preserve
at least the existing 55-minute scope-source cooldown; keep a conservative local
budget because the authorized credential is shared with another application.
Current provider contract: https://wiki.meshmapper.net/api-keys/ .

The existing MESHMAPPER_API_KEY is authorized for secure runtime-only transfer
from the owning private store. Do not print, commit or expose it to browsers or
images. Provider absence must not prevent startup; MQTT and cached evidence
remain available. Validate the current credential honestly with a permitted
request; an earlier key's success is not proof for this key.

After CI/review, reverify the live target, take a fresh encrypted backup and prove
isolated restoration, then deploy the exact tested image. Require public map and
scope behavior, privacy, fresh MQTT, checkpoint progress and at least five healthy
minutes. Preserve unrelated services and document rollback and release evidence.
