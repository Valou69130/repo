# Rule Engine & Live Integration Feed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a configurable rule engine that actually drives allocation, margin, and substitution workflow logic (role-gated), and add a live integration feed simulation to IntegrationHub.

**Architecture:** A `ruleEngine` slice is added to the domain store (localStorage-persisted alongside existing state). All four workflow touch-points (AllocationWorkflow, App.jsx repo creation, MarginWorkflow, SubstitutionSheet) read from it instead of COUNTERPARTY_PROFILES / hardcoded values. A new ParametersRules page lets each role edit only their section. Feature B adds a `useEffect`-driven setInterval in IntegrationHub that auto-appends events and dispatches `ASSET_UPDATED` for cross-app liveness.

**Tech Stack:** React 19, TypeScript (workflows/agents), Vite, Tailwind, Radix UI, localStorage mock API

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `collateral-app/src/data/ruleEngineSeed.js` | **Create** | Seed data — mirrors COUNTERPARTY_PROFILES values so zero behaviour change until a user edits |
| `collateral-app/src/domain/store.tsx` | **Modify** | Add `ruleEngine` to DomainState, `RULE_ENGINE_UPDATED` action, `useRuleEngine()` hook |
| `collateral-app/src/integrations/mockApi.js` | **Modify** | Include `ruleEngine` in `buildSeedStore`, `readStore`, `resetDemo`; add `updateRuleEngine` |
| `collateral-app/src/domain/permissions.js` | **Modify** | Add `canEditHaircuts`, `canEditCoverage`, `canEditRiskParams` flags |
| `collateral-app/src/pages/ParametersRules.jsx` | **Create** | 3-section page: Haircuts & Eligibility, Coverage & Exposure, Risk Parameters |
| `collateral-app/src/components/layout/Sidebar.jsx` | **Modify** | Add "Parameters & Rules" nav item in Operations, before Audit Trail |
| `collateral-app/src/App.jsx` | **Modify** | Render ParametersRules page; pass `ruleEngine` to repo-creation coverage ratio reads |
| `collateral-app/src/workflows/AllocationWorkflow.ts` | **Modify** | Accept optional `ruleEngine` param; apply it to coverageRatio and asset haircut overrides |
| `collateral-app/src/workflows/hooks/useWorkflows.ts` | **Modify** | Read `ruleEngine` from domain state; pass to `runAllocation` and `runMarginScan` |
| `collateral-app/src/agents/margin/detector.ts` | **Modify** | Add `mtaMap?: Record<string, number>` to `DetectOptions`; use per-counterparty MTA when provided |
| `collateral-app/src/workflows/MarginWorkflow.ts` | **Modify** | Accept optional `mtaMap`; forward to `detectAlerts` via `opts` |
| `collateral-app/src/pages/Margin.jsx` | **Modify** | Init `stressPct` from `ruleEngine.stressPct`; read MTA display from `ruleEngine` |
| `collateral-app/src/components/substitution/SubstitutionSheet.jsx` | **Modify** | Auto-route execute vs propose based on `repo.amount > ruleEngine.approvalThreshold` |
| `collateral-app/src/pages/IntegrationHub.jsx` | **Modify** | Add connection health cards + live event log with `setInterval`; dispatch `ASSET_UPDATED` |

---

## Task 1: Create ruleEngineSeed.js

**Files:**
- Create: `collateral-app/src/data/ruleEngineSeed.js`

- [ ] **Step 1: Write the file**

```js
// Rule engine seed — mirrors COUNTERPARTY_PROFILES defaults so zero behaviour
// change until a user explicitly edits a rule.
export const ruleEngineSeed = {
  haircuts: {
    "Government Bond": 3,
    "T-Bill":          2,
    "MMF":             4,
    "Corporate Bond":  8,
    "Covered Bond":    5,
  },
  eligibility: {
    "Government Bond": ["overnight-repo", "central-bank"],
    "T-Bill":          ["overnight-repo", "central-bank"],
    "MMF":             ["overnight-repo"],
    "Corporate Bond":  [],
    "Covered Bond":    ["overnight-repo"],
  },
  counterparties: {
    "UniBank Bucharest":      { minCoverageRatio: 1.02, maxExposure: 25000000, mta: 100000 },
    "Danube Capital":         { minCoverageRatio: 1.03, maxExposure: 15000000, mta: 150000 },
    "Carpathia Bank":         { minCoverageRatio: 1.05, maxExposure: 12000000, mta: 200000 },
    "Balkan Treasury House":  { minCoverageRatio: 1.04, maxExposure: 10000000, mta:  50000 },
    "BNR Open Market":        { minCoverageRatio: 1.01, maxExposure: 50000000, mta: 500000 },
  },
  approvalThreshold: 10000000, // repos above 10 M RON require 4-eyes substitution
  stressPct: 10,               // default stress test slider value in Margin page
};
```

- [ ] **Step 2: Commit**

```bash
git add collateral-app/src/data/ruleEngineSeed.js
git commit -m "feat: add rule engine seed data mirroring COUNTERPARTY_PROFILES defaults"
```

---

## Task 2: Extend domain store with ruleEngine slice

**Files:**
- Modify: `collateral-app/src/domain/store.tsx`

- [ ] **Step 1: Add `RuleEngine` interface and `ruleEngine` to `DomainState`**

After the existing imports (around line 22), add:

