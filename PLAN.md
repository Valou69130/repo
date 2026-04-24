# CollateralOS — Next Level Plan

## What we're building

**Real-time Margin Engine + Live Market Data Feed**

CollateralOS currently has all the right workflows but runs on static data. Every position is frozen at import time. Prices don't move. Margin calls only happen when a user clicks. For a demo, this is fine. For a product people actually use — or a demo that closes deals — it's a liability.

This plan ships three interconnected features that make the platform feel alive:

1. **Live market data feed** — A server-side price simulator that continuously updates asset market values (±0.1–2% per tick, with correlated stress scenarios). Streamed to the frontend via Server-Sent Events (SSE). The frontend re-runs margin calculations on every price tick and flags repos that cross thresholds.

2. **Automatic margin call generation** — When a repo's coverage ratio drops below the configured MTA (minimum transfer amount) threshold, the system automatically creates a `draft` margin call, notifies the assigned user, and triggers the four-eyes approval flow if required. This replaces the current "suggested calls" widget that shows static data.

3. **PDF report generation** — Export margin call notices, position statements, and SFTR reports as professional PDFs. This is the #1 missing feature for any real treasury workflow — you need to send a PDF to your counterparty, not a screenshot.

---

## Why

CollateralOS is a demo-first product. It needs to win the room. Right now:
- The data never changes. Refreshing the page looks the same as when you first loaded it.
- You can't hand a counterparty anything — no PDF, no formal notice, nothing.
- The "suggested margin calls" feature shows items that never change.

After this plan:
- Open CollateralOS. Prices are ticking in real time. A repo just crossed the deficit threshold. A margin call was created automatically. The approver gets a notification. They approve. A PDF margin call notice is generated and ready to send. That's a deal-closing demo.

---

## Scope

### In scope

**A. Client-side price feed (browser simulation)**
- Frontend-only: `useMarketFeed` hook runs a `setInterval` that dispatches `ASSETS_BULK_UPDATED` every 5s
- No backend required; see "Technical approach" below for volatility parameters
- The existing `useAgentRunner` margin scan already reads from the store, so it picks up price changes automatically
- Note: original plan described SSE; this was replaced with client-side simulation to avoid Vercel serverless timeout issues

**B. Automatic margin call creation**
- Extend `useAgentRunner` scan: when coverage ratio drops below `(required - MTA)`, call `api.createMarginCall()` automatically
- New notification type: `"margin-call-auto-created"` with link to the draft
- The existing margin call workflow handles everything after creation (issue → four-eyes → accept → deliver → settle)
- Backend already has `GET /margin-calls/suggested` — wire this to the auto-creation trigger

**C. PDF report generation**
- Backend: `GET /margin-calls/:id/pdf` — generates PDF using `pdfkit` (GET, not POST — this is a read/download, not a mutation). Requires `npm install pdfkit` in `collateral-api/`.
- Frontend: `DownloadPdfButton` component added to `MarginCallDetail.jsx` and `AuditExport.jsx`
- Templates: margin call notice (counterparty-ready), position statement (internal), SFTR submission confirmation
- Download via browser `<a download>` pattern (same as existing CSV template download)

### Not in scope (deferred to TODOS.md)
- Real Bloomberg/Reuters price integration (needs API key + paid subscription)
- Email delivery of PDF notices (needs SMTP config, out of scope for demo)
- Cross-agreement netting (significant data model change, separate plan)
- WebSocket bidirectional protocol (SSE is sufficient for unidirectional price feed)
- Mobile app

---

## Technical approach

### Price feed (client-side simulation — replaces SSE)

SSE on Vercel serverless is unreliable (10s default timeout, /tmp SQLite resets on cold start). The simulation runs entirely in the frontend — equally realistic for demo purposes, zero backend changes.

`useMarketFeed` hook (`collateral-app/src/hooks/useMarketFeed.ts`):
```ts
// Realistic bond volatility: ±0.02% per tick normally, ±0.5% stress (1 in 60 ticks)
const NORMAL_VOL  = 0.0002;  // 2 basis points per 5s tick
const STRESS_VOL  = 0.005;   // 50bp shock every ~5 minutes
const TICK_MS     = 5_000;

useEffect(() => {
  const tick = setInterval(() => {
    const assets = assetsRef.current;
    if (!assets || assets.length === 0) return; // guard: don't fire before assets load
    const isStress = Math.random() < (1 / 60);
    const vol = isStress ? STRESS_VOL : NORMAL_VOL;
    const updated = assets.map(a => ({
      ...a,
      market_value: Math.round(a.market_value * (1 + (Math.random() - 0.5) * 2 * vol)),
    }));
    dispatch({ type: 'ASSETS_BULK_UPDATED', payload: updated });
  }, TICK_MS);
  return () => clearInterval(tick);
}, [dispatch]);
```

