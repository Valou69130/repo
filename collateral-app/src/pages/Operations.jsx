import { useState, useMemo } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Sparkles, XCircle, FileWarning, RefreshCw } from "lucide-react";
import { api } from "@/integrations/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Info } from "@/components/shared/Info";
import { IntegrationContextPanel } from "@/components/shared/IntegrationContext";
import { fmtMoney } from "@/domain/format";
import { RoleBanner } from "@/components/shared/RoleBanner";

// Settlement instruction states machine
const INSTR_STATES = ["Generated", "Validated", "Sent", "Acknowledged", "Matched", "Settled"];

function InstrTimeline({ state }) {
  const idx = INSTR_STATES.indexOf(state);
  return (
    <div className="flex items-start gap-0">
      {INSTR_STATES.map((s, i) => {
        const active = i === idx;
        const past = i < idx;
        const isLast = i === INSTR_STATES.length - 1;
        return (
          <div key={s} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                active ? "bg-slate-900 ring-2 ring-slate-900 ring-offset-1" :
                past   ? "bg-emerald-500" : "bg-slate-200"
              }`}>
                {past && <CheckCircle2 className="h-3 w-3 text-white" />}
                {active && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className={`text-[9px] mt-1 text-center leading-tight ${active ? "font-bold text-slate-900" : past ? "text-emerald-600" : "text-slate-300"}`}>
                {s}
              </div>
            </div>
            {!isLast && <div className={`h-px flex-1 mb-4 mx-0.5 ${past ? "bg-emerald-400" : "bg-slate-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

// Fail cost: notional × daily_fail_rate × days_failed
// ECB penalty rate ~0.1bps per day for government securities
const DAILY_FAIL_RATE = 0.001 / 100;

function buildMT543(repo, asset) {
  const isin = asset?.isin ?? "N/A";
  const qty = asset?.quantity ?? 0;
  return `:16R:GENL
:20C::SEME//${`INSTR-${repo.id}-01`}
:23G:NEWM
:98A::SETT//${repo.startDate.replace(/-/g, "")}
:16S:GENL
:16R:TRADDET
:98A::TRAD//${repo.startDate.replace(/-/g, "")}
:90A::DEAL//PRCT/100,
:35B:ISIN ${isin}
//ROMANIAN GOVERNMENT BOND
:70E::TRDE//REPO OVERNIGHT
:16S:TRADDET
:16R:FIAC
:36B::SETT//UNIT/${qty.toLocaleString()}
:97A::SAFE//SAFIR-BNR
:16S:FIAC
:16R:SETDET
:22F::SETR//REPO
:22F::DBNM//ACTU
:16R:SETPRTY
:95P::REAG//BICA${repo.counterparty.slice(0, 4).toUpperCase()}XX
:97A::SAFE//CUSTODY-${repo.id}
:16S:SETPRTY
:16R:SETPRTY
:95P::DEAG//BICABDROBU1
:97A::SAFE//SAFIR-INTERNAL
:16S:SETPRTY
:16R:AMT
:19A::SETT//RON${repo.amount.toLocaleString()}
:16S:AMT
:16S:SETDET`;
}

// Derive instruction state from repo settlement status
function instrState(repo) {
  if (repo.state === "Closed") return "Settled";
  if (repo.settlement === "Confirmed") return "Matched";
  if (repo.settlement === "Awaiting confirmation") return "Sent";
  return "Generated";
}

// Derive fail info — repos awaiting confirmation are "failing" until matched
function failInfo(repo) {
  if (repo.settlement !== "Awaiting confirmation" || repo.state === "Closed") return null;
  const days = 1;
  const cost = Math.round(repo.amount * DAILY_FAIL_RATE * days);
  return { days, cost, reason: "Settlement confirmation not received from counterparty CSD", category: "Unconfirmed" };
}

export function Operations({ repos, assets, permissions }) {
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [instrStates, setInstrStates] = useState(() => {
    const init = {};
    for (const r of repos) init[r.id] = instrState(r);
    return init;
  });

  const activeRepos = repos.filter((r) => r.state !== "Closed");
  const fails = useMemo(() => activeRepos.filter((r) => failInfo(r) !== null), [activeRepos]);
  const confirmed = activeRepos.filter((r) => r.settlement === "Confirmed").length;
  const totalFailCost = fails.reduce((s, r) => { const f = failInfo(r); return s + (f?.cost ?? 0); }, 0);

  const advanceInstr = (repoId) => {
    setInstrStates((prev) => {
      const cur = prev[repoId] ?? "Generated";
      const idx = INSTR_STATES.indexOf(cur);
      if (idx >= INSTR_STATES.length - 1) return prev;
      const next = INSTR_STATES[idx + 1];
      // Sync settlement field to repo when reaching Matched or Settled
      const newSettlement = (next === "Matched" || next === "Settled") ? "Confirmed" : "Awaiting confirmation";
      const repo = repos.find((r) => r.id === repoId);
      if (repo && repo.settlement !== newSettlement) {
        api.updateRepo(repoId, { settlement: newSettlement }).catch(console.error);
      }
      return { ...prev, [repoId]: next };
    });
  };

  const selectedAsset = selectedRepo ? assets.find((a) => selectedRepo.assets?.includes(a.id)) : null;
  const selectedInstrState = selectedRepo ? (instrStates[selectedRepo.id] ?? instrState(selectedRepo)) : null;
  const selectedFail = selectedRepo ? failInfo(selectedRepo) : null;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[linear-gradient(135deg,#fffaf8_0%,#fff5ef_34%,#f8fafc_100%)] px-6 py-6 shadow-sm">
        <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-orange-200/35 blur-3xl" />
        <div className="absolute bottom-0 left-10 h-28 w-28 rounded-full bg-emerald-100/60 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-orange-700 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              Settlement control room
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">Settlement / Operations</h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              Oversee instruction progress, isolate exceptions early, and keep counterparties moving through confirmation and settlement without operational drag.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/80 bg-white/75 px-4 py-3 shadow-sm">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-medium">Exception posture</div>
              <div className={`mt-1 text-lg font-semibold ${fails.length > 0 ? "text-red-700" : "text-slate-900"}`}>{fails.length > 0 ? "Action required" : "Stable"}</div>
              <div className="mt-1 text-xs text-slate-500">Critical attention is driven by unsettled confirmations and maturing trades.</div>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/75 px-4 py-3 shadow-sm">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-medium">Reconciliation view</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{confirmed}/{activeRepos.length || 1}</div>
              <div className="mt-1 text-xs text-slate-500">Instructions already confirmed against the active settlement book.</div>
            </div>
          </div>
        </div>
      </div>
      <RoleBanner role="Operations Analyst" perms={permissions} />

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="Instructions Active" value={String(activeRepos.length)} description="Open settlement instructions" icon={Clock3} />
        <KpiCard title="Confirmed" value={String(confirmed)} description="Matched and settled" icon={CheckCircle2} trendUp={confirmed > 0} />
        <KpiCard title="Settlement Fails" value={String(fails.length)} description="Pending confirmation" icon={XCircle} alert={fails.length > 0} />
        <KpiCard title="Fail Cost Accruing" value={fmtMoney(totalFailCost)} description="Estimated daily penalty" icon={FileWarning} alert={totalFailCost > 0} />
      </div>

      {/* Fails tracker */}
      {fails.length > 0 && (
        <Card className="rounded-[1.5rem] shadow-sm border-red-200 bg-red-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-4 w-4" /> Settlement Fails Tracker
            </CardTitle>
            <CardDescription>Unconfirmed instructions accruing daily penalty. Escalate or re-send to counterparty CSD.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Repo ID</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Notional</TableHead>
                  <TableHead>Days Failing</TableHead>
                  <TableHead>Fail Cost (est.)</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {fails.map((r) => {
                  const f = failInfo(r);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.id}</TableCell>
                      <TableCell>{r.counterparty}</TableCell>
                      <TableCell>{fmtMoney(r.amount, r.currency)}</TableCell>
                      <TableCell>
                        <span className="font-semibold text-red-600">{f.days}d</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-red-600">{fmtMoney(f.cost, r.currency)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50">{f.category}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 max-w-[200px] truncate">{f.reason}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="rounded text-xs"
                          disabled={permissions?.readOnly}
                          onClick={() => advanceInstr(r.id)}>
                          <RefreshCw className="h-3 w-3 mr-1" />Re-send
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* All instructions */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 rounded-[1.5rem] shadow-sm">
          <CardHeader>
            <CardTitle>Settlement Instructions</CardTitle>
            <CardDescription>Click any row to view the full instruction, MT543 preview, and lifecycle timeline.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Repo ID</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Source System</TableHead>
                  <TableHead>Trade Date</TableHead>
                  <TableHead>Sett. Date</TableHead>
                  <TableHead>Instruction State</TableHead>
                  <TableHead>Settlement</TableHead>
                  <TableHead>Reconciliation</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeRepos.map((r) => {
                  const iState = instrStates[r.id] ?? instrState(r);
                  const isFailing = failInfo(r) !== null && iState !== "Settled";
                  return (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelectedRepo(r)}>
                      <TableCell className="font-medium">{r.id}</TableCell>
                      <TableCell>{r.counterparty}</TableCell>
                      <TableCell className="text-xs text-slate-500">{r.integration?.sourceSystem ?? "—"}</TableCell>
                      <TableCell>{r.startDate}</TableCell>
                      <TableCell>{r.maturityDate}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          iState === "Settled" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          iState === "Matched" ? "bg-blue-50 text-blue-700 border-blue-200" :
                          isFailing ? "bg-red-50 text-red-700 border-red-200" :
                          "bg-slate-50 text-slate-700 border-slate-200"
                        }>
                          {iState}
                        </Badge>
                      </TableCell>
                      <TableCell><StatusBadge status={r.settlement} /></TableCell>
                      <TableCell>
                        {r.integration?.reconState === "matched" && (
                          <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">Matched</span>
                        )}
                        {r.integration?.reconState === "unmatched" && (
                          <span className="text-[10px] font-medium text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">Unmatched</span>
                        )}
                        {r.integration?.reconState === "pending" && (
                          <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">Pending</span>
                        )}
                        {r.integration?.reconState === "break_detected" && (
                          <span className="text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">Break</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isFailing && <AlertTriangle className="h-4 w-4 text-red-500" />}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Exceptions panel */}
        <Card className="rounded-[1.5rem] shadow-sm">
          <CardHeader>
            <CardTitle>Operational Exceptions</CardTitle>
            <CardDescription>Breaks and escalations requiring resolution.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {fails.map((r) => {
              const f = failInfo(r);
              return (
                <div key={r.id} className="rounded border border-red-200 bg-red-50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                    <span className="font-medium text-red-800 text-sm">Fail — {r.id}</span>
                  </div>
                  <div className="text-xs text-red-600">{f.reason}</div>
                  <div className="text-xs text-red-500 mt-1">Daily cost: {fmtMoney(f.cost, r.currency)}</div>
                </div>
              );
            })}
            {repos.filter((r) => r.state === "Maturing").map((r) => (
              <div key={r.id} className="rounded border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock3 className="h-3.5 w-3.5 text-amber-600" />
                  <span className="font-medium text-amber-800 text-sm">Maturing — {r.id}</span>
                </div>
                <div className="text-xs text-amber-700">Unwind preparation required. Confirm rollover or close with {r.counterparty}.</div>
              </div>
            ))}
            {fails.length === 0 && repos.filter((r) => r.state === "Maturing").length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-8 text-center">
                <div className="text-sm font-medium text-slate-800">No active exceptions</div>
                <div className="mt-1 text-sm text-slate-500">The current settlement queue is clean, with no maturing trades or unresolved breaks requiring intervention.</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Instruction Detail Sheet */}
      <Sheet open={!!selectedRepo} onOpenChange={(open) => !open && setSelectedRepo(null)}>
        <SheetContent className="w-[640px] sm:w-[640px] overflow-y-auto">
          {selectedRepo && (
            <>
              <SheetHeader>
                <SheetTitle>Settlement Instruction — {selectedRepo.id}</SheetTitle>
                <SheetDescription>{selectedRepo.counterparty} · {fmtMoney(selectedRepo.amount, selectedRepo.currency)}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-6 text-sm">

                {/* Instruction lifecycle */}
                <div>
                  <div className="font-semibold text-slate-900 mb-3">Instruction Lifecycle</div>
                  <InstrTimeline state={selectedInstrState} />
                  {selectedInstrState !== "Settled" && (
                    <Button size="sm" className="mt-3 rounded text-xs" onClick={() => advanceInstr(selectedRepo.id)}>
                      Advance to next state
                    </Button>
                  )}
                </div>

                <Separator />

                {/* Fail warning */}
                {selectedFail && (
                  <>
                    <div className="rounded border border-red-200 bg-red-50 p-4 space-y-2">
                      <div className="flex items-center gap-2 font-semibold text-red-700">
                        <AlertTriangle className="h-4 w-4" /> Settlement Fail — Day {selectedFail.days}
                      </div>
                      <div className="text-xs text-red-600">{selectedFail.reason}</div>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div>
                          <div className="text-xs text-red-400">Days Failing</div>
                          <div className="font-semibold text-red-700">{selectedFail.days}d</div>
                        </div>
                        <div>
                          <div className="text-xs text-red-400">Estimated Cost</div>
                          <div className="font-semibold text-red-700">{fmtMoney(selectedFail.cost, selectedRepo.currency)}</div>
                        </div>
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                {/* Header fields */}
                <div>
                  <div className="font-semibold text-slate-900 mb-3">Instruction Header</div>
                  <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                    <Info label="Instruction ID" value={`INSTR-${selectedRepo.id}-01`} />
                    <Info label="Type" value="DVP — Delivery vs Payment" />
                    <Info label="System" value="SaFIR / BNR" />
                    <Info label="Status" value={selectedInstrState} />
                  </div>
                </div>

                <Separator />

                <div>
                  <div className="font-semibold text-slate-900 mb-3">Delivery Leg</div>
                  <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                    <Info label="Delivering Party" value={selectedRepo.counterparty} />
                    <Info label="ISIN" value={selectedAsset?.isin ?? "N/A"} />
                    <Info label="Quantity" value={selectedAsset?.quantity?.toLocaleString() ?? "N/A"} />
                    <Info label="Settlement Date" value={selectedRepo.maturityDate} />
                    <Info label="Custody" value={selectedAsset?.custody ?? "SaFIR / BNR"} />
                  </div>
                </div>

                <Separator />

                <div>
                  <div className="font-semibold text-slate-900 mb-3">Payment Leg</div>
                  <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                    <Info label="Paying Party" value="Banca Demo Romania" />
                    <Info label="Cash Amount" value={fmtMoney(selectedRepo.amount, selectedRepo.currency)} />
                    <Info label="Currency" value={selectedRepo.currency} />
                    <Info label="Repo Rate" value={`${selectedRepo.rate}%`} />
                  </div>
                </div>

                <Separator />

                {selectedRepo.integration && (
                  <>
                    <div>
                      <div className="font-semibold text-slate-900 mb-3">Integration &amp; Settlement Context</div>
                      <IntegrationContextPanel integration={selectedRepo.integration} />
                    </div>
                    <Separator />
                  </>
                )}

                <div>
                  <div className="font-semibold text-slate-900 mb-3">ISO 15022 MT543 — Raw Instruction</div>
                  <pre className="rounded-md bg-slate-900 text-slate-100 p-4 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {buildMT543(selectedRepo, selectedAsset)}
                  </pre>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
