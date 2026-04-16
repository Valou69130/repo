# Margin Call Lifecycle — Design Spec

**Date:** 2026-04-17
**Phase:** 1 of 4 on the CollateralOS bank-credibility roadmap
**Status:** Approved for implementation planning

## Goal

Promote the existing client-side margin-call state machine ([collateral-app/src/pages/Margin.jsx](../../../collateral-app/src/pages/Margin.jsx), [collateral-app/src/workflows/MarginWorkflow.ts](../../../collateral-app/src/workflows/MarginWorkflow.ts)) into a real server-side, auditable, bank-grade workflow backed by proper Collateral Agreement, Eligibility Schedule, and Haircut Schedule data. Outcome: a demo a collateral operations desk recognises as a real product, with an audit trail a bank's control function can defend.

## Non-goals (explicitly out of scope — Phase 4)

- Real ISO 20022 / SWIFT message ingestion (calls entered via UI or seed for now)
- Live market data (exposures & MTM values are user-entered or AI-suggested)
- Triparty agent integration (Clearstream / Euroclear / BNY) — settlement is a manual two-step ack
- Full portfolio reconciliation engine — `portfolio` dispute stays free-text trade IDs
- SSO / SAML / SOC 2 work (Phase 2)
- Postgres migration, DR, status page (Phase 3)

## Structural decisions (locked)

| Decision | Choice |
|---|---|
| Agreement scope | Agreement-agnostic parent; GMRA subtype implemented first, CSA schema-ready |
| Counterparty setup | Bilateral only this phase |
| Direction | Symmetric — a call can be issued by us or received from counterparty |
| Lifecycle model | Event-sourced, append-only events with denormalised current-state cache |
| Audit | Hash-chained event log (SHA-256 prev-hash linkage) |
| Dispute depth | Structured reason codes + iterative proposals; no portfolio recon |
| Eligibility | First-class `eligibility_schedules` + `haircut_schedules` tables per agreement |
| Four-eyes | Approval required on transitions where `call_amount > agreement.four_eyes_threshold`; always required for cancellation |
| Settlement | `mark-delivered` + `confirm-settlement` two-step; no DVP |
| Valuation source | Manual MTM + AI-suggested MTM (existing agent layer); no market data |
| Source of truth | Server. Client is a view; no authoritative state lives in the browser. |

## Data model

Eight new tables. The `assets.eligibility TEXT` column is retired at the end of the phase (after migration is verified).

```
collateral_agreements
├─ eligibility_schedules
├─ haircut_schedules
└─ margin_calls
   ├─ margin_call_events    (append-only, hash-chained)
   ├─ disputes
   └─ approvals
+ idempotency_keys          (supporting table, not domain)
```

### `collateral_agreements`

Umbrella contract. One per counterparty-pair.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | e.g. `AGR-DBK-001` |
| `counterparty` | TEXT | Name for now; FK to a `counterparties` table in a future phase |
| `agreement_type` | TEXT | `'GMRA'` \| `'CSA'` |
| `governing_law` | TEXT | e.g. `'English'` |
| `base_currency` | TEXT | ISO 4217 |
| `threshold` | REAL | Exposure below which no call is issued |
| `minimum_transfer_amount` | REAL | MTA, in base_currency |
| `rounding` | REAL | e.g. 10000 means round call amount to nearest 10k |
| `call_notice_deadline_time` | TEXT | HH:MM, time-of-day calls must be agreed |
| `four_eyes_threshold` | REAL | Call amount above which second-user approval is required |
| `status` | TEXT | `'active'` \| `'terminated'` |
| `effective_date` | TEXT | ISO date |
| `termination_date` | TEXT | nullable |
| `created_at`, `updated_at` | TEXT | ISO timestamps |

### `eligibility_schedules`

What assets are eligible to post against this agreement.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `agreement_id` | TEXT FK | |
| `name` | TEXT | e.g. `'Tier 1 Sovereigns'` |
| `criteria_json` | TEXT (JSON) | `{ asset_type, issuer_country, rating_min, currency, tenor_max_days, concentration_limit_pct }` — any subset |
| `priority` | INTEGER | For ordering when multiple schedules match |

### `haircut_schedules`

Haircuts per criteria match. Can be agreement-wide or tied to a specific eligibility schedule.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `agreement_id` | TEXT FK | |
| `eligibility_schedule_id` | TEXT FK | nullable |
| `criteria_json` | TEXT (JSON) | |
| `haircut` | REAL | `0.005` = 0.5% |

### `margin_calls`

