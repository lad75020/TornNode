# Requirements Checklist: Activity and Consumables Analytics

**Feature**: [spec.md](../spec.md)
**Created**: 2026-08-17

## Completeness

- [x] The specification covers all queued charts, preview modules, and the migration utility.
- [x] Revive, Xanax, receipt, blood, medical-aid, item, travel, preview, and migration journeys have priorities and independent tests.
- [x] Acceptance scenarios cover valid, malformed, empty, missing-store, range, cancellation, modal, and migration failure behavior.
- [x] Functional requirements and success criteria use unique identifiers.
- [x] Existing authentication, IndexedDB, Chart.js, dashboard, and CommonJS CLI boundaries are explicit.

## Quality

- [x] Requirements describe observable behavior rather than implementation steps.
- [x] Date filtering, UTC aggregation, finite-value, and source-ID semantics are defined.
- [x] Blood direction correctness, private preview logging, migration query use, URI fallback, dry-run, and cleanup are explicit.
- [x] No new framework, dependency, public activity route, or live Torn API call is required.
- [x] No clarification markers remain.
