# Implementation Plan: Combat and Progression Analytics

**Branch**: `feature/time-machine-combat-and-progression-analytics` | **Date**: 2026-08-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-combat-and-progression-analytics/spec.md`

## Summary

Harden the existing authenticated combat and progression analytics surface without changing its transport, storage, charting library, or dashboard contracts. The client will validate and normalize records before rendering, make date filtering reactive, handle missing stores and failed async work with explicit states, and prevent duplicate/replayed WebSocket payloads from creating duplicate cache rows or request loops. The server will keep Fastify/CommonJS handlers and user-tenant selection while applying the shared session/range helpers, safe response envelopes, bounded cursor handling, and resource cleanup.

The implementation follows the codebase-memory findings: `Main` owns the shared authenticated WebSocket message bus and lazy chart routes; charts read `LogsDB`/feature IndexedDB stores or consume `wsMessages`; `wsHandler.cjs` dispatches `racingskill`, `stats`, and JSON `getTornAttacks` messages; `getUserDb.cjs` and `ensureUserDbStructure.cjs` provide tenant-scoped MongoDB access. The high fan-in and high-cognitive-complexity chart modules are changed incrementally rather than introducing a new state-management layer.

## Technical Context

**Language/Version**: Node.js CommonJS backend; React 19/Vite JavaScript frontend

**Primary Dependencies**: Fastify 5, `@fastify/websocket`, MongoDB, `torn-client`, React 19, Chart.js 4, `react-chartjs-2`, IndexedDB via `idb`; no new dependency

**Storage**: Per-user MongoDB collections (`attacks`, `Stats`, and synchronized logs); browser IndexedDB (`LogsDB`, `WorkStatsDB`, `AttacksStatsDB`)

**Testing**: Node built-in `node:test` with the existing handler/database harness; `npm run build:static`; existing authentication and synchronization regression tests; source-level checks only where a browser renderer is unavailable

**Target Platform**: Fastify server and modern browsers supporting IndexedDB and WebSocket

**Project Type**: Full-stack authenticated analytics web application

**Performance Goals**: Load independent local stores concurrently where safe; show available cache data without waiting for a live request; avoid synchronous I/O, duplicate full-store scans caused by date changes, and unbounded WebSocket retries

**Constraints**: Preserve existing component props, chart registration, dashboard navigation, WebSocket command names, MongoDB tenant isolation, and safe-error conventions; do not add a framework or dependency; do not expose credentials or raw internal errors

**Scale/Scope**: Six existing React chart components and three existing WebSocket handlers listed by the queue, plus focused regression tests and feature documentation

## Constitution Check

The repository constitution remains the untouched Spec Kit placeholder and defines no project-specific gates. The following feature gates are applied from the specification, codebase-memory architecture, and existing security conventions:

- [x] Private `/ws` commands remain authenticated and tenant-scoped.
- [x] Date/range and external/database inputs are validated before querying, caching, or rendering.
- [x] Invalid and unavailable data produce safe empty/loading/error states instead of fabricated values.
- [x] Independent local reads may run concurrently, but all async effects are cancellable and resources are released.
- [x] Existing Fastify/CommonJS/React/IndexedDB/Chart.js architecture is reused.
- [x] No new dependency or replacement transport is introduced.

## Project Structure

### Documentation (this feature)

```text
specs/007-combat-and-progression-analytics/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── websocket.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
client/src/
├── AttacksStatsGraph.jsx
├── GymGraph.jsx
├── WorkStatsGraph.jsx
├── RacingPositionGraph.jsx
├── RacingSkillGraph.jsx
└── CrimeScatterGraph.jsx

ws/
├── wsGetTornAttacks.cjs
├── wsRacingSkill.cjs
└── wsStats.cjs

routes/
└── wsHandler.cjs                         # existing dispatch contract; verify only unless required

tests/
└── combat-progression-analytics.test.cjs # focused handler/contract regression coverage
```

**Structure Decision**: Keep pure normalization close to the existing chart modules because the frontend is ESM and the backend is CommonJS, while testing server transport through the existing Node harness. Do not create a parallel service layer or frontend test framework for this incremental feature. The dispatch file is treated as an integration contract and changed only if verification proves a routing defect.

## Implementation Phases

### Phase 0 — Research and contracts

Completed in `research.md`, `data-model.md`, `contracts/websocket.md`, and `quickstart.md`. The current WebSocket message types, local store keys, log identifiers, auth boundary, and date semantics are explicit before code changes.

### Phase 1 — Server contracts and focused tests

1. Add focused tests for valid, invalid, empty, and tenant-isolated attack aggregation.
2. Harden the racing-skill handler with the existing authenticated-session and safe-send helpers, projection allow-list, chronological normalization, cursor cleanup, and generic client errors.
3. Harden the stats handler’s session/API-key boundary and preserve its scheduled import, recent-snapshot throttle, optional API URL, and dry-run shape while avoiding secret/raw-error leakage.
4. Keep the existing JSON dispatch commands and verify their response envelopes against `contracts/websocket.md`.

### Phase 2 — Client chart correctness and resilience

1. Fix attack-cache initialization/manual refresh semantics, validate responses, deduplicate dates, and make date-range changes rebuild the chart without a redundant fetch.
2. Make gym and crime reads tolerate missing stores/indexes, reject malformed records, perform independent reads concurrently where useful, and update when date props change.
3. Make work-stat cache/live merging deterministic, validate absolute/incremental records, apply date filtering consistently, show an explicit empty/error state, and bound retries/cleanup.
4. Make racing position and racing skill processing validate timestamps and values, handle every relevant message rather than only the last one, maintain aggregation/filter correctness, and preserve responsive theme/toggle behavior.

### Phase 3 — Verification

Run the focused Node test file, existing synchronization/auth regression tests, static build, `git diff --check`, and final queue/branch checks. Re-index the repository with codebase-memory after implementation and verify the index is ready. Do not push or set `pushed: true` without the Time Machine satisfaction and push gates.

## Complexity Tracking

No constitution violations or unnecessary architectural additions are planned. A focused test file is added because the existing project has no browser component-test runner; deterministic server-contract tests provide regression coverage while the production Vite build verifies the ESM chart modules.
