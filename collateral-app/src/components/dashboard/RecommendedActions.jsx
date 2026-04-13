import {
  ArrowRight,
  ArrowUpFromLine,
  Bot,
  CircleAlert,
  FileSearch,
  GitCompareArrows,
  MoveUpRight,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import { ImpactPreview } from "@/components/shared/ImpactPreview";
import { IntegrationContextBar } from "@/components/shared/IntegrationContext";
import { WorkflowStateBar } from "@/components/shared/WorkflowState";
import { fmtMoney, adjustedValue } from "@/domain/format";

// ─── CTA label / icon mapping ─────────────────────────────────────────────────
// Each action type declares its own primary + secondary workflow action.
// Primary = the exact operation the agent recommends.
// Secondary = a lower-urgency navigation / audit action.
const ACTION_TYPE_CFG = {
  "margin-deficit": {
    icon:           ShieldAlert,
    label:          "Margin Deficit",
    border:         "border-red-200",
    bg:             "bg-red-50",
    dot:            "bg-red-500",
    badge:          "bg-red-100 text-red-700 border-red-200",
    cta:            "bg-red-600 hover:bg-red-700 text-white",
    primaryLabel:   "Execute Top-Up",
    primaryIcon:    ShieldCheck,
    secondaryLabel: "View Margin Detail",
    secondaryIcon:  ArrowRight,
  },
  "coverage-watch": {
    icon:           ShieldAlert,
    label:          "Coverage Watch",
    border:         "border-amber-200",
    bg:             "bg-amber-50",
    dot:            "bg-amber-400",
    badge:          "bg-amber-100 text-amber-700 border-amber-200",
    cta:            "bg-amber-600 hover:bg-amber-700 text-white",
    primaryLabel:   "Initiate Top-Up",
    primaryIcon:    TrendingUp,
    secondaryLabel: "Open Repo Detail",
    secondaryIcon:  ArrowRight,
  },
  "substitution-opportunity": {
    icon:           GitCompareArrows,
    label:          "Substitution Opportunity",
    border:         "border-amber-200",
    bg:             "bg-amber-50",
    dot:            "bg-amber-400",
    badge:          "bg-amber-100 text-amber-700 border-amber-200",
    cta:            "bg-amber-600 hover:bg-amber-700 text-white",
    primaryLabel:   "Execute Substitution",
    primaryIcon:    GitCompareArrows,
    secondaryLabel: "Review Coverage Analysis",
    secondaryIcon:  FileSearch,
  },
  "release-opportunity": {
    icon:           ArrowUpFromLine,
    label:          "Release Opportunity",
    border:         "border-blue-200",
    bg:             "bg-blue-50",
    dot:            "bg-blue-400",
    badge:          "bg-blue-100 text-blue-700 border-blue-200",
    cta:            "bg-blue-600 hover:bg-blue-700 text-white",
    primaryLabel:   "Confirm Unwind",
    primaryIcon:    ArrowUpFromLine,
    secondaryLabel: "View Settlement Instructions",
    secondaryIcon:  ReceiptText,
  },
  "settlement-exception": {
    icon:           ReceiptText,
    label:          "Settlement Exception",
    border:         "border-amber-200",
    bg:             "bg-amber-50",
    dot:            "bg-amber-400",
    badge:          "bg-amber-100 text-amber-700 border-amber-200",
    cta:            "bg-amber-600 hover:bg-amber-700 text-white",
    primaryLabel:   "Review Settlement Exception",
    primaryIcon:    FileSearch,
    secondaryLabel: "Escalate to Ops Desk",
    secondaryIcon:  MoveUpRight,
  },
  "reconciliation-issue": {
    icon:           CircleAlert,
    label:          "Reconciliation Issue",
    border:         "border-amber-200",
    bg:             "bg-amber-50",
    dot:            "bg-amber-400",
    badge:          "bg-amber-100 text-amber-700 border-amber-200",
    cta:            "bg-amber-600 hover:bg-amber-700 text-white",
    primaryLabel:   "Investigate Break",
    primaryIcon:    FileSearch,
    secondaryLabel: "Open Audit Trail",
    secondaryIcon:  ArrowRight,
  },
  "pending-approval": {
    icon:           UserCheck,
    label:          "Pending Approval",
    border:         "border-violet-200",
    bg:             "bg-violet-50",
    dot:            "bg-violet-400",
    badge:          "bg-violet-100 text-violet-700 border-violet-200",
    cta:            "bg-violet-600 hover:bg-violet-700 text-white",
    primaryLabel:   "Review & Approve",
    primaryIcon:    UserCheck,
    secondaryLabel: "View Proposal Details",
    secondaryIcon:  FileSearch,
  },
};

const SEVERITY_ORDER = { Critical: 0, Warning: 1, Info: 2 };

// ─── Pure derivation ──────────────────────────────────────────────────────────

export function deriveActionItems(repos, assets, notifications, pendingSubstitutions) {
  const items = [];
  const now = new Date().toISOString();

  // 1 · Margin deficits — Critical
  repos
    .filter((r) => r.state !== "Closed" && r.buffer < 0)
    .forEach((r) => {
      const coverage = Math.round((r.postedCollateral / r.requiredCollateral) * 100);
      const deficit  = Math.abs(r.buffer);
      const topUp    = assets.find(
        (a) => a.status === "Available" && a.eligibility.toLowerCase().includes("eligible")
      );
      const topUpAdj = topUp ? adjustedValue(topUp) : 0;
      items.push({
        id:             `margin-${r.id}`,
        type:           "margin-deficit",
        severity:       "Critical",
        repoId:         r.id,
        title:          `Margin Deficit — ${r.id}`,
        linked:         `${r.counterparty} · ${fmtMoney(r.amount, r.currency)}`,
        recommendation: topUp
          ? `Post ${topUp.name} (${fmtMoney(topUpAdj, topUp.currency)} adj.) to restore coverage above 103%.`
          : "No eligible collateral available — escalate to desk head immediately.",
        rationale: `Coverage at ${coverage}%. Shortfall of ${fmtMoney(deficit, r.currency)} below required collateral. Counterparty margin call threshold may already be breached.`,
        workflowState:  topUp ? "proposed" : "detected",
        detectedAt:     now,
        updatedAt:      now,
        integration:    r.integration ?? null,
        impact: {
          type:               "top-up",
          currentCoverage:    r.postedCollateral / r.requiredCollateral,
          projectedCoverage:  (r.postedCollateral + topUpAdj) / r.requiredCollateral,
          currentPosted:      r.postedCollateral,
          projectedPosted:    r.postedCollateral + topUpAdj,
          topUpAmount:        topUpAdj,
          currentBuffer:      r.buffer,
          projectedBuffer:    r.postedCollateral + topUpAdj - r.requiredCollateral,
          currency:           r.currency,
        },
      });
    });

  // 2 · Coverage below 103% threshold — Warning
  repos
    .filter(
      (r) =>
        r.state !== "Closed" &&
        r.buffer >= 0 &&
        r.postedCollateral / r.requiredCollateral < 1.03
    )
    .forEach((r) => {
      const coverage  = Math.round((r.postedCollateral / r.requiredCollateral) * 100);
      const bestAsset = assets.find(
        (a) =>
          a.status === "Available" &&
          a.haircut < 5 &&
          a.eligibility.toLowerCase().includes("eligible")
      );
      const basketAssets     = assets.filter((a) => r.assets.includes(a.id));
      const worstBasketAsset = basketAssets.length > 0
        ? basketAssets.reduce((w, a) => (a.haircut > w.haircut ? a : w))
        : null;
      const target103        = r.requiredCollateral * 1.03;
      const needed103        = target103 - r.postedCollateral;
      const concentrationFlag = bestAsset && basketAssets.some((a) => a.isin === bestAsset.isin)
        ? `${bestAsset.name} is already in the basket — increasing concentration risk.`
        : null;
      items.push({
        id:             `watch-${r.id}`,
        type:           bestAsset ? "substitution-opportunity" : "coverage-watch",
        severity:       "Warning",
        repoId:         r.id,
        title:          `Coverage Below 103% — ${r.id}`,
        linked:         `${r.counterparty} · ${coverage}% coverage · buffer ${fmtMoney(r.buffer, r.currency)}`,
        recommendation: bestAsset
          ? `Substitute current collateral with ${bestAsset.name} (${bestAsset.haircut}% haircut) to improve efficiency and restore ≥103% ratio.`
          : "Top-up required — add eligible collateral to restore the 103% minimum coverage ratio.",
        rationale: `Buffer of ${fmtMoney(r.buffer, r.currency)} is insufficient. Price movements or accrual drift could push coverage below 100% and trigger a formal margin call.`,
        workflowState:  "proposed",
        detectedAt:     now,
        updatedAt:      now,
        integration:    r.integration ?? null,
        impact: bestAsset
          ? {
              type:             "substitution",
              outAsset:         worstBasketAsset ? { name: worstBasketAsset.name, haircut: worstBasketAsset.haircut, adjustedValue: adjustedValue(worstBasketAsset) } : null,
              inAsset:          { name: bestAsset.name, haircut: bestAsset.haircut, adjustedValue: adjustedValue(bestAsset) },
              liquidityChange:  (worstBasketAsset?.marketValue ?? 0) - bestAsset.marketValue,
              concentrationFlag,
              currency:         r.currency,
            }
          : {
              type:              "top-up",
              currentCoverage:   r.postedCollateral / r.requiredCollateral,
              projectedCoverage: 1.03,
              currentPosted:     r.postedCollateral,
              projectedPosted:   target103,
              topUpAmount:       needed103,
              currentBuffer:     r.buffer,
              projectedBuffer:   target103 - r.requiredCollateral,
              currency:          r.currency,
            },
      });
    });

  // 3 · Repos maturing today or tomorrow — Warning
  repos
    .filter((r) => r.state !== "Closed")
    .forEach((r) => {
      const daysLeft = Math.max(
        0,
        Math.ceil((new Date(r.maturityDate) - new Date()) / 86400000)
      );
      if (daysLeft <= 1) {
        const freePool = assets.filter((a) => a.status === "Available").reduce((s, a) => s + a.marketValue, 0);
        items.push({
          id:            `mature-${r.id}`,
          type:          "release-opportunity",
          severity:      "Warning",
          repoId:        r.id,
          title:         daysLeft === 0 ? `Repo Maturing Today — ${r.id}` : `Repo Matures Tomorrow — ${r.id}`,
          linked:        `${r.counterparty} · ${fmtMoney(r.amount, r.currency)} · maturity ${r.maturityDate}`,
          recommendation:
            "Confirm settlement instructions with counterparty. Prepare collateral release once cash repayment is confirmed via SaFIR.",
          rationale: `Unwind must be instructed before SaFIR cut-off at 16:00 CET. Collateral of ${fmtMoney(r.postedCollateral, r.currency)} will be released back to free pool.`,
          workflowState: daysLeft === 0 ? "under_review" : "proposed",
          detectedAt:    now,
          updatedAt:     now,
          integration:   r.integration ?? null,
          impact: {
            type:             "release",
            collateralFreed:  r.postedCollateral,
            currentFreePool:  freePool,
            projectedFreePool: freePool + r.postedCollateral,
            currency:         r.currency,
          },
        });
      }
    });

  // 4 · Settlement exceptions from notifications
  notifications
    .filter((n) => {
      const text = `${n.text ?? ""} ${n.title ?? ""} ${n.message ?? ""}`.toLowerCase();
      return (
        (n.severity === "Critical" || n.type === "Critical") &&
        (text.includes("settlement") || text.includes("exception") || text.includes("confirmation"))
      );
    })
    .slice(0, 2)
    .forEach((n) => {
      const targetRepo = repos.find((r) => r.id === n.target);
      items.push({
        id:             `settle-${n.id}`,
        type:           "settlement-exception",
        severity:       "Warning",
        repoId:         n.target ?? null,
        title:          n.title ?? n.text ?? "Settlement Exception",
        linked:         n.target ?? "System",
        recommendation:
          "Coordinate with operations desk to resolve instruction exception before cut-off.",
        rationale:      n.text ?? n.message ?? "Exception detected in SaFIR instruction flow.",
        workflowState:  "detected",
        detectedAt:     n.ts ?? now,
        updatedAt:      n.ts ?? now,
        integration:    targetRepo?.integration ?? {
          sourceSystem: "SaFIR / BNR",
          sourceLedger: "SaFIR custody register",
          settlementState: "pending_confirmation",
          reconState: "pending",
          custodyLocation: "SaFIR / BNR Central Registry",
          lastSyncTs: n.ts ?? now,
        },
        impact: {
          type:           "exception",
          currentState:   "Exception Active",
          projectedState: "Resolved",
          description:    "Coordinating with the ops desk will clear this from the SaFIR instruction queue.",
        },
      });
    });

  // 5 · Reconciliation issues from notifications
  notifications
    .filter((n) => {
      const text = `${n.text ?? ""} ${n.title ?? ""} ${n.message ?? ""}`.toLowerCase();
      return text.includes("reconcil") || text.includes("break") || text.includes("mismatch");
    })
    .slice(0, 1)
    .forEach((n) => {
      const targetRepo = repos.find((r) => r.id === n.target);
      items.push({
        id:             `recon-${n.id}`,
        type:           "reconciliation-issue",
        severity:       "Warning",
        repoId:         n.target ?? null,
        title:          n.title ?? n.text ?? "Reconciliation Break",
        linked:         n.target ?? "System",
        recommendation: "Investigate position break and align internal ledger with custodian records.",
        rationale:      n.text ?? n.message ?? "Position discrepancy detected.",
        workflowState:  "under_review",
        detectedAt:     n.ts ?? now,
        updatedAt:      n.ts ?? now,
        integration:    targetRepo?.integration ?? {
          sourceSystem: "SaFIR position feed",
          sourceLedger: "SaFIR custody register",
          settlementState: "confirmed",
          reconState: "break_detected",
          custodyLocation: "SaFIR / BNR Central Registry",
          lastSyncTs: n.ts ?? now,
        },
        impact: {
          type:           "exception",
          currentState:   "Break Detected",
          projectedState: "Reconciled",
          description:    "Investigating and aligning with custodian records will close the position break.",
        },
      });
    });

  // 6 · Pending 4-eye substitution approvals
  pendingSubstitutions.slice(0, 2).forEach((sub) => {
    const outA = assets.find((a) => a.id === sub.outAssetId);
    const inA  = assets.find((a) => a.id === sub.inAssetId);
    items.push({
      id:             `sub-${sub.id}`,
      type:           "pending-approval",
      severity:       "Info",
      repoId:         sub.repoId,
      title:          `Substitution Awaiting Approval — ${sub.repoId}`,
      linked:         `${sub.repoId} · Proposed by ${sub.proposedBy}`,
      recommendation: "Review the proposed substitution analysis and approve or reject before SLA expires.",
      rationale:      `Proposed at ${sub.proposedAt}. Execution blocked until Treasury Manager sign-off.`,
      workflowState:  "proposed",
      detectedAt:     sub.proposedAt ?? now,
      updatedAt:      sub.proposedAt ?? now,
      impact: {
        type:             "substitution",
        outAsset:         outA ? { name: outA.name, haircut: outA.haircut, adjustedValue: adjustedValue(outA) } : null,
        inAsset:          inA  ? { name: inA.name,  haircut: inA.haircut,  adjustedValue: adjustedValue(inA)  } : null,
        liquidityChange:  (outA?.marketValue ?? 0) - (inA?.marketValue ?? 0),
        concentrationFlag: null,
        currency:         outA?.currency ?? inA?.currency ?? "RON",
      },
    });
  });

  return items.sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 1) - (SEVERITY_ORDER[b.severity] ?? 1)
  );
}

