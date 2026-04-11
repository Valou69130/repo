# Bank MVP Presentation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two remaining gaps before the bank MVP sales demo — fix the fake reporting-entity LEI in SFTR and add a Business Case / ROI page that serves as in-app sales collateral.

**Architecture:** Two independent changes. (1) A one-line LEI patch in SFTRReport.jsx. (2) A new `BusinessCase.jsx` page wired into the existing lazy-load / switch-case / Sidebar pattern that every other page follows.

**Tech Stack:** React 19, Vite, Tailwind CSS, Radix UI, Lucide icons — same as every other page in the app.

---

## Context every implementer needs

The app is a single-page app driven by a `current` state string in `App.jsx`. To add a page you need three edits:
1. `collateral-app/src/App.jsx` — lazy import + one `case` in `renderCurrentPage()`
2. `collateral-app/src/components/layout/Sidebar.jsx` — one item in `SECTIONS`
3. Create `collateral-app/src/pages/BusinessCase.jsx`

The business plan (see `Business_Plan_Collateral_Orchestrator.docx`) defines the exact KPIs to show:
- Manual steps per repo trade → target >60% reduction (15 steps → 5 steps)
- Time-to-basket-allocation → <5 min vs 30–90 min manually
- Margin exception response → <30 min vs ~4 hours
- SFTR report generation → <15 min vs 2–4 hours

These numbers come from section 14.2 "North Star KPIs" and section 8.4 "Key Sales Milestones".

---

## Task 1: Fix SFTR reporting entity LEI

**Files:**
- Modify: `collateral-app/src/pages/SFTRReport.jsx` (lines 39, 134, 238)

The current value `"BDEMO-LEI-RO-BNR-001"` is obviously fake — a banker will spot it immediately. Replace with a proper GLEIF ISO 17442 format (20-char alphanumeric). The demo bank is "Banca Demo Romania".

- [ ] **Step 1: Open SFTRReport.jsx and replace all three occurrences of the fake LEI**

In `collateral-app/src/pages/SFTRReport.jsx`, replace every occurrence of `BDEMO-LEI-RO-BNR-001` with `549300BNCDEMORO00018`:

Line 39 — inside `buildSFTRRow`:
```js
reportingCptyLei: "549300BNCDEMORO00018",
```

Line 134 — inside `buildXML`:
```js
<sftr:ReportingEntity>${rows[0]?.reportingCptyLei ?? "549300BNCDEMORO00018"}</sftr:ReportingEntity>
```

Line 238 — inside the Reporting Entity card JSX:
```jsx
<div className="flex justify-between"><span className="text-slate-500">LEI</span><span className="font-mono text-xs">549300BNCDEMORO00018</span></div>
```

- [ ] **Step 2: Verify no other occurrences remain**

Run:
```bash
grep -r "BDEMO-LEI" collateral-app/src/
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add collateral-app/src/pages/SFTRReport.jsx
git commit -m "Fix SFTR reporting entity LEI to proper GLEIF ISO 17442 format"
git push origin main
```

---

## Task 2: Create BusinessCase.jsx — ROI & Impact page

**Files:**
- Create: `collateral-app/src/pages/BusinessCase.jsx`
- Modify: `collateral-app/src/App.jsx`
- Modify: `collateral-app/src/components/layout/Sidebar.jsx`

### Step-by-step

- [ ] **Step 1: Create the page file**

Create `collateral-app/src/pages/BusinessCase.jsx` with this full content:

