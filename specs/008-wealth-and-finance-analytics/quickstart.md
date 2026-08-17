# Quickstart: Wealth and Finance Analytics

## Focused verification

From `/Volumes/WDBlack4TB/Code/tornnode`:

```bash
node --test tests/wealth-and-finance-analytics.test.cjs
npm run build:static
git diff --check
```

The focused test file uses the existing in-memory Mongo/socket harness and never calls the live Torn API.

## Regression verification

```bash
node --test tests/torn-data-synchronization.test.cjs
npm run test:auth
npm run test:bazaar
```

## Manual smoke check

1. Sign in and open Networth, Networth Breakdown, Faction Balance, Slots Results, Poker Bet vs Win, Money Received, Crime Money, Item Market Purchases & Sales, and Bounties.
2. Confirm valid cached records render, malformed/missing stores stop loading safely, and chart toggles/theme remain usable.
3. Change `dateFrom`/`dateTo` and each day/week/month control; confirm UTC bucket ordering and inclusive filtering without duplicate requests.
4. Replay a WebSocket response or reconnect; confirm net-worth points do not duplicate.
5. Exercise an expired/disconnected session and confirm only generic errors are visible.

## Codebase-memory verification

After implementation, refresh the native `codebase-memory-mcp` index, verify project status `ready`, and confirm all nine chart symbols and three handler symbols remain discoverable. Do not use `mcporter`.
