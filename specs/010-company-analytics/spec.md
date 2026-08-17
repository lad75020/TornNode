# Feature Specification: Company Analytics

**Feature Branch**: `feature/time-machine-company-analytics`
**Created**: 2026-08-17
**Status**: Draft
**Input**: User description: "Users can capture and analyze company stock, profile, details, training ranges, and historical trends."

## User Scenarios & Testing

### User Story 1 - View current company snapshots (Priority: P1)

An authenticated user can open the company analytics cards and see the latest available company stock, profile, and detailed-company snapshots. Each card identifies loading, empty, reused, and error states without exposing an API key or a raw exception to the page.

**Why this priority**: Current company state is the foundation for every historical and training analysis.

**Independent Test**: Send authenticated WebSocket snapshot responses containing valid data, empty data, a reused snapshot, and an error; verify each card renders the corresponding state and never renders an unhandled exception.

**Acceptance Scenarios**:

1. **Given** an authenticated WebSocket session, **when** the user opens the dashboard, **then** stock, profile, and detailed-company requests are sent through the existing message boundary and each response is displayed in its matching card.
2. **Given** a valid snapshot response, **when** the response contains stock, profile, or details data, **then** the corresponding chart renders finite values and a human-readable timestamp.
3. **Given** a snapshot is unavailable or the server reuses an existing snapshot, **when** the response is received, **then** the card shows an explicit empty or reused state and remains usable.
4. **Given** a snapshot request fails or the session is unauthorized, **when** the response is received, **then** the card shows a safe error state and does not display credentials or a raw stack trace.

---

### User Story 2 - Explore company history (Priority: P1)

An authenticated user can request stock, profile, and detailed-company history for a selected time range and inspect normalized metric series in the corresponding charts.

**Why this priority**: Trends let users understand how the company changes instead of seeing only one snapshot.

**Independent Test**: Provide historical responses with mixed timestamp units, legacy stock shapes, missing metrics, duplicate points, and an empty range; verify the charts normalize valid points, ignore invalid values, and show a clear no-data state.

**Acceptance Scenarios**:

1. **Given** a valid time range, **when** the user requests stock history, **then** the chart renders a chronological total and item series using the requested range.
2. **Given** a valid time range, **when** the user requests profile or details history, **then** the user can select available metrics and the chart renders only finite points for that metric.
3. **Given** a response containing legacy array or object stock records, **when** history is normalized, **then** both supported shapes produce equivalent chartable item series.
4. **Given** a range with no matching records or no usable metric values, **when** history loading completes, **then** the chart shows an empty state rather than a blank or misleading zero-valued graph.
5. **Given** the user changes the range or metric while a prior request is pending, **when** a stale response arrives, **then** it cannot replace the newer request's result or leave the chart stuck in loading state.

---

### User Story 3 - Analyze company training ranges (Priority: P2)

An authenticated user can select a start and end time for company training activity and review daily aggregated working-stat results in the existing work-statistics chart.

**Why this priority**: Training analysis connects company activity to progression decisions and complements snapshot trends.

**Independent Test**: Send valid, reversed, equal, and non-numeric ranges with representative working-stat records; verify valid ranges aggregate deterministically and invalid ranges return a safe error state without a server exception.

**Acceptance Scenarios**:

1. **Given** a start time earlier than an end time, **when** the user requests a training range, **then** the chart receives daily aggregated results with stable date labels and finite values.
2. **Given** an equal, reversed, missing, or non-numeric range, **when** the request is received, **then** the server rejects it with a safe `companyTrainRange` response and the UI remains interactive.
3. **Given** no work-stat records exist in the requested range, **when** aggregation completes, **then** the chart reports no data and does not invent activity.

---

### User Story 4 - Keep company data private and resilient (Priority: P2)

A user can refresh company analytics without leaking data across accounts, while the system reuses recent snapshots according to its existing cache policy and remains responsive when WebSocket messages are malformed or arrive out of order.

**Why this priority**: Company snapshots contain private account data and are requested frequently from a long-lived realtime connection.

**Independent Test**: Invoke each company handler with two different authenticated session identities and with missing credentials; verify database selection follows the authenticated user identity, unauthorized requests are rejected, and malformed messages do not crash the page.

**Acceptance Scenarios**:

