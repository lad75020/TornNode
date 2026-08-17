# Feature Specification: Realtime Application Runtime

**Feature Branch**: `feature/time-machine-realtime-application-runtime`

**Created**: 2026-08-17

**Status**: Draft

**Input**: User description: "Feature: Realtime Application Runtime. Users receive resilient realtime updates through authenticated WebSocket connections backed by the Fastify application runtime. Relevant files: server.cjs, socketEvents.cjs, routes/wsHandler.cjs, client/src/hooks/useAppWebSocket.js, client/src/hooks/useWsMessageBus.js, openapi-ws.yaml. Focus on this feature only; do not modify other features."

## Clarifications

### Session 2026-08-17

- Q: When an authenticated realtime connection is lost to a transient network or server hiccup, what recovery behavior is expected? → A: Automatically reconnect and resume realtime updates without the user losing place in the dashboard; a clean sign-out or auth failure (connection closed with code 4401) must NOT reconnect.
- Q: How should the client surface the connection state to the user? → A: A discrete, non-blocking status indicator (closed / connecting / open) that does not interrupt the primary dashboard experience.
- Q: What is the scope of this feature relative to the message payloads themselves? → A: This feature owns the transport/runtime resilience (connect, keep-alive, reconnect, status, dispatch, teardown, and unauthenticated closure) but NOT the business meaning of individual domain messages (e.g. logs import, networth, company data), which belong to their own features.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Establish an Authenticated Realtime Connection (Priority: P1)

As an authenticated user, when the private application loads, a WebSocket connection is opened on the same origin carrying my signed browser session, so realtime data can flow to my dashboard.

**Why this priority**: The authenticated realtime transport is the foundation on which every realtime feature depends; without a reliable, authenticated channel no downstream realtime capability works.

**Independent Test**: Sign in, load the private application, and confirm a single authenticated WebSocket connection is established on the same origin using the session cookie (no credentials in the URL or query string) and that a session greeting is received.

**Acceptance Scenarios**:

1. **Given** a valid authenticated session, **When** the private application mounts, **Then** a WebSocket connection is established on the same origin authenticated by the browser session, and realtime updates become available.
2. **Given** no valid authenticated state, **When** a realtime connection is attempted, **Then** it is treated as unauthenticated, closed with an unauthenticated status, and no private data is delivered.
3. **Given** a connection attempt, **When** it is established, **Then** identity is carried by the server-side session only, never by a token or credential embedded in the connection URL or query string.
4. **Given** a realtime connection and a feature that needs realtime, **When** the feature requests data, **Then** the request is delivered over the existing authenticated connection rather than opening an unauthenticated channel.

---

### User Story 2 - Reconnect Automatically After Transient Loss (Priority: P2)

As an authenticated user, if my realtime connection drops for a transient reason (network blip, server restart, idle keep-alive timeout recovery), the application reconnects on its own and my dashboard resumes receiving updates without me having to reload or re-sign in.

**Why this priority**: Realtime value is worthless if a single transient hiccup permanently degrades the dashboard; resilience is the defining property this feature name promises.

**Independent Test**: Establish a connection, force a transient disconnect (server restart, idle close, or network interruption), and confirm the connection recovers automatically and the dashboard resumes without user action. Contrast with a sign-out/auth failure, which must NOT auto-reconnect.

**Acceptance Scenarios**:

1. **Given** an established realtime connection, **When** the connection is lost for a transient reason, **Then** the application attempts to reconnect automatically on a bounded retry cadence.
2. **Given** an automatic retry, **When** the transient condition clears, **Then** the connection is re-established and updates resume with no user action.
3. **Given** a connection that is closed as a result of a sign-out or an authentication failure, **When** the close is observed, **Then** the application does not attempt to reconnect and instead surfaces a sign-in path.
4. **Given** many rapid reconnect attempts, **When** retries occur, **Then** the application avoids a tight reconnect loop that would hammer the server, and cleans up any pending retry when a successful connection is made or the component unmounts.
5. **Given** a connection that is no longer needed, **When** the owning view unmounts, **Then** the connection and its timers are fully cleaned up so no orphaned reconnect loop persists.

---

### User Story 3 - Observe the Connection Status (Priority: P3)

