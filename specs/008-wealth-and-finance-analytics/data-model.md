# Data Model: Wealth and Finance Analytics

## Client source rows

```js
{ log: Number, timestamp: Number, data: Object }
```

A row is usable only when `timestamp` is a finite Unix-seconds value that produces a valid Date. Numeric fields must be finite after an explicit, field-specific normalization. Missing fields are omitted rather than represented as zero unless the existing chart contract defines a true count of zero for a valid bucket.

## Canonical bucket

```js
{
  key: 'YYYY-MM-DD' | 'YYYY-Www' | 'YYYY-MM',
  sortKey: Number,
  sum: Number,
  count: Number
}
```

- Day keys use `Date.toISOString().slice(0, 10)`.
- Week keys use ISO weeks beginning Monday in UTC.
- Month keys use UTC `YYYY-MM`.
- Buckets are sorted by `sortKey` before chart data is produced.

## WebSocket response envelopes

### `getNetworth`

```json
{
  "type": "getNetworth",
  "data": [{ "date": "2026-08-01T00:00:00.000Z", "value": 12345 }]
}
```

Error responses contain only `type` and a generic `error` string.

### `lastNetworth`

```json
{
  "type": "lastNetworth",
  "date": "2026-08-01T00:00:00.000Z",
  "networth": { "networthwallet": 100, "networthbank": 200 }
}
```

Only the established allow-listed net-worth part keys are returned.

### `networthInsert`

Success responses retain `ok`, `inserted`, `reason`/`message`, and existing date/value fields. Failure responses retain `type`, `ok: false`, `inserted: false`, and a generic error.

## MongoDB projections

- `Networth`: `{ _id: 0, date: 1, value: 1, money: 1 }`, normalized to `{ date, value }`.
- `Stats`: `{ _id: 0, date: 1, 'personalstats.networth': 1 }`, normalized to the established breakdown key names.

No `_id`, API key, tenant name, raw error, or unrelated document field crosses the WebSocket boundary.