```ts
import { ruleEngineSeed } from "@/data/ruleEngineSeed";

export interface RuleEngineCounterparty {
  minCoverageRatio: number;
  maxExposure:      number;
  mta:              number;
}

export interface RuleEngine {
  haircuts:        Record<string, number>;
  eligibility:     Record<string, string[]>;
  counterparties:  Record<string, RuleEngineCounterparty>;
  approvalThreshold: number;
  stressPct:       number;
}
```

In `DomainState` interface, add after `workflowEvents`:
```ts
  ruleEngine: RuleEngine;
```

In `initialState`, add:
```ts
  ruleEngine: ruleEngineSeed as RuleEngine,
```

- [ ] **Step 2: Add `RULE_ENGINE_UPDATED` action**

In the `DomainAction` union, add:
```ts
  | { type: "RULE_ENGINE_UPDATED"; payload: Partial<RuleEngine> }
```

In the `LOAD_SUCCESS` action payload type, extend the Pick:
```ts
  | { type: "LOAD_SUCCESS"; payload: Pick<DomainState, "assets" | "repos" | "audit" | "notifications" | "ruleEngine"> }
```

In the reducer `switch`, add the case before `default`:
```ts
    case "RULE_ENGINE_UPDATED":
      return { ...state, ruleEngine: { ...state.ruleEngine, ...action.payload } };
```

- [ ] **Step 3: Add `useRuleEngine()` hook**

At the bottom of store.tsx, before the final closing brace of the exports:
```ts
/** Read the rule engine configuration. */
export function useRuleEngine(): RuleEngine {
  return useDomain().ruleEngine;
}
```

- [ ] **Step 4: Commit**

```bash
git add collateral-app/src/domain/store.tsx collateral-app/src/data/ruleEngineSeed.js
git commit -m "feat: add ruleEngine slice to domain store with RULE_ENGINE_UPDATED action"
```

---

## Task 3: Persist ruleEngine in mockApi

**Files:**
- Modify: `collateral-app/src/integrations/mockApi.js`

- [ ] **Step 1: Add import and extend buildSeedStore**

At the top of the file, after the existing imports:
```js
import { ruleEngineSeed } from "@/data/ruleEngineSeed";
```

In `buildSeedStore()`, add `ruleEngine` to the return object:
```js
function buildSeedStore() {
  return {
    assets:      clone(assetsSeed),
    repos:       clone(repoSeed),
    audit:       clone(auditSeed),
    notifications: clone(notificationsSeed),
    ruleEngine:  clone(ruleEngineSeed),
  };
}
```

In `readStore()`, add to the return object:
```js
    ruleEngine: parsed.ruleEngine ?? clone(ruleEngineSeed),
```

- [ ] **Step 2: Add updateRuleEngine method to mockApi**

Inside the `mockApi` object, after `resetDemo`:
```js
  async getRuleEngine() {
    requireAuth();
    return clone(readStore().ruleEngine);
  },

  async updateRuleEngine(partial) {
    requireAuth();
    const store = readStore();
    store.ruleEngine = { ...store.ruleEngine, ...partial };
    writeStore(store);
    return clone(store.ruleEngine);
  },
```

- [ ] **Step 3: Extend App.jsx loadData to fetch ruleEngine**

In `collateral-app/src/App.jsx`, find the `loadData` function. It currently dispatches `LOAD_SUCCESS` with `{ assets, repos, audit, notifications }`. Change it to also load ruleEngine:

```js
  const loadData = useCallback(async () => {
    dispatch({ type: "LOAD_STARTED" });
    try {
      const [assets, repos, audit, notifications, ruleEngine] = await Promise.all([
        api.getAssets(),
        api.getRepos(),
        api.getAudit(),
        api.getNotifications(),
        api.getRuleEngine(),
      ]);
      dispatch({ type: "LOAD_SUCCESS", payload: { assets, repos, audit, notifications, ruleEngine } });
    } catch (err) {
      dispatch({ type: "LOAD_FAILED", payload: err.message });
    }
  }, [dispatch]);
```

- [ ] **Step 4: Commit**

```bash
git add collateral-app/src/integrations/mockApi.js collateral-app/src/App.jsx
git commit -m "feat: persist ruleEngine in mockApi localStorage store"
```

---

## Task 4: Extend permissions.js with edit flags

**Files:**
- Modify: `collateral-app/src/domain/permissions.js`

- [ ] **Step 1: Add three new permission flags**

Add to each role entry:

```js
export const ROLE_PERMS = {
  "Treasury Manager": {
    // ... existing flags ...
    canEditHaircuts:      false,
    canEditCoverage:      true,   // Coverage & Exposure section
    canEditRiskParams:    false,
  },
  "Collateral Manager": {
    // ... existing flags ...
    canEditHaircuts:      true,   // Haircut & Eligibility section
    canEditCoverage:      false,
    canEditRiskParams:    false,
  },
  "Operations Analyst": {
    // ... existing flags ...
    canEditHaircuts:      false,
    canEditCoverage:      false,
    canEditRiskParams:    false,
  },
  "Risk Reviewer": {
    // ... existing flags ...
    canEditHaircuts:      false,
    canEditCoverage:      false,
    canEditRiskParams:    true,   // Risk Parameters section
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add collateral-app/src/domain/permissions.js
git commit -m "feat: add canEditHaircuts/canEditCoverage/canEditRiskParams permission flags"
```

---

## Task 5: Create ParametersRules.jsx page

**Files:**
- Create: `collateral-app/src/pages/ParametersRules.jsx`

