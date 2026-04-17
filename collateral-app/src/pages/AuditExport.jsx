import { useEffect, useMemo, useState } from "react";
import { Download, ShieldCheck, FileDown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/integrations/api";

export function AuditExport({ permissions }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [actionFilter, setActionFilter] = useState("");
  const [objectFilter, setObjectFilter] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getAudit();
      setEntries(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load audit");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      const ts = (e.ts || "").slice(0, 10);
      if (from && ts && ts < from) return false;
      if (to && ts && ts > to) return false;
      if (actionFilter && !String(e.action || "").toLowerCase().includes(actionFilter.toLowerCase())) return false;
      if (objectFilter && !String(e.object || "").toLowerCase().includes(objectFilter.toLowerCase())) return false;
      return true;
    });
  }, [entries, from, to, actionFilter, objectFilter]);

  const verify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await api.verifyAuditChain();
      setVerifyResult(res);
    } catch (e) {
      setVerifyResult({ valid: false, error: e.message });
    } finally {
      setVerifying(false);
    }
  };

  const downloadCsv = () => {
    const header = ["ts", "user", "role", "action", "object", "prev", "next", "comment", "hash"];
    const rows = filtered.map(e => header.map(k => csvCell(e[k])));
    const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-${from}-to-${to}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!permissions?.canExportAudit) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Lock className="h-6 w-6 text-slate-700" /> Audit export
          </h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            Your role does not include audit export. Contact a Risk Reviewer or Compliance user.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <FileDown className="h-6 w-6 text-slate-700" /> Audit export
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Filter the hash-chained audit ledger, verify integrity, and export for regulators.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Filters are applied client-side before export.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <label className="block text-sm">
              <span className="text-slate-700">From</span>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" />
            </label>
            <label className="block text-sm">
              <span className="text-slate-700">To</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" />
            </label>
            <label className="block text-sm">
              <span className="text-slate-700">Action contains</span>
              <Input value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} placeholder="e.g. margin call" className="mt-1" />
            </label>
            <label className="block text-sm">
              <span className="text-slate-700">Object contains</span>
              <Input value={objectFilter} onChange={(e) => setObjectFilter(e.target.value)} placeholder="e.g. MC-" className="mt-1" />
            </label>
            <div className="flex items-end gap-2">
              <Button onClick={downloadCsv} className="gap-2" disabled={filtered.length === 0}><Download className="h-4 w-4" /> CSV</Button>
              <Button onClick={downloadJson} variant="outline" className="gap-2" disabled={filtered.length === 0}><Download className="h-4 w-4" /> JSON</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Integrity</CardTitle>
            <CardDescription>Re-hash every entry and compare to the stored hashes.</CardDescription>
          </div>
          <Button onClick={verify} disabled={verifying} variant="secondary" className="gap-2">
            <ShieldCheck className="h-4 w-4" /> {verifying ? "Verifying…" : "Verify chain"}
          </Button>
        </CardHeader>
        <CardContent>
          {verifyResult ? (
            verifyResult.valid ? (
              <div className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded px-3 py-2">
                Chain intact across {verifyResult.totalEntries} entries.
              </div>
            ) : (
              <div className="text-sm bg-red-50 border border-red-200 text-red-800 rounded px-3 py-2">
                Chain broken{verifyResult.firstBrokenId ? ` at entry #${verifyResult.firstBrokenId}` : ""}. Escalate to compliance.
              </div>
            )
          ) : (
            <div className="text-xs text-slate-500">Not yet verified this session.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview</CardTitle>
          <CardDescription>
            {loading ? "Loading…" : `${filtered.length} of ${entries.length} entries match your filters. Showing first 100.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
          {!loading && filtered.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Object</TableHead>
                    <TableHead>Prev</TableHead>
                    <TableHead>Next</TableHead>
                    <TableHead>Comment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 100).map((e, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs whitespace-nowrap">{e.ts}</TableCell>
                      <TableCell className="text-xs">{e.user}</TableCell>
                      <TableCell className="text-xs">{e.role}</TableCell>
                      <TableCell className="text-xs">{e.action}</TableCell>
                      <TableCell className="text-xs font-mono">{e.object}</TableCell>
                      <TableCell className="text-xs">{e.prev}</TableCell>
                      <TableCell className="text-xs">{e.next}</TableCell>
                      <TableCell className="text-xs text-slate-500 max-w-sm truncate">{e.comment}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
