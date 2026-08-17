# WebSocket Contract: Wealth and Finance Analytics

All commands use the existing authenticated `/ws` connection and existing dispatcher. No client-supplied tenant identifier is accepted.

## `getNetworth`

Request: `getNetworth`

Success:

```json
{
  "type": "getNetworth",
  "data": [
    { "date": "2026-08-01T00:00:00.000Z", "value": 12345 }
  ]
}
```

Error:

```json
{ "type": "getNetworth", "error": "Networth could not be loaded. Please retry." }
```

## `lastNetworth`

Request: `lastNetworth`

Success:

```json
{
  "type": "lastNetworth",
  "date": "2026-08-01T00:00:00.000Z",
  "networth": { "networthwallet": 100, "networthbank": 200 }
}
```

Error:

```json
{ "type": "lastNetworth", "error": "Latest networth could not be loaded. Please retry." }
```

## `networthInsert`

The scheduled/manual command retains the existing `networthInsert` envelope and 12-hour `recentEntryExists` response. Invalid sessions, API failures, and database failures use:

```json
{
  "type": "networthInsert",
  "ok": false,
  "inserted": false,
  "error": "Networth could not be refreshed. Please retry."
}
```

Success responses may contain only `type`, `ok`, `inserted`, `reason`, `message`, `lastDate`, `date`, `value`, and `time` fields already used by the client. API keys, MongoDB IDs, raw exception text, and stack traces are forbidden.