- [ ] **Step 1: Write the page**

```jsx
// ─── Parameters & Rules ───────────────────────────────────────────────────────
// Three role-gated sections: Haircut & Eligibility, Coverage & Exposure,
// Risk Parameters. Each section is read-only unless the user's role owns it.

import { useState } from "react";
import { Lock, Save, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDomain, useDispatch, useRuleEngine } from "@/domain/store";
import { getPermissions } from "@/domain/permissions";
import { api } from "@/integrations/api";
import { fmtMoney } from "@/domain/format";

const ASSET_CLASSES = ["Government Bond", "T-Bill", "MMF", "Corporate Bond", "Covered Bond"];
const ELIGIBILITY_TYPES = ["overnight-repo", "central-bank", "counterparty-restricted"];

function SectionHeader({ title, editable, locked }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {locked && (
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <Lock className="h-3 w-3" /> Read-only for your role
        </span>
      )}
    </div>
  );
}

// ── Section A: Haircut & Eligibility ─────────────────────────────────────────

function HaircutSection({ ruleEngine, canEdit, onSave }) {
  const [haircuts, setHaircuts] = useState({ ...ruleEngine.haircuts });
  const [eligibility, setEligibility] = useState(
    Object.fromEntries(ASSET_CLASSES.map((c) => [c, [...(ruleEngine.eligibility[c] ?? [])]]))
  );
  const [saving, setSaving] = useState(false);

  function toggleElig(cls, type) {
    setEligibility((prev) => {
      const cur = prev[cls] ?? [];
      return {
        ...prev,
        [cls]: cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type],
      };
    });
  }

  async function handleSave() {
    setSaving(true);
    await onSave({ haircuts, eligibility });
    setSaving(false);
  }

  return (
    <div className="rounded-lg border border-slate-200 p-5 mb-6">
      <SectionHeader title="Haircut & Eligibility" locked={!canEdit} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="pb-2 font-medium">Asset Class</th>
              <th className="pb-2 font-medium">Haircut %</th>
              {ELIGIBILITY_TYPES.map((t) => (
                <th key={t} className="pb-2 font-medium capitalize">{t.replace(/-/g, " ")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ASSET_CLASSES.map((cls) => (
              <tr key={cls} className="border-b last:border-0">
                <td className="py-2.5 font-medium text-slate-800">{cls}</td>
                <td className="py-2.5">
                  {canEdit ? (
                    <input
                      type="number" min={0} max={50} step={0.5}
                      value={haircuts[cls] ?? 0}
                      onChange={(e) => setHaircuts((h) => ({ ...h, [cls]: parseFloat(e.target.value) || 0 }))}
                      className="w-20 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
                    />
                  ) : (
                    <span className="tabular-nums">{ruleEngine.haircuts[cls] ?? 0}%</span>
                  )}
                </td>
                {ELIGIBILITY_TYPES.map((type) => (
                  <td key={type} className="py-2.5 text-center">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={(eligibility[cls] ?? []).includes(type)}
                      onChange={() => canEdit && toggleElig(cls, type)}
                      className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Saving…" : "Save Haircuts"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Section B: Coverage & Exposure ───────────────────────────────────────────

function CoverageSection({ ruleEngine, canEdit, onSave }) {
  const [rows, setRows] = useState(
    Object.entries(ruleEngine.counterparties).map(([cp, v]) => ({ cp, ...v }))
  );
  const [threshold, setThreshold] = useState(ruleEngine.approvalThreshold);
  const [saving, setSaving] = useState(false);

  function updateRow(cp, field, value) {
    setRows((prev) => prev.map((r) => r.cp === cp ? { ...r, [field]: Number(value) } : r));
  }

  async function handleSave() {
    setSaving(true);
    const counterparties = Object.fromEntries(
      rows.map(({ cp, minCoverageRatio, maxExposure, mta }) => [cp, { minCoverageRatio, maxExposure, mta }])
    );
    await onSave({ counterparties, approvalThreshold: threshold });
    setSaving(false);
  }

  return (
    <div className="rounded-lg border border-slate-200 p-5 mb-6">
      <SectionHeader title="Coverage & Exposure" locked={!canEdit} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="pb-2 font-medium">Counterparty</th>
              <th className="pb-2 font-medium">Min Coverage %</th>
              <th className="pb-2 font-medium">Max Exposure</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ cp, minCoverageRatio, maxExposure }) => (
              <tr key={cp} className="border-b last:border-0">
                <td className="py-2.5 font-medium text-slate-800">{cp}</td>
                <td className="py-2.5">
                  {canEdit ? (
                    <input
                      type="number" min={1.00} max={1.20} step={0.01}
                      value={minCoverageRatio}
                      onChange={(e) => updateRow(cp, "minCoverageRatio", e.target.value)}
                      className="w-24 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
                    />
                  ) : (
                    <span className="tabular-nums">{(minCoverageRatio * 100).toFixed(0)}%</span>
                  )}
                </td>
                <td className="py-2.5">
                  {canEdit ? (
                    <input
                      type="number" min={0} step={500000}
                      value={maxExposure}
                      onChange={(e) => updateRow(cp, "maxExposure", e.target.value)}
                      className="w-36 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
                    />
                  ) : (
                    <span className="tabular-nums">{fmtMoney(maxExposure, "RON")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-3 border-t pt-4">
        <span className="text-sm text-slate-600 font-medium">4-Eyes Approval Threshold (notional)</span>
        {canEdit ? (
          <input
            type="number" min={0} step={1000000}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-36 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
          />
        ) : (
          <span className="tabular-nums text-sm">{fmtMoney(threshold, "RON")}</span>
        )}
        <span className="text-xs text-slate-400">Substitutions above this require 4-eyes approval</span>
      </div>
      {canEdit && (
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Saving…" : "Save Coverage Rules"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Section C: Risk Parameters ────────────────────────────────────────────────

function RiskSection({ ruleEngine, canEdit, onSave }) {
  const [rows, setRows] = useState(
    Object.entries(ruleEngine.counterparties).map(([cp, v]) => ({ cp, mta: v.mta }))
  );
  const [stressPct, setStressPct] = useState(ruleEngine.stressPct);
  const [saving, setSaving] = useState(false);

  function updateMta(cp, value) {
    setRows((prev) => prev.map((r) => r.cp === cp ? { ...r, mta: Number(value) } : r));
  }

  async function handleSave() {
    setSaving(true);
    // Merge MTA back into counterparty entries
    const counterparties = Object.fromEntries(
      rows.map(({ cp, mta }) => [cp, { ...ruleEngine.counterparties[cp], mta }])
    );
    await onSave({ counterparties, stressPct });
    setSaving(false);
  }

  return (
    <div className="rounded-lg border border-slate-200 p-5 mb-6">
      <SectionHeader title="Risk Parameters" locked={!canEdit} />
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-slate-600 font-medium">Default Stress Test %</span>
        {canEdit ? (
          <input
            type="number" min={0} max={30} step={1}
            value={stressPct}
            onChange={(e) => setStressPct(Number(e.target.value))}
            className="w-20 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
          />
        ) : (
          <span className="tabular-nums text-sm">{stressPct}%</span>
        )}
        <span className="text-xs text-slate-400">Initial value for the Margin stress test slider</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="pb-2 font-medium">Counterparty</th>
              <th className="pb-2 font-medium">Min Transfer Amount (MTA)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ cp, mta }) => (
              <tr key={cp} className="border-b last:border-0">
                <td className="py-2.5 font-medium text-slate-800">{cp}</td>
                <td className="py-2.5">
                  {canEdit ? (
                    <input
                      type="number" min={0} step={10000}
                      value={mta}
                      onChange={(e) => updateMta(cp, e.target.value)}
                      className="w-32 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
                    />
                  ) : (
                    <span className="tabular-nums">{mta.toLocaleString()}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Saving…" : "Save Risk Parameters"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ParametersRules() {
  const dispatch = useDispatch();
  const { user } = useDomain();
  const ruleEngine = useRuleEngine();
  const perms = getPermissions(user?.role);

  async function handleSave(partial) {
    // Deep-merge counterparties if both ruleEngine and partial have them
    const merged = partial.counterparties
      ? {
          ...partial,
          counterparties: {
            ...ruleEngine.counterparties,
            ...Object.fromEntries(
              Object.entries(partial.counterparties).map(([cp, v]) => [
                cp,
                { ...ruleEngine.counterparties[cp], ...v },
              ])
            ),
          },
        }
      : partial;
    dispatch({ type: "RULE_ENGINE_UPDATED", payload: merged });
    await api.updateRuleEngine(merged);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6 flex items-center gap-3">
        <Settings2 className="h-5 w-5 text-slate-400" />
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Parameters & Rules</h1>
          <p className="text-sm text-slate-500">
            Configurable rule engine — each section is editable only by the role that owns it.
          </p>
        </div>
      </div>

      <HaircutSection ruleEngine={ruleEngine} canEdit={perms.canEditHaircuts} onSave={handleSave} />
      <CoverageSection ruleEngine={ruleEngine} canEdit={perms.canEditCoverage} onSave={handleSave} />
      <RiskSection ruleEngine={ruleEngine} canEdit={perms.canEditRiskParams} onSave={handleSave} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add collateral-app/src/pages/ParametersRules.jsx
git commit -m "feat: add ParametersRules page with three role-gated sections"
```