1. **Given** two authenticated sessions, **when** each session requests a snapshot or history, **then** reads and writes are isolated to that session's user database.
2. **Given** a session without a Torn API key, **when** it invokes a company handler, **then** the handler returns an unauthorized response without calling the external API or database for another user.
3. **Given** a recent reusable snapshot, **when** the user refreshes within the reuse window, **then** the response identifies the reused data and the UI remains able to request an explicit refresh later.
4. **Given** malformed JSON, an unknown metric, a non-finite number, or an out-of-order response, **when** the message bus receives it, **then** the dashboard ignores or safely reports it without unbounded state growth or a render crash.

### Edge Cases

- The external company payload is valid JSON but has no `company_stock`, `company`, or `company_detailed` field.
- A historical record has a timestamp in seconds while another uses milliseconds.
- A metric is `null`, a string that is not numeric, `Infinity`, or an object instead of a finite number.
- Multiple records have the same timestamp or arrive in an order different from the requested range.
- A user changes charts or date ranges before the WebSocket response arrives.
- The WebSocket closes while a snapshot or history request is pending.
- The authenticated session expires between the UI request and handler execution.
- A legacy database contains `stock` records where current code expects `stocks`.

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow authenticated dashboard users to request current company stock, profile, and detailed-company snapshots through the existing WebSocket boundary.
- **FR-002**: System MUST return a typed response for every company snapshot request, including success, reused, empty, and unauthorized or safe-error outcomes.
- **FR-003**: System MUST persist or reuse company snapshots according to the existing per-user snapshot policy and MUST associate every snapshot with the authenticated session identity.
- **FR-004**: System MUST provide stock, profile, and detailed-company history responses for an optional bounded time range.
- **FR-005**: System MUST normalize supported legacy stock shapes into one chartable item-series representation.
- **FR-006**: System MUST expose only finite, chronologically ordered metric points to company history charts and MUST omit missing or invalid metrics.
- **FR-007**: System MUST let users choose among metrics returned by profile and details history without requiring a page reload.
- **FR-008**: System MUST validate company training range boundaries before querying or aggregating data and MUST reject invalid ranges with a typed response.
- **FR-009**: System MUST aggregate valid company training activity by stable calendar-day keys for the requested range.
- **FR-010**: System MUST render explicit loading, empty, error, and reused states for company charts and MUST keep controls usable after a failed request.
- **FR-011**: System MUST prevent stale, malformed, or out-of-order WebSocket messages from replacing a newer result or crashing a React render.
- **FR-012**: System MUST reject company requests without an authenticated Torn API key before making external API calls.
- **FR-013**: System MUST use the authenticated session's user identity for all company database reads and writes and MUST NOT fall back to a shared user database.
- **FR-014**: System MUST avoid logging or rendering Torn API keys, full external payloads, or raw server stack traces.
- **FR-015**: System MUST preserve lazy dashboard loading and existing WebSocket message types so unrelated analytics remain compatible.
- **FR-016**: System MUST add automated coverage for handler session isolation, range validation, history normalization, and chart handling of success, empty, and error responses.

### Key Entities

- **Company Snapshot**: A timestamped stock, profile, or detailed-company observation associated with one authenticated user.
- **Company History Series**: Chronologically ordered finite metric points derived from snapshots over a requested time range.
- **Training Range**: A validated start/end interval used to aggregate company working-stat activity by day.
- **Company Analytics Request**: A typed WebSocket message identifying a snapshot, history, or training-range operation and its optional range or metric parameters.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All four company chart journeys render a deterministic loading, success, empty, reused, or error state for every mocked response category.
- **SC-002**: 100% of valid finite history points in supported stock, profile, and details fixtures appear in chronological series, while invalid points are excluded.
- **SC-003**: 100% of company handler tests using distinct session identities observe only the requesting user's database.
- **SC-004**: Invalid training ranges are rejected before aggregation and produce a typed response in every validation test case.
- **SC-005**: The existing production build completes without adding a dependency or breaking lazy loading of unrelated dashboard charts.
- **SC-006**: Company error handling exposes no API key, raw external payload, or stack trace in automated response and logging assertions.

## Assumptions

- Existing authentication, Fastify, MongoDB, Redis/cache helpers, and WebSocket session middleware remain the source of truth.
- The Torn company identifier and external API access pattern already used by the current handlers remain unchanged for this feature.
- The existing React 19/Vite dashboard and Chart.js setup remain the presentation boundary.
- Historical data is limited to snapshots already captured for the authenticated user; this feature does not require a new public route or a new live polling service.
- The feature should reuse existing dependencies and CommonJS server conventions rather than introduce a new data or charting library.
- Users may have no company history yet, and empty data is a supported normal state.
