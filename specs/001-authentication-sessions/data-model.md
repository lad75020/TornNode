# Data Model: Authentication and Sessions

**Feature**: `001-authentication-sessions`
**Date**: 2026-08-06

## Registered User (MongoDB: `sessions.users`)

Existing entity. This feature reads it; it does not add registration or expose sensitive fields.

| Field | Type | Rules | Authentication use |
|---|---|---|---|
| `_id` | MongoDB ObjectId | Existing primary key | Internal record identity only. |
| `username` | string | Unique registered name; normalized only for lookup/throttle calculation | Session display identity. |
| `passkey` | bcrypt hash string | Never selected into client response, session cookie, logs, or contract payloads | Compared with bcrypt; dummy hash used if user is absent. |
| `id` | number | Unique application user identifier | Session `userId`; authorization binding. |
| `type` | string | Existing authorization type | Session `userType`; existing server authorization context. |
| `TornAPIKey` | secret string | Existing private server-only context | Session server record only; never client/log payload. |
| `email` | string | Existing optional field | Not used by this feature. |

## Authenticated Session (Redis via `connect-redis`)

The Fastify session ID is a signed opaque HttpOnly browser-session cookie and is itself Authentication Evidence; its data lives in Redis. Regenerate the ID after successful login. Destroy only this record for normal logout. The cookie deliberately has no `Max-Age` or `Expires`; Redis, not client cookie expiry, enforces rolling inactivity.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `userId` | number | yes | Must equal current user record identity. |
| `username` | string | yes | Trusted server-side display context. |
| `userType` | string | yes | Existing authorization context. |
| `TornAPIKey` | secret string | yes for existing private operations | Server-side only; never serialize to browser/logs. |
| `authenticatedAt` | epoch milliseconds | yes | Audit/timing record; does not extend automatically. |
| `lastAuthenticatedActivityAt` | epoch milliseconds | yes | Renew on every successful protected HTTP request/private WebSocket command. Invalid at plus 24h. |
| Redis TTL | seconds | yes | Exactly 86,400 seconds after successful authenticated activity. Renew independently of the browser cookie. |

**State transitions**

```text
anonymous --valid credentials--> authenticated session
authenticated --validated protected HTTP request--> authenticated session with renewed 24h Redis TTL
authenticated --validated private WebSocket command--> authenticated session with renewed 24h Redis TTL
authenticated --24h inactivity / invalid evidence / dependency failure--> denied (destroy when possible)
authenticated --logout in this browser--> destroyed session
destroyed --valid credentials--> new regenerated authenticated session
```

## Authentication Evidence (session cookie)

| Attribute | Value | Validation |
|---|---|---|
| Cookie name | Implementation-defined fixed Fastify session-cookie name, documented in the HTTP contract | Identifies one Redis-backed Fastify session. |
| Value | Signed opaque session identifier | Server validates signature and resolves Redis state; browser/client code never reads or constructs it. |
| Scope | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` | Sent only by the browser on eligible same-origin requests/upgrades. |
| Lifetime | Browser-session cookie: no `Max-Age` and no `Expires` | Browser discard ends client presentation; server-side inactivity remains the 24-hour Redis TTL. |
| Renewal | HTTP response may refresh the session cookie without adding fixed expiry; private WebSocket activity renews only `lastAuthenticatedActivityAt` and Redis TTL | Established WebSockets do not and cannot receive `Set-Cookie`. |

No JWT, bearer credential, token query parameter, passkey, Torn API key, email, or authorization payload is browser Authentication Evidence for this feature.

## Login Cooldown (Redis)

| Field | Type | Rules |
|---|---|---|
| Key namespace | `auth:failure:<scope>:<digest>` | `scope` is `account` or `network`; `<digest>` is HMAC/secret-key digest, never raw username/IP. |
| Counter | integer | Increment atomically on each credential-validation failure. |
| TTL | 900 seconds | Set atomically only when first failure creates the key; never extend merely because an already blocked request retries. |
| Threshold | 5 | Counter at five activates 15-minute cooldown for that account or network source. |
| Clear behavior | delete matching account and current network key after valid login | Never clear other network/account keys. |

## Protected Resource classification

| Resource | Class | Required state |
|---|---|---|
| `/public-bazaar` | Public | None; no private capability. |
| `/`, login UI | Public entry | None. A valid session may route to private app without revealing data to unauthenticated callers. |
| `/index.html`, `/chart`, `/chart/*`, `/memory`, `/memory/*` | Protected HTML | Valid Redis-backed session identified by the session cookie. |
| `/ws`, `/wsb` upgrade and every private command | Protected realtime | Valid Redis-backed session identified by the session cookie at upgrade and dispatch time. |
| `checkSession` WebSocket command | Auth status | Returns `session_active:false` for all invalid states; never starts private work. |
| `destroySession` WebSocket command | Current-session logout | Valid caller may destroy only its own session; invalid state yields generic unauthenticated closure. |
