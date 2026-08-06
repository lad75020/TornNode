# Feature Specification: Authentication and Sessions

**Feature Branch**: `feature/time-machine-authentication-and-sessions`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "Feature: Authentication and Sessions. Users can sign in securely, maintain an authenticated session, access protected pages and WebSockets, and sign out. Relevant files: routes/authenticate.cjs, routes/protectIndex.cjs, ws/wsCheckSession.cjs, ws/wsDestroySession.cjs, client/src/Login.jsx, server.cjs. Focus on this feature only; do not modify other features."

## Clarifications

### Session 2026-08-06

- Q: What session expiration policy should govern authenticated access? → A: Rolling 24-hour inactivity timeout.
- Q: How should repeated failed sign-in attempts be constrained? → A: After 5 failures for an account or network source, enforce a 15-minute cooldown.
- Q: What scope should normal sign-out invalidate? → A: End only the current browser session.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign In Securely (Priority: P1)

As a registered user, I can submit my username and passkey and enter the private application when the credentials are valid.

**Why this priority**: Authentication is the entry point for every private capability and protects personal Torn data.

**Independent Test**: Submit valid and invalid credentials from a signed-out browser and verify that only valid credentials establish authenticated access.

**Acceptance Scenarios**:

1. **Given** a registered signed-out user, **When** the user submits a valid username and passkey, **Then** the user receives an authenticated session and enters the private application.
2. **Given** a signed-out user, **When** the user submits an invalid username or passkey, **Then** access remains denied and a generic authentication error is shown.
3. **Given** the sign-in request cannot be completed, **When** the request fails, **Then** the user remains signed out and receives a recoverable error without sensitive internal details.
4. **Given** a sign-in request is already in progress, **When** the user interacts with the form, **Then** duplicate submission is prevented until the request completes.

---

### User Story 2 - Retain and Verify Authenticated Access (Priority: P2)

As an authenticated user, I can navigate protected pages and use authenticated realtime features without repeatedly signing in while my session remains valid.

**Why this priority**: Session continuity is required for the dashboard and its realtime data to function reliably after initial sign-in.

**Independent Test**: Sign in once, navigate among protected pages, reload the application, and open an authenticated realtime connection while confirming identity continuity.

**Acceptance Scenarios**:

1. **Given** a valid authenticated session, **When** the user opens or reloads a protected page, **Then** the requested private content is available.
2. **Given** a valid authenticated session, **When** the user opens a protected realtime connection, **Then** the connection is associated with the same authenticated user.
3. **Given** no valid authenticated state, **When** a visitor requests protected content, **Then** access is denied and the visitor is directed to sign in.
4. **Given** invalid or expired authentication evidence, **When** a realtime connection is attempted or checked, **Then** the connection is treated as unauthenticated and private operations are unavailable.

---

### User Story 3 - Sign Out Completely (Priority: P3)

As an authenticated user, I can sign out so that the current session no longer grants access to private pages or realtime operations.

**Why this priority**: Users need a reliable way to end access, particularly on shared or unattended devices.

**Independent Test**: Sign in, sign out, then retry private page and realtime access using the same browser state and verify both are denied.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** the user signs out, **Then** the authenticated session in the current browser is invalidated without ending sessions in other browsers.
2. **Given** a completed sign-out, **When** the user revisits protected content, **Then** the user must authenticate again.
3. **Given** a completed sign-out, **When** an existing or new realtime connection attempts a private operation, **Then** it is rejected as unauthenticated.
4. **Given** session invalidation encounters a recoverable failure, **When** sign-out completes in the interface, **Then** private access is not presented as available and the user receives a safe retry path.

---

### User Story 4 - Access the Public Market Without Signing In (Priority: P4)

As a visitor, I can open the explicitly public market page without authenticating while all other private application areas remain protected.

**Why this priority**: The product intentionally exposes one public experience without weakening private route boundaries.

**Independent Test**: From a clean browser with no authenticated state, open the public market and then attempt each protected route.

**Acceptance Scenarios**:

1. **Given** an unauthenticated visitor, **When** the visitor opens the public market, **Then** the page is available without sign-in.
2. **Given** the same visitor, **When** the visitor moves from the public market to a protected area, **Then** authentication is required.

### Edge Cases

