import { useState, useMemo } from "react";
import { AlertTriangle, Building2, CheckCircle2, ChevronRight, Shield, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Info } from "@/components/shared/Info";
import { fmtMoney, adjustedValue } from "@/domain/format";
import { COUNTERPARTY_PROFILES, utilizationColor, utilizationBg } from "@/domain/counterparties";

function UtilBar({ pct }) {
  const color = utilizationBg(pct);
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
      </div>
      <span className={`text-xs font-semibold w-10 text-right ${utilizationColor(pct)}`}>{pct}%</span>
    </div>
  );
}

function RuleRow({ label, pass, description }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0">
      <div className={`mt-0.5 flex-shrink-0 ${pass ? "text-emerald-500" : "text-red-500"}`}>
        {pass ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${pass ? "text-slate-800" : "text-red-700"}`}>{label}</div>
        <div className="text-xs text-slate-400 mt-0.5">{description}</div>
      </div>
    </div>
  );
}

export function CounterpartyMonitor({ repos, assets }) {
  const [selected, setSelected] = useState(null);

  const counterparties = useMemo(() => {
    const map = {};
    for (const r of repos) {
      if (!map[r.counterparty]) {
        map[r.counterparty] = { name: r.counterparty, repos: [], exposure: 0, posted: 0 };
      }
      map[r.counterparty].repos.push(r);
      if (r.state !== "Closed") {
        map[r.counterparty].exposure += r.amount;
        map[r.counterparty].posted += r.postedCollateral;
      }
    }
    return Object.values(map).map((cp) => {
      const profile = COUNTERPARTY_PROFILES[cp.name];
      const limit = profile?.creditLimit ?? 20000000;
      const utilPct = Math.round((cp.exposure / limit) * 100);
      const deficitRepos = cp.repos.filter((r) => r.buffer < 0);
      const activeRepos = cp.repos.filter((r) => r.state !== "Closed");
      return { ...cp, profile, limit, utilPct, deficitRepos, activeRepos };
    });
  }, [repos]);

  const totals = useMemo(() => {
    const totalLimit = counterparties.reduce((s, c) => s + c.limit, 0);
    const totalExp = counterparties.reduce((s, c) => s + c.exposure, 0);
    const breaches = counterparties.filter((c) => c.utilPct >= 90).length;
    return { totalLimit, totalExp, utilPct: Math.round((totalExp / totalLimit) * 100), breaches };
  }, [counterparties]);

  // Eligible collateral per counterparty
  const selectedEligible = useMemo(() => {
    if (!selected?.profile) return [];
    return assets.filter((a) =>
      a.status === "Available" &&
      selected.profile.eligibleTypes.includes(a.type) &&
      a.haircut <= selected.profile.maxHaircut
    );
  }, [selected, assets]);

  // Per-counterparty asset concentration check
  const concentrationWarnings = useMemo(() => {
    if (!selected) return [];
    const warnings = [];
    for (const r of selected.activeRepos) {
      const repoAssets = assets.filter((a) => r.assets?.includes(a.id));
      for (const a of repoAssets) {
        const aVal = adjustedValue(a);
        const pct = r.postedCollateral > 0 ? aVal / r.postedCollateral : 0;
        const limit = selected.profile?.concentrationLimit ?? 0.35;
        if (pct > limit) {
          warnings.push({ repo: r.id, asset: a.name, pct: Math.round(pct * 100), limit: Math.round(limit * 100) });
        }
      }
    }
    return warnings;
  }, [selected, assets]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Counterparty Monitor</h1>
        <p className="mt-1 text-slate-500">
          Credit limit utilisation, bilateral agreement terms, and eligible collateral per counterparty.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="Active Counterparties" value={String(counterparties.length)} description="With live repo exposure" icon={Building2} />
        <KpiCard title="Total Credit Limit" value={fmtMoney(totals.totalLimit)} description="Across all bilateral agreements" icon={Shield} />
        <KpiCard title="Total Exposure" value={fmtMoney(totals.totalExp)} description={`${totals.utilPct}% of aggregate limit`} icon={TrendingUp} />
        <KpiCard title="Limit Warnings" value={String(totals.breaches)} description="Counterparties ≥ 90% utilised" icon={AlertTriangle} alert={totals.breaches > 0} />
      </div>

      <Card className="rounded-md shadow-sm">
        <CardHeader>
          <CardTitle>Counterparty Exposure & Limits</CardTitle>
          <CardDescription>Click a row to view bilateral agreement details, eligible collateral, and concentration checks.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Counterparty</TableHead>
                <TableHead>LEI</TableHead>
                <TableHead>Agreement</TableHead>
                <TableHead>Credit Limit</TableHead>
                <TableHead>Current Exposure</TableHead>
                <TableHead>Headroom</TableHead>
                <TableHead>Utilisation</TableHead>
                <TableHead>Active Repos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {counterparties.map((cp) => {
                const headroom = cp.limit - cp.exposure;
                const status = cp.deficitRepos.length > 0 ? "Margin deficit" :
                  cp.utilPct >= 90 ? "Warning" :
                  cp.exposure === 0 ? "Closed" : "In compliance";
                return (
                  <TableRow key={cp.name} className="cursor-pointer" onClick={() => setSelected(cp)}>
                    <TableCell>
                      <div className="font-semibold text-slate-900">{cp.name}</div>
                      <div className="text-xs text-slate-400">{cp.profile?.settlementSystem ?? "SaFIR"}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{cp.profile?.lei ?? "—"}</TableCell>
                    <TableCell>
                      <div className="text-sm">{cp.profile?.agreementType ?? "GMRA"}</div>
                      <div className="text-xs text-slate-400">{cp.profile?.agreementDate ?? "—"}</div>
                    </TableCell>
                    <TableCell className="font-medium">{fmtMoney(cp.limit, cp.profile?.currency ?? "RON")}</TableCell>
                    <TableCell className={cp.exposure > 0 ? "font-medium" : "text-slate-400"}>
                      {fmtMoney(cp.exposure, cp.profile?.currency ?? "RON")}
                    </TableCell>
                    <TableCell className={headroom < 0 ? "text-red-600 font-medium" : "text-slate-600"}>
                      {fmtMoney(headroom, cp.profile?.currency ?? "RON")}
                    </TableCell>
                    <TableCell className="w-48">
                      <UtilBar pct={cp.utilPct} />
                    </TableCell>
                    <TableCell>{cp.activeRepos.length}</TableCell>
                    <TableCell><StatusBadge status={status} /></TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-slate-400" /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-[600px] sm:w-[600px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>{selected.profile?.lei ?? "No LEI on file"} · {selected.profile?.agreementType ?? "GMRA"}</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6 text-sm">

                {/* Exposure summary */}
                <div>
                  <div className="font-semibold text-slate-900 mb-3">Credit Exposure</div>
                  <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                    <Info label="Credit Limit" value={fmtMoney(selected.limit, selected.profile?.currency)} />
                    <Info label="Current Exposure" value={fmtMoney(selected.exposure, selected.profile?.currency)} />
                    <Info label="Available Headroom" value={fmtMoney(selected.limit - selected.exposure, selected.profile?.currency)} />
                    <div>
                      <div className="text-xs text-slate-500 mb-1.5">Utilisation</div>
                      <UtilBar pct={selected.utilPct} />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Bilateral agreement terms */}
                <div>
                  <div className="font-semibold text-slate-900 mb-3">Bilateral Agreement Terms</div>
                  <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                    <Info label="Agreement" value={selected.profile?.agreementType ?? "GMRA"} />
                    <Info label="Signed" value={selected.profile?.agreementDate ?? "—"} />
                    <Info label="Settlement System" value={selected.profile?.settlementSystem ?? "SaFIR"} />
                    <Info label="Margin Call Frequency" value={selected.profile?.marginCallFrequency ?? "Daily"} />
                    <Info label="Min Transfer Amount" value={selected.profile ? fmtMoney(selected.profile.minimumTransferAmount, selected.profile.currency) : "—"} />
                    <Info label="Max Single-ISIN Concentration" value={selected.profile ? `${Math.round(selected.profile.concentrationLimit * 100)}%` : "—"} />
                    <Info label="Relationship Manager" value={selected.profile?.relationshipManager ?? "—"} />
                  </div>
                </div>

                <Separator />

                {/* Eligible collateral types */}
                <div>
                  <div className="font-semibold text-slate-900 mb-3">Accepted Collateral Types</div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(selected.profile?.eligibleTypes ?? []).map((t) => (
                      <Badge key={t} variant="outline" className="rounded-full bg-emerald-50 text-emerald-700 border-emerald-200">{t}</Badge>
                    ))}
                  </div>
                  <div className="text-xs text-slate-500 mb-2">Min rating: {selected.profile?.minRating ?? "BBB"} · Max haircut: {selected.profile?.maxHaircut ?? 10}%</div>

                  {selectedEligible.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Available eligible assets</div>
                      {selectedEligible.map((a) => (
                        <div key={a.id} className="rounded border bg-white px-3 py-2 flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-slate-800 text-xs">{a.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{a.isin}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold text-slate-800">{fmtMoney(adjustedValue(a), a.currency)}</div>
                            <div className="text-[10px] text-slate-400">adjusted</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic">No available eligible assets at this time.</div>
                  )}
                </div>

                <Separator />

                {/* Concentration warnings */}
                {concentrationWarnings.length > 0 && (
                  <>
                    <div>
                      <div className="font-semibold text-red-700 mb-3 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" /> Concentration Limit Breaches
                      </div>
                      <div className="space-y-2">
                        {concentrationWarnings.map((w, i) => (
                          <div key={i} className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs">
                            <span className="font-semibold text-red-700">{w.asset}</span> in {w.repo} —{" "}
                            <span className="text-red-600">{w.pct}%</span> of posted collateral exceeds {w.limit}% limit
                          </div>
                        ))}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                {/* Active repos */}
                <div>
                  <div className="font-semibold text-slate-900 mb-3">Active Repo Positions</div>
                  {selected.activeRepos.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">No active positions.</div>
                  ) : (
                    <div className="space-y-2">
                      {selected.activeRepos.map((r) => (
                        <div key={r.id} className="rounded border bg-white px-3 py-2 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-slate-600">{r.id}</span>
                            <StatusBadge status={r.state} />
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>Notional: <span className="font-semibold text-slate-800">{fmtMoney(r.amount, r.currency)}</span></span>
                            <span>Matures: {r.maturityDate}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Buffer:</span>
                            <span className={r.buffer < 0 ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>
                              {fmtMoney(r.buffer, r.currency)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
