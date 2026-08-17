# Feature Specification: Torn Data Synchronization

**Feature Branch**: `feature/time-machine-torn-data-synchronization`

**Created**: 2026-08-17

**Status**: Draft

**Input**: User description: "Feature: Torn Data Synchronization. Users can import Torn logs, attacks, items, and profile data with progress reporting and retain the data locally for fast analysis. Relevant files: ws/wsTorn.cjs, ws/wsTornAttacks.cjs, ws/wsGetAllTornLogs.cjs, ws/wsGetTornAttacks.cjs, ws/wsGetAllTornItems.cjs, client/src/storeLogsToIndexedDB.jsx, client/src/syncItemsToIndexedDB.js, client/src/dbLayer.js, utils/ensureUserDbStructure.cjs, utils/getUserDb.cjs. Focus on this feature only; do not modify other features."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import Torn History (Priority: P1)

As an authenticated Torn user, I can synchronize my logs and attacks from Torn so that my historical activity is available for analysis without repeatedly downloading the same records.

**Why this priority**: Historical activity is the primary dataset used by the application's analytics. A resumable import is valuable even before any local browser cache or specialized analytics is added.

**Independent Test**: With a test Torn API response and an empty user data store, start a synchronization and verify that log and attack records are imported under the signed-in user's data scope, progress is reported, and a second synchronization does not create duplicates.

**Acceptance Scenarios**:

1. **Given** an authenticated session with a valid Torn API credential, **When** synchronization starts, **Then** the server imports logs and attacks in bounded time ranges and associates every record with the authenticated user's data store.
2. **Given** records already imported through an earlier run, **When** synchronization resumes, **Then** it begins after the latest stored checkpoint and does not insert duplicate records.
3. **Given** an import that spans multiple API windows, **When** each window completes, **Then** the server reports the current dataset, time range, and progress so the client can show meaningful status.
4. **Given** a Torn API rate-limit or transient failure, **When** the affected window is retried, **Then** the import waits before retrying, preserves already imported records, and continues without a tight request loop.
5. **Given** the session has no usable Torn API credential, **When** synchronization is requested, **Then** no private data is imported and the client receives a clear recoverable error.

---

### User Story 2 - Monitor and Control an Import (Priority: P2)

As an authenticated user, I can see whether a log or attack import is running, progressing, complete, stopped, or failed, and I can avoid accidentally starting competing imports.

**Why this priority**: Large historical imports can take long enough that users need trustworthy feedback and safe controls; duplicate concurrent work would waste API quota and corrupt progress expectations.

**Independent Test**: Start an import against a fixture with several batches, observe start/progress/end messages, request a stop, and then repeat the request while the import is active to verify the guard and terminal states.

**Acceptance Scenarios**:

1. **Given** an import request, **When** the server begins work, **Then** it emits a start/progress signal identifying the data kind and eventually emits exactly one terminal completion or stopped signal.
2. **Given** an active import for the same data kind, **When** another request arrives, **Then** the second request is rejected or ignored with an explicit already-running result and does not start a second importer.
3. **Given** the user requests a stop or the owning connection is no longer usable, **When** the next safe cancellation point is reached, **Then** the importer stops, reports its stopped state, and leaves previously committed records intact.
4. **Given** an empty or already-current time range, **When** synchronization runs, **Then** it completes without making unnecessary API calls and reports zero new records or an up-to-date result.

---

### User Story 3 - Cache Logs Locally for Analysis (Priority: P2)

As an authenticated user, I can load synchronized logs into browser-local storage in request-correlated batches so that charts and filters remain responsive and can reuse data without a network request for every query.

**Why this priority**: Local retention turns an import into a usable analysis dataset and reduces repeated server/database reads during normal dashboard use.

**Independent Test**: Request a bounded log range, feed start/batch/end messages to the client, reload the local store, and verify that the records are queryable by log type and timestamp with progress reaching a terminal state.

**Acceptance Scenarios**:

1. **Given** a valid authenticated connection and a requested time range, **When** log batches are returned, **Then** only batches matching the request identifier are written to local storage in chronological order.
2. **Given** the server reports the total number of matching logs, **When** batches arrive, **Then** the client progress reports current count, total count, percentage, and running state.
3. **Given** a completed local import, **When** an analytics component queries by log type or timestamp range, **Then** results are served from local storage and the query does not require a new network request.
4. **Given** a malformed message, write failure, missing end message, or client timeout, **When** the client detects the condition, **Then** it cleans up listeners/timers, reports a recoverable failure, and does not leave the import marked as running forever.
5. **Given** a new local log batch has been committed, **When** a cached query is repeated, **Then** stale query results are invalidated before the next read.

---

### User Story 4 - Synchronize the Item Catalog Locally (Priority: P3)