---

## Task 6: Add to Sidebar and App.jsx router

**Files:**
- Modify: `collateral-app/src/components/layout/Sidebar.jsx`
- Modify: `collateral-app/src/App.jsx`

- [ ] **Step 1: Add Settings2 import and nav item to Sidebar.jsx**

Add `Settings2` to the lucide-react import at line 1:
```js
import {
  ArrowRightLeft, Bell, Building2, ClipboardList,
  FileBarChart, FileText, Landmark, Layers,
  LayoutDashboard, Link2, Scale, Settings2,
  ShieldCheck, Sparkles, TrendingUp, Wallet,
} from "lucide-react";
```

In the Operations section items array, add the entry **between** `"compliance"` and `"integration"`:
```js
{ key: "parameters-rules", label: "Parameters & Rules", icon: Settings2 },
```

- [ ] **Step 2: Add route in App.jsx**

Add import at the top of App.jsx alongside other page imports:
```js
import { ParametersRules } from "@/pages/ParametersRules";
```

In the main render switch (wherever `current === "audit"` etc. are handled), add:
```jsx
{current === "parameters-rules" && <ParametersRules />}
```

- [ ] **Step 3: Commit**

```bash
git add collateral-app/src/components/layout/Sidebar.jsx collateral-app/src/App.jsx
git commit -m "feat: add Parameters & Rules to sidebar and app router"
```

---

## Task 7: Wire AllocationWorkflow to rule engine

