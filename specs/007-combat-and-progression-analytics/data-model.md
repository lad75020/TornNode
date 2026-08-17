# Data Model: Combat and Progression Analytics

## Client-side records

### Daily attack summary

- **Key**: `date` (`YYYY-MM-DD`)
- **Fields**: `wins`, `losses`, `attacks`, `defends` (finite non-negative counts)
- **Source**: JSON response to `getTornAttacks`
- **Validation**: date must be an ISO day; counts are normalized to non-negative finite values; invalid records do not replace a valid record for the same date.
- **Persistence**: IndexedDB `AttacksStatsDB` / `attacks_stats`.

### Gym progression point

- **Key**: source log identity plus timestamp
- **Fields**: `timestamp` (Unix seconds), one numeric post-training field among `speed_after`, `dexterity_after`, `strength_after`, `defense_after`
- **Source**: `LogsDB` / `logs`, `log` index, identifiers 5302, 5303, 5300, 5301
- **Validation**: finite timestamp and finite numeric value; convert seconds to Chart.js milliseconds only after validation.

### Crime skill observation

- **Key**: source log identity plus timestamp/crime
- **Fields**: `timestamp`, `crime` string, `skill_level` finite number
- **Source**: `LogsDB` / `logs`, `log` index, identifier 9005
- **Validation**: invalid timestamps/skills are excluded; missing crime names use the existing safe fallback label only when the skill value is valid.

### Work-stat record

- **Key**: `date` (`YYYY-MM-DD`)
- **Fields**: `manual`, `intelligence`, `endurance` numeric values; optional `abs` boolean
- **Source**: JSON `companyTrainRange` response and `WorkStatsDB` / `work_stats`
- **Semantics**: records are sorted by date. Incremental records add to the running total; an absolute record replaces the running baseline for all present dimensions. Duplicate dates replace the cache row deterministically.

### Racing position event

- **Key**: source log identity plus timestamp
- **Fields**: `timestamp` Unix seconds, `data.position` non-empty string beginning with a digit
- **Source**: `LogsDB` / `logs`, `log` index, identifier 8731
- **Semantics**: the first numeric character is converted to the plotted position; raw points are filtered by date before aggregation.

### Racing skill snapshot

- **Key**: source snapshot date
- **Fields**: `date`, `racingskill` finite number
- **Source**: authenticated `Stats` collection and `racingskill` WebSocket response
- **Validation**: retain only records with a parseable date and finite numeric skill; sort chronologically; duplicate dates do not produce duplicate plotted points.

## Shared view concepts

### Analytics date range

- Optional inclusive `dateFrom` and `dateTo` ISO days.
- A point belongs to the range when its UTC ISO day is `>= dateFrom` and `<= dateTo`.
- Reversed ranges render no points and do not trigger a destructive cache mutation.
- Earliest valid source day may be reported to the surrounding date controls through `onMinDate`.

### Local analytics cache

- Browser-only convenience storage. Cache failures are non-fatal.
- Cache reads must not block unrelated charts.
- Cache writes are idempotent by the record key and malformed input is not persisted.

## Server-side records

### Authenticated session

- `req.session.userId` identifies the tenant and must normalize to a positive safe integer.
- `req.session.TornAPIKey` is required only for Torn API calls; it is never serialized to a client response.

### Attack source document

- MongoDB per-user `attacks` collection.
- `started` is the range field; `attacker.id` determines attack versus defense relative to the authenticated user; `result === 'Lost'` determines outcome.
- The handler returns only aggregate counts and requested range.

### Stats source document

- MongoDB per-user `Stats` collection.
- `date` orders snapshots; `personalstats.racing.skill` supplies the racing-skill value.
- Server projection excludes unrelated fields and database identifiers from the response.

### Stats import request

- Normal request: authenticated session, no client payload; fetches `personalstats({ cat: 'all' })` only when no snapshot newer than 12 hours exists.
- Dry-run request: `{ dryRun: true, cat, requestId }`; returns `wsStatsTestResult` with request correlation and serializable response/error state without changing the collection.

## Invariants

1. Every client chart point is derived from a validated source record.
2. Every private handler resolves its tenant from the authenticated session, not from client-supplied user IDs.
3. A duplicate/replayed response cannot increase the number of stored records for a key.
4. Empty or unavailable data is distinguishable from a real zero-valued observation.
5. Client response payloads never contain API keys, database `_id` values, or raw internal stack traces.