One row per call. `current_state` is a denormalised cache derived from the latest event.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | e.g. `MC-2026-04-17-0001` |
| `agreement_id` | TEXT FK | |
| `direction` | TEXT | `'issued'` \| `'received'` (from our perspective) |
| `call_date` | TEXT | ISO date |
| `exposure_amount` | REAL | |
| `collateral_value` | REAL | Post-haircut |
| `call_amount` | REAL | Rounded to `agreement.rounding` |
| `currency` | TEXT | ISO 4217 |
| `current_state` | TEXT | Cached from latest event |
| `issued_by_user_id` | INTEGER FK | |
| `issued_at` | TEXT | |
| `resolved_at` | TEXT | nullable |
| `settlement_ref` | TEXT | nullable |
| `four_eyes_required` | BOOLEAN | Computed at issue time |
| `deadline_at` | TEXT | call_date + agreement.call_notice_deadline_time |
| `created_at`, `updated_at` | TEXT | |

### `margin_call_events` — the audit spine

Append-only, hash-chained. Every state change writes exactly one event.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `margin_call_id` | TEXT FK | |
| `event_type` | TEXT | See event vocabulary below |
| `occurred_at` | TEXT | ISO timestamp |
| `actor_user_id` | INTEGER FK | nullable (for agent actions) |
| `actor_type` | TEXT | `'user'` \| `'agent'` \| `'system'` |
| `payload_json` | TEXT (JSON) | Event-specific fields |
| `prev_hash` | TEXT | Previous event hash, or `GENESIS_HASH` for first event |
| `hash` | TEXT | `sha256(prev_hash + event_type + occurred_at + actor_user_id + stable_stringify(payload))` |

Event types: `issued`, `pending_review`, `disputed`, `dispute_opened`, `dispute_proposed`, `dispute_agreed`, `dispute_withdrawn`, `dispute_escalated`, `four_eyes_requested`, `four_eyes_granted`, `four_eyes_rejected`, `accepted`, `delivery_marked`, `settled`, `resolved`, `cancelled`, `commented`, `deadline_breached`.

### `disputes`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `margin_call_id` | TEXT FK | |
| `opened_by_user_id` | INTEGER FK | |
| `opened_at` | TEXT | |
| `reason_code` | TEXT | `'valuation'` \| `'portfolio'` \| `'eligibility'` \| `'settlement'` \| `'other'` |
| `their_proposed_value` | REAL | nullable (reason-dependent) |
| `our_proposed_value` | REAL | nullable |
| `delta` | REAL | Computed |
| `status` | TEXT | `'open'` \| `'agreed'` \| `'withdrawn'` \| `'escalated'` |
| `resolution_note` | TEXT | |
| `resolved_at` | TEXT | nullable |

### `approvals`

Four-eyes records. Same model serves margin-call approvals today; extensible to other domains.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `entity_type` | TEXT | `'margin_call_accept'` \| `'margin_call_dispute_agree'` \| `'margin_call_issue'` \| `'margin_call_cancel'` |
| `entity_id` | TEXT | |
| `requested_by_user_id` | INTEGER FK | |
| `requested_at` | TEXT | |
| `approved_by_user_id` | INTEGER FK | nullable |
| `approved_at` | TEXT | nullable |
| `status` | TEXT | `'pending'` \| `'granted'` \| `'rejected'` |
| `rejection_reason` | TEXT | nullable |

### `idempotency_keys`

Supporting table. Not domain.

| Column | Type |
|---|---|
| `idempotency_key` | TEXT |
| `actor_user_id` | INTEGER |
| `endpoint` | TEXT |
| `response_json` | TEXT |
| `created_at` | TEXT |

Composite PK `(idempotency_key, actor_user_id, endpoint)`. Rows older than 24h are GCed by nightly job.

## State machine

**Nine states, one graph, symmetric across direction.**

```
                              ┌──(cancel, ∀ non-terminal)──▶ cancelled ╳
                              │
draft ──issue──▶ issued ──accept──▶ agreed ──deliver──▶ delivered ──confirm──▶ settled ──▶ resolved ╳
                  │   └──accept, 4E──▶ pending_four_eyes ──grant──▶ agreed
                  │                              └──reject──▶ disputed
                  └──dispute.open──▶ disputed
                                       ├──dispute.agree──▶ agreed (may re-gate 4E)
                                       ├──dispute.withdraw──▶ cancelled
                                       └──dispute.escalate──▶ disputed (flagged)
```

Terminal states: `resolved`, `cancelled`.

### Transition table

