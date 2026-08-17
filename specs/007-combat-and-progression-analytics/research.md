# Research: Combat and Progression Analytics

## Repository architecture

- The codebase-memory index for `Volumes-WDBlack4TB-Code-tornnode` is ready and contains 4,477 nodes and 6,556 edges. It identifies `server.cjs`/Fastify as the runtime root, `routes/wsHandler.cjs` as the WebSocket dispatcher, `Main` as the chart/message-bus integration point, and the requested chart modules as independent client entry points.
- `package.json` declares CommonJS for the server (`"type": "commonjs"`) and React 19/Vite for the client. Existing handlers use `async`/`await`, `node:test`, Fastify logging, MongoDB cursors, and helper modules under `utils/`.
- `Main` lazy-loads all six requested charts and passes shared date/theme/log/WebSocket props through the existing dashboard. The feature must not change chart route ordering or the shared message bus contract.

## Existing data paths

| Surface | Current source | Existing contract |
|---|---|---|
| Attacks | `AttacksStatsDB.attacks_stats` plus JSON `getTornAttacks` responses | One record per ISO day with wins/losses/attacks/defends |
| Gym | `LogsDB.logs`, `log` index, identifiers 5302/5303/5300/5301 | `timestamp` seconds plus numeric `data.*_after` |
| Crime | `LogsDB.logs`, `log` index, identifier 9005 | `timestamp` seconds plus `data.crime` and numeric `data.skill_level` |
| Work | `WorkStatsDB.work_stats` plus JSON `companyTrainRange` responses | Date-keyed incremental or `abs` manual/intelligence/endurance records |
| Racing position | `LogsDB.logs`, `log` index, identifier 8731 | `timestamp` seconds plus a position string whose first character is numeric |
| Racing skill | User `Stats` collection via `racingskill` command | `{ type: 'racingskill', data: [{ date, racingskill }] }` |

## Server observations

- `wsGetTornAttacks.cjs` already uses `getAuthenticatedSession`, `parseRange`, `ensureUserDbStructure`, `getUserDb`, a projected attack cursor, and a `finally` close. Its behavior should be preserved and covered by focused tests.
- `wsRacingSkill.cjs` currently reads `req.session.userId` directly, assumes a valid session, sends raw exception messages, and does not close the cursor explicitly. It should use the same session/send/log helpers as the other private handlers.
- `wsStats.cjs` serves both scheduled imports and the `wsStatsTest` dry-run command. Its normal path uses a session API key, a 12-hour recent snapshot throttle, and `torn-client`; its current failure payloads can expose exception text. Hardening must preserve the response types and test mode fields while using safe errors.
- `routes/wsHandler.cjs` dispatches `racingskill` and `stats` commands directly and routes JSON `getTornAttacks`/`companyTrainRange` messages. No new route is required.

## Client observations

- `AttacksStatsGraph` uses an initialization ref and a manual refresh flag, but the early return after initialization prevents an empty cache from being manually refreshed. Its initial async effect also reads stale state when deciding whether the cache is empty.
- `GymGraph` and `CrimeScatterGraph` assume the store/index exists and do not consistently finish loading or catch IndexedDB errors. Their effects do not fully react to date-range changes.
- `WorkStatsGraph` correctly shows cache before a live response in the happy path, but it needs boundary validation, deterministic merging, date-reactive rebuilding, and explicit cleanup for timers/async work.
- `RacingPositionGraph` already performs day/week/month aggregation, but raw timestamp/position validation and memo dependencies need hardening.
- `RacingSkillGraph` consumes only the newest message, has no explicit empty/loading state, and does not report its earliest date or filter range. Processing relevant messages incrementally avoids losing a valid response when unrelated WebSocket traffic follows it.

## Node.js best-practice decisions

1. Preserve CommonJS in `ws/*.cjs`; do not introduce ESM interop or a new framework.
2. Use `async`/`await` and `Promise.all` only for independent local reads. Avoid synchronous file/database/network calls.
3. Validate session, ranges, timestamps, numeric values, and payload shapes at boundaries. Prefer allow-listed response fields.
4. Use `try`/`catch`/`finally` around database/API resources and log diagnostic context server-side while returning generic client errors.
5. Keep retry counts and timers bounded, clear timers on effect cleanup, and make duplicate/replay handling idempotent.
6. Use the repository's built-in `node:test` harness and run the production build instead of adding a testing dependency.

## Alternatives rejected

- A new analytics service or shared frontend state library was rejected because the codebase-memory graph shows the current dashboard/message bus already owns the integration and the queue is limited to existing chart/handler modules.
- Fetching chart data through new HTTP endpoints was rejected because existing authenticated WebSocket dispatch and local caches are the established paths.
- Treating missing values as zero was rejected because it produces misleading progression graphs; malformed observations must be excluded or represented as empty/unavailable.
