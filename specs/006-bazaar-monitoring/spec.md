# Feature Specification: Bazaar Monitoring

**Feature Branch**: `feature/time-machine-bazaar-monitoring`
**Created**: 2026-08-17
**Status**: Draft
**Input**: Queue feature `bazaar-monitoring`: users can watch bazaar items, track live minimum prices and thresholds, inspect sales history, and access a public bazaar view.

## Clarifications

### Session 2026-08-17

- Q: Which price should determine whether a watched item's threshold alert fires? → A: Lowest valid listing: alert when the current minimum price is at or below the threshold, and reset after the minimum rises above it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Watch items and monitor live prices (Priority: P1)

As a user, I want to choose bazaar items to watch and see their current lowest listing update as new market data arrives so that I can react to worthwhile prices without repeatedly searching.

**Why this priority**: Live monitoring is the central value of the Bazaar feature and is useful even when historical charts are unavailable.

**Independent Test**: Start with a known item catalog, watch one item, deliver valid and invalid market updates, and verify the displayed lowest listing, loading state, and failure behavior without using the history view.

**Acceptance Scenarios**:

1. **Given** a user has selected one or more valid items, **When** a valid market update arrives for a selected item, **Then** the current listing summary shows the item, its lowest valid price, the corresponding quantity, and the update time.
2. **Given** a user has selected an item, **When** the item is removed from the watch list, **Then** subsequent updates for that item no longer change the watched-item summary or trigger an alert.
3. **Given** several listings are received for the same item, **When** the update is processed, **Then** the summary identifies the lowest valid positive price and preserves the quantity associated with that listing.
4. **Given** a market update contains an invalid price, quantity, or item identifier, **When** the update is processed, **Then** the invalid entry is ignored and the last valid summary remains available.
5. **Given** the live market source is disconnected or temporarily unavailable, **When** the user views the monitoring surface, **Then** the user sees a clear stale or unavailable state rather than a misleading current-price claim.

---

### User Story 2 - Configure and receive price-threshold alerts (Priority: P1)

As a user, I want to set a target price for a watched item and receive a visible notification when its market price reaches that target so that I do not have to continuously watch the screen.

**Why this priority**: Threshold alerts turn passive price data into an actionable monitoring workflow.

**Independent Test**: Configure a threshold for a watched item, deliver prices above and below it in sequence, and verify alert triggering, suppression of repeated alerts, reset behavior, and persistence of the setting.

**Acceptance Scenarios**:

1. **Given** a watched item has a positive threshold, **When** its lowest valid listing price reaches or falls below the threshold, **Then** the user receives a visible alert that identifies the item, observed minimum price, and configured threshold.
2. **Given** an item remains below its threshold across repeated updates, **When** additional updates arrive without recovery above the threshold, **Then** the user does not receive duplicate alerts for the same below-threshold episode.
3. **Given** an item has triggered an alert, **When** a later valid price recovers above the threshold and subsequently reaches it again, **Then** a new alert may be delivered for the new episode.
4. **Given** a threshold is cleared, zero, negative, non-numeric, or otherwise invalid, **When** the setting is saved, **Then** the invalid threshold is rejected or removed and no threshold alert is generated for that item.
5. **Given** the user reloads the monitoring surface, **When** previously valid watch and threshold settings are restored, **Then** the settings are available without requiring the user to recreate them.

---

### User Story 3 - Inspect current and historical bazaar activity (Priority: P1)

As a user, I want to inspect recent sales or listing history and view daily price trends for watched items so that I can distinguish a temporary low price from a meaningful market movement.

**Why this priority**: Historical context makes live prices useful for analysis rather than only for one-off alerts.

**Independent Test**: Seed historical observations for one or more items, open the history view, change the date range, and verify chart data, empty states, and malformed-record handling independently of live alert delivery.

**Acceptance Scenarios**:

1. **Given** historical observations exist for a selected item, **When** the user opens the history view, **Then** the view shows the observations in chronological order with readable prices and dates.
2. **Given** the user chooses a valid date range, **When** the range is applied, **Then** the history view includes only observations within that range and keeps the selected item context.
3. **Given** several observations exist for a day, **When** the daily trend is displayed, **Then** the view presents a stable daily summary that can be compared across dates.
4. **Given** no history exists for the selected item or date range, **When** the view is opened, **Then** the user sees a clear empty state rather than an empty or misleading chart.
5. **Given** an observation is malformed or outside the accepted date and price boundaries, **When** history is loaded, **Then** it is excluded without preventing valid observations from being displayed.

---

### User Story 4 - Use a public bazaar view safely (Priority: P2)

As a visitor, I want to view the public bazaar market surface without signing in so that current market information is discoverable while protected application data remains private.

**Why this priority**: The public view broadens access to market information without weakening the authenticated application boundary.

**Independent Test**: Open the public bazaar view without an authenticated session, verify current market and watch interactions, and confirm that protected application data and authenticated-only navigation are not exposed.

**Acceptance Scenarios**:

1. **Given** a visitor has no authenticated session, **When** the public bazaar view is opened, **Then** the visitor can view the market surface and its public empty, loading, and error states.
2. **Given** a visitor selects or removes a watched item in the public view, **When** the visitor continues using that view, **Then** the selected state affects only the public market experience and does not require access to protected user data.
3. **Given** the public market source is unavailable, **When** the visitor opens or refreshes the view, **Then** the view shows a safe unavailable state without exposing credentials, session details, or internal errors.
4. **Given** a visitor attempts to access protected application data from the public view, **When** the request is evaluated, **Then** the protected data is not returned.

---

### Edge Cases

