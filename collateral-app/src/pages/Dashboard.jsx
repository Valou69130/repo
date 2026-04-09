import { useMemo, useState, useEffect, useRef } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpFromLine,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Coins,
  Cpu,
  FileSearch,
  GitCompareArrows,
  MoveUpRight,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Wallet,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { WorkflowStateBar } from "@/components/shared/WorkflowState";
import { ImpactPreview } from "@/components/shared/ImpactPreview";
import { IntegrationContextBar } from "@/components/shared/IntegrationContext";
import { fmtMoney, adjustedValue } from "@/domain/format";
import { useDomain } from "@/domain/store";

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  Available: "#10b981",
  Reserved:  "#f59e0b",
  Locked:    "#64748b",
  Pledged:   "#ef4444",
};

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
    icon:           AlertTriangle,
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

function deriveActionItems(repos, assets, notifications, pendingSubstitutions) {
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

// ─── Agent runtime clock ───────────────────────────────────────────────────────
// Simulates a recurring scan loop for a single agent.
// intervalSecs  — how often the agent re-scans (demo-safe, not real network calls)
// initialOffset — seconds since last scan when component first mounts (adds variety)

function useAgentClock(intervalSecs, initialOffset = 0) {
  const [clock, setClock] = useState(() => ({
    lastRunTs: Date.now() - initialOffset * 1000,
    scanCount: 42 + Math.floor(initialOffset / intervalSecs) + Math.floor(Math.random() * 8),
  }));
  const [now, setNow] = useState(() => Date.now());
  const [isScanning, setIsScanning] = useState(false);
  const scanningRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      const currentNow = Date.now();
      const elapsed = (currentNow - clock.lastRunTs) / 1000;
      if (elapsed >= intervalSecs && !scanningRef.current) {
        scanningRef.current = true;
        setIsScanning(true);
        setTimeout(() => {
          const completedAt = Date.now();
          setClock((prev) => ({
            lastRunTs: completedAt,
            scanCount: prev.scanCount + 1,
          }));
          scanningRef.current  = false;
          setIsScanning(false);
          setNow(completedAt);
        }, 700);
      } else {
        setNow(currentNow);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [clock.lastRunTs, intervalSecs]);

  const elapsed     = Math.floor((now - clock.lastRunTs) / 1000);
  const nextScanIn  = Math.max(0, intervalSecs - elapsed);
  const lastRunTs   = clock.lastRunTs;
  const scanCount   = clock.scanCount;

  return { lastRunTs, scanCount, nextScanIn, isScanning };
}

// ─── Agent status strip ────────────────────────────────────────────────────────

function AgentStatusDot({ status }) {
  if (status === "alert")   return <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" /></span>;
  if (status === "warning") return <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" /></span>;
  if (status === "scanning") return <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-300 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" /></span>;
  return <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500" />;
}

function fmtTs(ms) {
  return new Date(ms).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtCountdown(secs) {
  if (secs <= 0) return "now";
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function MetaCell({ label, value, mono = false, bold = false }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[8.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`text-[10.5px] ${mono ? "font-mono" : ""} ${bold ? "font-semibold text-slate-800" : "text-slate-600"}`}>{value}</span>
    </div>
  );
}

function AgentPanel({ name, icon: Icon, status, statusText, stats, evaluated, activeRecs, lastRecLabel, activity, clock }) {
  const borderCls =
    status === "alert"    ? "border-l-red-400"    :
    status === "warning"  ? "border-l-amber-400"  :
    status === "scanning" ? "border-l-blue-300"   :
                            "border-l-emerald-400";

  const healthLabel =
    status === "alert"    ? "Alert"    :
    status === "warning"  ? "Warning"  :
    status === "scanning" ? "Scanning" : "Nominal";

  const healthColor =
    status === "alert"    ? "text-red-600"    :
    status === "warning"  ? "text-amber-600"  :
    status === "scanning" ? "text-blue-500"   : "text-emerald-600";

  return (
    <div className={`rounded-md border border-slate-200 border-l-4 ${borderCls} bg-white flex flex-col`}>
      {/* Header */}
      <div className="px-4 pt-3.5 pb-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] font-semibold uppercase tracking-widest ${healthColor}`}>{healthLabel}</span>
            <AgentStatusDot status={status} />
          </div>
        </div>
        <div className="text-sm font-medium text-slate-800 leading-snug">{statusText}</div>
      </div>

      {/* Operational metadata — inline key:value strip */}
      <div className="border-t border-slate-100 px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <MetaCell label="Run"  value={fmtTs(clock.lastRunTs)} mono />
        <span className="text-slate-200 text-[10px]">·</span>
        <MetaCell label="Next" value={clock.isScanning ? "scanning…" : `in ${fmtCountdown(clock.nextScanIn)}`} mono />
        <span className="text-slate-200 text-[10px]">·</span>
        <MetaCell label="Evaluated" value={evaluated} />
        <span className="text-slate-200 text-[10px]">·</span>
        <MetaCell label="Active recs" value={String(activeRecs)} bold />
      </div>

      {/* Stats row */}
      {stats.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-2 flex items-center gap-5">
          {stats.map((s) => (
            <div key={s.label} className="flex items-baseline gap-1">
              <span className={`text-sm font-bold tabular-nums leading-none ${s.color}`}>{s.value}</span>
              <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">{s.label}</span>
            </div>
          ))}
          {lastRecLabel && (
            <div className="ml-auto text-[9px] text-slate-400 font-mono truncate max-w-[120px]" title={lastRecLabel}>
              ↳ {lastRecLabel}
            </div>
          )}
        </div>
      )}

      {/* Scan #N and activity feed */}
      <div className="border-t border-slate-100 px-4 py-2.5 space-y-1">
        <div className="text-[9px] font-mono text-slate-400">
          Scan #{clock.scanCount} · {fmtTs(clock.lastRunTs)}
        </div>
        {activity.map((line, i) => (
          <div key={i} className="text-[10px] text-slate-500 leading-relaxed flex gap-1.5">
            <span className="text-slate-300 flex-shrink-0">▸</span>
            <span>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentStatusStrip({ repos, assets, notifications, actionItems }) {
  const { agentState } = useDomain();

  // Per-agent scan clocks — staggered offsets so they don't all fire together
  const marginClock  = useAgentClock(45,  12);   // every 45s, was last run 12s ago
  const allocClock   = useAgentClock(120, 37);   // every 2 min, was last run 37s ago
  const exceptClock  = useAgentClock(30,  8);    // every 30s, was last run 8s ago

  // Domain-derived counts
  const marginScan   = agentState.margin.scanResult;
  const allocPending = Object.values(agentState.allocation.pending).some(Boolean);
  const allocCount   = Object.keys(agentState.allocation.results).length;

  const activeRepos    = repos.filter((r) => r.state !== "Closed");
  const deficits       = activeRepos.filter((r) => r.buffer < 0);
  const warnings       = activeRepos.filter((r) => r.buffer >= 0 && r.postedCollateral / r.requiredCollateral < 1.03);
  const watchRepos     = activeRepos.filter((r) => r.buffer >= 0 && r.postedCollateral / r.requiredCollateral >= 1.03 && r.buffer < 500000);
  const availableAssets = assets.filter((a) => a.status === "Available");
  const criticalNotifs = notifications.filter((n) => n.severity === "Critical" || n.type === "Critical");
  const totalOpen      = notifications.filter((n) => !n.read);

  const marginStatus   = deficits.length > 0 ? "alert" : warnings.length > 0 ? "warning" : marginClock.isScanning ? "scanning" : "clear";
  const allocStatus    = allocPending ? "scanning" : allocClock.isScanning ? "scanning" : "clear";
  const exceptStatus   = criticalNotifs.length > 0 ? "alert" : exceptClock.isScanning ? "scanning" : "clear";

  // Active recs per agent (count items by type)
  const marginRecs     = actionItems.filter((i) => i.type === "margin-deficit" || i.type === "coverage-watch").length;
  const allocRecs      = actionItems.filter((i) => i.type === "substitution-opportunity" || i.type === "pending-approval").length;
  const exceptRecs     = actionItems.filter((i) => i.type === "settlement-exception" || i.type === "reconciliation-issue").length;

  // Last recommendation label (title of most recent matching item)
  const lastMarginRec  = actionItems.find((i) => i.type === "margin-deficit" || i.type === "coverage-watch")?.title ?? null;
  const lastAllocRec   = actionItems.find((i) => i.type === "substitution-opportunity" || i.type === "pending-approval")?.title ?? null;
  const lastExceptRec  = actionItems.find((i) => i.type === "settlement-exception" || i.type === "reconciliation-issue")?.title ?? null;

  return (
    <div className="grid gap-3 md:grid-cols-3">

      {/* ── Margin Protection Agent ───────────────────────────────────────── */}
      <AgentPanel
        name="Margin Protection Agent"
        icon={ShieldCheck}
        status={marginStatus}
        statusText={
          deficits.length > 0
            ? `${deficits.length} repo(s) under-collateralised — action required`
            : warnings.length > 0
            ? `${warnings.length} position(s) below 103% threshold`
            : marginScan
            ? `Scan clear — ${marginScan.totalActive ?? activeRepos.length} repo(s) monitored`
            : "Continuous monitoring — all positions in compliance"
        }
        clock={marginClock}
        evaluated={`${activeRepos.length} repo${activeRepos.length !== 1 ? "s" : ""}`}
        activeRecs={marginRecs}
        lastRecLabel={lastMarginRec}
        stats={[
          { label: "Critical", value: deficits.length,  color: deficits.length > 0  ? "text-red-600"   : "text-slate-400" },
          { label: "Warning",  value: warnings.length,  color: warnings.length > 0  ? "text-amber-600" : "text-slate-400" },
          { label: "Watch",    value: watchRepos.length, color: "text-slate-500" },
        ]}
        activity={[
          `Scanned ${activeRepos.length} active repo${activeRepos.length !== 1 ? "s" : ""} · ${assets.length} collateral positions`,
          deficits.length > 0
            ? `Deficit alert${deficits.length > 1 ? "s" : ""} active — ${deficits.map((r) => r.id).join(", ")}`
            : warnings.length > 0
            ? `${warnings.length} position${warnings.length > 1 ? "s" : ""} flagged below 103% coverage threshold`
            : "All positions within collateral requirements",
        ]}
      />

      {/* ── Allocation Agent ──────────────────────────────────────────────── */}
      <AgentPanel
        name="Allocation Agent"
        icon={Cpu}
        status={allocStatus}
        statusText={
          allocPending
            ? "Running allocation analysis…"
            : allocCount > 0
            ? `${allocCount} allocation session${allocCount !== 1 ? "s" : ""} tracked`
            : "Standby — monitoring basket composition"
        }
        clock={allocClock}
        evaluated={`${activeRepos.length} repo${activeRepos.length !== 1 ? "s" : ""} · ${availableAssets.length} assets`}
        activeRecs={allocRecs}
        lastRecLabel={lastAllocRec}
        stats={[
          { label: "Sessions", value: allocCount,                               color: "text-slate-700" },
          { label: "Pending",  value: allocPending ? 1 : 0,                    color: allocPending ? "text-blue-600" : "text-slate-400" },
          { label: "Avail.",   value: availableAssets.length,                  color: "text-slate-500" },
        ]}
        activity={[
          `Evaluated ${activeRepos.length} repo${activeRepos.length !== 1 ? "s" : ""} across ${availableAssets.length} available asset${availableAssets.length !== 1 ? "s" : ""}`,
          allocRecs > 0
            ? `${allocRecs} substitution recommendation${allocRecs > 1 ? "s" : ""} pending approval`
            : "No substitution proposals pending — basket composition optimal",
        ]}
      />

      {/* ── Exception Agent ───────────────────────────────────────────────── */}
      <AgentPanel
        name="Exception Agent"
        icon={AlertTriangle}
        status={exceptStatus}
        statusText={
          criticalNotifs.length > 0
            ? `${criticalNotifs.length} critical exception${criticalNotifs.length > 1 ? "s" : ""} require attention`
            : totalOpen.length > 0
            ? `${totalOpen.length} open notification${totalOpen.length > 1 ? "s" : ""} — no critical items`
            : "All clear — no open exceptions"
        }
        clock={exceptClock}
        evaluated={`${notifications.length} notification${notifications.length !== 1 ? "s" : ""}`}
        activeRecs={exceptRecs}
        lastRecLabel={lastExceptRec}
        stats={[
          { label: "Open",     value: totalOpen.length,      color: totalOpen.length > 0      ? "text-slate-700" : "text-slate-400" },
          { label: "Critical", value: criticalNotifs.length, color: criticalNotifs.length > 0 ? "text-red-600"   : "text-slate-400" },
          { label: "Resolved", value: notifications.filter((n) => n.read).length, color: "text-slate-400" },
        ]}
        activity={[
          `Reviewed ${notifications.length} instruction${notifications.length !== 1 ? "s" : ""} · ${totalOpen.length} open item${totalOpen.length !== 1 ? "s" : ""}`,
          criticalNotifs.length > 0
            ? `${criticalNotifs.length} unresolved critical exception${criticalNotifs.length > 1 ? "s" : ""} flagged for ops review`
            : "No critical exceptions — SaFIR instruction flow nominal",
        ]}
      />

    </div>
  );
}

// ─── Recommended actions ──────────────────────────────────────────────────────

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
          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl flex-shrink-0 ${cfg.badge} border`}>
            <Icon className="h-4 w-4" />
          </div>
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

function RecommendedActions({ items, onAct }) {
  const now = new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
  const critCount  = items.filter((i) => i.severity === "Critical").length;
  const warnCount  = items.filter((i) => i.severity === "Warning").length;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900">Recommended Actions</h2>
            <div className="mt-0.5 text-xs text-slate-500">Highest-priority interventions generated from the current repo and collateral state.</div>
          </div>
          <div className="flex items-center gap-1.5">
            {critCount > 0 && (
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {critCount} critical
              </span>
            )}
            {warnCount > 0 && (
              <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-white">
                {warnCount} warning
              </span>
            )}
            {items.length === 0 && (
              <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
                All clear
              </span>
            )}
          </div>
        </div>
        <span className="text-[10px] font-mono text-slate-400">Computed {now}</span>
      </div>

      {/* Action cards */}
      {items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-6">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <div>
            <div className="font-semibold text-emerald-800 text-sm">All positions are within parameters</div>
            <div className="text-xs text-emerald-700 mt-0.5">No margin deficits, coverage exceptions, or settlement issues detected at this time.</div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <ActionCard key={item.id} item={item} onAct={onAct} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Existing sub-components (preserved) ─────────────────────────────────────

const PieTooltip = ({ active, payload }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white border rounded shadow-lg px-3 py-2 text-sm">
        <div className="font-medium text-slate-800">{payload[0].name}</div>
        <div className="text-slate-500">{fmtMoney(payload[0].value)}</div>
      </div>
    );
  }
  return null;
};

const BarTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white border rounded shadow-lg px-3 py-2 text-sm">
        <div className="font-medium text-slate-800">{label}</div>
        <div className="text-slate-500">Coverage: {payload[0].value}%</div>
      </div>
    );
  }
  return null;
};

function MiniCoverageBar({ value }) {
  const color = value >= 103 ? "#10b981" : value >= 100 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-1.5 rounded-full"
          style={{ width: `${Math.min(value / 1.5, 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-medium w-9 text-right" style={{ color }}>
        {value}%
      </span>
    </div>
  );
}

function EodSummary({ repos, assets }) {
  const today       = new Date().toISOString().slice(0, 10);
  const activeRepos = repos.filter((r) => r.state !== "Closed");

  const rows = activeRepos.map((r) => {
    const elapsed      = Math.max(1, Math.ceil((new Date() - new Date(r.startDate)) / 86400000));
    const dailyInterest = Math.round(r.amount * (r.rate / 100) / 360);
    const totalAccrued  = dailyInterest * elapsed;
    const coverage      = Math.round((r.postedCollateral / r.requiredCollateral) * 100);
    const daysLeft      = Math.max(0, Math.ceil((new Date(r.maturityDate) - new Date()) / 86400000));
    return { ...r, elapsed, dailyInterest, totalAccrued, coverage, daysLeft };
  });

  const totalDailyInterest = rows.reduce((s, r) => s + r.dailyInterest, 0);
  const totalAccrued       = rows.reduce((s, r) => s + r.totalAccrued, 0);
  const totalFunding       = activeRepos.reduce((s, r) => s + r.amount, 0);
  const totalCollateral    = activeRepos.reduce((s, r) => s + r.postedCollateral, 0);
  const utilizationPct     =
    totalCollateral > 0
      ? Math.round(
          (assets.filter((a) => a.status !== "Available").reduce((s, a) => s + a.marketValue, 0) /
            assets.reduce((s, a) => s + a.marketValue, 0)) *
            100
        )
      : 0;

  return (
    <Card className="rounded-md shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>End-of-Day Position Summary</CardTitle>
            <CardDescription>
              Daily P&amp;L attribution, net funding position, and collateral efficiency — as of {today}
            </CardDescription>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-medium border border-slate-200 px-2 py-1 rounded">
            EoD SNAPSHOT
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            { label: "Net Funding Outstanding", value: fmtMoney(totalFunding), sub: `${activeRepos.length} open repos`, color: "" },
            { label: "Daily Interest Income", value: fmtMoney(totalDailyInterest), sub: "Accruing today", color: "text-emerald-700" },
            { label: "Total Interest Accrued", value: fmtMoney(totalAccrued), sub: "Across all open trades", color: "" },
            { label: "Portfolio Encumbrance", value: `${utilizationPct}%`, sub: "of total collateral pool used", color: "" },
          ].map((m) => (
            <div key={m.label} className="rounded border bg-slate-50 p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{m.label}</div>
              <div className={`text-lg font-bold ${m.color || "text-slate-900"}`}>{m.value}</div>
              <div className="text-xs text-slate-400">{m.sub}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Per-Repo Interest Attribution
          </div>
          <div className="rounded border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Repo</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Notional</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Days Elapsed</TableHead>
                  <TableHead>Daily Interest</TableHead>
                  <TableHead>Total Accrued</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead>Days Left</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs font-medium">{r.id}</TableCell>
                    <TableCell className="text-sm">{r.counterparty}</TableCell>
                    <TableCell>{fmtMoney(r.amount, r.currency)}</TableCell>
                    <TableCell>{r.rate}%</TableCell>
                    <TableCell className="text-slate-500">{r.elapsed}d</TableCell>
                    <TableCell className="font-semibold text-emerald-700">{fmtMoney(r.dailyInterest, r.currency)}</TableCell>
                    <TableCell className="font-semibold text-slate-800">{fmtMoney(r.totalAccrued, r.currency)}</TableCell>
                    <TableCell>
                      <span className={`font-semibold text-sm ${r.buffer < 0 ? "text-red-600" : r.coverage < 103 ? "text-amber-600" : "text-emerald-600"}`}>
                        {r.coverage}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`font-semibold ${r.daysLeft <= 1 ? "text-red-600" : r.daysLeft <= 3 ? "text-amber-600" : "text-slate-600"}`}>
                        {r.daysLeft}d
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-slate-400 text-sm italic py-6">
                      No active repo positions
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="rounded border-l-4 border-blue-400 bg-blue-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <TrendingDown className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-700">
              <span className="font-semibold">Collateral efficiency:</span> {utilizationPct}% of the portfolio is
              encumbered.{" "}
              {utilizationPct > 80
                ? "Free pool is thin — monitor upcoming maturities to avoid collateral shortfall."
                : "Free pool is healthy. Consider deploying excess eligible assets in new funding transactions."}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PendingApprovalsWidget({
  pendingSubstitutions,
  assets,
  repos,
  role,
  onApproveSubstitution,
  onRejectSubstitution,
}) {
  const canApprove = role === "Treasury Manager";
  if (pendingSubstitutions.length === 0) return null;

  return (
    <Card className="rounded-md shadow-sm border-amber-200">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400 flex-shrink-0" />
          <CardTitle className="text-amber-800">Pending 4-Eye Approvals</CardTitle>
          <span className="ml-auto text-[10px] uppercase tracking-widest font-semibold text-amber-600 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded">
            {pendingSubstitutions.length} pending
          </span>
        </div>
        <CardDescription>
          {canApprove
            ? "Collateral substitutions proposed by Collateral Managers awaiting your approval."
            : "Your proposed substitutions are staged here awaiting Treasury Manager sign-off."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {pendingSubstitutions.map((sub) => {
            const oldA = assets.find((a) => a.id === sub.oldAssetId);
            const newA = assets.find((a) => a.id === sub.newAssetId);
            const repo = repos.find((r) => r.id === sub.repoId);
            return (
              <div
                key={sub.id}
                className="rounded border border-amber-200 bg-amber-50 p-4 flex items-center gap-4 flex-wrap"
              >
                <GitCompareArrows className="h-4 w-4 text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900">
                    <span className="font-mono text-xs text-slate-500 mr-2">{sub.repoId}</span>
                    {oldA?.name ?? sub.oldAssetId}
                    <span className="text-slate-400 mx-2">→</span>
                    {newA?.name ?? sub.newAssetId}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Proposed by {sub.proposedBy} · {sub.proposedAt}
                    {repo && <> · {repo.counterparty}</>}
                  </div>
                </div>
                {canApprove && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded transition"
                      onClick={() => onApproveSubstitution(sub.id)}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button
                      className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded transition"
                      onClick={() => onRejectSubstitution(sub.id)}
                    >
                      <ThumbsDown className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                )}
                {!canApprove && (
                  <span className="text-xs text-amber-600 italic flex-shrink-0">Awaiting approval</span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Portfolio Optimisation summary widget ────────────────────────────────────

const PRIORITY_DOT = { High: "bg-red-500", Medium: "bg-amber-400", Low: "bg-slate-400" };

function PortfolioOptWidget({ repos, assets, onNavigate }) {
  const adj = (a) => a.marketValue * (1 - a.haircut / 100);

  const { excessTotal, idleCount, opps } = useMemo(() => {
    const activeRepos  = repos.filter((r) => r.state !== "Closed");
    const pledgedIds   = new Set(activeRepos.flatMap((r) => r.assets));
    const TODAY        = "2026-04-06";

    const excess = activeRepos.filter((r) => r.buffer > 0).reduce((s, r) => s + r.buffer, 0);
    const idle   = assets.filter(
      (a) => a.status === "Available" && !pledgedIds.has(a.id) &&
        (a.eligibility?.toLowerCase().includes("repo") || a.eligibility?.toLowerCase().includes("central bank")),
    ).length;

    const derived = [];

    // deficit vs surplus rebalance
    const deficits = activeRepos.filter((r) => r.buffer < 0);
    const surplus  = activeRepos.filter((r) => r.buffer > 0);
    if (deficits.length && surplus.length) {
      const totalSurplus = surplus.reduce((s, r) => s + r.buffer, 0);
      const totalDeficit = deficits.reduce((s, r) => s + Math.abs(r.buffer), 0);
      derived.push({
        priority: "High",
        label: `Rebalance — resolve ${deficits.length} margin deficit${deficits.length > 1 ? "s" : ""}`,
        value: fmtMoney(Math.max(0, totalSurplus - totalDeficit)),
      });
    }

    // maturing repos
    for (const r of activeRepos) {
      if (r.state === "Maturing" || r.maturityDate <= TODAY) {
        const releaseVal = assets.filter((a) => r.assets.includes(a.id)).reduce((s, a) => s + adj(a), 0);
        derived.push({ priority: "High", label: `Release collateral — maturing ${r.id}`, value: fmtMoney(releaseVal, r.currency) });
      }
    }

    // idle eligible
    if (idle > 0) {
      const val = assets
        .filter((a) => a.status === "Available" && !pledgedIds.has(a.id) &&
          (a.eligibility?.toLowerCase().includes("repo") || a.eligibility?.toLowerCase().includes("central bank")))
        .reduce((s, a) => s + adj(a), 0);
      derived.push({ priority: "Medium", label: `Deploy ${idle} idle eligible position${idle > 1 ? "s" : ""}`, value: fmtMoney(val) });
    }

    // orphan encumbrances
    const orphans = assets.filter((a) => (a.status === "Pledged" || a.status === "Locked") && !pledgedIds.has(a.id));
    if (orphans.length) {
      const val = orphans.reduce((s, a) => s + adj(a), 0);
      derived.push({ priority: "Medium", label: `Review ${orphans.length} stale encumbrance${orphans.length > 1 ? "s" : ""}`, value: fmtMoney(val) });
    }

    const order = { High: 0, Medium: 1, Low: 2 };
    derived.sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));
    return { excessTotal: excess, idleCount: idle, opps: derived };
  }, [repos, assets]);

  const highCount = opps.filter((o) => o.priority === "High").length;

  return (
    <Card className="rounded-md shadow-sm border-blue-100">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-500" />
            <CardTitle className="text-base">Portfolio Optimisation Opportunities</CardTitle>
          </div>
          <button
            onClick={() => onNavigate?.("portfolio-opt")}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 group"
          >
            View full analysis
            <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
        <CardDescription>
          System-identified efficiency improvements across the active portfolio
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary pills */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total excess collateral", value: fmtMoney(excessTotal), alert: false },
            { label: "Optimisation opportunities", value: String(opps.length), alert: highCount > 0 },
            { label: "Idle eligible positions", value: String(idleCount), alert: false },
          ].map(({ label, value, alert }) => (
            <div key={label} className={`rounded-md border px-3 py-2 ${alert ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
              <div className={`text-[9.5px] font-semibold uppercase tracking-wide ${alert ? "text-red-500" : "text-slate-400"}`}>{label}</div>
              <div className={`text-sm font-semibold mt-0.5 ${alert ? "text-red-700" : "text-slate-800"}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Top opportunities */}
        {opps.length > 0 && (
          <div className="rounded-md border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {opps.slice(0, 3).map((opp, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[opp.priority] ?? "bg-slate-400"}`} />
                  <span className="text-[12px] text-slate-700 truncate">{opp.label}</span>
                </div>
                <span className="text-[11px] font-mono font-semibold text-emerald-700 flex-shrink-0">{opp.value}</span>
              </div>
            ))}
            {opps.length > 3 && (
              <button
                onClick={() => onNavigate?.("portfolio-opt")}
                className="w-full text-left px-3 py-2 text-[11px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors"
              >
                +{opps.length - 3} more opportunit{opps.length - 3 === 1 ? "y" : "ies"} — view full analysis
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export function Dashboard({
  assets,
  repos,
  notifications,
  openRepo,
  pendingSubstitutions = [],
  role,
  onApproveSubstitution,
  onRejectSubstitution,
  onNavigate,
}) {
  const today = new Date().toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  // ── Derived data ──
  const totals = useMemo(() => {
    const total   = assets.reduce((s, a) => s + a.marketValue, 0);
    const free    = assets.filter((a) => a.status === "Available").reduce((s, a) => s + a.marketValue, 0);
    const active  = repos.filter((r) => ["Active", "Maturing", "Margin deficit"].includes(r.state)).length;
    const deficits = repos.filter((r) => r.buffer < 0).length;
    const accruedToday = repos
      .filter((r) => r.state !== "Closed")
      .reduce((s, r) => s + Math.round(r.amount * (r.rate / 100) / 360), 0);
    return { total, free, active, deficits, accruedToday };
  }, [assets, repos]);

  const actionItems = useMemo(
    () => deriveActionItems(repos, assets, notifications, pendingSubstitutions),
    [repos, assets, notifications, pendingSubstitutions]
  );

  const statusBreakdown = useMemo(() => {
    const groups = { Available: 0, Reserved: 0, Locked: 0, Pledged: 0 };
    assets.forEach((a) => {
      if (groups[a.status] !== undefined) groups[a.status] += a.marketValue;
    });
    return Object.entries(groups)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [assets]);

  const maturityLadder = useMemo(() => {
    const dayMap = {};
    for (const r of repos) {
      if (r.state === "Closed") continue;
      const d = r.maturityDate;
      if (!dayMap[d]) dayMap[d] = { date: d, cash: 0, collateral: 0, repos: [] };
      dayMap[d].cash += r.amount;
      dayMap[d].collateral += r.postedCollateral;
      dayMap[d].repos.push(r.id);
    }
    return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [repos]);

  const coverageData = useMemo(() => {
    return repos
      .filter((r) => r.state !== "Closed")
      .map((r) => ({
        id:       r.id,
        coverage: Math.round((r.postedCollateral / r.requiredCollateral) * 100),
        fill:
          r.buffer < 0
            ? "#ef4444"
            : r.postedCollateral / r.requiredCollateral < 1.03
            ? "#f59e0b"
            : "#10b981",
      }));
  }, [repos]);

  return (
    <div className="space-y-6 w-full max-w-full min-w-0">

      {/* ── Page header ── */}
      <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[linear-gradient(135deg,#f8fbff_0%,#eef6ff_42%,#f8fafc_100%)] px-6 py-6 shadow-sm">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-blue-200/35 blur-3xl" />
        <div className="absolute bottom-0 left-24 h-32 w-32 rounded-full bg-emerald-100/60 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-blue-700 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              Executive overview
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
              Collateral Control Center
            </h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              Agent-assisted operating surface for margin monitoring, substitution analysis, settlement pressure, and daily control actions across the repo book.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/80 bg-white/75 px-4 py-3 shadow-sm">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-medium">Free pool</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{fmtMoney(totals.free)}</div>
              <div className="mt-1 text-xs text-slate-500">Immediately mobilisable collateral</div>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/75 px-4 py-3 shadow-sm">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-medium">Open actions</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{actionItems.length}</div>
              <div className="mt-1 text-xs text-slate-500">Recommended interventions and reviews</div>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/75 px-4 py-3 shadow-sm text-right">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-medium">Session date</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{today}</div>
              <div className="mt-1 flex items-center justify-end gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                <span className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">Live</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Agent status strip ── */}
      <AgentStatusStrip repos={repos} assets={assets} notifications={notifications} actionItems={actionItems} />

      {/* ── Recommended actions ── */}
      <RecommendedActions items={actionItems} onAct={openRepo} />

      {/* ── 4-eye approvals ── */}
      <PendingApprovalsWidget
        pendingSubstitutions={pendingSubstitutions}
        assets={assets}
        repos={repos}
        role={role}
        onApproveSubstitution={onApproveSubstitution}
        onRejectSubstitution={onRejectSubstitution}
      />

      {/* ── Divider — secondary content ── */}
      <div className="flex items-center gap-3 pt-2">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold px-2">
          Portfolio &amp; Market Overview
        </span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* ── KPI strip (demoted) ── */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Collateral Value"
          value={fmtMoney(totals.total)}
          description="All registered positions across the pool"
          icon={Coins}
        />
        <KpiCard
          title="Free Collateral"
          value={fmtMoney(totals.free)}
          description={
            totals.total > 0
              ? `${Math.round((totals.free / totals.total) * 100)}% of portfolio unencumbered`
              : "No assets"
          }
          icon={Wallet}
          trendUp
        />
        <KpiCard
          title="Active Repos"
          value={String(totals.active)}
          description={
            totals.deficits > 0
              ? `${totals.deficits} margin deficit${totals.deficits > 1 ? "s" : ""} need attention`
              : "Open book currently within threshold"
          }
          icon={ArrowRightLeft}
          alert={totals.deficits > 0}
        />
        <KpiCard
          title="Accrued Interest Today"
          value={fmtMoney(totals.accruedToday)}
          description="Estimated carry contribution on open trades"
          icon={ReceiptText}
        />
      </div>

      {/* ── Portfolio Optimisation widget ── */}
      <PortfolioOptWidget repos={repos} assets={assets} onNavigate={onNavigate} />

      {/* ── Portfolio charts ── */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-md shadow-sm">
          <CardHeader>
            <CardTitle>Portfolio Allocation</CardTitle>
            <CardDescription>Market value by encumbrance status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div style={{ height: 180, width: 180, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={76}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {statusBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-3">
                {statusBreakdown.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: STATUS_COLORS[entry.name] }}
                      />
                      <span className="text-sm text-slate-700">{entry.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-slate-900">{fmtMoney(entry.value)}</div>
                      <div className="text-xs text-slate-400">
                        {totals.total > 0
                          ? Math.round((entry.value / totals.total) * 100)
                          : 0}
                        %
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-md shadow-sm">
          <CardHeader>
            <CardTitle>Repo Coverage Ratios</CardTitle>
            <CardDescription>Posted vs required collateral — 103% minimum threshold</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={coverageData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="id"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    domain={[80, 130]}
                    unit="%"
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="coverage" radius={[4, 4, 0, 0]}>
                    {coverageData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-5 mt-2 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />≥103% compliant
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />100–103% watch
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />&lt;100% deficit
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Collateral overview + Maturity ladder ── */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 rounded-md shadow-sm">
          <CardHeader>
            <CardTitle>Collateral Overview</CardTitle>
            <CardDescription>
              Haircut-adjusted visibility across the current inventory pool.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Market Value</TableHead>
                  <TableHead>Haircut</TableHead>
                  <TableHead>Adjusted Value</TableHead>
                  <TableHead>Eligibility</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{a.isin}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                    </TableCell>
                    <TableCell>{fmtMoney(a.marketValue, a.currency)}</TableCell>
                    <TableCell>{a.haircut}%</TableCell>
                    <TableCell>{fmtMoney(adjustedValue(a), a.currency)}</TableCell>
                    <TableCell className="text-sm text-slate-600">{a.eligibility}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="rounded-md shadow-sm">
          <CardHeader>
            <CardTitle>Maturity Ladder</CardTitle>
            <CardDescription>Upcoming cash &amp; collateral flows</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {maturityLadder.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-8">No upcoming maturities</div>
            ) : (
              <div className="divide-y">
                {maturityLadder.map((d) => {
                  const daysAway = Math.ceil(
                    (new Date(d.date) - new Date()) / 86400000
                  );
                  return (
                    <div key={d.date} className="px-5 py-3.5 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-bold ${
                              daysAway <= 1 ? "text-red-600" : daysAway <= 3 ? "text-amber-600" : "text-slate-700"
                            }`}
                          >
                            {d.date}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              daysAway <= 1
                                ? "bg-red-100 text-red-600"
                                : daysAway <= 3
                                ? "bg-amber-100 text-amber-600"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {daysAway <= 0 ? "Today" : daysAway === 1 ? "Tomorrow" : `${daysAway}d`}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {d.repos.join(", ")}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <div>
                          <div className="text-slate-400">Cash Due</div>
                          <div className="font-semibold text-slate-700">{fmtMoney(d.cash)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-slate-400">Collateral</div>
                          <div className="font-semibold text-emerald-600">
                            +{fmtMoney(d.collateral)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── EoD summary ── */}
      <EodSummary repos={repos} assets={assets} />

      {/* ── Active repo timeline ── */}
      <Card className="rounded-md shadow-sm">
        <CardHeader>
          <CardTitle>Active Repo Timeline</CardTitle>
          <CardDescription>
            Lifecycle stage, coverage, and maturity at a glance across all open transactions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {repos
              .filter((r) => r.state !== "Closed")
              .map((r) => {
                const coverage = Math.round((r.postedCollateral / r.requiredCollateral) * 100);
                const accentColor =
                  r.buffer < 0
                    ? "#ef4444"
                    : r.state === "Maturing"
                    ? "#f59e0b"
                    : "#10b981";
                const daysLeft = Math.max(
                  0,
                  Math.ceil((new Date(r.maturityDate) - new Date()) / (1000 * 60 * 60 * 24))
                );
                const STAGES   = ["Booked", "Active", "Maturing", "Closed"];
                const stageIdx =
                  r.state === "Active"
                    ? 1
                    : r.state === "Maturing"
                    ? 2
                    : r.state === "Closed"
                    ? 3
                    : 1;

                return (
                  <button
                    key={r.id}
                    onClick={() => openRepo(r.id)}
                    className="rounded border text-left bg-white hover:bg-slate-50 transition-colors overflow-hidden w-full"
                  >
                    <div className="h-1 w-full" style={{ backgroundColor: accentColor }} />
                    <div className="p-4 space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-mono text-xs text-slate-400">{r.id}</div>
                          <div className="font-semibold text-slate-900 mt-0.5">{r.counterparty}</div>
                        </div>
                        <StatusBadge status={r.state} />
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          <div className="text-xs text-slate-400">Notional</div>
                          <div className="text-lg font-bold text-slate-900">
                            {fmtMoney(r.amount, r.currency)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-400">Matures in</div>
                          <div
                            className={`text-2xl font-bold ${
                              daysLeft <= 3 ? "text-red-600" : daysLeft <= 7 ? "text-amber-500" : "text-slate-700"
                            }`}
                          >
                            {daysLeft}d
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-0">
                        {STAGES.map((stage, i) => {
                          const active = i === stageIdx;
                          const past   = i < stageIdx;
                          const isLast = i === STAGES.length - 1;
                          return (
                            <div key={stage} className="flex items-center flex-1 min-w-0">
                              <div className="flex flex-col items-center flex-1 min-w-0">
                                <div
                                  className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? "ring-2 ring-offset-1" : ""}`}
                                  style={{
                                    backgroundColor: active
                                      ? accentColor
                                      : past
                                      ? accentColor + "99"
                                      : "#e2e8f0",
                                  }}
                                />
                                <div
                                  className={`text-[9px] mt-1 truncate w-full text-center ${
                                    active ? "font-semibold text-slate-800" : "text-slate-400"
                                  }`}
                                >
                                  {stage}
                                </div>
                              </div>
                              {!isLast && (
                                <div
                                  className="h-px flex-1 mb-3 mx-0.5"
                                  style={{
                                    backgroundColor: past ? accentColor + "60" : "#e2e8f0",
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-400">Coverage</span>
                          <span className="font-medium" style={{ color: accentColor }}>
                            {coverage}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{
                              width:           `${Math.min(coverage / 1.3, 100)}%`,
                              backgroundColor: accentColor,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
