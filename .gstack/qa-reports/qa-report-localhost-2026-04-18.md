# QA Report - localhost (2026-04-18)

## Metadata
- URL: `http://localhost:3000`
- Mode: full (browser-based)
- Framework detected: Next.js App Router
- Duration: ~25 minutes
- Pages visited: `/`, `/login`
- Screenshots captured: 4

## Baseline
- Initial health score: **42**
- Final health score: **86**
- Delta: **+44**

## Issues Found

### ISSUE-001 - Homepage 500 due to Prisma adapter misconfiguration
- Severity: **Critical**
- Category: Functional / Console
- Repro:
  1. Start dev server.
  2. Open `http://localhost:3000/`.
  3. Observe runtime 500 and blank page.
- Evidence:
  - Before: `.gstack/qa-reports/screenshots/initial-home.png`
  - Console before: `.gstack/qa-reports/console-initial.json`
  - After: `.gstack/qa-reports/screenshots/issue-001-after-localhost.png`
  - Console after: `.gstack/qa-reports/console-after-001-localhost.json`
- Fix status: **verified**
- Commit: `6d49c81`
- Files changed:
  - `web/lib/prisma.ts`
  - `web/package.json`
  - `web/package-lock.json`
  - `web/prisma/schema.prisma`
- Regression test:
  - Commit: `5540a4e`
  - File: `web/tests/regression-issue-001.prisma-adapter.test.ts`

### ISSUE-002 - Login submit crashed with 500 when DB unavailable
- Severity: **High**
- Category: Functional / UX
- Repro:
  1. Open `http://localhost:3000/login`.
  2. Enter any username/password.
  3. Submit while DB is unavailable.
  4. Observe server error screen instead of user-facing message.
- Evidence:
  - Before: `.gstack/qa-reports/screenshots/login-submit-state.png`
  - Console before: `.gstack/qa-reports/console-login-submit.json`
  - After: `.gstack/qa-reports/screenshots/issue-002-after.png`
  - Console after: `.gstack/qa-reports/console-after-002.json`
- Fix status: **verified**
- Commit: `2525094`
- Files changed:
  - `web/app/actions.ts`
  - `web/app/login/page.tsx`
- Regression test:
  - Commit: `15372d2`
  - File: `web/tests/regression-issue-002-login-outage.test.ts`

## Deferred Issues
- None in app code.
- Environment note: local PostgreSQL database `home_dashboard` is still required for full authenticated data flow testing.

## Console Health Summary
- Before fixes: repeated `500` resource failures, Prisma constructor/runtime errors.
- After fixes: no client-side error entries during login and landing checks.

## Severity Counts
- Critical: 1
- High: 1
- Medium: 0
- Low: 0

## Top 3 Things to Fix
1. Ensure local DB bootstrap (`db:push`, `db:seed`) is part of first-run docs.
2. Add e2e flow covering successful login + dashboard interaction with seeded DB.
3. Expand QA to mobile viewport interaction checks after DB bootstrap is complete.

## PR Summary
QA found **2** issues, fixed **2**, health score **42 -> 86**.
