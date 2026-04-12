import { useState, useCallback } from "react";
import { AlertTriangle, CheckCircle2, Clock3, ShieldCheck, Zap, ChevronRight, FileCheck, MessageSquareWarning, Ban, Truck, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { KpiCard } from "@/components/shared/KpiCard";
import { Info } from "@/components/shared/Info";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { WorkflowStateBadge } from "@/components/shared/WorkflowState";
import { ImpactPreview } from "@/components/shared/ImpactPreview";
import { fmtMoney, adjustedValue } from "@/domain/format";
import { COUNTERPARTY_PROFILES } from "@/domain/counterparties";
import { RoleBanner } from "@/components/shared/RoleBanner";
import { useMarginScan, useDispatch } from "@/domain/store";
import { useMarginWorkflow } from "@/workflows/hooks/useWorkflows";

// Formal margin call workflow states
const MC_STATES = [
  { key: "issued",   label: "Call Issued",        icon: AlertTriangle,        color: "text-red-600",    bg: "bg-red-50 border-red-200" },
  { key: "review",   label: "Under Review",        icon: Clock3,               color: "text-amber-600",  bg: "bg-amber-50 border-amber-200" },
  { key: "disputed", label: "Disputed",            icon: MessageSquareWarning, color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
  { key: "accepted", label: "Accepted",            icon: FileCheck,            color: "text-blue-600",   bg: "bg-blue-50 border-blue-200" },
  { key: "delivery", label: "Delivery Pending",    icon: Truck,                color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
  { key: "resolved", label: "Resolved",            icon: CheckCircle2,         color: "text-emerald-600",bg: "bg-emerald-50 border-emerald-200" },
];

function McTimeline({ state }) {
  const idx = MC_STATES.findIndex((s) => s.key === state);
  return (
    <div className="flex items-start gap-0 py-2">
      {MC_STATES.map((s, i) => {
        const active = i === idx;
        const past = i < idx;
        const Icon = s.icon;
        const isLast = i === MC_STATES.length - 1;
        return (
          <div key={s.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 flex-shrink-0 transition-all ${
                active ? "border-slate-900 bg-slate-900" :
                past   ? "border-emerald-500 bg-emerald-500" :
                         "border-slate-200 bg-white"
              }`}>
                <Icon className={`h-3.5 w-3.5 ${active || past ? "text-white" : "text-slate-300"}`} />
              </div>
              <div className={`text-[9px] mt-1 text-center leading-tight px-0.5 ${active ? "font-semibold text-slate-900" : past ? "text-emerald-600" : "text-slate-300"}`}>
                {s.label}
              </div>
            </div>
            {!isLast && (
              <div className={`h-0.5 flex-1 mb-5 mx-1 ${past ? "bg-emerald-400" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AgentExplanation({ lines = [] }) {
  const [open, setOpen] = useState(false);
  if (!lines.length) return <span className="text-slate-400">—</span>;
  return (
    <div>
      <div className="text-sm text-slate-700 leading-snug">{lines[0]}</div>
      {lines.length > 1 && !open && (
        <button onClick={() => setOpen(true)} className="mt-0.5 text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5">
          +{lines.length - 1} more <ChevronRight className="h-3 w-3" />
        </button>
      )}
      {open && (
        <ul className="mt-1 space-y-0.5">
          {lines.slice(1).map((l, i) => (
            <li key={i} className="flex gap-1.5 text-xs text-slate-600">
              <span className="text-slate-300 flex-shrink-0">·</span>{l}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function nextState(current) {
  const idx = MC_STATES.findIndex((s) => s.key === current);
  return idx < MC_STATES.length - 1 ? MC_STATES[idx + 1].key : current;
}

function nextActionLabel(current) {
  const map = {
    issued:   "Mark Under Review",
    review:   "Accept Call",
    disputed: "Resolve Dispute → Accept",
    accepted: "Confirm Delivery Initiated",
    delivery: "Mark Resolved",
    resolved: null,
  };
  return map[current] ?? null;
}

// Severity badge for agent alerts
function SeverityBadge({ severity }) {
  const colors = {
    Critical: "bg-red-100 text-red-700 border border-red-200",
    Warning:  "bg-amber-100 text-amber-700 border border-amber-200",
    Watch:    "bg-blue-100 text-blue-700 border border-blue-200",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${colors[severity] ?? "bg-slate-100 text-slate-600"}`}>
      {severity}
    </span>
  );
}

// Map margin agent states → canonical workflow states
const ALERT_STATE_TO_WF = {
  detected:  "detected",
  proposed:  "proposed",
  reviewed:  "under_review",
  approved:  "approved",
  resolved:  "executed",
  escalated: "failed",
};

function AlertStateBadge({ state }) {
  return <WorkflowStateBadge state={ALERT_STATE_TO_WF[state] ?? "detected"} />;
}

export function Margin({ repos, assets, topUpRepo, openRepo, role, permissions }) {
  const [stressPct, setStressPct] = useState(0);
  const [callStates, setCallStates] = useState(() => {
    const init = {};
    for (const r of repos) {
      if (r.buffer < 0) init[r.id] = { state: "issued", log: [{ state: "issued", ts: new Date().toISOString().slice(0,16).replace("T"," "), actor: "System" }] };
    }
    return init;
  });
  const [selectedCall, setSelectedCall] = useState(null);

  // ── Agent integration ───────────────────────────────────────────────────────
  const { scanResult, pending: scanPending } = useMarginScan();
  const { runScan, advanceAlert: advanceAlertWf, approveTopUp: approveTopUpWf } = useMarginWorkflow();
  const dispatch = useDispatch();

  const advanceCall = useCallback((repoId) => {
    setCallStates((prev) => {
      const cur = prev[repoId] ?? { state: "issued", log: [] };
      const next = nextState(cur.state);
      if (next === cur.state) return prev;
      const ts    = new Date().toISOString();
      const actor = role ?? "Collateral Manager";
      const entry = { state: next, ts: ts.slice(0,16).replace("T"," "), actor };
      // Emit workflow event and audit entry
      dispatch({
        type: "WORKFLOW_EVENT_ADDED",
        payload: {
          id:         `wf-mc-${repoId}-${Date.now()}`,
          objectId:   `margin-call-${repoId}`,
          objectType: "margin-call",
          state:      ALERT_STATE_TO_WF[next] ?? "under_review",
          prevState:  ALERT_STATE_TO_WF[cur.state] ?? "detected",
          actor,
          ts,
        },
      });
      dispatch({
        type: "AUDIT_APPENDED",
        payload: {
          id:     `audit-mc-${repoId}-${Date.now()}`,
          ts:     ts.slice(0,16).replace("T"," "),
          user:   actor,
          role:   role ?? "Collateral Manager",
          action: `Margin call advanced to ${next}`,
          object: repoId,
        },
      });
      return { ...prev, [repoId]: { state: next, log: [...cur.log, entry] } };
    });
  }, [role, dispatch]);

  const disputeCall = useCallback((repoId) => {
    setCallStates((prev) => {
      const cur   = prev[repoId] ?? { state: "issued", log: [] };
      const ts    = new Date().toISOString();
      const actor = "Counterparty";
      const entry = { state: "disputed", ts: ts.slice(0,16).replace("T"," "), actor };
      dispatch({
        type: "WORKFLOW_EVENT_ADDED",
        payload: {
          id:         `wf-mc-${repoId}-dispute-${Date.now()}`,
          objectId:   `margin-call-${repoId}`,
          objectType: "margin-call",
          state:      "under_review",
          prevState:  ALERT_STATE_TO_WF[cur.state] ?? "detected",
          actor,
          ts,
          comment:    "Call disputed by counterparty",
        },
      });
      dispatch({
        type: "AUDIT_APPENDED",
        payload: {
          id:     `audit-mc-${repoId}-dispute-${Date.now()}`,
          ts:     ts.slice(0,16).replace("T"," "),
          user:   actor,
          role:   "Counterparty",
          action: "Margin call disputed",
          object: repoId,
        },
      });
      return { ...prev, [repoId]: { state: "disputed", log: [...(cur.log ?? []), entry] } };
    });
  }, [dispatch]);

  const deficitRepos = repos.filter((r) => r.buffer < 0);
  const activeRepos = repos.filter((r) => r.state !== "Closed");
  const compliant = activeRepos.filter((r) => r.buffer >= 0).length;
  const availableTopUps = assets.filter((a) => a.status === "Available" && a.eligibility.includes("Eligible"));
  const resolved = Object.values(callStates).filter((c) => c.state === "resolved").length;

  const stressedRepos = activeRepos.map((r) => {
    const stressedPosted = Math.round(r.postedCollateral * (1 - stressPct / 100));
    const stressedBuffer = stressedPosted - r.requiredCollateral;
    const coverage = Math.round((stressedPosted / r.requiredCollateral) * 100);
    return { ...r, stressedPosted, stressedBuffer, coverage, wouldBreach: stressedBuffer < 0 };
  });
  const stressBreaches = stressedRepos.filter((r) => r.wouldBreach).length;

  const selectedRepo = selectedCall ? repos.find((r) => r.id === selectedCall) : null;
  const selectedCallData = selectedCall ? callStates[selectedCall] : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Margin Monitor</h1>
          <p className="mt-1 text-slate-500">Formal margin call workflow, shortfall detection, and collateral top-up approval.</p>
        </div>
        <Button
          variant="outline"
          className="rounded-md flex items-center gap-2 flex-shrink-0"
          disabled={scanPending}
          onClick={() => runScan({ repos, assets })}
        >
          <Scan className="h-4 w-4" />
          {scanPending ? "Scanning…" : "Run Agent Scan"}
        </Button>
      </div>
      <RoleBanner role={role} perms={permissions} />

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="In Compliance" value={String(compliant)} description="Within coverage threshold" icon={CheckCircle2} trendUp={compliant > 0} />
        <KpiCard title="Margin Calls Open" value={String(deficitRepos.length - resolved)} description="Formal calls in progress" icon={AlertTriangle} alert={deficitRepos.length - resolved > 0} />
        <KpiCard title="Excess Collateral" value={fmtMoney(activeRepos.filter((r) => r.buffer > 0).reduce((s, r) => s + r.buffer, 0))} description="Positive buffer pool" icon={ShieldCheck} />
        <KpiCard title="Calls Resolved" value={String(resolved)} description="Completed this session" icon={FileCheck} trendUp={resolved > 0} />
      </div>

      {/* ── Agent Scan Results ─────────────────────────────────────────────── */}
      {scanResult && (
        <Card className="rounded-md shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Scan className="h-4 w-4 text-violet-500" />
                  Agent Scan Results
                </CardTitle>
                <CardDescription>
                  {scanResult.alertCount} alert(s): {scanResult.criticalCount} Critical, {scanResult.warningCount} Warning, {scanResult.watchCount} Watch — {scanResult.totalActive} active repo(s) scanned.
                </CardDescription>
              </div>
              <div className="flex items-center gap-3 text-sm flex-shrink-0">
                {scanResult.criticalCount > 0 && (
                  <span className="flex items-center gap-1.5 text-red-700 font-semibold">
                    <AlertTriangle className="h-4 w-4" /> {scanResult.criticalCount} Critical
                  </span>
                )}
                {scanResult.warningCount > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-600 font-semibold">
                    <AlertTriangle className="h-4 w-4" /> {scanResult.warningCount} Warning
                  </span>
                )}
                {scanResult.alertCount === 0 && (
                  <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                    <CheckCircle2 className="h-4 w-4" /> All clear
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          {scanResult.alerts.length > 0 && (
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Repo ID</TableHead>
                    <TableHead>Counterparty</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Finding</TableHead>
                    <TableHead>Proposal</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanResult.alerts.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell className="font-mono text-sm font-medium">{alert.position.repoId}</TableCell>
                      <TableCell>{alert.position.counterparty}</TableCell>
                      <TableCell><SeverityBadge severity={alert.severity} /></TableCell>
                      <TableCell><AlertStateBadge state={alert.state} /></TableCell>
                      <TableCell className="text-sm text-slate-600 max-w-xs">
                        <AgentExplanation lines={alert.explanation} />
                      </TableCell>
                      <TableCell className="text-sm text-slate-500 max-w-xs truncate">
                        {alert.proposal ? alert.proposal.summary : <span className="text-slate-400 italic">No proposal</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 justify-end">
                          {alert.state === "proposed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded text-xs"
                              onClick={() => advanceAlertWf({ alert, newState: "reviewed" })}
                            >
                              Mark Reviewed
                            </Button>
                          )}
                          {alert.state === "reviewed" && !alert.proposal && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded text-xs"
                              onClick={() => advanceAlertWf({ alert, newState: "approved" })}
                            >
                              Approve
                            </Button>
                          )}
                          {alert.state === "reviewed" && alert.proposal && (
                            <Button
                              size="sm"
                              className="rounded text-xs bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => approveTopUpWf({ alert, proposal: alert.proposal })}
                            >
                              Approve Top-Up
                            </Button>
                          )}
                          {alert.state === "approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded text-xs"
                              onClick={() => advanceAlertWf({ alert, newState: "resolved" })}
                            >
                              Mark Resolved
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          )}
          {scanResult.alerts.length === 0 && (
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                No margin alerts detected across all active repos.
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Active margin calls — formal workflow */}
      {deficitRepos.length > 0 && (
        <Card className="rounded-md shadow-sm">
          <CardHeader>
            <CardTitle>Active Margin Calls</CardTitle>
            <CardDescription>Each deficit triggers a formal call workflow. Advance through states or log a counterparty dispute.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {deficitRepos.map((r) => {
              const call = callStates[r.id] ?? { state: "issued", log: [] };
              const mc = MC_STATES.find((s) => s.key === call.state);
              const nextAction = nextActionLabel(call.state);
              const Icon = mc?.icon ?? AlertTriangle;
              return (
                <div key={r.id} className={`rounded-md border p-5 space-y-4 ${mc?.bg ?? ""}`}>
                  {/* Header */}
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${mc?.color}`} />
                        <span className="font-semibold text-slate-900">{r.id} — {r.counterparty}</span>
                      </div>
                      <div className="text-sm text-slate-500 mt-0.5">
                        Deficit: <span className="font-semibold text-red-600">{fmtMoney(Math.abs(r.buffer), r.currency)}</span>
                        &nbsp;· MTA: {fmtMoney(COUNTERPARTY_PROFILES[r.counterparty]?.minimumTransferAmount ?? 150000, COUNTERPARTY_PROFILES[r.counterparty]?.currency ?? r.currency)} · Rate: {r.rate}%
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {call.state !== "resolved" && call.state !== "disputed" && call.state !== "accepted" && call.state !== "delivery" && (
                        <Button size="sm" variant="outline" className="rounded text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                          onClick={() => disputeCall(r.id)}>
                          Log Dispute
                        </Button>
                      )}
                      {nextAction && (
                        <Button size="sm" className="rounded text-xs"
                          disabled={permissions?.readOnly || (!permissions?.canApproveTopUp && call.state === "accepted")}
                          onClick={() => advanceCall(r.id)}>
                          {nextAction} <ChevronRight className="h-3 w-3 ml-1" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="rounded text-xs text-slate-500"
                        onClick={() => setSelectedCall(r.id)}>
                        Details
                      </Button>
                    </div>
                  </div>

                  {/* Timeline */}
                  <McTimeline state={call.state} />

                  {/* Available top-ups (only show when accepted/delivery) */}
                  {(call.state === "accepted" || call.state === "delivery") && availableTopUps.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Select collateral to deliver</div>
                      {availableTopUps.slice(0, 3).map((a) => {
                        const adjVal = adjustedValue(a);
                        const topUpImpact = {
                          type:              "top-up",
                          currentCoverage:   r.postedCollateral / r.requiredCollateral,
                          projectedCoverage: (r.postedCollateral + adjVal) / r.requiredCollateral,
                          currentPosted:     r.postedCollateral,
                          projectedPosted:   r.postedCollateral + adjVal,
                          topUpAmount:       adjVal,
                          currentBuffer:     r.buffer,
                          projectedBuffer:   r.postedCollateral + adjVal - r.requiredCollateral,
                          currency:          r.currency,
                        };
                        return (
                          <div key={a.id} className="rounded bg-white border space-y-2 overflow-hidden">
                            <div className="px-4 py-3 flex items-center justify-between gap-4">
                              <div>
                                <div className="font-medium text-slate-800 text-sm">{a.name}</div>
                                <div className="text-xs text-slate-400">{a.isin} · Adjusted: {fmtMoney(adjVal, a.currency)}</div>
                              </div>
                              <div className="text-xs text-slate-500 flex-shrink-0">
                                Covers {Math.round((adjVal / Math.abs(r.buffer)) * 100)}% of deficit
                              </div>
                              <Button size="sm" className="rounded flex-shrink-0 bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => { topUpRepo(r.id, a.id); advanceCall(r.id); }}>
                                Deliver & Resolve
                              </Button>
                            </div>
                            <ImpactPreview impact={topUpImpact} className="rounded-none border-0 border-t border-slate-100" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Coverage table */}
      <Card className="rounded-md shadow-sm">
        <CardHeader>
          <CardTitle>Coverage Monitoring</CardTitle>
          <CardDescription>Real-time posted vs required collateral across all active transactions.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repo ID</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead>Exposure</TableHead>
                <TableHead>Posted</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Buffer / Deficit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Coverage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeRepos.map((r) => {
                const coverage = Math.round((r.postedCollateral / r.requiredCollateral) * 100);
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => openRepo(r.id)}>
                    <TableCell className="font-medium">{r.id}</TableCell>
                    <TableCell>{r.counterparty}</TableCell>
                    <TableCell>{fmtMoney(r.amount, r.currency)}</TableCell>
                    <TableCell>{fmtMoney(r.postedCollateral, r.currency)}</TableCell>
                    <TableCell>{fmtMoney(r.requiredCollateral, r.currency)}</TableCell>
                    <TableCell className={r.buffer < 0 ? "text-red-700 font-semibold" : "text-emerald-700"}>
                      {fmtMoney(r.buffer, r.currency)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.buffer < 0 ? "Margin deficit" : "In compliance"} />
                    </TableCell>
                    <TableCell className="w-44">
                      <div className="space-y-1.5">
                        <Progress value={Math.min(coverage, 130) / 1.3}
                          className={r.buffer < 0 ? "[&>div]:bg-red-500" : coverage < 103 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"} />
                        <div className={`text-xs font-medium ${r.buffer < 0 ? "text-red-600" : coverage < 103 ? "text-amber-600" : "text-slate-500"}`}>
                          {coverage}%
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Stress Test */}
      <Card className="rounded-md shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Zap className="h-4 w-4 text-amber-500" />Market Stress Simulator</CardTitle>
              <CardDescription>Shock posted collateral values and identify threshold breaches before they occur.</CardDescription>
            </div>
            {stressPct > 0 && <button onClick={() => setStressPct(0)} className="text-xs text-slate-400 hover:text-slate-700 underline">Reset</button>}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-5">
            <div className="flex-1">
              <input type="range" min={0} max={30} step={1} value={stressPct}
                onChange={(e) => setStressPct(Number(e.target.value))} className="w-full accent-slate-900" />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>0% — no shock</span><span>15% — moderate</span><span>30% — severe</span>
              </div>
            </div>
            <div className={`text-3xl font-bold w-20 text-right ${stressPct === 0 ? "text-slate-300" : stressPct < 10 ? "text-amber-500" : "text-red-600"}`}>
              -{stressPct}%
            </div>
          </div>
          {stressPct > 0 && (
            <div className={`rounded-md p-4 ${stressBreaches > 0 ? "bg-red-50 border border-red-200" : "bg-emerald-50 border border-emerald-200"}`}>
              <div className="flex items-center gap-2 mb-3">
                {stressBreaches > 0 ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                <span className={`font-semibold text-sm ${stressBreaches > 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {stressBreaches > 0
                    ? `${stressBreaches} of ${activeRepos.length} repos would breach at -${stressPct}% shock`
                    : `All ${activeRepos.length} repos remain compliant at -${stressPct}% shock`}
                </span>
              </div>
              <div className="grid gap-2">
                {stressedRepos.map((r) => (
                  <div key={r.id} className={`flex items-center justify-between rounded px-3 py-2 text-sm bg-white border ${r.wouldBreach ? "border-red-200" : ""}`}>
                    <span className="font-medium text-slate-800">{r.id}</span>
                    <span className="text-slate-400 text-xs">{r.counterparty}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-slate-400">Stressed: {fmtMoney(r.stressedPosted, r.currency)}</span>
                      <span className={`font-semibold text-xs ${r.wouldBreach ? "text-red-600" : "text-emerald-600"}`}>{r.coverage}%</span>
                      {r.wouldBreach ? <span className="text-xs text-red-600 font-bold">BREACH</span> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Margin Call Detail Sheet */}
      <Sheet open={!!selectedCall} onOpenChange={(open) => !open && setSelectedCall(null)}>
        <SheetContent className="w-[540px] sm:w-[540px] overflow-y-auto">
          {selectedRepo && selectedCallData && (() => {
            const mc = MC_STATES.find((s) => s.key === selectedCallData.state);
            return (
              <>
                <SheetHeader>
                  <SheetTitle>Margin Call — {selectedRepo.id}</SheetTitle>
                  <SheetDescription>{selectedRepo.counterparty} · {fmtMoney(Math.abs(selectedRepo.buffer), selectedRepo.currency)} deficit</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-6 text-sm">
                  <div>
                    <div className="font-semibold text-slate-900 mb-3">Current Status</div>
                    <div className={`flex items-center gap-2 rounded border px-4 py-3 ${mc?.bg}`}>
                      {mc && <mc.icon className={`h-4 w-4 ${mc.color}`} />}
                      <span className={`font-semibold ${mc?.color}`}>{mc?.label}</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 mb-2">Workflow Progress</div>
                    <McTimeline state={selectedCallData.state} />
                  </div>
                  <Separator />
                  <div>
                    <div className="font-semibold text-slate-900 mb-3">Call Details</div>
                    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                      <Info label="Repo" value={selectedRepo.id} />
                      <Info label="Counterparty" value={selectedRepo.counterparty} />
                      <Info label="Deficit" value={fmtMoney(Math.abs(selectedRepo.buffer), selectedRepo.currency)} />
                      <Info label="Required Collateral" value={fmtMoney(selectedRepo.requiredCollateral, selectedRepo.currency)} />
                      <Info label="Posted Collateral" value={fmtMoney(selectedRepo.postedCollateral, selectedRepo.currency)} />
                      <Info label="Coverage" value={`${Math.round((selectedRepo.postedCollateral / selectedRepo.requiredCollateral) * 100)}%`} />
                      <Info label="Min Transfer Amount" value={fmtMoney(COUNTERPARTY_PROFILES[selectedRepo.counterparty]?.minimumTransferAmount ?? 150000, COUNTERPARTY_PROFILES[selectedRepo.counterparty]?.currency ?? selectedRepo.currency)} />
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <div className="font-semibold text-slate-900 mb-3">Activity Log</div>
                    <div className="space-y-2">
                      {selectedCallData.log.map((entry, i) => {
                        const s = MC_STATES.find((x) => x.key === entry.state);
                        return (
                          <div key={i} className="flex items-start gap-3 text-xs">
                            <div className="text-slate-400 whitespace-nowrap mt-0.5">{entry.ts}</div>
                            <div className={`font-semibold ${s?.color ?? "text-slate-700"}`}>{s?.label ?? entry.state}</div>
                            <div className="text-slate-500">by {entry.actor}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