**Files:**
- Modify: `collateral-app/src/workflows/AllocationWorkflow.ts`
- Modify: `collateral-app/src/workflows/hooks/useWorkflows.ts`

- [ ] **Step 1: Extend RunAllocationInput to accept ruleEngine**

In `AllocationWorkflow.ts`, add import at the top:
```ts
import type { RuleEngine } from "@/domain/store";
```

Extend `RunAllocationInput`:
```ts
export interface RunAllocationInput {
  repo:         AppRepo;
  assets:       AppAsset[];
  options?:     RecommendOptions;
  ruleEngine?:  RuleEngine;
}
```

- [ ] **Step 2: Apply rule engine in runAllocation**

Replace the body of `runAllocation` from the `const cp = ...` line through `const resolved = ...` (lines 52–58):

```ts
  const { repo, assets, options = {}, ruleEngine } = input;
  const ts = context.ts ?? new Date().toISOString();

  // Resolve counterparty constraints — rule engine overrides COUNTERPARTY_PROFILES
  const cp = COUNTERPARTY_PROFILES[repo.counterparty];
  const reCp = ruleEngine?.counterparties?.[repo.counterparty];
  const resolved: RecommendOptions = {
    coverageRatio:          reCp?.minCoverageRatio ?? cp?.coverageRatio ?? 1.03,
    maxHaircut:             cp?.maxHaircut,
    maxSingleConcentration: cp?.concentrationLimit ?? 0.60,
    ...options,
  };

  // Apply rule engine haircut overrides to assets before passing to agent
  const effectiveAssets: AppAsset[] = ruleEngine
    ? assets.map((a) => ({
        ...a,
        haircut: ruleEngine.haircuts[a.type ?? ""] ?? a.haircut,
      }))
    : assets;
```

Update the `collateralAgent.recommend` call to use `effectiveAssets`:
```ts
    result = collateralAgent.recommend(repo, effectiveAssets, resolved);
```

- [ ] **Step 3: Pass ruleEngine from useWorkflows hook**

In `useWorkflows.ts`, in `useAllocationWorkflow()`, read ruleEngine from domain state:
```ts
export function useAllocationWorkflow(): AllocationWorkflowActions {
  const dispatch = useDispatch();
  const ctx      = useWorkflowContext();
  const { ruleEngine } = useDomain();
```

In `runFn`, pass it to `runAllocation`:
```ts
    const wf = runAllocation({ repo, assets, options, ruleEngine }, ctx);
```

- [ ] **Step 4: Commit**

```bash
git add collateral-app/src/workflows/AllocationWorkflow.ts collateral-app/src/workflows/hooks/useWorkflows.ts
git commit -m "feat: wire AllocationWorkflow to read coverage ratio and haircuts from rule engine"
```

---

## Task 8: Wire App.jsx repo creation to rule engine

**Files:**
- Modify: `collateral-app/src/App.jsx`

- [ ] **Step 1: Read ruleEngine from domain state in App.jsx**

Find where `user`, `assets`, `repos` etc. are destructured from `useDomain()` (near the top of the App component). Add `ruleEngine`:
```js
  const { user, assets, repos, audit, notifications, ruleEngine } = useDomain();
```

- [ ] **Step 2: Replace COUNTERPARTY_PROFILES coverage reads**

Line 140 (`createDemoRepo`):
```js
    const coverageRatio = ruleEngine.counterparties[counterparty]?.minCoverageRatio
      ?? COUNTERPARTY_PROFILES[counterparty]?.coverageRatio
      ?? 1.03;
```

Line 223 (`rolloverRepo`):
```js
    const coverageRatio = ruleEngine.counterparties[repo.counterparty]?.minCoverageRatio
      ?? COUNTERPARTY_PROFILES[repo.counterparty]?.coverageRatio
      ?? 1.03;
```

- [ ] **Step 3: Add maxExposure guard in createDemoRepo**

After the `coverageRatio` line (line ~141), add before `const newRepo = {`:
```js
    const maxExposure = ruleEngine.counterparties[counterparty]?.maxExposure;
    if (maxExposure !== undefined) {
      const activeExposure = repos
        .filter((r) => r.counterparty === counterparty && r.state === "Active")
        .reduce((sum, r) => sum + r.amount, 0);
      if (activeExposure + amount > maxExposure) {
        addNotification({
          severity: "Warning",
          text: `Cannot create repo: total exposure to ${counterparty} would exceed limit of ${maxExposure.toLocaleString()}.`,
          target: "EXPOSURE_LIMIT",
        });
        return;
      }
    }
```

- [ ] **Step 4: Commit**

```bash
git add collateral-app/src/App.jsx
git commit -m "feat: wire repo creation to use rule engine coverage ratio and max exposure check"
```

---

## Task 9: Wire MarginWorkflow and Margin.jsx to rule engine

**Files:**
- Modify: `collateral-app/src/agents/margin/detector.ts`
- Modify: `collateral-app/src/workflows/MarginWorkflow.ts`
- Modify: `collateral-app/src/workflows/hooks/useWorkflows.ts`
- Modify: `collateral-app/src/pages/Margin.jsx`

- [ ] **Step 1: Add mtaMap to DetectOptions in detector.ts**

Find the `DetectOptions` type (near line 270). Add the new field:
```ts
interface DetectOptions {
  now?:    string;
  thinPct?: number;
  mtaMap?: Record<string, number>;  // counterparty → MTA override
}
```

