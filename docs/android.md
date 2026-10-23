# CartoLite for Android

CartoLite for Android is the official signed Android presentation of the
public live map. The repository targets candidate 1.1.3; the public APK remains
1.1.2 until release checks are complete. It uses the same production frontend and public API as the
browser, so map, sound, privacy, and topology updates do not wait for a new APK.

## Motion and animation defaults

From the Canada 0.15.4 frontend, the Android app defaults to **Full motion** with
**Spectacle** effects across Map, Netgraph and Labs. This also applies to existing
profiles that have no motion setting. Saved Full, System and Reduced choices
are preserved; use **Display → Motion → Full** to change an existing choice.
Sound remains opt-in, graphics quality remains automatic, and the initial
camera stays still until the user navigates or enables Follow.

The existing native user-agent marker selects this default before the view starts.
No JavaScript bridge or new permission is added, and the published wrapper
receives the behavior through the live frontend. Ordinary browser visits still
respect system reduced-motion settings unless the user selects Full.

## Native experience

- immersive edge-to-edge portrait and landscape presentation;
- native keep-screen-on while CartoLite is foreground;
- lifecycle and network signals that drive the existing single-flight state and SSE recovery;
- a branded launch, loading, offline, HTTP-error, and certificate-error surface;
- predictive back handling and verified links for `carto.canadaverse.org`;
- exact-origin navigation, with deliberate external HTTPS links opened by Android.

The implementation uses Android platform APIs and WebView only. There is no
Compose, AndroidX runtime, analytics SDK, advertising SDK, JavaScript bridge,
background service, account, notification channel, or downloaded audio.

The exact trusted CartoLite origin also includes `/labs/`. Labs therefore stays
inside the same immersive WebView and inherits native keep-awake and lifecycle
recovery without an APK update or a broader navigation allowlist.

## Identity

- Package: `org.canadaverse.cartolite`
- Candidate app version: `1.1.3` (`versionCode` 5)
- Minimum Android: 8.0 / API 26
- Target Android: 16 / API 36
- Release certificate: `android/signing/cartolite-release-cert.pem`

The private signing key remains outside Git in the protected Canadaverse
secret store. Preserve it: Android accepts an update only when it is signed by
the same identity. The certificate is intentionally public so visitors and the
CartoLite origin can verify released APKs.

## Device acceptance

Physical-device testing is optional. Disclose when it has not been performed;
API 26/36 synthetic checks and exact APK/package/certificate verification remain
required before publication. When a device is available, confirm a live map in portrait
and landscape, 44-pixel web controls, a 48dp native retry control, touchscreen Web Audio unlock,
one oscillator per visible hop, screen-awake ownership, forced sleep recovery,
network loss/recovery, external-link handoff, and no process crash or app-level
console error.

## 1.1 recovery and navigation

The shared web dock owns navigation. Native options are a single 48dp overflow
button; there is no second Map/Netgraph bar. Loading errors remain visible until
retry succeeds, a stalled load offers retry after 30 seconds, and renderer
failure destroys the affected WebView and waits for explicit retry. Current
navigation survives recreation and already-running deep links are handled.
Predictive Back is registered only while web history can consume it.

Actions gates API 26 and 36 against debug-only synthetic pages. The signing
workflow promotes the exact CI APK without rebuilding. Release notes record the
actual emulator and physical-device test status.

## 1.1.1 UI and recovery patch

View changes show a thin loading strip; first launch and actual errors use the
branded card. A slow page can recover after the timeout when it commits a valid
frame, while HTTP and certificate failures stay visible. Ordinary failures offer
Retry and Open in browser; certificate failures never offer a bypass.

App options now remember fullscreen and a preferred start view. Last used remains
the default, and changing the preference leaves the current view alone. Share view
opens Android's chooser with the canonical Canada URL, without query parameters
or local display settings. Back history survives Activity recreation when it is
Canada-only, at most 32 entries and at most 128 KiB; otherwise the URL is restored.
Reload does not add another history entry. Full-motion and sound preferences are
unchanged. [Patch scope and acceptance](android-ui-ux-2026-10-14.md).

## 1.1.3 Chronoscope navigation

Chronoscope is available in the web view picker and native starting-view choices.
Last-view restoration, loading labels and Share view retain the correct Canada
Chronoscope path. Existing app data, permissions, package and signing identity stay
unchanged. API 26/36 checks include recreation into the Chronoscope route.
