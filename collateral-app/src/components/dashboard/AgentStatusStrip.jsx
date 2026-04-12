import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Cpu, ShieldCheck } from "lucide-react";
import { useDomain } from "@/domain/store";

// ─── Agent runtime clock ───────────────────────────────────────────────────────
// Simulates a recurring scan loop for a single agent.
// intervalSecs  — how often the agent re-scans (demo-safe, not real network calls)
// initialOffset — seconds since last scan when component first mounts (adds variety)

function useAgentClock(intervalSecs, initialOffset = 0) {
  const [clock, setClock] = useState(() => ({
    lastRunTs: Date.now() - initialOffset * 1000,
    scanCount: 42 + Math.floor(initialOffset / intervalSecs) + Math.floor(Math.random() * 8),
  }));
  const [now, setNow] = useState(() => Date.now());
  const [isScanning, setIsScanning] = useState(false);
  const scanningRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      const currentNow = Date.now();
      const elapsed = (currentNow - clock.lastRunTs) / 1000;
      if (elapsed >= intervalSecs && !scanningRef.current) {
        scanningRef.current = true;
        setIsScanning(true);
        setTimeout(() => {
          const completedAt = Date.now();
          setClock((prev) => ({
            lastRunTs: completedAt,
            scanCount: prev.scanCount + 1,
          }));
          scanningRef.current  = false;
          setIsScanning(false);
          setNow(completedAt);
        }, 700);
      } else {
        setNow(currentNow);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [clock.lastRunTs, intervalSecs]);

  const elapsed     = Math.floor((now - clock.lastRunTs) / 1000);
  const nextScanIn  = Math.max(0, intervalSecs - elapsed);
  const lastRunTs   = clock.lastRunTs;
  const scanCount   = clock.scanCount;

  return { lastRunTs, scanCount, nextScanIn, isScanning };
}

