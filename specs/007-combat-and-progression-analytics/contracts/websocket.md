# WebSocket Contracts: Combat and Progression Analytics

All messages below travel over the existing authenticated `/ws` connection. The client must treat unknown messages as unrelated bus traffic and ignore malformed JSON.

## `getTornAttacks`

### Request

```json
{"type":"getTornAttacks","from":1716574650,"to":1716661050}
```

- `from` and `to` are optional integer Unix-second bounds only when the existing helper supplies defaults; when present they must be non-negative safe integers and `from <= to`.
- Client-supplied user identifiers are ignored.

### Success

```json
{"type":"getTornAttacks","from":1716574650,"to":1716661050,"wins":2,"losses":1,"attacks":2,"defends":1}
```

Counts are finite non-negative integers. The response contains no source documents or database identifiers.

### Failure

```json
{"type":"getTornAttacks","error":"Attack retrieval could not be completed. Please retry."}
```

Invalid sessions and ranges use the existing safe error vocabulary. Internal database details are logged server-side only.

## `racingskill`

### Request

```text
racingskill
```

### Success

```json
{"type":"racingskill","data":[{"date":"2026-08-01T00:00:00.000Z","racingskill":1234.5}]}
```

`data` contains only dated observations with finite numeric `racingskill`, sorted ascending by date. `_id` and unrelated `Stats` fields are excluded.

### Failure

```json
{"type":"racingskill","error":"Racing skill could not be loaded. Please retry."}
```

The same envelope is used for an invalid session and a server/database failure, with the stable existing invalid-session error used when applicable.

## `stats`

### Request

```text
stats
```

### Normal success: new snapshot

```json
{"type":"statsInsert","ok":true,"inserted":true,"date":"2026-08-17T21:00:00.000Z","message":"Stats inserted successfully","time":0}
```

`time: 0` is illustrative; the runtime supplies the current Unix-millisecond timestamp. A recent snapshot returns `ok: true`, `inserted: false`, `reason: "recentEntryExists"`, and `lastDate`.

### Normal failure

```json
{"type":"statsInsert","ok":false,"inserted":false,"error":"Statistics could not be refreshed. Please retry.","time":0}
```

The error is generic; credentials and raw upstream exception messages are not returned.

### Dry-run request

```json
{"type":"wsStatsTest","cat":"all","requestId":"probe-1"}
```

### Dry-run success

```json
{"type":"wsStatsTestResult","ok":true,"requestId":"probe-1","cat":"all","response":{}}
```

### Dry-run failure

```json
{"type":"wsStatsTestResult","ok":false,"requestId":"probe-1","cat":"all","error":"Statistics test could not be completed. Please retry."}
```

The response preserves `requestId` and `cat` correlation but uses a safe error string.

## Client processing rules

- Process only the relevant `type` and validate the payload before cache writes or chart state updates.
- A response for a prior request may arrive after a newer response; record-key deduplication and request/range correlation prevent duplicate points.
- Empty `data` is a valid empty result, not an error. A malformed `data` field is ignored and must not erase a last valid cache unless the user explicitly refreshes an empty source.
- Socket send failures are non-fatal; timers and async effects are cleaned up when a chart unmounts or inputs change.
