import { useMemo } from "react";
import {
  ArrowRightLeft, TrendingUp, Package, Zap, CheckCircle2,
  AlertTriangle, Clock, ChevronRight, BarChart3, Target,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { KpiCard } from "@/components/shared/KpiCard";
import { fmtMoney } from "@/domain/format";

// ─── helpers ────────────────────────────────────────────────────────────────

const adjVal = (a) => a.marketValue * (1 - a.haircut / 100);

const PRIORITY_CFG = {
  High:   { color: "text-red-700",   bg: "bg-red-50 border-red-200",   dot: "bg-red-500",   badge: "border-red-300 text-red-700 bg-red-50"   },
  Medium: { color: "text-amber-700", bg: "bg-amber-50 border-amber-200", dot: "bg-amber-400", badge: "border-amber-300 text-amber-700 bg-amber-50" },
  Low:    { color: "text-slate-600", bg: "bg-slate-50 border-slate-200", dot: "bg-slate-400", badge: "border-slate-300 text-slate-600 bg-slate-50"  },
};

const TYPE_CFG = {
  "rebalance":       { icon: ArrowRightLeft, label: "Cross-repo rebalancing"  },
  "release-maturing":{ icon: Package,        label: "Collateral release"      },
  "deploy-idle":     { icon: TrendingUp,     label: "Deploy idle positions"   },
  "free-encumbered": { icon: Zap,            label: "Free stale encumbrance"  },
  "substitute":      { icon: ArrowRightLeft, label: "Haircut substitution"    },
};

// ─── derivation ─────────────────────────────────────────────────────────────

function deriveOptimisations(repos, assets) {
  const activeRepos    = repos.filter((r) => r.state !== "Closed");
  const pledgedIds     = new Set(activeRepos.flatMap((r) => r.assets));
  const TODAY          = new Date().toISOString().slice(0, 10);
  const opps           = [];

  // 1 ── Cross-repo rebalancing: deficit vs surplus repos
  const deficitRepos = activeRepos.filter((r) => r.buffer < 0);
  const surplusRepos = activeRepos.filter((r) => r.buffer > 0);
  if (deficitRepos.length && surplusRepos.length) {
    const totalDeficit = deficitRepos.reduce((s, r) => s + Math.abs(r.buffer), 0);
    const totalSurplus = surplusRepos.reduce((s, r) => s + r.buffer, 0);
    const netRelease   = Math.max(0, totalSurplus - totalDeficit);
    opps.push({
      id:      "OPT-REBALANCE",
      type:    "rebalance",
      priority: "High",
      title:   `Cross-repo rebalancing — resolve ${deficitRepos.length} margin deficit${deficitRepos.length > 1 ? "s" : ""}`,
      rationale:
        `${surplusRepos.map((r) => r.id).join(" and ")} ${surplusRepos.length > 1 ? "carry" : "carries"} ` +
        `a combined ${fmtMoney(totalSurplus)} in excess collateral while ` +
        `${deficitRepos.map((r) => r.id).join(" and ")} ${deficitRepos.length > 1 ? "are" : "is"} short ` +
        `by ${fmtMoney(totalDeficit)}. Rebalancing eliminates all margin deficits and frees ` +
        `${fmtMoney(netRelease)} net across the portfolio.`,
      liquidityReleased: netRelease,
      deployableValue:   totalSurplus,
      currency:          "RON",
      affectedRepos:     [...deficitRepos.map((r) => r.id), ...surplusRepos.map((r) => r.id)],
      affectedAssets:    [...new Set([...deficitRepos.flatMap((r) => r.assets), ...surplusRepos.flatMap((r) => r.assets)])],
      action:            "Rebalance allocation",
    });
  }

  // 2 ── Maturing repos — release collateral today
  for (const r of activeRepos) {
    if (r.state === "Maturing" || r.maturityDate <= TODAY) {
      const repoAssets  = assets.filter((a) => r.assets.includes(a.id));
      const releaseVal  = repoAssets.reduce((s, a) => s + adjVal(a), 0);
      opps.push({
        id:       `OPT-${r.id}-MATURE`,
        type:     "release-maturing",
        priority: "High",
        title:    `Release collateral from maturing repo ${r.id}`,
        rationale:
          `${r.id} (${r.counterparty}) reaches its maturity date today. Upon settlement confirmation, ` +
          `${repoAssets.map((a) => a.name).join(", ")} can be returned to the available inventory pool. ` +
          `Prompt release prevents inventory fragmentation and enables immediate redeployment.`,
        liquidityReleased: releaseVal,
        deployableValue:   releaseVal,
        currency:          r.currency,
        affectedRepos:     [r.id],
        affectedAssets:    r.assets,
        action:            "Confirm unwind, release to pool",
      });
    }
  }

  // 3 ── Idle available assets not pledged to any active repo
  const idleEligible = assets.filter(
    (a) =>
      a.status === "Available" &&
      !pledgedIds.has(a.id) &&
      (a.eligibility?.toLowerCase().includes("repo") ||
       a.eligibility?.toLowerCase().includes("central bank")),
  );
  if (idleEligible.length > 0) {
    const totalValue = idleEligible.reduce((s, a) => s + adjVal(a), 0);
    opps.push({
      id:       "OPT-IDLE",
      type:     "deploy-idle",
      priority: "Medium",
      title:    `Deploy ${idleEligible.length} idle eligible position${idleEligible.length > 1 ? "s" : ""}`,
      rationale:
        `${idleEligible.map((a) => a.name).join(", ")} ${idleEligible.length > 1 ? "are" : "is"} repo-eligible ` +
        `and classified Available but currently unallocated. Deploying ${idleEligible.length > 1 ? "these positions" : "this position"} ` +
        `would generate up to ${fmtMoney(totalValue)} of additional collateral capacity, reducing the ` +
        `portfolio's reliance on higher-haircut instruments.`,
      liquidityReleased: totalValue,
      deployableValue:   totalValue,
      currency:          "RON",
      affectedRepos:     [],
      affectedAssets:    idleEligible.map((a) => a.id),
      action:            "Allocate to new or existing repo",
    });
  }

  // 4 ── Encumbered assets with no active repo link (stale encumbrances)
  const orphans = assets.filter(
    (a) => (a.status === "Pledged" || a.status === "Locked") && !pledgedIds.has(a.id),
  );
  if (orphans.length > 0) {
    const totalValue = orphans.reduce((s, a) => s + adjVal(a), 0);
    opps.push({
      id:       "OPT-ORPHAN",
      type:     "free-encumbered",
      priority: "Medium",
      title:    `Review ${orphans.length} encumbered position${orphans.length > 1 ? "s" : ""} with no active repo link`,
      rationale:
        `${orphans.map((a) => a.name).join(", ")} ${orphans.length > 1 ? "are" : "is"} marked ` +
        `${[...new Set(orphans.map((a) => a.status))].join("/")} but not linked to any active repo. ` +
        `Reviewing these positions may recover ${fmtMoney(totalValue)} of collateral value currently ` +
        `held in stale encumbrances, improving the portfolio's free collateral ratio.`,
      liquidityReleased: totalValue,
      deployableValue:   totalValue,
      currency:          "RON",
      affectedRepos:     [],
      affectedAssets:    orphans.map((a) => a.id),
      action:            "Review and release encumbrance",
    });
  }

  // 5 ── Haircut substitution: active repos where a lower-haircut available asset could substitute
  for (const r of activeRepos) {
    if (r.buffer < 0) continue; // skip deficit repos — rebalancing handles them
    const currentAssets = assets.filter((a) => r.assets.includes(a.id));
    if (!currentAssets.length) continue;
    const maxHaircut = Math.max(...currentAssets.map((a) => a.haircut));
    const worstAsset  = currentAssets.find((a) => a.haircut === maxHaircut);
    const alternatives = assets.filter(
      (a) =>
        !r.assets.includes(a.id) &&
        a.status === "Available" &&
        a.haircut < maxHaircut &&
        adjVal(a) >= r.requiredCollateral &&
        (a.currency === r.currency || !a.currency),
    );
    if (alternatives.length > 0 && worstAsset) {
      const best   = alternatives.sort((a, b) => a.haircut - b.haircut)[0];
      const saving = Math.max(0, adjVal(best) - adjVal(worstAsset));
      opps.push({
        id:       `OPT-${r.id}-HAIRCUT`,
        type:     "substitute",
        priority: "Low",
        title:    `Reduce haircut cost on ${r.id} — substitute ${worstAsset.id} with ${best.id}`,
        rationale:
          `${r.id} currently holds ${worstAsset.name} at a ${worstAsset.haircut}% haircut. ` +
          `${best.name} is available at ${best.haircut}% haircut and fully covers the ` +
          `${fmtMoney(r.requiredCollateral, r.currency)} requirement. ` +
          `Substituting frees ${fmtMoney(saving, r.currency)} of collateral capacity at lower encumbrance cost.`,
        liquidityReleased: saving,
        deployableValue:   saving,
        currency:          r.currency,
        affectedRepos:     [r.id],
        affectedAssets:    [worstAsset.id, best.id],
        action:            `Substitute ${worstAsset.id} → ${best.id}`,
      });
    }
  }

  const order = { High: 0, Medium: 1, Low: 2 };
  return opps.sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));
}

