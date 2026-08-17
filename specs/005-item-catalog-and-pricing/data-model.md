# Data Model: Item Catalog and Pricing

## Item

The shared catalog record consumed by the Item Prices view and persisted in MongoDB, RedisJSON, and IndexedDB.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | safe integer or canonical numeric string | yes | Must identify one positive Torn item; malformed prefixes and empty strings are rejected. |
| `name` | string | yes | Display name used for case-insensitive prefix search. |
| `type` | string | no | Optional category; blank/whitespace values are ignored by the type filter. |
| `price` | finite non-negative number | yes | Stored current price; zero is valid. Invalid numeric values are rejected. |
| `img64` | string | yes | Image representation consumed by the existing data-URL preview. Empty string is allowed. |
| `description` | string | yes | Tooltip/details text; empty string is allowed. |

The server's complete-record validation requires the stable identifier, `name`, `price`, `img64`, and `description`. `type` remains optional because the existing shared cache field list does not require it; the client only presents non-empty type values.

## Item Catalog

A non-empty array of complete `Item` records returned by `getAllTornItems`. The server may source it from:

1. RedisJSON keys matching `tornItems:v2:*` when every discovered key parses as a complete record.
2. MongoDB database `TORN`, collection `Items`, when the cache is missing, unreadable, incomplete, or invalid.

An authoritative response containing an invalid or empty catalog is a safe failure, not a successful empty catalog.

## Local Catalog Snapshot

The last successfully committed catalog in IndexedDB:

- Database: `ItemsDB`
- Object store: `items`
- Key path: `id`
- Replacement: one read/write transaction clears the old store and writes the complete incoming catalog.
- Retention: malformed, empty, or failed replacement leaves the previous snapshot untouched.

A price update rewrites the existing valid snapshot only after receiving a successful update response with a valid identifier and price. If the identified local row is absent, the response does not fabricate one.

## Catalog Synchronization Marker

`localStorage.itemsLastSync` stores the client timestamp of the most recent successful IndexedDB catalog commit.

- Missing, unreadable, non-finite, or non-positive marker: local catalog is considered stale.
- Age greater than ten minutes: local catalog is stale.
- Age at or below ten minutes: local catalog is fresh.
- Marker is written only after the IndexedDB transaction completes successfully.
- A successful marker write triggers the existing cross-tab `storage` event; listeners reload the local snapshot rather than polling.

## Price Refresh Request

WebSocket request envelope:

```json
{
  "type": "updatePrice",
  "id": 1234,
  "price": 2500
}
```

`price` is optional. If omitted, the server obtains a current price from the authorized market source. If present, it must be a finite non-negative number; invalid supplied values fail rather than silently falling back.

## Price Refresh Result

Successful result:

```json
{
  "type": "updatePrice",
  "ok": true,
  "id": 1234,
  "price": 2500,
  "cache": "json"
}
```

Failure result:

```json
{
  "type": "updatePrice",
  "ok": false,
  "error": "Item price could not be updated. Please retry."
}
```

A success result implies that the item existed and the resulting price was validated and persisted to MongoDB. RedisJSON and variation logging remain best-effort after the durable update; cache status is diagnostic and never changes a valid MongoDB success into a null-price success.

## State Transitions

### Catalog synchronization

```text
missing/stale local snapshot
  -> request getAllTornItems
  -> complete response
  -> atomic IndexedDB commit
  -> itemsLastSync written
  -> current tab and other tabs display committed snapshot

missing/stale local snapshot
  -> invalid/empty/error response or failed commit
  -> preserve previous snapshot and marker
  -> show safe retry/error state
```

### Price refresh

```text
idle row
  -> request updatePrice
  -> valid durable success
  -> update visible row and local snapshot

idle row
  -> invalid id/price, missing market price, missing item, or persistence failure
  -> preserve previous price
  -> show safe failure state
```
