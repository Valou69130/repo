import { useMemo } from "react";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { fmtMoney, adjustedValue } from "@/domain/format";
import { deriveActionItems } from "@/components/dashboard/RecommendedActions";
import { PendingApprovalsWidget } from "@/components/dashboard/PendingApprovalsWidget";
import "./Dashboard.css";

// ─── Theme constants ──────────────────────────────────────────────────────────

const C = {
  text:    "#1C1814",
  muted:   "#78705F",
  faint:   "#B0A898",
  rule:    "#C4BAA8",
  ruleDk:  "#A09080",
  surface: "#E8E4DB",
  accent:  "#8B1A1A",
  green:   "#1A5936",
  amber:   "#8B4500",
  blue:    "#1A2E5A",
};

const STATUS_COLORS = {
  Available: C.green,
  Reserved:  C.amber,
  Locked:    C.blue,
  Pledged:   C.accent,
};

const STATUS_ABBR = {
  Active:          "ACT",
  Maturing:        "MAT",
  "Margin deficit":"DEF",
  Pending:         "PND",
  Closed:          "CLO",
};

// ─── Tooltip components ───────────────────────────────────────────────────────

const DbTooltip = ({ active, payload, label, isBar }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="db-tooltip">
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{label ?? payload[0].name}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
        {isBar ? `${payload[0].value}%` : fmtMoney(payload[0].value)}
      </div>
    </div>
  );
};

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHead({ title, right }) {
  return (
    <div className="db-section-head" style={{ marginBottom: "1rem" }}>
      <h2>{title}</h2>
      <div className="db-rule-fill" />
      {right && (
        <span style={{ fontSize: "0.62rem", letterSpacing: "0.1em", color: C.muted, whiteSpace: "nowrap" }}>
          {right}
        </span>
      )}
    </div>
  );
}

// ─── Status display ───────────────────────────────────────────────────────────

function RepoStatus({ state }) {
  const color =
    state === "Margin deficit" ? C.accent :
    state === "Maturing"       ? C.amber  :
    state === "Active"         ? C.green  : C.muted;
  return (
    <span className="db-status" style={{ color, borderColor: color }}>
      {STATUS_ABBR[state] ?? state.slice(0, 3).toUpperCase()}
    </span>
  );
}

