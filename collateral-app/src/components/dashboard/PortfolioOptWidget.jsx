import { useMemo } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney } from "@/domain/format";

const PRIORITY_DOT = { High: "bg-red-500", Medium: "bg-amber-400", Low: "bg-slate-400" };

export function PortfolioOptWidget({ repos, assets, onNavigate }) {
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
