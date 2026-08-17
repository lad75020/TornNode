# Feature Specification: Activity and Consumables Analytics

**Feature Branch**: `feature/time-machine-activity-and-consumables-analytics`
**Created**: 2026-08-17
**Status**: Draft
**Input**: Queue feature `activity-and-consumables-analytics`: provide reliable local analytics for revives, Xanax, blood/medical activity, acquired items, and travel duration.

## Clarifications

### Session 2026-08-17

- The existing authenticated dashboard and local `LogsDB` IndexedDB store remain the only source and transport boundary for chart data; this feature does not add live Torn API calls or a new backend endpoint.
- Existing chart component names, props, dashboard routes, log identifiers, modal behavior, and Chart.js dependencies remain compatible.
- Dates are interpreted as Unix seconds and displayed/aggregated in UTC. Date filters are inclusive ISO dates (`YYYY-MM-DD`), and day/week/month buckets are chronological and deterministic.
- Missing stores/indexes, malformed rows, empty results, and read failures terminate loading with a safe unavailable/empty state; invalid observations are excluded and never converted into fabricated zero values.
- Json preview remains bounded and allow-listed for rendering. Full raw payloads must not be written to the browser console.
- The migration utility remains a CommonJS CLI with dry-run support. Its parsed source query is applied, malformed documents are skipped safely, and connection/collection resources are closed in all paths.

## User Scenarios & Testing

### User Story 1 - Review revive and Xanax activity (Priority: P1)

As an authenticated user, I want to see revives and Xanax use/receipts over time so that I can understand recovery activity and consumable usage.

**Independent Test**: Seed `LogsDB` with valid, malformed, duplicate, out-of-range, and empty records for log 5410, logs 2290/2291, and log 4103; change granularity and inclusive date filters; verify finite chronological series and explicit empty/error states.

**Acceptance Scenarios**:

1. **Given** valid revive log 5410 rows, **When** the revives chart loads, **Then** it plots one finite observation per UTC day/week/month bucket in chronological order.
2. **Given** valid Xanax use and cooldown rows from 2290 and 2291, **When** the Xanax chart loads, **Then** it preserves the existing usage/cooldown series and applies aggregation and date controls without duplicate buckets.
3. **Given** valid Xanax receipt rows from 4103, **When** the receipts chart loads, **Then** it counts only the supported Xanax item records and ignores invalid timestamps, quantities, and unrelated items.
4. **Given** malformed or empty source rows, **When** a chart finishes reading, **Then** invalid rows are excluded and the user sees a safe empty or unavailable state rather than an unhandled rejection.
5. **Given** a date-only filter change after the source set has loaded, **When** the user changes either bound, **Then** the chart recomputes from retained source data without an unnecessary IndexedDB read.

### User Story 2 - Track blood and medical-aid activity (Priority: P1)

As an authenticated user, I want to compare blood deposits/withdrawals and medical-aid usage so that I can understand consumable supply and support activity.

**Independent Test**: Seed blood logs 2340/2100 and medical item log rows with locale-edge dates, malformed numeric values, missing stores, and duplicate days; verify UTC aggregation, date filtering, cancellation, and the absence of the deposit/withdrawal mix-up.

**Acceptance Scenarios**:

1. **Given** valid deposit and withdrawal rows, **When** the blood chart loads, **Then** deposits and withdrawals are plotted in their correct series using UTC buckets and finite amounts.
2. **Given** valid medical-aid rows whose titles identify blood or first-aid items, **When** the medical chart loads, **Then** matching items are counted by UTC day and unrelated rows are ignored.
3. **Given** a browser locale whose date format differs from ISO, **When** the charts aggregate data, **Then** bucket keys and labels remain stable and locale-independent.
4. **Given** a read is pending while the component unmounts or filters change, **When** the read resolves, **Then** stale state is not committed and no unhandled rejection is emitted.

### User Story 3 - Analyze acquired items and travel duration (Priority: P1)

As an authenticated user, I want to inspect item acquisition value and travel time so that I can identify what I gained and how long journeys take.

**Independent Test**: Seed item log 9020, cached item prices, and travel log 6000 with valid and malformed records; exercise bar-bucket modal clicks, day/week/month controls, range changes, missing prices, and empty responses.

**Acceptance Scenarios**:

1. **Given** valid acquired-item rows and cached prices, **When** the items chart loads, **Then** quantity and value totals contain only finite values, missing prices do not create `NaN`, and the existing bucket modal remains usable.
2. **Given** a bucket bar is clicked, **When** the modal opens, **Then** it receives only the selected bucket’s bounded item rows and no raw payload is logged.
3. **Given** valid travel durations, **When** the travel chart loads, **Then** durations are shown in the existing minutes representation and aggregate correctly for day/week/month controls.
4. **Given** the date range expands after a prior filter, **When** the chart recomputes, **Then** it restores matching points from retained source data instead of filtering an already-mutated result.
5. **Given** invalid timestamps, durations, quantities, or prices, **When** the chart processes them, **Then** those observations are ignored while independent valid rows remain visible.

### User Story 4 - Safely preview JSON and migrate historical stats (Priority: P2)

As an operator or authenticated user, I want bounded JSON previews and a reliable stats migration utility so that large or malformed data cannot freeze the UI or abort a migration unexpectedly.

**Independent Test**: Render filtered/truncated preview values with an unmount during asynchronous rendering, and execute the migration utility with a source query, dry-run, malformed documents, missing environment variants, and collection failures.

