# Research Notes: Company Analytics

## Native codebase-memory findings

The native `codebase-memory-mcp` index for `Volumes-WDBlack4TB-Code-tornnode` is ready and currently contains 5,003 nodes and 7,398 edges. A focused regex search returned 129 raw matches and 44 deduplicated symbol results across `client/src`, `ws`, `routes`, and `tests`. The graph confirms:

- `main.jsx` lazy-loads all four company charts and registers them in the dashboard.
- `useWsMessageBus.js` dispatches `companyStock`, `getCompanyStockHistory`, `companyProfile`, `getCompanyProfileHistory`, and `getCompanyDetailsHistory` messages from the latest WebSocket entry.
- `routes/wsHandler.cjs` dispatches company JSON messages and `companyTrainRange` to the existing handlers.
- The three current snapshot handlers call `fetchOrReuseSnapshot` with `req.session.userId.toString()`.
- Existing coverage in `tests/ws-company-session-identity.test.cjs` verifies session identity for stock, profile, and details snapshots.

## Existing architecture

- The backend is CommonJS under Node.js and uses Fastify WebSockets plus the MongoDB plugin.
- The browser is React 19/Vite with lazy-loaded Chart.js components. There is no dedicated React component test runner, so pure helper contracts, Node handler tests, source assertions, and the Vite build are the practical verification boundary.
- Company snapshots are stored in per-user MongoDB databases. `fetchOrReuseSnapshot.cjs` reuses recent documents, fetches via the Torn client for company selections, inserts a timestamped document, and falls back to the latest document on fetch failure.
- The existing company history handlers support seconds/milliseconds in some paths and legacy `stock`/`stocks` shapes, but several paths currently coerce invalid metrics to zero, expose raw errors, or do not validate all inputs consistently.
- `WorkStatsGraph` requests `companyTrainRange` with Unix seconds, caches normalized daily records in IndexedDB, and supports absolute `Stats` overlay values.

## Node.js best-practices decisions

- Keep CommonJS and existing module boundaries; use small pure functions for validation/normalization so they can be tested without a live server.
- Use `async`/`await`, explicit early returns for invalid/auth failures, and `try/catch` around external/database operations. Do not create unhandled fire-and-forget promises in handlers.
- Validate numeric input with `Number.isFinite`, constrain user-controlled range/top values, and avoid turning malformed values into misleading zeroes.
- Use structured, minimal operational logging with collection/request metadata only; never log URLs containing API keys or complete Torn payloads.
- Return stable typed error categories to clients and keep detailed exceptions on the server side only.
- Preserve per-request user isolation by deriving the database name from the authenticated session, not from a client message field.

## Decisions

### Canonical history points

All history responses expose `{ t, v }` points, with optional stock price `p`. Timestamps are normalized to milliseconds, values are finite numbers, and arrays are sorted by timestamp. Invalid points are omitted rather than converted to zero.

### Range semantics

Optional `from` and `to` inputs accept Unix seconds or milliseconds. A missing range uses the handler's existing bounded default. Reversed ranges are normalized only where the existing API already treats them as interchangeable; training ranges remain strict (`from < to`) and return a typed validation error otherwise.

### Empty responses

No matching documents and no usable metrics are normal states. They return `ok: true` with empty series and metadata so the UI can show `No history` without treating an empty account as a server failure.

### Request safety

The message bus is intentionally lightweight and only dispatches the latest message. Components therefore keep a bounded request fingerprint/sequence guard and derive data from the current response, rather than scanning or appending the complete WebSocket message log on every render.

## Alternatives rejected

- **New REST endpoints**: rejected because the dashboard already has an authenticated WebSocket transport and adding a second API boundary would duplicate session handling.
- **New charting or date dependency**: rejected because Chart.js, `chartjs-adapter-date-fns`, and existing project helpers are sufficient.
- **Shared cross-user company cache**: rejected because company snapshots are user-scoped and a shared cache risks data disclosure.
- **Coercing invalid values to zero**: rejected because it hides malformed Torn data and produces misleading trends.
- **Sending raw exception messages to the browser**: rejected because errors can contain implementation details or request data.
