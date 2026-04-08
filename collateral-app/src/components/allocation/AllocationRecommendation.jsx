// ─── System Recommendation Panel ─────────────────────────────────────────────
// Displays the collateral allocation agent's output within the repo booking flow.
// Receives a fully-computed AllocationResult — does no domain logic of its own.

import { useState } from "react";
import {
  Bot, CheckCircle2, ChevronDown, ChevronUp,
  Info as InfoIcon, Star, ThumbsDown, ThumbsUp,
  TriangleAlert, XCircle,
} from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { fmtMoney } from "@/domain/format";

// ── Micro-components ─────────────────────────────────────────────────────────

function ScoreBar({ value, label }) {
  const pct   = Math.round(value * 100);
  const color =
    pct >= 75 ? "bg-emerald-500" :
    pct >= 45 ? "bg-amber-400"   :
                "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-400 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded overflow-hidden">
        <div className={`h-1.5 rounded ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-slate-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

function CoverageMeter({ posted, required, currency }) {
  const pct   = required > 0 ? Math.min((posted / required) * 100, 130) : 0;
  const color =
    posted >= required ? "bg-emerald-500" :
    pct >= 95          ? "bg-amber-400"   : "bg-red-400";
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
        <span>Coverage</span>
        <span className="font-semibold text-slate-700">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded overflow-hidden">
        <div
          className={`h-2 rounded transition-all ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
        <span>{fmtMoney(posted, currency)}</span>
        <span>Required: {fmtMoney(required, currency)}</span>
      </div>
    </div>
  );
}

// ── Selected position card ────────────────────────────────────────────────────

