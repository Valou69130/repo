// ─── Shared Workflow State Components ─────────────────────────────────────────
//
// WorkflowStateBadge  — compact pill badge for a single state
// WorkflowStateBar    — horizontal stepper showing the full lifecycle
//
// Supports the 7-state recommendation workflow:
//   detected → proposed → under_review → approved → executed
//                                                 ↘ failed | dismissed

import { CheckCircle2, CircleDot, Clock3, ThumbsUp, Zap, XCircle, MinusCircle } from "lucide-react";

// ─── Config ───────────────────────────────────────────────────────────────────

export const WF_STATES = [
  { key: "detected",     label: "Detected",     shortLabel: "Detected",    icon: CircleDot,    color: "text-slate-600",   bg: "bg-slate-100",    ring: "border-slate-400" },
  { key: "proposed",     label: "Proposed",     shortLabel: "Proposed",    icon: Zap,          color: "text-violet-600",  bg: "bg-violet-100",   ring: "border-violet-500" },
  { key: "under_review", label: "Under Review", shortLabel: "In Review",   icon: Clock3,       color: "text-amber-600",   bg: "bg-amber-100",    ring: "border-amber-500" },
  { key: "approved",     label: "Approved",     shortLabel: "Approved",    icon: ThumbsUp,     color: "text-blue-600",    bg: "bg-blue-100",     ring: "border-blue-500" },
  { key: "executed",     label: "Executed",     shortLabel: "Executed",    icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-100",  ring: "border-emerald-500" },
];

const WF_TERMINAL = {
  failed:    { key: "failed",    label: "Failed",    icon: XCircle,    color: "text-red-600",    bg: "bg-red-100",    ring: "border-red-500" },
  dismissed: { key: "dismissed", label: "Dismissed", icon: MinusCircle,color: "text-slate-400",  bg: "bg-slate-100",  ring: "border-slate-300" },
};

export function wfStateConfig(state) {
  return WF_STATES.find((s) => s.key === state) ?? WF_TERMINAL[state] ?? WF_STATES[0];
}

// ─── WorkflowStateBadge ───────────────────────────────────────────────────────
// Compact pill — use inline next to severity badges or in table cells.

export function WorkflowStateBadge({ state, size = "sm" }) {
  const cfg = wfStateConfig(state);
  const Icon = cfg.icon;
  const textCls = size === "xs" ? "text-[10px]" : "text-xs";
  const iconCls = size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3";
  return (
    <span className={`inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.ring} ${textCls}`}>
      <Icon className={`${iconCls} flex-shrink-0`} />
      {cfg.label}
    </span>
  );
}

// ─── WorkflowStateBar ─────────────────────────────────────────────────────────
// Horizontal stepper that shows all 5 main states; failed/dismissed treated
// as a terminal override on the current step.
//
// Props:
//   state      — current WorkflowState
//   detectedAt — ISO string for detected timestamp
//   updatedAt  — ISO string for last state change
//   compact    — true = smaller node circles, shorter labels

export function WorkflowStateBar({ state, detectedAt, updatedAt, compact = false }) {
  const isTerminalFailure = state === "failed" || state === "dismissed";
  const activeKey = isTerminalFailure ? "executed" : state; // visual position
  const activeIdx = WF_STATES.findIndex((s) => s.key === activeKey);

  const nodeSize  = compact ? "w-5 h-5" : "w-6 h-6";
  const iconSize  = compact ? "h-2.5 w-2.5" : "h-3 w-3";
  const labelCls  = compact ? "text-[8px]" : "text-[9px]";

  return (
    <div className="flex flex-col gap-1.5 w-full min-w-0">
      <div className="flex items-start gap-0 w-full min-w-0">
        {WF_STATES.map((s, i) => {
          const Icon = s.icon;
          const isActive  = i === activeIdx && !isTerminalFailure;
          const isFailed  = i === activeIdx && isTerminalFailure;
          const isPast    = i < activeIdx;
          const isLast    = i === WF_STATES.length - 1;

          // Override visuals when failed/dismissed lands on this step
          const failCfg   = isFailed ? WF_TERMINAL[state] : null;
          const FailIcon  = failCfg?.icon ?? Icon;

          const circleCls = isFailed
            ? `border-2 ${failCfg.ring} bg-white`
            : isActive
            ? `border-2 ${s.ring} bg-white`
            : isPast
            ? "border-2 border-emerald-500 bg-emerald-500"
            : "border border-slate-200 bg-white";

          const iconCls = isFailed
            ? failCfg.color
            : isActive
            ? s.color
            : isPast
            ? "text-white"
            : "text-slate-300";

          const textCls = isFailed
            ? `${labelCls} font-semibold ${failCfg.color} text-center mt-1 leading-tight`
            : isActive
            ? `${labelCls} font-semibold ${s.color} text-center mt-1 leading-tight`
            : isPast
            ? `${labelCls} text-emerald-600 text-center mt-1 leading-tight`
            : `${labelCls} text-slate-300 text-center mt-1 leading-tight`;

          return (
            <div key={s.key} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center flex-1 min-w-0">
                <div className={`${nodeSize} rounded-full flex items-center justify-center flex-shrink-0 transition-all ${circleCls}`}>
                  <FailIcon className={`${iconSize} ${iconCls}`} />
                </div>
                <div className={textCls}>
                  {isFailed ? failCfg.label : s.shortLabel}
                </div>
              </div>
              {!isLast && (
                <div className={`h-0.5 flex-1 mb-4 mx-0.5 ${isPast ? "bg-emerald-400" : "bg-slate-200"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Timestamp row */}
      {(detectedAt || updatedAt) && (
        <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono px-0.5">
          {detectedAt && <span>Detected {fmtTs(detectedAt)}</span>}
          {updatedAt && updatedAt !== detectedAt && <span>Updated {fmtTs(updatedAt)}</span>}
        </div>
      )}
    </div>
  );
}

function fmtTs(iso) {
  try {
    return new Date(iso).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
