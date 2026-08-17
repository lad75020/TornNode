# WebSocket Contract: Item Price Refresh

## Authentication Boundary

The existing authenticated `/ws` route dispatches `updatePrice`. The handler uses the authenticated request session for the market API key when a server-side price lookup is required. Existing WebSocket authorization and session renewal behavior are unchanged.

## Request

Supplied-price form:

```json
{
  "type": "updatePrice",
  "id": 1234,
  "price": 2500
}
```

Market-refresh form:

```json
{
  "type": "updatePrice",
  "id": 1234
}
```

Rules:

- `id` must be a positive safe integer or an unambiguous numeric string.
- A supplied `price` must be a finite non-negative number. Invalid supplied values fail; they are not silently coerced or treated as a missing price.
- When `price` is omitted, the handler obtains and validates the first current market price from the authorized Torn source.
- The target item must exist in `TORN.Items` before persistence.

## Success Response

```json
{
  "type": "updatePrice",
  "ok": true,
  "id": 1234,
  "price": 2500,
  "cache": "json"
}
```

`price` is always a finite non-negative number on success. MongoDB is updated first. RedisJSON refresh and daily variation logging remain best-effort and may report `cache: "miss-json"` without invalidating the durable result.

## Failure Response

```json
{
  "type": "updatePrice",
  "ok": false,
  "error": "Item price could not be updated. Please retry."
}
```

Invalid identifiers, invalid prices, unavailable market prices, missing target items, MongoDB failures, and other internal failures use the safe failure response. Internal error messages and credentials are logged server-side only.

## Client Handling

The client applies a successful update only when `ok` is true, the identifier matches an existing local row after safe normalization, and `price` is finite and non-negative. It then rewrites the valid local snapshot. Failure responses leave the previous visible and local prices unchanged and expose a safe retry/error state.