As an authenticated user, I can see whether my realtime connection is open, connecting, or closed so I understand when realtime data is live versus when the application is reconnecting.

**Why this priority**: Without a status signal the user cannot tell a live dashboard from a stale, silently-reconnecting one; this is the user-visible payoff of the connectivity work.

**Independent Test**: With a connection in each state (connecting, open, closed), confirm the user-visible status reflects it accurately and transitions promptly on change.

**Acceptance Scenarios**:

1. **Given** no connection yet, **When** the application mounts, **Then** the reported status is "connecting" or "closed" and transitions to "open" once the connection is established.
2. **Given** an open connection, **When** it is lost, **Then** the status reflects the disconnected/reconnecting state until it recovers to "open".
3. **Given** a status indicator, **When** the user interacts with the dashboard, **Then** the indicator does not block or interrupt the primary experience.

---

### User Story 4 - Deliver Realtime Messages to the Right Handlers (Priority: P4)

As an authenticated user using a realtime feature, the specific realtime messages my feature cares about are routed to its handlers so it updates reliably, unrelated messages are ignored, and a malformed message never crashes the runtime or blocks other messages.

**Why this priority**: A channel is only useful if its traffic is reliably and safely fanned out to the consuming features; this is the dispatch half of the runtime.

**Independent Test**: Emit a sequence of mixed valid and malformed realtime messages to a connection and confirm the matching handler for each valid message fires, an unknown/malformed message is ignored without error, and subsequent messages continue to be processed.

**Acceptance Scenarios**:

1. **Given** a feature registered for a specific realtime message type, **When** that message arrives, **Then** the feature's handler is invoked with the decoded message.
2. **Given** an unregistered or unrecognized message type, **When** it arrives, **Then** it is ignored cleanly without affecting other registered handlers.
3. **Given** a malformed or undecodable message, **When** it arrives, **Then** it is skipped without throwing and without blocking processing of later messages.
4. **Given** multiple features listening over one connection, **When** a batch of messages arrives, **Then** each is delivered to its registered handler and each handler reflects its latest intent (not a stale closure).
5. **Given** a long-running consumer, **When** the backlog of undelivered messages grows, **Then** it is bounded so memory does not grow unbounded over time.

---

### Edge Cases

- A transient server restart mid-session: the client reconnects and resumes; no private data is lost from the user's place.
- An idle connection that the server closes via keep-alive timeout: the client's heartbeat or reconnect restores or re-establishes it.
- A sign-out while a connection is open: the close is recognized as auth-driven and does NOT auto-reconnect.
- A network partition that returns before a retry fires: the pending retry is cancelled when the socket recovers, avoiding a duplicate/stacked reconnect.
- Rapid mount/unmount of the owning view: no orphaned sockets, timers, or reconnect loops survive unmount.
- An undecodable/oversized inbound frame: it is skipped or bounded and logged at a safe level without surfacing internal details, and does not stop the runtime.
- Two features depending on the same realtime message: both handlers fire (a single shared connection fans out to all registered handlers).
- A real-time feature that arrives before the connection is open: its request is queued or retried once the connection reaches "open" rather than dropped.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST open the realtime connection(s) on the same origin as the page, choosing the secure (TLS-wrapped) protocol automatically when the page is served over HTTPS.
- **FR-002**: Authentication of a realtime connection MUST be carried by the server-side authenticated browser session (cookie), and MUST NOT embed credentials, tokens, or session identifiers in the connection URL or query string.
- **FR-003**: Unauthenticated or invalid realtime connections MUST be closed with a distinct "unauthenticated" status and MUST NOT receive private data or trigger private handlers.
- **FR-004**: The application MUST attempt automatic reconnection after a *transient* disconnection on a bounded, non-hammering retry cadence, and MUST NOT reconnect after a sign-out or authentication failure.
- **FR-005**: On mount the application MUST establish the realtime connection(s); on unmount it MUST fully close the connection and cancel all pending timers and reconnect retries so no orphaned loop persists.
- **FR-006**: The server runtime MUST keep each open connection alive with a keep-alive heartbeat and detect a dead peer (no response) within a bounded timeout, closing it cleanly so it can be re-established.
- **FR-007**: The application MUST expose a discrete, non-blocking connection status (connecting / open / closed) that updates promptly when the state changes.
- **FR-008**: Inbound realtime messages MUST be dispatched by type to registered handlers; unregistered and malformed/undecodable messages MUST be ignored without throwing and without blocking later messages.
- **FR-009**: Registered handlers MUST always observe the message batch as of the latest update and reflect their latest intent, avoiding stale captured state that would drop or misroute new messages.
- **FR-010**: The undelivered-message backlog held for a consumer MUST be bounded to a maximum size so memory stays bounded during long sessions.
- **FR-011**: The server MUST treat the authenticated server session as the sole source of identity for private realtime operations; no token/bearer/query-string fallback MAY grant private access.
- **FR-012**: Private realtime operations that fail due to a dependency (data store, session store, or upstream service) MUST surface a generic, recoverable failure without leaking internal exception details or sensitive data.
- **FR-013**: The realtime contract (endpoints, client-to-server and server-to-client message types, keep-alive timings) MUST remain documented in the WebSocket contract document so handlers and consumers stay in sync.

