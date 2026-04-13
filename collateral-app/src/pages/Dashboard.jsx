import { useMemo } from "react";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle, ArrowRightLeft, Banknote, CheckCircle2,
  ChevronRight, Clock, Coins, TrendingUp, Wallet,
} from "lucide-react";
import { fmtMoney, adjustedValue } from "@/domain/format";
import { deriveActionItems } from "@/components/dashboard/RecommendedActions";
import { PendingApprovalsWidget } from "@/components/dashboard/PendingApprovalsWidget";
import "./Dashboard.css";

// ─── Theme ────────────────────────────────────────────────────────────────────

const T = {
  text:     "#16213A",
  muted:    "#5A6A84",
  faint:    "#9AAABB",
  border:   "#DDE3ED",
  bg:       "#F4F6FA",
  card:     "#FFFFFF",
  blue:     "#0B3D91",
  blueMid:  "#1A5FB4",
  blueLt:   "#E8F0FC",
  blueDot:  "#2D7DD2",
  green:    "#1D7A44",
  greenLt:  "#E6F4ED",
  amber:    "#B85C00",
  amberLt:  "#FEF3E2",
  red:      "#C0392B",
  redLt:    "#FDECEB",
};

const STATUS_COLORS = {
  Available: T.green,
  Reserved:  T.amber,
  Locked:    T.blueMid,
  Pledged:   T.red,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return <div className="db-section-label">{children}</div>;
}

function KpiCard({ label, value, sub, icon: Icon, variant = "default" }) {
  return (
    <div className={`db-kpi-card ${variant}`}>
      <div className="db-kpi-icon"><Icon size={16} /></div>
      <div className="db-kpi-label">{label}</div>
      <div className="db-kpi-value">{value}</div>
      {sub && <div className="db-kpi-sub">{sub}</div>}
    </div>
  );
}

function StatusBadge({ state }) {
  const map = {
    Active:          { cls: "green",   label: "Active" },
    Maturing:        { cls: "amber",   label: "Maturing" },
    "Margin deficit":{ cls: "red",     label: "Deficit" },
    Pending:         { cls: "blue",    label: "Pending" },
    Closed:          { cls: "neutral", label: "Closed" },
  };
  const { cls, label } = map[state] ?? { cls: "neutral", label: state };
  return (
    <span className={`db-badge ${cls}`}>
      <span className="db-badge-dot" />
      {label}
    </span>
  );
}

function AssetBadge({ status }) {
  const cls = { Available: "green", Reserved: "amber", Locked: "blue", Pledged: "red" }[status] ?? "neutral";
  return <span className={`db-badge ${cls}`}><span className="db-badge-dot" />{status}</span>;
}