In `detectAlerts`, replace:
```ts
    const mta = mtaForCurrency(repo.currency);
```
with:
```ts
    const mta = opts?.mtaMap?.[repo.counterparty] ?? mtaForCurrency(repo.currency);
```

- [ ] **Step 2: Thread mtaMap through MarginProtectionAgent**

In `collateral-app/src/agents/margin/MarginProtectionAgent.ts`, find the `scan` method. Update its signature to accept options:
```ts
  scan(repos: AppMarginRepo[], assets: AppMarginAsset[], opts?: { mtaMap?: Record<string, number> }): MarginScanResult {
```

Inside `scan`, pass `opts` through to `detectAlerts`:
```ts
    const alerts = detectAlerts(repos, assets, opts);
```

- [ ] **Step 3: Update RunMarginScanInput and runMarginScan in MarginWorkflow.ts**

```ts
export interface RunMarginScanInput {
  repos:   AppMarginRepo[];
  assets:  AppMarginAsset[];
  mtaMap?: Record<string, number>;
}
```

In `runMarginScan`, update the `marginAgent.scan` call:
```ts
    result = marginAgent.scan(input.repos, input.assets, { mtaMap: input.mtaMap });
```

- [ ] **Step 4: Pass mtaMap from useWorkflows.ts**

In `useMarginWorkflow`, read `ruleEngine` from domain state:
```ts
export function useMarginWorkflow(): MarginWorkflowActions {
  const dispatch = useDispatch();
  const ctx      = useWorkflowContext();
  const { ruleEngine } = useDomain();
```

Build and pass mtaMap in `runScanFn`:
```ts
    const mtaMap = ruleEngine
      ? Object.fromEntries(
          Object.entries(ruleEngine.counterparties).map(([cp, v]) => [cp, v.mta])
        )
      : undefined;

    const wf = runMarginScan(
      { repos: repos as AppMarginRepo[], assets: assets as AppMarginAsset[], mtaMap },
      ctx,
    );
```

- [ ] **Step 5: Init stressPct from rule engine in Margin.jsx**

Find line 133:
```js
  const [stressPct, setStressPct] = useState(0);
```

Change to (ruleEngine must be read from domain state in Margin.jsx):
```js
  const { ruleEngine } = useDomain();
  const [stressPct, setStressPct] = useState(ruleEngine?.stressPct ?? 0);
```

Add `useDomain` to the import from `@/domain/store` if not already imported.

- [ ] **Step 6: Replace COUNTERPARTY_PROFILES MTA reads in Margin.jsx**

Line 405 (inline MTA display in repo list):
```jsx
&nbsp;· MTA: {fmtMoney(
  ruleEngine.counterparties[r.counterparty]?.mta
    ?? COUNTERPARTY_PROFILES[r.counterparty]?.minimumTransferAmount
    ?? 150000,
  COUNTERPARTY_PROFILES[r.counterparty]?.currency ?? r.currency
)}
```

Line 615 (detail panel):
```jsx
<Info label="Min Transfer Amount" value={fmtMoney(
  ruleEngine.counterparties[selectedRepo.counterparty]?.mta
    ?? COUNTERPARTY_PROFILES[selectedRepo.counterparty]?.minimumTransferAmount
    ?? 150000,
  COUNTERPARTY_PROFILES[selectedRepo.counterparty]?.currency ?? selectedRepo.currency
)} />
```

- [ ] **Step 7: Commit**

```bash
git add collateral-app/src/agents/margin/detector.ts \
  collateral-app/src/agents/margin/MarginProtectionAgent.ts \
  collateral-app/src/workflows/MarginWorkflow.ts \
  collateral-app/src/workflows/hooks/useWorkflows.ts \
  collateral-app/src/pages/Margin.jsx
git commit -m "feat: wire margin MTA and stress % defaults to rule engine"
```

---

## Task 10: Wire SubstitutionSheet approval threshold

**Files:**
- Modify: `collateral-app/src/components/substitution/SubstitutionSheet.jsx`

- [ ] **Step 1: Read ruleEngine in SubstitutionSheet**

Near the top of the SubstitutionSheet component function body, add:
```js
  const { ruleEngine } = useDomain();
```

Add `useDomain` to the import from `@/domain/store`.

- [ ] **Step 2: Auto-route based on approvalThreshold**

The ReviewStep currently receives `onApprove` and `onPropose` callbacks separately and lets the user choose. Replace `handleApprove` logic to auto-route: if the repo notional exceeds the threshold, force propose; otherwise execute directly.

Replace the two handlers with one:
```js
  const requiresFourEyes = repo && ruleEngine
    ? repo.amount > ruleEngine.approvalThreshold
    : false;

  async function handleApprove() {
    if (!analysis || !outAsset || !inAsset || !repo) return;
    setLoading(true);
    if (requiresFourEyes) {
      await propose({
        repo, outAsset, inAsset, analysis,
        onProposed: (rId, oId, iId) => onProposed?.(rId, oId, iId),
      });
    } else {
      const result = await execute({ repo, outAsset, inAsset, analysis });
      if (result) { onSubstituted?.(result); }
    }
    setLoading(false);
    handleClose();
  }
```

Update the ReviewStep call — remove `onPropose`, pass `requiresFourEyes` as a prop so the button label updates:
```jsx
          {step === 3 && analysis && (
            <ReviewStep
              analysis={analysis}
              repo={repo}
              canExecute={canExecute}
              onApprove={handleApprove}
              requiresFourEyes={requiresFourEyes}
              onBack={() => setStep(2)}
              loading={loading}
            />
          )}
```

