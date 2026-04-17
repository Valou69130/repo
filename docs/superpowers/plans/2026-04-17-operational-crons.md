# Operational Crons + AI Advisor Implementation Plan

**Goal:** Add the server-side enforcement surface — deadline breaches, hash-chain integrity scans — and the AI advisor endpoints that round out the margin-call lifecycle. These are the pieces a bank control function would ask to see before signing off on the system.

**Architecture:** New module `src/ops/scanner.js` (pure functions, returns counts, no timer logic) + wiring into `src/ai/scheduler.js` so both AI briefs and ops scans run on the same clock. Two new margin-call endpoints: `GET /margin-calls/suggested` (rule-based advisor) and `POST /margin-calls/:id/ai-assess` (appends an agent-authored `commented` event). Tests target the pure-function layer so they don't depend on timers.

**Tech Stack:** Express 4, better-sqlite3, node:test + supertest, existing `appendEvent` + `verifyChain`.

---

## Task 1 — `scanDeadlines(db, now)` pure function + tests

**Files:** create `collateral-api/src/ops/scanner.js`, `collateral-api/test/ops.scanner.test.js`

Scans every non-terminal margin call with `deadline_at < now` and `current_state IN (issued, pending_four_eyes)`. For each match: appends a `deadline_breached` event (non-progressing), inserts a `Warning` notification. Skips calls that already have a `deadline_breached` event (idempotent).

Tests: returns `{breachedCount}`; event appended; second run is a no-op; notification created.

## Task 2 — `scanIntegrity(db)` pure function + tests

Walks every margin call, runs `verifyChain`. Returns `{scanned, broken}`. If any broken, inserts a `Critical` notification naming the broken calls.

Tests: clean DB → all valid; tampered event → flagged; notification created on breach.

## Task 3 — `GET /margin-calls/suggested`

Heuristic: list repos with `posted_collateral < required_collateral`, for each compute deficit, round up to associated agreement's `rounding`, return as draft-candidate objects `{repoId, counterparty, currency, suggestedCallAmount, deficit, agreementId}`. Read-only, any authenticated user.

Tests: returns expected shape; filters out repos at/above required; rounds to agreement rounding.

## Task 4 — `POST /margin-calls/:id/ai-assess`

Appends a `commented` event with `actor_type='agent'` containing a short AI rationale. When AI disabled, writes a canned placeholder rationale. Gated by `canRespondCall` or `canIssueCall`.

Tests: event appended with `actor_type='agent'`; 403 without either perm; 404 on missing call; works without AI enabled.

## Task 5 — wire both crons into `scheduler.start()`

Non-invasive: add `runOpsScans(db)` that calls `scanDeadlines` + `scanIntegrity`. Schedule hourly for deadlines, daily at 02:00 for integrity. Runs regardless of `AI_ENABLED` since these are ops not AI.

## Task 6 — run suite, commit, push

---

## Done criteria

- New tests green
- No regression on existing suite
- Hash chain integrity preserved (scanner only reads, except for `deadline_breached` which goes through `appendEvent`)
