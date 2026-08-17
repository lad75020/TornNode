# Feature Specification: Combat and Progression Analytics

**Feature Branch**: `feature/time-machine-combat-and-progression-analytics`
**Created**: 2026-08-17
**Status**: Draft
**Input**: Queue feature `combat-and-progression-analytics`: provide authenticated combat, gym, crime, work, and racing progression analytics from stored logs, snapshots, and WebSocket data.

## Clarifications

### Session 2026-08-17

- The existing authenticated WebSocket and local browser databases remain the supported transport and persistence paths; no new external API or notification provider is introduced.
- Date filters are inclusive and day-based using the same ISO `YYYY-MM-DD` values already used by the analytics shell.
- Racing position aggregation is user-selectable at day, week, or month granularity; weeks begin on Monday in UTC, matching the current chart behavior.
- A missing or malformed source record is excluded without replacing valid points or presenting an inferred value as real data.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review combat outcomes and skill progression (Priority: P1)

As an authenticated user, I want to inspect attack outcomes, gym-stat progression, and crime skill levels over time so that I can understand how combat activity and training affect my character.

**Why this priority**: Combat and training are the primary progression signals in the application and provide useful value even when other analytics are unavailable.

**Independent Test**: Seed valid and malformed attack, gym, and crime log records in the existing local log database, open each chart, change the inclusive date range, and verify the resulting datasets, empty state, and rendering behavior without using the work or racing charts.

**Acceptance Scenarios**:

1. **Given** valid attack responses are available for one or more days, **When** the user opens the attacks chart, **Then** the chart shows daily wins, losses, attacks, and defends in chronological order.
2. **Given** valid gym log records exist, **When** the user opens the gym chart, **Then** the chart shows dated speed, dexterity, strength, and defense values using only records containing numeric post-training values.
3. **Given** valid crime log records contain a crime name and numeric skill level, **When** the user opens the crime chart, **Then** the chart groups points by crime, orders them by time, and uses a distinct stable series for each crime.
4. **Given** the user selects an inclusive date range, **When** any combat or progression chart is refreshed, **Then** every displayed point is within that range and the earliest valid source date remains available to the surrounding date controls.
5. **Given** a log store, index, or record is absent, malformed, or has a non-numeric timestamp/value, **When** the chart loads, **Then** invalid data is ignored and the user sees either the remaining valid data or a clear empty/loading state without an unhandled error.

---

### User Story 2 - Track work-stat growth from cached and live data (Priority: P1)

As an authenticated user, I want to see my manual, intelligence, and endurance work statistics accumulate by day and update when new statistics arrive so that I can track progression without manually reconstructing historical changes.

**Why this priority**: Work statistics are a separate progression path and the existing interface is designed to provide immediate cached insight followed by a live refresh.

**Independent Test**: Seed cached work-stat records, open the work chart, deliver a valid `companyTrainRange` response and malformed or duplicate responses through the existing WebSocket message path, and verify cumulative values, persistence, range filtering, and bounded retry behavior independently of combat and racing charts.

**Acceptance Scenarios**:

1. **Given** cached work-stat records exist, **When** the chart opens, **Then** the cached chart is displayed as soon as it is available while the live range request proceeds.
2. **Given** dated incremental work values are returned, **When** the response is accepted, **Then** the chart computes chronological cumulative manual, intelligence, and endurance series.
3. **Given** a record is marked as an absolute snapshot, **When** it is incorporated, **Then** the cumulative baseline is replaced by that snapshot before later increments are added.
4. **Given** a valid live response contains a date range and data, **When** it is processed, **Then** records are stored by date, duplicates are idempotent, and the chart is rebuilt from the complete valid local set.
5. **Given** no relevant response arrives, **When** the bounded retry window expires, **Then** the chart stops retrying after the configured maximum and does not create an unbounded timer or duplicate request loop.

---

### User Story 3 - Inspect racing position and racing-skill progression (Priority: P1)

As an authenticated user, I want to inspect racing position history and racing-skill snapshots at useful time granularities so that I can measure racing progression and data coverage.

**Why this priority**: Racing has both event-level position data and snapshot-level skill data; showing both gives users a more complete progression view.

**Independent Test**: Seed racing-position log records and deliver a valid and invalid racing-skill WebSocket response, switch between day/week/month aggregation, and verify averages, counts, chronological ordering, empty states, and safe filtering without relying on the other analytics groups.

**Acceptance Scenarios**:

