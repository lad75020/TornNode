# Data Model: Torn Data Synchronization

## Profile Sync Context

The authenticated server-side context that authorizes a synchronization.

| Field | Type | Required | Invariant |
|---|---|---:|---|
| `userId` | integer | yes | Derived from the authenticated session; never accepted from the client as an authority field |
| `TornAPIKey` | secret string | yes for Torn imports | Server-only; never serialized into a client message or ordinary log |
| `databaseName` | string | derived | Canonical trimmed representation of `userId` used by the existing user database helper |

## Torn Log Record

A normalized activity record stored in the authenticated user's `logs` collection and optionally retained in `LogsDB.logs`.

| Field | Type | Required | Invariant |
|---|---|---:|---|
| `_id` | stable source id | yes | Derived from the Torn record id; duplicate source ids are not inserted twice |
| `timestamp` | integer Unix seconds | yes | Valid numeric event time; used for resume checkpoints and ordered retrieval |
| `date` | date | derived | Normalized from `timestamp` for server-side consumers |
| `log` | integer | normalized | Uses the source log code/details id |
| `title` | string | optional | Normalized from source details when present |
| `category` | string/number | optional | Preserved when present |
| `data` | object | optional | Domain payload; item names may be enriched without changing source identity |
| `items_names` | string[] | optional | Deduplicated enrichment for item-gain events |

**Indexes/queries**: descending `timestamp` for checkpoint lookup; `log` and `timestamp` access paths for local/server analysis. The stable `_id` provides duplicate safety.

## Torn Attack Record

A normalized attack record stored in the authenticated user's `attacks` collection.

| Field | Type | Required | Invariant |
|---|---|---:|---|
| `code` | stable attack code | yes | Unique source identity; duplicate source codes are not counted/imported twice |
| `started` | integer Unix seconds | yes | Used for range filtering |
| `ended` | integer Unix seconds | yes | Used for resume checkpoint and display |
| `date_started` | date | derived | Normalized from `started` |
| `date_ended` | date | derived | Normalized from `ended` |
| `attacker` | object | optional | Contains source participant identity when supplied |
| `result` | string | optional | Used by aggregate wins/losses calculations |

**Indexes/queries**: descending `ended` for checkpoint lookup; `started` for bounded analytics; stable `code` for duplicate-safe writes.

## Item Catalog Record

A shared reference item returned by the authoritative catalog or the server cache and stored in `ItemsDB.items`.

| Field | Type | Required | Invariant |
|---|---|---:|---|
| `id` | integer/string identifier | yes | Stable IndexedDB key and cache-key suffix |
| `name` | string | yes | Required for search and log enrichment |
| `price` | number | yes by current cache contract | Preserve the authoritative value, including zero where valid |
| `img64` | string | yes by current cache contract | Preserve media data used by item lookup UI |
| `description` | string | yes by current cache contract | Required-field validation prevents partial-cache success |
| other fields | domain values | optional | Preserve fields returned by the authoritative catalog |

**Server cache**: one key per item using the existing versioned prefix, with a bounded repopulation batch and expiration. Cache completeness is evaluated against required fields, not only item count.

## Synchronization Job

A logical lifecycle, represented by WebSocket messages and in-memory per-socket guards rather than a new persistent collection.

| Field | Type | Required | Invariant |
|---|---|---:|---|
| `kind` | enum: `logs`, `attacks`, `items` | yes | Determines progress and cancellation scope |
| `requestId` | opaque string | for streamed retrieval | Client accepts only matching messages |
| `startTs` / `endTs` | integer Unix seconds | for ranged imports | Validated before work begins; start must not exceed end |
| `currentTs` | integer Unix seconds | during progress | Does not exceed `endTs` in emitted progress |
| `percent` | number 0..100 | for progress | Clamped; successful terminal progress is 100 |
| `inserted` / `sent` | non-negative integer | when applicable | Counts committed/imported or transmitted records, not attempted writes |
| `state` | lifecycle enum | derived | `start`, `progress`, `batch`, `end`, `complete`, `stopped`, or `error` |

**State transitions**:

```text
idle -> start -> progress/batch -> complete
  |       |            |
  |       |            +-> stopped
  |       +----------------> error
  +------------------------> rejected (already running / invalid session)
```

Every terminal path releases its associated in-memory guard and client listener/timer.

## Local Query Cache

An in-memory client cache over `LogsDB.logs` query results.

- Key: `logId:<id>` for a full log-id result set.
- Value: `{ ts, data }` with the configured short TTL.
- Range queries filter the cached full set by timestamp bounds.
- Any new local log commit invalidates the relevant entry or all entries before the next analysis read.
- Missing stores, indexes, malformed records, and failed reads resolve to safe empty/error states rather than cached partial data.
