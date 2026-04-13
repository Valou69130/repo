// ─── ImpactPreview ─────────────────────────────────────────────────────────────
//
// Before/after consequence display for action cards and execution workflows.
// Variants: top-up, substitution, release, exception.
//
// Usage:
//   <ImpactPreview impact={item.impact} />
//
// impact.type drives which sub-component renders.
// All monetary values must already be denominated in the correct currency.

import { ArrowRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { fmtMoney } from "@/domain/format";

// ─── Internal helpers ─────────────────────────────────────────────────────────

function fmtCov(ratio) {
  return `${(ratio * 100).toFixed(1)}%`;
}

function DeltaTag({ delta, good = "up", currency, isRatio = false }) {
  if (delta === null || delta === undefined || isNaN(delta)) return null;
  const abs    = Math.abs(delta);
  const pos    = delta >= 0;
  const neutral = abs < 0.0001;
  const isGood  = neutral ? null : (good === "up" ? pos : !pos);
  const color   = neutral ? "text-slate-400" : isGood ? "text-emerald-600" : "text-red-600";
  const Icon    = neutral ? Minus : pos ? TrendingUp : TrendingDown;
  const text    = isRatio
    ? `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}pp`
    : `${delta >= 0 ? "+" : "−"}${fmtMoney(abs, currency)}`;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${color}`}>
      <Icon className="h-2.5 w-2.5 flex-shrink-0" />
      {text}
    </span>
  );
}

function Metric({ label, before, after, delta, good, currency, isRatio }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="flex items-center gap-1 text-xs flex-wrap">
        <span className="tabular-nums text-slate-500">{before}</span>
        <ArrowRight className="h-2.5 w-2.5 text-slate-300 flex-shrink-0" />
        <span className="tabular-nums font-semibold text-slate-900">{after}</span>
      </div>
      <DeltaTag delta={delta} good={good} currency={currency} isRatio={isRatio} />
    </div>
  );
}

// ─── Top-up variant ───────────────────────────────────────────────────────────

function TopUpImpact({ impact }) {
  const {
    currentCoverage, projectedCoverage,
    currentPosted, projectedPosted, topUpAmount,
    currentBuffer, projectedBuffer, currency,
  } = impact;

  return (
    <div className="grid grid-cols-3 gap-4">
      <Metric
        label="Coverage"
        before={fmtCov(currentCoverage)}
        after={fmtCov(projectedCoverage)}
        delta={projectedCoverage - currentCoverage}
        good="up"
        isRatio
      />
      <Metric
        label="Posted Collateral"
        before={fmtMoney(currentPosted, currency)}
        after={fmtMoney(projectedPosted, currency)}
        delta={topUpAmount}
        good="up"
        currency={currency}
      />
      <Metric
        label="Buffer"
        before={fmtMoney(currentBuffer, currency)}
        after={fmtMoney(projectedBuffer, currency)}
        delta={projectedBuffer - currentBuffer}
        good="up"
        currency={currency}
      />
    </div>
  );
}

// ─── Substitution variant ─────────────────────────────────────────────────────

function SubstitutionImpact({ impact }) {
  const { outAsset, inAsset, liquidityChange, concentrationFlag, currency } = impact;

  const effBefore = outAsset ? (1 - outAsset.haircut / 100) : null;
  const effAfter  = inAsset  ? (1 - inAsset.haircut  / 100) : null;
  const effDelta  = effBefore != null && effAfter != null ? effAfter - effBefore : null;

  return (
    <div className="space-y-2.5">
      {/* Asset swap cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-slate-200 bg-white/70 px-2.5 py-2 min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-wide text-red-500 mb-1">Remove</div>
          {outAsset ? (
            <>
              <div className="text-xs font-medium text-slate-800 truncate">{outAsset.name}</div>
              <div className="text-[10px] text-slate-400 font-mono">
                {outAsset.haircut}% haircut · {fmtMoney(outAsset.adjustedValue, currency)}
              </div>
            </>
          ) : (
            <div className="text-[10px] text-slate-400 italic">No position selected</div>
          )}
        </div>
        <div className="rounded border border-emerald-200 bg-emerald-50/60 px-2.5 py-2 min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-wide text-emerald-600 mb-1">Add</div>
          {inAsset ? (
            <>
              <div className="text-xs font-medium text-slate-800 truncate">{inAsset.name}</div>
              <div className="text-[10px] text-slate-400 font-mono">
                {inAsset.haircut}% haircut · {fmtMoney(inAsset.adjustedValue, currency)}
              </div>
            </>
          ) : (
            <div className="text-[10px] text-slate-400 italic">No candidate available</div>
          )}
        </div>
      </div>

      {/* Derived metrics */}
      <div className="grid grid-cols-3 gap-4">
        <Metric
          label="Collateral Efficiency"
          before={effBefore != null ? fmtCov(effBefore) : "—"}
          after={effAfter  != null ? fmtCov(effAfter)  : "—"}
          delta={effDelta}
          good="up"
          isRatio
        />
        <Metric
          label="Liquidity Impact"
          before="—"
          after={
            liquidityChange === 0 ? "Neutral" :
            liquidityChange  >  0 ? `+${fmtMoney(liquidityChange, currency)} freed` :
                                    `${fmtMoney(Math.abs(liquidityChange), currency)} consumed`
          }
          delta={liquidityChange}
          good="up"
          currency={currency}
        />
        <div className="flex flex-col gap-0.5">
          <div className={`text-[9px] font-semibold uppercase tracking-wide ${concentrationFlag ? "text-amber-500" : "text-slate-400"}`}>
            Concentration
          </div>
          {concentrationFlag ? (
            <div className="text-[10px] text-amber-700 leading-relaxed">{concentrationFlag}</div>
          ) : (
            <div className="text-[10px] text-emerald-600 font-medium">No concentration risk</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Release variant ──────────────────────────────────────────────────────────

function ReleaseImpact({ impact }) {
  const { collateralFreed, currentFreePool, projectedFreePool, currency } = impact;
  return (
    <div className="grid grid-cols-2 gap-4">
      <Metric
        label="Collateral Released"
        before="Encumbered"
        after={fmtMoney(collateralFreed, currency)}
        delta={collateralFreed}
        good="up"
        currency={currency}
      />
      <Metric
        label="Free Pool After"
        before={fmtMoney(currentFreePool, currency)}
        after={fmtMoney(projectedFreePool, currency)}
        delta={collateralFreed}
        good="up"
        currency={currency}
      />
    </div>
  );
}

// ─── Exception variant ────────────────────────────────────────────────────────

function ExceptionImpact({ impact }) {
  const { currentState, projectedState, description } = impact;
  return (
    <div className="flex items-start gap-4 flex-wrap">
      <div className="flex flex-col gap-0.5">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Instruction Status</div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-500">{currentState}</span>
          <ArrowRight className="h-2.5 w-2.5 text-slate-300 flex-shrink-0" />
          <span className="font-semibold text-emerald-700">{projectedState}</span>
        </div>
      </div>
      {description && (
        <div className="text-[10px] text-slate-500 leading-relaxed flex-1">{description}</div>
      )}
    </div>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

export function ImpactPreview({ impact, className = "", bare = false }) {
  if (!impact) return null;

  const inner = (
    <>
      {impact.type === "top-up"       && <TopUpImpact       impact={impact} />}
      {impact.type === "substitution" && <SubstitutionImpact impact={impact} />}
      {impact.type === "release"      && <ReleaseImpact      impact={impact} />}
      {impact.type === "exception"    && <ExceptionImpact    impact={impact} />}
    </>
  );

  if (bare) return <div className={className}>{inner}</div>;

  return (
    <div className={`rounded border border-white/80 bg-white/60 px-3 py-2.5 ${className}`}>
      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2.5">
        Impact Preview
      </div>
      {inner}
    </div>
  );
}
