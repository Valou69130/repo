import { useMemo } from "react";
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
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { fmtMoney, adjustedValue } from "@/domain/format";
import { AgentStatusStrip } from "@/components/dashboard/AgentStatusStrip";
import { RecommendedActions, deriveActionItems } from "@/components/dashboard/RecommendedActions";
import { EodSummary } from "@/components/dashboard/EodSummary";
import { PendingApprovalsWidget } from "@/components/dashboard/PendingApprovalsWidget";
import { PortfolioOptWidget } from "@/components/dashboard/PortfolioOptWidget";
import { SuggestedCallsPanel } from "@/components/dashboard/SuggestedCallsPanel";
import { AIReasoningPanel } from "@/ai/components/AIReasoningPanel";
import { useAICall } from "@/ai/hooks/useAI";
import { api } from "@/lib/api";

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  Available: "#10b981",
  Reserved:  "#f59e0b",
  Locked:    "#64748b",
  Pledged:   "#ef4444",
};

// ─── Chart tooltip helpers ─────────────────────────────────────────────────────

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
  onOpenAgreement,
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

  const actionItems = useMemo(() => {
    // Pass a stable `now` so detectedAt/updatedAt don't change on unrelated re-renders
    const now = new Date().toISOString();
    return deriveActionItems(repos, assets, notifications, pendingSubstitutions, now);
  }, [repos, assets, notifications, pendingSubstitutions]);

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
      dayMap[d].cash       += r.amount;
      dayMap[d].collateral += r.postedCollateral;
      dayMap[d].repos.push(r.id);
    }
    return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [repos]);

  const portfolioAI = useAICall(api.aiAnalysePortfolio);
  const correlateAI = useAICall(api.aiCorrelate);

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
      <div className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Collateral Control Center</h1>
          <p className="mt-1 text-sm text-slate-500">Margin monitoring, substitution analysis, and daily controls across the repo book.</p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <span className="text-sm text-slate-500">{today}</span>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <span className="text-xs text-emerald-600 font-medium uppercase tracking-wider">Live</span>
          </div>
        </div>
      </div>

      {/* ── Agent status strip ── */}
      <AgentStatusStrip repos={repos} assets={assets} notifications={notifications} actionItems={actionItems} />

      {/* ── Recommended actions ── */}
      <RecommendedActions items={actionItems} onAct={openRepo} />

      {/* ── AI reasoning layer (feature-flagged — graceful degradation) ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AIReasoningPanel
          title="AI portfolio briefing"
          description="Claude reviews open deficits and produces a prioritised treasury brief. Read-only; human review required before any action."
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

      {/* ── Suggested margin calls (deficit-based) ── */}
      <SuggestedCallsPanel onOpenAgreement={onOpenAgreement} />

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

      {/* ── KPI strip ── */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Collateral Value"
          value={fmtMoney(totals.total)}
          description="All registered positions across the pool"
        />
        <KpiCard
          title="Free Collateral"
          value={fmtMoney(totals.free)}
          description={
            totals.total > 0
              ? `${Math.round((totals.free / totals.total) * 100)}% of portfolio unencumbered`
              : "No assets"
          }
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
          alert={totals.deficits > 0}
        />
        <KpiCard
          title="Accrued Interest Today"
          value={fmtMoney(totals.accruedToday)}
          description="Estimated carry contribution on open trades"
        />
      </div>

      {/* ── Portfolio Optimisation widget ── */}
      <PortfolioOptWidget repos={repos} assets={assets} onNavigate={onNavigate} />

      {/* ── Portfolio charts ── */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-lg border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle>Portfolio Allocation</CardTitle>
            <CardDescription>Market value by encumbrance status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4" style={{ height: 212, width: 212, flexShrink: 0 }}>
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
                  <div key={entry.name} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3">
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

        <Card className="rounded-lg border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle>Repo Coverage Ratios</CardTitle>
            <CardDescription>Posted vs required collateral — 103% minimum threshold</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3" style={{ height: 228 }}>
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
            <div className="mt-4 flex flex-wrap items-center gap-5 text-xs text-slate-500">
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
        <Card className="xl:col-span-2 rounded-lg border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle>Collateral Overview</CardTitle>
            <CardDescription>
              Haircut-adjusted visibility across the current inventory pool.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border border-slate-100">
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
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle>Maturity Ladder</CardTitle>
            <CardDescription>Upcoming cash &amp; collateral flows</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {maturityLadder.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-8">No upcoming maturities</div>
            ) : (
              <div className="space-y-3">
                {maturityLadder.map((d) => {
                  const daysAway = Math.ceil(
                    (new Date(d.date) - new Date()) / 86400000
                  );
                  return (
                    <div key={d.date} className="rounded-md border border-slate-100 bg-slate-50/60 px-4 py-4 transition-colors hover:bg-slate-50">
                      <div className="mb-3 flex items-center justify-between">
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
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="rounded-xl bg-white/80 px-3 py-3">
                          <div className="text-slate-400">Cash Due</div>
                          <div className="mt-1 font-semibold text-slate-700">{fmtMoney(d.cash)}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-3 py-3 text-right">
                          <div className="text-slate-400">Collateral</div>
                          <div className="mt-1 font-semibold text-emerald-600">
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
      <Card className="rounded-lg border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
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
                    className="w-full overflow-hidden rounded-md border border-slate-200 bg-white text-left transition-colors hover:bg-slate-50 shadow-sm"
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
