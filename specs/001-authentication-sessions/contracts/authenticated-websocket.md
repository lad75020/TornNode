# WebSocket Contract: Authenticated Realtime Access

**Feature**: `001-authentication-sessions`
**Version**: 1.0 planned contract

## Endpoints and handshake

| Endpoint | Authentication | Requirement |
|---|---|---|
| `GET /ws` upgrade | Required | Browser sends the signed opaque HttpOnly session cookie automatically on same-origin upgrade. No JWT, bearer credential, or authentication query parameter is supported. |
| `GET /wsb` upgrade | Required | Same session-cookie requirement; it remains limited to existing bazaar behavior. |

The server validates the signed session cookie, session existence, Redis TTL/activity time, and current registered-user context before allowing private work. It must not emit `newSocket`, create user DB structures, schedule work, or call a private handler before validation succeeds.

Invalid upgrade behavior is fixed: send one text frame `{"type":"auth","ok":false,"error":"unauthenticated"}`, then close code `4401` with reason `unauthenticated`.

No token, expiry, missing-cookie, store, or account detail is sent to the client.

## Client rules

- Build the URL as `ws(s)://<same-origin-host>/ws` or `/wsb`; never append a session ID, JWT, bearer token, username, or other credential query parameter.
- On close code `4401` or `auth.ok === false`, stop reconnecting private sockets, clear private UI state, and route to sign-in.
- A client sends no private command until socket open and authenticated acknowledgement/status is received.

## Command rules

| Command | Valid session behavior | Invalid/expired/destroyed/dependency-failed behavior |
|---|---|---|
| `checkSession` | Send `{"session_active":true}` and renew server-side activity/Redis TTL. | Send `{"session_active":false}` then close `4401`; no private work. |
| `destroySession` | Destroy only this browser's Redis session, send `{"type":"logout","ok":true}`, then close current sockets. It does not clear HTTP cookies; browser UI logout uses `POST /logout` for that. | Send generic unauthenticated outcome and close; never affect another session. |
| Existing private text/JSON commands (`torn`, `tornAttacks`, `networth`, `stats`, retrieval, price update, etc.) | Revalidate state, renew server-side activity/Redis TTL, then dispatch to existing handler. | Send generic unauthenticated outcome and close; do not invoke handler. |
| Unknown command | Preserve existing non-private unknown-command behavior only after authentication succeeds. | Same unauthenticated close; do not reveal command handling. |

## Activity and logout race

- Every successful private command renews `lastAuthenticatedActivityAt` and the Redis TTL to exactly 86,400 seconds.
- An established WebSocket does not and cannot receive `Set-Cookie`; it never rolls a cookie or cookie `Max-Age`. The session cookie is a browser-session cookie with no `Max-Age`/`Expires`, so websocket-only authenticated activity remains governed by Redis state rather than a client-side fixed expiry.
- When logout is accepted, the session is destroyed before acknowledgement. Commands received after destroy begins or completes must fail authorization and cannot invoke private operations.
- A second browser with a different valid session cookie for the same user remains authorized.