function SelectedPositionCard({ entry, rank }) {
  const [expanded, setExpanded] = useState(false);
  const pos  = entry.position;
  const pct  = Math.round(entry.score * 100);
  const scoreColor =
    pct >= 75 ? "text-emerald-700 bg-emerald-50 border-emerald-200" :
    pct >= 45 ? "text-amber-700 bg-amber-50 border-amber-200"       :
                "text-red-700 bg-red-50 border-red-200";

  return (
    <div className="rounded border bg-white">
      {/* Header row */}
      <div className="flex items-center gap-3 p-3">
        {/* CTD star */}
        <div className="flex-shrink-0 w-6 text-center">
          {rank === 1
            ? <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 mx-auto" />
            : <span className="text-[10px] text-slate-400">#{rank}</span>}
        </div>

        {/* Asset info */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-900 text-sm truncate">{pos.name}</div>
          <div className="text-[10px] text-slate-400 font-mono">{pos.isin} · {pos.custody}</div>
        </div>

        {/* Adjusted value */}
        <div className="text-right flex-shrink-0">
          <div className="font-semibold text-slate-900 text-sm">{fmtMoney(entry.adjustedValue, pos.currency)}</div>
          <div className="text-[10px] text-slate-400">{pos.haircut}% haircut</div>
        </div>

        {/* Score pill */}
        <div className={`text-[10px] font-bold px-1.5 py-0.5 border rounded flex-shrink-0 ${scoreColor}`}>
          {pct}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-slate-400 hover:text-slate-600 flex-shrink-0"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t bg-slate-50 px-4 py-3 space-y-3">
          {/* Score breakdown */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Score breakdown</div>
            <ScoreBar value={entry.scoreBreakdown.haircutScore}       label="Haircut eff." />
            <ScoreBar value={entry.scoreBreakdown.valueMatchScore}    label="Value match" />
            <ScoreBar value={entry.scoreBreakdown.concentrationScore} label="Diversif." />
          </div>
          {/* Selection reasons */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Why selected</div>
            {entry.selectionReasons.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                <span>{r}</span>
              </div>
            ))}
          </div>
          {/* Contribution bar */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">
              Basket contribution
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-200 rounded overflow-hidden">
                <div
                  className="h-1.5 bg-blue-500 rounded"
                  style={{ width: `${Math.min(entry.contributionPct, 100)}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                {entry.contributionPct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Rejected section ──────────────────────────────────────────────────────────

const REJECT_LABEL = {
  STATUS_NOT_AVAILABLE: "Status",
  CURRENCY_MISMATCH:    "Currency",
  INELIGIBLE:           "Ineligible",
  HAIRCUT_EXCEEDED:     "Haircut",
  ZERO_ADJUSTED_VALUE:  "Value",
  CONCENTRATION_LIMIT:  "Concentration",
};

function RejectedSection({ rejected }) {
  const [open, setOpen] = useState(false);
  if (rejected.length === 0) return null;
  return (
    <div>
      <button
        className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 font-medium w-full text-left py-1"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {rejected.length} position{rejected.length !== 1 ? "s" : ""} excluded
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {rejected.map((entry, i) => (
            <div key={i} className="rounded border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start gap-2">
                <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-700 truncate">{entry.position.name}</div>
                  <div className="text-[10px] font-mono text-slate-400">{entry.position.isin}</div>
                  <div className="mt-1.5 space-y-0.5">
                    {entry.humanReasons.map((r, j) => (
                      <div key={j} className="flex items-start gap-1.5 text-xs text-slate-500">
                        <span className={`mt-0.5 flex-shrink-0 text-[9px] font-semibold uppercase px-1 rounded ${
                          entry.rejectCodes[j] === "STATUS_NOT_AVAILABLE" ? "bg-slate-200 text-slate-600" :
                          entry.rejectCodes[j] === "CURRENCY_MISMATCH"   ? "bg-blue-100 text-blue-700"  :
                          entry.rejectCodes[j] === "INELIGIBLE"          ? "bg-orange-100 text-orange-700" :
                          entry.rejectCodes[j] === "HAIRCUT_EXCEEDED"    ? "bg-amber-100 text-amber-700" :
                          entry.rejectCodes[j] === "CONCENTRATION_LIMIT" ? "bg-purple-100 text-purple-700" :
                                                                           "bg-red-100 text-red-700"
                        }`}>
                          {REJECT_LABEL[entry.rejectCodes[j]] ?? entry.rejectCodes[j]}
                        </span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * @param {object}   result        AllocationResult from the agent
 * @param {boolean}  loading       true while agent is computing
 * @param {function} onApprove     called with selected asset IDs on approval
 * @param {function} onReject      called when user dismisses recommendation
 */
export function AllocationRecommendation({ result, loading, onApprove, onReject }) {
  if (loading) {
    return (
      <div className="rounded border border-blue-200 bg-blue-50 p-6 flex items-center gap-3">
        <Bot className="h-5 w-5 text-blue-500 animate-pulse" />
        <span className="text-sm text-blue-700 font-medium">
          Allocation agent running — scoring candidates…
        </span>
      </div>
    );
  }

  if (!result) return null;

  const currency = result.selected[0]?.position.currency ?? "RON";

  return (
    <div className={`rounded border-2 ${result.feasible ? "border-blue-200" : "border-red-200"} bg-white shadow-sm`}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className={`px-5 py-4 ${result.feasible ? "bg-blue-50" : "bg-red-50"} border-b`}>
        <div className="flex items-center gap-3 flex-wrap">
          <Bot className={`h-5 w-5 flex-shrink-0 ${result.feasible ? "text-blue-600" : "text-red-500"}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-900">System Recommendation</span>
              <span className="text-[10px] font-mono text-slate-400 border border-slate-300 px-1.5 py-0.5 rounded">
                v{result.agentVersion}
              </span>
              <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                result.feasible
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700"
              }`}>
                {result.feasible ? "✓ Feasible" : "✗ Insufficient collateral"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{result.summary}</p>
          </div>
        </div>
      </div>

      {/* ── Metrics strip ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 border-b">
        {[
          { label: "Notional", value: fmtMoney(result.notional, currency) },
          { label: "Required (103%)", value: fmtMoney(result.requiredCollateral, currency) },
          { label: "Posted",   value: fmtMoney(result.postedCollateral, currency), green: result.feasible },
          { label: "Buffer",   value: fmtMoney(result.buffer, currency),
            green: result.buffer >= 0, red: result.buffer < 0 },
        ].map((m) => (
          <div key={m.label} className="px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-400">{m.label}</div>
            <div className={`font-semibold text-sm mt-0.5 ${
              m.green ? "text-emerald-700" : m.red ? "text-red-600" : "text-slate-900"
            }`}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* ── Coverage meter ─────────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b">
        <CoverageMeter
          posted={result.postedCollateral}
          required={result.requiredCollateral}
          currency={currency}
        />
      </div>

      {/* ── Warnings ───────────────────────────────────────────────────────── */}
      {result.warnings.length > 0 && (
        <div className="px-5 py-3 border-b bg-amber-50">
          {result.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-700">
              <TriangleAlert className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Selected positions ─────────────────────────────────────────────── */}
      <div className="px-5 py-4 space-y-2">
        {result.selected.length === 0 ? (
          <div className="text-sm text-slate-400 italic py-4 text-center">
            No positions could be selected with the current constraints
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                Selected basket ({result.selected.length} position{result.selected.length !== 1 ? "s" : ""})
              </span>
              <span className="text-[10px] text-slate-400">
                {new Set(result.selected.map((e) => e.position.isin)).size} ISIN{
                  new Set(result.selected.map((e) => e.position.isin)).size !== 1 ? "s" : ""
                } · expand each for reasoning
              </span>
            </div>
            {result.selected.map((entry, i) => (
              <SelectedPositionCard key={entry.position.id} entry={entry} rank={i + 1} />
            ))}
          </>
        )}
      </div>

      {/* ── Rejected section ───────────────────────────────────────────────── */}
      {result.rejected.length > 0 && (
        <div className="px-5 pb-3 border-t pt-3">
          <RejectedSection rejected={result.rejected} />
        </div>
      )}

      {/* ── Action footer ──────────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between gap-4 px-5 py-4 border-t ${
        result.feasible ? "bg-slate-50" : "bg-red-50"
      }`}>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <InfoIcon className="h-3.5 w-3.5" />
          <span>
            {result.feasible
              ? "Approve to use this basket. You may also choose assets manually."
              : "Collateral shortfall — review rejected positions or add inventory before booking."}
          </span>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="rounded h-8 text-xs"
            onClick={onReject}
          >
            <ThumbsDown className="h-3.5 w-3.5 mr-1.5" />
            Use manual selection
          </Button>
          <Button
            size="sm"
            className={`rounded h-8 text-xs ${
              result.feasible
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-slate-400 cursor-not-allowed"
            }`}
            disabled={!result.feasible}
            onClick={() => onApprove(result.selected.map((e) => e.position.id))}
          >
            <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
            Approve recommendation
          </Button>
        </div>
      </div>
    </div>
  );
}
