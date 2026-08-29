import json
import tempfile
import unittest
from pathlib import Path

from deploy.backup.cartolite_backup import build_manifest, sha256_file, verify_restored_snapshot


class BackupManifestTests(unittest.TestCase):
    def test_manifest_and_restore_checksum_match_exact_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            checkpoint = root / "state-v1.json"
            checkpoint.write_bytes(b'{"schemaVersion":1,"nodes":[],"routes":[]}')
            manifest = build_manifest(checkpoint, {
                "version": "0.5.0",
                "gitSha": "a" * 12,
                "image": "ghcr.io/n30nex/cartolite@sha256:" + "b" * 64,
                "imageId": "sha256:" + "c" * 64,
            }, "2026-08-29T00:00:00+00:00")
            manifest_path = root / "deployment-manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            self.assertEqual(manifest["checkpoint"]["sha256"], sha256_file(checkpoint))
            self.assertEqual(verify_restored_snapshot(checkpoint, manifest_path), sha256_file(checkpoint))
            self.assertEqual(set(manifest), {"schemaVersion", "createdAt", "version", "gitSha", "image", "imageId", "checkpoint"})

    def test_checksum_mismatch_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            checkpoint = root / "state-v1.json"
            checkpoint.write_text("changed", encoding="utf-8")
            manifest = root / "deployment-manifest.json"
            manifest.write_text(json.dumps({"checkpoint": {"sha256": "0" * 64}}), encoding="utf-8")
            with self.assertRaises(RuntimeError):
                verify_restored_snapshot(checkpoint, manifest)


if __name__ == "__main__":
    unittest.main()