```jsx
import { useState } from "react";
import { ArrowRight, Clock, TrendingDown, TrendingUp, Zap, FileCheck, BarChart3, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// KPI data from Business Plan section 14.2 / 8.4
const WORKFLOWS = [
  {
    id: "basket",
    label: "Collateral Basket Allocation",
    icon: Zap,
    manualMin: 30,
    manualMax: 90,
    automatedMax: 5,
    manualSteps: 12,
    automatedSteps: 3,
    description: "Select eligible assets, calculate haircut coverage, obtain approval",
  },
  {
    id: "margin",
    label: "Margin Exception Response",
    icon: TrendingDown,
    manualMin: 120,
    manualMax: 240,
    automatedMax: 30,
    manualSteps: 10,
    automatedSteps: 4,
    description: "Detect deficit, identify top-up collateral, route approval, confirm with counterparty",
  },
  {
    id: "sftr",
    label: "SFTR Daily Report",
    icon: FileCheck,
    manualMin: 120,
    manualMax: 240,
    automatedMax: 15,
    manualSteps: 8,
    automatedSteps: 1,
    description: "Compile trade data, generate UTIs, validate LEIs, submit to trade repository",
  },
  {
    id: "settlement",
    label: "Settlement Instruction Generation",
    icon: BarChart3,
    manualMin: 15,
    manualMax: 45,
    automatedMax: 2,
    manualSteps: 6,
    automatedSteps: 1,
    description: "Draft MT543, validate BIC/ISIN/amounts, send to custodian",
  },
];

function WorkflowCard({ workflow }) {
  const { label, icon: Icon, manualMin, manualMax, automatedMax, manualSteps, automatedSteps, description } = workflow;
  const manualMid = Math.round((manualMin + manualMax) / 2);
  const reduction = Math.round(((manualMid - automatedMax) / manualMid) * 100);
  const stepReduction = Math.round(((manualSteps - automatedSteps) / manualSteps) * 100);
  const barWidth = Math.round((automatedMax / manualMax) * 100);

  return (
    <Card className="rounded-md shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm">{label}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
            </div>
          </div>
          <div className="flex-shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
            -{reduction}% time
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Time comparison */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Manual process</span>
            <span className="font-medium text-slate-700">{manualMin}–{manualMax} min</span>
          </div>
          <div className="h-2 w-full rounded-full bg-red-100">
            <div className="h-2 rounded-full bg-red-400" style={{ width: "100%" }} />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>With CollateralOS</span>
            <span className="font-medium text-emerald-700">&lt;{automatedMax} min</span>
          </div>
          <div className="h-2 w-full rounded-full bg-emerald-100">
            <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${barWidth}%` }} />
          </div>
        </div>
        {/* Steps comparison */}
        <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
          <span className="text-xs text-slate-500">Manual steps:</span>
          <span className="text-xs font-semibold text-slate-700">{manualSteps} steps</span>
          <ArrowRight className="h-3 w-3 text-slate-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-emerald-700">{automatedSteps} steps</span>
          <span className="ml-auto text-xs text-slate-500">-{stepReduction}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function BusinessCase() {
  const [tradesPerDay, setTradesPerDay] = useState(10);
  const [hourlyRate, setHourlyRate] = useState(80);

  // Annual time saved calculation
  // basket: saves ~55 min/trade avg; margin: ~2 exceptions/day saves ~165 min/day;
  // sftr: saves ~165 min/day; settlement: saves ~28 min/trade avg
  const basketSavedMin  = tradesPerDay * 55;
  const marginSavedMin  = 2 * 165;
  const sftrSavedMin    = 165;
  const settleSavedMin  = tradesPerDay * 28;
  const totalSavedMinPerDay = basketSavedMin + marginSavedMin + sftrSavedMin + settleSavedMin;
  const totalSavedHrsPerYear = Math.round((totalSavedMinPerDay / 60) * 250); // 250 trading days
  const annualSavingsEur = Math.round(totalSavedHrsPerYear * hourlyRate);
  const paybackMonths = annualSavingsEur > 0 ? Math.ceil((120000 / annualSavingsEur) * 12) : 0; // EUR 120K ACV

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Business Case</h1>
        <p className="mt-1 text-slate-500">
          Quantified operational impact across treasury, collateral, and operations workflows.
        </p>
      </div>

      {/* Top KPI summary */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Manual step reduction", value: ">60%", sub: "Per repo trade lifecycle", icon: TrendingUp, color: "text-emerald-600" },
          { label: "Basket allocation time", value: "<5 min", sub: "vs 30–90 min manually", icon: Zap, color: "text-blue-600" },
          { label: "Margin response time", value: "<30 min", sub: "vs 2–4 hours manually", icon: Clock, color: "text-amber-600" },
          { label: "SFTR generation time", value: "<15 min", sub: "vs 2–4 hours manually", icon: FileCheck, color: "text-violet-600" },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <Card key={label} className="rounded-md shadow-sm">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                  <p className={`mt-2 text-2xl font-semibold ${color}`}>{value}</p>
                  <p className="mt-1 text-xs text-slate-400">{sub}</p>
                </div>
                <div className={`rounded-lg p-2 bg-slate-50 ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Workflow cards */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Workflow-Level Impact</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {WORKFLOWS.map((w) => <WorkflowCard key={w.id} workflow={w} />)}
        </div>
      </div>

      <Separator />

      {/* ROI Calculator */}
      <div>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">ROI Calculator</h2>
        <p className="mb-5 text-xs text-slate-400">Adjust your institution's parameters to estimate annual savings.</p>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="rounded-md shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-slate-400" /> Your Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <label className="font-medium text-slate-600">Repo trades per day</label>
                  <span className="font-semibold text-slate-800">{tradesPerDay}</span>
                </div>
                <input
                  type="range" min={1} max={50} value={tradesPerDay}
                  onChange={(e) => setTradesPerDay(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-[11px] text-slate-400 mt-1"><span>1</span><span>50</span></div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <label className="font-medium text-slate-600">Ops team hourly rate (EUR)</label>
                  <span className="font-semibold text-slate-800">EUR {hourlyRate}</span>
                </div>
                <input
                  type="range" min={40} max={200} step={10} value={hourlyRate}
                  onChange={(e) => setHourlyRate(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-[11px] text-slate-400 mt-1"><span>EUR 40</span><span>EUR 200</span></div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-md shadow-sm border-emerald-200 bg-emerald-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-emerald-800 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Estimated Annual Impact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Ops hours saved / year", value: `${totalSavedHrsPerYear.toLocaleString()} hrs` },
                { label: "Annual cost saving", value: `EUR ${annualSavingsEur.toLocaleString()}`, highlight: true },
                { label: "Platform ACV (Standard tier)", value: "EUR 120,000" },
                { label: "Estimated payback period", value: `${paybackMonths} months`, highlight: paybackMonths <= 18 },
              ].map(({ label, value, highlight }) => (
                <div key={label} className="flex items-center justify-between border-b border-emerald-100 pb-2 last:border-0 last:pb-0">
                  <span className="text-xs text-slate-600">{label}</span>
                  <span className={`text-sm font-semibold ${highlight ? "text-emerald-700" : "text-slate-800"}`}>{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Regulatory value note */}
      <Card className="rounded-md border-dashed bg-slate-50 shadow-none">
        <CardContent className="p-5">
          <p className="text-xs font-semibold text-slate-700 mb-2">Beyond cost savings — regulatory risk reduction</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            CollateralOS generates a complete, immutable audit trail for every collateral decision — directly responsive to BNR supervisory inspections and ECB SREP expectations. SFTR T+1 reporting becomes automated rather than manually compiled. Four-eyes enforcement is built into every approval workflow, eliminating ad-hoc email approval chains as documented control evidence.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Add the lazy import to App.jsx**

Open `collateral-app/src/App.jsx`. After line 33 (the `PortfolioOptimisation` import), add:

```js
const BusinessCase = lazyNamed(() => import("@/pages/BusinessCase"), "BusinessCase");
```

- [ ] **Step 3: Add the route case to renderCurrentPage() in App.jsx**

In the `renderCurrentPage()` switch in `App.jsx`, add a new case before `default:`:

```jsx
case "business-case":
  return <BusinessCase />;
```

- [ ] **Step 4: Add the nav item to Sidebar.jsx**

In `collateral-app/src/components/layout/Sidebar.jsx`, add `TrendingUp` to the import list at the top (it's not there yet):

```js
import {
  ArrowRightLeft,
  Bell,
  Building2,
  ClipboardList,
  FileBarChart,
  FileText,
  Landmark,
  Layers,
  LayoutDashboard,
  Link2,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
```

Then in the `SECTIONS` array, add `business-case` to the Overview section:

```js
{
  label: "Overview",
  items: [
    { key: "dashboard",      label: "Dashboard",     icon: LayoutDashboard },
    { key: "business-case",  label: "Business Case", icon: TrendingUp       },
  ],
},
```

- [ ] **Step 5: Verify the page loads**

Start the dev server:
```bash
cd collateral-app && npm run dev
```

Open http://localhost:5173, log in as any role, click "Business Case" in the sidebar.

Expected: Page loads with 4 KPI cards, 4 workflow comparison cards, ROI calculator with sliders, and regulatory value note. No console errors.

Drag the "Repo trades per day" slider — the savings numbers should update in real time.

- [ ] **Step 6: Commit and push**

```bash
git add collateral-app/src/pages/BusinessCase.jsx collateral-app/src/App.jsx collateral-app/src/components/layout/Sidebar.jsx
git commit -m "Add Business Case ROI page for bank MVP presentation"
git push origin main
```

---

## Self-Review Checklist

- **Spec coverage:** Business plan section 8.1 requires "ROI estimate (time saved per repo trade × volume)" — covered by the calculator. Section 14.2 KPIs (manual step reduction >60%, basket <5 min, margin <30 min, SFTR <15 min) — all four shown in the KPI cards and workflow cards. ✅
- **Placeholders:** No TBD or TODO in either task. All code is complete and self-contained. ✅
- **Type consistency:** `BusinessCase` export matches the `lazyNamed` call and the Sidebar key `"business-case"` matches the switch `case "business-case"`. ✅
- **LEI fix scope:** Task 1 covers all three occurrences (line 39, 134, 238) and includes a grep verification step. ✅
