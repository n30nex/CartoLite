# Android 1.1.1 UI and recovery patch

Canada-only update to `org.canadaverse.cartolite`, version code 3. The original
release certificate and installed preferences must be preserved. The existing
1.0.0 public APK stays available until the new signed candidate passes acceptance.

## Implemented scope

- Keep the web dock as the only Map/Netgraph/Labs navigation. Native options remain
  one 48dp overflow control.
- Show which view is opening. First launch uses the accessible branded loader;
  subsequent view changes use a thin progress strip instead of covering the scene.
- Let a late committed page recover a timeout. HTTP and certificate failures stay
  visible, and page-finished callbacks cannot reveal an uncommitted document.
- Provide Retry and an external-browser fallback for ordinary load failures.
  Certificate failures never offer a bypass.
- Add remembered fullscreen and start-view choices (last used, Map, Netgraph, Labs).
  Changing the start view does not navigate away from the current scene. Fullscreen
  remains the default; keep-awake retains its existing preference.
- Share the canonical Canada view URL through Android's chooser, without query
  parameters, selection identifiers or local display settings.
- Preserve a bounded, Canada-only Back history through Activity recreation, with
  URL-only restoration when history is too large. Reload avoids a new history entry.
- Reapply immersive preferences once the window is focused, when its insets
  controller is available. Dismiss the previous view's keyboard on navigation or
  errors and preserve the existing keyboard/cutout inset ownership.
- Preserve full-motion/Spectacle web defaults, saved motion choices, opt-in sound,
  hardware acceleration, the exact HTTPS origin and the single feed/render owner.

No backend, public traffic schema, radio/route interpretation, permissions,
JavaScript bridge, Android runtime framework or Worldwide app is added.

## Validation and delivery

The local build is authorized by the user's workstation/Pi build override. Use F:
for caches and output. Local checks supplement the existing public-repository CI;
standard GitHub-hosted runners for this public repository do not consume the
private-repository minute allowance.

Run unit tests, strict release lint, unsigned release assembly and debug test
assembly. The existing CI must exercise synthetic WebView journeys on API 26 and
36: warm navigation, history restoration, stale callbacks, hard errors, timeout
recovery, renderer replacement and native preference handling.

Sign the exact tested candidate with the existing certificate and retain its
source revision, package/version metadata and checksum. Before public publication,
verify the exact candidate on the Canada tablet, preserving app data: touch,
portrait/landscape, Back, keyboard, fullscreen/system bars, keep-awake, sleep/resume,
network recovery, Map/Netgraph/Labs and gesture-unlocked sound. Publish the accepted
APK and checksum at a new versioned download path, update the product page, retain
the old APK/link for rollback, and verify the public bytes.

## Platform references

- [WebViewClient callbacks](https://developer.android.com/reference/android/webkit/WebViewClient)
- [WebView history restoration](https://developer.android.com/reference/android/webkit/WebView#restoreState(android.os.Bundle))
- [Predictive Back guidance](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture)
- [Standard public-repository runner usage](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
