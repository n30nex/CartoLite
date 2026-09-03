#!/usr/bin/env python3
"""Idempotently apply CartoLite's one narrow Cloudflare Cache Rule."""

from __future__ import annotations

import argparse
import json
import os
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

API = "https://api.cloudflare.com/client/v4"
RULE_REF = "cartolite_region_geojson_v1"
RULE = {
    "ref": RULE_REF,
    "description": "CartoLite content-hashed MeshCore Canada region data",
    "expression": (
        '(http.host eq "carto.canadaverse.org" '
        'and starts_with(http.request.uri.path, "/assets/meshcore-canada-region") '
        'and (ends_with(http.request.uri.path, ".geojson") '
        'or ends_with(http.request.uri.path, ".json")) '
        'and not starts_with(http.request.uri.path, "/api/") '
        'and http.request.uri.path ne "/healthz" '
        'and http.request.uri.path ne "/readyz")'
    ),
    "action": "set_cache_settings",
    "action_parameters": {
        "cache": True,
        "edge_ttl": {"mode": "override_origin", "default": 31_536_000},
        "browser_ttl": {"mode": "respect_origin"},
    },
}


def request(token: str, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = None if body is None else json.dumps(body, separators=(",", ":")).encode()
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    try:
        with urlopen(Request(f"{API}{path}", data=payload, method=method, headers=headers), timeout=15) as response:
            document = json.loads(response.read(2 * 1024 * 1024))
    except HTTPError as error:
        raise RuntimeError(f"Cloudflare API {method} failed with HTTP {error.code}") from None
    if not document.get("success"):
        codes = [str(item.get("code", "unknown")) for item in document.get("errors", []) if isinstance(item, dict)]
        raise RuntimeError(f"Cloudflare API {method} failed with error codes {','.join(codes) or 'unknown'}")
    return document


def apply(token: str, zone_id: str) -> dict[str, str]:
    listed = request(token, "GET", f"/zones/{zone_id}/rulesets")
    candidates = [item for item in listed.get("result", [])
                  if item.get("phase") == "http_request_cache_settings" and item.get("kind") == "zone"]
    if len(candidates) > 1:
        raise RuntimeError("multiple zone cache-settings rulesets found")
    if not candidates:
        created = request(token, "POST", f"/zones/{zone_id}/rulesets", {
            "name": "CartoLite cache rules",
            "description": "Narrow cache eligibility for immutable CartoLite assets",
            "kind": "zone",
            "phase": "http_request_cache_settings",
            "rules": [RULE],
        })["result"]
        rule_id = verified_rule_id(token, zone_id, created["id"])
        return {"operation": "created-ruleset", "rulesetId": created["id"], "ruleId": rule_id}

    ruleset_id = candidates[0]["id"]
    ruleset = request(token, "GET", f"/zones/{zone_id}/rulesets/{ruleset_id}")["result"]
    matches = [rule for rule in ruleset.get("rules", []) if rule.get("ref") == RULE_REF]
    if len(matches) > 1:
        raise RuntimeError("duplicate CartoLite region cache rules found")
    if matches:
        rule_id = matches[0]["id"]
        request(token, "PATCH", f"/zones/{zone_id}/rulesets/{ruleset_id}/rules/{rule_id}", RULE)
        return {"operation": "updated-rule", "rulesetId": ruleset_id, "ruleId": verified_rule_id(token, zone_id, ruleset_id)}
    request(token, "POST", f"/zones/{zone_id}/rulesets/{ruleset_id}/rules", RULE)
    return {"operation": "created-rule", "rulesetId": ruleset_id, "ruleId": verified_rule_id(token, zone_id, ruleset_id)}


def verified_rule_id(token: str, zone_id: str, ruleset_id: str) -> str:
    ruleset = request(token, "GET", f"/zones/{zone_id}/rulesets/{ruleset_id}")["result"]
    matches = [rule for rule in ruleset.get("rules", []) if rule.get("ref") == RULE_REF]
    if len(matches) != 1 or not rule_matches(matches[0]):
        raise RuntimeError("CartoLite region cache rule verification failed")
    return matches[0]["id"]


def rule_matches(rule: dict[str, Any]) -> bool:
    parameters = rule.get("action_parameters")
    if not isinstance(parameters, dict):
        return False
    edge_ttl = parameters.get("edge_ttl")
    browser_ttl = parameters.get("browser_ttl")
    return (
        rule.get("action") == RULE["action"]
        and rule.get("expression") == RULE["expression"]
        and parameters.get("cache") is True
        and isinstance(edge_ttl, dict)
        and edge_ttl.get("mode") == "override_origin"
        and edge_ttl.get("default") == 31_536_000
        and isinstance(browser_ttl, dict)
        and browser_ttl.get("mode") == "respect_origin"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.dry_run:
        print(json.dumps(RULE, separators=(",", ":"), sort_keys=True))
        return 0
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    zone_id = os.environ.get("CLOUDFLARE_ZONE_ID", "").strip()
    if not token or not zone_id:
        raise SystemExit("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID are required")
    print(json.dumps(apply(token, zone_id), separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