### Key Entities

- **Realtime Connection**: A single authenticated WebSocket between the browser and the server runtime, identified only server-side by its browser session; carries keep-alive heartbeat and reconnect lifecycle.
- **Connection Status**: The user-visible lifecycle state of a connection (closed, connecting, open) with the reconnect/abort distinction.
- **Realtime Message**: A typed inbound or outbound payload flowing on a connection; routed by `type` to the handler(s) registered for it.
- **Message Handler Registration**: A feature's subscription of itself to one or more message types, kept current across updates so dispatch uses the latest intent.
- **Keep-alive Watchdog**: The server-side heartbeat/timeout mechanism deciding when a connection's peer is dead and should be closed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a signed-in load to first received realtime update, a healthy environment reports the connection "open" and the user sees live data without any manual reload or sign-in.
- **SC-002**: After a simulated transient disconnect, the connection recovers automatically and resumes delivering updates within a bounded, predictable window, with zero user action and no lost place in the dashboard.
- **SC-003**: A sign-out or authentication failure results in exactly zero automatic reconnection attempts for that connection.
- **SC-004**: No private realtime operation is ever accessible to an unauthenticated connection, measured as 100% of unauthenticated connection attempts receiving the "unauthenticated" close and no private data.
- **SC-005**: Injecting an intermixed stream of malformed and unregistered messages causes zero runtime errors thrown to the user and zero blocked subsequent deliveries.
- **SC-006**: Over a long session, the per-consumer undelivered-message backlog never exceeds its configured bound.
- **SC-007**: Repeated rapid mount/unmount cycles of the owning view leave zero orphaned sockets, timers, or reconnect loops (no growth in live connections after the final unmount).

## Assumptions

- The server runtime is the Fastify application described in the queue (HTTP + WebSocket on the same host, default local port, TLS for production), and the browser uses same-origin secure-websocket URLs.
- "Realtime updates" in this feature's scope means the transport/runtime resilience and dispatch; the business meaning and payload shapes of specific domain messages (logs import, networth, company analytics, bazaar prices) are owned by their own features and are only *consumed* here.
- The browser's signed session cookie remains valid as long as the user's session is valid (a rolling inactivity window governed by the Authentication and Sessions feature); realtime connections depend on that session rather than re-authenticating.
- A "transient" disconnect is any close that is not the sign-out/auth-failure close (connection closed as "unauthenticated"). All other closes are treated as transient and eligible for reconnect.
- The WebSocket contract document is the source of truth for message types; new message types are added there before a consumer is written.
- Keep-alive and reconnect timing may be tuned via environment/CLI configuration with sensible defaults, without changing behavior otherwise.
- Bounded backlogs and bounded reconnect cadence exist to protect memory and server load; exact bound values are configuration, not user-facing guarantees.

## Out of Scope

- The business logic, payload shaping, or persistence of any individual domain realtime message (owned by their own features: data synchronization, bazaar monitoring, wealth/finance analytics, etc.).
- The HTTP sign-in / sign-out flow itself (owned by the Authentication and Sessions feature); this feature consumes the resulting session.
- Public, unauthenticated realtime endpoints (owned by Bazaar Monitoring) except that this feature must not leak private data through them.
- Cross-device / cross-browser session invalidation policy (owned by Authentication and Sessions).
