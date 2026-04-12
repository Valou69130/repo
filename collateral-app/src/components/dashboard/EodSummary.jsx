import { TrendingDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtMoney } from "@/domain/format";

export function EodSummary({ repos, assets }) {
  const today       = new Date().toISOString().slice(0, 10);
  const activeRepos = repos.filter((r) => r.state !== "Closed");

  const rows = activeRepos.map((r) => {
    const elapsed      = Math.max(1, Math.ceil((new Date() - new Date(r.startDate)) / 86400000));
    const dailyInterest = Math.round(r.amount * (r.rate / 100) / 360);
    const totalAccrued  = dailyInterest * elapsed;
    const coverage      = Math.round((r.postedCollateral / r.requiredCollateral) * 100);
    const daysLeft      = Math.max(0, Math.ceil((new Date(r.maturityDate) - new Date()) / 86400000));
    return { ...r, elapsed, dailyInterest, totalAccrued, coverage, daysLeft };
  });

  const totalDailyInterest = rows.reduce((s, r) => s + r.dailyInterest, 0);
  const totalAccrued       = rows.reduce((s, r) => s + r.totalAccrued, 0);
  const totalFunding       = activeRepos.reduce((s, r) => s + r.amount, 0);
  const totalCollateral    = activeRepos.reduce((s, r) => s + r.postedCollateral, 0);
  const utilizationPct     =
    totalCollateral > 0
      ? Math.round(
          (assets.filter((a) => a.status !== "Available").reduce((s, a) => s + a.marketValue, 0) /
            assets.reduce((s, a) => s + a.marketValue, 0)) *
            100
        )
      : 0;

  return (
    <Card className="rounded-md shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>End-of-Day Position Summary</CardTitle>
            <CardDescription>
              Daily P&amp;L attribution, net funding position, and collateral efficiency — as of {today}
            </CardDescription>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-medium border border-slate-200 px-2 py-1 rounded">
            EoD SNAPSHOT
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            { label: "Net Funding Outstanding", value: fmtMoney(totalFunding), sub: `${activeRepos.length} open repos`, color: "" },
            { label: "Daily Interest Income", value: fmtMoney(totalDailyInterest), sub: "Accruing today", color: "text-emerald-700" },
            { label: "Total Interest Accrued", value: fmtMoney(totalAccrued), sub: "Across all open trades", color: "" },
            { label: "Portfolio Encumbrance", value: `${utilizationPct}%`, sub: "of total collateral pool used", color: "" },
          ].map((m) => (
            <div key={m.label} className="rounded border bg-slate-50 p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{m.label}</div>
              <div className={`text-lg font-bold ${m.color || "text-slate-900"}`}>{m.value}</div>
              <div className="text-xs text-slate-400">{m.sub}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Per-Repo Interest Attribution
          </div>
          <div className="rounded border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Repo</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Notional</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Days Elapsed</TableHead>
                  <TableHead>Daily Interest</TableHead>
                  <TableHead>Total Accrued</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead>Days Left</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs font-medium">{r.id}</TableCell>
                    <TableCell className="text-sm">{r.counterparty}</TableCell>
                    <TableCell>{fmtMoney(r.amount, r.currency)}</TableCell>
                    <TableCell>{r.rate}%</TableCell>
                    <TableCell className="text-slate-500">{r.elapsed}d</TableCell>
                    <TableCell className="font-semibold text-emerald-700">{fmtMoney(r.dailyInterest, r.currency)}</TableCell>
                    <TableCell className="font-semibold text-slate-800">{fmtMoney(r.totalAccrued, r.currency)}</TableCell>
                    <TableCell>
                      <span className={`font-semibold text-sm ${r.buffer < 0 ? "text-red-600" : r.coverage < 103 ? "text-amber-600" : "text-emerald-600"}`}>
                        {r.coverage}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`font-semibold ${r.daysLeft <= 1 ? "text-red-600" : r.daysLeft <= 3 ? "text-amber-600" : "text-slate-600"}`}>
                        {r.daysLeft}d
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-slate-400 text-sm italic py-6">
                      No active repo positions
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="rounded border-l-4 border-blue-400 bg-blue-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <TrendingDown className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-700">
              <span className="font-semibold">Collateral efficiency:</span> {utilizationPct}% of the portfolio is
              encumbered.{" "}
              {utilizationPct > 80
                ? "Free pool is thin — monitor upcoming maturities to avoid collateral shortfall."
                : "Free pool is healthy. Consider deploying excess eligible assets in new funding transactions."}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
