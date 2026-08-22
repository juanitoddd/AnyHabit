# Tests

## Backend upgrade tests

These build a database with an *old* schema, fill it with data, then boot the
current app against it and assert nothing was lost. They are the regression net
for "upgrading must never destroy data".

```bash
pip install -r backend/requirements.txt
python -m backend.tests.test_upgrade_path          # from pre-accounts v0.6.2
python -m backend.tests.test_upgrade_from_current  # from v0.6.x with accounts
python -m backend.tests.test_backup_compatibility  # v1.2.0 backups still restore
```

Each writes to a temporary directory and cleans up after itself.

## Other backend suites

```bash
python -m backend.tests.test_developer_api      # tokens, webhooks, metrics, activity
python -m backend.tests.test_proxy_coverage     # every router is reachable through nginx
```

`test_developer_api` starts a throwaway HTTP server to receive real webhook
deliveries and verifies their HMAC signatures.

`test_proxy_coverage` derives the required prefixes from the app's own routes
and checks them against `nginx.conf` and `vite.config.js` — a new router that
nobody adds to the proxy is otherwise served the SPA's HTML and fails only in
production.

## Browser tests

End-to-end checks against a running instance, covering the flows that unit
tests cannot see: dialogs opening, toasts appearing, themes applying, and the
export → import round trip.

```bash
# Terminal 1
ANYHABIT_DATA_DIR=/tmp/anyhabit-e2e ANYHABIT_COOKIE_SECURE=false \
  ANYHABIT_BOOTSTRAP_PASSWORD=e2e-password \
  uvicorn backend.main:app --port 8000

# Terminal 2
cd frontend && npm run dev

# Terminal 3
npm install playwright
node tests/browser-core.mjs
node tests/browser-backup-groups.mjs
node tests/browser-widgets.mjs
```

`browser-widgets.mjs` adds every widget type to the dashboard and drives the
developer settings, which is what catches a widget that crashes on render or an
endpoint the dev proxy does not forward.

`ANYHABIT_URL` overrides the target (default `http://127.0.0.1:5173`), and
`CHROMIUM_PATH` points Playwright at an existing Chromium instead of a
downloaded one. Failures leave a screenshot next to the test file.
