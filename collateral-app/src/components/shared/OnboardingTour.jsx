import { useEffect, useState } from "react";
import { ArrowRight, ArrowLeft, X, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

const TOUR_STEPS = [
  {
    page: "dashboard",
    title: "Dashboard",
    description: "Your command centre. Live KPI cards show total collateral, coverage ratio, and deficits in real time.",
    bullets: [
      "Suggested margin calls auto-generated from repo deficits",
      "Pending 4-eyes substitution approvals surface here",
      "Use the top search bar to jump to any repo or asset",
    ],
  },
  {
    page: "inventory",
    title: "Collateral Inventory",
    description: "Manage your entire collateral book — all assets, their custody locations, and availability status.",
    bullets: [
      "Filter by ISIN, type, custody, or status",
      "Import new assets via CSV template",
      "Status tracks the asset lifecycle: Available → Locked → Pledged",
    ],
  },
  {
    page: "repos",
    title: "Repo Transactions",
    description: "Full trade lifecycle management for bilateral repo agreements.",
    bullets: [
      "Create new repos with auto-proposed collateral baskets",
      "Click any repo to view detail, substitute collateral, rollover, or close",
      "Coverage ratio and buffer are calculated live against the rule engine",
    ],
  },
  {
    page: "agreements",
    title: "Agreements & Margin Calls",
    description: "GMRA/CSA agreements drive margin call eligibility, deadlines, and thresholds.",
    bullets: [
      "Create collateral agreements per counterparty with 4-eyes thresholds",
      "Issue, respond to, and dispute margin calls from the agreement detail view",
      "All events are hash-chained for audit integrity",
    ],
  },
  {
    page: "approvals",
    title: "Four-Eyes Approvals",
    description: "Margin call accepts above the agreement threshold require a second authoriser.",
    bullets: [
      "Credit Approver role sees all pending items here",
      "Grant or reject with a comment — logged to the immutable audit trail",
      "Threshold is configurable per agreement in Parameters & Rules",
    ],
  },
  {
    page: "compliance",
    title: "Regulatory Compliance",
    description: "Live compliance checks against CRR, EMIR/SFTR, and NBR requirements.",
    bullets: [
      "Large exposure limits per counterparty (CRR Art. 395)",
      "Single-ISIN concentration and haircut breach detection",
      "Minimum Transfer Amount breaches trigger actionable 'Issue margin call' buttons",
    ],
  },
  {
    page: "sftr-report",
    title: "SFTR Report",
    description: "Trade-level regulatory reporting per ESMA RTS 2019/363, ready to submit to Regis-TR.",
    bullets: [
      "Full ESMA field set — UTI, LEI, collateral ISINs, re-use flags",
      "Export as CSV or XML for the trade repository",
      "'Submit to Regis-TR' button records submissions and tracks status",
    ],
  },
  {
    page: "parameters-rules",
    title: "Parameters & Rules",
    description: "Configurable rule engine — each section is editable only by the role that owns it.",
    bullets: [
      "Collateral Manager: haircut % and eligibility by asset class",
      "Treasury Manager: coverage ratios and max exposure per counterparty",
      "Risk Reviewer: MTA values and stress test percentage",
    ],
  },
];

function roleSteps(role) {
  if (role === "Credit Approver") {
    return TOUR_STEPS.filter((s) => ["dashboard", "agreements", "approvals"].includes(s.page));
  }
  if (role === "Risk Reviewer") {
    return TOUR_STEPS.filter((s) => ["dashboard", "inventory", "compliance", "sftr-report", "parameters-rules"].includes(s.page));
  }
  if (role === "Operations Analyst") {
    return TOUR_STEPS.filter((s) => ["dashboard", "repos", "agreements", "sftr-report"].includes(s.page));
  }
  return TOUR_STEPS; // full tour for Treasury Manager and Collateral Manager
}

// ── Welcome Modal ─────────────────────────────────────────────────────────────

export function WelcomeModal({ user, onStartTour, onSkip }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="bg-slate-900 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
              <BookOpen className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <div className="text-white font-semibold">Welcome to CollateralOS</div>
              <div className="text-slate-400 text-xs mt-0.5">Romania Pilot · {user?.role}</div>
            </div>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-slate-700 text-sm leading-relaxed">
            Hi <span className="font-semibold">{user?.name}</span>. CollateralOS is a full-stack collateral
            management platform covering repo lifecycle, margin calls, SFTR reporting, and regulatory compliance.
          </p>
          <p className="text-slate-500 text-sm">
            Would you like a quick guided tour of the key modules for your role?
          </p>
          <div className="flex gap-2 pt-1">
            <Button className="flex-1" onClick={onStartTour}>
              Start tour <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
            <Button variant="outline" onClick={onSkip}>
              Skip for now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tour Overlay Card ─────────────────────────────────────────────────────────

export function TourOverlay({ role, navigate, onEnd }) {
  const steps = roleSteps(role);
  const [step, setStep] = useState(0);

  useEffect(() => {
    navigate(steps[step].page);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 rounded-xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            Guided Tour
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{step + 1} / {steps.length}</span>
          <button onClick={onEnd} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-slate-100">
        <div
          className="h-0.5 bg-blue-500 transition-all duration-300"
          style={{ width: `${((step + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{current.title}</div>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">{current.description}</p>
        </div>
        <ul className="space-y-1.5">
          {current.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
              <span className="mt-0.5 flex-shrink-0 h-1.5 w-1.5 rounded-full bg-blue-400" />
              {b}
            </li>
          ))}
        </ul>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
        >
          <ArrowLeft className="h-3 w-3 mr-1" /> Back
        </Button>
        {isLast ? (
          <Button size="sm" className="h-7 text-xs" onClick={onEnd}>
            Finish tour
          </Button>
        ) : (
          <Button size="sm" className="h-7 text-xs" onClick={() => setStep((s) => s + 1)}>
            Next <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
