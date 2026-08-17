# Quickstart: Validate Realtime Application Runtime

This guide validates the planned feature in isolated test mode. It is a verification guide, not an implementation procedure and must never use production accounts, API keys, sockets, or Mongo/Redis databases.

## Prerequisites

1. Start isolated MongoDB and Redis test services configured by test-only environment variables (`MONGODB_URI_TEST`, `REDIS_URL_TEST`/test Redis port).
2. Set non-production values for `SESSION_SECRET` and the explicit test origin.
3. Reuse the Feature #001 isolated harness (`tests/helpers/authTestHarness.cjs`, `tests/helpers/authTestEnvironment.cjs`, `tests/helpers/authTestFixtures.cjs`).
4. Run the Fastify app in its `--test` mode on a loopback origin; accept only loopback Mongo/Redis URLs in test mode.

## Automated validation

After implementation, run the Node runtime-resilience suite:

```sh
npm run test:runtime
```

Expected scenarios (raw WebSocket / Node contract tests, no browser required):

- **Authenticated connect**: a valid session cookie opens `/ws`; a `session` frame (and any authenticated acknowledgement) is received before private work.
- **Unauthenticated close**: a missing/invalid/expired session cookie yields one `{"type":"auth","ok":false,"error":"unauthenticated"}` frame then close `4401`, with no private handler invoked.
- **Keep-alive watchdog**: with pings stopped, the server closes the dead peer after `WS_PONG_TIMEOUT_MS` and clears its interval.
- **Server teardown**: on close, a `socketClose` event fires with the connection id and the ping interval is cleared.
- **Malformed frame**: a non-JSON/undecodable frame is skipped without throwing and does not block a following valid frame.
- **Fail closed**: a simulated Redis/Mongo failure on a private command returns a generic error and no internal detail.

Run the production bundle check:

```sh
npm run build
```

Run browser behavior only where a live UI is required:

```sh
RUNTIME_TEST_BASE_URL=https://127.0.0.1:3104 npm run test:runtime:browser
```

## Acceptance checklist

| Scenario | Expected result |
|---|---|
| Authenticated connect | `/ws` opens on the same origin; a `session` frame arrives; no credential in the URL. |
| Unauthenticated | Close `4401` + one `auth.ok:false` frame; no private handler runs; no private data. |
| Transient reconnect | A simulated transient close results in automatic reconnection and resumed updates with no user action. |
| No reconnect on 4401 | A 4401/auth-fail close results in zero reconnect attempts and a sign-in path. |
| Status indicator | `connecting`→`open` on connect; reconnect shows `connecting`; never blocks the dashboard. |
| Unmount cleanup | Rapid mount/unmount leaves zero orphaned sockets, intervals, or reconnect timers (`SC-007`). |
| Dispatch robustness | Mixed malformed/unregistered/valid frames: valid handlers fire, bad frames skip, later frames unaffected. |
| Backlog bound | Long stream retains at most `maxMessages` undelivered messages. |
| Generic failure | Dependency failure surfaces a generic recoverable error; no secret/exception detail leaks. |

## Manual inspection

In browser dev tools for an isolated test run:

1. Confirm the `/ws` request URL has no `token`, `jwt`, session-id, or host override.
2. Confirm a sign-out does not trigger a reconnect storm.
3. Confirm the status indicator reflects `connecting`/`open`/`closed` without pausing the dashboard.
4. Confirm that after rapid tab navigation the tab count of open sockets returns to the expected number (no leak).
