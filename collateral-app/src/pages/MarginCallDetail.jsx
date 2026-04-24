import { useEffect, useState } from "react";
import {
  ArrowLeft, User, Bot, Settings, Sparkles, AlertCircle, Check,
  MessageSquareWarning, Truck, Ban, FileCheck, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DownloadPdfButton } from "@/components/shared/DownloadPdfButton";
import { api } from "@/integrations/api";

const TERMINAL = new Set(["resolved", "cancelled"]);

export function MarginCallDetail({ callId, onBack, permissions }) {
  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionErr, setActionErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rationale, setRationale] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);

  const load = async () => {
    if (!callId) return;
    setLoading(true);
    try {
      const data = await api.getMarginCall(callId);
      setCall(data);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load margin call");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [callId]);

  const doAction = async (fn, successMsg) => {
    setBusy(true);
    setActionErr(null);
    try {
      await fn();
      await load();
      if (successMsg) setRationale(null);
    } catch (e) {
      setActionErr(e.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const runAiAssess = async () => {
    setBusy(true);
    setActionErr(null);
    try {
      const res = await api.aiAssessCall(callId);
      setRationale(res?.rationale || null);
      await load();
    } catch (e) {
      setActionErr(e.message || "AI assessment failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="text-sm text-slate-500 py-12 text-center">Loading…</div>;
  if (error) return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
      <div className="text-sm text-red-600">{error}</div>
    </div>
  );
  if (!call) return null;

  const state = call.currentState || call.current_state;
  const canIssue   = permissions?.canIssueCall;
  const canRespond = permissions?.canRespondCall;
  const canDispute = permissions?.canOpenDispute;
  const canCancel  = permissions?.canCancelCall;
  const canAi      = canRespond || canIssue;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900 font-mono">{call.id}</h1>
          <p className="text-sm text-slate-500">{call.direction} · {fmt(call.callAmount)} {call.currency}</p>
        </div>
        <StateBadge state={state} />
        {call.fourEyesRequired && (
          <span className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
            4-eyes required
          </span>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Call summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Stat label="Agreement" value={call.agreementId || call.agreement_id} mono />
            <Stat label="Direction" value={call.direction} />
            <Stat label="Call date" value={call.callDate || call.call_date} />
            <Stat label="Deadline" value={(call.deadlineAt || call.deadline_at)?.replace("T", " ").replace("Z", " UTC")} />
            <Stat label="Exposure" value={`${fmt(call.exposureAmount)} ${call.currency}`} />
            <Stat label="Collateral" value={`${fmt(call.collateralValue)} ${call.currency}`} />
            <Stat label="Call amount" value={`${fmt(call.callAmount)} ${call.currency}`} highlight />
            <Stat label="Settlement ref" value={call.settlementRef || "—"} />
          </div>
        </CardContent>
      </Card>

      {!TERMINAL.has(state) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Actions</CardTitle>
            <CardDescription>Available transitions from <code>{state}</code>.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {state === "draft" && canIssue && (
                <Button disabled={busy} onClick={() => doAction(() => api.issueMarginCall(call.id))} className="gap-2">
                  <Send className="h-4 w-4" /> Issue call
                </Button>
              )}
              {state === "issued" && canRespond && (
                <Button disabled={busy} onClick={() => doAction(() => api.acceptMarginCall(call.id))} className="gap-2">
                  <Check className="h-4 w-4" /> Accept
                </Button>
              )}
              {state === "issued" && canDispute && (
                <Button disabled={busy} variant="outline" onClick={() => setDisputeOpen(true)} className="gap-2">
                  <MessageSquareWarning className="h-4 w-4" /> Open dispute
                </Button>
              )}
              {state === "agreed" && canRespond && (
                <Button disabled={busy} onClick={() => setDeliverOpen(true)} className="gap-2">
                  <Truck className="h-4 w-4" /> Mark delivered
                </Button>
              )}
              {state === "delivered" && canRespond && (
                <Button disabled={busy} onClick={() => doAction(() => api.confirmSettlement(call.id))} className="gap-2">
                  <FileCheck className="h-4 w-4" /> Confirm settlement
                </Button>
              )}
              {canCancel && (
                <Button disabled={busy} variant="outline" onClick={() => setCancelOpen(true)} className="gap-2 text-red-700 border-red-200 hover:bg-red-50">
                  <Ban className="h-4 w-4" /> Cancel call
                </Button>
              )}
              {canAi && (
                <Button disabled={busy} variant="secondary" onClick={runAiAssess} className="gap-2">
                  <Sparkles className="h-4 w-4" /> AI assessment
                </Button>
              )}
              <DownloadPdfButton callId={call.id} />
            </div>

            {actionErr && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> {actionErr}
              </div>
            )}

            {rationale && (
              <div className="text-sm border border-violet-200 bg-violet-50/50 rounded p-3">
                <div className="flex items-center gap-2 text-violet-800 font-medium mb-1"><Bot className="h-4 w-4" /> Agent rationale</div>
                <div className="text-slate-700">{rationale}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <DisputesPanel call={call} onChanged={load} permissions={permissions} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event timeline</CardTitle>
          <CardDescription>{call.events?.length || 0} event{call.events?.length === 1 ? "" : "s"}, hash-chained and tamper-evident.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {(call.events || []).map(ev => (
              <li key={ev.id} className="flex gap-3">
                <ActorIcon type={ev.actorType} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900">{ev.eventType.replace(/_/g, " ")}</span>
                    <span className="text-[11px] text-slate-500">{(ev.occurredAt || "").replace("T", " ").replace("Z", " UTC")}</span>
                    <span className="text-[11px] text-slate-400">actor: {ev.actorType}{ev.actorUserId ? ` · user ${ev.actorUserId}` : ""}</span>
                  </div>
                  {ev.payload && Object.keys(ev.payload).length > 0 && (
                    <pre className="mt-1 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                      {JSON.stringify(ev.payload, null, 2)}
                    </pre>
                  )}
                  <div className="mt-1 text-[10px] text-slate-400 font-mono">hash {ev.hash?.slice(0, 12)}…</div>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <CancelSheet open={cancelOpen} onOpenChange={setCancelOpen} onSubmit={async (reason) => { setCancelOpen(false); await doAction(() => api.cancelMarginCall(call.id, { reason })); }} />
      <DeliverSheet open={deliverOpen} onOpenChange={setDeliverOpen} callAmount={call.callAmount} onSubmit={async (body) => { setDeliverOpen(false); await doAction(() => api.markDelivered(call.id, body)); }} />
      <OpenDisputeSheet open={disputeOpen} onOpenChange={setDisputeOpen} callAmount={call.callAmount} onSubmit={async (body) => { setDisputeOpen(false); await doAction(() => api.openDispute(call.id, body)); }} />
    </div>
  );
}

function ActorIcon({ type }) {
  const map = {
    user:   { icon: User, cls: "bg-blue-50 text-blue-700 border-blue-200" },
    agent:  { icon: Bot, cls: "bg-violet-50 text-violet-700 border-violet-200" },
    system: { icon: Settings, cls: "bg-slate-100 text-slate-600 border-slate-200" },
  };
  const m = map[type] || map.system;
  const Icon = m.icon;
  return <div className={`w-8 h-8 rounded-full flex-shrink-0 border flex items-center justify-center ${m.cls}`}><Icon className="h-4 w-4" /></div>;
}

function DisputesPanel({ call, onChanged, permissions }) {
  const disputes = call.disputes || [];
  if (disputes.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Disputes</CardTitle>
        <CardDescription>{disputes.length} open or resolved on this call.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {disputes.map(d => (
          <DisputeRow key={d.id} dispute={d} call={call} onChanged={onChanged} permissions={permissions} />
        ))}
      </CardContent>
    </Card>
  );
}

function DisputeRow({ dispute, call, onChanged, permissions }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [proposeOpen, setProposeOpen] = useState(false);

  const runAction = async (fn) => {
    setBusy(true);
    setErr(null);
    try { await fn(); await onChanged?.(); }
    catch (e) { setErr(e.message || "Action failed"); }
    finally { setBusy(false); }
  };

  const open = dispute.status === "open" || dispute.status === "proposed" || dispute.status === "escalated";

  return (
    <div className="border border-slate-200 rounded-md p-3 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-xs text-slate-500">{dispute.id}</span>
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${
          dispute.status === "agreed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
          dispute.status === "withdrawn" ? "bg-slate-100 text-slate-500 border-slate-200" :
          dispute.status === "escalated" ? "bg-red-50 text-red-700 border-red-200" :
          "bg-orange-50 text-orange-700 border-orange-200"
        }`}>{dispute.status}</span>
        <span className="text-[11px] text-slate-500 ml-auto">opened {dispute.openedAt?.replace("T", " ").replace("Z", " UTC")}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Stat label="Reason" value={dispute.reasonCode} />
        <Stat label="Their proposal" value={dispute.theirProposedValue !== null ? fmt(dispute.theirProposedValue) : "—"} />
        <Stat label="Our proposal" value={dispute.ourProposedValue !== null ? fmt(dispute.ourProposedValue) : "—"} />
        <Stat label="Delta" value={dispute.delta !== null ? fmt(dispute.delta) : "—"} />
      </div>
      {dispute.resolutionNote && <div className="mt-2 text-xs text-slate-600">Note: {dispute.resolutionNote}</div>}
      {open && (
        <div className="mt-3 flex flex-wrap gap-2">
          {permissions?.canOpenDispute && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setProposeOpen(true)}>Propose counter</Button>
          )}
          {permissions?.canResolveDispute && (
            <Button size="sm" disabled={busy} onClick={() => runAction(() => api.agreeDispute(dispute.id, {}))}>Agree</Button>
          )}
          {permissions?.canOpenDispute && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => runAction(() => api.withdrawDispute(dispute.id, { note: "withdrawn" }))}>Withdraw</Button>
          )}
          {permissions?.canOpenDispute && (
            <Button size="sm" variant="outline" className="text-red-700 border-red-200" disabled={busy}
              onClick={() => runAction(() => api.escalateDispute(dispute.id, { note: "escalated" }))}>Escalate</Button>
          )}
        </div>
      )}
      {err && <div className="mt-2 text-xs text-red-600">{err}</div>}
      <ProposeSheet open={proposeOpen} onOpenChange={setProposeOpen}
        onSubmit={async (body) => { setProposeOpen(false); await runAction(() => api.proposeDispute(dispute.id, body)); }} />
    </div>
  );
}

function ProposeSheet({ open, onOpenChange, onSubmit }) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Propose counter-value</SheetTitle>
          <SheetDescription>Submit your side's counter proposal for this dispute.</SheetDescription>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({ proposedValue: Number(value), note }); }} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-slate-700">Proposed value</span>
            <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="mt-1" required />
          </label>
          <label className="block text-sm">
            <span className="text-slate-700">Note (optional)</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" />
          </label>
          <div className="flex gap-2 pt-2">
            <Button type="submit">Submit</Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function CancelSheet({ open, onOpenChange, onSubmit }) {
  const [reason, setReason] = useState("");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Cancel margin call</SheetTitle>
          <SheetDescription>Cancellation is final. State transitions to cancelled.</SheetDescription>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(reason); }} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-slate-700">Reason</span>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" required />
          </label>
          <div className="flex gap-2 pt-2">
            <Button type="submit" variant="destructive">Cancel call</Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Keep it</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function DeliverSheet({ open, onOpenChange, callAmount, onSubmit }) {
  const [ref, setRef] = useState("");
  const [amount, setAmount] = useState(callAmount ?? "");
  const [variance, setVariance] = useState("");
  const hasVariance = Number(amount) !== Number(callAmount);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Mark delivered</SheetTitle>
          <SheetDescription>Record settlement reference and delivered amount.</SheetDescription>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({ settlementRef: ref, deliveredAmount: Number(amount), varianceReason: hasVariance ? variance : null }); }} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-slate-700">Settlement reference</span>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} className="mt-1" required />
          </label>
          <label className="block text-sm">
            <span className="text-slate-700">Delivered amount</span>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" required />
          </label>
          {hasVariance && (
            <label className="block text-sm">
              <span className="text-slate-700">Variance reason <span className="text-red-500">*</span></span>
              <Input value={variance} onChange={(e) => setVariance(e.target.value)} className="mt-1" required />
            </label>
          )}
          <div className="flex gap-2 pt-2">
            <Button type="submit">Mark delivered</Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function OpenDisputeSheet({ open, onOpenChange, callAmount, onSubmit }) {
  const [reason, setReason] = useState("valuation_disagreement");
  const [ours, setOurs] = useState(callAmount ?? "");
  const [theirs, setTheirs] = useState("");
  const [note, setNote] = useState("");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Open dispute</SheetTitle>
          <SheetDescription>Move this call into disputed state.</SheetDescription>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({ reasonCode: reason, ourProposedValue: Number(ours), theirProposedValue: theirs === "" ? null : Number(theirs), note }); }} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-slate-700">Reason code</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm">
              <option value="valuation_disagreement">valuation disagreement</option>
              <option value="eligibility_disagreement">eligibility disagreement</option>
              <option value="haircut_disagreement">haircut disagreement</option>
              <option value="other">other</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-slate-700">Our value</span>
              <Input type="number" value={ours} onChange={(e) => setOurs(e.target.value)} className="mt-1" required />
            </label>
            <label className="block text-sm">
              <span className="text-slate-700">Their value (optional)</span>
              <Input type="number" value={theirs} onChange={(e) => setTheirs(e.target.value)} className="mt-1" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-slate-700">Note</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" />
          </label>
          <div className="flex gap-2 pt-2">
            <Button type="submit">Open dispute</Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, highlight, mono }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm mt-0.5 ${highlight ? "font-semibold text-slate-900" : "text-slate-700"} ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</div>
    </div>
  );
}

function StateBadge({ state }) {
  const map = {
    draft:             "bg-slate-100 text-slate-700 border-slate-200",
    issued:            "bg-amber-50 text-amber-700 border-amber-200",
    pending_four_eyes: "bg-indigo-50 text-indigo-700 border-indigo-200",
    disputed:          "bg-orange-50 text-orange-700 border-orange-200",
    agreed:            "bg-blue-50 text-blue-700 border-blue-200",
    delivered:         "bg-purple-50 text-purple-700 border-purple-200",
    settled:           "bg-emerald-50 text-emerald-700 border-emerald-200",
    resolved:          "bg-emerald-50 text-emerald-700 border-emerald-200",
    cancelled:         "bg-slate-100 text-slate-500 border-slate-200",
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${map[state] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
      {state?.replace(/_/g, " ") || "—"}
    </span>
  );
}

function fmt(n) {
  if (n === null || n === undefined || n === "") return "—";
  return Number(n).toLocaleString();
}
