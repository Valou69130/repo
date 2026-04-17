# Margin-Call UI Plan (Plan 7)

**Goal:** Build the UI layer that exercises the event-sourced margin-call backend shipped in Plans 4–6. Five new pages + API-client extension + sidebar wiring. Existing repo/asset/audit pages stay as-is until Plan 8 cutover.

**Architecture:** New pages under `collateral-app/src/pages/` hit the real REST endpoints via a new namespace on `lib/api.js`. No new state-store wiring — pages manage their own fetch state with `useEffect` + `useState` like the current codebase. React-query deliberately NOT introduced to keep the diff small.

**Tech stack:** React 18, Tailwind + shadcn/ui (Card, Button, Table, Sheet, Badge, Dialog), fetch through `lib/api.js`, lucide-react icons. Same conventions as existing pages.

---

## Task 1 — Extend `lib/api.js` with new endpoint namespaces

Add: `agreements.{list,get,create}`, `marginCalls.{list,get,create,issue,accept,markDelivered,confirmSettlement,cancel,suggested,aiAssess}`, `disputes.{open,propose,agree,withdraw,escalate}`, `approvals.{pending,grant,reject}`. All through existing `request()` helper (auth cookies already handled).

## Task 2 — Agreements list + Create

`pages/Agreements.jsx`: table with id / counterparty / type / threshold / MTA / 4E threshold / status. "New Agreement" button opens a dialog with the create form. Submit POSTs to `/agreements`, refreshes list, closes dialog. Read permission: everyone. Create permission: `canManageAgreements`.

## Task 3 — Agreement Detail

`pages/AgreementDetail.jsx`: header card with all metadata, followed by "Margin calls under this agreement" table (calls filtered `agreement=<id>`). Click a call row → navigate to margin-call detail.

## Task 4 — Margin-Call Detail (the big one)

`pages/MarginCallDetail.jsx`: three stacked sections.

**Header**: id, state badge, counterparty, amount, currency, direction, issued/deadline/resolved timestamps, four-eyes flag.

**Actions bar**: state-aware buttons. `draft` → Issue; `issued` → Accept / Open Dispute; `agreed` → Mark Delivered; `delivered` → Confirm Settlement; any non-terminal → Cancel (with reason). Also: "Get AI assessment" (calls /ai-assess, appends commented event, shows rationale inline). Buttons hidden when the user's role lacks the perm.

**Event timeline**: vertical list of events with `eventType`, `occurredAt`, `actorType` (user icon vs robot icon for agent vs gear for system), truncated payload JSON, hash fragment. No in-place editing — this is an audit surface.

**Disputes panel**: collapsible; each dispute shows status, proposed values, resolution note. Action buttons: Propose / Agree / Withdraw / Escalate gated by permission.

## Task 5 — Approvals inbox

`pages/Approvals.jsx`: GET `/approvals/pending`. Rows show entity (margin-call link), requested-by, requested-at, reason. Buttons: "Approve" (POST /:id/grant) and "Reject" (POST /:id/reject with reason). Server already rejects self-approval; UI disables the buttons when `requested_by_user_id === user.id` with tooltip "You cannot approve your own request".

## Task 6 — Audit Export

`pages/AuditExport.jsx`: date range picker + counterparty filter + "Download CSV" button. Backend endpoint `/audit/export` already exists (from Plan 3 comments in prior commits). If not, fall back to fetching `/audit` paginated and building the CSV client-side. Gated by `canExportAudit`.

## Task 7 — App.jsx + Sidebar wiring

Add five new keys (`agreements`, `agreement-detail`, `margin-call-detail`, `approvals`, `audit-export`) to `renderCurrentPage`. Add a new sidebar section "Margin Calls" with entries Agreements, Approvals, Audit Export. Thread `selectedAgreementId` and `selectedMarginCallId` through state.

## Task 8 — Smoke-test, commit, push

Run `npm run dev` in `collateral-app`. Log in as Treasury Manager; create an agreement. Log in as Collateral Manager; create a received margin call, run the full lifecycle through to settled. Log in as Credit Approver; approve a pending four-eyes request. Export audit. Commit + push.

---

## Done criteria

- Five pages render and round-trip data through the real backend.
- Event timeline visibly reflects every state change.
- No regression on existing pages.
- Auto-deploys via Vercel.
