#!/usr/bin/env python3
"""CartoLite public health/readiness watchdog with bounded Discord alerts."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

FAILURE_THRESHOLD = 3
RECOVERY_THRESHOLD = 2
TIMEOUT_SECONDS = 5


def initial_state() -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "initialized": False,
        "healthFailures": 0,
        "readinessFailures": 0,
        "successes": 0,
        "outageActive": False,
        "readinessActive": False,
        "bootId": "",
        "version": "unknown",
        "gitSha": "unknown",
    }


def evaluate(
    previous: dict[str, Any],
    health: dict[str, Any],
    readiness: dict[str, Any],
    *,
    seed: bool = False,
) -> tuple[dict[str, Any], list[str]]:
    state = {**initial_state(), **previous}
    alerts: list[str] = []
    health_ok = bool(health.get("ok"))
    readiness_ok = bool(readiness.get("ok"))
    health_data = health.get("data") if isinstance(health.get("data"), dict) else {}

    version = clean_text(health_data.get("version"), 40) or state["version"]
    git_sha = clean_sha(health_data.get("gitSha")) or state["gitSha"]
    boot_id = clean_text(health_data.get("bootId"), 160)
    old_boot_id = clean_text(state.get("bootId"), 160)
    state["version"] = version
    state["gitSha"] = git_sha

    if seed or not state["initialized"]:
        state.update({
            "initialized": True,
            "healthFailures": 0,
            "readinessFailures": 0,
            "successes": 0,
            "outageActive": False,
            "readinessActive": False,
            "bootId": boot_id or old_boot_id,
        })
        return state, alerts

    if health_ok and boot_id and old_boot_id and boot_id != old_boot_id:
        alerts.append("boot-change")
    if boot_id:
        state["bootId"] = boot_id

    if not health_ok:
        state["healthFailures"] += 1
        state["readinessFailures"] = 0
        state["successes"] = 0
        if state["healthFailures"] >= FAILURE_THRESHOLD and not state["outageActive"]:
            state["outageActive"] = True
            alerts.append("outage")
        return state, alerts

    state["healthFailures"] = 0
    if not readiness_ok:
        state["readinessFailures"] += 1
        state["successes"] = 0
        if state["readinessFailures"] >= FAILURE_THRESHOLD and not state["readinessActive"]:
            state["readinessActive"] = True
            alerts.append("readiness")
        return state, alerts

    state["readinessFailures"] = 0
    state["successes"] += 1
    if state["successes"] >= RECOVERY_THRESHOLD and (state["outageActive"] or state["readinessActive"]):
        state["outageActive"] = False
        state["readinessActive"] = False
        alerts.append("recovery")
    return state, alerts


def fetch_json(url: str) -> dict[str, Any]:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "CartoLite watchdog/1"})
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            status = response.status
            body = response.read(64 * 1024)
    except HTTPError as error:
        status = error.code
        body = error.read(64 * 1024)
    except (URLError, TimeoutError, OSError) as error:
        return {"ok": False, "status": clean_text(type(error).__name__, 40), "data": {}}

    try:
        data = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        data = {}
    return {
        "ok": 200 <= status < 300 and isinstance(data, dict)
        and (data.get("ok") is True or data.get("ready") is True),
        "status": status,
        "data": data if isinstance(data, dict) else {},
    }


def alert_content(
    event: str,
    state: dict[str, Any],
    health: dict[str, Any],
    readiness: dict[str, Any],
) -> str:
    labels = {
        "outage": "OUTAGE",
        "readiness": "READINESS FAILURE",
        "recovery": "RECOVERY",
        "boot-change": "UNEXPECTED BOOT ID CHANGE",
    }
    ready = readiness.get("data") if isinstance(readiness.get("data"), dict) else {}
    sanitized = {
        "ready": bool(ready.get("ready")),
        "mqtt": bool(ready.get("mqtt")),
        "checkpoint": bool(ready.get("checkpoint")),
        "dropped": safe_integer(ready.get("dropped")),
        "queueDepth": safe_integer(ready.get("queueDepth")),
        "queueHealthy": bool(ready.get("queueHealthy")),
    }
    status = f"health={clean_text(health.get('status'), 32) or 'error'} readiness={clean_text(readiness.get('status'), 32) or 'error'}"
    return "\n".join([
        f"CartoLite {labels[event]}",
        f"timestamp: {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        f"status: {status}",
        f"version/SHA: {clean_text(state.get('version'), 40)}/{clean_sha(state.get('gitSha')) or 'unknown'}",
        f"readiness: {json.dumps(sanitized, separators=(',', ':'), sort_keys=True)}",
    ])


def send_discord(webhook_url: str, content: str) -> None:
    parts = urlsplit(webhook_url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["wait"] = "true"
    target = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
    body = json.dumps({"content": content}, separators=(",", ":")).encode()
    request = Request(target, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "User-Agent": "CartoLite watchdog/1",
    })
    with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        if response.status not in (200, 204):
            raise RuntimeError(f"Discord webhook returned HTTP {response.status}")


def load_state(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else initial_state()
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return initial_state()


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(state, handle, separators=(",", ":"), sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def clean_text(value: Any, limit: int) -> str:
    text = str(value or "").strip()
    return "".join(character for character in text if character.isalnum() or character in ".:_-/")[:limit]


def clean_sha(value: Any) -> str:
    text = str(value or "").strip().lower()
    return text[:12] if text and all(character in "0123456789abcdef" for character in text) else ""


def safe_integer(value: Any) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, default=Path("/var/lib/cartolite-watch/state.json"))
    parser.add_argument("--seed", action="store_true", help="record current identity without sending notifications")
    args = parser.parse_args()
    base_url = os.environ.get("CARTOLITE_URL", "https://carto.canadaverse.org").rstrip("/")
    webhook = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    if not webhook and not args.seed:
        raise SystemExit("DISCORD_WEBHOOK_URL is required")

    health = fetch_json(f"{base_url}/healthz")
    readiness = fetch_json(f"{base_url}/readyz")
    previous = load_state(args.state)
    state, alerts = evaluate(previous, health, readiness, seed=args.seed)
    for event in alerts:
        send_discord(webhook, alert_content(event, state, health, readiness))
    save_state(args.state, state)
    print(json.dumps({
        "health": health["status"],
        "readiness": readiness["status"],
        "alerts": alerts,
        "outageActive": state["outageActive"],
        "readinessActive": state["readinessActive"],
    }, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