function derivePortfolioSummary(repos, assets, opps) {
  const activeRepos    = repos.filter((r) => r.state !== "Closed");
  const totalPosted    = activeRepos.reduce((s, r) => s + r.postedCollateral, 0);
  const totalRequired  = activeRepos.reduce((s, r) => s + r.requiredCollateral, 0);
  const totalExcess    = activeRepos.filter((r) => r.buffer > 0).reduce((s, r) => s + r.buffer, 0);
  const coverage       = totalRequired > 0 ? (totalPosted / totalRequired) * 100 : 0;
  const totalReleasable = opps.reduce((s, o) => s + o.liquidityReleased, 0);
  const freeValue      = assets
    .filter((a) => a.status === "Available")
    .reduce((s, a) => s + adjVal(a), 0);
  return {
    totalPosted,
    totalRequired,
    totalExcess,
    totalReleasable,
    freeValue,
    coverage,
    opportunityCount:  opps.length,
    highPriorityCount: opps.filter((o) => o.priority === "High").length,
  };
}

// ─── sub-components ─────────────────────────────────────────────────────────

function PriorityBadge({ priority }) {
  const cfg = PRIORITY_CFG[priority] ?? PRIORITY_CFG.Low;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
      {priority}
    </span>
  );
}

function TypeChip({ type }) {
  const cfg  = TYPE_CFG[type] ?? TYPE_CFG["rebalance"];
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] text-slate-500 font-medium">
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

