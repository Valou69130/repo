// ─── Digital Position Explorer ────────────────────────────────────────────────
//
// CollateralPosition as a first-class product object.
// Every position carries: settlement identity, ownership chain, encumbrance
// state, reconciliation state, lifecycle event history, and ledger metadata.
//
// Architecture:
//  • derivePositions() from domain/positions.ts builds the position graph
//  • useDomain() provides assets + repos + audit from the global store
//  • All agent recommendations and audit events flow through existing infra
//  • No raw asset tables — every object is a stateful, controlled position

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Database,
  FileText,
  Filter,
  GitBranch,
  Info,
  Layers,
  Link2,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  X,
  XCircle,
  Zap,
} from "lucide-react";

import { Badge }         from "@/components/ui/badge";
import { Button }        from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input }         from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator }     from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KpiCard }        from "@/components/shared/KpiCard";

import { useDomain }      from "@/domain/store";
import { derivePositions } from "@/domain/positions";
import { fmtMoney }       from "@/domain/format";

// ── Colour tokens ─────────────────────────────────────────────────────────────

const ENCUMBRANCE_CFG = {
  Free:       { bg: "bg-emerald-100 text-emerald-800 border-emerald-200",  dot: "bg-emerald-500" },
  Reserved:   { bg: "bg-amber-100 text-amber-800 border-amber-200",        dot: "bg-amber-400"   },
  Repo:       { bg: "bg-blue-100 text-blue-800 border-blue-200",           dot: "bg-blue-500"    },
  Pledged:    { bg: "bg-violet-100 text-violet-800 border-violet-200",     dot: "bg-violet-500"  },
  Restricted: { bg: "bg-red-100 text-red-800 border-red-200",              dot: "bg-red-500"     },
};

