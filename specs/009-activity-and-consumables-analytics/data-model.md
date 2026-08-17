# Data Model: Activity and Consumables Analytics

## IndexedDB log row

Existing `LogsDB.logs` records are read asynchronously through `client/src/dbLayer.js`.

```js
{
  _id: string,
  log: number,
  timestamp: number, // Unix seconds; milliseconds are invalid for chart input
  ...activityFields
}
```

Rows are not rewritten by the charts. They are normalized into view-model records and discarded when required fields are absent or non-finite.

## Activity view models

### Revive event

```js
{
  timestamp: number,
  dateKey: 'YYYY-MM-DD',
  value: number
}
```

Source: log `5410`. `value` is the finite event count/value used by the existing chart semantics.

### Xanax event

```js
{
  timestamp: number,
  dateKey: 'YYYY-MM-DD',
  uses: number,
  cooldowns: number
}
```

Sources: logs `2290` and `2291`. The existing field interpretation and series names remain unchanged; only validation and bucketing are hardened.

### Xanax receipt

```js
{
  timestamp: number,
  dateKey: 'YYYY-MM-DD',
  quantity: number,
  itemId: 206
}
```

Source: log `4103`. Only the supported Xanax item (`206`) with finite quantity is included.

### Blood event

```js
{
  timestamp: number,
  dateKey: 'YYYY-MM-DD',
  direction: 'deposit' | 'withdrawal',
  amount: number
}
```

Sources: logs `2340` and `2100`. Deposit and withdrawal data are kept separate so a source-direction mix-up cannot silently change totals.

### Medical-aid event

```js
{
  timestamp: number,
  dateKey: 'YYYY-MM-DD',
  title: string,
  quantity: number
}
```

Source: the existing medical-item scan. Matching remains case-insensitive for blood/first-aid titles. Unrelated titles and invalid quantities are excluded.

### Acquired item

```js
{
  timestamp: number,
  dateKey: 'YYYY-MM-DD',
  itemId: number | string,
  quantity: number,
  unitPrice: number | null,
  totalValue: number
}
```

Source: log `9020` and cached item catalog. Missing or invalid prices produce a finite zero contribution only for the value calculation; the quantity event remains available when the existing UI supports it. No `NaN` or infinity is emitted.

### Travel event

```js
{
  timestamp: number,
  dateKey: 'YYYY-MM-DD',
  durationSeconds: number,
  durationMinutes: number
}
```

Source: log `6000`. The existing minutes representation is preserved while invalid durations are excluded.

## Bucket model

```js
{
  key: string, // UTC day, ISO week, or month key
  label: string,
  startTimestamp: number,
  endTimestamp: number,
  count: number,
  sum: number,
  rows: Array<object>
}
```

Buckets are created by shared UTC helpers, sorted by key, and filtered inclusively by the selected ISO date bounds. Bucket modal rows are bounded before being passed to `JsonPreview`.

## Preview model

`JsonPreview` receives an already filtered payload. Arrays are capped at the existing preview limit (1500 items) and nested values are transformed into safe render data. The original payload is never written to `console.log`.

## Migration result model

The CLI maintains operational counters rather than exposing documents:

```js
{
  scanned: number,
  updated: number,
  skipped: number,
  dryRun: boolean
}
```

Malformed source documents are counted as skipped. Connection strings, tenant identifiers, and raw stack traces are not included in user-facing output.
