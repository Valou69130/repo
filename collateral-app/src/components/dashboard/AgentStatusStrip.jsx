// ─── Agent Status Strip ────────────────────────────────────────────────────────
//
// Reads live data from the domain store — no simulated clocks.
// Scan timestamps and counts come from MARGIN_SCAN_COMPLETED reducer updates.
// Exception and allocation panels derive status from actual domain state.

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Cpu, ShieldCheck } from "lucide-react";
import { useDomain } from "@/domain/store";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTs(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString("ro-RO", {
    hour:   "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtElapsed(ms) {
  if (!ms) return "never";
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function fmtCountdown(nextAt) {
  if (!nextAt) return "—";
  const secs = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
  if (secs === 0)  return "now";
  if (secs < 60)   return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ status }) {
  if (status === "alert")   return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
    </span>
  );
  if (status === "warning") return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
    </span>
  );
  if (status === "scanning") return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-300 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
    </span>
  );
  return <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500" />;
}

function MetaCell({ label, value, mono = false, bold = false }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[8.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`text-[10.5px] ${mono ? "font-mono" : ""} ${bold ? "font-semibold text-slate-800" : "text-slate-600"}`}>
        {value}
      </span>
    </div>
  );
}

function AgentPanel({ name, icon: Icon, status, statusText, stats, metaRows, activity }) {
  const borderCls =
    status === "alert"    ? "border-l-red-400"    :
    status === "warning"  ? "border-l-amber-400"  :
    status === "scanning" ? "border-l-blue-300"   :
                            "border-l-emerald-400";

  const healthLabel =
    status === "alert"    ? "Alert"    :
    status === "warning"  ? "Warning"  :
    status === "scanning" ? "Scanning" : "Nominal";

  const healthColor =
    status === "alert"    ? "text-red-600"    :
    status === "warning"  ? "text-amber-600"  :
    status === "scanning" ? "text-blue-500"   : "text-emerald-600";

  return (
    <div className={`rounded-md border border-slate-200 border-l-4 ${borderCls} bg-white flex flex-col`}>
      {/* Header */}
      <div className="px-4 pt-3.5 pb-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] font-semibold uppercase tracking-widest ${healthColor}`}>{healthLabel}</span>
            <StatusDot status={status} />
          </div>
        </div>
        <div className="text-sm font-medium text-slate-800 leading-snug">{statusText}</div>
      </div>

      {/* Real-time metadata */}
      <div className="border-t border-slate-100 px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {metaRows.map((m, i) => (
          <span key={i} className="flex items-center gap-x-3">
            <MetaCell label={m.label} value={m.value} mono={m.mono} bold={m.bold} />
            {i < metaRows.length - 1 && <span className="text-slate-200 text-[10px]">·</span>}
          </span>
        ))}
      </div>

      {/* Stats */}
      {stats.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-2 flex items-center gap-5">
          {stats.map((s) => (
            <div key={s.label} className="flex items-baseline gap-1">
              <span className={`text-sm font-bold tabular-nums leading-none ${s.color}`}>{s.value}</span>
              <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Activity feed */}
      <div className="border-t border-slate-100 px-4 py-2.5 space-y-1">
        {activity.map((line, i) => (
          <div key={i} className="text-[10px] text-slate-500 leading-relaxed flex gap-1.5">
            <span className="text-slate-300 flex-shrink-0">▸</span>
            <span>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function AgentStatusStrip({ repos, assets, notifications, actionItems }) {
  const { agentState } = useDomain();

  // 1 s tick — required for fmtElapsed() and fmtCountdown() to stay current.
  // Both helpers call Date.now() internally; without this tick the displayed
  // "last run X ago" and "next in Xs" values would freeze after each render.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Margin Protection Agent ─────────────────────────────────────────────────
  const marginScan  = agentState.margin.scanResult;
  const isScanning  = agentState.margin.pending;
  const lastScanAt  = agentState.margin.lastScanAt;
  const scanCount   = agentState.margin.scanCount;
  const nextScanAt  = lastScanAt ? lastScanAt + 45_000 : null;

  const activeRepos  = repos.filter((r) => r.state !== "Closed");
  const deficits     = activeRepos.filter((r) => r.buffer < 0);
  const warnings     = activeRepos.filter((r) => r.buffer >= 0 && r.postedCollateral / r.requiredCollateral < 1.03);
  const watchRepos   = activeRepos.filter((r) => r.buffer >= 0 && r.postedCollateral / r.requiredCollateral >= 1.03 && r.buffer < 500_000);

  const marginStatus =
    deficits.length  > 0 ? "alert"    :
    warnings.length  > 0 ? "warning"  :
    isScanning           ? "scanning" : "clear";

  const marginRecs = actionItems.filter((i) => i.type === "margin-deficit" || i.type === "coverage-watch").length;

  // ── Allocation Agent ────────────────────────────────────────────────────────
  const allocPending = Object.values(agentState.allocation.pending).some(Boolean);
  const allocCount   = Object.keys(agentState.allocation.results).length;
  const availAssets  = assets.filter((a) => a.status === "Available");
  const allocRecs    = actionItems.filter((i) => i.type === "substitution-opportunity" || i.type === "pending-approval").length;

  const allocStatus  = allocPending ? "scanning" : "clear";

  // ── Exception Agent ─────────────────────────────────────────────────────────
  const criticalNotifs  = notifications.filter((n) => n.severity === "Critical" || n.type === "Critical");
  const totalOpen       = notifications.filter((n) => !n.read);
  const exceptRecs      = actionItems.filter((i) => i.type === "settlement-exception" || i.type === "reconciliation-issue").length;

  const exceptStatus    = criticalNotifs.length > 0 ? "alert" : "clear";

  return (
    <div className="grid gap-3 md:grid-cols-3">

      {/* ── Margin Protection Agent ────────────────────────────────────────── */}
      <AgentPanel
        name="Margin Protection Agent"
        icon={ShieldCheck}
        status={marginStatus}
        statusText={
          deficits.length > 0
            ? `${deficits.length} repo${deficits.length > 1 ? "s" : ""} under-collateralised — action required`
            : warnings.length > 0
            ? `${warnings.length} position${warnings.length > 1 ? "s" : ""} below 103% threshold`
            : isScanning
            ? "Running margin scan…"
            : scanCount > 0
            ? `Scan clear — ${activeRepos.length} repo${activeRepos.length !== 1 ? "s" : ""} monitored`
            : "Initialising — first scan pending"
        }
        metaRows={[
          { label: "Last run", value: fmtTs(lastScanAt),     mono: true },
          { label: "Next",     value: isScanning ? "scanning…" : fmtCountdown(nextScanAt), mono: true },
          { label: "Scans",    value: String(scanCount),     bold: true },
          { label: "Active recs", value: String(marginRecs), bold: marginRecs > 0 },
        ]}
        stats={[
          { label: "Critical", value: deficits.length,  color: deficits.length  > 0 ? "text-red-600"   : "text-slate-400" },
          { label: "Warning",  value: warnings.length,  color: warnings.length  > 0 ? "text-amber-600" : "text-slate-400" },
          { label: "Watch",    value: watchRepos.length, color: "text-slate-500" },
        ]}
        activity={[
          `Scanned ${activeRepos.length} active repo${activeRepos.length !== 1 ? "s" : ""} · ${assets.length} collateral positions`,
          deficits.length > 0
            ? `Deficit alert${deficits.length > 1 ? "s" : ""} active — ${deficits.map((r) => r.id).join(", ")}`
            : warnings.length > 0
            ? `${warnings.length} position${warnings.length > 1 ? "s" : ""} flagged below 103% coverage threshold`
            : "All positions within collateral requirements",
        ]}
      />

      {/* ── Allocation Agent ───────────────────────────────────────────────── */}
      <AgentPanel
        name="Allocation Agent"
        icon={Cpu}
        status={allocStatus}
        statusText={
          allocPending
            ? "Running allocation analysis…"
            : allocCount > 0
            ? `${allocCount} allocation session${allocCount !== 1 ? "s" : ""} tracked this session`
            : "Standby — awaiting basket request"
        }
        metaRows={[
          { label: "Repos",    value: `${activeRepos.length}` },
          { label: "Assets",   value: `${availAssets.length} available` },
          { label: "Sessions", value: String(allocCount),   bold: allocCount > 0 },
          { label: "Active recs", value: String(allocRecs), bold: allocRecs > 0 },
        ]}
        stats={[
          { label: "Sessions", value: allocCount,              color: "text-slate-700" },
          { label: "Pending",  value: allocPending ? 1 : 0,   color: allocPending ? "text-blue-600" : "text-slate-400" },
          { label: "Avail.",   value: availAssets.length,      color: "text-slate-500" },
        ]}
        activity={[
          `Evaluated ${activeRepos.length} repo${activeRepos.length !== 1 ? "s" : ""} across ${availAssets.length} available asset${availAssets.length !== 1 ? "s" : ""}`,
          allocRecs > 0
            ? `${allocRecs} substitution recommendation${allocRecs > 1 ? "s" : ""} pending approval`
            : "No substitution proposals pending — basket composition optimal",
        ]}
      />

      {/* ── Exception Agent ────────────────────────────────────────────────── */}
      <AgentPanel
        name="Exception Agent"
        icon={AlertTriangle}
        status={exceptStatus}
        statusText={
          criticalNotifs.length > 0
            ? `${criticalNotifs.length} critical exception${criticalNotifs.length > 1 ? "s" : ""} require attention`
            : totalOpen.length > 0
            ? `${totalOpen.length} open notification${totalOpen.length > 1 ? "s" : ""} — no critical items`
            : "All clear — no open exceptions"
        }
        metaRows={[
          { label: "Interval", value: "30 s",                  mono: true },
          { label: "Open",     value: String(totalOpen.length), bold: totalOpen.length > 0 },
          { label: "Critical", value: String(criticalNotifs.length), bold: criticalNotifs.length > 0 },
          { label: "Active recs", value: String(exceptRecs),   bold: exceptRecs > 0 },
        ]}
        stats={[
          { label: "Open",     value: totalOpen.length,      color: totalOpen.length      > 0 ? "text-slate-700" : "text-slate-400" },
          { label: "Critical", value: criticalNotifs.length, color: criticalNotifs.length > 0 ? "text-red-600"   : "text-slate-400" },
          { label: "Resolved", value: notifications.filter((n) => n.read).length, color: "text-slate-400" },
        ]}
        activity={[
          `Monitoring ${activeRepos.length} active repo${activeRepos.length !== 1 ? "s" : ""} · SaFIR settlement + recon + maturity`,
          criticalNotifs.length > 0
            ? `${criticalNotifs.length} unresolved critical exception${criticalNotifs.length > 1 ? "s" : ""} flagged for ops review`
            : "No critical exceptions — SaFIR instruction flow nominal",
        ]}
      />
    </div>
  );
}
