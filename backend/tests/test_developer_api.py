"""The developer surface: API tokens, webhooks, metrics and the activity feed.

Run with:  python -m backend.tests.test_developer_api
"""

from __future__ import annotations

import http.server
import json
import os
import shutil
import sys
import tempfile
import threading
from pathlib import Path


class _CaptureHandler(http.server.BaseHTTPRequestHandler):
    """Minimal receiver that records the webhook deliveries it is sent."""

    received: list[dict] = []

    def do_POST(self):  # noqa: N802 - name mandated by BaseHTTPRequestHandler
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        _CaptureHandler.received.append(
            {
                "path": self.path,
                "event": self.headers.get("X-AnyHabit-Event"),
                "signature": self.headers.get("X-AnyHabit-Signature"),
                "body": json.loads(body.decode()),
            }
        )
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *args):  # noqa: A003 - silence the default stderr spam
        return


def main() -> int:
    workdir = Path(tempfile.mkdtemp(prefix="anyhabit-dev-"))
    os.environ["ANYHABIT_DATA_DIR"] = str(workdir / "data")
    os.environ["ANYHABIT_SECRET_KEY"] = "dev-secret"
    os.environ["ANYHABIT_COOKIE_SECURE"] = "false"
    os.environ["ANYHABIT_BOOTSTRAP_PASSWORD"] = "dev-password"

    from fastapi.testclient import TestClient

    from backend.main import app

    failures: list[str] = []

    def check(label: str, condition: bool, detail: str = "") -> None:
        if condition:
            print(f"  PASS  {label}")
        else:
            failures.append(f"{label} {detail}".strip())
            print(f"  FAIL  {label} {detail}")

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _CaptureHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    receiver_url = f"http://127.0.0.1:{server.server_address[1]}/hook"

    client = TestClient(app)
    client.post("/auth/login", json={"identifier": "owner@anyhabit.local", "password": "dev-password"})

    tracker = client.post(
        "/trackers/",
        json={
            "name": "Read",
            "category": "Learning",
            "type": "build",
            "unit": "Pages",
            "units_per_amount": 10,
            "units_per": "day",
        },
    ).json()

    print("\n[1] Personal access tokens")
    created = client.post("/developer/tokens", json={"name": "Home Assistant"})
    check("token created", created.status_code == 201, created.text[:200])
    token_body = created.json() if created.status_code == 201 else {}
    plaintext = token_body.get("token", "")
    check("token has the ahb_ prefix", plaintext.startswith("ahb_"), plaintext[:12])
    check("preview matches the token", plaintext.startswith(token_body.get("token_prefix", "x")), "")

    listed = client.get("/developer/tokens").json()
    check("token appears in the list", len(listed) == 1, str(listed))
    check(
        "the secret is never returned again",
        "token" not in listed[0],
        str(sorted(listed[0].keys())),
    )

    print("\n[2] The token authenticates on its own")
    anon = TestClient(app)
    unauth = anon.get("/trackers/")
    check("no credentials is rejected", unauth.status_code == 401, str(unauth.status_code))

    with_token = anon.get("/trackers/", headers={"Authorization": f"Bearer {plaintext}"})
    check("token grants access", with_token.status_code == 200, with_token.text[:200])
    check("token sees the right data", any(t["name"] == "Read" for t in with_token.json()))

    bad = anon.get("/trackers/", headers={"Authorization": "Bearer ahb_not-a-real-token"})
    check("an unknown token is rejected", bad.status_code == 401, str(bad.status_code))
    check("rejection names the cause", "API token" in bad.text, bad.text[:120])

    created_via_token = anon.post(
        f"/trackers/{tracker['id']}/logs/",
        headers={"Authorization": f"Bearer {plaintext}"},
        json={"amount": 12, "note": "logged by script"},
    )
    check("token can write", created_via_token.status_code == 201, created_via_token.text[:200])

    refreshed = client.get("/developer/tokens").json()[0]
    check("last_used_at is recorded", refreshed["last_used_at"] is not None, str(refreshed))

    print("\n[3] Revoking a token takes effect immediately")
    revoked = client.delete(f"/developer/tokens/{token_body['id']}")
    check("revoke succeeds", revoked.status_code == 200, revoked.text[:150])
    after = anon.get("/trackers/", headers={"Authorization": f"Bearer {plaintext}"})
    check("revoked token no longer works", after.status_code == 401, str(after.status_code))
    check("revoked token leaves the list", client.get("/developer/tokens").json() == [], "")

    print("\n[4] Webhooks deliver, signed")
    _CaptureHandler.received.clear()
    hook = client.post(
        "/developer/webhooks",
        json={"name": "Test receiver", "url": receiver_url, "events": "log.created,tracker.relapse"},
    )
    check("webhook created", hook.status_code == 201, hook.text[:200])
    hook_body = hook.json() if hook.status_code == 201 else {}
    check("a signing secret was generated", bool(hook_body.get("secret")), "")

    events = client.get("/developer/webhooks/events").json()
    check("event catalogue exposed", "log.created" in events, str(events))

    client.post(f"/trackers/{tracker['id']}/logs/", json={"amount": 5})
    for _ in range(50):
        if _CaptureHandler.received:
            break
        __import__("time").sleep(0.1)

    check("delivery arrived", len(_CaptureHandler.received) >= 1, str(len(_CaptureHandler.received)))
    if _CaptureHandler.received:
        delivery = _CaptureHandler.received[0]
        check("event header set", delivery["event"] == "log.created", str(delivery["event"]))
        check("payload names the event", delivery["body"]["event"] == "log.created", str(delivery["body"]["event"]))
        check("payload carries the tracker", delivery["body"]["data"]["tracker"]["name"] == "Read", "")
        check("signature present", (delivery["signature"] or "").startswith("sha256="), str(delivery["signature"]))

        # A receiver must be able to verify the signature itself.
        import hashlib
        import hmac

        expected = hmac.new(
            hook_body["secret"].encode(),
            json.dumps(delivery["body"], separators=(",", ":"), default=str).encode(),
            hashlib.sha256,
        ).hexdigest()
        check(
            "signature verifies against the body",
            delivery["signature"] == f"sha256={expected}",
            "recomputed HMAC differs",
        )

    print("\n[5] Unsubscribed events are not delivered")
    _CaptureHandler.received.clear()
    client.post(f"/trackers/{tracker['id']}/journal/", json={"content": "not subscribed", "mood": 3})
    __import__("time").sleep(0.6)
    check("journal.created was filtered out", len(_CaptureHandler.received) == 0, str(_CaptureHandler.received))

    print("\n[6] A broken webhook is recorded, not raised")
    broken = client.post(
        "/developer/webhooks", json={"name": "Broken", "url": "http://127.0.0.1:9/nope", "events": "*"}
    ).json()
    log_response = client.post(f"/trackers/{tracker['id']}/logs/", json={"amount": 1})
    check("logging still succeeds with a dead webhook", log_response.status_code == 201, log_response.text[:150])

    __import__("time").sleep(1.2)
    state = next(w for w in client.get("/developer/webhooks").json() if w["id"] == broken["id"])
    check("failure counted", state["failure_count"] >= 1, str(state))
    check("error message stored for the user", bool(state["last_error"]), str(state["last_error"])[:100])

    bad_url = client.post("/developer/webhooks", json={"url": "not-a-url"})
    check("a non-http URL is refused", bad_url.status_code == 422, bad_url.text[:150])

    print("\n[7] Prometheus metrics")
    metrics = client.get("/developer/metrics")
    check("metrics returned", metrics.status_code == 200, metrics.text[:150])
    check("prometheus content type", "text/plain" in metrics.headers.get("content-type", ""), metrics.headers.get("content-type", ""))
    body = metrics.text
    for metric in ("anyhabit_info", "anyhabit_trackers_total", "anyhabit_tracker_streak_current"):
        check(f"exposes {metric}", metric in body, "")
    check("tracker name appears as a label", 'tracker="Read"' in body, "")
    check("metrics require auth", TestClient(app).get("/developer/metrics").status_code == 401, "")

    print("\n[8] Activity feed")
    feed = client.get("/dashboard/activity", params={"limit": 10})
    check("activity returned", feed.status_code == 200, feed.text[:200])
    if feed.status_code == 200:
        data = feed.json()
        check("logs present", len(data["logs"]) >= 2, str(len(data["logs"])))
        check("log rows name their tracker", data["logs"][0]["tracker_name"] == "Read", str(data["logs"][0]))
        check("journals present", len(data["journals"]) >= 1, str(len(data["journals"])))
        check("mood trend computed", len(data["mood_trend"]) >= 1, str(data["mood_trend"]))

    server.shutdown()
    shutil.rmtree(workdir, ignore_errors=True)

    print("\n" + "=" * 60)
    if failures:
        print(f"{len(failures)} CHECK(S) FAILED:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("ALL DEVELOPER API CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