Note: normal volatility is ±0.02% per tick (2 basis points). Real IG sovereign bonds move ~5-10bp per day total — this is deliberately compressed for demo visibility. Stress scenario fires ~every 5 minutes.

This integrates with the existing store via a new `ASSETS_BULK_UPDATED` action (single re-render instead of N individual `ASSET_UPDATED` dispatches).

### PDF generation

Use `pdfkit` (MIT, no binary deps, works in Node.js serverless). The margin call notice PDF follows ISDA standard format:
- Header: CollateralOS logo, date, reference number
- Body: agreement details, exposure amount, MTA, net margin call amount, value date
- Footer: legal boilerplate, authorized signatory line

`pdfkit` streams directly to `res` — no temp files needed.

### Auto margin call trigger

Extend `runMarginScan` in `useAgentRunner`:
- After scan completes, for each alert with `severity === 'Critical'` and no existing open margin call for that repo, call `api.createMarginCall()`
- Dedup: Two-layer approach:
  1. **Server-side (primary):** Add to `POST /margin-calls` handler, after the agreement lookup:
     ```js
     const openCall = db.prepare(
       `SELECT id FROM margin_calls WHERE agreement_id = ? AND current_state NOT IN ('resolved','cancelled')`
     ).get(b.agreementId);
     if (openCall) return res.status(409).json({ error: 'Open margin call exists', existingId: openCall.id });
     ```
  2. **Frontend (secondary):** In `useAgentRunner`, catch the 409 response from `api.createMarginCall()` and treat it as a no-op (not an error to show the user).
- Do NOT use a client-side `Set` as the primary dedup — it resets on reload and is invisible to other browser tabs.

---

## Success criteria

1. **Price feed live**: Open the app, watch the "Portfolio Allocation" donut chart values change in real time without any user action.
2. **Auto margin call**: Force a price drop scenario (stress mode) — within 60 seconds, a new draft margin call appears in the Approvals inbox.
3. **PDF download**: Click "Download PDF" on any margin call detail page and receive a properly formatted PDF.
4. **No regressions**: All existing workflows (SFTR, audit trail, four-eyes, disputes) continue to work.

---

## Effort estimate

| Component | Human | CC+gstack |
|-----------|-------|-----------|
| SSE backend endpoint | 1 day | 30 min |
| `useMarketFeed` hook | 4h | 15 min |
| Auto margin call trigger | 4h | 20 min |
| PDF generation backend | 1 day | 30 min |
| PDF download UI component | 4h | 15 min |
| Integration & QA | 1 day | 30 min |
| **Total** | **~5 days** | **~2.5h** |

---

## Risks

- **pdfkit font loading in serverless**: pdfkit has issues with font discovery in `/tmp` environments on Vercel. Mitigation: use only built-in Helvetica/Times fonts (no external font files), or switch to `pdf-lib` if pdfkit proves problematic.
- **pdfkit streaming**: pdfkit pipes directly to `res` — ensure the route does not call `res.json()` after piping starts or it will throw "Cannot set headers after they are sent".
- **Price feed causing excessive re-renders**: If prices tick every 5s and the store dispatches 20+ asset updates, React may struggle. Mitigation: batch all assets in a single `ASSETS_BULK_UPDATED` dispatch.

---

## Files to create or modify

**New files:**
- `collateral-api/src/ops/pdfGenerator.js` — PDF template engine (pdfkit-based)
- `collateral-app/src/hooks/useMarketFeed.ts` — client-side price simulation hook
- `collateral-app/src/components/shared/DownloadPdfButton.jsx` — PDF download UI

**Modified files:**
- `collateral-api/src/routes/marginCalls.js` — add `GET /:id/pdf` route (with `requireAuth`) + server-side dedup check in `POST /`
- `collateral-app/src/domain/store.tsx` — add `ASSETS_BULK_UPDATED` action + `marketLive: boolean` state field
- `collateral-app/src/App.jsx` — mount `useMarketFeed` hook
- `collateral-app/src/pages/Dashboard.jsx` — add LIVE badge to Portfolio Allocation card header
- `collateral-app/src/workflows/hooks/useAgentRunner.ts` — auto margin call trigger with server-side dedup
- `collateral-app/src/pages/MarginCallDetail.jsx` — add DownloadPdfButton
- `collateral-app/src/pages/AuditExport.jsx` — add PDF export option

