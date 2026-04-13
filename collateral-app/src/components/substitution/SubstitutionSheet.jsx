// ─── Substitution Sheet ───────────────────────────────────────────────────────
//
// Multi-step collateral substitution workflow panel.
// Replaces the basic substitution UI in RepoDetail with a full
// analysis-driven, auditable workflow.
//
// Steps:
//   1 — Select position to release (OUT)
//   2 — Select replacement position (IN) with live coverage preview
//   3 — Analysis: before/after summary, recommendation, approve / propose

import { useState, useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Info,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  XCircle,
  Zap,
} from "lucide-react";

import { Button }    from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { fmtMoney, adjustedValue } from "@/domain/format";
import { useSubstitutionWorkflow } from "@/workflows/hooks/useWorkflows";
import { useDomain } from "@/domain/store";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n, decimals = 1) {
  return `${(n * 100).toFixed(decimals)}%`;
}

function DeltaBadge({ value }) {
  if (value === 0) return <span className="text-slate-400 text-xs font-mono">±0pp</span>;
  return (
    <span className={`text-xs font-semibold font-mono ${value > 0 ? "text-emerald-600" : "text-red-600"}`}>
      {value > 0 ? "+" : ""}{value.toFixed(1)}pp
    </span>
  );
}

function StepBar({ step }) {
  const steps = [
    { n: 1, label: "Select OUT" },
    { n: 2, label: "Select IN"  },
    { n: 3, label: "Review"     },
  ];
  return (
    <div className="flex items-center gap-0 mb-5">
      {steps.map((s, i) => {
        const active = s.n === step;
        const past   = s.n < step;
        const isLast = i === steps.length - 1;
        return (
          <div key={s.n} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1">
              <div className={`w-6 h-6 flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                active ? "border-slate-900 bg-slate-900 text-white" :
                past   ? "border-emerald-500 bg-emerald-500 text-white" :
                         "border-slate-200 bg-white text-slate-300"
              }`}>
                {past ? <CheckCircle2 className="h-3 w-3" /> : s.n}
              </div>
              <div className={`text-[10px] mt-0.5 font-medium whitespace-nowrap ${
                active ? "text-slate-900" : past ? "text-emerald-600" : "text-slate-400"
              }`}>
                {s.label}
              </div>
            </div>
            {!isLast && (
              <div className={`h-px flex-1 mb-3.5 ${past ? "bg-emerald-400" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1 ────────────────────────────────────────────────────────────────────

function SelectOutStep({ basket, onSelect }) {
  if (basket.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-sm text-slate-400 gap-2">
        <AlertTriangle className="w-5 h-5 text-slate-300" />
        No allocated positions in this repo.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500 mb-4">
        Select the allocated position you want to release and replace.
      </div>
      {basket.map(asset => (
        <div
          key={asset.id}
          className="rounded border bg-white p-4 hover:border-slate-400 hover:bg-slate-50 transition-colors cursor-pointer group"
          onClick={() => onSelect(asset)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 text-sm">{asset.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-[10px] text-slate-400">{asset.isin}</span>
                <span className="text-[10px] text-slate-400">·</span>
                <span className="text-[10px] text-slate-500">{asset.custody}</span>
              </div>
            </div>
            <Button size="sm" variant="outline"
              className="flex-shrink-0 rounded text-xs gap-1 group-hover:bg-slate-900 group-hover:text-white group-hover:border-slate-900"
              onClick={e => { e.stopPropagation(); onSelect(asset); }}>
              Select <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t">
            <div>
              <div className="text-[9px] uppercase tracking-wide text-slate-400">Market Value</div>
              <div className="text-xs font-semibold text-slate-800 mt-0.5">{fmtMoney(asset.marketValue, asset.currency)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wide text-slate-400">Haircut</div>
              <div className={`text-xs font-semibold mt-0.5 ${asset.haircut <= 3 ? "text-emerald-600" : asset.haircut <= 6 ? "text-amber-600" : "text-red-500"}`}>
                {asset.haircut}%
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wide text-slate-400">Adj. Value</div>
              <div className="text-xs font-semibold text-slate-800 mt-0.5">{fmtMoney(adjustedValue(asset), asset.currency)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Step 2 ────────────────────────────────────────────────────────────────────

function SelectInStep({ outAsset, repo, candidates, allAssets, onSelect, onBack, analyze }) {
  const currentCoverage = repo.postedCollateral / repo.requiredCollateral;

  if (candidates.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">No eligible Available positions in inventory.</div>
        </div>
        <Button variant="outline" size="sm" className="rounded" onClick={onBack}>← Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-red-200 bg-red-50 p-3">
        <div className="text-[10px] uppercase tracking-wide text-red-500 font-semibold mb-1">Releasing</div>
        <div className="font-semibold text-slate-900 text-sm">{outAsset.name}</div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
          <span className="font-mono">{outAsset.isin}</span>
          <span>·</span>
          <span>{fmtMoney(adjustedValue(outAsset), outAsset.currency)} adj.</span>
          <span>·</span>
          <span>{outAsset.haircut}% haircut</span>
        </div>
      </div>

      <div className="text-xs text-slate-500">
        Current coverage: <strong>{pct(currentCoverage)}</strong> — select a replacement from available inventory.
      </div>

      <div className="space-y-3">
        {candidates.map(candidate => {
          const a   = analyze({ repo, outAsset, inAsset: candidate, allAssets });
          const ok  = a.validForExecution;
          const rec = a.recommended;

          return (
            <div key={candidate.id}
              className={`rounded border p-4 transition-colors ${
                ok && rec ? "hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer" :
                ok        ? "hover:border-amber-300 hover:bg-amber-50/30 cursor-pointer" :
                            "opacity-60 cursor-not-allowed border-dashed"
              }`}
              onClick={() => ok && onSelect(candidate, a)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm text-slate-900">{candidate.name}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                    <span className="font-mono">{candidate.isin}</span>
                    <span>·</span>
                    <span>{candidate.custody}</span>
                  </div>
                </div>
                {ok
                  ? <Button size="sm" variant="outline"
                      className={`flex-shrink-0 rounded text-xs gap-1 ${rec ? "hover:bg-emerald-600 hover:text-white hover:border-emerald-600" : "hover:bg-amber-500 hover:text-white hover:border-amber-500"}`}
                      onClick={e => { e.stopPropagation(); onSelect(candidate, a); }}>
                      Analyze <ChevronRight className="w-3 h-3" />
                    </Button>
                  : <span className="text-[10px] text-red-500 font-semibold flex-shrink-0">Blocked</span>
                }
              </div>

              <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t">
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-slate-400">Adj. Value</div>
                  <div className="text-xs font-semibold text-slate-800 mt-0.5">{fmtMoney(adjustedValue(candidate), candidate.currency)}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-slate-400">Haircut</div>
                  <div className={`text-xs font-semibold mt-0.5 ${candidate.haircut <= 3 ? "text-emerald-600" : candidate.haircut <= 6 ? "text-amber-600" : "text-red-500"}`}>
                    {candidate.haircut}%
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-slate-400">After coverage</div>
                  <div className={`text-xs font-semibold mt-0.5 ${!ok ? "text-red-600" : !a.meetsRequiredRatio ? "text-amber-600" : "text-emerald-600"}`}>
                    {pct(a.after.coverageRatio)}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-slate-400">Δ Coverage</div>
                  <div className="mt-0.5">
                    <DeltaBadge value={a.coverageDeltaRatio * 100} />
                  </div>
                </div>
              </div>

              {!ok && (
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-red-600 font-medium">
                  <XCircle className="w-3 h-3" /> {a.invalidReasons[0]}
                </div>
              )}
              {ok && !a.meetsRequiredRatio && (
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-600 font-medium">
                  <AlertTriangle className="w-3 h-3" /> Coverage drops below 103% — margin deficit
                </div>
              )}
              {ok && rec && (
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-600 font-medium">
                  <CheckCircle2 className="w-3 h-3" />
                  {candidate.haircut < outAsset.haircut ? "CTD improvement — recommended" : "All criteria met"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-start pt-1">
        <Button variant="outline" size="sm" className="rounded" onClick={onBack}>← Back</Button>
      </div>
    </div>
  );
}

// ── Step 3 ────────────────────────────────────────────────────────────────────

function ImpactRow({ label, before, after, good, warn, note }) {
  return (
    <div className="grid grid-cols-[120px_1fr_1fr] gap-2 py-2.5 border-b last:border-0 items-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</div>
      <div className="font-mono text-xs text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded w-fit">{before}</div>
      <div className="flex items-center gap-1.5">
        <span className={`font-mono text-xs px-1.5 py-0.5 rounded w-fit ${
          warn ? "bg-red-100 text-red-700" :
          good ? "bg-emerald-100 text-emerald-700" :
                 "bg-slate-100 text-slate-600"
        }`}>{after}</span>
        {note && <span className="text-[10px] text-slate-400">{note}</span>}
      </div>
    </div>
  );
}

function ReviewStep({ analysis, repo, canExecute, onApprove, requiresFourEyes, onBack, loading }) {
  const { before, after, outAsset, inAsset } = analysis;

  return (
    <div className="space-y-5">
      {/* Recommendation banner */}
      <div className={`rounded border p-4 ${
        !analysis.validForExecution ? "border-red-300 bg-red-50" :
        analysis.recommended        ? "border-emerald-200 bg-emerald-50" :
                                      "border-amber-200 bg-amber-50"
      }`}>
        <div className="flex items-start gap-3">
          {!analysis.validForExecution
            ? <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            : analysis.recommended
            ? <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
            : <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          }
          <div className="min-w-0">
            <div className={`font-semibold text-sm ${
              !analysis.validForExecution ? "text-red-800" :
              analysis.recommended        ? "text-emerald-800" :
                                            "text-amber-800"
            }`}>
              {!analysis.validForExecution ? "Substitution Blocked" :
               analysis.recommended        ? "Recommended — All Criteria Met" :
                                             "Caution — Proceed with Awareness"}
            </div>
            {analysis.invalidReasons.map((r, i) => (
              <div key={i} className="text-xs text-red-700 mt-1">{r}</div>
            ))}
            {analysis.validForExecution && analysis.reasons.slice(0, 2).map((r, i) => (
              <div key={i} className="text-xs text-emerald-700 mt-1 flex items-start gap-1.5">
                <CheckCircle2 className="w-3 h-3 flex-shrink-0 mt-0.5" />{r}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Warnings */}
      {analysis.warnings.map((w, i) => (
        <div key={i} className="rounded border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <span className="text-xs text-amber-800">{w}</span>
        </div>
      ))}

      {/* Before / After */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-red-200 bg-red-50/40 p-3">
          <div className="text-[9px] font-bold uppercase tracking-widest text-red-500 mb-2">OUT</div>
          <div className="font-semibold text-slate-900 text-sm leading-snug">{outAsset.name}</div>
          <div className="font-mono text-[10px] text-slate-400 mt-0.5">{outAsset.isin}</div>
          <Separator className="my-2" />
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Market Value</span>
              <span className="font-medium">{fmtMoney(outAsset.marketValue, outAsset.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Haircut</span>
              <span className={`font-semibold ${outAsset.haircutPct <= 3 ? "text-emerald-600" : "text-amber-600"}`}>{outAsset.haircutPct}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Adj. Value</span>
              <span className="font-medium">{fmtMoney(outAsset.adjValue, outAsset.currency)}</span>
            </div>
          </div>
        </div>
        <div className="rounded border border-emerald-200 bg-emerald-50/40 p-3">
          <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-500 mb-2">IN</div>
          <div className="font-semibold text-slate-900 text-sm leading-snug">{inAsset.name}</div>
          <div className="font-mono text-[10px] text-slate-400 mt-0.5">{inAsset.isin}</div>
          <Separator className="my-2" />
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Market Value</span>
              <span className="font-medium">{fmtMoney(inAsset.marketValue, inAsset.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Haircut</span>
              <span className={`font-semibold ${inAsset.haircutPct <= 3 ? "text-emerald-600" : "text-amber-600"}`}>{inAsset.haircutPct}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Adj. Value</span>
              <span className="font-medium">{fmtMoney(inAsset.adjValue, inAsset.currency)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Impact table */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Impact Analysis</div>
        <div className="rounded border bg-white divide-y px-3">
          <ImpactRow label="Coverage" before={pct(before.coverageRatio)} after={pct(after.coverageRatio)}
            note={`(${analysis.coverageDeltaRatio >= 0 ? "+" : ""}${(analysis.coverageDeltaRatio * 100).toFixed(1)}pp)`}
            good={analysis.meetsRequiredRatio && after.coverageRatio >= before.coverageRatio}
            warn={!analysis.meetsRequiredRatio} />
          <ImpactRow label="Buffer" before={fmtMoney(before.buffer, repo.currency)} after={fmtMoney(after.buffer, repo.currency)}
            good={after.buffer > before.buffer} warn={after.buffer < 0} />
          <ImpactRow label="Haircut" before={`${outAsset.haircutPct}%`} after={`${inAsset.haircutPct}%`}
            note={analysis.haircutDelta !== 0 ? `(${analysis.haircutDelta > 0 ? "+" : ""}${analysis.haircutDelta}pp)` : null}
            good={analysis.haircutDelta < 0} warn={analysis.haircutDelta > 0} />
          <ImpactRow label="Repo State" before={before.repoState} after={after.repoState}
            good={after.repoState === "Active"} warn={after.repoState === "Margin deficit"} />
        </div>
      </div>

      {/* Concentration + Liquidity */}
      <div className="space-y-2">
        <div className="rounded border bg-slate-50 px-3 py-2.5 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-0.5">Concentration</div>
            <div className="text-xs text-slate-700">{analysis.concentrationNote}</div>
          </div>
        </div>
        <div className={`rounded border px-3 py-2.5 flex items-start gap-2 ${analysis.liquidityBenefit ? "bg-emerald-50 border-emerald-200" : "bg-slate-50"}`}>
          {analysis.liquidityBenefit
            ? <Zap className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
            : <TrendingDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
          }
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-0.5">Liquidity</div>
            <div className="text-xs text-slate-700">{analysis.liquidityNote}</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-3 border-t gap-3">
        <Button variant="outline" size="sm" className="rounded" onClick={onBack}>← Back</Button>
        <div className="flex items-center gap-2">
          {analysis.validForExecution && (
            <Button size="sm" disabled={loading || (!canExecute && !requiresFourEyes)}
              className={`rounded ${requiresFourEyes ? "bg-amber-500 hover:bg-amber-600" : analysis.recommended ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-500 hover:bg-amber-600"}`}
              onClick={onApprove}>
              {loading
                ? (requiresFourEyes ? "Submitting…" : "Executing…")
                : requiresFourEyes
                ? "Submit for 4-Eye Approval"
                : (analysis.recommended ? "Approve & Execute" : "Execute with Caution")}
            </Button>
          )}
          {!analysis.validForExecution && (
            <div className="flex items-center gap-1.5 text-sm text-red-600 font-medium">
              <XCircle className="w-4 h-4" /> Execution blocked
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Exported component ────────────────────────────────────────────────────────

export function SubstitutionSheet({ open, onClose, repo, assets, canExecute, onSubstituted, onProposed }) {
  const [step,     setStep]     = useState(1);
  const [outAsset, setOutAsset] = useState(null);
  const [inAsset,  setInAsset]  = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading,  setLoading]  = useState(false);

  const { ruleEngine } = useDomain();
  const { analyze, execute, propose } = useSubstitutionWorkflow();

  const requiresFourEyes = repo && ruleEngine
    ? repo.amount > ruleEngine.approvalThreshold
    : false;

  const basket = useMemo(
    () => assets.filter(a => repo?.assets?.includes(a.id)),
    [assets, repo]
  );

  const candidates = useMemo(
    () => assets.filter(a =>
      a.status === "Available" &&
      a.eligibility.includes("Eligible") &&
      !repo?.assets?.includes(a.id)
    ),
    [assets, repo]
  );

  function reset() {
    setStep(1); setOutAsset(null); setInAsset(null); setAnalysis(null); setLoading(false);
  }

  function handleClose() { reset(); onClose(); }

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
      if (result) onSubstituted?.(result);
    }
    setLoading(false);
    handleClose();
  }

  if (!repo) return null;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="sm:max-w-[640px] overflow-y-auto flex flex-col gap-0 p-0">
        <div className="px-6 pt-6 pb-4 border-b bg-slate-50 flex-shrink-0">
          <SheetHeader>
            <SheetTitle className="text-base">Collateral Substitution — {repo.id}</SheetTitle>
            <SheetDescription>
              {repo.counterparty} · {fmtMoney(repo.amount, repo.currency)} · Coverage: {pct(repo.postedCollateral / repo.requiredCollateral)}
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <StepBar step={step} />

          {step === 1 && (
            <SelectOutStep basket={basket} onSelect={a => { setOutAsset(a); setStep(2); }} />
          )}

          {step === 2 && outAsset && (
            <SelectInStep
              outAsset={outAsset}
              repo={repo}
              candidates={candidates}
              allAssets={assets}
              onSelect={(a, an) => { setInAsset(a); setAnalysis(an); setStep(3); }}
              onBack={() => setStep(1)}
              analyze={analyze}
            />
          )}

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
        </div>
      </SheetContent>
    </Sheet>
  );
}
