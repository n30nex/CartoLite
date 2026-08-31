# CartoLite for Android

CartoLite for Android is a small, signed native shell around the public
`https://carto.canadaverse.org/` experience. It keeps the map current while the
web service continues to own all live data, rendering, sound scenes, settings,
privacy boundaries, and updates.

The native layer provides:

- an immersive, edge-to-edge map with a branded launch and connection screen;
- native screen-awake behavior while the app is visible;
- Android lifecycle and network resume signals so state and SSE reconnect after sleep;
- exact-origin HTTPS navigation with external links handed to the browser;
- no JavaScript bridge, analytics, cookies, cleartext traffic, file access, or optional permissions;
- Android App Link support for `carto.canadaverse.org` once the matching public
  `/.well-known/assetlinks.json` is deployed.

## Toolchain

- Android Gradle Plugin 9.3.2
- Gradle 9.5.0
- JDK 17 or newer
- Android SDK and Build Tools 36

## Build and test

Use the checked-in Gradle wrapper from this directory:

```powershell
./gradlew.bat clean test lint assembleDebug
```

Release signing is supplied only through process environment variables. The
keystore and passwords must stay outside the repository.

```text
CARTOLITE_ANDROID_KEYSTORE
CARTOLITE_ANDROID_STORE_PASSWORD
CARTOLITE_ANDROID_KEY_ALIAS
CARTOLITE_ANDROID_KEY_PASSWORD
```

With all four set, `assembleRelease` creates the signed APK under
`app/build/outputs/apk/release/`. Without them, the release variant remains
unsigned. Verify every hosted APK with Android Build Tools `apksigner` and
publish its SHA-256 checksum alongside the download.

## Privacy and updates

The APK requests only Internet and network-state access. It does not contain
broker credentials, the CARTO browser key, user accounts, telemetry, or live
packet data. Most product updates arrive from the existing CartoLite web
deployment; a new APK is needed only when the native shell or signing identity
changes.
