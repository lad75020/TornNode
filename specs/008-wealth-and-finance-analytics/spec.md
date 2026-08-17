# Feature Specification: Wealth and Finance Analytics

**Feature Branch**: `feature/time-machine-wealth-and-finance-analytics`
**Created**: 2026-08-17
**Status**: Draft
**Input**: Queue feature `wealth-and-finance-analytics`: provide authenticated net-worth, faction, gambling, income, cost, and bounty analytics.

## Clarifications

### Session 2026-08-17

- The existing authenticated WebSocket, `LogsDB` IndexedDB store, per-user MongoDB collections, and Chart.js components remain the only transport/storage paths.
- Date filters are inclusive and use UTC ISO day values (`YYYY-MM-DD`); aggregation buckets are chronological and UTC-based.
- Missing stores, indexes, malformed records, empty responses, and upstream failures produce an explicit empty/unavailable state and never a fabricated financial value.
- Existing chart props, dashboard routing, log identifiers, and message names remain compatible; no new dependency or API is introduced.

## User Scenarios & Testing

### User Story 1 - Review net-worth history and composition (Priority: P1)

As an authenticated user, I want to see net-worth history and the latest composition so that I can understand both long-term change and current asset distribution.

**Independent Test**: Exercise the authenticated net-worth WebSocket handlers with valid, malformed, empty, and failure fixtures and replay `getNetworth`/`lastNetworth` responses through the existing chart components.

**Acceptance Scenarios**:

1. **Given** valid dated net-worth snapshots, **When** the history chart receives them, **Then** it plots finite values in chronological order and applies the inclusive date range.
2. **Given** a latest Stats snapshot contains numeric net-worth parts, **When** the breakdown chart receives it, **Then** it renders non-zero finite parts and a stable total without exposing database fields.
3. **Given** invalid dates, non-numeric values, duplicate snapshots, or an error envelope, **When** the charts process the response, **Then** invalid observations are excluded and the user sees a safe empty/unavailable state when no valid data remains.
4. **Given** a valid authenticated request, **When** either handler reads MongoDB, **Then** it reads only the current tenant and returns the documented allow-listed envelope.

### User Story 2 - Analyze faction and gambling outcomes (Priority: P1)

As an authenticated user, I want to inspect faction balance changes and gambling outcomes so that I can identify gains, losses, and activity over time.

**Independent Test**: Seed `LogsDB` with valid and malformed faction/slot/poker records, change date and aggregation controls, and verify chronological finite series and safe missing-store behavior.

**Acceptance Scenarios**:

1. **Given** faction balance records from log IDs 6738 and 6795, **When** the faction chart loads, **Then** it plots valid `balance_after` observations and computes positive increases in chronological order.
2. **Given** slot result records from log IDs 8300 and 8301, **When** the slots chart loads, **Then** daily gains and bets are aggregated with stable UTC day labels and inclusive range filtering.
3. **Given** poker bet/win records, **When** the poker chart loads, **Then** daily bet, win, and profit series contain only finite non-zero valid values.
4. **Given** a missing `LogsDB` store/index or failed transaction, **When** any chart loads, **Then** it stops loading and renders an explicit empty/unavailable state without an unhandled rejection.

### User Story 3 - Track income, costs, and bounty rewards (Priority: P1)

As an authenticated user, I want to compare money received, crime gains, market costs, and bounty rewards at day/week/month granularity so that I can understand the main sources and uses of cash.

**Independent Test**: Seed logs 4810, 9015, 1103/1104/1112/1113, and 6710 with valid, malformed, out-of-range, and duplicate-day records and verify aggregation, filtering, totals, and empty states.

**Acceptance Scenarios**:

1. **Given** valid money-log rows, **When** the user selects day, week, or month, **Then** sums are bucketed in UTC chronological order and filtered inclusively.
2. **Given** valid crime-money rows, **When** the user changes granularity or date range, **Then** cumulative values correspond to the displayed filtered sums and bucket inspection remains safe.
3. **Given** market cost rows from the four existing log IDs, **When** the chart loads, **Then** numeric cost and cost-total fields are normalized and combined into the existing purchase/sales series.
4. **Given** bounty rows with finite timestamps, **When** the chart loads, **Then** count and reward totals are shown by the selected bucket and invalid rows are ignored.
5. **Given** no valid records, **When** any chart finishes loading, **Then** the UI shows an empty state rather than a misleading zero-value chart.

### User Story 4 - Receive reliable authenticated finance data (Priority: P2)

