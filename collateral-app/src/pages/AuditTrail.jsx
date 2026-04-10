import { useMemo, useState } from "react";
import { CheckCircle2, Download, Filter, Search, Shield, User, XCircle } from "lucide-react";
import { api } from "@/integrations/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/shared/KpiCard";

const ACTION_META = {
  "repo created":           { color: "bg-blue-50 text-blue-700 border-blue-200",     label: "Repo Created" },
  "top-up approved":        { color: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Top-Up Approved" },
  "collateral released":    { color: "bg-slate-50 text-slate-600 border-slate-200",  label: "Released" },
  "collateral substituted": { color: "bg-purple-50 text-purple-700 border-purple-200", label: "Substituted" },
  "margin call issued":     { color: "bg-red-50 text-red-700 border-red-200",        label: "Margin Call" },
  "login":                  { color: "bg-slate-50 text-slate-500 border-slate-200",  label: "Login" },
};

function ActionBadge({ action }) {
  const meta = ACTION_META[action] ?? { color: "bg-slate-50 text-slate-500 border-slate-200", label: action };
  return (
    <Badge variant="outline" className={`text-xs font-medium rounded ${meta.color}`}>
      {meta.label}
    </Badge>
  );
}

const UNIQUE_ACTIONS = Object.keys(ACTION_META);
const UNIQUE_ROLES = ["Treasury Manager", "Collateral Manager", "Operations Analyst", "Risk Reviewer", "System"];

export function AuditTrail({ audit }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [chainStatus, setChainStatus] = useState(null); // null | { valid, totalEntries, firstBrokenId }
  const [verifying, setVerifying] = useState(false);

  const verifyChain = async () => {
    setVerifying(true);
    try {
      const result = await api.verifyAuditChain();
      setChainStatus(result);
    } catch {
      setChainStatus({ valid: false, totalEntries: audit.length, firstBrokenId: null });
    } finally {
      setVerifying(false);
    }
  };

  const filtered = useMemo(() => {
    return audit.filter((e) => {
      const text = [e.ts, e.user, e.role, e.action, e.object, e.comment].join(" ").toLowerCase();
      if (search && !text.includes(search.toLowerCase())) return false;
      if (roleFilter !== "all" && e.role !== roleFilter) return false;
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      if (dateFrom && e.ts < dateFrom) return false;
      if (dateTo && e.ts > dateTo + " 99") return false;
      return true;
    });
  }, [audit, search, roleFilter, actionFilter, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const byRole = {};
    const byAction = {};
    for (const e of audit) {
      byRole[e.role] = (byRole[e.role] ?? 0) + 1;
      byAction[e.action] = (byAction[e.action] ?? 0) + 1;
    }
    const topRole = Object.entries(byRole).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    const topAction = Object.entries(byAction).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    return { total: audit.length, topRole, topAction };
  }, [audit]);

  const exportCSV = () => {
    const headers = ["Timestamp", "User", "Role", "Action", "Object", "Previous State", "New State", "Comment"];
    const rows = filtered.map((e) => [e.ts, e.user, e.role, e.action, e.object, e.prev, e.next, `"${(e.comment ?? "").replace(/"/g, "'")}"`]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `audit_trail_${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearch(""); setRoleFilter("all"); setActionFilter("all"); setDateFrom(""); setDateTo("");
  };
  const hasFilters = search || roleFilter !== "all" || actionFilter !== "all" || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Audit Trail</h1>
        <p className="mt-1 text-slate-500">
          Immutable event log for all collateral, repo lifecycle, and margin actions. Full traceability for compliance and operational review.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard title="Total Events" value={String(stats.total)} description="Recorded since session start" icon={Shield} />
        <KpiCard title="Most Active Role" value={stats.topRole} description="Highest event count this session" icon={User} />
        <KpiCard title="Filtered Events" value={String(filtered.length)} description={`${filtered.length} of ${stats.total} shown`} icon={Filter} />
      </div>

      {/* Chain integrity panel */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" className="rounded-md" onClick={verifyChain} disabled={verifying}>
          <Shield className="h-4 w-4 mr-1.5" /> {verifying ? "Verifying…" : "Verify Chain Integrity"}
        </Button>
        {chainStatus && (
          chainStatus.valid ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-1.5">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              Chain intact — {chainStatus.totalEntries} entries verified
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-1.5">
              <XCircle className="h-4 w-4 flex-shrink-0" />
              Chain broken{chainStatus.firstBrokenId ? ` at entry #${chainStatus.firstBrokenId}` : ""} — tamper detected
            </div>
          )
        )}
      </div>

      {/* Filter bar */}
      <Card className="rounded-md shadow-sm">
        <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user, action, object, comment…" className="pl-9 rounded-md" />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[180px] rounded-md">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {UNIQUE_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[180px] rounded-md">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {UNIQUE_ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md w-[140px] text-sm" placeholder="From" />
            <span className="text-slate-400 text-sm">—</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md w-[140px] text-sm" placeholder="To" />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {hasFilters && (
              <Button variant="ghost" size="sm" className="rounded text-xs text-slate-500" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
            <Button variant="outline" size="sm" className="rounded-md" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-1.5" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Event table */}
      <Card className="rounded-md shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle>Event Log</CardTitle>
          <CardDescription>
            {filtered.length} event{filtered.length !== 1 ? "s" : ""} · Sorted by most recent first
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Object</TableHead>
                  <TableHead>Previous State</TableHead>
                  <TableHead>New State</TableHead>
                  <TableHead className="max-w-xs">Comment</TableHead>
                  <TableHead className="w-24">Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-slate-400 py-10 text-sm italic">
                      No events match the current filters.
                    </TableCell>
                  </TableRow>
                ) : filtered.map((e, i) => (
                  <TableRow key={i} className="align-top">
                    <TableCell className="font-mono text-xs text-slate-500 whitespace-nowrap">{e.ts}</TableCell>
                    <TableCell className="text-sm font-medium text-slate-800">{e.user}</TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-medium">{e.role}</span>
                    </TableCell>
                    <TableCell><ActionBadge action={e.action} /></TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">{e.object}</TableCell>
                    <TableCell className="text-xs text-slate-400">{e.prev ?? "—"}</TableCell>
                    <TableCell className="text-xs text-slate-700 font-medium">{e.next ?? "—"}</TableCell>
                    <TableCell className="text-xs text-slate-500 max-w-xs">{e.comment}</TableCell>
                    <TableCell className="font-mono text-[10px] text-slate-300" title={e.hash}>{e.hash ? e.hash.slice(0, 8) + "…" : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Compliance note */}
      <Card className="rounded-md border-dashed bg-slate-50">
        <CardContent className="p-4">
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Compliance note:</span> This audit trail captures all repo lifecycle events,
            collateral allocation decisions, margin calls, and user actions within the session. In production, events are stored
            in an append-only ledger with cryptographic hash chaining. Exports are admissible for internal audit review and
            BNR supervisory inspection under NBR Regulation 5/2013 and EMIR reporting obligations.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
