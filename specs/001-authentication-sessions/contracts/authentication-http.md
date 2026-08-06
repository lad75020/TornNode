# HTTP Contract: Authentication and Protected Pages

**Feature**: `001-authentication-sessions`
**Version**: 1.0 planned contract

## Common rules

- All JSON is UTF-8 `application/json`.
- Authentication failures never identify the failed condition, account existence, cooldown state, secret, hash, session, Redis, MongoDB, or stack trace.
- Authentication/login/logout responses and protected HTML include `Cache-Control: no-store, private, max-age=0`, `Pragma: no-cache`, and `Expires: 0`.
- The signed opaque Fastify session cookie is the sole browser Authentication Evidence. It uses `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`, with no `Max-Age` or `Expires`; tests use the explicit test-mode transport policy only.
- The client must not read, create, persist, or send a JWT or bearer credential manually. It uses `credentials: 'include'` on same-origin `fetch`.

## POST `/authenticate`

Establishes an authenticated Redis-backed session for a registered user.

### Request

```http
POST /authenticate HTTP/1.1
Content-Type: application/json

{"username":"string","passkey":"string"}
```

`username` and `passkey` are required non-empty strings after trimming only for validation. Oversize/non-string inputs are treated as denied credentials; no coercion occurs.

### Success — 200

```json
{"success":true}
```

The server regenerates the session ID, stores authenticated server-side state with a Redis TTL of exactly 86,400 seconds, sends the one session cookie, and clears the successful account/current-network failure records.

### Credential denial or active cooldown — 401

```json
{"success":false,"message":"Invalid username or passkey"}
```

This exact generic body is used for unknown user, incorrect passkey, malformed credential input, and cooldown. It does not disclose retry time or account state.

### Dependency/service failure — 503

```json
{"success":false,"message":"Authentication is temporarily unavailable. Please try again."}
```

No session cookie is issued. The service logs a sanitized server-side event.

## POST `/logout` (HTTP companion endpoint)

Implementation adds this endpoint if the UI needs reliable request/response logout; the existing `destroySession` WebSocket command remains compatible and follows the WebSocket contract.

### Success — 204

Destroys only the session selected by the request's session cookie and clears that cookie with `Max-Age=0`. It must be idempotent: absent/expired cookies still receive a clearing cookie and no private state.

### Session store failure — 503

```json
{"success":false,"message":"Sign-out could not be completed. Please try again."}
```

The client immediately closes sockets and removes private UI state; server-side retry remains possible. No other browser's session is affected.

## Protected SPA routes

| Method/path | Valid state | Missing/invalid/expired/destroyed/unverifiable state |
|---|---|---|
| `GET /index.html` | `200` SPA HTML with no-store headers | `302 Location: /` with no-store headers; no private HTML body. |
| `GET /chart`, `/chart/*` | `200` SPA HTML with no-store headers | `302 Location: /` with no-store headers. |
| `GET /memory`, `/memory/*` | `200` SPA HTML with no-store headers | `302 Location: /` with no-store headers. |
| `GET /public-bazaar` | `200` public SPA HTML with no-store headers | Always `200`; does not issue/grant private state. |

Every accepted protected request renews `lastAuthenticatedActivityAt` and the Redis TTL to exactly 86,400 seconds. The response may refresh the browser-session cookie without adding `Max-Age`/`Expires`. Validation failure does not renew state.