**Acceptance Scenarios**:

1. **Given** a large nested payload, **When** JsonPreview renders it, **Then** it applies the existing filters and truncation limit and completes without logging the full payload.
2. **Given** a preview unmounts before its deferred renderer completes, **When** the renderer callback fires, **Then** it does not update the detached component.
3. **Given** a valid migration query, **When** the utility runs, **Then** it passes that query to MongoDB instead of scanning every source document.
4. **Given** malformed `personalstats` fields or non-finite derived values, **When** migration runs, **Then** the document is skipped with an operational diagnostic and other documents continue processing.
5. **Given** dry-run mode, **When** migration runs, **Then** no destination writes occur while the same validation and counting paths execute.
6. **Given** any migration failure or completion, **When** the process exits, **Then** MongoDB resources are closed and no secret, connection string, or stack trace is printed as a user-facing message.

## Edge Cases

- `LogsDB` or `logs` is absent, a requested index is unavailable, a transaction aborts, or a helper returns a non-array.
- A timestamp is absent, negative, non-finite, in milliseconds instead of seconds, or creates an invalid UTC date.
- Quantities, durations, prices, blood values, or aggregate totals are strings, `null`, `NaN`, infinite, negative where unsupported, or absent.
- Multiple rows map to the same UTC bucket; duplicate source events must not create duplicate bucket labels.
- A date range has only one bound, has invalid ISO text, or changes while a read is pending.
- A component unmounts while IndexedDB, item-price, dynamic import, or deferred JSON rendering work is pending.
- Cached item data is missing, stale, malformed, or has no current price.
- The migration source query matches no documents, contains malformed fields, or MongoDB fails during cursor iteration.

## Functional Requirements

- **FR-001**: All activity and consumables charts MUST remain inside the existing authenticated dashboard and local IndexedDB boundary.
- **FR-002**: Chart inputs MUST accept only finite numeric values and valid Unix-second timestamps; malformed observations MUST be excluded.
- **FR-003**: Revive, Xanax, receipt, blood, medical-aid, item, and travel charts MUST use deterministic UTC day/week/month buckets and chronological labels.
- **FR-004**: Inclusive date filters MUST rebuild or filter retained source data without destructive mutation and without redundant reads for date-only changes.
- **FR-005**: Missing stores, failed reads, malformed rows, and empty valid datasets MUST stop loading and expose a safe empty/unavailable state.
- **FR-006**: Existing chart props, visibility controls, themes, granularity controls, click-to-preview behavior, and dashboard routes MUST remain compatible.
- **FR-007**: Blood deposit and withdrawal series MUST use the correct source log and field for each direction.
- **FR-008**: Item value calculations MUST tolerate missing or malformed cached prices and MUST never render `NaN` or infinite values.
- **FR-009**: Asynchronous chart and preview work MUST support cancellation/unmount guards and MUST not commit stale state.
- **FR-010**: JsonPreview MUST preserve its bounded filtering/truncation contract and MUST NOT log full source payloads in the browser.
- **FR-011**: `utils/computeStatsFromOldStats.js` MUST apply the parsed source query, support the documented Mongo URI fallback, validate source fields, preserve dry-run behavior, continue safely across malformed documents, and close MongoDB resources.
- **FR-012**: No new npm dependency, public route, live Torn request, credential, database identifier, raw exception, or stack trace may be introduced into the user-visible path.

## Key Entities

- **Activity Log Row**: Existing IndexedDB log record containing an identifier, Unix-second timestamp, and activity-specific fields.
- **Consumable Event**: Validated revive, Xanax, blood, or medical-aid observation with a UTC event date and finite quantity/value.
- **Acquired Item Row**: Validated item identifier/quantity paired with an optional finite cached price.
- **Travel Event**: Validated travel duration represented in the existing minutes chart unit.
- **Activity Bucket**: Day, ISO Monday week, or month key containing finite sums/counts and bounded source rows.
- **Preview Payload**: Filtered, truncated JSON value passed to `jsonview.js` without exposing the original unrestricted payload.
- **Migration Result**: Counted source documents, updated/skipped documents, dry-run status, and safe operational diagnostics.

## Success Criteria

- **SC-001**: All seven analytics charts build successfully and show only finite, valid, in-range points from deterministic fixtures.
- **SC-002**: 100% of malformed/missing source rows in focused fixtures are excluded without preventing independent valid rows from rendering.
- **SC-003**: Date-only changes and range expansion do not lose retained points, duplicate buckets, or trigger unnecessary IndexedDB reads.
- **SC-004**: Blood deposit and withdrawal totals match their source directions in all focused fixtures.
- **SC-005**: JsonPreview remains bounded and emits no full-payload console output.
- **SC-006**: Migration query, dry-run, malformed-document, URI-fallback, and cleanup fixtures pass without raw secrets/errors in user-facing output.
- **SC-007**: Existing synchronization, authentication, bazaar regressions, and production static build remain passing.

## Assumptions and Out of Scope

- Existing IndexedDB synchronization, item catalog, authentication, Chart.js registration, dashboard routing, and MongoDB driver remain available.
- No new log collector, backend activity endpoint, chart library, export flow, or state-management framework is introduced.
- Historical events absent from local logs and prices absent from the local catalog are not reconstructed.
- This feature does not change the Torn API schema or the semantics of existing log identifiers.
