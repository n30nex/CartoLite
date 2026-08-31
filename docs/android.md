# CartoLite for Android

CartoLite for Android 1.0.0 is the official signed Android presentation of the
public live map. It uses the same production frontend and public API as the
browser, so map, sound, privacy, and topology updates do not wait for a new APK.

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

## Identity

- Package: `org.canadaverse.cartolite`
- App version: `1.0.0` (`versionCode` 1)
- Minimum Android: 8.0 / API 26
- Target Android: 16 / API 36
- Release certificate: `android/signing/cartolite-release-cert.pem`

The private signing key remains outside Git in the protected Canadaverse
secret store. Preserve it: Android accepts an update only when it is signed by
the same identity. The certificate is intentionally public so visitors and the
CartoLite origin can verify released APKs.

## Device acceptance

Before publication, install the signed candidate on a physical device and
verify the exact APK SHA-256 and certificate. Confirm a live map in portrait
and landscape, 44-pixel web controls, a 48dp native retry control, touchscreen Web Audio unlock,
one oscillator per visible hop, screen-awake ownership, forced sleep recovery,
network loss/recovery, external-link handoff, and no process crash or app-level
console error.
