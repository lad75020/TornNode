# Quickstart: Torn Data Synchronization

## Prerequisites

- Node.js and the repository dependencies installed from the repository root.
- A test/session fixture that contains an authenticated user id and Torn API key when exercising live imports.
- MongoDB and Redis available only for live integration tests; focused unit tests use fakes and do not require either service.
- A browser with IndexedDB support for the local-retention checks.

## 1. Prepare the feature workspace

```sh
cd /Volumes/WDBlack4TB/Code/tornnode
specify --help
```

The active feature directory is `specs/003-torn-data-synchronization/`.

## 2. Run focused server synchronization tests

After implementation, run the feature tests from the repository root:

```sh
node --test tests/torn-data-synchronization.test.cjs
```

The consolidated test harness uses fake sessions/sockets/stores and covers:

- missing session/API credential rejection;
- user-scoped database selection;
- resume checkpoints and duplicate-safe writes;
- progress, stop, retry, and terminal cleanup;
- bounded log streaming and request correlation;
- complete-cache, incomplete-cache, and authoritative-item fallback behavior.

Client IndexedDB lifecycle behavior is additionally checked through the production build and source-level review. The repository's Playwright smoke test requires a controlled live session and is intentionally not run with real credentials.

## 3. Run existing WebSocket/auth regression tests

Use the repository's focused authentication test command, then include any existing WebSocket contract tests relevant to the runtime branch:

```sh
npm run test:auth
node --test tests/websocket-auth-upgrade.test.cjs tests/websocket-auth-commands.test.cjs
```

If a named existing test is absent in a checkout, run the available matching test files rather than inventing a result.

## 4. Build the client

```sh
npm run build
```

The build must complete successfully and must include the updated JSX/IndexedDB modules in the generated client bundle.

## 5. Manual WebSocket smoke flow

With the normal application environment configured:

1. Start the application using its existing development command.
2. Sign in as a test user.
3. Start a log import and confirm progress advances, reaches 100%, and reports the inserted count.
4. Start an attack import; if logs are still importing, confirm the existing deferred behavior eventually starts attacks or returns a terminal error.
5. Send a bounded `getAllTornLogs` request with a unique `requestId`; confirm `start`, chronological `batch`, and `end` messages all carry that id.
6. Refresh the item catalog; confirm item search works immediately from local data on a page reload.
7. Send `stopImport` during a long import; confirm the UI stops and a subsequent import can start without stale guards.

Do not paste real API keys into the browser console or test output.

## 6. Acceptance checks

- Repeat the same log/attack range and verify no record-count increase from duplicates.
- Run the same flow under two test identities and verify their user stores and responses remain separate.
- Force a transient API/cache failure and verify prior records/catalog data remain available and the error is generic.
- Run stop, timeout, socket-close, and zero-data paths and verify no progress indicator remains stuck in a running state.
- In a credentialed browser environment, run a local 10,000-log fixture through log-id and timestamp-range queries and record whether it meets the 500 ms target.
