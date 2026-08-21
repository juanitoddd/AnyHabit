"""Every backend route must be reachable through the proxies in front of it.

A router mounted in FastAPI but missing from nginx's location regex is served
the SPA's index.html instead, so the client gets HTML where it expected JSON.
That failure is silent on the server and confusing on the client, and it has
happened once per new router, so it is checked here instead of by hand.

Run with:  python -m backend.tests.test_proxy_coverage
"""

from __future__ import annotations

import os
import re
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
NGINX_CONF = REPO_ROOT / "frontend" / "nginx.conf"
VITE_CONFIG = REPO_ROOT / "frontend" / "vite.config.js"

# Served by FastAPI but intentionally not proxied: the SPA owns "/".
IGNORED_PREFIXES = {""}


def backend_prefixes() -> set[str]:
    """Top-level path segments the API actually serves."""
    os.environ.setdefault("ANYHABIT_DATA_DIR", tempfile.mkdtemp(prefix="anyhabit-proxy-"))

    from backend.main import app

    prefixes = set()
    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith("/"):
            continue
        segment = path.strip("/").split("/")[0]
        if segment and not segment.startswith("{"):
            prefixes.add(segment)
    return prefixes - IGNORED_PREFIXES


def nginx_prefixes() -> set[str]:
    match = re.search(r"location ~ \^/\(([^)]+)\)", NGINX_CONF.read_text())
    if not match:
        return set()
    return {part.strip() for part in match.group(1).split("|") if part.strip()}


def vite_prefixes() -> set[str]:
    return set(re.findall(r"'/([a-zA-Z0-9_-]+)':\s*'http", VITE_CONFIG.read_text()))


def is_covered(prefix: str, alternatives: set[str]) -> bool:
    """Whether a proxy rule matches this prefix.

    ``location ~ ^/(a|b)`` is an unanchored prefix match, so the alternative
    ``openapi`` already covers the path ``/openapi.json``. The same is true of
    Vite's proxy keys, which match by prefix too.
    """
    return any(prefix == alternative or prefix.startswith(alternative) for alternative in alternatives)


def main() -> int:
    failures: list[str] = []

    def check(label: str, condition: bool, detail: str = "") -> None:
        if condition:
            print(f"  PASS  {label}")
        else:
            failures.append(f"{label} {detail}".strip())
            print(f"  FAIL  {label} {detail}")

    required = backend_prefixes()
    print(f"\nBackend serves {len(required)} top-level prefixes: {', '.join(sorted(required))}")

    print("\n[1] nginx proxies every backend prefix")
    nginx_rules = nginx_prefixes()
    missing_nginx = sorted(prefix for prefix in required if not is_covered(prefix, nginx_rules))
    check("no prefix missing from nginx.conf", not missing_nginx, f"missing: {missing_nginx}")

    print("\n[2] the dev server proxies every backend prefix")
    # Docs routes are only interesting in production, where nginx handles them.
    dev_required = required - {"docs", "redoc", "openapi.json", "openapi"}
    vite_rules = vite_prefixes()
    missing_vite = sorted(prefix for prefix in dev_required if not is_covered(prefix, vite_rules))
    check("no prefix missing from vite.config.js", not missing_vite, f"missing: {missing_vite}")

    print("\n[3] nginx template stays substitutable")
    nginx_text = NGINX_CONF.read_text()
    check("backend host is templated", "${BACKEND_HOST}" in nginx_text, "hardcoded host")
    check("upload limit raised for backup import", "client_max_body_size" in nginx_text, "")
    check(
        "nginx runtime variables are not templated away",
        "$host" in nginx_text and "$uri" in nginx_text,
        "",
    )

    print("\n" + "=" * 60)
    if failures:
        print(f"{len(failures)} CHECK(S) FAILED:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("ALL PROXY COVERAGE CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
