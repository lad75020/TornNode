# Research Notes: Torn Data Synchronization

## Decision 1: Preserve the existing WebSocket protocol and add only optional lifecycle fields

**Decision**: Keep the existing string commands (`torn`, `tornAttacks`) and JSON request types (`getAllTornLogs`, `getAllTornItems`, `getTornAttacks`, `stopImport`). Keep `importProgress`, `importedData`, `importStopped`, and `getAllTornLogs` start/batch/end messages as the compatibility surface. Use `requestId` to correlate streamed retrieval responses and retain existing fields while adding safe status/error fields only when needed.

**Rationale**: `routes/wsHandler.cjs`, `client/src/main.jsx`, `storeLogsToIndexedDB.jsx`, and `useWsMessageBus.js` already consume these names. Replacing the protocol would create unnecessary cross-feature churn and would break the realtime runtime feature that is already complete.

**Alternatives considered**:

- Introduce HTTP endpoints for all synchronization: rejected because the application already authenticates and dispatches these operations over WebSocket and needs streaming progress.
- Create a second versioned message namespace: rejected for this feature; optional fields and focused validation are sufficient without duplicating handlers.

## Decision 2: Use authenticated session identity as the only tenant selector

**Decision**: Every private handler obtains the Torn credential and numeric user id from `req.session`. `getUserDb` converts only that session id into the user database. Client payloads may contain range, batch, and correlation data, but never select a database or credential.

**Rationale**: The existing helpers already establish this boundary, and the feature handles private Torn history. Keeping the rule centralized prevents accidental cross-profile reads when new synchronization messages are added.

**Alternatives considered**:

- Accept `userId` in each request and compare it with the session: rejected because accepting an unnecessary authority field increases the chance of an authorization mistake.
- Use one shared history collection with a user field: rejected for this feature because the application already uses per-user databases and changing storage tenancy is out of scope.

## Decision 3: Make synchronization idempotent with stable source identifiers and checkpoints

**Decision**: Logs use the Torn source record id as the durable identity; attacks use the Torn attack code. The importer starts after the latest valid stored timestamp/ended checkpoint when no explicit range is supplied. Overlapping windows remain safe because duplicate writes are ignored or rejected by the stable identity rather than counted as new records.

**Rationale**: The current log normalizer already maps `value.id` to `_id`, and attack records already expose `code`. The current attack loop intentionally overlaps a boundary window, so duplicate-safe writes are required even when checkpoint arithmetic is corrected.

**Alternatives considered**:

- Deduplicate only in application memory: rejected because process restarts and scheduled imports would lose the dedupe set.
- Delete and reload the full history each time: rejected because it wastes API quota, is slow, and risks losing already durable data after a partial failure.

## Decision 4: Keep API retries bounded in time and cancellation-aware

**Decision**: Retry only classified transient/rate-limit failures with a delay, check the stop flag between attempts and windows, and always release importer/deferred state in `finally` paths. Non-retryable failures produce safe terminal errors while retaining prior writes.

**Rationale**: Torn API quota and long histories make retry behavior visible to users. The current handlers retry numeric API errors but have several early-return/error paths that can leave state or progress ambiguous.

**Alternatives considered**:

- Immediate infinite retry: rejected because it can create a tight loop, hold a connection indefinitely, and worsen rate limiting.
- Fail the complete import on the first transient error: rejected because already committed history should remain useful and resumability is a core requirement.

## Decision 5: Stream server log retrieval and write browser batches transactionally

**Decision**: The server counts the range, sends a start message, emits bounded chronological batches, then sends end. The browser accepts only the active request id, writes each batch in a read/write transaction, advances progress after the transaction succeeds, and centralizes cleanup for success, error, timeout, stop, and socket closure.

**Rationale**: The current implementation already follows this shape, but it increments client progress even when a write fails and does not centralize all timer cleanup. The change preserves the proven shape while making progress truthful and terminal states deterministic.

**Alternatives considered**:

- Send the entire range in one WebSocket message: rejected because large history can approach the configured 10 MiB payload limit and block the UI.
- Fetch each record individually: rejected because it creates excessive round trips and defeats batch persistence.

## Decision 6: Treat the item cache as an optimization, not the source of truth

**Decision**: Accept Redis item data only when all required fields are present. On missing, incomplete, or unreadable cache data, read the authoritative item catalog, return the complete result, and repopulate cache keys in bounded chunks with expiration. The browser commits a replacement catalog atomically and updates freshness only after commit.

**Rationale**: The existing cache uses one RedisJSON key per item and already defines required fields and a 24-hour expiration. A partial cache must not be presented as a complete catalog because item lookup and log enrichment depend on stable metadata.

**Alternatives considered**:

- Return the partial cache immediately: rejected because it silently hides items and produces inconsistent analysis.
- Make every browser lookup hit the authoritative store: rejected because it increases latency and load for a reference dataset that is intentionally cacheable.

## Decision 7: Verify with dependency-isolated Node tests plus build/runtime checks

**Decision**: Add focused `node:test` coverage around handlers and pure persistence/validation behavior using fake sockets, sessions, databases, API responses, and cache clients. Run the existing WebSocket/auth tests and the production Vite build. Use the existing Playwright harness only for flows that require a real browser storage/runtime.

**Rationale**: The repository has no established front-end unit-test runner for JSX modules, while its server tests already use Node's built-in runner. This gives deterministic coverage without requiring live Torn, Mongo, or Redis services for every test.

**Alternatives considered**:

- Add a new front-end test framework: rejected because it expands feature scope and dependency surface for a persistence change that can be validated through existing browser integration and build checks.
- Rely only on manual testing: rejected because tenant isolation, duplicate handling, and cleanup regressions need repeatable assertions.