| From | Event | To | Gate |
|---|---|---|---|
| — | create (issued) | draft | `canIssueCall` |
| — | create (received) | issued | `canRespondCall` |
| draft | issue | issued or pending_four_eyes | `canIssueCall`; 4E if above threshold |
| issued | accept | agreed or pending_four_eyes | `canRespondCall`; 4E if above threshold |
| issued | dispute.open | disputed | `canOpenDispute` |
| pending_four_eyes | approval.grant | agreed | `canApproveFourEyes`, not same user |
| pending_four_eyes | approval.reject | disputed | `canApproveFourEyes`, not same user |
| disputed | dispute.agree | agreed or pending_four_eyes | `canResolveDispute`; 4E if above threshold |
| disputed | dispute.propose | disputed (new event) | `canOpenDispute` or `canResolveDispute` |
| disputed | dispute.withdraw | cancelled | Must be originator |
| disputed | dispute.escalate | disputed (flagged) | `canResolveDispute` |
| agreed | mark-delivered | delivered | `canRespondCall`; direction-sensitive |
| delivered | confirm-settlement | settled | `canRespondCall`; opposite side |
| settled | (auto) | resolved | System event |
| * non-terminal | cancel | cancelled | `canCancelCall`; 4E always |
| * | comment | (same) | `canRespondCall`, no state change |
| issued, pending_four_eyes | deadline (by cron) | (same) | System; emits `deadline_breached` marker, does not auto-cancel |

### Invariants

- Every state change writes exactly one event in the same DB transaction.
- `current_state` is only written by `appendEvent`; nothing else may update it.
- Terminal states cannot be transitioned out of.
- `mark-delivered` requires delivered_amount matches `agreed.call_amount`, or a `variance_reason` is provided.
- Only the counterpart side of `direction` can fire state-progressing actions (we cannot "accept our own call").
- Same-user four-eyes approval is rejected at service layer (not UI).

## API surface

New route files: `collateral-api/src/routes/agreements.js`, `marginCalls.js`, `disputes.js`, `approvals.js`.

### Agreements & schedules — `/api/agreements`

```
GET    /agreements                              list; filters: counterparty, type, status
GET    /agreements/:id                          detail w/ nested schedules
POST   /agreements                              create
PATCH  /agreements/:id                          update terms (audit entry written)
POST   /agreements/:id/terminate                close out (four-eyes)

GET    /agreements/:id/eligibility-schedules
POST   /agreements/:id/eligibility-schedules
PATCH  /eligibility-schedules/:id
DELETE /eligibility-schedules/:id

GET    /agreements/:id/haircut-schedules
POST   /agreements/:id/haircut-schedules
PATCH  /haircut-schedules/:id
DELETE /haircut-schedules/:id
```

### Margin calls — `/api/margin-calls`

```
GET    /margin-calls                            list; filters: state, agreement, counterparty, direction, date range, four_eyes_pending=true, has_dispute=true
GET    /margin-calls/:id                        detail w/ events, disputes, approvals
GET    /margin-calls/suggested                  AI advisor — candidate calls from current exposures

POST   /margin-calls                            create (direction=issued→draft; direction=received→issued)
POST   /margin-calls/:id/issue                  draft → issued
POST   /margin-calls/:id/accept                 issued → agreed (or pending_four_eyes)
POST   /margin-calls/:id/mark-delivered         agreed → delivered; body: settlement_ref, delivered_amount, variance_reason?
POST   /margin-calls/:id/confirm-settlement     delivered → settled
POST   /margin-calls/:id/cancel                 → cancelled (always four-eyes)
POST   /margin-calls/:id/comments               add `commented` event; no state change
POST   /margin-calls/:id/ai-assess              agent annotation as `commented` event w/ actor_type='agent'

GET    /margin-calls/:id/events                 event log (hash chain visible)
GET    /margin-calls/:id/events.csv             audit export
```

### Disputes — `/api/disputes`

```
POST   /margin-calls/:id/disputes               open dispute w/ reason_code + required fields
POST   /disputes/:id/propose                    counter-proposal (iterative)
POST   /disputes/:id/agree                      converge on final amount (may gate four-eyes)
POST   /disputes/:id/withdraw                   originator only
POST   /disputes/:id/escalate                   flag for senior review
```

### Approvals — `/api/approvals`

```
GET    /approvals/pending                       for current user; excludes self-requested
POST   /approvals/:id/grant                     approve; server rejects same-user-as-requester
POST   /approvals/:id/reject                    reject w/ reason
```

### Standard action response shape

```json
{
  "marginCall": { "...current state, computed fields..." },
  "event": { "id": 42, "eventType": "accepted", "hash": "a3f2…", "prev_hash": "c9e1…", "occurredAt": "2026-04-17T10:12:00Z" },
  "approvalPending": { "id": "APP-...", "requiredRole": "credit_approver" }
}
```