- The same item appears in multiple updates with different listing counts or seller information.
- A market update arrives after an item has been removed from the watch list.
- A valid update contains no listings, only invalid listings, or an unexpected payload shape.
- The live connection reconnects and delivers a stale update after a newer update was already displayed.
- A threshold is changed while an item is already in a below-threshold alert episode.
- A user configures thresholds or watches many items at once.
- Browser persistence is unavailable, cleared, or contains malformed saved state.
- A history request returns no rows, duplicate rows, future dates, or non-numeric prices.
- A date range has the start after the end or is only partially specified.
- The public view is opened while the authenticated session expires in another tab.
- A public visitor attempts a protected operation through a direct request rather than the visible UI.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The monitoring surface MUST allow a user to add and remove valid bazaar items from a watch list.
- **FR-002**: The monitoring surface MUST display the lowest valid positive listing price, its quantity, item identity, and observation time for each watched item when current data is available.
- **FR-003**: The system MUST validate item identifiers, prices, quantities, timestamps, and listing collections before using market data in the user interface or alerts.
- **FR-004**: The system MUST preserve the last valid market summary when a later update is malformed, empty, or unavailable.
- **FR-005**: The system MUST expose a clear loading, stale, disconnected, empty, and unavailable state rather than presenting missing data as current data.
- **FR-006**: The monitoring surface MUST allow a user to configure, update, and clear a price threshold for each watched item.
- **FR-007**: The system MUST evaluate a threshold against the lowest valid positive listing price for the watched item, alert when that minimum is at or below the threshold, and reset the alert episode only after the minimum rises above the threshold.
- **FR-008**: The system MUST suppress duplicate threshold alerts during one uninterrupted below-threshold episode and MUST allow a later alert after a valid recovery above the threshold.
- **FR-009**: Invalid thresholds MUST NOT create alerts and MUST be rejected or removed with a clear user-facing result.
- **FR-010**: Valid watch-list and threshold settings MUST remain available after a supported page reload when browser persistence is available.
- **FR-011**: The history view MUST display valid listing or sale observations in chronological order and support a user-selected date range.
- **FR-012**: The history view MUST provide a stable daily summary for days containing multiple valid observations.
- **FR-013**: The history view MUST preserve valid observations when individual records are malformed and MUST show a clear empty state when no valid observations match.
- **FR-014**: The public bazaar view MUST be accessible without an authenticated session and MUST expose only market data and public interactions defined by this feature.
- **FR-015**: Public requests MUST NOT return protected application data, credentials, session details, or internal error information.
- **FR-016**: The public view MUST support safe loading, empty, stale, and unavailable states without requiring authenticated-only navigation.
- **FR-017**: Live updates and history results MUST remain scoped to the correct item and date range, even when updates arrive out of order or after a view has changed.
- **FR-018**: The feature MUST preserve the application’s existing authentication, WebSocket routing, navigation, and user-notification semantics except where required by these requirements.

### Key Entities

- **Watched Item**: A valid bazaar item selected for live monitoring, identified by a stable item identifier and display name.
- **Market Listing**: A current or historical item offer with price, quantity, optional seller information, and observation time.
- **Market Snapshot**: The latest valid collection of listings used to calculate the current watched-item summary.
- **Price Threshold**: A user-configured target associated with one watched item and used by the alert rule.
- **Threshold Alert Episode**: The interval beginning when a qualifying price reaches a threshold and ending after a valid recovery above it.
- **Historical Price Observation**: A valid recorded market observation associated with an item and time, usable in history and daily summaries.
- **Daily Market Summary**: A date-bucketed summary of valid observations for an item.
- **Public Market View**: The unauthenticated market surface containing only explicitly public market data and interactions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 95% of valid live updates received while the monitoring surface is open, users see the corresponding current watched-item summary within five seconds.
- **SC-002**: In verification scenarios, 100% of invalid or malformed market records are excluded without replacing the last valid summary or preventing valid records from rendering.
- **SC-003**: In threshold verification scenarios, 100% of uninterrupted below-threshold episodes produce at most one alert, and a new alert is possible only after a valid recovery.
- **SC-004**: At least 95% of history queries with valid matching observations show the expected chronological observations and date-filtered results on the first attempt.
- **SC-005**: In verification scenarios, 100% of empty or unavailable market and history states provide a distinct user-facing state rather than a misleading zero or blank result.
- **SC-006**: The public market view is usable without authentication in 100% of public-view verification scenarios, while protected data remains unavailable in 100% of protected-access checks.
- **SC-007**: At least 95% of valid watch-list and threshold settings survive a supported reload when browser persistence is available.

## Assumptions

- The existing application authentication and realtime transport remain the supported communication paths for authenticated market monitoring.
- Market listings are supplied by the existing Torn market integration and prices are represented as positive whole-unit values for display and comparison.
- The public view is intentionally limited to market monitoring; it does not expose authenticated user analytics, account data, or private history.
- Public watch selections are local to the public browsing experience unless the clarification or plan explicitly establishes another persistence scope.
- Existing daily price aggregation and item storage are reused where they already provide the required historical observations.
- Supported browsers provide client-side persistence for authenticated watch and threshold settings; the feature provides a safe fallback when persistence is unavailable.
- Buying, selling, placing orders, and modifying Torn market data are outside this feature.

## Out of Scope

- Market trading, purchase execution, order placement, or seller contact.
- Redesigning authentication, session lifetime, or the general WebSocket protocol.
- Exposing account, attack, finance, or other protected analytics through the public view.
- Guaranteeing historical data that is not available from the existing market records or aggregation process.
- Replacing the application’s existing notification system or adding a separate notification provider.
- Creating a new item catalog or changing item identity, names, or descriptions.
