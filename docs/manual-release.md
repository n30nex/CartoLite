# Manual Pi release exception

The default release path is GitHub Actions. Use this procedure only after the repository owner explicitly approves a manual release because Actions is unavailable. It is fail-closed and produces no GitHub OIDC attestation.

1. Start from a clean isolated branch at refreshed `origin/main`. Run the Canadaverse guard read-only and preserve unrelated work.
2. Verify the saved `neopi5` ED25519 host fingerprint out of band. Never weaken SSH host-key checking.
3. Transfer the exact candidate source to an isolated Pi directory. Run frontend unit tests, typecheck/build, bundle and MeshMapper contracts, Go module verification, unit tests, vet, race tests on a supported amd64 execution environment, and operations transition tests.
4. Require Buildx to advertise or successfully build `linux/amd64`, then execute the candidate amd64 container on the Pi. Stop if architecture build or execution cannot be proved.
5. Confirm no unrelated repository run is active. Temporarily disable `ci.yml` and `release.yml`, record their prior states, then push the branch, open and review the pull request, and merge using the explicit manual-check exception.
6. Fetch the exact merged `main` SHA on the Pi and rerun the source gates. Build `ghcr.io/n30nex/cartolite:sha-<full-sha>` for `linux/amd64` using `TARGETOS` and `TARGETARCH`. Supply the browser-visible CARTO key through a temporary root-only BuildKit secret.
7. Keep registry credentials and the CARTO key in root-only temporary files, authenticate through standard input, verify TileJSON/vector PBF/glyph authorization without printing the key, and remove the files after publishing.
8. Pull the exact digest on an x86_64 host. Run synthetic MQTT integration, public privacy, bounded load, browser, image identity, architecture, image size, and HIGH/CRITICAL vulnerability gates against that digest.
9. Promote the accepted digest without rebuilding to the release, minor, and `latest` tags. Create the annotated Git tag and GitHub release with manifest and checksums, explicitly stating that the manual release has no GitHub OIDC attestation.
10. Re-enable both workflows immediately and verify their prior enabled state is restored.
11. Record the current production image and container identity, and back up Compose, protected configuration, and the checkpoint. Pin the new manifest digest and recreate only the CartoLite service.
12. Verify health, readiness, MQTT, checkpoint, queue, drops, privacy, SSE, vector resources, desktop and mobile inspector, Node Finder, packet animation, and audible live hops. Observe production for five minutes with zero restarts, drops, queue growth, console errors, or sustained resource regression.

If any gate fails, stop. After cutover, restore the recorded image and configuration, restore the checkpoint only if required, and repeat health, readiness, privacy, SSE, vector map, and browser checks.
