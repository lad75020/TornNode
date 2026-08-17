# Verification Quickstart: Bazaar Monitoring

Run from `/Volumes/WDBlack4TB/Code/tornnode`.

## Focused deterministic tests

```bash
npm run test:bazaar
```

The focused tests cover listing normalization, minimum selection, threshold episodes, persistence sanitization, empty/malformed updates, stale ordering, public resource guards (connection/message/subscription limits), calendar-date validation, public command allow-listing, public catalog projection, and protected `/ws` rejection.

## Existing authentication and boundary regression tests

```bash
npm run test:auth
```

## Static client build

```bash
npm run build:static
```

The build must complete without importing server-only dependencies into the browser bundle. If the public route is exercised manually, open `/public-bazaar` in a fresh private browser window with no session cookie and verify that `/wsb` opens, the item picker loads public catalog data, and `/ws` is never opened.

## Repository checks

```bash
git diff --check
git status --short --branch
```

## Observed verification

- `npm run test:bazaar`: 16 tests passed, 0 failed.
- `npm run test:auth`: 23 tests passed, 0 failed.
- `node --test tests/*.test.cjs`: 65 tests passed, 0 failed.
- `npm run build:static`: Vite 8.2.1 transformed 410 modules and completed successfully.
- Syntax checks for the changed CommonJS modules and `git diff --check` completed successfully.
- Public catalog and daily-history responses are cached per Fastify instance for 30 seconds; public `/wsb` connections, messages, and subscriptions are bounded.

No push or completion flag is part of this feature verification.