1. **Given** racing-position records contain a numeric timestamp and a position string beginning with a digit, **When** the chart loads, **Then** it plots the parsed position and ignores records that do not meet that input contract.
2. **Given** the user selects day, week, or month, **When** the position chart is recalculated, **Then** it displays the average position and event count for each UTC bucket in chronological order.
3. **Given** a date range is selected, **When** racing position data is aggregated, **Then** raw points are filtered before aggregation so no out-of-range event affects an in-range average or count.
4. **Given** valid racing-skill snapshots arrive through the authenticated WebSocket, **When** the message is processed, **Then** numeric values are sorted by date and displayed as the racing-skill series.
5. **Given** racing data is empty, malformed, disconnected, or duplicated, **When** the chart is displayed, **Then** valid existing data remains usable and the user sees a safe empty/loading state rather than a fabricated value.

---

### User Story 4 - Receive reliable authenticated analytics data (Priority: P2)

As an authenticated user, I want analytics requests to return correctly scoped, safe data and clear failure states so that charts do not expose another user’s records or fail unpredictably when the API or database is unavailable.

**Why this priority**: The charts depend on WebSocket handlers that read user-scoped MongoDB collections and Torn API snapshots; correctness and isolation are prerequisites for trusting the analytics.

**Independent Test**: Exercise each analytics WebSocket handler with a valid authenticated session, a missing or invalid session/API key, an invalid range, empty collections, a database failure, and a valid response, then verify response envelopes, error behavior, logging, and absence of secrets.

**Acceptance Scenarios**:

1. **Given** a valid authenticated session, **When** an analytics request is received, **Then** the handler reads only the current user’s data and returns the documented response type and fields.
2. **Given** a request has no valid authenticated session or required API key, **When** the handler is invoked, **Then** it returns a safe error response without querying protected data or exposing credentials.
3. **Given** an attack request has an invalid or reversed range, **When** it is processed, **Then** the handler rejects it with the existing safe range error and does not scan the collection.
4. **Given** a database cursor, collection, or Torn API call fails, **When** the handler handles the failure, **Then** it logs diagnostic context through the existing server logger and sends a stable safe error envelope to the client.
5. **Given** a handler returns a successful collection of observations, **When** the response is serialized, **Then** it contains only the fields needed by the chart and never includes database identifiers, API keys, or internal exception details.

---

### Edge Cases

- The local `LogsDB` database exists but the `logs` store or `log` index does not.
- A log has a missing timestamp, a timestamp in the wrong unit, a malformed `data` object, or a value of the wrong type.
- A crime has no name; it is either grouped under the existing safe fallback label or omitted when its skill value is invalid.
- The attack cache starts empty, is unavailable, or contains duplicate days; manual refresh must not create duplicate day entries.
- A work-stat response arrives out of order, repeats a date, contains an absolute snapshot, or has a malformed `data` collection.
- A racing position string is empty, starts with a non-digit, or contains a multi-digit position whose first digit is the only accepted chart value.
- A racing-skill payload contains invalid dates, non-numeric skill values, duplicate snapshots, or an error instead of data.
- The selected date start is after the end, only one bound is present, or the range changes while a request is in flight.
- A WebSocket reconnect replays an earlier response after a newer response has already been applied.
- A user toggles a chart while it is loading or while a local database operation is pending.
- A handler is called after the socket has closed, or a client send throws during reconnect.
- A MongoDB cursor is large or fails during iteration and must still be closed when possible.
- An API response includes fields that are not serializable or includes more fields than the chart needs.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The analytics surface MUST remain available only within the existing authenticated application boundary and MUST preserve the current WebSocket/session routing.
- **FR-002**: The attacks chart MUST display daily wins, losses, attacks, and defends from valid authenticated attack results in chronological order.
- **FR-003**: The attacks data handler MUST accept only a valid inclusive numeric range, query the authenticated user’s attack collection for that range, and return a stable `getTornAttacks` response envelope.
- **FR-004**: The gym chart MUST display dated numeric speed, dexterity, strength, and defense post-training values from the existing log identifiers 5302, 5303, 5300, and 5301.
- **FR-005**: The crime chart MUST group valid numeric skill observations from log identifier 9005 by crime and sort each series chronologically.
- **FR-006**: The work chart MUST display cumulative manual, intelligence, and endurance values in date order, resetting the cumulative baseline when an absolute snapshot is encountered.
- **FR-007**: Work-stat data MUST be persisted in the existing `WorkStatsDB`/`work_stats` cache by date and duplicate dates MUST be safely replaced rather than duplicated.
- **FR-008**: The work-stat client MUST show valid cached data before or while live data is fetched and MUST limit retries when a relevant WebSocket response does not arrive.
- **FR-009**: The racing-position chart MUST read valid records from log identifier 8731, parse the accepted position value, and provide day, week, and month average/count aggregation.
- **FR-010**: Racing-position date filtering MUST occur before aggregation, and racing-skill values MUST be accepted only when the payload contains a valid date and numeric skill value.
- **FR-011**: The racing-skill handler MUST read only the authenticated user’s `Stats` collection and return chronologically ordered `racingskill` observations without database identifiers.
- **FR-012**: All charts in this feature MUST apply the inclusive `dateFrom`/`dateTo` range consistently and MUST report the earliest valid source day to the existing date-range controls when supported.
- **FR-013**: Invalid, missing, empty, or unavailable source data MUST be ignored or represented by a clear loading/empty/unavailable state; it MUST NOT become a fabricated zero or crash the chart surface.
- **FR-014**: Duplicate or replayed WebSocket messages MUST NOT create duplicate cache records, duplicate chart points, or unbounded request/retry loops.
- **FR-015**: WebSocket handlers MUST use the existing safe error constants/envelopes where available, log server-side diagnostic context, and avoid sending credentials, raw database errors, or internal stack traces to clients.
- **FR-016**: The statistics handler MUST preserve its existing authenticated Torn API integration, recent-snapshot throttling, optional API URL configuration, and dry-run response behavior while returning serializable responses.
- **FR-017**: Client-side database access and server-side collection/API operations MUST remain asynchronous and MUST close or release resources when an operation completes or fails.
- **FR-018**: Chart theme, visibility toggles, loading indicators, and existing chart component interfaces MUST remain compatible with the surrounding dashboard and WebSocket message bus.