### Status codes (strict)

| Code | Use |
|---|---|
| 200 | Action accepted, state transitioned |
| 201 | Resource created |
| 202 | Accepted but pending four-eyes — not yet in new state |
| 403 | Permission missing or four-eyes self-approval attempted |
| 409 | Invalid state transition; body lists allowed transitions + current state |
| 422 | Validation failed; body lists field-level errors |

## Permissions model

Added to `collateral-api/src/middleware/auth.js` and mirrored in `collateral-app/src/domain/permissions.js`.

| Permission | Default roles |
|---|---|
| `canManageAgreements` | Legal/ops admin |
| `canIssueCall` | Collateral ops |
| `canRespondCall` | Collateral ops |
| `canOpenDispute` | Collateral ops |
| `canResolveDispute` | Ops manager + credit |
| `canApproveFourEyes` | Credit/risk approver (distinct from issuer roles) |
| `canCancelCall` | Ops manager (+ unconditional four-eyes gate in handler) |
| `canExportAudit` | Auditor (read-only elsewhere) |

Role assignment is made explicit in a new `docs/` table; the `roles` column on `users` stays the same string enum, but the enum is widened.

## Hash-chain helper

One function in `collateral-api/src/db/appendEvent.js`. Every state-changing action in every route funnels through it.

```js
function appendEvent(db, { marginCallId, eventType, actor, payload, expectedState }) {
  return db.transaction(() => {
    const call = db.prepare('SELECT current_state FROM margin_calls WHERE id=?').get(marginCallId);
    if (!call) throw new NotFound();
    if (expectedState && call.current_state !== expectedState) {
      throw new ConflictError({ currentState: call.current_state, allowed: allowedTransitions(call.current_state) });
    }
    const prev = db.prepare('SELECT hash FROM margin_call_events WHERE margin_call_id=? ORDER BY id DESC LIMIT 1').get(marginCallId);
    const prevHash = prev?.hash ?? GENESIS_HASH;
    const occurredAt = new Date().toISOString();
    const hash = sha256(prevHash + eventType + occurredAt + (actor.id ?? 'system') + stableStringify(payload));
    const id = db.prepare(`INSERT INTO margin_call_events (...) VALUES (...) RETURNING id`).get(...).id;
    db.prepare('UPDATE margin_calls SET current_state=?, updated_at=? WHERE id=?').run(stateForEvent(eventType, call.current_state), occurredAt, marginCallId);
    return { id, eventType, hash, prevHash, occurredAt };
  })();
}
```

Writing to `margin_call_events` outside this helper is the bug pattern to prevent. Enforced by code review.

## UI changes

### What goes away (client-side state ownership)

- `useMarginScan` / `useMarginWorkflow` hooks → read-only fetches
- `collateral-app/src/agents/margin/MarginProtectionAgent.ts` state ownership → repurposed as server-side advisor backing `/margin-calls/suggested`
- `collateral-app/src/workflows/MarginWorkflow.ts` → deleted; logic moves into route handlers
- Local `marginAlerts` state in Zustand store → removed

### What gets added

| Page | Purpose |
|---|---|
| `Agreements.jsx` | List/CRUD collateral agreements |
| `AgreementDetail.jsx` | Terms + nested eligibility/haircut schedule editors |
| `MarginCallDetail.jsx` | Full page (replaces Sheet); event timeline, dispute thread, four-eyes panel, hash-chain integrity badge |
| `Approvals.jsx` | Pending four-eyes queue for current user; excludes own requests |
| `AuditExport.jsx` | Filterable events viewer + CSV download |

Modified: `Margin.jsx` (server-bound), `Sidebar.jsx` (new nav + count badge on Approvals), `lib/api.js` (4 new modules), `domain/permissions.js` (8 new perms).

### Data fetching

Introduce **TanStack Query** for server resources (calls, agreements, approvals). Mutation → query invalidation keys:

- `POST /accept` → invalidate `['margin-calls', id]`, `['margin-calls', 'list']`, `['approvals', 'pending']`
- `POST /grant` → invalidate `['approvals', 'pending']`, `['margin-calls', id]`

Local UI state stays in the existing Zustand store.

### Bank-credibility UI patterns

- "Issued by Alice at 14:23 UTC" visible at top of every detail view
- Hash-chain integrity badge: client replays hashes from event log; green ✓ or red "Tampering detected"
- Four-eyes panel shows greyed "You cannot approve — you requested this" (never just hide the button)
- Dispute thread shows iterative proposals with explicit delta column
- Deadline countdown with color (>4h green / <4h amber / breached red)
- Currency always rendered with ISO code (no implicit USD)
- `actor_type='agent'` events visually distinct from human events (bot icon, muted)