function fmtTs(ms) {
  return new Date(ms).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtCountdown(secs) {
  if (secs <= 0) return "now";
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function AgentStatusDot({ status }) {
  if (status === "alert")   return <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" /></span>;
  if (status === "warning") return <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" /></span>;
  if (status === "scanning") return <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-300 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" /></span>;
  return <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500" />;
}

function MetaCell({ label, value, mono = false, bold = false }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[8.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`text-[10.5px] ${mono ? "font-mono" : ""} ${bold ? "font-semibold text-slate-800" : "text-slate-600"}`}>{value}</span>
    </div>
  );
}

function AgentPanel({ name, icon: Icon, status, statusText, stats, evaluated, activeRecs, lastRecLabel, activity, clock }) {
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
            <AgentStatusDot status={status} />
          </div>
        </div>
        <div className="text-sm font-medium text-slate-800 leading-snug">{statusText}</div>
      </div>

      {/* Operational metadata — inline key:value strip */}
      <div className="border-t border-slate-100 px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <MetaCell label="Run"  value={fmtTs(clock.lastRunTs)} mono />
        <span className="text-slate-200 text-[10px]">·</span>
        <MetaCell label="Next" value={clock.isScanning ? "scanning…" : `in ${fmtCountdown(clock.nextScanIn)}`} mono />
        <span className="text-slate-200 text-[10px]">·</span>
        <MetaCell label="Evaluated" value={evaluated} />
        <span className="text-slate-200 text-[10px]">·</span>
        <MetaCell label="Active recs" value={String(activeRecs)} bold />
      </div>

      {/* Stats row */}
      {stats.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-2 flex items-center gap-5">
          {stats.map((s) => (
            <div key={s.label} className="flex items-baseline gap-1">
              <span className={`text-sm font-bold tabular-nums leading-none ${s.color}`}>{s.value}</span>
              <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">{s.label}</span>
            </div>
          ))}
          {lastRecLabel && (
            <div className="ml-auto text-[9px] text-slate-400 font-mono truncate max-w-[120px]" title={lastRecLabel}>
              ↳ {lastRecLabel}
            </div>
          )}
        </div>
      )}

      {/* Scan #N and activity feed */}
      <div className="border-t border-slate-100 px-4 py-2.5 space-y-1">
        <div className="text-[9px] font-mono text-slate-400">
          Scan #{clock.scanCount} · {fmtTs(clock.lastRunTs)}
        </div>
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

export function AgentStatusStrip({ repos, assets, notifications, actionItems }) {
  const { agentState } = useDomain();

  // Per-agent scan clocks — staggered offsets so they don't all fire together
  const marginClock  = useAgentClock(45,  12);   // every 45s, was last run 12s ago
  const allocClock   = useAgentClock(120, 37);   // every 2 min, was last run 37s ago
  const exceptClock  = useAgentClock(30,  8);    // every 30s, was last run 8s ago

  // Domain-derived counts
  const marginScan   = agentState.margin.scanResult;
  const allocPending = Object.values(agentState.allocation.pending).some(Boolean);
  const allocCount   = Object.keys(agentState.allocation.results).length;

  const activeRepos    = repos.filter((r) => r.state !== "Closed");
  const deficits       = activeRepos.filter((r) => r.buffer < 0);
  const warnings       = activeRepos.filter((r) => r.buffer >= 0 && r.postedCollateral / r.requiredCollateral < 1.03);
  const watchRepos     = activeRepos.filter((r) => r.buffer >= 0 && r.postedCollateral / r.requiredCollateral >= 1.03 && r.buffer < 500000);
  const availableAssets = assets.filter((a) => a.status === "Available");
  const criticalNotifs = notifications.filter((n) => n.severity === "Critical" || n.type === "Critical");
  const totalOpen      = notifications.filter((n) => !n.read);

  const marginStatus   = deficits.length > 0 ? "alert" : warnings.length > 0 ? "warning" : marginClock.isScanning ? "scanning" : "clear";
  const allocStatus    = allocPending ? "scanning" : allocClock.isScanning ? "scanning" : "clear";
  const exceptStatus   = criticalNotifs.length > 0 ? "alert" : exceptClock.isScanning ? "scanning" : "clear";

  // Active recs per agent (count items by type)
  const marginRecs     = actionItems.filter((i) => i.type === "margin-deficit" || i.type === "coverage-watch").length;
  const allocRecs      = actionItems.filter((i) => i.type === "substitution-opportunity" || i.type === "pending-approval").length;
  const exceptRecs     = actionItems.filter((i) => i.type === "settlement-exception" || i.type === "reconciliation-issue").length;

  // Last recommendation label (title of most recent matching item)
  const lastMarginRec  = actionItems.find((i) => i.type === "margin-deficit" || i.type === "coverage-watch")?.title ?? null;
  const lastAllocRec   = actionItems.find((i) => i.type === "substitution-opportunity" || i.type === "pending-approval")?.title ?? null;
  const lastExceptRec  = actionItems.find((i) => i.type === "settlement-exception" || i.type === "reconciliation-issue")?.title ?? null;

  return (
    <div className="grid gap-3 md:grid-cols-3">

      {/* ── Margin Protection Agent ───────────────────────────────────────── */}
      <AgentPanel
        name="Margin Protection Agent"
        icon={ShieldCheck}
        status={marginStatus}
        statusText={
          deficits.length > 0
            ? `${deficits.length} repo(s) under-collateralised — action required`
            : warnings.length > 0
            ? `${warnings.length} position(s) below 103% threshold`
            : marginScan
            ? `Scan clear — ${marginScan.totalActive ?? activeRepos.length} repo(s) monitored`
            : "Continuous monitoring — all positions in compliance"
        }
        clock={marginClock}
        evaluated={`${activeRepos.length} repo${activeRepos.length !== 1 ? "s" : ""}`}
        activeRecs={marginRecs}
        lastRecLabel={lastMarginRec}
        stats={[
          { label: "Critical", value: deficits.length,  color: deficits.length > 0  ? "text-red-600"   : "text-slate-400" },
          { label: "Warning",  value: warnings.length,  color: warnings.length > 0  ? "text-amber-600" : "text-slate-400" },
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

      {/* ── Allocation Agent ──────────────────────────────────────────────── */}
      <AgentPanel
        name="Allocation Agent"
        icon={Cpu}
        status={allocStatus}
        statusText={
          allocPending
            ? "Running allocation analysis…"
            : allocCount > 0
            ? `${allocCount} allocation session${allocCount !== 1 ? "s" : ""} tracked`
            : "Standby — monitoring basket composition"
        }
        clock={allocClock}
        evaluated={`${activeRepos.length} repo${activeRepos.length !== 1 ? "s" : ""} · ${availableAssets.length} assets`}
        activeRecs={allocRecs}
        lastRecLabel={lastAllocRec}
        stats={[
          { label: "Sessions", value: allocCount,                               color: "text-slate-700" },
          { label: "Pending",  value: allocPending ? 1 : 0,                    color: allocPending ? "text-blue-600" : "text-slate-400" },
          { label: "Avail.",   value: availableAssets.length,                  color: "text-slate-500" },
        ]}
        activity={[
          `Evaluated ${activeRepos.length} repo${activeRepos.length !== 1 ? "s" : ""} across ${availableAssets.length} available asset${availableAssets.length !== 1 ? "s" : ""}`,
          allocRecs > 0
            ? `${allocRecs} substitution recommendation${allocRecs > 1 ? "s" : ""} pending approval`
            : "No substitution proposals pending — basket composition optimal",
        ]}
      />

      {/* ── Exception Agent ───────────────────────────────────────────────── */}
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
        clock={exceptClock}
        evaluated={`${notifications.length} notification${notifications.length !== 1 ? "s" : ""}`}
        activeRecs={exceptRecs}
        lastRecLabel={lastExceptRec}
        stats={[
          { label: "Open",     value: totalOpen.length,      color: totalOpen.length > 0      ? "text-slate-700" : "text-slate-400" },
          { label: "Critical", value: criticalNotifs.length, color: criticalNotifs.length > 0 ? "text-red-600"   : "text-slate-400" },
          { label: "Resolved", value: notifications.filter((n) => n.read).length, color: "text-slate-400" },
        ]}
        activity={[
          `Reviewed ${notifications.length} instruction${notifications.length !== 1 ? "s" : ""} · ${totalOpen.length} open item${totalOpen.length !== 1 ? "s" : ""}`,
          criticalNotifs.length > 0
            ? `${criticalNotifs.length} unresolved critical exception${criticalNotifs.length > 1 ? "s" : ""} flagged for ops review`
            : "No critical exceptions — SaFIR instruction flow nominal",
        ]}
      />

    </div>
  );
}
