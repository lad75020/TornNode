# Quickstart: Company Analytics

## Prerequisites

- Node.js 25 and the repository dependencies are installed.
- MongoDB/Fastify test doubles are used by focused handler tests; no live Torn API key is needed for those tests.
- Work from `/Volumes/WDBlack4TB/Code/tornnode` on branch `feature/time-machine-company-analytics`.

## Run focused verification

```bash
node --test tests/ws-company-session-identity.test.cjs tests/ws-company-analytics.test.cjs
node --check ws/wsCompanyStock.cjs
node --check ws/wsGetCompanyStock.cjs
node --check ws/wsGetCompanyStockHistory.cjs
node --check ws/wsCompanyProfile.cjs
node --check ws/wsGetCompanyProfile.cjs
node --check ws/wsGetCompanyProfileHistory.cjs
node --check ws/wsCompanyDetails.cjs
node --check ws/wsGetCompanyDetailsHistory.cjs
node --check ws/wsCompanyTrainRange.cjs
```

## Run regression and build checks

```bash
npm run test:auth
npm run test:bazaar
git diff --check
npm run build:static
```

The build must complete with the four company chart chunks still emitted as lazy assets. No new dependency should appear in `package.json` or the lockfile.

## Manual dashboard smoke test

1. Start the existing server with the normal authenticated development configuration.
2. Sign in and open the dashboard.
3. Verify Company Stock, Company Stock History, Company Profile, Company Details History, and Work Statistics cards show a loading state followed by success, empty, reused, or safe error state.
4. Switch history ranges and profile metrics; confirm the newest request remains visible when responses arrive out of order.
5. Disconnect/reconnect the WebSocket and verify controls recover without a page reload.
6. Use a browser console check to confirm no API key, full Torn payload, or raw stack trace is logged.

## Native codebase memory verification

After implementation, re-index the repository with the native `mcp__codebase_memory_mcp__index_repository` tool in `moderate` mode, check `index_status` is `ready`, and run a focused regex search for all company charts and handlers. The result must include the updated symbols and the new focused test.
