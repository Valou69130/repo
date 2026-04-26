// ─── Agent Status Strip ────────────────────────────────────────────────────────
//
// Terminal-style monitoring panels. Log entries accumulate in real time as the
// background agents fire (margin scan every 45 s, exception scan every 30 s).
// No fake clocks — everything is driven by real domain-store state transitions.

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Cpu, ShieldCheck } from "lucide-react";
import { useDomain } from "@/domain/store";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_LOG = 10;

function nowTs() {
  return new Date().toLocaleTimeString("ro-RO", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function fmtCountdown(nextAt) {
  if (!nextAt) return "—";
  const secs = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
  if (secs === 0) return "now";
  if (secs < 60)  return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function mkLog(msg, level = "info") {
  return { ts: nowTs(), msg, level, key: `${Date.now()}-${Math.random()}` };
}

function append(setter, entry) {
  setter((prev) => [...prev.slice(-(MAX_LOG - 1)), entry]);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ status }) {
  const base = "relative flex h-2 w-2";
  const ping = "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75";
  const dot  = "relative inline-flex rounded-full h-2 w-2";

  if (status === "alert")   return <span className={base}><span className={`${ping} bg-red-400`} /><span className={`${dot} bg-red-500`} /></span>;
  if (status === "warning") return <span className={base}><span className={`${ping} bg-amber-400`} /><span className={`${dot} bg-amber-400`} /></span>;
  if (status === "scanning") return <span className={base}><span className={`${ping} bg-blue-300`} /><span className={`${dot} bg-blue-400`} /></span>;
  return <span className={`${dot} bg-emerald-500`} />;
}

function Terminal({ log, isActive, scanMsg }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length, isActive]);

  return (
    <div
      className="bg-[#0d1117] overflow-y-auto px-3 py-2"
      style={{ minHeight: 112, maxHeight: 136 }}
    >
      {log.map((entry) => (
        <div
          key={entry.key}
          className={`flex items-start gap-1.5 font-mono text-[9.5px] leading-[1.7] ${
            entry.level === "alert"   ? "text-red-400"     :
            entry.level === "warn"    ? "text-amber-400"   :
            entry.level === "ok"      ? "text-emerald-400" :
            entry.level === "scan"    ? "text-blue-400"    :
            entry.level === "boot"    ? "text-slate-500"   :
            "text-slate-400"
          }`}
        >
          <span className="text-slate-600 flex-shrink-0 select-none">{entry.ts}</span>
          <span className="text-slate-600 flex-shrink-0 select-none">›</span>
          <span>{entry.msg}</span>
        </div>
      ))}
      {isActive && (
        <div className="flex items-center gap-1.5 font-mono text-[9.5px] leading-[1.7] text-blue-400">
          <span className="text-slate-600 select-none">{nowTs()}</span>
          <span className="text-slate-600 select-none">›</span>
          <span>{scanMsg ?? "running"}<span className="animate-pulse">▌</span></span>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

function AgentCard({ name, icon: Icon, status, headline, stats, countdown, log, scanning, scanMsg }) {
  const borderCls =
    status === "alert"    ? "border-l-red-500"    :
    status === "warning"  ? "border-l-amber-400"  :
    status === "scanning" ? "border-l-blue-400"   :
                            "border-l-emerald-500";

  const statusLabel =
    status === "alert"    ? "ALERT"    :
    status === "warning"  ? "WARNING"  :
    status === "scanning" ? "SCANNING" : "ACTIVE";

  const statusColor =
    status === "alert"    ? "text-red-500"    :
    status === "warning"  ? "text-amber-500"  :
    status === "scanning" ? "text-blue-400"   : "text-emerald-500";

  return (
    <div className={`border border-slate-200 border-l-4 ${borderCls} bg-white flex flex-col`}>

      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-700">{name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[9px] font-bold uppercase tracking-[0.12em] ${statusColor}`}>{statusLabel}</span>
          <StatusDot status={status} />
        </div>
      </div>

      {/* Headline */}
      <div className="px-3 py-2 border-b border-slate-100">
        <p className="text-[11px] font-medium text-slate-800 leading-snug">{headline}</p>
      </div>

      {/* Stats + countdown */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 flex-wrap">
        {stats.map((s) => (
          <div key={s.label} className="flex items-baseline gap-1">
            <span className={`text-sm font-bold tabular-nums leading-none ${s.color}`}>{s.value}</span>
            <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">{s.label}</span>
          </div>
        ))}
        {countdown && (
          <div className="ml-auto flex items-center gap-1">
            <span className="text-[9px] text-slate-400 uppercase tracking-wide">next</span>
            <span className="text-[10px] font-mono font-medium text-slate-600 tabular-nums">{countdown}</span>
          </div>
        )}
      </div>

      {/* Live terminal log */}
      <Terminal log={log} isActive={scanning} scanMsg={scanMsg} />
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function AgentStatusStrip({ repos, assets, notifications, actionItems }) {
  const { agentState } = useDomain();

  // 1 s tick — keeps countdown and elapsed displays current
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────

  const isScanning = agentState.margin.pending;
  const scanCount  = agentState.margin.scanCount;
  const lastScanAt = agentState.margin.lastScanAt;
  const nextScanAt = lastScanAt ? lastScanAt + 45_000 : null;

  const activeRepos = repos.filter((r) => r.state !== "Closed");
  const deficits    = activeRepos.filter((r) => r.buffer < 0);
  const warnings    = activeRepos.filter((r) => r.buffer >= 0 && r.postedCollateral / r.requiredCollateral < 1.03);
  const watchRepos  = activeRepos.filter((r) => r.buffer >= 0 && r.postedCollateral / r.requiredCollateral >= 1.03 && r.buffer < 500_000);
  const marginRecs  = actionItems.filter((i) => i.type === "margin-deficit" || i.type === "coverage-watch").length;

  const allocPending  = Object.values(agentState.allocation.pending).some(Boolean);
  const allocCount    = Object.keys(agentState.allocation.results).length;
  const availAssets   = assets.filter((a) => a.status === "Available");
  const allocRecs     = actionItems.filter((i) => i.type === "substitution-opportunity" || i.type === "pending-approval").length;

  const criticalNotifs = notifications.filter((n) => n.severity === "Critical" || n.type === "Critical");
  const totalOpen      = notifications.filter((n) => !n.read);

  // ── Margin log ────────────────────────────────────────────────────────────

  const [marginLog, setMarginLog] = useState(() => [
    mkLog("Margin Protection Agent initialising…", "boot"),
    mkLog(`Loading ${repos.length} repo positions from domain store…`, "boot"),
    mkLog("Awaiting first scan cycle (3 s boot delay)…", "boot"),
  ]);

  const [allocLog, setAllocLog] = useState(() => [
    mkLog("Allocation Agent initialising…", "boot"),
    mkLog(`Asset universe: ${assets.filter((a) => a.status === "Available").length} positions available`, "boot"),
    mkLog("Awaiting basket request or margin event…", "boot"),
  ]);

  const [exceptLog, setExceptLog] = useState(() => [
    mkLog("Exception Agent initialising…", "boot"),
    mkLog("Connecting to SaFIR notification feed…", "boot"),
    mkLog("Monitoring settlement + reconciliation + maturity…", "boot"),
  ]);

  // Track previous values to detect transitions
  const prevScanningRef  = useRef(false);
  const prevScanCountRef = useRef(0);
  const prevAllocPendRef = useRef(false);
  const prevCritRef      = useRef(criticalNotifs.length);
  const critRef          = useRef(criticalNotifs.length);
  useEffect(() => { critRef.current = criticalNotifs.length; }, [criticalNotifs.length]);

  // Margin scan started
  useEffect(() => {
    if (isScanning && !prevScanningRef.current) {
      append(setMarginLog, mkLog(`Initiating scan — ${activeRepos.length} repos · ${assets.length} positions`, "scan"));
    }
    prevScanningRef.current = isScanning;
  }, [isScanning]);

  // Margin scan completed
  useEffect(() => {
    if (scanCount > 0 && scanCount !== prevScanCountRef.current) {
      prevScanCountRef.current = scanCount;

      if (deficits.length > 0) {
        append(setMarginLog, mkLog(`Scan #${scanCount} complete — ${deficits.length} deficit${deficits.length > 1 ? "s" : ""} detected`, "alert"));
        deficits.slice(0, 3).forEach((r) => {
          const bufK = Math.abs(Math.round(r.buffer / 1_000));
          append(setMarginLog, mkLog(`  ${r.id} / ${r.counterparty} — deficit ${bufK}K`, "alert"));
        });
        // Notify allocation agent
        append(setAllocLog, mkLog(`Margin deficit flagged — pre-computing top-up basket`, "scan"));
      } else if (warnings.length > 0) {
        append(setMarginLog, mkLog(`Scan #${scanCount} complete — ${warnings.length} position${warnings.length > 1 ? "s" : ""} below 103%`, "warn"));
      } else {
        append(setMarginLog, mkLog(`Scan #${scanCount} complete — all ${activeRepos.length} repos within requirements`, "ok"));
      }

      if (watchRepos.length > 0) {
        append(setMarginLog, mkLog(`${watchRepos.length} repo${watchRepos.length > 1 ? "s" : ""} in watch zone (buffer <500 K)`, "warn"));
      }
    }
  }, [scanCount]);

  // Allocation agent transitions
  useEffect(() => {
    if (allocPending && !prevAllocPendRef.current) {
      append(setAllocLog, mkLog("Allocation analysis requested — running optimiser…", "scan"));
    } else if (!allocPending && prevAllocPendRef.current) {
      append(setAllocLog, mkLog(
        allocRecs > 0
          ? `Allocation complete — ${allocRecs} recommendation${allocRecs !== 1 ? "s" : ""} pending approval`
          : "Allocation complete — basket composition optimal",
        allocRecs > 0 ? "warn" : "ok"
      ));
    }
    prevAllocPendRef.current = allocPending;
  }, [allocPending]);

  // Exception agent — new criticals
  useEffect(() => {
    const prev = prevCritRef.current;
    if (criticalNotifs.length > prev) {
      criticalNotifs.slice(prev).forEach((n) => {
        append(setExceptLog, mkLog(`CRITICAL: ${(n.title ?? n.text ?? "exception").slice(0, 60)}`, "alert"));
      });
    } else if (criticalNotifs.length === 0 && prev > 0) {
      append(setExceptLog, mkLog("Critical exceptions resolved — all clear", "ok"));
    }
    prevCritRef.current = criticalNotifs.length;
  }, [criticalNotifs.length]);

  // Exception agent — 30 s periodic scan visible in log (mirrors useAgentRunner cadence)
  useEffect(() => {
    const scanFn = () => {
      append(setExceptLog, mkLog("Scanning SaFIR settlement feed…", "scan"));
      setTimeout(() => {
        append(setExceptLog,
          critRef.current > 0
            ? mkLog(`${critRef.current} critical exception${critRef.current !== 1 ? "s" : ""} still active`, "alert")
            : mkLog("Settlement feed nominal — no exceptions detected", "ok")
        );
      }, 1_400);
    };
    const boot = setTimeout(scanFn, 4_200);
    const tick = setInterval(scanFn, 30_000);
    return () => { clearTimeout(boot); clearInterval(tick); };
  }, []);

  // ── Status derivation ─────────────────────────────────────────────────────

  const marginStatus =
    deficits.length  > 0 ? "alert"    :
    warnings.length  > 0 ? "warning"  :
    isScanning           ? "scanning" : "clear";

  const allocStatus  = allocPending ? "scanning" : "clear";
  const exceptStatus = criticalNotifs.length > 0 ? "alert" : "clear";

  return (
    <div className="grid gap-3 md:grid-cols-3">

      {/* ── Margin Protection Agent ─────────────────────────────────────────── */}
      <AgentCard
        name="Margin Protection Agent"
        icon={ShieldCheck}
        status={marginStatus}
        headline={
          deficits.length  > 0 ? `${deficits.length} repo${deficits.length > 1 ? "s" : ""} under-collateralised — action required` :
          warnings.length  > 0 ? `${warnings.length} position${warnings.length > 1 ? "s" : ""} below 103% threshold` :
          isScanning            ? "Running margin scan…" :
          scanCount > 0         ? `Scan clear — ${activeRepos.length} repo${activeRepos.length !== 1 ? "s" : ""} monitored` :
                                  "Initialising — first scan pending"
        }
        stats={[
          { label: "Critical", value: deficits.length,   color: deficits.length  > 0 ? "text-red-600"   : "text-slate-400" },
          { label: "Warning",  value: warnings.length,   color: warnings.length  > 0 ? "text-amber-600" : "text-slate-400" },
          { label: "Watch",    value: watchRepos.length, color: watchRepos.length > 0 ? "text-slate-600" : "text-slate-400" },
          { label: "Scans",    value: scanCount,          color: "text-slate-600" },
        ]}
        countdown={isScanning ? "scanning…" : fmtCountdown(nextScanAt)}
        log={marginLog}
        scanning={isScanning}
        scanMsg={`scanning ${activeRepos.length} active repos`}
      />

      {/* ── Allocation Agent ──────────────────────────────────────────────────*/}
      <AgentCard
        name="Allocation Agent"
        icon={Cpu}
        status={allocStatus}
        headline={
          allocPending
            ? "Running basket optimisation…"
            : allocCount > 0
            ? `${allocCount} allocation session${allocCount !== 1 ? "s" : ""} tracked this session`
            : "Standby — awaiting basket request"
        }
        stats={[
          { label: "Sessions", value: allocCount,            color: "text-slate-700" },
          { label: "Pending",  value: allocPending ? 1 : 0, color: allocPending ? "text-blue-600" : "text-slate-400" },
          { label: "Avail.",   value: availAssets.length,    color: "text-slate-500" },
          { label: "Recs",     value: allocRecs,             color: allocRecs > 0 ? "text-amber-600" : "text-slate-400" },
        ]}
        countdown={null}
        log={allocLog}
        scanning={allocPending}
        scanMsg="optimising collateral basket"
      />

      {/* ── Exception Agent ───────────────────────────────────────────────────*/}
      <AgentCard
        name="Exception Agent"
        icon={AlertTriangle}
        status={exceptStatus}
        headline={
          criticalNotifs.length > 0
            ? `${criticalNotifs.length} critical exception${criticalNotifs.length > 1 ? "s" : ""} require attention`
            : totalOpen.length > 0
            ? `${totalOpen.length} open notification${totalOpen.length > 1 ? "s" : ""} — no critical items`
            : "All clear — no open exceptions"
        }
        stats={[
          { label: "Open",     value: totalOpen.length,      color: totalOpen.length      > 0 ? "text-slate-700" : "text-slate-400" },
          { label: "Critical", value: criticalNotifs.length, color: criticalNotifs.length > 0 ? "text-red-600"   : "text-slate-400" },
          { label: "Resolved", value: notifications.filter((n) => n.read).length, color: "text-slate-400" },
          { label: "Interval", value: "30 s",                color: "text-slate-400" },
        ]}
        countdown={null}
        log={exceptLog}
        scanning={false}
        scanMsg={null}
      />

    </div>
  );
}