In `ReviewStep` (find it in the same file), update the approve button label:
```jsx
// Find the button that calls onApprove. Change its label to be conditional:
<Button onClick={onApprove} disabled={loading || !canExecute}>
  {loading ? "Processing…" : requiresFourEyes ? "Submit for 4-Eye Approval" : "Approve & Execute"}
</Button>
```

- [ ] **Step 3: Commit**

```bash
git add collateral-app/src/components/substitution/SubstitutionSheet.jsx
git commit -m "feat: auto-route substitution to 4-eyes propose when notional exceeds approval threshold"
```

---

## Task 11: Feature B — Live integration feed in IntegrationHub

**Files:**
- Modify: `collateral-app/src/pages/IntegrationHub.jsx`

- [ ] **Step 1: Add imports**

At the top of IntegrationHub.jsx, add to the existing React import:
```js
import { useState, useMemo, useEffect, useRef } from "react";
```

Add `useDomain` and `useDispatch` imports from the domain store:
```js
import { useDomain, useDispatch } from "@/domain/store";
```

- [ ] **Step 2: Add connection health data constants**

Before the IntegrationHub component, add:
```js
const CONNECTIONS = [
  { id: "safir",      label: "SaFIR Position Feed",   color: "bg-emerald-500",  colorText: "text-emerald-700", uptime: 99.97 },
  { id: "bloomberg",  label: "Bloomberg Tradebook",    color: "bg-emerald-500",  colorText: "text-emerald-700", uptime: 99.84 },
  { id: "murex",      label: "Murex Import",           color: "bg-amber-400",    colorText: "text-amber-700",   uptime: 98.12 },
  { id: "euroclear",  label: "Euroclear SWIFT Feed",   color: "bg-emerald-500",  colorText: "text-emerald-700", uptime: 99.91 },
];

const EVENT_TEMPLATES = [
  { source: "SaFIR",      color: "bg-violet-100 text-violet-700", templates: [
    (a) => `3 positions updated — ${a}`,
    (a) => `Custody transfer confirmed — ${a}`,
    (a) => `Pledge instruction settled — ${a}`,
  ]},
  { source: "Bloomberg",  color: "bg-blue-100 text-blue-700",    templates: [
    (r) => `Heartbeat OK — last trade feed: ${r}`,
    (r) => `Price update received — ${r} MTM refreshed`,
  ]},
  { source: "Murex",      color: "bg-amber-100 text-amber-700",  templates: [
    (r) => `${r} MTM price refreshed — collateral value recalculated`,
    (r) => `Risk limits updated — ${r} exposure rechecked`,
  ]},
  { source: "Euroclear",  color: "bg-teal-100 text-teal-700",    templates: [
    (r) => `Settlement confirmation received — ${r} delivery leg matched`,
    (r) => `SWIFT MT566 received — ${r} corporate action processed`,
  ]},
];
```

- [ ] **Step 3: Add ConnectionHealthCards component**

```jsx
function ConnectionHealthCards({ syncCounts, lastEvents }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 mb-6">
      {CONNECTIONS.map((c) => (
        <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${c.color} flex-shrink-0`} />
            <span className="text-xs font-semibold text-slate-700 truncate">{c.label}</span>
          </div>
          <div className="text-[10px] text-slate-400 mb-1">
            Last sync: {lastEvents[c.id] ? new Date(lastEvents[c.id]).toLocaleTimeString() : "—"}
          </div>
          <div className="text-[10px] text-slate-400 mb-1">
            Uptime: <span className={`font-semibold ${c.colorText}`}>{c.uptime}%</span>
          </div>
          <div className="text-[10px] text-slate-400">
            Events today: <span className="font-semibold text-slate-700">{syncCounts[c.id] ?? 0}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Add LiveFeedPanel component**

