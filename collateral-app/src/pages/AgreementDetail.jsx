import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { api } from "@/integrations/api";

export function AgreementDetail({ agreementId, onBack, onOpenMarginCall, permissions }) {
  const [agreement, setAgreement] = useState(null);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewCall, setShowNewCall] = useState(false);

  const load = async () => {
    if (!agreementId) return;
    setLoading(true);
    try {
      const [a, c] = await Promise.all([
        api.getAgreement(agreementId),
        api.listMarginCalls({ agreement: agreementId }),
      ]);
      setAgreement(a);
      setCalls(Array.isArray(c) ? c : []);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load agreement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [agreementId]);

  if (loading) return <div className="text-sm text-slate-500 py-12 text-center">Loading…</div>;
  if (error) return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
      <div className="text-sm text-red-600">{error}</div>
    </div>
  );
  if (!agreement) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2"><ArrowLeft className="h-4 w-4" /> Agreements</Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">{agreement.id}</h1>
          <p className="text-sm text-slate-500">{agreement.counterparty} · {agreement.agreementType || agreement.agreement_type}</p>
        </div>
        {(permissions?.canIssueCall || permissions?.canRespondCall) && (
          <Button onClick={() => setShowNewCall(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New margin call
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agreement terms</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Stat label="Governing law" value={agreement.governingLaw || agreement.governing_law || "—"} />
            <Stat label="Base currency" value={agreement.baseCurrency || agreement.base_currency} />
            <Stat label="Status" value={agreement.status} />
            <Stat label="Effective" value={agreement.effectiveDate || agreement.effective_date} />
            <Stat label="Threshold" value={fmt(agreement.threshold)} />
            <Stat label="MTA" value={fmt(agreement.minimumTransferAmount ?? agreement.minimum_transfer_amount)} />
            <Stat label="Rounding" value={fmt(agreement.rounding)} />
            <Stat label="4E threshold" value={fmt(agreement.fourEyesThreshold ?? agreement.four_eyes_threshold)} />
            <Stat label="Deadline time" value={agreement.callNoticeDeadlineTime || agreement.call_notice_deadline_time} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Margin calls under this agreement</CardTitle>
          <CardDescription>{calls.length} call{calls.length === 1 ? "" : "s"}.</CardDescription>
        </CardHeader>
        <CardContent>
          {calls.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center flex flex-col items-center gap-2">
              <FileText className="h-8 w-8 text-slate-300" />
              No margin calls on this agreement yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Call date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Deadline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map(c => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpenMarginCall?.(c.id)}>
                    <TableCell className="font-mono text-xs">{c.id}</TableCell>
                    <TableCell>{c.direction}</TableCell>
                    <TableCell>{c.callDate || c.call_date}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(c.callAmount ?? c.call_amount)} {c.currency}</TableCell>
                    <TableCell><StateBadge state={c.currentState || c.current_state} /></TableCell>
                    <TableCell className="text-xs text-slate-500">{(c.deadlineAt || c.deadline_at)?.replace("T", " ").replace("Z", "") || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <NewCallSheet
        open={showNewCall}
        onOpenChange={setShowNewCall}
        agreement={agreement}
        onCreated={(callId) => { setShowNewCall(false); load(); if (callId) onOpenMarginCall?.(callId); }}
      />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-medium text-slate-900 mt-0.5">{value || "—"}</div>
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
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${map[state] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
      {state?.replace(/_/g, " ") || "—"}
    </span>
  );
}

function fmt(n) {
  if (n === null || n === undefined || n === "") return "—";
  return Number(n).toLocaleString();
}

function NewCallSheet({ open, onOpenChange, agreement, onCreated }) {
  const [form, setForm] = useState({
    id: `MC-${Date.now().toString(36).toUpperCase()}`,
    direction: "received",
    callDate: new Date().toISOString().slice(0, 10),
    exposureAmount: "",
    collateralValue: "",
    callAmount: "",
    currency: agreement?.baseCurrency || agreement?.base_currency || "EUR",
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      const body = {
        ...form,
        agreementId: agreement.id,
        exposureAmount: Number(form.exposureAmount),
        collateralValue: Number(form.collateralValue),
        callAmount: Number(form.callAmount),
      };
      const created = await api.createMarginCall(body);
      onCreated?.(created?.id);
    } catch (e) {
      setErr(e.message || "Failed to create margin call");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New margin call</SheetTitle>
          <SheetDescription>Under {agreement?.id} · {agreement?.counterparty}</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="space-y-4 mt-4">
          <label className="block text-sm">
            <span className="text-slate-700">Call ID</span>
            <Input value={form.id} onChange={(e) => setForm(f => ({ ...f, id: e.target.value }))} className="mt-1" required />
          </label>
          <label className="block text-sm">
            <span className="text-slate-700">Direction</span>
            <select
              value={form.direction}
              onChange={(e) => setForm(f => ({ ...f, direction: e.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            >
              <option value="received">Received (we owe)</option>
              <option value="issued">Issued (we demand)</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-slate-700">Call date</span>
              <Input type="date" value={form.callDate} onChange={(e) => setForm(f => ({ ...f, callDate: e.target.value }))} className="mt-1" required />
            </label>
            <label className="block text-sm">
              <span className="text-slate-700">Currency</span>
              <Input value={form.currency} onChange={(e) => setForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))} maxLength={3} className="mt-1" required />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="text-slate-700">Exposure</span>
              <Input type="number" value={form.exposureAmount} onChange={(e) => setForm(f => ({ ...f, exposureAmount: e.target.value }))} className="mt-1" required />
            </label>
            <label className="block text-sm">
              <span className="text-slate-700">Collateral</span>
              <Input type="number" value={form.collateralValue} onChange={(e) => setForm(f => ({ ...f, collateralValue: e.target.value }))} className="mt-1" required />
            </label>
            <label className="block text-sm">
              <span className="text-slate-700">Call amount</span>
              <Input type="number" value={form.callAmount} onChange={(e) => setForm(f => ({ ...f, callAmount: e.target.value }))} className="mt-1" required />
            </label>
          </div>
          {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</div>}
          <Separator />
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create call"}</Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
