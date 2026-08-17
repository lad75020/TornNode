# Quickstart: Activity and Consumables Analytics

Run from `/Volumes/WDBlack4TB/Code/tornnode`.

## Focused verification

```bash
node --test tests/activity-and-consumables-analytics.test.cjs
node --check utils/computeStatsFromOldStats.js
npm run build:static
```

The focused test file uses deterministic source/contract assertions and does not contact the Torn API or a live MongoDB instance.

## Regression verification

```bash
node --test tests/torn-data-synchronization.test.cjs
npm run test:auth
npm run test:bazaar
git diff --check
```

## Migration dry run

The utility reads the configured Mongo URI and supports the existing CLI flags. Use a non-production database when validating a migration.

```bash
MONGODB_URI_TEST='mongodb://127.0.0.1:27017/tornnode-test' \
  node utils/computeStatsFromOldStats.js \
  --source torn_users_old \
  --target torn_users \
  --query '{"active":true}' \
  --dry-run
```

The source query is parsed as JSON and passed to MongoDB. Omit `--dry-run` only after reviewing the counters and selecting an intentional destination.

## Expected behavior

- Invalid timestamps and values are ignored rather than rendered as zero or `NaN`.
- Date range changes are inclusive and UTC-based.
- Missing local data yields an explicit empty/unavailable state.
- Preview rendering is bounded and does not log private JSON payloads.
- Migration malformed documents are skipped, and MongoDB resources close on success or failure.
