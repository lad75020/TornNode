# WebSocket Contract: Item Catalog

## Authentication Boundary

The existing `/ws` WebSocket route authenticates the session before dispatching private messages. `wsGetAllTornItems` also checks for a usable authenticated session before selecting the shared `TORN` database. Unauthenticated requests receive a safe failure envelope and no catalog data.

## Request

```json
{
  "type": "getAllTornItems"
}
```

No user-supplied database, tenant, or credential fields are accepted for this request.

## Success Response

```json
{
  "type": "getAllTornItems",
  "ok": true,
  "items": [
    {
      "id": 1234,
      "name": "Example item",
      "type": "Candy",
      "price": 2500,
      "img64": "",
      "description": "Example description"
    }
  ]
}
```

The `items` array is non-empty and every record contains a valid stable identifier, string `name`, finite non-negative numeric `price`, string `img64`, and string `description`. `type` is optional.

The server first attempts a complete RedisJSON catalog using keys `tornItems:v2:<id>`. If any discovered cache record is missing, malformed, or incomplete, the entire cache read is discarded and MongoDB `TORN.Items` is used as the authoritative fallback. A complete fallback can repopulate Redis with the existing 24-hour per-item TTL.

## Failure Response

```json
{
  "type": "getAllTornItems",
  "ok": false,
  "error": "Item catalog could not be loaded. Please retry."
}
```

The failure response is used for invalid authentication, unavailable data sources, invalid/incomplete authoritative data, and internal catalog errors. Internal exception messages, session identifiers, API keys, and database details are not sent to the client.

## Client Commit Rules

The client reads IndexedDB before requesting. It requests only when the local snapshot is absent or its `itemsLastSync` marker is older than ten minutes. A successful response is committed atomically; the marker is written only after the commit. Invalid, empty, or failed commits preserve the last valid snapshot.
