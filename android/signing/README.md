# Android release identity

The public certificate in this directory signs CartoLite for Android releases.
Its SHA-256 fingerprint is:

```text
55:F8:F0:8B:31:8E:25:B4:3B:46:7F:3E:BD:17:D3:26:32:2E:12:E3:71:EE:83:C7:C8:8B:3A:30:E9:EE:3D:A5
```

The corresponding private key and passwords are not repository material.
They live in the protected Canadaverse secret store and must never be printed,
copied into Gradle properties, attached to a release, or placed beside the APK.

For every release, require `apksigner verify --verbose --print-certs` to report
this fingerprint and publish the APK file's independent SHA-256 checksum.