As an authenticated user, I want finance handlers to be tenant-scoped and safe so that private values and internal failures cannot leak through WebSocket responses.

**Independent Test**: Invoke each finance handler with valid, missing, invalid, and failing sessions/collections and assert response envelopes, projections, cursor cleanup, logging, and absence of credentials/raw errors.

**Acceptance Scenarios**:

1. **Given** no authenticated session or required API key, **When** a private finance command is invoked, **Then** it fails closed with a stable safe error and performs no protected read.
2. **Given** a valid session, **When** a handler succeeds, **Then** it returns only chart-required fields sorted deterministically.
3. **Given** MongoDB setup, cursor, or serialization failure, **When** a handler catches it, **Then** it logs server-side diagnostic context and sends a generic client error.
4. **Given** an already recent net-worth snapshot, **When** the insert command runs, **Then** the existing 12-hour throttle response is preserved and no duplicate snapshot is inserted.

## Edge Cases

- `LogsDB` or `logs` is absent, its `log` index is unavailable, a transaction aborts, or `getLogsByLogId` returns a non-array.
- A timestamp is missing, negative, non-finite, in milliseconds instead of seconds, or produces an invalid Date.
- Financial values are strings with formatting, `null`, `NaN`, infinite, or absent; only finite values are charted.
- A date range changes while an IndexedDB read is pending, or only one bound is present.
- Duplicate or replayed WebSocket payloads must not duplicate net-worth points or trigger unbounded refreshes.
- A chart is toggled while loading or after the component has unmounted.
- A MongoDB cursor is large, fails during iteration, or closes after a socket disconnect.

## Functional Requirements

- **FR-001**: All finance charts and WebSocket commands MUST remain inside the existing authenticated application boundary.
- **FR-002**: Net-worth history MUST accept only finite dated observations, sort them chronologically, deduplicate exact dates, and apply inclusive date filtering.
- **FR-003**: Net-worth breakdown MUST allow-list numeric `personalstats.networth` parts and calculate totals only from finite values.
- **FR-004**: Faction, slot, poker, income, cost, and bounty charts MUST validate timestamps and numeric fields before aggregation.
- **FR-005**: Day/week/month aggregation MUST use deterministic UTC buckets and preserve chronological ordering.
- **FR-006**: Date-only changes MUST rebuild/filter existing data without redundant network or IndexedDB reads where the component already has a complete source set.
- **FR-007**: Missing stores, failed reads, malformed rows, and empty data MUST terminate loading and expose a safe empty/error state.
- **FR-008**: Existing chart visibility, theme, granularity, modal, and dashboard prop interfaces MUST remain compatible.
- **FR-009**: `wsInsertNetworth`, `wsGetNetworth`, and `wsLastNetworthStats` MUST validate the authenticated session, use the current tenant database, allow-list responses, and hide raw errors.
- **FR-010**: Net-worth insertion MUST preserve the existing 12-hour throttle, Torn API URL override, and serializable success/error envelopes.
- **FR-011**: Asynchronous database, API, and IndexedDB operations MUST not use synchronous I/O and MUST release cursors/transactions when possible.
- **FR-012**: No response may expose API keys, database identifiers, tenant identifiers supplied by a client, stack traces, or raw internal errors.

## Key Entities

- **Networth Snapshot**: Date plus one finite total value derived from the stored snapshot.
- **Networth Breakdown**: Allow-listed numeric asset parts from the latest Stats record.
- **Finance Log Row**: Existing log identifier, UTC timestamp, and validated finance fields.
- **Finance Bucket**: Day, ISO Monday week, or month key with deterministic sums/counts.
- **Finance WebSocket Envelope**: Existing typed request/response with a bounded allow-listed payload.

## Success Criteria

- **SC-001**: All nine listed chart modules build successfully and show only finite, valid, in-range points in deterministic source fixtures.
- **SC-002**: 100% of malformed/missing source rows in verification fixtures are excluded without preventing valid rows from rendering.
- **SC-003**: Replayed responses and date-only changes create no duplicate points or redundant request loops.
- **SC-004**: 100% of private handler failure fixtures produce safe envelopes without credentials, database IDs, or raw exceptions.
- **SC-005**: Existing authentication, synchronization, bazaar regression suites, and the production static build remain passing.

## Assumptions and Out of Scope

- Existing authentication, WebSocket dispatch, IndexedDB stores, MongoDB tenant helpers, Chart.js registration, and log schemas remain available.
- No new log collectors, external APIs, chart libraries, state-management framework, export flow, or public finance route is introduced.
- Historical data absent from existing logs/snapshots is not reconstructed.
