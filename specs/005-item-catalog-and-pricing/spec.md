# Feature Specification: Item Catalog and Pricing

**Feature Branch**: `feature/time-machine-item-catalog-and-pricing`
**Created**: 2026-08-17
**Status**: Draft
**Input**: Queue feature `item-catalog-and-pricing`: users can browse/filter Torn items, inspect current prices, update stored prices, and keep the catalog synchronized locally.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and filter the item catalog (Priority: P1)

As an authenticated user, I want to search the available Torn items and filter them by type so that I can quickly find an item while using the Item Prices view.

**Why this priority**: Item discovery is the primary purpose of the catalog surface and is required before a user can inspect or refresh a price.

**Independent Test**: With a valid catalog available, open the Item Prices view, search by an item-name prefix, select a type, and verify that only matching catalog entries are shown with their available identifying information and price.

**Acceptance Scenarios**:

1. **Given** an authenticated user and a populated catalog, **When** the user opens Item Prices, **Then** the view displays a searchable item input and a type filter.
2. **Given** catalog items whose names differ only by letter case, **When** the user enters a case-insensitive name prefix, **Then** all items beginning with that prefix are eligible results.
3. **Given** catalog items with one or more non-empty types, **When** the user opens the type filter, **Then** the available types are listed once each and in a stable, readable order.
4. **Given** a selected type, **When** the user searches or browses the catalog, **Then** only items belonging to that type are displayed.
5. **Given** a query or type with no matches, **When** the filter is applied, **Then** the view shows a clear no-results state without removing the underlying catalog.

---

### User Story 2 - Use and synchronize a local catalog (Priority: P1)

As an authenticated user, I want the catalog to load from the most recent valid local copy and refresh only when necessary so that Item Prices remains responsive and usable across tabs.

**Why this priority**: A local-first catalog avoids unnecessary network requests and keeps the price workflow usable when a refresh is delayed or temporarily unavailable.

**Independent Test**: Seed the browser with a valid local catalog, exercise fresh, stale, missing, malformed, empty, and persistence-failure cases, and verify the displayed data and synchronization marker for each case.

**Acceptance Scenarios**:

1. **Given** a valid local catalog newer than ten minutes, **When** the user opens Item Prices, **Then** the local catalog is displayed immediately and no catalog refresh request is sent solely because the view opened.
2. **Given** no local catalog or a local catalog older than ten minutes, **When** the user opens Item Prices, **Then** the view requests a fresh catalog while retaining any valid local entries already available.
3. **Given** a fresh catalog is successfully received and persisted, **When** another open tab receives the storage synchronization notification, **Then** that tab reloads the new catalog without polling.
4. **Given** an incoming catalog is malformed, empty, or cannot be committed, **When** synchronization completes, **Then** the last valid local catalog remains available and the synchronization marker is not advanced.
5. **Given** a catalog persistence operation succeeds, **When** synchronization completes, **Then** the synchronization marker represents that successful commit rather than merely the receipt of a response.
6. **Given** the user is not authenticated, **When** the Item Prices view attempts to load, **Then** the catalog is not exposed and the user is returned to the application’s existing authentication entry point.

---

### User Story 3 - Inspect and refresh an item price (Priority: P1)

As an authenticated user, I want to see an item’s current stored price and request a price refresh so that the displayed price can be kept useful for market decisions.

**Why this priority**: Price visibility and correction are the core value of the feature after an item has been found.

**Independent Test**: Select a catalog item, verify its current price, request a refresh with and without a supplied price, and verify successful and unsuccessful responses in both the view and the local catalog.

**Acceptance Scenarios**:

1. **Given** a catalog item with a stored price, **When** the item appears in results, **Then** its name and current price are visible together.
2. **Given** a selected item, **When** the user requests a price refresh, **Then** the view provides immediate in-progress feedback and prevents accidental duplicate refreshes during the short refresh window.
3. **Given** a non-negative supplied price, **When** the refresh is processed, **Then** the stored item price is updated to that value and the response identifies the item and resulting price.
4. **Given** no usable supplied price but an available authorized market source, **When** the refresh is processed, **Then** the current market price is obtained from that source and stored for the item.
5. **Given** a successful price response, **When** the client receives it, **Then** the visible item and its valid local catalog copy reflect the returned price.
6. **Given** an invalid item identifier, unavailable price source, or persistence failure, **When** the refresh is processed, **Then** the client receives a safe failure response and the previously stored price is not replaced with an invalid value.

---

### User Story 4 - Receive a complete and reliable catalog (Priority: P2)

As an authenticated user, I want catalog responses to contain complete item records and remain available when the fast data source is unavailable so that search and price display are trustworthy.

**Why this priority**: Consistency protects every client workflow that consumes catalog data, while cache fallback limits disruption during infrastructure problems.

**Independent Test**: Exercise a complete cache, an incomplete cache, a cache read failure, a complete authoritative source, an incomplete authoritative source, and an unauthenticated request, then verify the response and failure behavior.

**Acceptance Scenarios**:

1. **Given** a complete cached catalog, **When** an authenticated client requests the catalog, **Then** the response contains the cached catalog without requiring an authoritative read.
2. **Given** a missing, invalid, or incomplete cached catalog, **When** an authenticated client requests the catalog, **Then** the service falls back to the authoritative catalog source.
3. **Given** an authoritative catalog containing incomplete records, **When** the service validates it, **Then** it rejects the response rather than returning partial catalog data.
4. **Given** the authoritative source returns a complete catalog, **When** the response is prepared, **Then** the successful catalog may be used to restore the fast data source for later requests.
5. **Given** an unauthenticated request or a catalog retrieval failure, **When** the service responds, **Then** it returns a non-success result without leaking credentials, session details, or internal failure information.

### Edge Cases

