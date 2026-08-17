# Feature Specification: Analytics Dashboard Shell

**Feature Branch**: `feature/time-machine-analytics-dashboard-shell`

**Created**: 2026-08-17

**Status**: Draft

**Input**: User description: "Feature: Analytics Dashboard Shell. Users can navigate a lazy-loaded chart dashboard, filter analytics by date, switch themes, and receive progress and result notifications. Relevant files: client/src/main.jsx, client/src/index.css, client/src/chartSetup.js, client/src/chartTheme.js, client/src/useChartTheme.js, client/src/dateFilterUtil.js, client/src/hooks/themeContext.js, client/src/hooks/useChartSlider.js, client/src/ToastHost.jsx, client/src/toastBus.js. Focus on this feature only; do not modify other features."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate the Analytics Dashboard (Priority: P1)

As an authenticated user, I can move between the application's chart views from one consistent dashboard shell so that I can inspect different analytics without losing the surrounding controls or waiting for every view to load up front.

**Why this priority**: Navigation is the shell's primary value. It gives users a usable entry point to the existing analytics views and keeps the dashboard responsive as the catalog grows.

**Independent Test**: Open the authenticated dashboard, select several chart views, and verify that each view renders in the shell, a loading state is shown while a view is being prepared, and an unavailable view produces a recoverable error instead of a blank page.

**Acceptance Scenarios**:

1. **Given** an authenticated user opens the dashboard, **When** the shell is ready, **Then** the user sees the current chart view, navigation controls, date controls, theme control, and notification region without an avoidable blank interval.
2. **Given** several chart views are available, **When** the user selects another view, **Then** only the selected view is made active, the shell remains mounted, and a clear loading state is shown until the view is ready.
3. **Given** a selected view cannot be loaded or has no usable data, **When** the failure is detected, **Then** the user sees a useful empty or error state with a way to continue to another view.
4. **Given** automatic chart rotation is enabled, **When** the rotation interval elapses, **Then** the dashboard advances to the next available view, wraps at the end, and stops advancing when automatic rotation is disabled or the dashboard is left.

---

### User Story 2 - Filter a Chart by Date (Priority: P1)

As an authenticated user, I can choose a start and end date for the active chart so that I can focus analysis on the period that matters to me.

**Why this priority**: Date filtering is the most important shared interaction across the analytics views and must be reliable before individual chart insights can be trusted.

**Independent Test**: Load a chart with daily labels, set valid start and end dates, switch the active chart, and verify that only points inside the selected range remain while invalid or empty ranges produce a safe result.

**Acceptance Scenarios**:

1. **Given** a chart has daily data, **When** the user chooses a valid start and end date, **Then** labels and every corresponding series are reduced to the same inclusive range.
2. **Given** the user enters a start date after the end date, **When** the range is applied, **Then** the dashboard prevents or rejects the invalid range and does not show misleading data.
3. **Given** the selected chart has a known earliest data date, **When** the user opens the date controls, **Then** the start date cannot be earlier than that date and the end date cannot be later than today.
4. **Given** the chosen range contains no records, **When** filtering completes, **Then** the chart remains usable and communicates that no data is available for that range.
5. **Given** the user switches to another chart, **When** the new chart becomes active, **Then** its date controls use that chart's valid bounds without applying an invalid range from the previous chart.

---

### User Story 3 - Choose a Consistent Display Theme (Priority: P2)

As an authenticated user, I can cycle between dark, light, and automatic display modes so that the dashboard remains readable in my environment and all charts use matching colors and contrast.

**Why this priority**: Analytics are difficult to interpret when chart colors, labels, controls, and the surrounding page disagree. Theme choice is a shared concern that should work consistently across all views.

**Independent Test**: Cycle through each display mode, reload the dashboard, and inspect both the shell and multiple chart types for readable text, grid lines, legends, controls, and data series.

**Acceptance Scenarios**:

1. **Given** the dashboard is in automatic mode, **When** the user cycles the theme, **Then** the dashboard enters a deliberate light or dark mode and indicates the active mode.
2. **Given** a deliberate theme is active, **When** the user cycles again, **Then** the dashboard returns to automatic mode and follows the available environment or location-based daylight signal.
3. **Given** the user has selected a deliberate theme, **When** the dashboard is reloaded, **Then** that preference is restored without requiring the user to set it again.
4. **Given** any display mode is active, **When** a chart is rendered or updated, **Then** chart text, grid lines, legends, tooltips, and series colors maintain sufficient contrast with the shell.
5. **Given** location access is unavailable or declined in automatic mode, **When** the dashboard chooses its display mode, **Then** it uses a predictable time-based fallback and remains fully usable.