As an authenticated user, I can use a locally cached Torn item catalog and refresh it when missing or stale so that item search and price analysis remain fast while still obtaining current catalog data.

**Why this priority**: Items are a shared reference dataset used by logs and analytics. Local lookup must remain available even when a refresh is unnecessary or temporarily unavailable.

**Independent Test**: Start with no local catalog, request the catalog, verify the server cache path and database fallback using fixtures, then reload the page and confirm item lookup works from browser-local storage without another request until the freshness window expires.

**Acceptance Scenarios**:

1. **Given** a complete server-side item cache, **When** the client requests the catalog, **Then** the server returns the catalog and the client stores it by stable item identifier.
2. **Given** a missing or incomplete server cache, **When** the catalog is requested, **Then** the server falls back to the authoritative item store, validates the required item fields, repopulates the cache, and returns the complete catalog.
3. **Given** a fresh local catalog, **When** the item search view opens, **Then** it uses local data immediately and does not perform an unnecessary refresh.
4. **Given** a missing or stale local catalog, **When** the item search view opens, **Then** it uses any available local data while requesting a refresh, and applies the refreshed catalog after the response arrives.
5. **Given** an item refresh fails, **When** local data already exists, **Then** the existing local catalog remains usable and the failure is surfaced without deleting the last known-good data.

---

### User Story 5 - Keep Profile Data Isolated (Priority: P1)

As an authenticated user, I can trust that synchronized profile-related data, logs, attacks, and item activity are associated with my profile and cannot be mixed with another user's records.

**Why this priority**: Synchronization handles private API data. Correct tenant isolation is a security requirement and a prerequisite for every other story.

**Independent Test**: Run the same synchronization handlers with two different authenticated user identities and verify that each identity uses a separate data store, receives only its own records, and cannot select the other user's store by changing client payload fields.

**Acceptance Scenarios**:

1. **Given** two authenticated users, **When** both synchronize data, **Then** each user's logs, attacks, and profile context are stored and read from separate user-scoped data stores.
2. **Given** a client request containing an arbitrary user or profile identifier, **When** the server processes it, **Then** the server ignores that identifier for authorization and uses only the authenticated session identity.
3. **Given** an unauthenticated or expired session, **When** a synchronization or local-catalog request is made, **Then** private data is not returned and no user store is selected.
4. **Given** errors during synchronization, **When** diagnostic information is logged or returned, **Then** API credentials and sensitive profile data are not exposed to the browser or logs.

---

### Edge Cases

- A time range is empty, reversed, or extends beyond the current time; the request is validated and completes with a safe no-data result rather than looping.
- The Torn API returns a rate-limit response, a transient network failure, an empty payload, or malformed records; retryable failures wait before retrying, malformed records are skipped safely, and prior progress remains durable.
- The same log or attack is returned by overlapping windows; the persistence layer deduplicates it using the domain's stable identifier/checkpoint semantics.
- A user disconnects, signs out, or closes the page during an import; server work reaches a cancellation point and client listeners/timers are released.
- Two browser tabs request the same synchronization; only one active importer proceeds and the other receives an explicit status.
- The browser has no IndexedDB support or a local write transaction fails; the user receives a recoverable error and existing local data is not discarded.
- Redis contains incomplete or malformed item records; the server falls back to the authoritative item store and does not return a partial catalog as complete.
- MongoDB, Redis, or the Torn API is unavailable; the response is generic and recoverable, without leaking internal errors or credentials.
- A large log or item response exceeds a practical batch size; results are streamed in bounded batches rather than requiring one unbounded message or transaction.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The server MUST require the authenticated session and its Torn API credential before importing private logs, attacks, or profile-related data.
- **FR-002**: The server MUST select the user-scoped data store from the authenticated session identity only; client payloads MUST NOT be able to choose another user's store.
- **FR-003**: The server MUST ensure the required user collections and indexes exist in an idempotent manner before writing or reading synchronization data.
- **FR-004**: Log synchronization MUST use a stored checkpoint when no explicit range is provided, fetch bounded time windows, persist valid records, and resume after the latest stored log without re-importing the same record.
- **FR-005**: Attack synchronization MUST use a stored checkpoint, fetch bounded time windows, persist valid attacks, and deduplicate records using their stable attack identifier.
- **FR-006**: Synchronization MUST preserve records committed before a transient failure, use a bounded retry delay for retryable API failures, and avoid a tight retry loop.
- **FR-007**: Synchronization MUST support a safe cancellation/stop state for logs and attacks and MUST leave no active importer state after completion, failure, or cancellation.
- **FR-008**: The server MUST report synchronization lifecycle and progress with a data kind, current position, range, percentage where applicable, inserted count where applicable, and an explicit terminal result.
- **FR-009**: The server MUST reject or ignore duplicate concurrent requests for the same long-running synchronization and MUST provide a machine-readable reason.
- **FR-010**: The server MUST provide authenticated, request-correlated log retrieval in bounded start/batch/end messages ordered by timestamp, with a total count and safe error result.
- **FR-011**: The client MUST accept and persist only log batches matching the active request identifier, update progress from server totals, and finalize on completion, error, cancellation, or timeout.
- **FR-012**: The client MUST release message listeners, timers, and in-memory import guards after every terminal local-log synchronization path.
- **FR-013**: The client MUST provide local log queries by log identifier and timestamp range, with cache invalidation after new log data is committed.
- **FR-014**: The item catalog endpoint MUST prefer a complete server-side cache, validate required item fields, fall back to the authoritative item store when the cache is missing or incomplete, and repopulate the cache in bounded chunks.
- **FR-015**: The client MUST store catalog items by stable item identifier, record the last successful synchronization time, use fresh local data immediately, and refresh missing or stale data without deleting the last known-good catalog on failure.
- **FR-016**: The client MUST keep synchronized data available for local analysis after a successful import, including across a page reload, subject to the browser's local-storage capabilities.
- **FR-017**: Synchronization responses and diagnostics MUST use generic recoverable errors and MUST NOT expose Torn API credentials, session identifiers, or sensitive profile data.
- **FR-018**: The synchronization message types, progress phases, request identifiers, and terminal results MUST remain documented or discoverable in the existing WebSocket contract used by clients.