const ChartTooltip = ({ active, payload, label, isBar }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="db-tooltip">
      <div style={{ fontWeight: 600, marginBottom: 2, fontSize: 12 }}>{label ?? payload[0].name}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: T.blueMid }}>
        {isBar ? `${payload[0].value}%` : fmtMoney(payload[0].value)}
      </div>
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

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
}) {
  const today   = new Date();
  const dateStr = today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeStr = today.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  // ── Derived data ──────────────────────────────────────────────────────────

  const totals = useMemo(() => {
    const total    = assets.reduce((s, a) => s + a.marketValue, 0);
    const free     = assets.filter((a) => a.status === "Available").reduce((s, a) => s + a.marketValue, 0);
    const active   = repos.filter((r) => ["Active", "Maturing", "Margin deficit"].includes(r.state)).length;
    const deficits = repos.filter((r) => r.buffer < 0).length;
    const accrued  = repos.filter((r) => r.state !== "Closed").reduce((s, r) => s + Math.round(r.amount * (r.rate / 100) / 360), 0);
    return { total, free, active, deficits, accrued };
  }, [assets, repos]);

  const actionItems = useMemo(
    () => deriveActionItems(repos, assets, notifications, pendingSubstitutions),
    [repos, assets, notifications, pendingSubstitutions]
  );

  const statusBreakdown = useMemo(() => {
    const g = { Available: 0, Reserved: 0, Locked: 0, Pledged: 0 };
    assets.forEach((a) => { if (g[a.status] !== undefined) g[a.status] += a.marketValue; });
    return Object.entries(g).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [assets]);

  const maturityLadder = useMemo(() => {
    const m = {};
    for (const r of repos) {
      if (r.state === "Closed") continue;
      if (!m[r.maturityDate]) m[r.maturityDate] = { date: r.maturityDate, cash: 0, collateral: 0, repos: [] };
      m[r.maturityDate].cash       += r.amount;
      m[r.maturityDate].collateral += r.postedCollateral;
      m[r.maturityDate].repos.push(r.id);
    }
    return Object.values(m).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  }, [repos]);

  const coverageData = useMemo(() =>
    repos.filter((r) => r.state !== "Closed").map((r) => ({
      id:       r.id.replace("R-", ""),
      coverage: Math.round((r.postedCollateral / r.requiredCollateral) * 100),
      fill:     r.buffer < 0 ? T.red : r.postedCollateral / r.requiredCollateral < 1.03 ? T.amber : T.green,
    })),
  [repos]);

  const activeRepos = repos.filter((r) => r.state !== "Closed");
  const maxCash     = Math.max(...maturityLadder.map((d) => d.cash), 1);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="db" style={{ minHeight: "100%" }}>

      {/* ── Alert strip ── */}
      {totals.deficits > 0 && (
        <div className="db-alert-strip">
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          {totals.deficits} repo{totals.deficits > 1 ? "s" : ""} with margin deficit — immediate action required
        </div>
      )}

      {/* ── Page header ── */}
      <div style={{
        background:   T.card,
        borderBottom: `1px solid ${T.border}`,
        padding:      "20px 24px",
        display:      "flex",
        alignItems:   "center",
        justifyContent: "space-between",
        gap:          16,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.muted, marginBottom: 2 }}>
            Operations Dashboard
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: T.text, margin: 0, letterSpacing: "-0.3px" }}>
            Collateral Control Center
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {actionItems.length > 0 && (
            <div style={{
              background: T.amberLt, border: `1px solid #F5CBA7`,
              borderRadius: 6, padding: "6px 12px",
              fontSize: 12, fontWeight: 600, color: T.amber,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <AlertTriangle size={12} />
              {actionItems.length} action{actionItems.length > 1 ? "s" : ""} required
            </div>
          )}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{dateStr}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2, justifyContent: "flex-end" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.green, display: "inline-block" }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: T.green, letterSpacing: "0.04em" }}>LIVE · {timeStr}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* ── KPI row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <KpiCard
            label="Total Pool Value"
            value={fmtMoney(totals.total)}
            sub={`${assets.length} registered positions`}
            icon={Coins}
          />
          <KpiCard
            label="Free Collateral"
            value={fmtMoney(totals.free)}
            sub={totals.total > 0 ? `${Math.round((totals.free / totals.total) * 100)}% unencumbered` : "—"}
            icon={Wallet}
            variant="positive"
          />
          <KpiCard
            label="Active Repo Book"
            value={String(totals.active)}
            sub={totals.deficits > 0 ? `${totals.deficits} margin deficit${totals.deficits > 1 ? "s" : ""}` : "All trades within threshold"}
            icon={ArrowRightLeft}
            variant={totals.deficits > 0 ? "alert" : "default"}
          />
          <KpiCard
            label="Accrued Today"
            value={fmtMoney(totals.accrued)}
            sub="Estimated carry on open book"
            icon={TrendingUp}
          />
        </div>

        {/* ── Pending 4-eye approvals ── */}
        {pendingSubstitutions.length > 0 && (
          <div className="db-card" style={{ padding: "20px 24px" }}>
            <SectionLabel>
              <AlertTriangle size={12} style={{ color: T.amber }} />
              Pending 4-Eye Approvals
              <span style={{ marginLeft: 4, background: T.amberLt, color: T.amber, fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 10 }}>
                {pendingSubstitutions.length}
              </span>
            </SectionLabel>
            <PendingApprovalsWidget
              pendingSubstitutions={pendingSubstitutions}
              assets={assets}
              repos={repos}
              role={role}
              onApproveSubstitution={onApproveSubstitution}
              onRejectSubstitution={onRejectSubstitution}
            />
          </div>
        )}

        {/* ── Main grid: Repo book + Right column ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}>

          {/* Repo book */}
          <div className="db-card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "16px 20px 0", borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Active Repo Book</span>
                <span style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>{activeRepos.length} open trades</span>
              </div>
            </div>
            <table className="db-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Counterparty</th>
                  <th className="right">Notional</th>
                  <th className="right">Rate</th>
                  <th className="right">Coverage</th>
                  <th className="right">Buffer</th>
                  <th className="right">Maturity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeRepos.map((r) => {
                  const coverage = Math.round((r.postedCollateral / r.requiredCollateral) * 100);
                  const daysLeft = Math.max(0, Math.ceil((new Date(r.maturityDate) - new Date()) / 86400000));
                  return (
                    <tr key={r.id} className="clickable" onClick={() => openRepo(r.id)}>
                      <td>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: T.blueMid, fontWeight: 500 }}>
                          {r.id}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{r.counterparty}</td>
                      <td className="right">
                        <span className="db-num">{fmtMoney(r.amount, r.currency)}</span>
                      </td>
                      <td className="right">
                        <span className="db-num">{r.rate}%</span>
                      </td>
                      <td className="right">
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                          <span className="db-num" style={{ color: coverage >= 103 ? T.green : coverage >= 100 ? T.amber : T.red }}>
                            {coverage}%
                          </span>
                          <div className="db-bar-track" style={{ width: 52 }}>
                            <div className="db-bar-fill" style={{
                              width: `${Math.min((coverage / 130) * 100, 100)}%`,
                              background: coverage >= 103 ? T.green : coverage >= 100 ? T.amber : T.red,
                            }} />
                          </div>
                        </div>
                      </td>
                      <td className="right">
                        <span className="db-num" style={{ color: r.buffer < 0 ? T.red : r.buffer < 100000 ? T.amber : T.green }}>
                          {r.buffer >= 0 ? "+" : ""}{fmtMoney(r.buffer, r.currency)}
                        </span>
                      </td>
                      <td className="right">
                        <div>
                          <span className="db-num" style={{ fontSize: 12, color: daysLeft <= 1 ? T.red : daysLeft <= 3 ? T.amber : T.muted }}>
                            {r.maturityDate}
                          </span>
                          {daysLeft <= 7 && (
                            <div style={{ fontSize: 11, color: daysLeft <= 1 ? T.red : T.amber, fontWeight: 600 }}>
                              {daysLeft === 0 ? "Today" : daysLeft === 1 ? "Tomorrow" : `${daysLeft}d`}
                            </div>
                          )}
                        </div>
                      </td>
                      <td><StatusBadge state={r.state} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Required actions */}
            {actionItems.length > 0 && (
              <div className="db-card" style={{ padding: "16px 20px" }}>
                <SectionLabel>Required Actions</SectionLabel>
                {actionItems.slice(0, 4).map((item, i) => {
                  const color = item.severity === "critical" ? T.red : item.severity === "warning" ? T.amber : T.blueMid;
                  return (
                    <div key={i} className="db-action-row" onClick={() => item.repoId && openRepo(item.repoId)}>
                      <div className="db-action-pill" style={{ background: color }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="db-action-title" style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                          {item.label}
                        </div>
                        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.4 }}>{item.description}</div>
                      </div>
                      {item.repoId && <ChevronRight size={14} style={{ color: T.faint, flexShrink: 0, marginTop: 2 }} />}
                    </div>
                  );
                })}
                {actionItems.length > 4 && (
                  <div style={{ fontSize: 11, color: T.muted, paddingTop: 6 }}>
                    +{actionItems.length - 4} more actions
                  </div>
                )}
              </div>
            )}

            {/* Maturity ladder */}
            <div className="db-card" style={{ padding: "16px 20px" }}>
              <SectionLabel>Maturity Ladder</SectionLabel>
              {maturityLadder.length === 0 ? (
                <div style={{ fontSize: 13, color: T.muted, padding: "8px 0" }}>No upcoming maturities.</div>
              ) : (
                maturityLadder.map((d) => {
                  const daysAway  = Math.ceil((new Date(d.date) - new Date()) / 86400000);
                  const pct       = Math.max(8, Math.round((d.cash / maxCash) * 100));
                  const barColor  = daysAway <= 1 ? T.red : daysAway <= 3 ? T.amber : T.blueMid;
                  return (
                    <div key={d.date} className="db-ladder-row">
                      <div style={{ width: 64, flexShrink: 0 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: barColor }}>
                          {d.date}
                        </div>
                        <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>
                          {daysAway <= 0 ? "TODAY" : daysAway === 1 ? "TMR" : `${daysAway}d`}
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="db-bar-track">
                          <div className="db-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: T.muted, marginTop: 3 }}>
                          {fmtMoney(d.cash)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── Charts row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* Portfolio allocation */}
          <div className="db-card" style={{ padding: "20px 24px" }}>
            <SectionLabel>Portfolio Allocation</SectionLabel>
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              <div style={{ width: 160, height: 160, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusBreakdown} cx="50%" cy="50%" innerRadius={42} outerRadius={68}
                      paddingAngle={3} dataKey="value" strokeWidth={0}>
                      {statusBreakdown.map((e) => (
                        <Cell key={e.name} fill={STATUS_COLORS[e.name] || T.faint} />
                      ))}
                    </Pie>
                    <Tooltip content={({ active, payload }) => <ChartTooltip active={active} payload={payload} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                {statusBreakdown.map((e) => (
                  <div key={e.name} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 10px", borderRadius: 6, background: T.bg,
                    border: `1px solid ${T.border}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: STATUS_COLORS[e.name] || T.faint, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{e.name}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500 }}>{fmtMoney(e.value)}</div>
                      <div style={{ fontSize: 10, color: T.muted }}>
                        {totals.total > 0 ? Math.round((e.value / totals.total) * 100) : 0}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Coverage ratios */}
          <div className="db-card" style={{ padding: "20px 24px" }}>
            <SectionLabel>Coverage Ratios</SectionLabel>
            <div style={{ height: 188 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={coverageData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                  <XAxis dataKey="id" tick={{ fontSize: 11, fill: T.muted, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: T.muted, fontFamily: "var(--font-mono)" }} domain={[85, 130]} unit="%" axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload, label }) => <ChartTooltip active={active} payload={payload} label={`R-${label}`} isBar />} />
                  <Bar dataKey="coverage" radius={[3, 3, 0, 0]}>
                    {coverageData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
              {[{ color: T.green, label: "≥103% compliant" }, { color: T.amber, label: "100–103% watch" }, { color: T.red, label: "<100% deficit" }].map(({ color, label }) => (
                <span key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.muted }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Collateral inventory ── */}
        <div className="db-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 20px 0", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Collateral Inventory</span>
              <span style={{ fontSize: 11, color: T.muted }}>{assets.length} positions · {fmtMoney(totals.total)} total</span>
            </div>
          </div>
          <table className="db-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>ISIN</th>
                <th>Type</th>
                <th className="right">Market Value</th>
                <th className="right">Haircut</th>
                <th className="right">Adjusted Value</th>
                <th>Eligibility</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600, maxWidth: 180 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                  </td>
                  <td><span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: T.muted }}>{a.isin}</span></td>
                  <td style={{ fontSize: 12, color: T.muted }}>{a.type}</td>
                  <td className="right"><span className="db-num">{fmtMoney(a.marketValue, a.currency)}</span></td>
                  <td className="right"><span className="db-num">{a.haircut}%</span></td>
                  <td className="right"><span className="db-num" style={{ color: T.green }}>{fmtMoney(adjustedValue(a), a.currency)}</span></td>
                  <td style={{ fontSize: 11, color: T.muted, maxWidth: 150 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.eligibility}</div>
                  </td>
                  <td><AssetBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Footer ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <CheckCircle2 size={12} style={{ color: T.green }} />
            <span style={{ fontSize: 11, color: T.muted }}>All systems operational · CollateralOS Romania Pilot</span>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: T.faint }}>
            {dateStr} · {timeStr}
          </span>
        </div>

      </div>
    </div>
  );
}