---

### User Story 4 - Receive Dashboard Progress and Results (Priority: P2)

As an authenticated user, I can see progress, success, warning, and error notifications for dashboard operations so that I know whether a request is still running, completed, or needs attention.

**Why this priority**: Existing analytics and synchronization actions can take time. Trustworthy, non-blocking feedback prevents duplicate actions and makes long-running work understandable.

**Independent Test**: Emit progress updates, replace an existing operation notification, emit success and error results, dismiss a notification, and wait for normal expiration while confirming that the dashboard remains interactive.

**Acceptance Scenarios**:

1. **Given** an operation reports progress, **When** a notification is published, **Then** the user sees its title, current state, and useful progress information without leaving the dashboard.
2. **Given** the same operation reports a later progress value, **When** its notification is published with the same operation identity, **Then** the existing notification is updated rather than duplicated.
3. **Given** an operation completes or fails, **When** its terminal result is published, **Then** the notification changes to the matching success or error state and includes a recoverable message.
4. **Given** a temporary notification is visible, **When** its lifetime expires or the user dismisses it, **Then** it is removed and no timer continues to affect the dashboard.
5. **Given** diagnostic details are attached to an error notification, **When** the user inspects them, **Then** the dashboard does not reveal credentials, session secrets, or unrelated private data.

---

### User Story 5 - Use the Shell on Different Screens (Priority: P3)

As an authenticated user, I can use the dashboard controls on supported screen sizes and with keyboard navigation so that the shell does not hide data or make core actions unreachable.

**Why this priority**: The dashboard is a frequent-use surface. A responsive and operable shell prevents otherwise correct analytics from becoming inaccessible in ordinary browser windows.

**Independent Test**: Exercise the dashboard at narrow and wide viewport sizes using keyboard-only navigation and verify that chart controls, date fields, theme control, notifications, and loading states remain visible and operable.

**Acceptance Scenarios**:

1. **Given** a narrow supported viewport, **When** the dashboard is displayed, **Then** controls wrap or reflow without obscuring the active chart or creating avoidable horizontal clipping.
2. **Given** the user navigates with a keyboard, **When** focus moves through the shell, **Then** every interactive control has a visible focus state, a meaningful accessible name, and a usable order.
3. **Given** a loading or notification state is shown, **When** the state changes, **Then** the change is communicated without moving focus unexpectedly or trapping the user.

---

### Edge Cases

- The chart list is empty, contains one chart, or changes while automatic rotation is active; navigation remains bounded and does not divide by zero or select an unavailable view.
- Daily labels are absent, mixed with weekly/monthly labels, unsorted, or contain malformed dates; the dashboard leaves unsupported formats unchanged or shows a safe state rather than filtering incorrectly.
- A date range is empty, reversed, outside the chart's known bounds, or ends in the future; the controls reject or normalize it before data is presented.
- A chart has no datasets, datasets with different lengths, or no records in the selected range; labels and series remain aligned and the empty state is explicit.
- Theme preference storage is unavailable or contains an unknown value; the dashboard falls back to automatic mode without blocking startup.
- Daylight or geolocation data is unavailable, stale, or invalid; automatic mode uses its deterministic fallback and cleans up scheduled recalculations.
- A notification arrives after the shell unmounts, two notifications use the same operation key, or an expiration timer races with dismissal; no stale listener or timer remains.
- A chart view fails during loading, a user switches views rapidly, or the WebSocket is temporarily unavailable; the shell remains usable and does not display stale results as current.
- A large dataset is rendered; shared chart defaults may reduce visual overload while preserving the user's ability to inspect the data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST provide one consistent authenticated shell for the available chart views, shared controls, loading states, empty states, and recoverable errors.
- **FR-002**: The dashboard MUST allow the user to select a chart view and MUST keep the selected view within the available view range.
- **FR-003**: The dashboard MUST load chart views on demand and MUST show a non-blank loading state while a selected view is being prepared.
- **FR-004**: The dashboard MUST support optional automatic chart rotation, advance at a bounded interval, wrap to the first available view, and clean up its timer when disabled or unmounted.
- **FR-005**: The dashboard MUST expose start and end date controls for the active chart and MUST prevent a start date later than the end date.
- **FR-006**: Date filtering MUST be inclusive, preserve label-to-series alignment, and apply the same selected slice to every dataset in a supported daily series.
- **FR-007**: Date controls MUST respect the active chart's earliest known date and MUST NOT allow an end date later than today.
- **FR-008**: The dashboard MUST communicate an explicit no-data state when a valid range produces no records and MUST avoid presenting stale data as the current range.
- **FR-009**: The dashboard MUST provide dark, light, and automatic display modes and MUST visibly indicate which mode is active.
- **FR-010**: Theme changes MUST update shell controls and shared chart presentation, including readable text, grid lines, legends, tooltips, and data-series colors.
- **FR-011**: The dashboard MUST retain deliberate theme and automatic-rotation preferences across a page reload when browser preference storage is available, and MUST use safe defaults when it is not.
- **FR-012**: Automatic theme mode MUST use available daylight or environment information and MUST fall back deterministically when that information is unavailable or declined.
- **FR-013**: The dashboard MUST provide non-blocking notifications for progress, success, warning, and error states generated by dashboard operations.
- **FR-014**: Notifications MUST support stable operation identities so later progress or terminal results replace the matching notification rather than creating duplicates.
- **FR-015**: Temporary notifications MUST expire or be dismissible, and all notification listeners and timers MUST be released when no longer needed.
- **FR-016**: Notifications and diagnostic details MUST not expose credentials, session secrets, or unrelated private data.
- **FR-017**: The shell MUST remain usable at supported narrow and wide viewport sizes and through keyboard navigation, with visible focus and meaningful accessible names for core controls.
- **FR-018**: Shared chart setup and presentation behavior MUST be initialized safely when the application loads more than one chart view and MUST tolerate repeated development-time initialization.

