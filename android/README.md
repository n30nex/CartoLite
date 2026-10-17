# CartoLite for Android

Canada-only native WebView shell, candidate version 1.1.2, package `org.canadaverse.cartolite`.
Android 8/API 26 minimum; Android 16/API 36 target. The web dock owns Map,
Netgraph, Terminal and Labs navigation; native options provide keep-awake, reload,
external browser and app information. The public APK remains 1.1.1 until the
candidate completes its release checks.

The 1.1.2 patch adds Terminal to start-view choices, restoration and sharing.
The 1.1.1 patch added a compact loading strip for view changes, recoverable timeouts,
bounded Back-history restoration, fullscreen and start-view choices, and sharing
of canonical Canada view links. See the [patch plan](../docs/android-ui-ux-2026-10-14.md).

The live frontend defaults the Android app to **Full motion** and **Spectacle**.
Saved Full, System or Reduced choices take precedence; change them in Display.
Ordinary browsers retain their system-motion default. This behavior uses the
existing app user-agent marker, so the published 1.0.0 APK also receives the
update without reinstalling. Sound stays opt-in and graphics quality stays
automatic.

## Build and acceptance

Build and test only in GitHub Actions. The main CI workflow runs strict lint,
unit tests, release assembly and synthetic WebView instrumentation on API 26
and 36. Fixture pages are debug-only and never contact the live site.

After successful main CI, run **Sign tested Android candidate** with that CI
run ID. It downloads the exact unsigned APK, signs without rebuilding, verifies
the existing public certificate, and retains the APK, checksum and manifest.
Signing secrets are repository secrets; never put keys or passwords in Git,
arguments, logs, artifacts or the hosting directory.

Physical-device testing is optional and its status must be disclosed in release
notes. Before publication, require the API 26/36 synthetic checks and verify the
exact signed candidate's package, certificate and hash. When testing a device,
preserve installed app data, install that exact candidate, and check
portrait/landscape, Back, deep links, sleep/resume, offline/retry and gesture-
unlocked sound. Publish the accepted artifact and checksum at the versioned
Canadaverse download path. Keep the previous signed APK for recovery.

The app accepts only the Canada HTTPS origin internally. It does not include
MQTT credentials, map keys, account or analytics SDKs, a JavaScript bridge,
background services, custom servers or downloaded audio.