### Key Entities

- **Profile Sync Context**: The authenticated user's identity, Torn API credential reference, and user-scoped storage context used to authorize and route synchronization; credentials are never sent to the browser.
- **Torn Log Record**: A normalized activity record with a stable source identity, event timestamp, category/type, and optional domain data retained for analysis.
- **Torn Attack Record**: A normalized attack record with a stable attack code, start/end timestamps, participants, and result information.
- **Item Catalog Record**: A reference item with a stable item identifier, required descriptive fields, and optional price/media metadata.
- **Synchronization Job**: The lifecycle of one log, attack, or item operation, including request identity, range/checkpoint, progress, inserted count, and terminal state.
- **Local Query Cache**: Short-lived client-side query results for local logs that must be invalidated when new records arrive.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a representative fixture containing at least 30 days of logs and attacks, an authenticated user can start synchronization and see records available for analysis without manually repeating the import request.
- **SC-002**: Every successful multi-batch synchronization reports a start state, at least one progress update when work exists, and one terminal completion state whose final percentage is 100%.
- **SC-003**: Repeating a completed synchronization over the same source range changes the stored record count by zero for already imported logs and attacks.
- **SC-004**: After a successful browser import, a page reload can load and filter the retained local dataset without a network request for each individual query.
- **SC-005**: For a local dataset of 10,000 retained log records, a log-type or timestamp-range query returns within 500 ms in the supported browser environment.
- **SC-006**: A missing or stale item catalog becomes available to item search within 5 seconds after a successful catalog response, while an existing local catalog remains usable during refresh.
- **SC-007**: Across authenticated-user isolation tests, 100% of synchronization reads and writes use the session-selected user scope; no test user can receive another user's private records.
- **SC-008**: During a forced transient API failure, the importer makes no more than one retry attempt per configured retry interval and retains all records committed before the failure.
- **SC-009**: After repeated start/stop, timeout, error, and page-unmount scenarios, the client has zero active import listeners or timers left for completed operations.

## Assumptions

- The existing authenticated session provides a valid Torn API credential and numeric user identity when private synchronization is requested.
- Torn's user log and attack APIs, MongoDB user-scoped storage, Redis item cache, and browser IndexedDB remain the authoritative integrations already used by the application.
- Profile data in this feature means the authenticated profile context and the profile-owned synchronized records; profile editing, account creation, and sign-in are outside this feature.
- Exact API window sizes, retry delays, item-cache expiration, and local freshness windows may remain configurable implementation details as long as the measurable behavior above holds.
- Existing analytics features consume the synchronized records; this feature does not define chart calculations or domain-specific visualizations.
- A browser with IndexedDB support is the normal target; unsupported-browser handling is a recoverable degradation rather than a new persistence backend.

## Out of Scope

- User registration, sign-in, sign-out, session creation, or credential management.
- Analytics charts, dashboard layout, and domain-specific calculations over the synchronized records.
- Bi-directional editing of Torn data or conflict resolution with user-authored records.
- Replacing MongoDB, Redis, IndexedDB, or the existing WebSocket transport with new storage or transport systems.
- Public unauthenticated access to private logs, attacks, profile data, or item synchronization operations.