### Key Entities

- **Chart View**: A selectable analytics view with a stable position, title, loading state, available data range, labels, and one or more datasets.
- **Date Filter**: The inclusive start and end dates applied to the active chart, together with the active chart's valid minimum date and the current-day maximum.
- **Theme Preference**: The user's deliberate light/dark choice or automatic mode, plus the resolved display mode currently applied to the shell and charts.
- **Notification Event**: A progress, success, warning, or error update with an optional stable operation key, title, message, lifetime, and safe diagnostic detail.
- **Dashboard Navigation State**: The active chart position, automatic-rotation setting, and lifecycle state of its scheduled transitions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a representative dashboard session, users can move from the initial chart to at least five other available chart views, and every transition shows either the selected view or a clear loading/error state without a blank shell.
- **SC-002**: For a daily dataset with at least 1,000 points and three aligned series, applying a valid range returns the correctly sliced labels and series within 100 ms in the supported browser environment.
- **SC-003**: 100% of invalid date ranges in the acceptance test suite are rejected or normalized before the dashboard presents filtered results.
- **SC-004**: Across light, dark, and automatic modes, all core chart text and controls meet the project's visual contrast/accessibility checks and remain readable in manual review.
- **SC-005**: After a page reload, at least 95% of supported sessions restore the user's deliberate theme and automatic-rotation choices when browser preference storage is available.
- **SC-006**: For an operation that emits ten progress updates and one terminal result, the dashboard displays no more than one notification for that operation at any time and reaches the terminal state within one update cycle.
- **SC-007**: After 100 notification expiry, dismissal, and shell-unmount cycles, the test environment reports zero active dashboard notification timers or subscriptions.
- **SC-008**: Users can reach and operate chart selection, date filtering, theme, and notification controls using keyboard navigation at both the narrowest and widest supported viewport sizes.

## Assumptions

- Authentication and authorization are provided by the existing application session; this feature does not create or change user accounts.
- The analytics chart views and their data providers already exist or are delivered by separate features; this shell coordinates them but does not define domain-specific calculations.
- Daily labels use the canonical `YYYY-MM-DD` representation; unsupported weekly or monthly label formats are not force-converted by the shared date filter.
- Browser-local preference storage is available in the normal supported environment; storage failures are treated as a recoverable degradation.
- Automatic theme mode may use browser geolocation only when available and permitted; declining access must not block dashboard use.
- Notification content is supplied by existing dashboard and synchronization operations; this feature defines presentation, replacement, expiry, and safety boundaries rather than the operations themselves.
- The existing charting and WebSocket integrations remain the supported sources for chart rendering and progress/result events.

## Out of Scope

- User registration, sign-in, sign-out, session creation, or access-control policy changes.
- New analytics calculations, new Torn data synchronization behavior, or changes to MongoDB, Redis, or IndexedDB retention.
- Redesigning each individual chart's domain-specific visualization beyond shared shell, theme, date-filter, and notification contracts.
- A new notification delivery channel, server-side notification persistence, or cross-device notification history.
- Replacing the existing charting, WebSocket, routing, or browser storage integrations.
