// ─── IntegrationContext ────────────────────────────────────────────────────────
//
// Compact display of integration and settlement context for repos and assets.
// Shows source system, ledger, settlement state, reconciliation state,
// custody location, last sync timestamp, and external reference.
//
// Variants:
//   <IntegrationContextBar>  — horizontal strip for action cards and table rows
//   <IntegrationContextPanel> — vertical card section for detail views
//
// Usage:
//   <IntegrationContextBar integration={repo.integration} />
//   <IntegrationContextPanel integration={repo.integration} />

import { CheckCircle2, Clock, AlertTriangle, XCircle, RefreshCw } from "lucide-react";

// ─── Settlement state config ──────────────────────────────────────────────────

const SETTLEMENT_CFG = {
  confirmed: {
    label: "Confirmed",
    color: "text-emerald-700",
    bg:    "bg-emerald-50 border-emerald-200",
    icon:  CheckCircle2,
  },
  pending_confirmation: {
    label: "Pending confirmation",
    color: "text-amber-700",
    bg:    "bg-amber-50 border-amber-200",
    icon:  Clock,
  },
  pending_settlement: {
    label: "Pending settlement",
    color: "text-blue-700",
    bg:    "bg-blue-50 border-blue-200",
    icon:  RefreshCw,
  },
  failed: {
    label: "Failed",
    color: "text-red-700",
    bg:    "bg-red-50 border-red-200",
    icon:  XCircle,
  },
};

// ─── Reconciliation state config ──────────────────────────────────────────────

const RECON_CFG = {
  matched: {
    label: "Matched",
    color: "text-emerald-700",
    bg:    "bg-emerald-50 border-emerald-200",
    icon:  CheckCircle2,
  },
  pending: {
    label: "Recon pending",
    color: "text-amber-700",
    bg:    "bg-amber-50 border-amber-200",
    icon:  Clock,
  },
  unmatched: {
    label: "Unmatched",
    color: "text-rose-700",
    bg:    "bg-rose-50 border-rose-200",
    icon:  AlertTriangle,
  },
  break_detected: {
    label: "Break detected",
    color: "text-red-700",
    bg:    "bg-red-50 border-red-200",
    icon:  XCircle,
  },
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function SettlementBadge({ state }) {
  const cfg = SETTLEMENT_CFG[state] ?? SETTLEMENT_CFG.pending_confirmation;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[9.5px] font-semibold px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.color}`}>
      <Icon className="h-2.5 w-2.5 flex-shrink-0" />
      {cfg.label}
    </span>
  );
}

function ReconBadge({ state }) {
  const cfg = RECON_CFG[state] ?? RECON_CFG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[9.5px] font-semibold px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.color}`}>
      <Icon className="h-2.5 w-2.5 flex-shrink-0" />
      {cfg.label}
    </span>
  );
}

function fmtSync(isoTs) {
  try {
    return new Date(isoTs).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return isoTs;
  }
}

function InlineField({ label, value, mono = false }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[8.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`text-[10.5px] text-slate-600 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// ─── IntegrationContextBar ────────────────────────────────────────────────────
// Horizontal compact strip — for action cards, table footers, collateral rows.

export function IntegrationContextBar({ integration, className = "" }) {
  if (!integration) return null;

  return (
    <div className={`rounded border border-slate-200 bg-slate-50/80 px-3 py-2 ${className}`}>
      <div className="text-[8px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
        Integration Context
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <InlineField label="Source"  value={integration.sourceSystem} />
        <span className="text-slate-200 text-[10px] hidden sm:block">·</span>
        <InlineField label="Ledger"  value={integration.sourceLedger} />
        <span className="text-slate-200 text-[10px] hidden sm:block">·</span>
        <InlineField label="Custody" value={integration.custodyLocation} />
        <span className="text-slate-200 text-[10px] hidden sm:block">·</span>
        <SettlementBadge state={integration.settlementState} />
        <ReconBadge      state={integration.reconState} />
        <span className="text-slate-200 text-[10px] hidden sm:block">·</span>
        <InlineField label="Synced" value={fmtSync(integration.lastSyncTs)} mono />
        {integration.safirRef && (
          <>
            <span className="text-slate-200 text-[10px] hidden sm:block">·</span>
            <InlineField label="SaFIR ref" value={integration.safirRef} mono />
          </>
        )}
      </div>
    </div>
  );
}

// ─── IntegrationContextPanel ──────────────────────────────────────────────────
// Vertical panel — for detail sheets and repo/asset detail pages.

function PanelRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 flex-shrink-0 w-36">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

export function IntegrationContextPanel({ integration, className = "" }) {
  if (!integration) return null;

  return (
    <div className={`rounded-md border border-slate-200 bg-slate-50 px-4 py-3 ${className}`}>
      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">
        Integration &amp; Settlement Context
      </div>
      <PanelRow label="Source system">
        <span className="text-xs font-medium text-slate-800">{integration.sourceSystem}</span>
      </PanelRow>
      <PanelRow label="Source ledger">
        <span className="text-xs text-slate-700">{integration.sourceLedger}</span>
      </PanelRow>
      <PanelRow label="Custody location">
        <span className="text-xs font-medium text-slate-800">{integration.custodyLocation}</span>
      </PanelRow>
      <PanelRow label="Settlement state">
        <SettlementBadge state={integration.settlementState} />
      </PanelRow>
      <PanelRow label="Reconciliation state">
        <ReconBadge state={integration.reconState} />
      </PanelRow>
      <PanelRow label="Last sync">
        <span className="text-xs font-mono text-slate-600">{integration.lastSyncTs}</span>
      </PanelRow>
      {integration.safirRef && (
        <PanelRow label="SaFIR reference">
          <span className="text-xs font-mono text-slate-600">{integration.safirRef}</span>
        </PanelRow>
      )}
      {integration.externalRef && (
        <PanelRow label="External reference">
          <span className="text-xs font-mono text-slate-500">{integration.externalRef}</span>
        </PanelRow>
      )}
    </div>
  );
}