// ─── UI components ────────────────────────────────────────────────────────────

function ActionCard({ item, onAct }) {
  const cfg = ACTION_TYPE_CFG[item.type] ?? ACTION_TYPE_CFG["coverage-watch"];
  const Icon = cfg.icon;

  const severityBadge =
    item.severity === "Critical"
      ? "bg-red-100 text-red-700 border border-red-200"
      : item.severity === "Warning"
      ? "bg-amber-100 text-amber-700 border border-amber-200"
      : "bg-blue-100 text-blue-700 border border-blue-200";

  return (
    <div className={`rounded-[1.5rem] border ${cfg.border} ${cfg.bg} p-5 flex flex-col gap-4 shadow-sm`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 text-base leading-tight">{item.title}</div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">{item.linked}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${severityBadge}`}>
            {item.severity}
          </span>
        </div>
      </div>

      {/* Recommendation */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/80 bg-white/65 px-4 py-3 min-w-0">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Recommendation</div>
          <div className="text-sm text-slate-800 leading-relaxed break-words">{item.recommendation}</div>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/65 px-4 py-3 min-w-0">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Rationale</div>
          <div className="text-xs text-slate-600 leading-relaxed break-words">{item.rationale}</div>
        </div>
      </div>

      {/* Impact Preview */}
      <ImpactPreview impact={item.impact} />

      {/* Integration context */}
      <IntegrationContextBar integration={item.integration} />

      {/* Workflow state bar */}
      <div className="rounded-2xl border border-white/80 bg-white/55 px-4 py-3 overflow-hidden">
        <WorkflowStateBar
          state={item.workflowState ?? "detected"}
          detectedAt={item.detectedAt}
          updatedAt={item.updatedAt}
          compact
        />
      </div>

      {/* Footer row — CTAs only */}
      {item.repoId && (
        <div className="flex items-center justify-end gap-2">
          {/* Secondary action — outline style */}
          <button
            onClick={() => onAct(item.repoId)}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-300 bg-white/70 px-3.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white"
          >
            <cfg.secondaryIcon className="h-3 w-3 opacity-70" />
            {cfg.secondaryLabel}
          </button>
          {/* Primary action — solid colored */}
          <button
            onClick={() => onAct(item.repoId)}
            className={`flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition shadow-sm ${cfg.cta}`}
          >
            <cfg.primaryIcon className="h-3 w-3" />
            {cfg.primaryLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export function RecommendedActions({ items, onAct }) {
  const now = new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
  const critCount  = items.filter((i) => i.severity === "Critical").length;
  const warnCount  = items.filter((i) => i.severity === "Warning").length;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div>
            <div className="font-semibold text-slate-900">Agent Recommendations</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {items.length === 0
                ? "No open actions — all positions within parameters"
                : `${items.length} action${items.length > 1 ? "s" : ""} requiring attention · updated ${now}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {critCount > 0 && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">
              {critCount} critical
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
              {warnCount} warning
            </span>
          )}
          {items.length === 0 && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
              All clear
            </span>
          )}
        </div>
      </div>

      {/* Action cards */}
      {items.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((item) => (
            <ActionCard key={item.id} item={item} onAct={onAct} />
          ))}
        </div>
      )}
    </div>
  );
}
