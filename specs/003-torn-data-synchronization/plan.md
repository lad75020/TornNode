# Implementation Plan: Torn Data Synchronization

**Branch**: `feature/time-machine-torn-data-synchronization` | **Date**: 2026-08-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-torn-data-synchronization/spec.md`

## Summary

Harden the existing Torn synchronization pipeline so authenticated users can resume log and attack imports, observe reliable lifecycle progress, retrieve records in correlated batches, and retain logs/items in browser-local storage for fast analysis. The implementation will preserve the current WebSocket message names and existing application integrations while centralizing validation, tenant selection, deduplication, retry/cancellation cleanup, and safe error handling. The work stays within the listed synchronization modules plus the existing WebSocket router and focused tests/contracts needed to verify the behavior.

The server remains authoritative for private Torn history and profile ownership. Each request derives its user database and Torn API credential from the authenticated session, never from a client-selected user identifier. The client stores only normalized records/catalog data and request progress; it never receives the Torn API credential.

## Technical Context

**Language/Version**: Node.js CommonJS server (project runtime convention: Node.js 25); browser JavaScript/JSX using ES modules

**Primary Dependencies**: Fastify 5, `@fastify/websocket` 11, MongoDB driver 7 / `@fastify/mongodb`, Redis 6 / `@fastify/redis`, `torn-client`, React 19, Vite 8, `idb` 8

**Storage**: MongoDB user-scoped databases with `logs` and `attacks` collections; shared item catalog plus RedisJSON item cache; browser IndexedDB stores `LogsDB.logs` and `ItemsDB.items`; localStorage freshness marker for the item catalog

**Testing**: Node's built-in `node:test` and `node:assert/strict` for handler/util contracts; existing Playwright setup and `npm run build` for client integration/build verification

**Target Platform**: Fastify WebSocket server and authenticated desktop browser client; local development and deployed Node server environments

**Project Type**: Full-stack web application with a realtime WebSocket transport

**Performance Goals**: Stream log retrieval in bounded batches; keep item cache repopulation chunked; keep local log type/range queries within the 500 ms target for 10,000 records; emit progress frequently enough to show movement without flooding the socket

**Constraints**: Torn API rate limits and transient failures; authenticated WebSocket session; maximum WebSocket payload configured at 10 MiB; existing message names must remain compatible; no API credentials in client payloads or logs; imports must be resumable and cancellation-aware

**Scale/Scope**: One authenticated profile per WebSocket connection; historical logs and attacks may span years; representative acceptance fixture is at least 30 days and 10,000 locally retained log records; one feature cycle, no analytics UI redesign

## Constitution Check

The repository constitution is still the Spec Kit placeholder template and defines no project-specific gates. Apply the default gates for this feature:

- **Authentication and tenant isolation**: PASS — every private handler uses the authenticated session identity and the user-scoped database helper; client user/profile identifiers are not trusted.
- **Secret handling**: PASS — Torn API credentials stay server-side; client and diagnostic errors use safe messages.
- **Durability and resumability**: PASS — checkpoint-based windows, stable identifiers, idempotent writes, and preservation of prior committed records are required.
- **Compatibility**: PASS — retain existing command/message names and add fields only where optional; existing analytics consumers remain valid.
- **Verification**: PASS — add focused Node tests, run the project build, and exercise the relevant WebSocket contract with fakes or a controlled integration harness.

No constitution violation or new project abstraction is required.

## Project Structure

### Documentation (this feature)

```text
specs/003-torn-data-synchronization/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── websocket-sync.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
server.cjs
routes/
└── wsHandler.cjs                 # existing command dispatch, stop flags, session gate
ws/
├── wsTorn.cjs                    # Torn log import and normalization
├── wsTornAttacks.cjs             # Torn attack import and normalization
├── wsGetAllTornLogs.cjs          # user-scoped log streaming
├── wsGetTornAttacks.cjs          # user-scoped attack aggregation
└── wsGetAllTornItems.cjs         # cached/authoritative item catalog response
utils/
├── ensureUserDbStructure.cjs     # user collections and indexes
└── getUserDb.cjs                 # session-derived tenant selection
client/src/
├── storeLogsToIndexedDB.jsx      # correlated log batch ingestion/progress
├── syncItemsToIndexedDB.js       # catalog persistence and freshness marker
├── dbLayer.js                    # local log queries and cache invalidation
├── hooks/useWsMessageBus.js      # existing message dispatch compatibility
└── main.jsx                      # existing import orchestration; change only if required for lifecycle fixes
tests/
├── torn-data-synchronization.test.cjs
└── helpers/
    └── tornSyncTestHarness.cjs