**Install:**
```bash
cd collateral-api && npm install pdfkit
```

**NOT changed:** `collateral-api/src/index.js` (no new routes to mount), `vercel.json` (no SSE, no maxDuration change needed)

---

## Architecture Diagram

```
BROWSER
┌─────────────────────────────────────────────────────────────┐
│ App.jsx                                                       │
│  ├─ useMarketFeed (setInterval 5s)                           │
│  │    ├─ guard: if assets.length === 0 return                │
│  │    └─ dispatch ASSETS_BULK_UPDATED → store.tsx            │
│  └─ useAgentRunner                                           │
│       ├─ Margin scan (45s) — reads repos/assets from store   │
│       │    └─ Critical alert found?                          │
│       │         ├─ POST /margin-calls → 201 draft created    │
│       │         ├─ POST /margin-calls → 409 exists, skip     │
│       │         └─ dispatch NOTIFICATION_ADDED               │
│       └─ Exception scan (30s)                                │
│                                                               │
│ store.tsx                                                     │
│  ├─ DomainState.assets[]     ← ASSETS_BULK_UPDATED          │
│  └─ DomainState.marketLive   ← first tick sets to true      │
│                                                               │
│ Dashboard.jsx                                                 │
│  ├─ reads marketLive → LIVE badge                            │
│  └─ reads assets → PieChart (values animate on update)       │
│                                                               │
│ MarginCallDetail.jsx / AuditExport.jsx                       │
│  └─ DownloadPdfButton                                        │
│       ├─ idle: "Download PDF"                                │
│       ├─ click → fetch GET /api/margin-calls/:id/pdf         │
│       └─ success → blob → <a download> click                 │
└─────────────────────────────────────────────────────────────┘
         │ HTTPS
         ▼
VERCEL SERVERLESS (collateral-api)
┌─────────────────────────────────────────────────────────────┐
│ POST /margin-calls (existing, modified)                       │
│  ├─ requireAuth                                               │
│  ├─ dedup: SELECT WHERE agreement_id=? AND state NOT IN      │
│  │         ('resolved','cancelled') → 409 if found           │
│  └─ INSERT margin_call → 201                                  │
│                                                               │
│ GET /margin-calls/:id/pdf (NEW)                               │
│  ├─ requireAuth                                               │
│  ├─ SELECT * FROM margin_calls WHERE id=?                    │
│  ├─ 404 if not found                                          │
│  ├─ pdfGenerator.js → pdfkit → pipe to res                  │
│  └─ Content-Type: application/pdf                            │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
SQLite (/tmp — resets on cold start)
```

## Test Coverage Diagram

```
BACKEND (Node.js test runner + supertest — existing infra)

[+] collateral-api/test/routes.marginCalls.pdf.test.js  [NEW]
  ├── [GAP] GET /:id/pdf — authenticated, valid id → 200, application/pdf
  ├── [GAP] GET /:id/pdf — unauthenticated → 401
  ├── [GAP] GET /:id/pdf — unknown id → 404
  └── [GAP] POST / dedup — create when open call exists → 409

[+] collateral-api/test/routes.marginCalls.test.js  [EXTEND]
  └── [GAP] POST / dedup — no duplicate created when one already open

FRONTEND (no component test infra — manual / E2E)

[+] useMarketFeed.ts
  ├── [GAP][→E2E] First tick with assets → LIVE badge appears in Dashboard
  ├── [GAP][→E2E] Empty assets on mount → no dispatch, no wipe
  └── [GAP][→E2E] Stress tick → coverage ratio shifts trigger agent scan

[+] useAgentRunner.ts (extended)
  ├── [GAP][→E2E] Critical coverage deficit → margin call draft created in Approvals
  └── [GAP][→E2E] Second scan with existing draft → no duplicate created (409 handled)

[+] DownloadPdfButton.jsx
  ├── [GAP][→E2E] Click → loading state shown, button disabled
  ├── [GAP][→E2E] Success → PDF downloaded, button returns to idle
  └── [GAP][→E2E] Network error → error message shown below button

COVERAGE: 4/4 backend paths need tests  |  7/7 frontend paths manual/E2E
BACKEND GAPS: 4 (all in new routes.marginCalls.pdf.test.js)
FRONTEND GAPS: 7 (manual/E2E — no RTL setup in project)
```

### Test Plan (for /qa)

**Backend tests to write (follow existing patterns in `collateral-api/test/`):**

