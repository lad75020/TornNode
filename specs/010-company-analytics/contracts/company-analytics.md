# WebSocket Contracts: Company Analytics

All messages use the existing authenticated WebSocket connection. The client never sends an API key or database name.

## Current snapshots

### Requests

```json
{ "type": "companyStock" }
{ "type": "companyProfile" }
{ "type": "companyDetails", "force": false }
```

### Success

```json
{
  "type": "companyStock",
  "ok": true,
  "stock": {},
  "timestamp": 1730000000000,
  "reused": true,
  "inserted": false,
  "stale": false
}
```

The response type and data field are `companyProfile`/`profile` and `companyDetails`/`details` for the other snapshots.

### Safe failure

```json
{ "type": "companyStock", "ok": false, "error": "unauthorized" }
```

Operational failures use a stable generic category such as `snapshot_unavailable`; API keys, full URLs, and raw exception text are not sent.

## History

### Requests

```json
{ "type": "getCompanyStockHistory", "from": 1729000000, "to": 1730000000, "top": 5 }
{ "type": "getCompanyProfileHistory", "from": 1729000000000, "to": 1730000000000 }
{ "type": "getCompanyDetailsHistory", "from": 1729000000000, "to": 1730000000000 }
```

`from` and `to` may be seconds or milliseconds. Omitted values use the handler's bounded default. `top` is clamped to the supported integer range.

### Successful empty result

```json
{
  "type": "getCompanyProfileHistory",
  "ok": true,
  "series": {},
  "lastTimestamp": null,
  "metricsRank": [],
  "meta": { "from": null, "to": null }
}
```

### Successful result

The response contains `series` with canonical `{t, v}` points, optional `lastTimestamp`, and bounded `meta`. Stock item points may also include `p`.

### Safe failure

```json
{ "type": "getCompanyDetailsHistory", "ok": false, "error": "history_unavailable" }
```

## Training range

### Request

```json
{ "type": "companyTrainRange", "from": 1716574650, "to": 1730000000 }
```

Both fields are required finite Unix timestamps and `from` must be strictly less than `to`.

### Success

```json
{
  "type": "companyTrainRange",
  "ok": true,
  "from": 1716574650,
  "to": 1730000000,
  "data": []
}
```

### Validation failure

```json
{ "type": "companyTrainRange", "ok": false, "error": "invalid_range" }
```

### Server failure

```json
{ "type": "companyTrainRange", "ok": false, "error": "training_range_unavailable" }
```

## Client handling rules

- Match a response to the active request fingerprint/type before applying it.
- Treat `ok: true` with empty series/data as an empty state, not an error.
- Clear loading on every accepted success or safe failure.
- Ignore malformed JSON, missing `type`, unknown metrics, and non-finite points.
- Display generic user-facing errors only; operational details remain server-side.
