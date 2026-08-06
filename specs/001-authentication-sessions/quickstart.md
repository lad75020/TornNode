# Quickstart: Validate Authentication and Sessions

This guide validates the planned feature in isolated test mode. It is a verification guide, not an implementation procedure and must never use production accounts, passkeys, API keys, URLs, cookies, or Redis/Mongo databases.

## Prerequisites

1. Start isolated MongoDB and Redis test services configured by test-only environment variables.
2. Set non-production values for `MONGODB_URI_TEST`, `REDIS_URL_TEST`/test Redis port, `SESSION_SECRET`, cooldown-digest secret, and the explicit test origin.
3. Seed one test user whose passkey is bcrypt-hashed and whose Torn context is synthetic/non-secret.
4. Run the Fastify app in its test mode on a local HTTPS-capable origin compatible with the configured test cookie policy.

The test process accepts only loopback MongoDB and Redis URLs in `--test` mode. Set `AUTH_TEST_BASE_URL` only to that isolated Fastify origin before browser testing; do not point these variables at deployment infrastructure.

## Automated validation

Run the Node built-in suite after implementation:

```sh
npm run test:auth
```

Run browser behavior tests after the test server is reachable:

```sh
AUTH_TEST_BASE_URL=https://127.0.0.1:3104 npm run test:auth:browser
```

Run the production bundle check:

```sh
npm run build
```

Expected: all commands exit `0`; no test output includes credentials, Torn keys, cookie values, or real endpoints.

## Acceptance checklist

| Scenario | Expected result |
|---|---|
| Valid login | `POST /authenticate` returns `200 {"success":true}` and issues one signed opaque HttpOnly browser-session cookie. The app enters private UI without `localStorage.jwt`. |
| Invalid/unknown login | `401` generic `Invalid username or passkey`; bodies are identical; no cookie grants access. |
| Duplicate form submission | While the login request is pending, submit is disabled and one request is observed. |
| Cooldown by account | Five failures for the same account across test network sources cause the sixth attempt to return the generic denial for 900 seconds. |
| Cooldown by network | Five failures from the same test source across accounts cause the sixth to return the same generic denial for 900 seconds. |
| Cooldown release | Advance/inject test time beyond 900 seconds; valid credentials authenticate. |
| Rolling expiry | Private HTTP or WebSocket activity at 23:59 renews `lastAuthenticatedActivityAt` and Redis TTL to exactly 24 hours from that activity. The session cookie has no `Max-Age`/`Expires`; established WebSocket activity does not receive `Set-Cookie`. At 24:00 inactivity, protected access fails. |
| Protected HTTP | Signed-out direct `/index.html`, `/chart/0`, and `/memory` requests redirect to `/` with no-store headers and no private HTML. |
| Public market | Signed-out `/public-bazaar` is `200` and does not establish authentication. |
| WebSocket | A valid session cookie opens `/ws`; missing, malformed, expired, destroyed, or dependency-failed state is rejected/closed before any private command handler runs. URL has no authentication token query. |
| Logout isolation | Log in two independent browser contexts. Log out context A. A cannot use protected pages/new or existing sockets; B remains authenticated. |
| Accessibility | Login labels associate inputs, errors are announced, controls are keyboard-operable, and pending state is communicated. |

## Manual security inspection

In browser developer tools for an isolated test run:

1. Confirm neither `localStorage` nor `sessionStorage` contains a JWT or other browser authentication credential.
2. Confirm `/ws` and `/wsb` request URLs do not contain `token`, `jwt`, session ID, username, or passkey query values.
3. Confirm exactly one authentication cookie is signed, opaque, HttpOnly, and unreadable via `document.cookie`; production-compatible runs also show `Secure` and `SameSite=Lax`, and it has no `Max-Age` or `Expires`.
4. Confirm login and protected responses include the specified no-store cache headers.
5. Confirm browser-visible errors never contain MongoDB, Redis, bcrypt, session, stack-trace, or account-existence text.
