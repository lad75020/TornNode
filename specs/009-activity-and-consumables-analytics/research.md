# Research Notes: Activity and Consumables Analytics

## Existing architecture

- The dashboard is a React 19/Vite application with lazy-loaded Chart.js components. The existing component props and route entries in `client/src/main.jsx` are part of the compatibility surface.
- Torn logs are synchronized into the authenticated user’s `LogsDB` IndexedDB database. `client/src/dbLayer.js` already provides asynchronous `getLogsByLogId`, `getLogsByMultipleIds`, `getLogsByTimestampRange`, and cache invalidation helpers.
- `client/src/financeAnalytics.js` introduced during the preceding finance feature provides finite-number and Unix-second normalization plus deterministic UTC bucket/filter helpers. Activity charts should reuse it rather than create a second date implementation.
- The repository has no React component test runner. Focused tests therefore combine Node source/contract assertions, migration CLI checks, and the production Vite build; browser behavior remains bounded by the shared pure helper contracts and static source checks.

## Source mapping

| Chart/utility | Source | Existing behavior to preserve |
|---|---|---|
| `LogsGraph` | log `5410` | revive activity, day/week/month controls |
| `XanaxBarGraph` | logs `2290`, `2291` | use/cooldown series and bucket modal |
| `XanaxReceivedChart` | log `4103` | Xanax item filtering and receipt quantity |
| `BloodCountGraph` | logs `2340`, `2100` | deposit/withdrawal comparison |
| `BloodAidDailyChart` | medical-item log scan | title-based blood/first-aid matching |
| `ItemsGainedGraph` | log `9020` plus cached catalog | quantity/value bars and bucket modal |
| `TravelDurationGraph` | log `6000` | duration-to-minutes representation |
| `JsonPreview`/`jsonview.js` | selected bucket payload | bounded preview, filtering, truncation |
| `computeStatsFromOldStats` | Mongo source/destination collections | query option, upsert/dry-run migration |

## Decisions

### Normalize at the data boundary

Each chart should normalize the rows immediately after the IndexedDB read. Invalid timestamps and values are discarded before bucketing. This avoids rendering `NaN`, makes empty-state behavior meaningful, and keeps aggregation functions deterministic.

### UTC-only bucket keys

`toLocaleDateString()` is unsuitable for persisted analytical keys because the result changes with browser locale and timezone. Use the shared UTC day/week/month helpers and ISO labels. ISO week buckets use Monday as the week start.

### Retain source rows while filtering

Effects that destructively filter already-aggregated React state can lose data when a user broadens the range. Keep normalized source rows in state (or recompute from the complete source set) and derive the displayed buckets from the current controls.

### Async cancellation and safe UI errors

IndexedDB and dynamic imports are asynchronous. Every effect that can outlive a component needs a cancellation guard and a visible, generic error state. Operational details may be logged only in server/CLI contexts, never as raw browser payloads.

### Migration safety

The migration utility is a maintenance CLI, not a request handler. It should preserve its CommonJS/yargs interface, pass the parsed query to `find(query)`, accept `MONGODB_URI_TEST` when the primary URI is absent, skip malformed source documents, and close both client and collections through `finally`.

## Alternatives rejected

- **New backend activity WebSocket handlers**: rejected because all queued activity data already exists in local IndexedDB and adding a transport would expand the authenticated API surface unnecessarily.
- **New chart/date library**: rejected because Chart.js and the shared helper cover the existing dashboard and a dependency would increase bundle and maintenance cost.
- **Locale-based date keys**: rejected because analytics must be reproducible across user locales and timezones.
- **Coercing invalid values to zero**: rejected because it hides data quality problems and produces misleading charts.
- **Logging full JSON previews**: rejected because payloads may contain private Torn data and large console strings can degrade browser performance.
