# Design: Rule Engine, Live Integration Feed, SFTR Export

**Date:** 2026-04-12  
**Status:** Approved  
**Scope:** Three features closing the largest gaps between the business plan vision and the current product.

---

## Feature A — Parameters & Rules page (configurable rule engine)

### Problem
The business plan promises "a configurable rule engine enforcing eligibility criteria, haircut schedules, approval hierarchies, and exposure limits." Currently all of these are hardcoded. A banker asking "can we configure our own rules?" has no answer in the UI.

### Design

**New sidebar item:** "Parameters & Rules" with a Settings icon, positioned at the bottom of the Operations section. Visible to all roles; each section is editable only by the owning role — others see read-only with a lock icon.

**Three sections on one scrollable page:**

#### 1. Haircut & Eligibility (Collateral Manager only)
- Editable table: asset class → haircut %. Rows: Government Bond, T-Bill, MMF, Corporate Bond, Covered Bond.
- Eligibility toggles per class: overnight-repo eligible, central-bank eligible, counterparty-restricted. Rendered as checkboxes per row.
- Save button applies immediately.

#### 2. Coverage & Exposure (Treasury Manager only)
- Per-counterparty table: min coverage ratio (%), max exposure (RON/EUR amount).
- Global approval threshold field: repo notional above this amount requires 4-eyes substitution approval. Currently hardcoded; this makes it visible.
- One row per counterparty in the system, editable inline.

#### 3. Risk Parameters (Risk Reviewer only)
- Stress test % (currently hardcoded at 10% in Margin page slider — this becomes the default).
- MTA per counterparty (minimum transfer amount for margin calls). Currently hardcoded in `COUNTERPARTY_PROFILES`.
- Editable inline table, same pattern as coverage section.

### State model

New `ruleEngine` key in domain store:

```ts
ruleEngine: {
  haircuts: Record<string, number>,           // asset class → haircut %
  eligibility: Record<string, string[]>,      // asset class → eligible repo types
  counterparties: Record<string, {
    minCoverageRatio: number,
    maxExposure: number,
    mta: number,
  }>,
  approvalThreshold: number,                  // 4-eyes trigger above this notional
  stressPct: number,                          // margin stress test default
}
```

Seeded from `src/data/ruleEngineSeed.js`. Persisted to localStorage under the v2 storage key — resets with the demo reset button. New action: `RULE_ENGINE_UPDATED` with a partial payload merged into current state.

### Workflow wiring

| Workflow | Change |
|---|---|
| `AllocationWorkflow` | Read haircut from `ruleEngine.haircuts[asset.type]` instead of `asset.haircut`. Read eligibility from `ruleEngine.eligibility[asset.type]` instead of the eligibility string. |
| Repo creation (App.jsx) | Read `minCoverageRatio` from `ruleEngine.counterparties[cp]` instead of `COUNTERPARTY_PROFILES`. Check `maxExposure` — block creation if total active exposure to counterparty would exceed limit. |
| 4-eyes approval trigger | Route to `proposeSubstitution` (pending approval) if `repo.amount > ruleEngine.approvalThreshold`, otherwise allow direct `substituteCollateral`. |
| `MarginWorkflow` | Read MTA from `ruleEngine.counterparties[cp].mta`. Read default stress % from `ruleEngine.stressPct` as the initial slider value. |

### Role gating
`getPermissions(role)` extended with `canEditHaircuts`, `canEditCoverage`, `canEditRiskParams`. Each section checks its permission before rendering edit controls.

---

## Feature B — Live integration feed simulation

### Problem
The core competitive claim is "sits between SaFIR, Euroclear, Bloomberg, and your people." The IntegrationHub page shows static connection status. Nothing feels alive. A banker doesn't experience the integration story.

### Design

**IntegrationHub** gains a "Live Feed" panel at the top of the page — a scrolling event log that auto-appends simulated feed events.

#### Connection health cards
Four cards at the top — one per source system: SaFIR position feed, Bloomberg Tradebook, Murex import, Euroclear SWIFT feed. Each shows: status dot (green/amber/red), last sync timestamp (ticking forward), uptime %, event count today.

#### Live event log
A scrolling log (max 50 entries, oldest dropped) that appends a new event every 15–30 seconds via `setInterval`. Each event has:
- Timestamp (current time)
- Source system badge (colour-coded)
- Message (from a rotating pool of realistic messages)
- Status: OK / Warning / Error

Example messages per system:
- SaFIR: "3 positions updated — RO1827DBN011, RO1830DBN022, ROTBILL26S02"
- Bloomberg: "Heartbeat OK — last trade feed: R-1026"
- Murex: "R-1024 MTM price refreshed — collateral value recalculated"
- Euroclear: "Settlement confirmation received — R-1027 delivery leg matched"

#### Domain store side-effect
When a SaFIR or Euroclear event fires for a specific asset, dispatch `ASSET_UPDATED` with a refreshed `integration.lastSyncTs` timestamp. The Inventory page then shows fresh sync times — the data is visibly alive across the app.

#### Implementation
- `useEffect` in IntegrationHub starts the interval on mount, clears on unmount.
- Event pool defined as a static array of templates with `{assetId}` and `{repoId}` placeholders filled from live state.
- No backend required — purely frontend simulation.

---

## Feature C — SFTR export

### Problem
SFTR report generation is a Phase 1 selling point. The page exists and generates data correctly, but there is no export. An operations person will immediately ask "how do we get this to the ARM?"

### Design

**Two export buttons** added to the SFTR Report page header, right-aligned next to the existing KPI summary: "Export CSV" and "Export XML".

#### CSV export
Columns in SFTR field order: UTI, Report Type, Counterparty LEI, Counterparty Name, Notional, Currency, Rate, Start Date, Maturity Date, Collateral ISIN, Collateral Value, Haircut, Report Date.

One row per active repo. Downloaded via `Blob` + `URL.createObjectURL` + programmatic `<a>` click. Filename: `SFTR_Report_YYYY-MM-DD.csv`.

#### XML export
Wraps the same data in the SFTR XML envelope — extending the existing `buildXML` function which already generates partial XML. Output matches the ESMA SFTR XML schema structure. Filename: `SFTR_Report_YYYY-MM-DD.xml`.

#### Footer note
Below the export buttons: *"Direct ARM submission — Q3 roadmap. Export this file to your trade repository manually in the interim."* This anchors the roadmap narrative without overpromising.

Both buttons visible to all roles.

---

## Shared implementation notes

- All three features are independent — can be built and deployed in sequence without blocking each other.
- Rule engine seed data must be consistent with existing `COUNTERPARTY_PROFILES` values so behaviour doesn't change until a user explicitly edits a rule.
- The Parameters page should be added to the sidebar below the Operations section, before Audit Trail.
- `COUNTERPARTY_PROFILES` in `src/domain/counterparties.js` remains as the static default/fallback; the rule engine overrides it at runtime.

---

## Self-review

- No TBDs or placeholders.
- Workflow wiring table is explicit — no ambiguity about which file changes.
- Rule engine seed mirrors existing hardcoded values — zero behaviour change until user edits.
- All three features are independently deployable.
- Role gating is consistent with existing `getPermissions` pattern.
- SFTR export extends existing `buildXML` — no duplication.
