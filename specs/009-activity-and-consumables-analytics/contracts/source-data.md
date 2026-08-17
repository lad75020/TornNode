# Source Data Contract: Activity and Consumables Analytics

## Local chart contract

Charts read only through asynchronous helpers from `client/src/dbLayer.js`:

- `getLogsByLogId(5410)` for revives.
- `getLogsByMultipleIds([2290, 2291])` or equivalent existing reads for Xanax activity.
- `getLogsByLogId(4103)` for Xanax receipts, retaining item ID `206` filtering.
- `getLogsByMultipleIds([2340, 2100])` for blood direction data.
- The existing medical-item scan for title-based blood/first-aid matching.
- `getLogsByLogId(9020)` plus the existing cached item catalog for acquired items.
- `getLogsByLogId(6000)` for travel duration.

A helper rejection is a safe unavailable state. A non-array or malformed row is ignored. No chart calls the live Torn API.

## Normalization contract

- Timestamps must be finite Unix seconds and produce a valid UTC date.
- Numeric fields must be finite after deliberate normalization; unsupported negative values are rejected where the existing chart represents counts/durations.
- Buckets are UTC day, ISO Monday week, or month and are sorted chronologically.
- Date bounds are inclusive ISO dates. Date-only changes derive from retained source rows.
- Empty valid input is distinct from a loading or read-error state.

## Preview contract

`JsonPreview` receives a bounded, filtered value. It may dynamically import `jsonview.js`, but asynchronous rendering must not update after unmount. Full source payloads and private item rows are not logged.

## Migration CLI contract

`computeStatsFromOldStats.js` keeps its CommonJS/yargs invocation and existing flags:

- `--source` and `--target` select collections.
- `--query` is parsed as JSON and passed to `sourceCol.find(query)`.
- `--dry-run` skips writes while retaining validation/counters.
- `MONGODB_URI` is preferred; `MONGODB_URI_TEST` is an explicit fallback for test environments.
- Every client/collection resource is closed in `finally`.
- Malformed documents increment `skipped` and do not abort valid-document processing.
