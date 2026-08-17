# WebSocket Contract: Torn Data Synchronization

The following messages preserve the existing application protocol. JSON is encoded as a WebSocket text message. Private requests are accepted only after the existing socket-session validation succeeds; handlers must also fail closed when invoked directly without a valid session.

## Session and ownership

- `req.session.userId` is the only tenant selector.
- `req.session.TornAPIKey` is read only by server-side Torn API handlers.
- No request field may override either value.
- Error payloads must not include credentials, raw session objects, or sensitive profile fields.

## Long-running log import

### Request

Existing string command:

```text
torn
```

The server chooses the resume range from the user's latest stored log unless an internal/supported implementation path supplies an explicit validated range.

### Progress

```json
{
  "type": "importProgress",
  "kind": "logs",
  "percent": 42.5,
  "currentTs": 1716575550,
  "startTs": 1716574650,
  "endTs": 1717000000,
  "inserted": 120
}
```

`percent` is clamped to 0..100. `inserted` counts successful durable inserts, not attempted records.

### Completion

```json
{
  "type": "importedData",
  "logsImported": 120
}
```

An up-to-date import may return `logsImported: 0` plus an optional `note: "up-to-date"`.

### Stopped/error

```json
{ "type": "importStopped", "kind": "logs" }
```

```json
{
  "type": "importProgress",
  "kind": "logs",
  "error": "Log synchronization could not be completed. Please retry."
}
```

The implementation may include an internal diagnostic log, but client-visible errors remain generic.

## Long-running attack import

### Request

Existing string command:

```text
tornAttacks
```

If the existing router defers the command while logs are running, the deferred state must terminate when the log import completes, stops, or fails.

### Progress and completion

```json
{
  "type": "importProgress",
  "kind": "attacks",
  "percent": 100,
  "currentTs": 1717000000,
  "startTs": 1716757478,
  "endTs": 1717000000
}
```

```json
{
  "type": "importedData",
  "attacksImported": 18
}
```

### Stop request

```json
{
  "type": "stopImport",
  "kinds": ["logs", "attacks"]
}
```

The server may acknowledge the request with the existing `stopImportAck`; the importer emits `importStopped` at its next safe cancellation point.

## Stream stored logs to the browser

### Request

```json
{
  "type": "getAllTornLogs",
  "from": 1716574650,
  "to": 1717000000,
  "batchSize": 500,
  "requestId": "logs-sync-abc123"
}
```

`from` and `to` are Unix seconds. `batchSize` is clamped to a safe server range. `requestId` is opaque and returned unchanged.

### Start

```json
{
  "type": "getAllTornLogs",
  "phase": "start",
  "from": 1716574650,
  "to": 1717000000,
  "total": 12000,
  "batchSize": 500,
  "requestId": "logs-sync-abc123"
}
```

### Batch

```json
{
  "type": "getAllTornLogs",
  "phase": "batch",
  "batch": [{ "_id": "source-id", "timestamp": 1716574650, "log": 123 }],
  "sent": 500,
  "total": 12000,
  "requestId": "logs-sync-abc123"
}
```

Batches are chronological and contain only the documented analysis fields. The client advances progress only after the local transaction succeeds.

### End

```json
{
  "type": "getAllTornLogs",
  "phase": "end",
  "sent": 12000,
  "total": 12000,
  "requestId": "logs-sync-abc123"
}
```

### Rejection/error

```json
{
  "type": "getAllTornLogs",
  "ok": false,
  "error": "Log retrieval could not be completed. Please retry.",
  "requestId": "logs-sync-abc123"
}
```

An active duplicate request returns the existing machine-readable `already_running` reason; a recent completed request may return `cooldown` without starting another stream.

## Get stored attack aggregates

### Request

```json
{
  "type": "getTornAttacks",
  "from": 1716574650,
  "to": 1717000000
}
```

### Response

```json
{
  "type": "getTornAttacks",
  "from": 1716574650,
  "to": 1717000000,
  "wins": 12,
  "losses": 4,
  "attacks": 10,
  "defends": 6
}
```

Invalid ranges and missing sessions produce a safe error response without selecting a user store.

## Get the item catalog

### Request

```json
{ "type": "getAllTornItems" }
```

### Success

```json
{
  "type": "getAllTornItems",
  "ok": true,
  "items": [
    { "id": 1, "name": "Example", "price": 10, "img64": "...", "description": "..." }
  ]
}
```

### Error

```json
{
  "type": "getAllTornItems",
  "ok": false,
  "error": "Item catalog could not be loaded. Please retry."
}
```

A complete server cache is preferred. Missing/incomplete cache data is rebuilt from the authoritative catalog before success is emitted; the browser must not replace a last-known-good catalog with an error or partial response.
