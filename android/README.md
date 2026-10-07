# CartoLite for Android

Canada-only native WebView shell, version 1.1.0, package `org.canadaverse.cartolite`.
Android 8/API 26 minimum; Android 16/API 36 target. The web dock owns Map,
Netgraph and Labs navigation; native options provide keep-awake, reload,
external browser and app information.

The live frontend defaults the Android app to **Full motion** and **Spectacle**.
Saved Full, System or Reduced choices take precedence; change them in Display.
Ordinary browsers retain their system-motion default. This behavior uses the
existing app user-agent marker, so the published 1.0.0 APK also receives the
update without reinstalling. Sound stays opt-in and graphics quality stays
automatic. It does not change the publication/physical-acceptance gate below.

## Build and acceptance

Build and test only in GitHub Actions. The main CI workflow runs strict lint,
unit tests, release assembly and synthetic WebView instrumentation on API 26
and 36. Fixture pages are debug-only and never contact the live site.

After successful main CI, run **Sign tested Android candidate** with that CI
run ID. It downloads the exact unsigned APK, signs without rebuilding, verifies
the existing public certificate, and retains the APK, checksum and manifest.
Signing secrets are repository secrets; never put keys or passwords in Git,
arguments, logs, artifacts or the hosting directory.

Physical acceptance is mandatory before publishing: preserve installed app
data, verify package/certificate/hash, install that exact candidate, and check
portrait/landscape, Back, deep links, sleep/resume, offline/retry and gesture-
unlocked sound. Publish the accepted artifact and checksum at the versioned
Canadaverse download path. Keep the previous signed APK for recovery.

The app accepts only the Canada HTTPS origin internally. It does not include
MQTT credentials, map keys, account or analytics SDKs, a JavaScript bridge,
background services, custom servers or downloaded audio.
