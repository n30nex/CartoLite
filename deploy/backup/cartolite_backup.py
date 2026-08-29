#!/usr/bin/env python3
"""Restic backup/check/restore operations for CartoLite's bounded checkpoint."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

TIMEOUT_SECONDS = 5
DEFAULT_STATE = Path("/var/lib/docker/volumes/cartolite_cartolite-data/_data/state-v1.json")
DEFAULT_APP_ENV = Path("/opt/CartoLite/.env")
DEFAULT_WORK = Path("/var/lib/cartolite-backup")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_manifest(checkpoint: Path, identity: dict[str, str], timestamp: str | None = None) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "createdAt": timestamp or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "version": identity.get("version", "unknown"),
        "gitSha": identity.get("gitSha", "unknown"),
        "image": identity.get("image", "unknown"),
        "imageId": identity.get("imageId", "unknown"),
        "checkpoint": {
            "name": "state-v1.json",
            "bytes": checkpoint.stat().st_size,
            "sha256": sha256_file(checkpoint),
        },
    }


def verify_restored_snapshot(checkpoint: Path, manifest_path: Path) -> str:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    expected = manifest.get("checkpoint", {}).get("sha256")
    actual = sha256_file(checkpoint)
    if not isinstance(expected, str) or expected != actual:
        raise RuntimeError("restored checkpoint SHA-256 does not match its deployment manifest")
    return actual


def atomic_write(path: Path, body: bytes, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb") as handle:
            handle.write(body)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def public_identity(app_env: Path) -> dict[str, str]:
    identity = {"version": "unknown", "gitSha": "unknown", "image": image_from_env(app_env), "imageId": "unknown"}
    try:
        with urlopen("http://127.0.0.1:39476/healthz", timeout=TIMEOUT_SECONDS) as response:
            health = json.loads(response.read(64 * 1024))
        identity["version"] = clean_text(health.get("version"), 40) or "unknown"
        identity["gitSha"] = clean_sha(health.get("gitSha"))
    except (OSError, ValueError, json.JSONDecodeError):
        pass
    try:
        result = subprocess.run(
            ["docker", "inspect", "--format", "{{json .Config.Image}} {{json .Image}}", "cartolite-cartolite-1"],
            check=True,
            text=True,
            capture_output=True,
            timeout=15,
        )
        values = json.loads(f"[{result.stdout.strip().replace(' ', ',', 1)}]")
        if len(values) == 2:
            identity["image"] = clean_text(values[0], 240) or identity["image"]
            identity["imageId"] = clean_text(values[1], 96) or "unknown"
    except (OSError, ValueError, subprocess.SubprocessError, json.JSONDecodeError):
        pass
    return identity


def image_from_env(path: Path) -> str:
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith("CARTOLITE_IMAGE="):
                return clean_text(line.split("=", 1)[1], 240) or "unknown"
    except OSError:
        pass
    return "unknown"


def stage_snapshot(checkpoint: Path, app_env: Path, work: Path) -> dict[str, Any]:
    if not checkpoint.is_file():
        raise RuntimeError(f"checkpoint is missing: {checkpoint}")
    staging = work / "staging"
    staging.mkdir(parents=True, exist_ok=True)
    os.chmod(staging, 0o700)
    staged_checkpoint = staging / "state-v1.json"
    atomic_write(staged_checkpoint, checkpoint.read_bytes())
    manifest = build_manifest(staged_checkpoint, public_identity(app_env))
    atomic_write(staging / "deployment-manifest.json", (json.dumps(manifest, separators=(",", ":"), sort_keys=True) + "\n").encode())
    return manifest


def restic(arguments: list[str], *, cwd: Path | None = None, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["restic", *arguments],
        cwd=cwd,
        check=True,
        text=True,
        capture_output=capture,
        timeout=12 * 60 * 60,
    )


def initialize_repository() -> None:
    probe = subprocess.run(["restic", "cat", "config"], text=True, capture_output=True, timeout=60)
    if probe.returncode == 0:
        return
    restic(["init"])


def daily(checkpoint: Path, app_env: Path, work: Path) -> dict[str, Any]:
    manifest = stage_snapshot(checkpoint, app_env, work)
    staging = work / "staging"
    restic(["backup", "state-v1.json", "deployment-manifest.json", "--tag", "cartolite-daily"], cwd=staging)
    restic(["forget", "--tag", "cartolite-daily", "--keep-daily", "30", "--keep-weekly", "8", "--keep-monthly", "12", "--prune"])
    return manifest


def weekly() -> None:
    restic(["check"])


def monthly(work: Path) -> str:
    restic(["check", "--read-data"])
    snapshots = json.loads(restic(["snapshots", "--tag", "cartolite-daily", "--latest", "1", "--json"], capture=True).stdout)
    if not isinstance(snapshots, list) or not snapshots or not snapshots[0].get("id"):
        raise RuntimeError("no CartoLite daily snapshot is available to restore")
    restore_root = work / "restore"
    if restore_root.exists():
        shutil.rmtree(restore_root)
    restore_root.mkdir(parents=True, mode=0o700)
    try:
        restic(["restore", snapshots[0]["id"], "--target", str(restore_root)])
        checkpoints = list(restore_root.rglob("state-v1.json"))
        manifests = list(restore_root.rglob("deployment-manifest.json"))
        if len(checkpoints) != 1 or len(manifests) != 1:
            raise RuntimeError("restored snapshot does not contain exactly one checkpoint and manifest")
        return verify_restored_snapshot(checkpoints[0], manifests[0])
    finally:
        shutil.rmtree(restore_root, ignore_errors=True)


def send_failure(webhook_url: str, mode: str, identity: dict[str, str]) -> None:
    if not webhook_url:
        return
    parts = urlsplit(webhook_url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["wait"] = "true"
    target = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
    content = "\n".join([
        "CartoLite BACKUP FAILURE",
        f"timestamp: {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        f"status: {clean_text(mode, 24)} failed",
        f"version/SHA: {identity.get('version', 'unknown')}/{identity.get('gitSha', 'unknown')}",
    ])
    request = Request(target, data=json.dumps({"content": content}).encode(), method="POST", headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        if response.status not in (200, 204):
            raise RuntimeError(f"Discord webhook returned HTTP {response.status}")


def validate_environment() -> None:
    required = ["RESTIC_REPOSITORY", "RESTIC_PASSWORD_FILE", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]
    missing = [name for name in required if not os.environ.get(name, "").strip()]
    if missing:
        raise RuntimeError(f"missing required backup environment fields: {', '.join(missing)}")
    password_file = Path(os.environ["RESTIC_PASSWORD_FILE"])
    if not password_file.is_file():
        raise RuntimeError("RESTIC_PASSWORD_FILE does not exist")


def clean_text(value: Any, limit: int) -> str:
    text = str(value or "").strip()
    return "".join(character for character in text if character.isalnum() or character in ".:_-/@")[:limit]


def clean_sha(value: Any) -> str:
    text = str(value or "").strip().lower()
    return text[:12] if text and all(character in "0123456789abcdef" for character in text) else "unknown"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("init", "daily", "weekly", "monthly"))
    parser.add_argument("--checkpoint", type=Path, default=Path(os.environ.get("CARTOLITE_STATE_PATH", DEFAULT_STATE)))
    parser.add_argument("--app-env", type=Path, default=Path(os.environ.get("CARTOLITE_APP_ENV", DEFAULT_APP_ENV)))
    parser.add_argument("--work", type=Path, default=Path(os.environ.get("CARTOLITE_BACKUP_WORK", DEFAULT_WORK)))
    args = parser.parse_args()
    identity = public_identity(args.app_env)
    try:
        validate_environment()
        args.work.mkdir(parents=True, exist_ok=True)
        os.chmod(args.work, 0o700)
        lock_path = args.work / "operation.lock"
        with lock_path.open("a+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if args.mode == "init":
                initialize_repository()
                result: Any = "initialized"
            elif args.mode == "daily":
                result = daily(args.checkpoint, args.app_env, args.work)
            elif args.mode == "weekly":
                weekly()
                result = "metadata-check-passed"
            else:
                result = {"restoredSha256": monthly(args.work)}
    except Exception:
        try:
            send_failure(os.environ.get("DISCORD_WEBHOOK_URL", "").strip(), args.mode, identity)
        finally:
            raise
    print(json.dumps({"mode": args.mode, "result": result}, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