- Empty username or passkey values are rejected before authentication is attempted.
- Unknown users and incorrect passkeys produce the same generic response so account existence is not disclosed.
- Five failed sign-in attempts for either the same account or network source trigger a 15-minute cooldown without disclosing whether an account exists.
- Expired, malformed, missing, or revoked authentication evidence never grants protected page or realtime access.
- A session store or identity store outage fails closed: the user does not receive private access and sees a safe, retryable error.
- Concurrent sign-out and realtime activity invalidate or reject private operations once sign-out is accepted.
- Refreshing or directly navigating to a protected deep link while signed out returns the user to the sign-in experience without exposing cached private content.
- The explicitly public market remains accessible even when no authenticated session exists.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a sign-in form that accepts a username and passkey and prevents submission when either value is empty.
- **FR-002**: The system MUST validate submitted credentials against the registered user identity without exposing stored credential material.
- **FR-003**: The system MUST return the same user-facing failure outcome for unknown usernames and incorrect passkeys.
- **FR-004**: Successful sign-in MUST establish authenticated state linked to exactly one registered user.
- **FR-005**: Authenticated state MUST preserve the user identity and authorization context required by protected application operations and MUST expire after 24 consecutive hours without authenticated activity.
- **FR-006**: Protected page requests MUST require valid authenticated state and MUST fail closed when that state is absent, invalid, expired, or unverifiable.
- **FR-007**: Protected realtime connections and operations MUST require valid authenticated state associated with the same user identity as the private application session.
- **FR-008**: The system MUST provide a session-status check that reports inactive for missing, invalid, expired, or destroyed sessions.
- **FR-009**: The system MUST provide sign-out behavior that invalidates only the active session in the current browser and prevents its subsequent reuse for protected pages or private realtime operations without ending the user's sessions in other browsers.
- **FR-010**: Authentication failures MUST show actionable, non-sensitive messages and MUST NOT disclose secrets, credential hashes, identity-store details, or internal exception text.
- **FR-011**: Private responses and protected application entry pages MUST be delivered in a way that prevents shared or intermediary caches from serving them to unauthenticated visitors.
- **FR-012**: The public market route MUST remain accessible without authentication and MUST NOT grant access to any protected route or private operation.
- **FR-013**: After 5 failed authentication attempts for either the same account or the same network source, the system MUST reject further attempts covered by that limit for 15 minutes; limit responses MUST NOT disclose whether an account exists.
- **FR-014**: Authentication and session operations MUST fail closed when required identity or session dependencies are unavailable.
- **FR-015**: The sign-in experience MUST expose clear labels, progress state, error announcements, and keyboard-operable controls.

### Key Entities

- **Registered User**: A recognized application user identified by a unique username, with protected credential verification material, an application user identifier, an authorization type, and private Torn access context.
- **Authenticated Session**: A time-bounded server-recognized state linked to one registered user and used to authorize private page and realtime access.
- **Authentication Evidence**: A time-bounded proof issued after successful sign-in and presented when a protected interaction requires identity verification.
- **Protected Resource**: A page, deep link, realtime connection, or private operation available only while authenticated state is valid.
- **Public Resource**: An explicitly designated page available without authentication and isolated from private capabilities.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 95% of valid sign-in attempts complete and display the private application within 2 seconds under normal operating conditions.
- **SC-002**: In acceptance testing, 100% of requests with missing, invalid, expired, or destroyed authentication state are denied access to protected pages and private realtime operations.
- **SC-003**: After sign-out is accepted, the same browser state can no longer access any protected page or private realtime operation without signing in again.
- **SC-004**: Authenticated users can reload the application and navigate among protected areas without re-entering credentials while their session remains valid.
- **SC-005**: Invalid credential attempts never reveal whether the username exists and never expose internal error details in the user-facing response.
- **SC-006**: The public market is successfully accessible in 100% of unauthenticated route-boundary tests while every protected route in the same test suite remains inaccessible.
- **SC-007**: All sign-in form controls and authentication errors can be reached, operated, and understood with keyboard navigation and assistive technology labels.
- **SC-008**: In automated acceptance tests, the sixth failed attempt for either one account or one network source is rejected throughout a 15-minute cooldown, and legitimate attempts are accepted again after the cooldown expires.

## Assumptions

- User registration, passkey creation, passkey recovery, and account administration are outside this feature's scope; registered users already exist.
- Username and passkey remain the supported interactive sign-in credentials for this application.
- The application has one explicitly unauthenticated product area: the public market; all analytics, memory, and other private areas require authentication.
- Authentication state uses a rolling 24-hour inactivity timeout: authenticated activity renews the inactivity window, while 24 consecutive inactive hours require a new sign-in.
- Multiple browser sessions may coexist for one user; normal sign-out ends only the session in the browser where sign-out was requested.
- Existing user authorization type and Torn access context continue to determine what authenticated operations can perform; this feature does not redefine those permissions.
- Secure transport and production secret management are deployment prerequisites.
- Security event observability may be defined during planning, but user-facing responses never contain sensitive diagnostic details.