```jsx
function LiveFeedPanel({ assets, dispatch }) {
  const [events, setEvents] = useState([]);
  const [syncCounts, setSyncCounts] = useState({});
  const [lastEvents, setLastEvents] = useState({});
  const containerRef = useRef(null);

  const assetIds = useMemo(() => assets.map((a) => a.id).filter(Boolean), [assets]);
  const repoIds = ["R-1024", "R-1025", "R-1026", "R-1027", "R-1028"];

  useEffect(() => {
    if (!assetIds.length) return;

    function appendEvent() {
      const tplGroup = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
      const isSafir = tplGroup.source === "SaFIR";
      const isEuroclear = tplGroup.source === "Euroclear";
      const ref = isSafir || isEuroclear
        ? assetIds[Math.floor(Math.random() * assetIds.length)]
        : repoIds[Math.floor(Math.random() * repoIds.length)];
      const tpl = tplGroup.templates[Math.floor(Math.random() * tplGroup.templates.length)];
      const status = Math.random() > 0.9 ? "Warning" : "OK";

      const event = {
        id:      Date.now(),
        ts:      new Date().toISOString(),
        source:  tplGroup.source,
        color:   tplGroup.color,
        message: tpl(ref),
        status,
        ref,
      };

      setEvents((prev) => [event, ...prev].slice(0, 50));
      setSyncCounts((prev) => ({ ...prev, [tplGroup.source.toLowerCase().replace(" ", "")]: (prev[tplGroup.source.toLowerCase().replace(" ", "")] ?? 0) + 1 }));
      setLastEvents((prev) => ({ ...prev, [tplGroup.id ?? tplGroup.source.toLowerCase().split(" ")[0]]: event.ts }));

      // Cross-app side-effect: refresh lastSyncTs for the referenced asset
      if ((isSafir || isEuroclear) && ref) {
        const asset = assets.find((a) => a.id === ref);
        if (asset) {
          dispatch({
            type: "ASSET_UPDATED",
            payload: { ...asset, integration: { ...(asset.integration ?? {}), lastSyncTs: event.ts } },
          });
        }
      }
    }

    const intervalMs = 15000 + Math.random() * 15000; // 15–30 s
    const t = setInterval(appendEvent, intervalMs);
    appendEvent(); // fire immediately on mount
    return () => clearInterval(t);
  }, [assetIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const sourceKey = (src) => src.toLowerCase().split(" ")[0];

  return (
    <div className="mb-6">
      <ConnectionHealthCards
        syncCounts={{
          safir:     syncCounts[sourceKey("SaFIR")] ?? 0,
          bloomberg: syncCounts[sourceKey("Bloomberg")] ?? 0,
          murex:     syncCounts[sourceKey("Murex")] ?? 0,
          euroclear: syncCounts[sourceKey("Euroclear")] ?? 0,
        }}
        lastEvents={lastEvents}
      />
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-semibold text-slate-800">Live Integration Feed</span>
          </div>
          <span className="text-xs text-slate-400">{events.length} events · max 50</span>
        </div>
        <div ref={containerRef} className="max-h-72 overflow-y-auto divide-y divide-slate-100">
          {events.length === 0 && (
            <div className="px-4 py-6 text-sm text-slate-400 text-center">Waiting for first event…</div>
          )}
          {events.map((ev) => (
            <div key={ev.id} className="flex items-start gap-3 px-4 py-2.5">
              <span className="flex-shrink-0 text-[10px] text-slate-400 tabular-nums mt-0.5 w-16">
                {new Date(ev.ts).toLocaleTimeString()}
              </span>
              <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${ev.color}`}>
                {ev.source}
              </span>
              <span className="flex-1 text-xs text-slate-700">{ev.message}</span>
              <span className={`flex-shrink-0 text-[10px] font-semibold ${ev.status === "OK" ? "text-emerald-600" : "text-amber-600"}`}>
                {ev.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Mount LiveFeedPanel in the IntegrationHub component**

Find the IntegrationHub component function. It receives `integration` as a prop. Add at the very top of its returned JSX — before the existing tab bar:

```jsx
export function IntegrationHub({ integration }) {
  const { assets } = useDomain();
  const dispatch   = useDispatch();
  // ... existing state ...

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <LiveFeedPanel assets={assets} dispatch={dispatch} />
      {/* existing tab navigation and content below */}
```

Make sure to add `const { assets } = useDomain();` and `const dispatch = useDispatch();` to the IntegrationHub component body if not already there.

- [ ] **Step 6: Commit**

```bash
git add collateral-app/src/pages/IntegrationHub.jsx
git commit -m "feat: add live integration feed simulation with connection health cards and ASSET_UPDATED dispatch"
```

---

## Task 12: Push to production

- [ ] **Step 1: Push all commits**

```bash
git push origin main
```

Vercel auto-deploys. Production URL: https://www.collateralos.app

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Haircut & Eligibility table, editable by Collateral Manager | Task 5 (HaircutSection), Task 4 |
| Coverage & Exposure per-counterparty table, Treasury Manager | Task 5 (CoverageSection), Task 4 |
| Approval threshold field | Task 5 (CoverageSection), Task 10 |
| Risk Parameters (stress %, MTA), Risk Reviewer | Task 5 (RiskSection), Task 4 |
| ruleEngine in domain store with RULE_ENGINE_UPDATED | Task 2 |
| Seeded from ruleEngineSeed.js, persisted to localStorage v2 key | Tasks 1, 3 |
| COUNTERPARTY_PROFILES remains as fallback | Tasks 7, 8, 9 (all use `?? COUNTERPARTY_PROFILES` fallback) |
| AllocationWorkflow reads haircut from ruleEngine | Task 7 |
| AllocationWorkflow reads coverageRatio from ruleEngine | Task 7 |
| App.jsx repo creation reads coverageRatio from ruleEngine | Task 8 |
| App.jsx blocks repo if maxExposure exceeded | Task 8 |
| 4-eyes routing via approvalThreshold | Task 10 |
| MarginWorkflow reads MTA from ruleEngine | Task 9 |
| Margin.jsx stressPct defaults from ruleEngine | Task 9 |
| canEditHaircuts / canEditCoverage / canEditRiskParams permissions | Task 4 |
| Parameters & Rules in sidebar before Audit Trail | Task 6 |
| IntegrationHub connection health cards | Task 11 |
| Live event log, 15–30s interval, max 50 entries | Task 11 |
| Domain store ASSET_UPDATED for lastSyncTs on SaFIR/Euroclear events | Task 11 |
| Feature C (SFTR export) | Already implemented — no tasks needed |

**No placeholders found.** All code blocks are complete.

**Type consistency:** `RuleEngine` defined once in store.tsx; imported in AllocationWorkflow.ts. `RuleEngineCounterparty` used consistently for counterparty sub-objects. `mtaMap: Record<string, number>` flows from useWorkflows → MarginWorkflow → marginAgent.scan → detectAlerts without type change.