function TagList({ items }) {
  if (!items?.length) return <span className="text-slate-400 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span key={item} className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-[11px] font-mono text-slate-600">
          {item}
        </span>
      ))}
    </div>
  );
}

function OpportunityCard({ opp, assets, repos, onNavigate }) {
  const cfg = PRIORITY_CFG[opp.priority] ?? PRIORITY_CFG.Low;

  const affectedRepoObjects  = repos.filter((r) => opp.affectedRepos.includes(r.id));
  const affectedAssetObjects = assets.filter((a) => opp.affectedAssets.includes(a.id));

  return (
    <div className={`rounded-md border ${cfg.bg} overflow-hidden`}>
      {/* Header */}
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 flex-wrap min-w-0">
          <PriorityBadge priority={opp.priority} />
          <TypeChip type={opp.type} />
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-widest ${cfg.color} flex-shrink-0`}>
          {opp.id}
        </span>
      </div>

      <Separator className="bg-slate-200/60" />

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-800 leading-snug">{opp.title}</div>
          <p className="mt-1 text-[12px] text-slate-500 leading-relaxed">{opp.rationale}</p>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 pt-1">
          <div className="space-y-0.5">
            <div className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">
              Expected release
            </div>
            <div className="text-sm font-semibold text-emerald-700">
              {opp.liquidityReleased > 0 ? fmtMoney(opp.liquidityReleased, opp.currency) : "—"}
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">
              Affected repos
            </div>
            <div className="flex flex-wrap gap-1">
              {affectedRepoObjects.length ? affectedRepoObjects.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onNavigate?.(r.id)}
                  className="text-[11px] font-mono text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {r.id}
                </button>
              )) : <span className="text-xs text-slate-400">—</span>}
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">
              Affected positions
            </div>
            <TagList items={opp.affectedAssets} />
          </div>

          <div className="space-y-0.5">
            <div className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">
              Recommended action
            </div>
            <button
              onClick={() => {
                if (opp.affectedRepos.length === 1) onNavigate?.(opp.affectedRepos[0]);
              }}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 group"
            >
              {opp.action}
              <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* Affected asset details */}
        {affectedAssetObjects.length > 0 && (
          <div className="rounded bg-white/60 border border-slate-200/60 divide-y divide-slate-100">
            {affectedAssetObjects.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-3 py-1.5 text-[11px]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-slate-500">{a.id}</span>
                  <span className="text-slate-700 truncate">{a.name}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                  <span className="text-slate-500">{a.haircut}% haircut</span>
                  <span className="font-medium text-slate-700">{fmtMoney(adjVal(a), a.currency)}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    a.status === "Available"
                      ? "bg-emerald-100 text-emerald-700"
                      : a.status === "Locked"
                      ? "bg-blue-100 text-blue-700"
                      : a.status === "Reserved"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                  }`}>
                    {a.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EfficiencyMatrix({ repos }) {
  const activeRepos = repos.filter((r) => r.state !== "Closed");

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="border-b border-slate-200">
            {["Repo", "Counterparty", "Notional", "Required", "Posted", "Buffer", "Coverage", "Status"].map((h) => (
              <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {activeRepos.map((r) => {
            const coverage  = r.requiredCollateral > 0 ? (r.postedCollateral / r.requiredCollateral) * 100 : 0;
            const isDeficit = r.buffer < 0;
            const isMature  = r.state === "Maturing";
            return (
              <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2 font-mono font-semibold text-slate-700">{r.id}</td>
                <td className="px-3 py-2 text-slate-600">{r.counterparty}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-700">{fmtMoney(r.amount, r.currency)}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-500">{fmtMoney(r.requiredCollateral, r.currency)}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-700">{fmtMoney(r.postedCollateral, r.currency)}</td>
                <td className={`px-3 py-2 text-right font-mono font-semibold ${isDeficit ? "text-red-600" : "text-emerald-600"}`}>
                  {isDeficit ? "−" : "+"}{fmtMoney(Math.abs(r.buffer), r.currency)}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    isDeficit ? "text-red-600" : coverage > 105 ? "text-amber-600" : "text-emerald-600"
                  }`}>
                    {isDeficit ? <AlertTriangle className="h-3 w-3" /> : coverage > 105 ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                    {coverage.toFixed(1)}%
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    isDeficit  ? "bg-red-100 text-red-700"   :
                    isMature   ? "bg-amber-100 text-amber-700" :
                    "bg-emerald-100 text-emerald-700"
                  }`}>
                    {r.state}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export function PortfolioOptimisation({ repos, assets, openRepo }) {
  const opps    = useMemo(() => deriveOptimisations(repos, assets), [repos, assets]);
  const summary = useMemo(() => derivePortfolioSummary(repos, assets, opps), [repos, assets, opps]);

  const highOpps   = opps.filter((o) => o.priority === "High");
  const mediumOpps = opps.filter((o) => o.priority === "Medium");
  const lowOpps    = opps.filter((o) => o.priority === "Low");

  return (
    <div className="space-y-6 w-full max-w-full min-w-0">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Portfolio Optimisation</h1>
          <p className="mt-1 text-sm text-slate-500">
            System-wide collateral efficiency analysis — identify, prioritise, and act on portfolio-level improvements.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 text-sm text-slate-500">
          {opps.length} opportunit{opps.length === 1 ? "y" : "ies"} detected
        </div>
      </div>

      {/* ── Summary KPIs ── */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Excess Collateral"
          value={fmtMoney(summary.totalExcess)}
          description="Above 103% minimum coverage across active repos"
          icon={BarChart3}
          trendUp
        />
        <KpiCard
          title="Releasable Collateral"
          value={fmtMoney(summary.totalReleasable)}
          description={`Across ${opps.length} optimisation opportunit${opps.length === 1 ? "y" : "ies"}`}
          icon={Package}
          trendUp
        />
        <KpiCard
          title="Opportunities"
          value={String(opps.length)}
          description={
            summary.highPriorityCount > 0
              ? `${summary.highPriorityCount} high-priority — action required`
              : "No critical issues"
          }
          icon={Target}
          alert={summary.highPriorityCount > 0}
        />
        <KpiCard
          title="Portfolio Coverage"
          value={`${summary.coverage.toFixed(1)}%`}
          description="Weighted average across active repos"
          icon={TrendingUp}
          alert={summary.coverage < 100}
        />
      </div>

      {/* ── Efficiency matrix ── */}
      <Card className="rounded-md shadow-sm">
        <CardHeader>
          <CardTitle>Collateral Efficiency Matrix</CardTitle>
          <CardDescription>Coverage, buffer, and status per active repo</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <EfficiencyMatrix repos={repos} assets={assets} />
        </CardContent>
      </Card>

      {/* ── Divider ── */}
      <div className="flex items-center gap-3 pt-2">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold px-2">
          Portfolio Optimisation Opportunities
        </span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* ── High priority ── */}
      {highOpps.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            <span className="text-xs font-semibold uppercase tracking-wide text-red-600">
              High Priority — {highOpps.length} action{highOpps.length > 1 ? "s" : ""} required
            </span>
          </div>
          {highOpps.map((opp) => (
            <OpportunityCard key={opp.id} opp={opp} assets={assets} repos={repos} onNavigate={openRepo} />
          ))}
        </div>
      )}

      {/* ── Medium priority ── */}
      {mediumOpps.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-600">
              Medium Priority — {mediumOpps.length} improvement{mediumOpps.length > 1 ? "s" : ""} available
            </span>
          </div>
          {mediumOpps.map((opp) => (
            <OpportunityCard key={opp.id} opp={opp} assets={assets} repos={repos} onNavigate={openRepo} />
          ))}
        </div>
      )}

      {/* ── Low priority ── */}
      {lowOpps.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Low Priority — {lowOpps.length} optimisation{lowOpps.length > 1 ? "s" : ""} available
            </span>
          </div>
          {lowOpps.map((opp) => (
            <OpportunityCard key={opp.id} opp={opp} assets={assets} repos={repos} onNavigate={openRepo} />
          ))}
        </div>
      )}

      {opps.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <CheckCircle2 className="h-10 w-10 mb-3" />
          <div className="text-sm font-medium">Portfolio is fully optimised</div>
          <div className="text-xs mt-1">No efficiency improvements detected at this time.</div>
        </div>
      )}

    </div>
  );
}
