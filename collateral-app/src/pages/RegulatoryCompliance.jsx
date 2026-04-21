import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Scale, ShieldCheck, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { KpiCard } from "@/components/shared/KpiCard";
import { fmtMoney } from "@/domain/format";
import { COUNTERPARTY_PROFILES } from "@/domain/counterparties";
import {
  OWN_FUNDS_RON,
  LARGE_EXPOSURE_LIMIT_PCT,
  LARGE_EXPOSURE_LIMIT_RON,
  BNR_POLICY_RATE,
  BNR_DEPOSIT_FACILITY,
  BNR_LENDING_FACILITY,
  ROBOR,
  benchmarkLabel,
  spreadBps,
} from "@/domain/benchmarks";

function CompliancePill({ pass }) {
  return pass
    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5"><CheckCircle2 className="h-3 w-3" />Compliant</span>
    : <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5"><AlertTriangle className="h-3 w-3" />Breach</span>;
}

function LimitBar({ used, limit, label }) {
  const pct = Math.min(Math.round((used / limit) * 100), 100);
  const color = pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-500">{label}</span>
        <span className={`font-semibold ${pct >= 90 ? "text-red-600" : pct >= 75 ? "text-amber-600" : "text-emerald-600"}`}>{pct}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded overflow-hidden">
        <div className={`h-2 rounded transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
        <span>{fmtMoney(used)}</span>
        <span>Limit: {fmtMoney(limit)}</span>
      </div>
    </div>
  );
}

export function RegulatoryCompliance({ repos, assets, navigate }) {
  const activeRepos = repos.filter((r) => r.state !== "Closed");

  // Large exposure per counterparty (CRR Art. 395 — max 25% of own funds)
  const largeExposures = useMemo(() => {
    const map = {};
    for (const r of activeRepos) {
      map[r.counterparty] = (map[r.counterparty] ?? 0) + r.amount;
    }
    return Object.entries(map).map(([cp, exposure]) => {
      const pct = (exposure / OWN_FUNDS_RON) * 100;
      const breach = exposure > LARGE_EXPOSURE_LIMIT_RON;
      const profile = COUNTERPARTY_PROFILES[cp];
      return { cp, exposure, pct: Math.round(pct * 10) / 10, breach, lei: profile?.lei ?? "—" };
    }).sort((a, b) => b.exposure - a.exposure);
  }, [activeRepos]);

  // Concentration check: single-ISIN > 35% of posted collateral per repo
  const concentrationBreaches = useMemo(() => {
    const results = [];
    for (const r of activeRepos) {
      const repoAssets = assets.filter((a) => r.assets?.includes(a.id));
      for (const a of repoAssets) {
        const pct = r.postedCollateral > 0 ? (a.marketValue / r.postedCollateral) * 100 : 0;
        const profile = COUNTERPARTY_PROFILES[r.counterparty];
        const limit = (profile?.concentrationLimit ?? 0.35) * 100;
        if (pct > limit) results.push({ repo: r.id, cp: r.counterparty, asset: a.name, isin: a.isin, pct: Math.round(pct), limit: Math.round(limit) });
      }
    }
    return results;
  }, [activeRepos, assets]);

  // Haircut compliance: all posted assets must meet counterparty max haircut
  const haircutBreaches = useMemo(() => {
    const results = [];
    for (const r of activeRepos) {
      const profile = COUNTERPARTY_PROFILES[r.counterparty];
      const maxHaircut = profile?.maxHaircut ?? 10;
      const repoAssets = assets.filter((a) => r.assets?.includes(a.id));
      for (const a of repoAssets) {
        if (a.haircut > maxHaircut) results.push({ repo: r.id, cp: r.counterparty, asset: a.name, haircut: a.haircut, max: maxHaircut });
      }
    }
    return results;
  }, [activeRepos, assets]);

  // MTA check: buffer on deficit repos < MTA means call should have been issued
  const mtaBreaches = useMemo(() => {
    return activeRepos
      .filter((r) => r.buffer < 0)
      .map((r) => {
        const profile = COUNTERPARTY_PROFILES[r.counterparty];
        const mta = profile?.minimumTransferAmount ?? 150000;
        const deficit = Math.abs(r.buffer);
        return { repo: r.id, cp: r.counterparty, deficit, mta, callRequired: deficit >= mta };
      })
      .filter((r) => r.callRequired);
  }, [activeRepos]);

  // Benchmark spreads
  const benchmarkRows = useMemo(() => {
    return activeRepos.map((r) => {
      const tenor = Math.max(1, Math.ceil((new Date(r.maturityDate) - new Date(r.startDate)) / 86400000));
      const bm = benchmarkLabel(tenor, r.currency);
      const spread = spreadBps(r.rate, bm.rate);
      return { ...r, tenor, bm, spread };
    });
  }, [activeRepos]);

  const totalBreaches = largeExposures.filter((e) => e.breach).length + concentrationBreaches.length + haircutBreaches.length;
  const totalExposure = activeRepos.reduce((s, r) => s + r.amount, 0);
  const largeExposureBreach = largeExposures.some((e) => e.breach);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Regulatory Compliance</h1>
        <p className="mt-1 text-slate-500">
          BNR large exposure limits (CRR Art. 395), collateral concentration, haircut compliance, MTA tracking, and benchmark rate spreads.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="Compliance Breaches" value={String(totalBreaches)} description="Across all checks" icon={Scale} alert={totalBreaches > 0} />
        <KpiCard title="Large Exposure" value={`${Math.round((totalExposure / OWN_FUNDS_RON) * 100)}%`} description={`of own funds (limit ${Math.round(LARGE_EXPOSURE_LIMIT_PCT * 100)}% per CRR)`} icon={ShieldCheck} alert={largeExposureBreach} />
        <KpiCard title="MTA Breaches" value={String(mtaBreaches.length)} description="Margin calls required but not issued" icon={AlertTriangle} alert={mtaBreaches.length > 0} />
        <KpiCard title="BNR Policy Rate" value={`${BNR_POLICY_RATE}%`} description={`Deposit: ${BNR_DEPOSIT_FACILITY}% · Lending: ${BNR_LENDING_FACILITY}%`} icon={TrendingUp} />
      </div>

      {/* Large exposure per counterparty */}
      <Card className="rounded-md shadow-sm">
        <CardHeader>
          <CardTitle>Large Exposure Limits — CRR Art. 395</CardTitle>
          <CardDescription>
            Maximum exposure per counterparty: 25% of own funds ({fmtMoney(LARGE_EXPOSURE_LIMIT_RON)}). Own funds basis: {fmtMoney(OWN_FUNDS_RON)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {largeExposures.map((e) => (
            <div key={e.cp}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-semibold text-slate-900 text-sm">{e.cp}</span>
                  <span className="ml-2 font-mono text-xs text-slate-400">{e.lei}</span>
                </div>
                <CompliancePill pass={!e.breach} />
              </div>
              <LimitBar used={e.exposure} limit={LARGE_EXPOSURE_LIMIT_RON} label={`${e.pct}% of own funds`} />
            </div>
          ))}
          {largeExposures.length === 0 && (
            <div className="text-sm text-slate-400 italic text-center py-4">No active counterparty exposures.</div>
          )}
        </CardContent>
      </Card>

      {/* Collateral concentration */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className={`rounded-md shadow-sm ${concentrationBreaches.length > 0 ? "border-red-200" : ""}`}>
          <CardHeader>
            <CardTitle>Single-ISIN Concentration</CardTitle>
            <CardDescription>Per counterparty agreement: max single-ISIN weight in posted collateral basket.</CardDescription>
          </CardHeader>
          <CardContent>
            {concentrationBreaches.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 py-4">
                <CheckCircle2 className="h-4 w-4" /> All repos within concentration limits.
              </div>
            ) : (
              <div className="space-y-2">
                {concentrationBreaches.map((b, i) => (
                  <div key={i} className="rounded border border-red-200 bg-red-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-red-800 text-xs">{b.repo} — {b.asset}</span>
                      <Badge variant="outline" className="text-xs rounded bg-red-100 text-red-700 border-red-300">{b.pct}% vs {b.limit}% limit</Badge>
                    </div>
                    <div className="text-[10px] text-red-500 mt-0.5 font-mono">{b.isin} · {b.cp}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={`rounded-md shadow-sm ${haircutBreaches.length > 0 ? "border-red-200" : ""}`}>
          <CardHeader>
            <CardTitle>Haircut Compliance</CardTitle>
            <CardDescription>Posted assets must not exceed the maximum haircut agreed in each bilateral agreement.</CardDescription>
          </CardHeader>
          <CardContent>
            {haircutBreaches.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 py-4">
                <CheckCircle2 className="h-4 w-4" /> All collateral within agreed haircut limits.
              </div>
            ) : (
              <div className="space-y-2">
                {haircutBreaches.map((b, i) => (
                  <div key={i} className="rounded border border-red-200 bg-red-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-red-800 text-xs">{b.repo} — {b.asset}</span>
                      <Badge variant="outline" className="text-xs rounded bg-red-100 text-red-700 border-red-300">{b.haircut}% haircut vs {b.max}% max</Badge>
                    </div>
                    <div className="text-[10px] text-red-500 mt-0.5">{b.cp}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* MTA tracking */}
      {mtaBreaches.length > 0 && (
        <Card className="rounded-md shadow-sm border-amber-200">
          <CardHeader>
            <CardTitle className="text-amber-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> MTA Breach — Margin Calls Required
            </CardTitle>
            <CardDescription>The following repos have a deficit exceeding the Minimum Transfer Amount. A formal margin call must be issued immediately.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Repo</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Deficit</TableHead>
                  <TableHead>MTA</TableHead>
                  <TableHead>Action Required</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mtaBreaches.map((b) => (
                  <TableRow key={b.repo}>
                    <TableCell className="font-mono text-sm font-medium">{b.repo}</TableCell>
                    <TableCell>{b.cp}</TableCell>
                    <TableCell className="font-semibold text-red-600">{fmtMoney(b.deficit)}</TableCell>
                    <TableCell className="text-slate-500">{fmtMoney(b.mta)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs rounded border-amber-300 text-amber-700 hover:bg-amber-50"
                        onClick={() => navigate?.('agreements')}
                      >
                        Issue margin call
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Rate benchmark overlay */}
      <Card className="rounded-md shadow-sm">
        <CardHeader>
          <CardTitle>Rate Benchmark Overlay</CardTitle>
          <CardDescription>
            Repo rates vs ROBOR / EURIBOR reference fixings. Spread in basis points — positive = funding above benchmark (cheap for borrower), negative = below benchmark (expensive).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* BNR corridor */}
          <div className="rounded border bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">BNR Rate Corridor</div>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                { label: "Lending Facility", rate: BNR_LENDING_FACILITY, color: "text-red-600" },
                { label: "Policy Rate",      rate: BNR_POLICY_RATE,      color: "text-slate-900" },
                { label: "Deposit Facility", rate: BNR_DEPOSIT_FACILITY, color: "text-emerald-600" },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <div className={`text-2xl font-bold ${item.color}`}>{item.rate}%</div>
                  <div className="text-xs text-slate-400 mt-0.5">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ROBOR fixings */}
          <div className="rounded border bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">ROBOR Fixing — {new Date().toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" })}</div>
            <div className="grid gap-2 grid-cols-3 md:grid-cols-6">
              {Object.values(ROBOR).map((r) => (
                <div key={r.label} className="text-center">
                  <div className="text-sm font-bold text-slate-800">{r.rate}%</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{r.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-repo spread table */}
          <div className="rounded border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Repo</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Repo Rate</TableHead>
                  <TableHead>Tenor</TableHead>
                  <TableHead>Benchmark</TableHead>
                  <TableHead>Benchmark Rate</TableHead>
                  <TableHead>Spread (bps)</TableHead>
                  <TableHead>Assessment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {benchmarkRows.map((r) => {
                  const spread = r.spread;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm font-medium">{r.id}</TableCell>
                      <TableCell className="text-sm">{r.counterparty}</TableCell>
                      <TableCell className="font-semibold">{r.rate}%</TableCell>
                      <TableCell>{r.tenor}d</TableCell>
                      <TableCell className="text-xs text-slate-500">{r.bm.label}</TableCell>
                      <TableCell className="text-slate-500">{r.bm.rate}%</TableCell>
                      <TableCell>
                        <span className={`font-bold text-sm ${spread < -20 ? "text-red-600" : spread < 0 ? "text-amber-600" : "text-emerald-600"}`}>
                          {spread > 0 ? "+" : ""}{spread} bps
                        </span>
                      </TableCell>
                      <TableCell>
                        {spread < -50
                          ? <Badge variant="outline" className="text-xs rounded bg-red-50 text-red-700 border-red-200">Significantly below market</Badge>
                          : spread < -10
                          ? <Badge variant="outline" className="text-xs rounded bg-amber-50 text-amber-700 border-amber-200">Below benchmark</Badge>
                          : spread < 30
                          ? <Badge variant="outline" className="text-xs rounded bg-emerald-50 text-emerald-700 border-emerald-200">At market</Badge>
                          : <Badge variant="outline" className="text-xs rounded bg-blue-50 text-blue-700 border-blue-200">Above benchmark</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {benchmarkRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-slate-400 italic py-6 text-sm">No active repos.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Regulatory framework reference */}
      <Card className="rounded-md border-dashed bg-slate-50">
        <CardContent className="p-5 text-xs text-slate-500 space-y-2">
          <div className="font-semibold text-slate-700 mb-1">Regulatory Framework References</div>
          <div className="grid gap-1.5 md:grid-cols-2">
            <div>• <span className="font-medium text-slate-600">CRR Art. 395</span> — Large exposure limit: 25% of eligible capital base per counterparty</div>
            <div>• <span className="font-medium text-slate-600">EMIR/SFTR</span> — Daily margin call obligation; MTA must be respected</div>
            <div>• <span className="font-medium text-slate-600">NBR Reg. 5/2013</span> — Romanian collateral eligibility and SaFIR settlement requirements</div>
            <div>• <span className="font-medium text-slate-600">GMRA 2011</span> — Governing agreement for bilateral repo; concentration limits per annex</div>
            <div>• <span className="font-medium text-slate-600">ECB CSPP</span> — Eligible collateral haircut framework referenced for sovereign bonds</div>
            <div>• <span className="font-medium text-slate-600">BNR Corridor</span> — Policy rate {BNR_POLICY_RATE}% · Deposit {BNR_DEPOSIT_FACILITY}% · Lending {BNR_LENDING_FACILITY}%</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