### Key Entities

- **Daily Attack Summary**: A date-keyed record containing wins, losses, attacks, and defends for the authenticated user.
- **Gym Progression Point**: A timestamped post-training value for one of speed, dexterity, strength, or defense.
- **Crime Skill Observation**: A timestamped numeric crime skill value grouped by crime name.
- **Work Stat Record**: A date-keyed record containing incremental or absolute manual, intelligence, and endurance values.
- **Racing Position Event**: A timestamped racing log whose accepted position is derived from the first numeric character of the position string.
- **Racing Skill Snapshot**: A dated `Stats` snapshot containing one numeric racing-skill observation.
- **Analytics Date Range**: An inclusive optional lower and upper ISO day bound applied to displayed data.
- **Analytics WebSocket Envelope**: A typed request or response carrying a bounded range, data collection, success indicator, or safe error.
- **Local Analytics Cache**: A browser IndexedDB store used to provide immediate data and prevent duplicate work between refreshes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In verification fixtures containing valid records, 100% of the five chart surfaces render the expected non-empty series in chronological order and show only points within a selected valid date range.
- **SC-002**: In malformed-record fixtures, 100% of invalid records are excluded without preventing valid records in the same response or store from rendering.
- **SC-003**: When a valid local cache exists, the work and attack charts expose cached values before the live refresh completes in 100% of repeatable browser verification runs.
- **SC-004**: Replayed or duplicate WebSocket responses produce no additional duplicate cache keys, chart points, or more than the configured maximum number of retries in 100% of handler/component tests.
- **SC-005**: In authenticated handler tests, 100% of responses are scoped to the requested user and contain no API key, database identifier, or raw internal exception detail.
- **SC-006**: Invalid sessions, invalid ranges, empty stores, unavailable databases, and upstream failures produce a distinct safe client state or error envelope in 100% of verification scenarios.
- **SC-007**: The existing production build and focused Node test suite complete successfully after the feature changes, with no new synchronous database/network operations introduced in the targeted JavaScript modules.

## Assumptions

- Existing authentication, session objects, WebSocket dispatch, `LogsDB`, IndexedDB support, MongoDB collections, Chart.js registration, and `useChartTheme` remain available.
- The requested log identifiers and MongoDB field shapes represent the established application data contract; changing Torn’s external schema is outside this feature.
- The date controls and dashboard provide `dateFrom`, `dateTo`, `logsUpdated`, `wsMessages`, `sendWs`, and related props using the current component interfaces.
- The application may display no data for a new user until the relevant logs or snapshots have been synchronized.
- Client-side caches are convenience persistence, not the source of truth; malformed or unavailable cache data can be discarded safely.
- No new charting library, database, transport, or external notification dependency is required.

## Out of Scope

- Redesigning the dashboard navigation, authentication, WebSocket protocol, MongoDB schema, or Torn API client.
- Creating new Torn log collectors or changing the semantics of the existing log identifiers.
- Predictive analytics, recommendations, automated training, or actions in the Torn account.
- Exporting analytics, sharing private analytics, or exposing them through public/unauthenticated routes.
- Replacing Chart.js, IndexedDB, MongoDB, or the existing local cache strategy.
- Backfilling historical data that is not present in the existing logs, attacks, or stats collections.