1. `routes.marginCalls.pdf.test.js` — new file:
   - `GET /margin-calls/:id/pdf — 200 application/pdf for valid authenticated call`
   - `GET /margin-calls/:id/pdf — 401 without auth token`
   - `GET /margin-calls/:id/pdf — 404 for unknown id`

2. Extend `routes.marginCalls.test.js`:
   - `POST /margin-calls — 409 when open call already exists for same agreement`

**Frontend paths to verify manually (no RTL setup):**
- Open app → within 5s, LIVE badge appears on Portfolio Allocation card
- Wait for stress scenario (~5 min) → coverage ratio changes → auto margin call created in Approvals
- PDF download button: click → spinner → file downloads
- PDF download error path: disconnect network → error message shown

---

## UI/UX Specifications

### DownloadPdfButton component

**Placement:**
- `MarginCallDetail.jsx`: Add to the action buttons row (`flex flex-wrap gap-2 pt-2`), appended after all workflow buttons (Issue / Cancel / Deliver / AI assessment). It is a utility export action — not a workflow step — so it belongs last.
- `AuditExport.jsx`: Add to the filter card's download button group, appended after the JSON button.

**States:**

| State | Label | Icon | Variant |
|-------|-------|------|---------|
| Idle | "Download PDF" | `FileText` (Lucide) | `outline` |
| Generating | "Generating…" | `Loader2` (animate-spin) | `outline` + `disabled` |
| Error | — | — | Inline error below button row: "PDF generation failed. Try again." |

**Prop interface:**
```tsx
interface DownloadPdfButtonProps {
  callId: string;      // passed to GET /api/margin-calls/:id/pdf
  className?: string;
}
```

**Download behavior:** Call `GET /api/margin-calls/:id/pdf` with credentials. On success, trigger `<a download="margin-call-{id}.pdf">` click (same pattern as AuditExport CSV download). On error, show inline error message.

**Button copy rationale:** "Download PDF" is specific — it names the action (download) and the format (PDF). Counterparty-facing language. "Export PDF" would also work. "Download PDF" chosen for parallelism with the CSV/JSON pattern in AuditExport.

---

### Auto margin call notification content

When `useAgentRunner` auto-creates a margin call, dispatch:
```json
{
  "id": "N-AUTOMC-{repoId}",
  "severity": "Critical",
  "type": "Critical",
  "title": "Margin Call Created — {repoId}",
  "text": "Coverage was {coveragePct}% (threshold: {requiredPct}%) at time of scan. Draft margin call for {repoId} ({counterparty}) created automatically. Four-eyes approval required before issuance.",
  "target": "{marginCallId}",
  "ts": "ISO timestamp"
}
```
Note: include the coverage ratio at scan time in the notification text. This provides context if the user views the notification after prices have moved (client-side simulation means coverage may look different after a page reload). `id` uses only `repoId` (not timestamp) so the notification deduplicates correctly.

---

### Live price feed UX — RESOLVED: LIVE badge

Normal ticks are ±0.02% on bond market values — visually imperceptible without a signal. **Decision: LIVE pill badge in the Portfolio Allocation card header.**

Implementation spec for `Dashboard.jsx` Portfolio Allocation card header:
```jsx
// Add alongside the existing CardTitle in CardHeader
<div className="flex items-center justify-between">
  <div>
    <CardTitle>Portfolio Allocation</CardTitle>
    <CardDescription>Market value by encumbrance status</CardDescription>
  </div>
  {isLive && (
    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      LIVE
    </span>
  )}
</div>
```

`isLive` is a boolean prop passed from `App.jsx` once `useMarketFeed` has dispatched its first `ASSETS_BULK_UPDATED` action (i.e., after the first tick). Starts `false`, becomes `true` permanently after first tick — no flicker.

The `animate-pulse` Tailwind class produces the standard broadcast-style dot pulse. No additional CSS needed.

**Rationale:** Familiar pattern from Bloomberg/financial dashboards. Communicates liveness unmistakably at a glance — critical for demo context where the price change (±0.02%) may be invisible to a casual observer.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAN | 14 auto-decided, 0 unresolved; SSE→client-side sim, volatility params fixed |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAN | 5 findings: 2 applied (notif copy + multi-tab race), 3 dismissed; 4 backend test gaps identified |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAN | score: 4/10 → 9/10, 5 decisions (placement, states, LIVE badge, notif copy) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**UNRESOLVED:** 0 across all reviews run so far
**VERDICT:** CEO + DESIGN + ENG CLEARED — ready for Final Approval Gate

---

## Decision Audit Trail
