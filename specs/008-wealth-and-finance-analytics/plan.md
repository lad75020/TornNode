# Implementation Plan: Wealth and Finance Analytics

**Branch**: `feature/time-machine-wealth-and-finance-analytics` | **Date**: 2026-08-17 | **Spec**: [spec.md](spec.md)

## Summary

Harden the existing finance analytics modules without changing their dashboard props, log identifiers, WebSocket command names, storage technologies, or chart library. Normalize finance records at data boundaries, use UTC deterministic buckets, make date-only changes reactive without redundant reads, and expose explicit empty/error states. Harden the three net-worth handlers with shared authentication/tenant helpers, allow-listed projections, safe envelopes, logging, and cleanup.

## Technical context

- Node.js CommonJS backend; React 19/Vite frontend.
- Fastify 5, authenticated WebSocket, MongoDB, `torn-client`, IndexedDB via `idb`, Chart.js 4.
- Existing Node `node:test` harness plus `npm run build:static`; no browser component-test runner.
- No new dependencies.

## Architecture and Node.js decisions

- Preserve CommonJS server modules and existing route dispatch.
- Validate session/API-key/range before protected reads; select tenant only through `getUserDb`.
- Use `async`/`await`, `Promise.all` only for independent log reads, and `try/catch/finally` for cleanup.
- Normalize finite numbers and valid Unix-second timestamps; never coerce malformed financial data to zero.
- Send generic client errors and log diagnostic details server-side.
- Keep complete source rows in state; date-only changes filter/re-aggregate locally where possible.

## Work packages

1. **Specify and contracts**: create the feature docs, allow-listed envelopes, data model, and focused test entry point.
2. **Net-worth transport**: update the three handlers and the history/breakdown charts for auth, projection, serializability, validation, replay safety, and safe empty states.
3. **Faction/gambling charts**: normalize IndexedDB reads, preserve controls, and apply UTC range filtering to faction, slots, and poker charts.
4. **Income/cost/bounty charts**: normalize all source logs, preserve bucket/modal behavior, and make date filtering and loading/error handling deterministic.
5. **Verification**: run focused/regression tests, static build, diff/security checks, native codebase-memory re-index/status/search, then update queue state.

## File map

```text
client/src/
├── NetworthGraph.jsx
├── NetworthPieChart.jsx
├── FactionBalance.jsx
├── BetResultsGraph.jsx
├── PokerBetWinGraph.jsx
├── MoneyLogGraph.jsx
├── MoneyGainedGraph.jsx
├── CombinedCostsGraph.jsx
└── BountyRewardChart.jsx
ws/
├── wsInsertNetworth.cjs
├── wsGetNetworth.cjs
└── wsLastNetworthStats.cjs
tests/wealth-and-finance-analytics.test.cjs
```

## Verification gates

The focused tests must pass before the queue changes to `done`. The static build, synchronization/auth/bazaar regressions, `git diff --check`, native codebase-memory `ready` status, and final branch/status inspection are required. No push is performed without the Time Machine push gate.