## Migration plan (additive, reversible per step)

1. **DB additive migration** — add 8 new tables in `db/schema.js` `initSchema()`. Leave `assets.eligibility TEXT` and `repos.required_collateral` alone.
2. **Backfill script** `collateral-api/scripts/backfill-agreements.js`: for each distinct `repos.counterparty`, create one `collateral_agreements` row (GMRA, threshold=0, MTA=10k, four_eyes_threshold=1M, base_currency=repo.currency). Create a default eligibility schedule admitting whatever `assets.eligibility` values exist.
3. **Backend routes shipped** behind env flag `ENABLE_MARGIN_V2`. Old paths untouched.
4. **New UI shipped behind same flag**. Internal users toggle.
5. **Demo seed** in `db/demoData.js` — margin calls in varied states (issued, disputed mid-thread, awaiting four-eyes, settled) to show depth.
6. **Cutover** — flip flag for all users. Delete `MarginWorkflow.ts`, `useMarginScan`, client-side `MarginProtectionAgent` state ownership.
7. **Cleanup migration** — drop `assets.eligibility TEXT` column.

## Error handling

- **Transaction atomicity**: each transition is a single SQLite transaction (read prev hash, insert event, update current_state). All-or-nothing.
- **Optimistic concurrency**: action endpoints accept `expected_state`. Mismatch → 409 with current state + allowed transitions.
- **Idempotency**: `POST` action endpoints accept `Idempotency-Key` header; replays return cached result for 24h.
- **Four-eyes self-approval**: rejected at service layer, not UI.
- **Hash-chain corruption**: detected at append time (verify prev) and by nightly full-chain scan job. Critical alert on mismatch.
- **Validation**: 422 with `{ field, code, expected }`.
- **Permissions**: 403 with `{ missing_perm }`.

## Testing strategy — TDD

| Layer | Tool | Coverage |
|---|---|---|
| State machine | Vitest unit | Every `(state × event)` combination; invalid combos return 409 |
| Hash chain | Vitest unit | Genesis → N events → verify; mutated event detected; CSV round-trips |
| API routes | Vitest + supertest | Happy / disputed / four-eyes; idempotency replay; concurrent accept race; self-approval rejection |
| Backfill script | Vitest integration | Runs against fixture DB; N agreements + N schedules; no data loss |
| Migration | Vitest integration | Schema is additive; legacy queries still pass |
| E2E | Playwright | Login → lifecycle → audit export (3 flows) |

DB per test: `new Database(':memory:')` seeded from small fixture.

## Observability

- **Structured logs** on every transition, including call id, state transition, actor, amount, event hash.
- **Metrics**: calls by state; dispute rate; mean time to resolution; four-eyes approval rate (granted / total); deadline breach count; hash-chain integrity pass/fail.
- **Nightly integrity scan job** reuses the existing AI scheduler (`collateral-api/src/ai/scheduler.js`). Verifies the full chain for all non-terminal calls + sample of terminals.

## Definition of Done

1. All 8 tables present, additive migration runs clean
2. All ~30 endpoints implemented with documented payloads
3. State machine transition table has 100% test coverage
4. Hash chain: write → read → verify → CSV export → re-import-verify all green
5. Four-eyes self-approval rejected at server (test proves it)
6. Idempotency replay safe for all action endpoints
7. Optimistic concurrency conflict returns 409 with allowed transitions
8. Backfill script runs cleanly against current demo data; zero data loss
9. New UI completes 3 flows end-to-end: happy, dispute, four-eyes
10. AI advisor endpoint returns suggestions; UI shows them with `actor_type='agent'` badge
11. Deadline cron emits breach events; UI shows red badge
12. Documentation: schema, state machine, perm matrix, audit export format
13. Demo script: fresh login → complete lifecycle → tamper-evident audit export in <10 min
14. Old `MarginWorkflow.ts` and client-side state ownership deleted

## Open questions (nothing blocking — flag before implementation if relevant)

- Counterparty entity: first-class `counterparties` table now, or stay with string column and add it in Phase 4 when we wire triparty? Current plan: stay with string; revisit at Phase 4 kickoff.
- AI advisor: should agent-generated suggestions auto-create `draft` calls, or only show on a suggestion list? Current plan: suggestion list only. Humans click "create draft from suggestion".
- Concurrency under serverless SQLite on Vercel: `/tmp/` is per-instance and not shared. This spec assumes a durable shared DB; Phase 3 (Postgres) addresses this properly. For now, `better-sqlite3` on a pinned Vercel function works for demo but is not production-grade.