- The local catalog contains valid records but its synchronization marker is missing or unreadable.
- The server returns a successful envelope with a non-array, empty, or partially malformed item collection.
- A catalog commit fails after the incoming response has been received.
- Two tabs receive synchronization notifications close together.
- A type value is blank, padded with whitespace, or duplicated across items.
- An item has no current price, a zero price, or a price that is not numeric.
- A user clicks the same price-refresh control repeatedly or refreshes multiple different items.
- The cache is unavailable while the authoritative catalog is available.
- The authoritative catalog is unavailable while a previously valid local copy exists.
- A response arrives after the Item Prices view has been closed or unmounted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Item Prices view MUST be available only to an authenticated application session.
- **FR-002**: The view MUST allow a user to search catalog item names by a case-insensitive prefix.
- **FR-003**: The view MUST provide a type filter derived from non-empty item type values, with duplicates removed.
- **FR-004**: Selecting a type MUST restrict displayed results to that type; clearing the type MUST restore the name-search behavior.
- **FR-005**: The view MUST display a clear no-results state when the active search and type criteria match no items.
- **FR-006**: The client MUST use the most recent valid local catalog immediately when one exists and MUST request a fresh catalog when no local catalog exists or the local catalog is older than ten minutes.
- **FR-007**: A successful catalog synchronization MUST persist a complete valid catalog before marking it as the latest synchronization.
- **FR-008**: The client MUST preserve the last valid local catalog when an incoming catalog is invalid, empty, or cannot be committed.
- **FR-009**: Successful synchronization MUST notify other open application tabs so they can refresh their catalog and type options without polling.
- **FR-010**: Catalog retrieval MUST validate the authenticated session before returning item data and MUST fail safely when authentication is absent or invalid.
- **FR-011**: Catalog retrieval MUST prefer a complete fast-source catalog and MUST fall back to the authoritative catalog source when the fast source is unavailable, invalid, or incomplete.
- **FR-012**: A successful catalog response MUST contain only complete item records with the fields required by the Item Prices view, including a stable identifier, name, price value, image representation, and description.
- **FR-013**: The price-refresh action MUST accept a non-negative supplied price or obtain a current price from the authorized market source when no usable supplied price is provided.
- **FR-014**: A valid price update MUST persist the resulting price for the identified item and return a response identifying the item and resulting price.
- **FR-015**: The client MUST update both the visible item and its local catalog copy only after receiving a successful valid price response.
- **FR-016**: Invalid identifiers, invalid prices, unavailable price sources, and persistence failures MUST NOT overwrite a previously valid stored price with invalid data.
- **FR-017**: Price refresh controls MUST provide short-lived in-progress feedback and MUST avoid duplicate requests caused by repeated activation of the same control within that window.
- **FR-018**: Catalog synchronization and price refresh failures MUST expose a safe user-facing failure state without exposing credentials or internal service details.
- **FR-019**: Catalog loading and price operations MUST not alter the existing watched-item selection behavior integrated with the Item Prices view.
- **FR-020**: The feature MUST leave the application’s existing authentication, WebSocket message routing, and user-facing navigation semantics intact except where required to satisfy these catalog and pricing requirements.

### Key Entities

- **Item**: A catalog entry with a stable identifier, display name, optional type, current price, image representation, and description.
- **Item Catalog**: The complete set of valid Item records available to the authenticated application session.
- **Local Catalog Snapshot**: The last successfully persisted valid Item Catalog used for immediate display and offline-tolerant behavior.
- **Catalog Synchronization Marker**: The client-visible record of the last successful local catalog commit.
- **Price Refresh**: A request to replace one Item’s stored price with a validated supplied price or an authorized current market price.
- **Watched Item Selection**: Existing user selection state associated with catalog rows; it is preserved by this feature but is not otherwise redesigned.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a browser with a valid fresh local snapshot, at least 95% of Item Prices openings render the local catalog without waiting for a catalog network response.
- **SC-002**: For a catalog already loaded in memory, at least 95% of name-prefix or type-filter interactions update the visible result set within 200 milliseconds on the supported development target.
- **SC-003**: 100% of malformed, empty, or failed catalog commits leave the previously valid local snapshot and synchronization marker unchanged.
- **SC-004**: 100% of successful price refresh responses that contain a valid item identifier and numeric price update both the visible result and the local catalog snapshot.
- **SC-005**: 100% of unauthenticated catalog requests and invalid price-refresh requests return a safe non-success response and do not disclose credentials or internal error details.
- **SC-006**: A complete cached catalog is served without an authoritative catalog read, and an incomplete or unavailable cached catalog is followed by a validated authoritative fallback in integration verification.
- **SC-007**: Existing watched-item selections remain unchanged across catalog loading, synchronization, filtering, and successful price updates.

## Assumptions

- The existing authenticated session and WebSocket transport remain the application’s supported communication path.
- The application has one shared authoritative Torn item catalog; item records are not tenant-specific.
- The existing authorized market integration is the source of truth when a price must be refreshed without a supplied value.
- Item Prices is an authenticated application surface; public catalog exposure is not part of this feature.
- The ten-minute freshness threshold is the accepted default for deciding whether a local catalog should be refreshed.
- Existing watched-item behavior belongs to the surrounding Bazaar alert workflow and must be preserved rather than redefined here.

## Out of Scope

- Redesigning authentication, session lifetime, or WebSocket connection management.
- Creating new item types, editing item names/descriptions/images, or importing a different Torn catalog schema.
- Historical price charts, price alerts, or market trading actions.
- Replacing the existing Item Prices modal or the existing watched-item/Bazaar alert interaction model.
- Exposing the catalog to unauthenticated or public users.
- Introducing a new client dependency manager or moving front-end dependencies out of the repository root configuration.