```

**Structure Decision**: Keep the existing full-stack layout. Server synchronization handlers remain in `ws/`, cross-cutting tenant and schema setup remains in `utils/`, browser persistence stays in `client/src/`, and deterministic protocol/handler behavior is covered by the consolidated `tests/torn-data-synchronization.test.cjs` harness. `routes/wsHandler.cjs` is included only for the existing command dispatch and cancellation state required to make the listed handlers reliable; no unrelated route or analytics feature is changed.

## Implementation Phases

### Phase 0 - Confirm current contracts and invariants

- Use the existing message names and fields documented in [contracts/websocket-sync.md](./contracts/websocket-sync.md).
- Treat `req.session.userId` as the sole tenant key and `req.session.TornAPIKey` as a server-only credential.
- Preserve current collection names, local database/store names, and existing consumers.
- Confirm whether existing data contains duplicate attack codes before enabling or repairing uniqueness; migration logic must not make startup fail solely because historical duplicates exist.

### Phase 1 - Server persistence, validation, and lifecycle

1. Strengthen `utils/getUserDb.cjs` and `utils/ensureUserDbStructure.cjs` boundaries:
   - reject absent/non-numeric session identities;
   - ensure log/attack collections and query indexes exist idempotently;
   - use stable source identifiers for deduplication and avoid trusting payload user fields;
   - make index creation failures observable without exposing internals to clients.
2. Harden `ws/wsTorn.cjs`:
   - validate explicit integer ranges and normalize defaults;
   - calculate the resume checkpoint from the latest valid stored log;
   - require a stable source id before durable insertion;
   - normalize dates and domain fields without leaking API credentials;
   - retain bounded windows, rate-limit backoff, stop checks, progress updates, and final completion behavior;
   - ensure importer state is released on success, cancellation, and failure.
3. Harden `ws/wsTornAttacks.cjs`:
   - resume from the latest valid `ended` checkpoint;
   - avoid check-then-insert races by using stable attack codes and duplicate-safe writes;
   - preserve progress and stop semantics for short and multi-window ranges;
   - emit a consistent terminal result and always clear transient state.
4. Update `routes/wsHandler.cjs` only where needed to reset stale stop flags, preserve the existing string/JSON commands, and avoid deferred-attack watchdogs surviving a terminal log import.

### Phase 2 - Authenticated retrieval and catalog fallback

1. Update `ws/wsGetAllTornLogs.cjs`:
   - require a valid session and user store;
   - validate `from`, `to`, `batchSize`, and `requestId` inputs;
   - return chronological start/batch/end messages with bounded buffers and total count;
   - use `finally` to release the per-socket running guard and return safe, request-correlated errors.
2. Update `ws/wsGetTornAttacks.cjs`:
   - validate the numeric range and user session;
   - query only the authenticated user's attacks;
   - preserve the existing wins/losses/attacks/defends result shape while making failure responses safe.
3. Update `ws/wsGetAllTornItems.cjs`:
   - enforce the existing WebSocket session gate at handler level too;
   - accept a complete item cache only when every required field is present;
   - fall back to the authoritative catalog, repopulate cache keys in bounded chunks with expiration, and return the complete catalog;
   - preserve the last-known-good client catalog when the refresh fails and avoid returning partial success.

### Phase 3 - Browser-local persistence and query behavior

1. Update `client/src/storeLogsToIndexedDB.jsx`:
   - correlate all accepted messages with the active request id;
   - preserve the start/batch/end progress model and handle zero-data completion;
   - make each batch write transactionally and surface write failures instead of counting failed records as committed;
   - centralize cleanup for listeners, intervals, timeout guards, and in-memory active flags;
   - leave a recoverable non-running state after timeout, malformed responses, socket closure, stop, or server error.
2. Update `client/src/syncItemsToIndexedDB.js`:
   - keep stable `id` keys;
   - replace the catalog in one transaction so a failed refresh cannot destroy the previous catalog;
   - record freshness only after a successful commit;
   - preserve an existing catalog when an empty/error response is received unless the caller explicitly requests a clear.
3. Update `client/src/dbLayer.js`:
   - retain the existing log-id, multi-id, and timestamp-range APIs;
   - return deterministic empty results for missing stores/indexes;
   - invalidate per-id and global query caches after successful local ingestion;
   - avoid caching partially failed reads.
4. Adjust `client/src/main.jsx` or `client/src/hooks/useWsMessageBus.js` only if required to consume the hardened lifecycle without duplicate listeners or stale progress; do not change analytics calculations.

### Phase 4 - Focused verification

- Add server-side tests with fake sessions, user databases, sockets, Torn responses, Redis, and authoritative item data.
- Cover authentication/tenant isolation, checkpoint resume, duplicate records, transient retry behavior, stop/finalization, range validation, batched log retrieval, complete/incomplete item cache behavior, and generic errors.
- Add browser/client coverage where the existing Playwright harness can exercise local persistence; otherwise keep deterministic protocol/persistence helpers testable from Node and verify the production build.
- Run focused Node tests, `npm run build`, then the relevant existing authentication/WebSocket tests to detect regressions.
- Verify the pre-existing `.gitignore` `.DS_Store` change remains untouched.

## Complexity Tracking

No constitution violations. No additional complexity justification is required.
