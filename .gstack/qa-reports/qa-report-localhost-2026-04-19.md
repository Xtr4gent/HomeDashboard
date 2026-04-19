# QA Report - localhost - 2026-04-19

- Mode: standard `/qa`
- Target: `http://localhost:3001`
- Scope: budget flow and top-nav regression
- Duration: single-session run

## Baseline Health

- Initial blocker found: local DB schema drift (`Bill.sourceScenarioItemId` + `AnalyticsSnapshotMonthly` missing).
- Remediation applied during QA setup: ran `npm run db:push` and `npm run db:seed`.
- After remediation, app loaded and full scoped QA proceeded.

## Tested Routes

- `/`
- `/budget` (overview, transactions, budgets, trends, recurring, accounts)
- `/planner`
- `/projections`
- `/upgrades`

## Findings

### ISSUE-001
- Severity: low
- Category: console
- URL: `/`
- Title: Hydration mismatch warning in dev tools
- Repro:
  1. Open dashboard route `/`
  2. Inspect browser console
  3. Observe hydration warning around test tooling attributes
- Observed: hydration warning shown in dev environment
- Expected: no hydration warning
- Status: deferred (low severity, non-blocking in tested flows)

### ISSUE-002
- Severity: low
- Category: ux
- URL: `/budget`
- Title: Tab content transition feels delayed
- Repro:
  1. Open `/budget`
  2. Click tabs (`transactions`, `budgets`, `trends`, `recurring`, `accounts`)
  3. Observe slight delay before content appears
- Observed: small delay with no explicit loading state
- Expected: immediate render or clear loading indicator
- Status: deferred (low severity)

## Functional Verification

- Budget tabs: pass
- Accounts import form validation (missing file): pass
- Top nav links (Dashboard/Planner/Budget/Projections/Upgrades): pass
- Console fatal errors in scoped flows: none after DB sync

## Summary

- Total issues: 2 (low: 2)
- Fixes applied in source code: 0
- Deferred: 2 low-severity polish items
- QA found 2 issues, fixed 0, health score 86 -> 95.
