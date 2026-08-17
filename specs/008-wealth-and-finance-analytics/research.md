# Research: Wealth and Finance Analytics

## Existing architecture

- `client/src/main.jsx` owns lazy chart routing and passes the existing `logsUpdated`, `wsMessages`, `sendWs`, `dateFrom`, `dateTo`, `onMinDate`, `darkMode`, and theme interfaces.
- Local finance charts read `LogsDB` through `getLogsByLogId` or `openDB`; the existing chart setup registers the time and logarithmic scales.
- Net-worth history arrives through the authenticated `getNetworth` WebSocket response. The breakdown arrives through `lastNetworth` and is derived from the latest `Stats.personalstats.networth` document.
- The backend uses CommonJS Fastify/WebSocket handlers. `getUserDb.cjs` selects the tenant database from the authenticated request session, and `ensureUserDbStructure.cjs` creates the expected collections/indexes idempotently.

## Existing data contracts

| Surface | Existing source | Existing identifiers/fields |
|---|---|---|
| Net-worth history | MongoDB `Networth` | `date`, `value` or `money.daily_networth` |
| Net-worth breakdown | MongoDB `Stats` | `date`, `personalstats.networth.*` |
| Faction balance | `LogsDB.logs` | log `6738`, `6795`; `timestamp`, `data.balance_after` |
| Slots | `LogsDB.logs` | logs `8300`, `8301`; `won_amount`, `bet_amount` |
| Poker | `LogsDB.logs` | poker log codes; `timestamp`, `data.value` |
| Money received | `LogsDB.logs` | log `4810`; `data.money` or `money` |
| Crime gains | `LogsDB.logs` | log `9015`; `data.money_gained` |
| Market costs | `LogsDB.logs` | logs `1103`, `1104`, `1112`, `1113`; `cost`/`cost_total` |
| Bounties | `LogsDB.logs` | log `6710`; `data.bounty_reward` |

## Risk findings

1. Several charts treat a missing store/index or failed transaction as an uncaught rejection and remain in a loader.
2. Date filtering is inconsistent: some effects refetch on date changes, some use local date strings, and some aggregate before filtering.
3. Numeric coercion currently turns malformed values into zero, which can create fabricated financial points.
4. WebSocket handlers use raw session/error values in some failure envelopes and do not consistently use the shared authentication/send helpers.
5. Some handlers lack deterministic sorting/projection and resource cleanup.

## Decisions

- Normalize finite timestamps and values at the boundary; reject invalid rows instead of converting them to zero.
- Use UTC ISO days for all day comparisons and deterministic ISO Monday weeks for weekly buckets.
- Keep complete source data in component state and filter/aggregate from it when only `dateFrom`/`dateTo` changes.
- Preserve all existing command names, prop signatures, log IDs, and chart controls.
- Use `async`/`await`, `Promise.all` only for independent reads, `try/catch/finally`, and generic client errors with detailed server logs.
- Add a focused Node test file for the three server handlers and pure normalization/aggregation helpers where practical; rely on the production Vite build for browser integration.
