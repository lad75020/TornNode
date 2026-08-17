# Data Model: Company Analytics

## Company snapshot document

Stored in the authenticated user's MongoDB database:

```text
CompanyStock:   { timestamp: number, stocks: object|array }
CompanyProfile: { timestamp: number, company: object }
CompanyDetails: { timestamp: number, details: object }
```

- `timestamp` is persisted as Unix milliseconds by the snapshot helper.
- The database name is derived only from `req.session.userId`.
- Existing legacy stock documents may use `stock` instead of `stocks`.
- The external API key is never persisted in these documents.

## Canonical snapshot response

```json
{
  "type": "companyStock|companyProfile|companyDetails",
  "ok": true,
  "timestamp": 1730000000000,
  "reused": false,
  "inserted": true,
  "stale": false,
  "stock|profile|details": "object or array"
}
```

`reused`, `inserted`, and `stale` are optional status flags. An empty successful snapshot uses `ok: true` and an empty/null data field. Failures use a stable safe error category.

## Canonical history point

```text
Point = {
  t: Unix milliseconds,
  v: finite number,
  p?: finite number   # stock price only
}
```

History series are objects keyed by a known metric or item name. Arrays are chronological. Invalid timestamps and non-finite values are omitted.

## Stock history

```json
{
  "type": "getCompanyStockHistory",
  "ok": true,
  "series": {
    "totalInStock": [{ "t": 1730000000000, "v": 12 }],
    "items": {
      "Energy Drink": [{ "t": 1730000000000, "v": 7, "p": 25000 }]
    }
  },
  "meta": { "from": 1729000000000, "to": 1730000000000, "points": 4, "top": 5 }
}
```

## Profile/details history

```text
series: {
  metricName: Point[]
}
```

Only metrics with at least one valid point are returned. The UI may select a known metric and must handle a missing series as empty.

## Training range result

```json
{
  "type": "companyTrainRange",
  "from": 1716574650,
  "to": 1730000000,
  "data": [
    {
      "date": "2026-08-17",
      "manual": 10,
      "intelligence": 20,
      "endurance": 30,
      "trains": 1,
      "abs": false
    }
  ]
}
```

- `date` is a valid UTC `YYYY-MM-DD` key.
- Delta records accumulate working-stat gains; absolute `Stats` overlay records replace the cumulative value for that day and carry `abs: true`.
- Invalid ranges return `{ type: "companyTrainRange", ok: false, error: "invalid_range" }`.

## Request identity and invariants

- The client may supply `from`, `to`, `top`, and selected metric values, but never a database name or API key.
- Handlers must reject requests without `req.session.TornAPIKey` before external or cross-user database access.
- `from`/`to` normalization must produce finite, bounded millisecond ranges for history queries.
- `top` is an integer within the existing maximum of 50.
- All series sent to Chart.js contain finite values and stable timestamps.