const RECON_CFG = {
  Matched:   { bg: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  Pending:   { bg: "bg-amber-100 text-amber-800 border-amber-200"       },
  Breaks:    { bg: "bg-red-100 text-red-800 border-red-200"             },
  Unmatched: { bg: "bg-rose-100 text-rose-800 border-rose-200"          },
};

const LEDGER_CFG = {
  "SaFIR":               { bg: "bg-blue-100 text-blue-800 border-blue-200",           icon: "S" },
  "TARGET2-Securities":  { bg: "bg-violet-100 text-violet-800 border-violet-200",     icon: "T" },
  "Euroclear":           { bg: "bg-sky-100 text-sky-800 border-sky-200",              icon: "E" },
  "BVB CSD":             { bg: "bg-orange-100 text-orange-800 border-orange-200",     icon: "B" },
  "Internal":            { bg: "bg-slate-100 text-slate-700 border-slate-200",        icon: "I" },
};

const STATUS_CFG = {
  "Active":             { bg: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  "Pending Settlement": { bg: "bg-amber-100 text-amber-800 border-amber-200"       },
  "Settled":            { bg: "bg-slate-100 text-slate-700 border-slate-200"       },
  "Maturing":           { bg: "bg-orange-100 text-orange-700 border-orange-200"    },
  "Recalled":           { bg: "bg-red-100 text-red-800 border-red-200"             },
  "Failed":             { bg: "bg-red-200 text-red-900 border-red-300"             },
};

const EVENT_CFG = {
  created:      { icon: Layers,      color: "text-slate-500",   border: "border-l-slate-300"   },
  allocated:    { icon: Link2,       color: "text-blue-600",    border: "border-l-blue-400"    },
  settled:      { icon: CheckCircle2,color: "text-emerald-600", border: "border-l-emerald-400" },
  margined:     { icon: AlertTriangle,color:"text-red-500",     border: "border-l-red-400"     },
  substituted:  { icon: RefreshCw,   color: "text-violet-600",  border: "border-l-violet-400"  },
  recalled:     { icon: ArrowRight,  color: "text-orange-600",  border: "border-l-orange-400"  },
  recon_update: { icon: Activity,    color: "text-amber-600",   border: "border-l-amber-400"   },
  valuation:    { icon: Zap,         color: "text-sky-600",     border: "border-l-sky-400"     },
  state_change: { icon: GitBranch,   color: "text-indigo-500",  border: "border-l-indigo-300"  },
  instruction:  { icon: Server,      color: "text-teal-600",    border: "border-l-teal-400"    },
};

const ENCUMBRANCE_FLOW = ["Free", "Reserved", "Repo", "Pledged", "Restricted"];

// ── Atomic badge components ────────────────────────────────────────────────────

function EncumbranceBadge({ state }) {
  const cfg = ENCUMBRANCE_CFG[state] ?? { bg: "bg-slate-100 text-slate-700 border-slate-200" };
  return (
    <Badge variant="outline" className={`gap-1.5 ${cfg.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${cfg.dot ?? "bg-slate-400"}`} />
      {state}
    </Badge>
  );
}

function ReconBadge({ state }) {
  const cfg = RECON_CFG[state] ?? { bg: "bg-slate-100 text-slate-700 border-slate-200" };
  const icon = state === "Breaks" || state === "Unmatched"
    ? <XCircle className="w-3 h-3" />
    : state === "Pending" ? <Clock className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />;
  return (
    <Badge variant="outline" className={`gap-1 ${cfg.bg}`}>
      {icon}
      {state}
    </Badge>
  );
}

function LedgerBadge({ type }) {
  const cfg = LEDGER_CFG[type] ?? LEDGER_CFG["Internal"];
  return (
    <Badge variant="outline" className={`font-mono text-[11px] gap-1 ${cfg.bg}`}>
      <span className="font-bold">{cfg.icon}</span>
      {type}
    </Badge>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] ?? { bg: "bg-slate-100 text-slate-700" };
  return <Badge variant="outline" className={cfg.bg}>{status}</Badge>;
}

// ── Lifecycle state bar ────────────────────────────────────────────────────────

function EncumbranceBar({ state }) {
  const idx = ENCUMBRANCE_FLOW.indexOf(state);
  return (
    <div className="flex items-center gap-0">
      {ENCUMBRANCE_FLOW.map((s, i) => {
        const active = s === state;
        const past   = i < idx;
        const isLast = i === ENCUMBRANCE_FLOW.length - 1;
        const dot    = ENCUMBRANCE_CFG[s]?.dot ?? "bg-slate-400";
        return (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-sm border-2 transition-colors ${
                active ? `border-transparent ${dot}` :
                past   ? "border-slate-200 bg-slate-200" :
                         "border-slate-100 bg-white"
              }`} />
              <div className={`text-[9px] mt-0.5 whitespace-nowrap leading-tight ${
                active ? "font-bold text-slate-800" : "text-slate-300"
              }`}>
                {s}
              </div>
            </div>
            {!isLast && (
              <div className={`h-px w-5 mb-3.5 ${i < idx ? "bg-slate-200" : "bg-slate-100"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Lifecycle timeline (vertical) ─────────────────────────────────────────────

function LifecycleTimeline({ entries, currentState }) {
  return (
    <div className="space-y-0">
      {entries.map((entry, i) => {
        const isLast    = i === entries.length - 1;
        const isCurrent = entry.state === currentState ||
          (isLast && !entries.some(e => e.state === currentState));
        return (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 border-2 ${
                isCurrent
                  ? "bg-blue-500 border-blue-500"
                  : "bg-white border-slate-300"
              }`} />
              {!isLast && <div className="w-px flex-1 bg-slate-200 mt-0.5 mb-0.5 min-h-[20px]" />}
            </div>
            <div className="pb-4 min-w-0">
              <div className={`text-sm font-medium ${isCurrent ? "text-blue-700" : "text-slate-700"}`}>
                {entry.state}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] font-mono text-slate-400">{entry.ts}</span>
                <span className="text-[11px] text-slate-500">{entry.actor}</span>
              </div>
              {entry.note && (
                <div className="text-[11px] text-slate-400 mt-0.5 italic">{entry.note}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Event log ─────────────────────────────────────────────────────────────────

function EventLog({ events }) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-slate-400">
        No events recorded for this position.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {events.map((ev) => {
        const cfg = EVENT_CFG[ev.type] ?? EVENT_CFG.state_change;
        const Icon = cfg.icon;
        return (
          <div key={ev.id} className={`border-l-2 pl-3 py-2 rounded-r bg-slate-50 border ${cfg.border}`}>
            <div className="flex items-start gap-2">
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${cfg.color}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-800">{ev.description}</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                  <span className="font-mono text-[10px] text-slate-400">{ev.ts}</span>
                  <span className="text-[10px] text-slate-500">{ev.actor}</span>
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 rounded">{ev.system}</span>
                </div>
                {(ev.prev || ev.next) && (
                  <div className="flex items-center gap-1.5 mt-1">
                    {ev.prev && <span className="text-[10px] font-mono bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{ev.prev}</span>}
                    {ev.prev && ev.next && <ArrowRight className="w-3 h-3 text-slate-400" />}
                    {ev.next && <span className="text-[10px] font-mono bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{ev.next}</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Metadata field ─────────────────────────────────────────────────────────────

function Field({ label, value, mono = false, className = "" }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">{label}</div>
      <div className={`text-sm text-slate-800 ${mono ? "font-mono" : "font-medium"} ${className}`}>
        {value ?? <span className="text-slate-300">—</span>}
      </div>
    </div>
  );
}

// ── Detail sheet tabs ─────────────────────────────────────────────────────────

function OverviewTab({ pos }) {
  return (
    <div className="space-y-6">
      {/* Encumbrance state */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Encumbrance State</div>
        <EncumbranceBar state={pos.encumbranceState} />
      </div>

      <Separator />

      {/* Core identity */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-3">Position Identity</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Position ID"    value={pos.id}      mono />
          <Field label="Asset ID"       value={pos.assetId} mono />
          <Field label="ISIN"           value={pos.isin}    mono />
          <Field label="Instrument Type" value={pos.type} />
          <Field label="Currency"       value={pos.currency} mono />
          <Field label="Custody"        value={pos.custody} />
        </div>
      </div>

      <Separator />

      {/* Valuation */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-3">Valuation</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Market Value"        value={fmtMoney(pos.marketValue, pos.currency)} />
          <Field label="Haircut-Adj. Value"  value={fmtMoney(pos.haircutAdjValue, pos.currency)} />
          <Field label="Haircut"             value={`${pos.haircutPct}%`} />
          <Field label="Nominal / Qty"       value={fmtMoney(pos.quantity, pos.currency)} />
        </div>
      </div>

      <Separator />

      {/* Ownership */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-3">Ownership &amp; Control</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Legal Owner"   value={pos.legalOwner} />
          <Field label="Controller"    value={pos.controller} />
          <Field label="Linked Repo"   value={pos.linkedRepoId ?? "—"} mono />
          <Field label="Last Update"   value={pos.lastUpdate}  mono />
        </div>
      </div>

      <Separator />

      {/* Status summary */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-3">State Summary</div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded border bg-slate-50 p-3">
            <div className="text-[10px] text-slate-400 mb-1">Position Status</div>
            <StatusBadge status={pos.positionStatus} />
          </div>
          <div className="rounded border bg-slate-50 p-3">
            <div className="text-[10px] text-slate-400 mb-1">Encumbrance</div>
            <EncumbranceBadge state={pos.encumbranceState} />
          </div>
          <div className="rounded border bg-slate-50 p-3">
            <div className="text-[10px] text-slate-400 mb-1">Reconciliation</div>
            <ReconBadge state={pos.reconciliationState} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LifecycleTab({ pos }) {
  const currentState = pos.lifecycleHistory.at(-1)?.state ?? "";
  return (
    <div className="space-y-5">
      <div className="rounded border bg-slate-50 p-3">
        <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Current State</div>
        <div className="font-semibold text-slate-800 text-sm">{currentState}</div>
        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{pos.lastUpdate}</div>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-3">Lifecycle History</div>
        <LifecycleTimeline entries={pos.lifecycleHistory} currentState={currentState} />
      </div>
      <Separator />
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Eligibility</div>
        <div className="text-sm text-slate-700">{pos.eligibility}</div>
        <div className={`mt-1 text-xs font-medium ${pos.eligibility.includes("Eligible") ? "text-emerald-600" : "text-red-500"}`}>
          {pos.eligibility.includes("Eligible") ? "✓ Eligible for mobilisation" : "✗ Mobilisation restricted"}
        </div>
      </div>
    </div>
  );
}

function EventsTab({ pos }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {pos.events.length} event{pos.events.length !== 1 ? "s" : ""} recorded
        </div>
      </div>
      <EventLog events={pos.events} />
    </div>
  );
}

function AuditTab({ pos, audit }) {
  const posAudit = useMemo(() =>
    audit.filter(e =>
      e.object === pos.assetId ||
      (pos.linkedRepoId && e.object === pos.linkedRepoId) ||
      e.comment?.includes(pos.assetId) ||
      (pos.linkedRepoId && e.comment?.includes(pos.linkedRepoId))
    ),
    [audit, pos]
  );

  if (posAudit.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-24 text-sm text-slate-400 gap-2">
        <ClipboardList className="w-5 h-5 text-slate-300" />
        No audit entries for this position.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {posAudit.map((entry, i) => (
        <div key={i} className="rounded border bg-slate-50 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium text-sm text-slate-800 capitalize">{entry.action}</div>
            <span className="font-mono text-[10px] text-slate-400 flex-shrink-0">{entry.ts}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-500">{entry.user}</span>
            <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 rounded">{entry.role}</span>
          </div>
          {entry.comment && <div className="text-xs text-slate-400 mt-1 italic">{entry.comment}</div>}
          {(entry.prev || entry.next) && (
            <div className="flex items-center gap-1.5 mt-1.5">
              {entry.prev && <span className="text-[10px] font-mono bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{entry.prev}</span>}
              {entry.prev && entry.next && <ArrowRight className="w-3 h-3 text-slate-400" />}
              {entry.next && <span className="text-[10px] font-mono bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{entry.next}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LinkedRepoTab({ pos, repos }) {
  const repo = repos.find(r => r.id === pos.linkedRepoId);

  if (!pos.linkedRepoId || !repo) {
    return (
      <div className="flex flex-col items-center justify-center h-24 text-sm text-slate-400 gap-2">
        <Link2 className="w-5 h-5 text-slate-300" />
        No active repo linkage for this position.
      </div>
    );
  }

  const utilisation = repo.postedCollateral / repo.requiredCollateral;
  const bufferPct   = (repo.buffer / repo.requiredCollateral) * 100;
  const isDeficit   = repo.buffer < 0;

  return (
    <div className="space-y-4">
      <div className={`rounded border p-3 ${isDeficit ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-900">{repo.id}</div>
            <div className="text-xs text-slate-500">{repo.counterparty}</div>
          </div>
          <Badge variant="outline" className={isDeficit ? "bg-red-100 text-red-800 border-red-200" : "bg-emerald-100 text-emerald-800 border-emerald-200"}>
            {repo.state}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Repo Amount"          value={fmtMoney(repo.amount, repo.currency)} />
        <Field label="Rate"                 value={`${repo.rate}%`} />
        <Field label="Start Date"           value={repo.startDate}    mono />
        <Field label="Maturity Date"        value={repo.maturityDate} mono />
        <Field label="Required Collateral"  value={fmtMoney(repo.requiredCollateral, repo.currency)} />
        <Field label="Posted Collateral"    value={fmtMoney(repo.postedCollateral,   repo.currency)} />
        <Field label="Buffer"               value={fmtMoney(repo.buffer, repo.currency)}
               className={isDeficit ? "text-red-600 font-semibold" : "text-emerald-700"} />
        <Field label="Settlement"           value={repo.settlement} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Collateral Utilisation</span>
          <span className={`text-xs font-semibold ${isDeficit ? "text-red-600" : utilisation > 1.0 ? "text-emerald-600" : "text-amber-600"}`}>
            {(utilisation * 100).toFixed(1)}%
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded h-2">
          <div
            className={`h-2 rounded ${isDeficit ? "bg-red-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(100, utilisation * 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[10px] text-slate-400">0%</span>
          <span className={`text-[10px] font-semibold ${isDeficit ? "text-red-500" : "text-slate-400"}`}>
            Buffer: {bufferPct.toFixed(1)}%
          </span>
          <span className="text-[10px] text-slate-400">100%</span>
        </div>
      </div>

      {repo.notes && (
        <div className="rounded border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Notes</div>
          <div className="text-xs text-slate-600 italic">{repo.notes}</div>
        </div>
      )}
    </div>
  );
}

function LedgerTab({ pos }) {
  const m = pos.ledgerMetadata;
  return (
    <div className="space-y-5">
      <div className="rounded border bg-slate-50 p-3 flex items-center gap-3">
        <Server className="w-5 h-5 text-slate-500 flex-shrink-0" />
        <div>
          <div className="font-semibold text-slate-800">{m.system}</div>
          <div className="text-xs text-slate-500">{m.messagingProtocol}</div>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-3">Account Details</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Account ID"           value={m.accountId}          mono />
          <Field label="Safekeeping Account"  value={m.safekeepingAccount} mono />
          <Field label="Custodian BIC"        value={m.custodianBIC}       mono />
          <Field label="Counterparty BIC"     value={m.counterpartyBIC}    mono />
        </div>
      </div>

      <Separator />

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-3">Settlement Instruction</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Instruction Ref"  value={m.instructionRef}  mono />
          <Field label="Messaging"        value={m.messagingProtocol} />
          <Field label="Settlement Date"  value={m.settlementDate}  mono />
          <Field label="Value Date"       value={m.valueDate}       mono />
          <Field label="Nominal Value"    value={fmtMoney(m.nominalValue, pos.currency)} />
          <Field label="Quantity (Face)"  value={fmtMoney(m.quantity, pos.currency)} />
        </div>
      </div>

      <Separator />

      <div className="rounded border border-blue-100 bg-blue-50 p-3">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700">
            Position reconciled against <strong>{m.system}</strong> intraday feed.
            Last sync: <span className="font-mono">{pos.lastUpdate}</span>.
            Protocol: <strong>{m.messagingProtocol}</strong>.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Position detail sheet ─────────────────────────────────────────────────────

function PositionDetailSheet({ pos, repos, audit, open, onClose }) {
  if (!pos) return null;

  const tabItems = [
    { key: "overview",  label: "Overview",     icon: Layers      },
    { key: "lifecycle", label: "Lifecycle",    icon: GitBranch   },
    { key: "events",    label: "Events",       icon: Activity    },
    { key: "audit",     label: "Audit Trail",  icon: FileText    },
    { key: "repo",      label: "Linked Repo",  icon: Link2       },
    { key: "ledger",    label: "Ledger",       icon: Database    },
  ];

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-[720px] overflow-y-auto flex flex-col gap-0 p-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b bg-slate-50 flex-shrink-0">
          <SheetHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <SheetTitle className="text-base">{pos.name}</SheetTitle>
                  <StatusBadge status={pos.positionStatus} />
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <SheetDescription className="font-mono text-[11px]">{pos.id}</SheetDescription>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono text-[11px] text-slate-500">{pos.isin}</span>
                  <span className="text-slate-300">·</span>
                  <LedgerBadge type={pos.ledgerType} />
                </div>
              </div>
            </div>

            {/* Quick state strip */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <EncumbranceBadge state={pos.encumbranceState} />
              <ReconBadge state={pos.reconciliationState} />
              {pos.linkedRepoId && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-mono text-[11px] gap-1">
                  <Link2 className="w-3 h-3" /> {pos.linkedRepoId}
                </Badge>
              )}
            </div>
          </SheetHeader>

          {/* Value strip */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="rounded border bg-white p-2.5">
              <div className="text-[9px] uppercase tracking-wide text-slate-400">Market Value</div>
              <div className="font-semibold text-slate-900 text-sm mt-0.5">{fmtMoney(pos.marketValue, pos.currency)}</div>
            </div>
            <div className="rounded border bg-white p-2.5">
              <div className="text-[9px] uppercase tracking-wide text-slate-400">Haircut Adj.</div>
              <div className="font-semibold text-slate-900 text-sm mt-0.5">{fmtMoney(pos.haircutAdjValue, pos.currency)}</div>
              <div className="text-[9px] text-slate-400">{pos.haircutPct}% haircut</div>
            </div>
            <div className="rounded border bg-white p-2.5">
              <div className="text-[9px] uppercase tracking-wide text-slate-400">Events</div>
              <div className="font-semibold text-slate-900 text-sm mt-0.5">{pos.events.length}</div>
              <div className="text-[9px] text-slate-400">lifecycle events</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="overview" className="flex flex-col h-full">
            <div className="px-6 pt-3 border-b flex-shrink-0">
              <TabsList className="w-full justify-start gap-1 h-auto bg-transparent p-0 rounded-none border-0">
                {tabItems.map(({ key, label, icon: Icon }) => (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:text-blue-700 data-[state=active]:shadow-none text-xs px-3 pb-2"
                  >
                    <Icon className="w-3 h-3 mr-1" />
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="px-6 py-5 flex-1 overflow-y-auto">
              <TabsContent value="overview">  <OverviewTab pos={pos} /></TabsContent>
              <TabsContent value="lifecycle"> <LifecycleTab pos={pos} /></TabsContent>
              <TabsContent value="events">    <EventsTab pos={pos} /></TabsContent>
              <TabsContent value="audit">     <AuditTab pos={pos} audit={audit} /></TabsContent>
              <TabsContent value="repo">      <LinkedRepoTab pos={pos} repos={repos} /></TabsContent>
              <TabsContent value="ledger">    <LedgerTab pos={pos} /></TabsContent>
            </div>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function DigitalPositions({ assets: propAssets, audit: propAudit }) {
  const domain = useDomain();

  // Prefer store data; fall back to props for backwards compat
  const assets = useMemo(
    () => (domain.assets.length ? domain.assets : (propAssets ?? [])),
    [domain.assets, propAssets],
  );
  const repos = useMemo(
    () => (domain.repos.length ? domain.repos : []),
    [domain.repos],
  );
  const audit = useMemo(
    () => (domain.audit.length ? domain.audit : (propAudit ?? [])),
    [domain.audit, propAudit],
  );

  const positions = useMemo(
    () => derivePositions(assets, repos, audit),
    [assets, repos, audit]
  );

  // ── Filter state ───────────────────────────────────────────────────────────
  const [search,      setSearch]      = useState("");
  const [encFilter,   setEncFilter]   = useState("all");
  const [ledgerFilter,setLedgerFilter]= useState("all");
  const [repoFilter,  setRepoFilter]  = useState("all"); // all | linked | unlinked
  const [reconFilter, setReconFilter] = useState("all");
  const [custodyFilter,setCustodyFilter]=useState("all");
  const [selectedPos, setSelectedPos] = useState(null);

  const custodyOptions = useMemo(() =>
    [...new Set(positions.map(p => p.custody))].sort(),
    [positions]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return positions.filter(p => {
      const text = [p.id, p.assetId, p.isin, p.name, p.type, p.linkedRepoId ?? ""].join(" ").toLowerCase();
      if (q && !text.includes(q)) return false;
      if (encFilter    !== "all" && p.encumbranceState    !== encFilter)  return false;
      if (ledgerFilter !== "all" && p.ledgerType          !== ledgerFilter) return false;
      if (repoFilter   === "linked"   && !p.linkedRepoId) return false;
      if (repoFilter   === "unlinked" && p.linkedRepoId)  return false;
      if (reconFilter  !== "all" && p.reconciliationState !== reconFilter) return false;
      if (custodyFilter !== "all" && p.custody !== custodyFilter)          return false;
      return true;
    });
  }, [positions, search, encFilter, ledgerFilter, repoFilter, reconFilter, custodyFilter]);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const free      = positions.filter(p => p.encumbranceState === "Free");
    const encumbered= positions.filter(p => ["Repo","Pledged"].includes(p.encumbranceState));
    const breaks    = positions.filter(p => ["Breaks","Unmatched"].includes(p.reconciliationState));
    const freePool  = free.reduce((s, p) => s + p.haircutAdjValue, 0);
    const repoPool  = encumbered.reduce((s, p) => s + p.haircutAdjValue, 0);
    return { total: positions.length, free: free.length, encumbered: encumbered.length, breaks: breaks.length, freePool, repoPool };
  }, [positions]);

  const activeFilterCount = [
    encFilter !== "all", ledgerFilter !== "all", repoFilter !== "all",
    reconFilter !== "all", custodyFilter !== "all",
  ].filter(Boolean).length;

  function clearFilters() {
    setSearch(""); setEncFilter("all"); setLedgerFilter("all");
    setRepoFilter("all"); setReconFilter("all"); setCustodyFilter("all");
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-slate-600" />
          <h1 className="text-2xl font-semibold tracking-tight">Digital Position Explorer</h1>
        </div>
        <p className="mt-1 text-slate-500 text-sm max-w-2xl">
          CollateralPosition as a first-class operational object — settlement identity, ownership chain,
          encumbrance lifecycle, reconciliation state, and source ledger metadata per position.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          title="Total Positions"
          value={String(kpis.total)}
          description={`${kpis.free} free · ${kpis.encumbered} encumbered`}
          icon={Layers}
        />
        <KpiCard
          title="Free Pool (Adj.)"
          value={fmtMoney(kpis.freePool)}
          description="Haircut-adjusted mobilisable value"
          icon={ShieldCheck}
          trendUp={kpis.free > 0}
        />
        <KpiCard
          title="Encumbered Pool"
          value={fmtMoney(kpis.repoPool)}
          description="Repo + pledged positions"
          icon={Link2}
        />
        <KpiCard
          title="Recon Breaks"
          value={String(kpis.breaks)}
          description="Positions with reconciliation issues"
          icon={AlertTriangle}
          alert={kpis.breaks > 0}
        />
      </div>

      {/* Position registry */}
      <Card className="rounded-md shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-4 h-4 text-slate-500" />
                Position Registry
              </CardTitle>
              <CardDescription className="mt-1">
                {filtered.length} of {positions.length} positions
                {activeFilterCount > 0 && (
                  <span className="ml-2 text-blue-600 font-medium">{activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active</span>
                )}
              </CardDescription>
            </div>
            {activeFilterCount > 0 && (
              <Button variant="outline" size="sm" className="rounded gap-1.5 text-xs" onClick={clearFilters}>
                <X className="w-3 h-3" /> Clear filters
              </Button>
            )}
          </div>

          {/* Filter bar */}
          <div className="flex gap-2 flex-wrap mt-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search position ID, ISIN, name…"
                className="pl-8 h-9 rounded-md text-sm"
              />
            </div>

            <Select value={encFilter} onValueChange={setEncFilter}>
              <SelectTrigger className="w-[160px] h-9 rounded-md text-sm">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                <SelectValue placeholder="Encumbrance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All encumbrance</SelectItem>
                {["Free","Reserved","Repo","Pledged","Restricted"].map(s =>
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                )}
              </SelectContent>
            </Select>

            <Select value={ledgerFilter} onValueChange={setLedgerFilter}>
              <SelectTrigger className="w-[170px] h-9 rounded-md text-sm">
                <Server className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                <SelectValue placeholder="Ledger type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ledgers</SelectItem>
                {["SaFIR","TARGET2-Securities","Euroclear","BVB CSD","Internal"].map(s =>
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                )}
              </SelectContent>
            </Select>

            <Select value={repoFilter} onValueChange={setRepoFilter}>
              <SelectTrigger className="w-[150px] h-9 rounded-md text-sm">
                <Link2 className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                <SelectValue placeholder="Repo linkage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All linkage</SelectItem>
                <SelectItem value="linked">Repo-linked</SelectItem>
                <SelectItem value="unlinked">Unlinked</SelectItem>
              </SelectContent>
            </Select>

            <Select value={reconFilter} onValueChange={setReconFilter}>
              <SelectTrigger className="w-[145px] h-9 rounded-md text-sm">
                <Activity className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                <SelectValue placeholder="Recon state" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All recon states</SelectItem>
                {["Matched","Pending","Breaks","Unmatched"].map(s =>
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                )}
              </SelectContent>
            </Select>

            {custodyOptions.length > 1 && (
              <Select value={custodyFilter} onValueChange={setCustodyFilter}>
                <SelectTrigger className="w-[175px] h-9 rounded-md text-sm">
                  <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                  <SelectValue placeholder="Custody" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All custody</SelectItem>
                  {custodyOptions.map(c =>
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-sm text-slate-400 gap-2">
              <Search className="w-5 h-5 text-slate-300" />
              No positions match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 border-b">
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 w-[90px]">Position</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Asset / ISIN</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 text-right">Market Value</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 text-right">Haircut Adj.</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Legal Owner</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Encumbrance</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Linked Repo</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Ledger</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Recon</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Last Update</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(pos => (
                    <TableRow
                      key={pos.id}
                      className="cursor-pointer hover:bg-slate-50 transition-colors group"
                      onClick={() => setSelectedPos(pos)}
                    >
                      {/* Position ID + status */}
                      <TableCell>
                        <div className="font-mono text-xs text-slate-700 font-semibold">{pos.id}</div>
                        <div className="mt-0.5"><StatusBadge status={pos.positionStatus} /></div>
                      </TableCell>

                      {/* Asset name + ISIN + type */}
                      <TableCell>
                        <div className="font-medium text-sm text-slate-900 leading-snug">{pos.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] text-slate-400">{pos.isin}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1 rounded">{pos.type}</span>
                        </div>
                      </TableCell>

                      {/* Market value */}
                      <TableCell className="text-right">
                        <div className="font-semibold text-sm text-slate-900">
                          {fmtMoney(pos.marketValue, pos.currency)}
                        </div>
                        <div className="text-[10px] text-slate-400">{pos.currency}</div>
                      </TableCell>

                      {/* Haircut adjusted */}
                      <TableCell className="text-right">
                        <div className="font-semibold text-sm text-slate-900">
                          {fmtMoney(pos.haircutAdjValue, pos.currency)}
                        </div>
                        <div className={`text-[10px] font-medium ${
                          pos.haircutPct <= 3 ? "text-emerald-600" :
                          pos.haircutPct <= 6 ? "text-amber-600"   : "text-red-500"
                        }`}>
                          {pos.haircutPct}% haircut
                        </div>
                      </TableCell>

                      {/* Legal owner */}
                      <TableCell>
                        <div className="text-xs font-medium text-slate-700 leading-snug">{pos.legalOwner}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[130px]">{pos.controller}</div>
                      </TableCell>

                      {/* Encumbrance */}
                      <TableCell>
                        <EncumbranceBadge state={pos.encumbranceState} />
                      </TableCell>

                      {/* Linked repo */}
                      <TableCell>
                        {pos.linkedRepoId ? (
                          <Badge variant="outline" className="font-mono text-[11px] bg-blue-50 text-blue-700 border-blue-200 gap-1">
                            <Link2 className="w-2.5 h-2.5" />
                            {pos.linkedRepoId}
                          </Badge>
                        ) : (
                          <span className="text-slate-300 text-sm">—</span>
                        )}
                      </TableCell>

                      {/* Ledger */}
                      <TableCell>
                        <LedgerBadge type={pos.ledgerType} />
                      </TableCell>

                      {/* Recon */}
                      <TableCell>
                        <ReconBadge state={pos.reconciliationState} />
                      </TableCell>

                      {/* Last update */}
                      <TableCell>
                        <div className="font-mono text-[10px] text-slate-500">{pos.lastUpdate}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{pos.events.length} events</div>
                      </TableCell>

                      {/* Chevron */}
                      <TableCell>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail sheet */}
      <PositionDetailSheet
        pos={selectedPos}
        repos={repos}
        audit={audit}
        open={!!selectedPos}
        onClose={() => setSelectedPos(null)}
      />
    </div>
  );
}
