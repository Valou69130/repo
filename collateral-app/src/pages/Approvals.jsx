import { useEffect, useState } from "react";
import { ShieldCheck, Check, X, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { api } from "@/integrations/api";

export function Approvals({ permissions, onOpenMarginCall }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState({});
  const [rejectFor, setRejectFor] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listPendingApprovals();
      setRows(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const grant = async (id) => {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      await api.grantApproval(id);
      await load();
    } catch (e) {
      setError(e.message || "Grant failed");
    } finally {
      setBusy(b => ({ ...b, [id]: false }));
    }
  };

  const doReject = async (id, reason) => {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      await api.rejectApproval(id, { reason });
      setRejectFor(null);
      await load();
    } catch (e) {
      setError(e.message || "Reject failed");
    } finally {
      setBusy(b => ({ ...b, [id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-slate-700" />
          Four-eyes approvals
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Approval queue for margin-call actions above the agreement's four-eyes threshold.
          {permissions?.canApproveFourEyes ? "" : " Read-only for your role."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending</CardTitle>
          <CardDescription>
            {rows.length} item{rows.length === 1 ? "" : "s"} awaiting your decision. Self-requested approvals are hidden.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-slate-500 py-8 text-center">Loading…</div>
          ) : error ? (
            <div className="text-sm text-red-600 py-2">{error}</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center flex flex-col items-center gap-2">
              <Inbox className="h-8 w-8 text-slate-300" />
              No approvals pending.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Approval</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Margin call</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Requested at</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.id}</TableCell>
                    <TableCell>{a.entityType?.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <button onClick={() => onOpenMarginCall?.(a.entityId)} className="font-mono text-xs text-blue-700 hover:underline">
                        {a.entityId}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">user {a.requestedByUserId}</TableCell>
                    <TableCell className="text-xs text-slate-500">{a.requestedAt?.replace("T", " ").replace("Z", " UTC")}</TableCell>
                    <TableCell className="text-right">
                      {permissions?.canApproveFourEyes ? (
                        <div className="inline-flex gap-2">
                          <Button size="sm" disabled={busy[a.id]} onClick={() => grant(a.id)} className="gap-1">
                            <Check className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy[a.id]} onClick={() => setRejectFor(a)} className="gap-1 text-red-700 border-red-200 hover:bg-red-50">
                            <X className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">requires Credit Approver</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RejectSheet
        open={!!rejectFor}
        onOpenChange={(v) => !v && setRejectFor(null)}
        approval={rejectFor}
        onSubmit={(reason) => doReject(rejectFor.id, reason)}
      />
    </div>
  );
}

function RejectSheet({ open, onOpenChange, approval, onSubmit }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  if (!approval) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Reject approval</SheetTitle>
          <SheetDescription>{approval.id} · {approval.entityType?.replace(/_/g, " ")} on {approval.entityId}</SheetDescription>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(reason); }} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-slate-700">Reason <span className="text-red-500">*</span></span>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" required />
          </label>
          <div className="flex gap-2 pt-2">
            <Button type="submit" variant="destructive">Reject</Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
