# Demo Backfill + Cutover Plan (Plan 8)

**Goal:** Make the new margin-call surface shipped in Plan 7 usable on a fresh demo reset, and make the advisor endpoint visible from the Dashboard. No hard cutover of legacy `Margin.jsx` — parallel surfaces stay.

**Architecture:** Extend `collateral-api/src/db/demoData.js` with a Credit Approver user, a handful of collateral agreements matching existing repo counterparties, and a few margin calls in varied states (issued / agreed / disputed / resolved). Seed hash-chained events through `appendEvent` so `verifyChain` still passes on reset. On the frontend, add a `SuggestedCallsPanel` to the Dashboard that calls `/margin-calls/suggested` and surfaces deficit-based draft candidates.

**Tech stack:** No new deps. Reuses `appendEvent` for event seeding (not raw INSERT — the chain must stay hashed). Uses the existing `api.suggestedCalls()` client method shipped in Plan 7.

---

## Task 1 — Add Credit Approver to demo users

`demoData.js`: push `{ name: 'Credit Approver', email: 'approver@banca-demo.ro', password: 'demo1234', role: 'Credit Approver' }` onto USERS. Unlocks the four-eyes flow for demo walkthroughs.

## Task 2 — Seed collateral agreements

Add `AGREEMENTS` array with 3 entries — one per real counterparty that has repos (`UniBank Bucharest`, `Danube Capital`, `Carpathia Bank`). GMRA / English law / EUR or RON base / four-eyes threshold tuned so a typical call sits below the threshold and one sits above.

## Task 3 — Seed margin calls + events

Add `MARGIN_CALLS` array. ~5 calls across states: draft, issued, pending_four_eyes, settled/resolved, cancelled with reason, and one with an open dispute. Each seeded via `appendEvent` so the hash chain is valid. Reset clears `disputes`, `margin_call_events`, `margin_calls`, `approvals` before re-seeding.

## Task 4 — Extend `seedDemoData` transaction

Inside the existing transaction block: add DELETE statements for `disputes`, `margin_call_events`, `margin_calls`, `approvals`, `collateral_agreements`. After repos insert, insert agreements, then insert margin calls and append their events. Keep existing tables' behavior untouched.

## Task 5 — Dashboard: Suggested Calls panel

`components/dashboard/SuggestedCallsPanel.jsx`: fetches `api.suggestedCalls()` on mount, renders a compact table of up to 5 rows (repoId, counterparty, deficit, suggested amount). Click-through opens the new-margin-call flow pre-populated. If endpoint returns empty, render a quiet "All repos fully collateralised" line — no big empty state. Wire into `Dashboard.jsx` between the existing KPI row and the actions card.

## Task 6 — Smoke + ship

Reset demo via `/admin/reset`; confirm new agreements + calls appear in Agreements page. Log in as Credit Approver, confirm four-eyes queue is reachable. Commit + push.

---

## Done criteria

- Fresh demo reset populates the Margin Calls pages with realistic data.
- Hash-chain integrity holds on seed (the scanner's own integrity scan passes).
- Dashboard has a visible Suggested Calls panel.
- Credit Approver login works and sees the four-eyes queue (may be empty until a CM triggers an above-threshold accept).
