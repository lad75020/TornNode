# Quickstart: Item Catalog and Pricing

## Prerequisites

- Run commands from `/Volumes/WDBlack4TB/Code/tornnode`.
- Install dependencies from the repository root only; `client/package.json` is deprecated.
- The focused server tests use in-memory fakes and do not require live MongoDB, Redis, or a Torn API key.
- An authenticated application session and configured services are required for the optional browser smoke test.

## Focused Verification

Run the backend catalog/price tests:

```bash
node --test tests/item-catalog-pricing.test.cjs tests/torn-data-synchronization.test.cjs
```

Build the React client and static assets:

```bash
npm run build
```

Run the existing authenticated Item Prices browser smoke test when a test session/token is available. Start the application separately (or point `AUTH_TEST_BASE_URL` at an already-running test deployment), then skip Playwright's stale auto-server command with `EXPO_SKIP_SERVER=1`:

```bash
EXPO_SKIP_SERVER=1 \
AUTH_TEST_BASE_URL='https://127.0.0.1:3104' \
TEST_JWT='<test-session-token>' \
npx playwright test client/tests/autocomplete.spec.ts --config client/playwright.config.js
```

The repository's `npm run dev` command owns the application server and its configured port; it is not a Vite-only server. If the test deployment uses another URL, replace `AUTH_TEST_BASE_URL` accordingly.

Do not commit real API keys or session cookies. If the browser test cannot authenticate in the current environment, report it as an environment limitation; the deterministic Node tests and production build must still pass.

## Manual Acceptance Flow

1. Start the application using the repository's normal development command and authenticate through the existing login flow.
2. Seed or retain a valid Item Prices catalog in the browser, then open Item Prices. Confirm the local list appears without a catalog request when `itemsLastSync` is less than ten minutes old.
3. Remove the local snapshot or age its marker beyond ten minutes. Reopen Item Prices and confirm one `getAllTornItems` request is sent and the previous valid rows remain visible while it refreshes.
4. Open a second tab. After a successful commit in the first tab, confirm the second tab reloads the catalog/type options through the `itemsLastSync` storage notification rather than a timer.
5. Search by a case-insensitive item-name prefix, select a type, and verify the no-results state and unique sorted type options.
6. Trigger a price refresh. Confirm the row shows in-progress feedback, a valid success updates the row and IndexedDB, and an invalid/failing response leaves the previous price intact.
7. Inspect server logs only for diagnostics; client responses must not expose API keys, sessions, database names, or raw exception messages.

## Final Repository Checks

```bash
git diff --check
node -e "const fs=require('fs'); const yaml=require('yaml'); const q=yaml.parse(fs.readFileSync('.specify/extensions/time-machine/features-queue.yml','utf8')); if(q.total_features!==q.features.length) throw new Error('queue count mismatch'); console.log('queue ok:', q.features.length)"
```

If the optional `yaml` package is not available, use the repository's existing YAML-capable tooling or a Python YAML parser already installed in the environment; do not treat a visual read as proof that the queue parses.