function AssetStatus({ status }) {
  const color = STATUS_COLORS[status] ?? C.muted;
  return (
    <span className="db-status" style={{ color, borderColor: color }}>
      {status.slice(0, 4).toUpperCase()}
    </span>
  );
}

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
}) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  const timeStr = today.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  // ── Derived data ──────────────────────────────────────────────────────────

  const totals = useMemo(() => {
    const total    = assets.reduce((s, a) => s + a.marketValue, 0);
    const free     = assets.filter((a) => a.status === "Available").reduce((s, a) => s + a.marketValue, 0);
    const locked   = assets.filter((a) => a.status === "Locked").reduce((s, a) => s + a.marketValue, 0);
    const active   = repos.filter((r) => ["Active", "Maturing", "Margin deficit"].includes(r.state)).length;
    const deficits = repos.filter((r) => r.buffer < 0).length;
    const accrued  = repos
      .filter((r) => r.state !== "Closed")
      .reduce((s, r) => s + Math.round(r.amount * (r.rate / 100) / 360), 0);
    return { total, free, locked, active, deficits, accrued };
  }, [assets, repos]);

  const actionItems = useMemo(
    () => deriveActionItems(repos, assets, notifications, pendingSubstitutions),
    [repos, assets, notifications, pendingSubstitutions]
  );

  const statusBreakdown = useMemo(() => {
    const groups = { Available: 0, Reserved: 0, Locked: 0, Pledged: 0 };
    assets.forEach((a) => { if (groups[a.status] !== undefined) groups[a.status] += a.marketValue; });
    return Object.entries(groups).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
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
    return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  }, [repos]);

  const coverageData = useMemo(() =>
    repos
      .filter((r) => r.state !== "Closed")
      .map((r) => ({
        id:       r.id.replace("R-", ""),
        coverage: Math.round((r.postedCollateral / r.requiredCollateral) * 100),
        fill:
          r.buffer < 0 ? C.accent :
          r.postedCollateral / r.requiredCollateral < 1.03 ? C.amber : C.green,
      })),
    [repos]
  );

  const activeRepos = repos.filter((r) => r.state !== "Closed");
  const maxCash = Math.max(...maturityLadder.map((d) => d.cash), 1);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="db" style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>

      {/* ── Masthead ── */}
      <div style={{ borderBottom: `3px solid ${C.text}`, padding: "0.75rem 1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{
              fontFamily:    "var(--font-ui)",
              fontSize:      "0.6rem",
              fontWeight:    600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color:         C.muted,
              marginBottom:  "0.2rem",
            }}>
              Romania Pilot · Treasury Operations
            </div>
            <div style={{
              fontFamily:    "var(--font-serif)",
              fontSize:      "1.5rem",
              fontWeight:    700,
              letterSpacing: "-0.01em",
              lineHeight:    1,
              color:         C.text,
            }}>
              Collateral Operating Desk
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              fontFamily:    "var(--font-mono)",
              fontSize:      "0.82rem",
              fontWeight:    500,
              letterSpacing: "0.04em",
              color:         C.text,
            }}>
              {dateStr}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.2rem" }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: C.green, display: "inline-block",
                animation: "pulse 2s infinite",
              }} />
              <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: C.green }}>
                LIVE · {timeStr}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Alert bar ── */}
      {totals.deficits > 0 && (
        <div className="db-alert">
          <span style={{ background: "#FAF7F0", color: C.accent, width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "0.7rem", flexShrink: 0 }}>
            ▲
          </span>
          MARGIN DEFICIT ALERT — {totals.deficits} REPO{totals.deficits > 1 ? "S" : ""} BELOW THRESHOLD · IMMEDIATE ACTION REQUIRED
        </div>
      )}

      {/* ── KPI bar ── */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.ruleDk}`, background: C.surface }}>
        {[
          { label: "Total Collateral Pool",   value: fmtMoney(totals.total),    sub: `${assets.length} registered positions`          },
          { label: "Free / Unencumbered",      value: fmtMoney(totals.free),     sub: `${totals.total > 0 ? Math.round(totals.free / totals.total * 100) : 0}% of pool available` },
          { label: "Locked in Repos",          value: fmtMoney(totals.locked),   sub: `Supporting ${totals.active} open trades`        },
          { label: "Active Repo Book",         value: String(totals.active),     sub: totals.deficits > 0 ? `▲ ${totals.deficits} deficit${totals.deficits > 1 ? "s" : ""}` : "All within threshold", numColor: totals.deficits > 0 ? C.accent : C.text },
          { label: "Accrued Interest — Today", value: fmtMoney(totals.accrued),  sub: "Estimated carry on open book"                   },
        ].map(({ label, value, sub, numColor }) => (
          <div key={label} className="db-kpi">
            <div className="db-kpi-label">{label}</div>
            <div className="db-kpi-value" style={{ color: numColor || C.text }}>{value}</div>
            <div className="db-kpi-sub">{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, padding: "1.5rem", display: "flex", flexDirection: "column", gap: "2rem" }}>

        {/* ── Pending 4-eye approvals ── */}
        {pendingSubstitutions.length > 0 && (
          <div>
            <SectionHead title="Pending 4-Eye Approvals" right={`${pendingSubstitutions.length} awaiting`} />
            <div style={{ border: `1px solid ${C.ruleDk}`, padding: "1rem" }}>
              <PendingApprovalsWidget
                pendingSubstitutions={pendingSubstitutions}
                assets={assets}
                repos={repos}
                role={role}
                onApproveSubstitution={onApproveSubstitution}
                onRejectSubstitution={onRejectSubstitution}
              />
            </div>
          </div>
        )}

        {/* ── Required actions ── */}
        {actionItems.length > 0 && (
          <div>
            <SectionHead title="Required Actions" right={`${actionItems.length} open`} />
            <div>
              {actionItems.slice(0, 5).map((item, i) => {
                const markerColor =
                  item.severity === "critical" ? C.accent :
                  item.severity === "warning"  ? C.amber  : C.blue;
                return (
                  <div key={i} className="db-action-item" onClick={() => item.repoId && openRepo(item.repoId)}>
                    <div className="db-action-marker" style={{ background: markerColor }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="db-action-text" style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.15rem" }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: "0.73rem", color: C.muted }}>{item.description}</div>
                    </div>
                    {item.repoId && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: C.faint, flexShrink: 0 }}>
                        {item.repoId} →
                      </span>
                    )}
                  </div>
                );
              })}
              {actionItems.length > 5 && (
                <div style={{ paddingTop: "0.5rem", fontSize: "0.7rem", color: C.muted, letterSpacing: "0.06em" }}>
                  + {actionItems.length - 5} more actions
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Main two-column: Repo book + Maturity ladder ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "2.5rem" }}>

          {/* Active repo book */}
          <div>
            <SectionHead title="Active Repo Book" right={`${activeRepos.length} open trades`} />
            <table className="db-table">
              <thead>
                <tr>
                  <th>Ref</th>
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
                  const coverage  = Math.round((r.postedCollateral / r.requiredCollateral) * 100);
                  const daysLeft  = Math.max(0, Math.ceil((new Date(r.maturityDate) - new Date()) / 86400000));
                  const bufferColor = r.buffer < 0 ? C.accent : r.buffer < 50000 ? C.amber : C.green;
                  return (
                    <tr key={r.id} onClick={() => openRepo(r.id)}>
                      <td>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: C.muted }}>
                          {r.id}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{r.counterparty}</td>
                      <td className="right" style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}>
                        {fmtMoney(r.amount, r.currency)}
                      </td>
                      <td className="right" style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}>
                        {r.rate}%
                      </td>
                      <td className="right">
                        <span style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.82rem",
                          fontWeight: 500,
                          color: coverage >= 103 ? C.green : coverage >= 100 ? C.amber : C.accent,
                        }}>
                          {coverage}%
                        </span>
                      </td>
                      <td className="right">
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: bufferColor }}>
                          {r.buffer >= 0 ? "+" : ""}{fmtMoney(r.buffer, r.currency)}
                        </span>
                      </td>
                      <td className="right">
                        <span style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.78rem",
                          color: daysLeft <= 1 ? C.accent : daysLeft <= 3 ? C.amber : C.muted,
                        }}>
                          {r.maturityDate}
                          {daysLeft <= 3 && (
                            <span style={{ marginLeft: "0.35rem", fontSize: "0.62rem" }}>
                              ({daysLeft}d)
                            </span>
                          )}
                        </span>
                      </td>
                      <td><RepoStatus state={r.state} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Maturity ladder */}
          <div>
            <SectionHead title="Maturity Ladder" />
            {maturityLadder.length === 0 ? (
              <div style={{ color: C.muted, fontSize: "0.8rem", paddingTop: "1rem" }}>No upcoming maturities.</div>
            ) : (
              maturityLadder.map((d) => {
                const daysAway   = Math.ceil((new Date(d.date) - new Date()) / 86400000);
                const barWidth   = `${Math.max(8, Math.round((d.cash / maxCash) * 100))}%`;
                const dateColor  = daysAway <= 1 ? C.accent : daysAway <= 3 ? C.amber : C.text;
                return (
                  <div key={d.date} className="db-ladder-item">
                    <div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", fontWeight: 500, color: dateColor }}>
                        {d.date}
                      </div>
                      <div style={{ fontSize: "0.6rem", color: C.muted, marginTop: "0.1rem", letterSpacing: "0.04em" }}>
                        {daysAway <= 0 ? "TODAY" : daysAway === 1 ? "TOMORROW" : `IN ${daysAway}D`}
                      </div>
                    </div>
                    <div>
                      <div className="db-ladder-bar" style={{ width: barWidth, background: dateColor }} />
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", marginTop: "0.2rem", color: C.muted }}>
                        {fmtMoney(d.cash)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: C.muted }}>
                        {d.repos.join(" ")}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Charts row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.5rem" }}>

          {/* Portfolio allocation */}
          <div>
            <SectionHead title="Portfolio Allocation" right="By encumbrance status" />
            <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
              <div style={{ width: 160, height: 160, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusBreakdown} cx="50%" cy="50%" innerRadius={40} outerRadius={68}
                      paddingAngle={2} dataKey="value" strokeWidth={0}>
                      {statusBreakdown.map((e) => (
                        <Cell key={e.name} fill={STATUS_COLORS[e.name] || C.muted} />
                      ))}
                    </Pie>
                    <Tooltip content={({ active, payload }) => (
                      <DbTooltip active={active} payload={payload} />
                    )} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1 }}>
                {statusBreakdown.map((e) => (
                  <div key={e.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.4rem 0", borderBottom: `1px solid ${C.rule}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div className="db-dot" style={{ background: STATUS_COLORS[e.name] || C.muted }} />
                      <span style={{ fontSize: "0.78rem" }}>{e.name}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{fmtMoney(e.value)}</div>
                      <div style={{ fontSize: "0.6rem", color: C.muted }}>
                        {totals.total > 0 ? Math.round((e.value / totals.total) * 100) : 0}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Coverage ratios */}
          <div>
            <SectionHead title="Repo Coverage Ratios" right="Posted / required · 103% min" />
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={coverageData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.rule} vertical={false} />
                  <XAxis dataKey="id" tick={{ fontSize: 10, fill: C.muted, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.muted, fontFamily: "var(--font-mono)" }} domain={[85, 130]} unit="%" axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload, label }) => (
                    <DbTooltip active={active} payload={payload} label={`R-${label}`} isBar />
                  )} />
                  <Bar dataKey="coverage" radius={0}>
                    {coverageData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: "1.25rem", marginTop: "0.5rem" }}>
              {[
                { color: C.green,  label: "≥103% compliant" },
                { color: C.amber,  label: "100–103% watch" },
                { color: C.accent, label: "<100% deficit" },
              ].map(({ color, label }) => (
                <span key={label} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.65rem", color: C.muted }}>
                  <span className="db-dot" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Collateral inventory ── */}
        <div>
          <SectionHead title="Collateral Inventory" right={`${assets.length} positions`} />
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
                <tr key={a.id} style={{ cursor: "default" }}>
                  <td style={{ fontWeight: 500, maxWidth: 180 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                  </td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: C.muted }}>{a.isin}</td>
                  <td style={{ fontSize: "0.75rem", color: C.muted }}>{a.type}</td>
                  <td className="right" style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                    {fmtMoney(a.marketValue, a.currency)}
                  </td>
                  <td className="right" style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                    {a.haircut}%
                  </td>
                  <td className="right" style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: C.green }}>
                    {fmtMoney(adjustedValue(a), a.currency)}
                  </td>
                  <td style={{ fontSize: "0.72rem", color: C.muted, maxWidth: 160 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.eligibility}</div>
                  </td>
                  <td><AssetStatus status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Footer ── */}
        <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.62rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>
            CollateralOS · Romania Pilot · All values in RON unless stated
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: C.faint }}>
            Session · {dateStr} {timeStr}
          </span>
        </div>

      </div>
    </div>
  );
}
