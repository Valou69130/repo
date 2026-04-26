import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { fmtMoney } from "@/domain/format";
import { deriveActionItems } from "@/components/dashboard/RecommendedActions";
import { AgentStatusStrip } from "@/components/dashboard/AgentStatusStrip";
import { SuggestedCallsPanel } from "@/components/dashboard/SuggestedCallsPanel";
import { PendingApprovalsWidget } from "@/components/dashboard/PendingApprovalsWidget";
import { AIReasoningPanel } from "@/ai/components/AIReasoningPanel";
import { useAICall } from "@/ai/hooks/useAI";
import { api } from "@/lib/api";
import { FileText, Lock } from "lucide-react";

const ASSET_COLORS = {
  Available: "#2563eb",
  Reserved:  "#f59e0b",
  Locked:    "#64748b",
  Pledged:   "#ef4444",
};

function daysToMaturity(maturityDate) {
  return Math.max(0, Math.ceil((new Date(maturityDate) - new Date()) / 86400000));
}

function interestAccrual(amount, rate, days) {
  return Math.round(amount * (rate / 100) * (days / 360));
}

const DarkTooltip = ({ active, payload }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-slate-800 border border-slate-700 shadow-xl px-3 py-2 text-xs">
        <div className="font-semibold text-slate-100">{payload[0].name}</div>
        <div className="text-slate-400 tabular-nums">{fmtMoney(payload[0].value)}</div>
      </div>
    );
  }
  return null;
};

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
  onOpenAgreement,
  isLive = false,
}) {
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

  const totals = useMemo(() => {
    const total    = assets.reduce((s, a) => s + a.marketValue, 0);
    const free     = assets.filter((a) => a.status === "Available").reduce((s, a) => s + a.marketValue, 0);
    const active   = repos.filter((r) => ["Active", "Maturing", "Margin deficit"].includes(r.state)).length;
    const deficits = repos.filter((r) => r.buffer < 0).length;
    return { total, free, active, deficits };
  }, [assets, repos]);

  const actionItems = useMemo(() => {
    const t = new Date().toISOString();
    return deriveActionItems(repos, assets, notifications, pendingSubstitutions, t);
  }, [repos, assets, notifications, pendingSubstitutions]);

  const statusBreakdown = useMemo(() => {
    const groups = { Available: 0, Reserved: 0, Locked: 0, Pledged: 0 };
    assets.forEach((a) => { if (groups[a.status] !== undefined) groups[a.status] += a.marketValue; });
    return Object.entries(groups).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [assets]);

  const topExposure = useMemo(() => {
    const map = {};
    repos.filter((r) => r.state !== "Closed").forEach((r) => {
      map[r.counterparty] = (map[r.counterparty] || 0) + r.amount;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([cp, exposure]) => {
        const deficit = repos.some((r) => r.counterparty === cp && r.buffer < 0);
        return { cp, exposure, deficit };
      });
  }, [repos]);

  const activeRepos = useMemo(() =>
    repos
      .filter((r) => r.state !== "Closed")
      .sort((a, b) => {
        // deficits first, then maturing
        if (a.buffer < 0 && b.buffer >= 0) return -1;
        if (b.buffer < 0 && a.buffer >= 0) return 1;
        return 0;
      })
      .slice(0, 7)
  , [repos]);

  const portfolioAI = useAICall(api.aiAnalysePortfolio);
  const correlateAI = useAICall(api.aiCorrelate);

  const SEVERITY_BORDER = {
    "margin-deficit":           "border-l-red-500",
    "coverage-watch":           "border-l-amber-400",
    "substitution-opportunity": "border-l-amber-400",
    "pending-approval":         "border-l-blue-500",
    "repo-maturing":            "border-l-amber-400",
  };

  return (
    <div className="flex flex-col gap-5">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight leading-none">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Morning briefing · {dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 border border-slate-200 px-3 h-8 text-sm text-slate-600 hover:bg-slate-50 transition">
            <FileText className="h-3.5 w-3.5" />
            Generate Report
          </button>
          <button className="flex items-center gap-1.5 bg-blue-600 px-3 h-8 text-sm text-white hover:bg-blue-700 transition">
            <Lock className="h-3.5 w-3.5" />
            EoD Valuations
          </button>
        </div>
      </div>

      {/* ── KPI Row ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-0 border border-slate-200 divide-x divide-slate-200">
        {/* Card 1 */}
        <div className="border-t-2 border-t-blue-500 bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3">Total Collateral</div>
          <div className="text-[1.6rem] font-black tabular-nums tracking-tight text-slate-900 leading-none">{fmtMoney(totals.total)}</div>
          <div className="mt-1.5 text-[11px] font-medium text-slate-400">Registered positions</div>
        </div>
        {/* Card 2 */}
        <div className="border-t-2 border-t-blue-500 bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3">Free / Available</div>
          <div className="text-[1.6rem] font-black tabular-nums tracking-tight text-slate-900 leading-none">{fmtMoney(totals.free)}</div>
          <div className="mt-1.5 text-[11px] font-medium text-emerald-600">
            {totals.total > 0 ? `${Math.round((totals.free / totals.total) * 100)}% unencumbered` : "—"}
          </div>
        </div>
        {/* Card 3 */}
        <div className="border-t-2 border-t-amber-400 bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3">Active Repos</div>
          <div className="text-[1.6rem] font-black tabular-nums tracking-tight text-slate-900 leading-none">{totals.active}</div>
          <div className="mt-1.5 text-[11px] font-medium text-amber-600">
            {repos.filter((r) => r.state === "Maturing").length} maturing this week
          </div>
        </div>
        {/* Card 4 */}
        <div className={`border-t-2 ${totals.deficits > 0 ? "border-t-red-500 bg-red-50/40" : "border-t-slate-300 bg-white"} p-4`}>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3">Margin Deficits</div>
          <div className={`text-[1.6rem] font-black tabular-nums tracking-tight leading-none ${totals.deficits > 0 ? "text-red-600" : "text-slate-900"}`}>
            {totals.deficits}
          </div>
          {totals.deficits > 0
            ? <div className="mt-1.5 text-[11px] font-bold text-red-500 uppercase tracking-wide">Immediate action required</div>
            : <div className="mt-1.5 text-[11px] font-medium text-slate-400">All positions in compliance</div>
          }
        </div>
      </div>

      {/* ── Agent status strip ───────────────────────────────────────────────── */}
      <AgentStatusStrip repos={repos} assets={assets} notifications={notifications} actionItems={actionItems} />

      {/* ── AI panels ────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AIReasoningPanel
          title="AI portfolio briefing"
          description="Claude reviews open deficits and produces a prioritised treasury brief."
          loading={portfolioAI.loading}
          error={portfolioAI.error}
          text={portfolioAI.text}
          meta={portfolioAI.meta}
          onRun={() => portfolioAI.run()}
          onReset={portfolioAI.reset}
          buttonLabel="Generate brief"
        />
        <AIReasoningPanel
          title="Exception correlation"
          description="Clusters today's alerts into coherent action items by root cause and counterparty."
          loading={correlateAI.loading}
          error={correlateAI.error}
          text={correlateAI.text}
          meta={correlateAI.meta}
          onRun={() => correlateAI.run()}
          onReset={correlateAI.reset}
          buttonLabel="Correlate alerts"
        />
      </div>

      {/* ── Suggested margin calls ────────────────────────────────────────────── */}
      <SuggestedCallsPanel onOpenAgreement={onOpenAgreement} />

      {/* ── 4-eye approvals ──────────────────────────────────────────────────── */}
      <PendingApprovalsWidget
        pendingSubstitutions={pendingSubstitutions}
        assets={assets}
        repos={repos}
        role={role}
        onApproveSubstitution={onApproveSubstitution}
        onRejectSubstitution={onRejectSubstitution}
      />

      {/* ── Two-column section ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

        {/* Left — Recommended Actions (7 cols / 58%) */}
        <div className="xl:col-span-7 border border-slate-200 bg-white flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
            <span className="text-xs font-semibold text-slate-700">Recommended Actions</span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Priority Queue</span>
          </div>
          <div className="flex flex-col divide-y divide-slate-100">
            {actionItems.length === 0 ? (
              <div className="px-4 py-8 text-sm text-slate-400 text-center">No pending actions</div>
            ) : (
              actionItems.slice(0, 5).map((item, i) => {
                const borderCls = SEVERITY_BORDER[item.type] ?? "border-l-blue-400";
                const isRed   = item.type === "margin-deficit";
                const isAmber = ["coverage-watch", "repo-maturing", "substitution-opportunity"].includes(item.type);
                return (
                  <div key={i} className={`flex items-center border-l-4 px-4 py-3 hover:bg-slate-50 transition-colors ${borderCls}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                        {item.type.replace(/-/g, " ")}
                        {item.repoId && <span className="ml-2 font-mono text-blue-600">{item.repoId}</span>}
                      </div>
                      <div className="text-sm font-semibold text-slate-800 truncate">{item.title}</div>
                      {item.amount != null && (
                        <div className={`text-xs font-bold tabular-nums ${isRed ? "text-red-600" : isAmber ? "text-amber-600" : "text-slate-600"}`}>
                          {fmtMoney(Math.abs(item.amount))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => item.repoId && openRepo?.(item.repoId)}
                      className={`ml-4 flex-shrink-0 px-3 h-7 text-[11px] font-bold uppercase tracking-wide border transition ${
                        isRed
                          ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {isRed ? "Resolve" : "Review"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right — Donut + Margin table (5 cols / 42%) */}
        <div className="xl:col-span-5 flex flex-col gap-5">

          {/* Collateral breakdown donut */}
          <div className="border border-slate-200 bg-white flex flex-col">
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
              <span className="text-xs font-semibold text-slate-700">Collateral Breakdown</span>
            </div>
            <div className="flex items-center gap-5 p-4">
              <div style={{ width: 96, height: 96, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusBreakdown} cx="50%" cy="50%" innerRadius={28} outerRadius={44} paddingAngle={2} dataKey="value">
                      {statusBreakdown.map((e) => (
                        <Cell key={e.name} fill={ASSET_COLORS[e.name] || "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip content={<DarkTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-2 flex-1">
                {statusBreakdown.map((e) => (
                  <div key={e.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 flex-shrink-0" style={{ backgroundColor: ASSET_COLORS[e.name] }} />
                      <span className="text-xs font-medium text-slate-700">{e.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold tabular-nums text-slate-800">
                        {totals.total > 0 ? Math.round((e.value / totals.total) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Margin exposure mini-table */}
          <div className="border border-slate-200 bg-white flex flex-col flex-1">
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
              <span className="text-xs font-semibold text-slate-700">Top Exposure</span>
            </div>
            <div className="flex flex-col">
              <div className="grid grid-cols-3 px-4 py-1.5 bg-slate-50 border-b border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Entity</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">Exposure</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">Status</span>
              </div>
              {topExposure.map(({ cp, exposure, deficit }) => (
                <div key={cp} className="grid grid-cols-3 items-center px-4 py-2 border-b border-slate-50 hover:bg-slate-50 last:border-0">
                  <span className="text-xs font-semibold text-slate-800 truncate pr-2">{cp}</span>
                  <span className="text-xs font-bold tabular-nums text-slate-700 text-right">{fmtMoney(exposure)}</span>
                  <div className="flex justify-end">
                    <div className={`w-2 h-2 ${deficit ? "bg-red-500" : "bg-blue-500"}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Active Repo Transactions table ───────────────────────────────────── */}
      <div className="border border-slate-200 bg-white">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
          <span className="text-xs font-semibold text-slate-700">Active Repo Transactions</span>
          <button
            onClick={() => onNavigate?.("repos")}
            className="text-[11px] font-bold text-blue-600 uppercase tracking-wide hover:text-blue-800 transition"
          >
            View All →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Repo ID", "Counterparty", "State", "Notional", "Rate", "Maturity", "Days Left", "Buffer"].map((h) => (
                  <th key={h} className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeRepos.map((r, i) => {
                const dtm = daysToMaturity(r.maturityDate);
                const bufferPct = r.requiredCollateral > 0
                  ? ((r.postedCollateral - r.requiredCollateral) / r.requiredCollateral) * 100
                  : null;
                const bufferPos = bufferPct !== null && bufferPct >= 0;
                return (
                  <tr
                    key={r.id}
                    className={`h-10 cursor-pointer hover:bg-blue-50/40 transition-colors ${i % 2 === 1 ? "bg-slate-50/40" : ""} ${r.buffer < 0 ? "bg-red-50/30" : ""}`}
                    onClick={() => openRepo?.(r.id)}
                  >
                    <td className="px-4 py-2 font-mono text-[11px] font-bold text-blue-600">{r.id}</td>
                    <td className="px-4 py-2 text-xs font-semibold text-slate-800">{r.counterparty}</td>
                    <td className="px-4 py-2"><StatusBadge status={r.state} /></td>
                    <td className="px-4 py-2 text-right text-xs font-mono tabular-nums text-slate-800">{fmtMoney(r.amount, r.currency)}</td>
                    <td className="px-4 py-2 text-right text-xs font-mono tabular-nums text-slate-700">{r.rate}%</td>
                    <td className="px-4 py-2 text-xs tabular-nums text-slate-500">{r.maturityDate}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`text-xs font-bold tabular-nums font-mono ${dtm <= 1 ? "text-red-600" : dtm <= 3 ? "text-amber-600" : "text-slate-700"}`}>
                        {dtm}d
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {bufferPct !== null ? (
                        <span className={`text-[11px] font-bold tabular-nums font-mono ${bufferPos ? "text-emerald-600" : "text-red-600"}`}>
                          {bufferPos ? "+" : ""}{bufferPct.toFixed(2)}%
                        </span>
                      ) : <span className="text-slate-400 text-xs">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50/60">
          <span className="text-[11px] text-slate-500">
            Showing <span className="font-semibold text-slate-700">{activeRepos.length}</span> of{" "}
            <span className="font-semibold text-slate-700">{repos.filter((r) => r.state !== "Closed").length}</span> active transactions
          </span>
          <span className="text-[11px] text-slate-500 tabular-nums">
            Total notional: <span className="font-bold font-mono text-slate-700">
              {fmtMoney(activeRepos.reduce((s, r) => s + r.amount, 0), "RON")}
            </span>
          </span>
        </div>
      </div>

    </div>
  );
}
