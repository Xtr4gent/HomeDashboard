# TODOS

## Review

### Dashboard Interaction State Matrix

**What:** Define a complete interaction-state matrix for each dashboard panel (loading, empty, error, success, partial).

**Why:** Prevents inconsistent UI behavior and closes ambiguity that causes flaky E2E expectations.

**Context:** The approved design doc flags this as a reviewer concern. The implementation will include multiple data panels (totals, due-soon, overdue, upgrades), and each panel needs explicit state behavior so frontend and test expectations stay aligned.

**Effort:** S
**Priority:** P1
**Depends on:** Dashboard panel inventory finalized in v1 implementation plan

### Timezone and DST Policy with Coverage

**What:** Define explicit timezone/DST/month-boundary rules and implement corresponding unit plus E2E tests.

**Why:** Recurring bill date math is a trust-sensitive path, off-by-one-hour or off-by-one-day bugs break totals and overdue states.

**Context:** The design doc defines recurrence and status logic, but implementation-level timezone edge behavior (DST transitions and cutoff rules) is still unresolved. This TODO captures policy plus test enforcement so date behavior is deterministic.

**Effort:** M
**Priority:** P1
**Depends on:** Selected runtime timezone source and recurrence utility implementation

### V1.1 Hardening Go/No-Go Criteria

**What:** Define objective pass/fail criteria for V1.1 hardening items (CSV export, weekly backup snapshot, post-trial validation checklist).

**Why:** Keeps V1.1 from becoming vague or perpetually deferred after the first household trial.

**Context:** The design doc includes V1.1 hardening tasks but not measurable release criteria. This TODO adds clear thresholds tied to real usage so the next milestone is concrete.

**Effort:** S
**Priority:** P2
**Depends on:** Completion of first one-week household trial

### Create DESIGN.md via /gstack-design-consultation

**What:** Run `/gstack-design-consultation` and create `DESIGN.md` with canonical typography, spacing, color tokens, and component vocabulary.

**Why:** Prevents style drift and makes future UI decisions deterministic.

**Context:** Current design guidance is embedded in the feature plan as temporary tokens. A dedicated design-system file is needed before broader UI expansion.

**Effort:** S
**Priority:** P1
**Depends on:** None

### Month-Boundary UX Copy and Helper Text

**What:** Specify user-facing copy for month cutoffs and late-night entry behavior in payment/upgrade flows.

**Why:** Users need to understand why an entry appears in one month instead of another.

**Context:** Date logic exists in the plan, but the explanatory UX layer is not fully specified and can cause trust issues.

**Effort:** S
**Priority:** P1
**Depends on:** Timezone and DST policy implementation

### Minimal Motion and Reduced-Motion Spec (V1.1)

**What:** Define minimal motion for section transitions, success feedback, and reduced-motion accessibility behavior.

**Why:** Improves clarity and polish without decorative animation bloat.

**Context:** Motion was intentionally deferred in design-review scope. This captures it as deliberate follow-up work.

**Effort:** S
**Priority:** P2
**Depends on:** Baseline layout and interaction states implemented

### DST/Month-Boundary Fixture Generator

**What:** Create a reusable test fixture generator for month-boundary and DST edge scenarios.

**Why:** Keeps deterministic date tests maintainable and reduces repetitive fixture setup code.

**Context:** Engineering review locked deterministic timezone regression coverage as required; fixture reuse will prevent test brittleness as more edge cases are added.

**Effort:** S
**Priority:** P1
**Depends on:** Finalized recurrence/date utility API

### Set Up gstack Design Binary for Visual Reviews

**What:** Install/configure gstack design binary locally so plan design reviews can generate mockups.

**Why:** Visual review catches hierarchy and layout issues that text-only review can miss.

**Context:** Recent `/gstack-plan-design-review` run was forced into text-only mode because design binary was unavailable.

**Effort:** S
**Priority:** P2
**Depends on:** None

### Local Database Bootstrap Guide for QA

**What:** Add a short developer setup guide for local Postgres (`db:push`, `db:seed`) so QA can run full authenticated flows without runtime DB errors.

**Why:** QA found that login flow degrades correctly now, but complete dashboard behavior still depends on local DB bootstrap clarity.

**Context:** `/qa` run on 2026-04-18 fixed crash handling, but surfaced setup friction when database is not provisioned locally.

**Effort:** S
**Priority:** P1
**Depends on:** None

## Completed
