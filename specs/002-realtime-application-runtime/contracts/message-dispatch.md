# Contract: Realtime Message Dispatch

**Feature**: `002-realtime-application-runtime`
**Version**: 1.0 planned contract

## Routing

Both the server command router (`routes/wsHandler.cjs`) and the client message bus (`client/src/hooks/useWsMessageBus.js`) dispatch a decoded message by its `type` field.

## Client bus (`useWsMessageBus`)

| Registered handler | Trigger message `type` |
|---|---|
| `onGetAllTornItems` | `getAllTornItems` |
| `onManualLogs` | `getAllTornLogs` |
| `onImportStopped` | `importStopped` |
| `onNetworthInsert` | `networthInsert` |
| `onStatsInsert` | `statsInsert` |
| `onImportedData` | `importedData` → `{ logsImported, attacksImported }` |
| `onCompanyStock` | `companyStock` |
| `onGetCompanyStockHistory` | `getCompanyStockHistory` |
| `onCompanyProfile` | `companyProfile` |
| `onGetCompanyProfileHistory` | `getCompanyProfileHistory` |
| `onGetCompanyDetailsHistory` | `getCompanyDetailsHistory` |
| `onUpdatePrice` | `updatePrice` |
| `onAny` | any registered type not matched above (fallback) |

## Robustness rules

| Case | Behavior |
|---|---|
| Frame is not a JSON object / no `type` | Skipped cleanly; consumer continues |
| Frame is undecodable (malformed JSON) | Skipped without throwing; optional `onMalformed` hook; later frames unaffected |
| Type not registered (and no `onAny`) | Ignored cleanly; no user-facing error |
| Handler identity | The bus uses the latest registered handlers per dispatch (ref pattern); no stale-closure drops |
| Backlog | The consumer retains at most `maxMessages` (default 800) undelivered messages; beyond the bound the oldest are dropped. This bounds memory over a long session. |

## Server router robustness

| Case | Behavior |
|---|---|
| Plain-text command in the switch (`ping`, `torn`, `stats`, `checkSession`, `destroySession`, …) | Routed to the existing handler after authentication + TTL renewal |
| JSON command (`companyTrainRange`, `getTornAttacks`, `updatePrice`, `getAllTornItems`, `getAllTornLogs`, `stopImport`, …) | Parsed and routed by `type` |
| Undecodable frame / JSON parse failure | Skipped without throwing; logged at a safe level; later frames unaffected |
| Unknown command | Existing non-private `unknown` behavior, only after authentication succeeds |

## Invariants

- No dispatch may throw into the runtime; a bad frame degrades to a skip.
- The backlog bound guarantees the per-consumer message retention is bounded.
- This contract does **not** define individual domain payload shapes; those remain authoritative in `openapi-ws.yaml`.
