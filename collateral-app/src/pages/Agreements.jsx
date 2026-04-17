import { useEffect, useState } from "react";
import { FileText, Plus, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { api } from "@/integrations/api";

function StatusBadge({ status }) {
  const map = {
    active:     "bg-emerald-50 text-emerald-700 border-emerald-200",
    draft:      "bg-amber-50 text-amber-700 border-amber-200",
    terminated: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${map[status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
      {status || "—"}
    </span>
  );
}

export function Agreements({ role, permissions, onOpenAgreement }) {
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listAgreements();
      setAgreements(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load agreements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Scale className="h-6 w-6 text-slate-700" />
            Collateral Agreements
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            GMRA, GMSLA, CSA and bespoke agreements governing every margin call.
          </p>
        </div>
        {permissions?.canManageAgreements && (
          <Button onClick={() => setShowNew(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New agreement
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registered agreements</CardTitle>
          <CardDescription>
            {agreements.length} agreement{agreements.length === 1 ? "" : "s"} on file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-slate-500 py-8 text-center">Loading…</div>
          ) : error ? (
            <div className="text-sm text-red-600 py-8 text-center">{error}</div>
          ) : agreements.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center flex flex-col items-center gap-2">
              <FileText className="h-8 w-8 text-slate-300" />
              No agreements yet.
              {permissions?.canManageAgreements && <span>Click "New agreement" to create one.</span>}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Threshold</TableHead>
                  <TableHead className="text-right">MTA</TableHead>
                  <TableHead className="text-right">4E threshold</TableHead>
                  <TableHead>Base ccy</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agreements.map(a => (
                  <TableRow key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpenAgreement?.(a.id)}>
                    <TableCell className="font-mono text-xs">{a.id}</TableCell>
                    <TableCell>{a.counterparty}</TableCell>
                    <TableCell>{a.agreementType || a.agreement_type}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(a.threshold)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(a.minimumTransferAmount ?? a.minimum_transfer_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(a.fourEyesThreshold ?? a.four_eyes_threshold)}</TableCell>
                    <TableCell>{a.baseCurrency || a.base_currency}</TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <NewAgreementSheet
        open={showNew}
        onOpenChange={setShowNew}
        onCreated={() => { setShowNew(false); load(); }}
      />
    </div>
  );
}

function fmt(n) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString();
}

function NewAgreementSheet({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(initialForm());
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      await api.createAgreement({
        ...form,
        threshold: Number(form.threshold),
        minimumTransferAmount: Number(form.minimumTransferAmount),
        rounding: Number(form.rounding),
        fourEyesThreshold: Number(form.fourEyesThreshold),
      });
      setForm(initialForm());
      onCreated?.();
    } catch (e) {
      setErr(e.message || "Failed to create agreement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New collateral agreement</SheetTitle>
          <SheetDescription>All values in the agreement's base currency.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="space-y-4 mt-4">
          <Field label="Agreement ID" value={form.id} onChange={v => setForm(f => ({ ...f, id: v }))} required />
          <Field label="Counterparty" value={form.counterparty} onChange={v => setForm(f => ({ ...f, counterparty: v }))} required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" value={form.agreementType} onChange={v => setForm(f => ({ ...f, agreementType: v }))} placeholder="GMRA" required />
            <Field label="Governing law" value={form.governingLaw} onChange={v => setForm(f => ({ ...f, governingLaw: v }))} placeholder="English" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Base ccy" value={form.baseCurrency} onChange={v => setForm(f => ({ ...f, baseCurrency: v.toUpperCase() }))} maxLength={3} required />
            <Field label="Threshold" type="number" value={form.threshold} onChange={v => setForm(f => ({ ...f, threshold: v }))} />
            <Field label="MTA" type="number" value={form.minimumTransferAmount} onChange={v => setForm(f => ({ ...f, minimumTransferAmount: v }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Rounding" type="number" value={form.rounding} onChange={v => setForm(f => ({ ...f, rounding: v }))} />
            <Field label="4E threshold" type="number" value={form.fourEyesThreshold} onChange={v => setForm(f => ({ ...f, fourEyesThreshold: v }))} />
            <Field label="Deadline time" value={form.callNoticeDeadlineTime} onChange={v => setForm(f => ({ ...f, callNoticeDeadlineTime: v }))} placeholder="11:00" />
          </div>
          <Field label="Effective date" type="date" value={form.effectiveDate} onChange={v => setForm(f => ({ ...f, effectiveDate: v }))} required />
          {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</div>}
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create agreement"}</Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function initialForm() {
  return {
    id: "", counterparty: "", agreementType: "GMRA", governingLaw: "English",
    baseCurrency: "EUR", threshold: "0", minimumTransferAmount: "100000",
    rounding: "10000", fourEyesThreshold: "10000000",
    callNoticeDeadlineTime: "11:00",
    status: "active", effectiveDate: new Date().toISOString().slice(0, 10),
  };
}

function Field({ label, value, onChange, type = "text", required, placeholder, maxLength }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-700">{label}{required && <span className="text-red-500"> *</span>}</span>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        className="mt-1"
      />
    </label>
  );
}
