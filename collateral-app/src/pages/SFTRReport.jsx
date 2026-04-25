import { useMemo, useState, useEffect, useCallback } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Download, FileBarChart, FileCode, FileText, Send } from "lucide-react";
import { api } from "@/integrations/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { fmtMoney, adjustedValue } from "@/domain/format";
import { COUNTERPARTY_PROFILES } from "@/domain/counterparties";

// SFTR required fields per ESMA RTS 2019/363
function buildSFTRRow(repo, assets) {
  const repoAssets = assets.filter((a) => repo.assets?.includes(a.id));
  const profile = COUNTERPARTY_PROFILES[repo.counterparty];

  const reportType = repo.state === "Closed" ? "TERM" : "NEWT";
  const reportStatus =
    repo.state === "Closed" ? "Submitted" :
    repo.settlement === "Confirmed" ? "Accepted" :
    "Pending";

  const totalCollateralValue = repoAssets.reduce((s, a) => s + a.marketValue, 0);
  const totalAdjustedValue   = repoAssets.reduce((s, a) => s + adjustedValue(a), 0);
  const totalHaircut = totalCollateralValue > 0
    ? Math.round(((totalCollateralValue - totalAdjustedValue) / totalCollateralValue) * 100)
    : 0;

  // Interest at maturity
  const startD = new Date(repo.startDate);
  const endD   = new Date(repo.maturityDate);
  const tenor  = Math.max(1, Math.ceil((endD - startD) / 86400000));
  const interest = Math.round(repo.amount * (repo.rate / 100) * (tenor / 360));

  return {
    // Counterparty data (Table 1)
    uti:                    `RO-BDEMO-${repo.id}-01`,
    reportingCptyLei:       "549300BNCDEMORO00066",
    reportingCptyType:      "F",           // Financial counterparty
    otherCptyLei:           profile?.lei ?? `NOCPYLEI${repo.counterparty.slice(0,4).toUpperCase()}`,
    otherCptyType:          "F",
    reportType,
    reportStatus,

    // Loan data (Table 2)
    principalAmount:        repo.amount,
    currency:               repo.currency,
    // ONIC=overnight, FIXD=fixed-term (any defined maturity), OPEN=open-ended (no fixed maturity)
    maturityType:           tenor <= 1 ? "ONIC" : (repo.maturityDate ? "FIXD" : "OPEN"),
    startDate:              repo.startDate,
    maturityDate:           repo.maturityDate,
    tenor,
    repoRate:               repo.rate,
    dayCountConvention:     "A360",
    interestAmount:         interest,
    settlementType:         "DVCP",        // Delivery vs cash payment
    executionVenue:         "XOFF",        // Off-venue (bilateral)

    // Collateral data (Table 3)
    collateralType:         "SECU",        // Securities
    collateralQuality:      "INVG",        // Investment grade
    collateralISINs:        repoAssets.map((a) => a.isin),
    collateralTypes:        [...new Set(repoAssets.map((a) => a.type))],
    collateralNominal:      totalCollateralValue,
    collateralMarketValue:  totalAdjustedValue,
    haircut:                totalHaircut,
    collateralCurrency:     repo.currency,
    custodianName:          "SaFIR / BNR Custodian",

    // Re-use data (Table 4)
    reuseFlag:              "N",
    reinvestmentReturn:     "N/A",

    _raw: { repo, repoAssets },
  };
}

function ReportTypeBadge({ type, status }) {
  const typeColor =
    type === "TERM" ? "bg-slate-50 text-slate-600 border-slate-200" :
    type === "NEWT" ? "bg-blue-50 text-blue-700 border-blue-200" :
    "bg-amber-50 text-amber-700 border-amber-200";
  const statusColor =
    status === "Submitted" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    status === "Accepted"  ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    status === "Pending"   ? "bg-amber-50 text-amber-700 border-amber-200" :
    "bg-red-50 text-red-700 border-red-200";
  const statusIcon =
    status === "Submitted" || status === "Accepted" ? <CheckCircle2 className="h-3 w-3" /> :
    status === "Pending" ? <Clock3 className="h-3 w-3" /> :
    <AlertTriangle className="h-3 w-3" />;
  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="outline" className={`text-xs rounded ${typeColor}`}>{type}</Badge>
      <Badge variant="outline" className={`text-xs rounded flex items-center gap-1 ${statusColor}`}>
        {statusIcon}{status}
      </Badge>
    </div>
  );
}

// XML export now served from backend — ISO 20022 auth.030.001.03 schema

export function SFTRReport({ repos, assets }) {
  const [expanded, setExpanded] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const loadSubmissions = useCallback(async () => {
    try {
      const data = await api.listSFTRSubmissions();
      setSubmissions(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  useEffect(() => { loadSubmissions(); }, [loadSubmissions]);

  const submittedUtis = useMemo(() => new Set(submissions.map((s) => s.uti)), [submissions]);

  const rows = useMemo(() =>
    repos.map((r) => buildSFTRRow(r, assets)),
    [repos, assets]
  );

  const pending  = rows.filter((r) => !submittedUtis.has(r.uti) && r.reportStatus === "Pending").length;
  const accepted = rows.filter((r) => submittedUtis.has(r.uti) || r.reportStatus === "Accepted" || r.reportStatus === "Submitted").length;

  const submitAll = async () => {
    setSubmitting(true);
    try {
      const toSubmit = rows.filter((r) => !submittedUtis.has(r.uti));
      await Promise.all(toSubmit.map((r) =>
        api.submitSFTRReport({
          uti: r.uti,
          repoId: r._raw.repo.id,
          reportType: r.reportType,
          principalAmount: r.principalAmount,
          currency: r.currency,
        }).catch(() => {})
      ));
      await loadSubmissions();
    } finally {
      setSubmitting(false);
    }
  };
  // Collateral breakdown by type
  const collateralBreakdown = useMemo(() => {
    const map = {};
    for (const r of rows) {
      for (const type of r.collateralTypes) {
        map[type] = (map[type] ?? 0) + r.collateralMarketValue;
      }
    }
    return Object.entries(map).map(([type, value]) => ({ type, value }));
  }, [rows]);

  const totalNotional = rows.reduce((s, r) => s + r.principalAmount, 0);
  const totalCollateral = rows.reduce((s, r) => s + r.collateralMarketValue, 0);

  const exportCSV = () => {
    const headers = [
      "UTI", "Report Type", "Status",
      "Reporting Cpty LEI", "Other Cpty LEI",
      "Principal", "Currency", "Tenor", "Rate",
      "Start Date", "Maturity Date",
      "Collateral Market Value", "Haircut%",
      "Settlement Type", "Execution Venue",
      "Re-use", "Day Count"
    ];
    const csvRows = rows.map((r) => [
      r.uti, r.reportType, r.reportStatus,
      r.reportingCptyLei, r.otherCptyLei,
      r.principalAmount, r.currency, r.tenor, r.repoRate,
      r.startDate, r.maturityDate,
      r.collateralMarketValue, r.haircut,
      r.settlementType, r.executionVenue,
      r.reuseFlag, r.dayCountConvention,
    ]);
    const csv = [headers, ...csvRows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `SFTR_${new Date().toISOString().slice(0,10)}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  const exportXML = async () => {
    try {
      const res = await api.downloadSFTRPortfolioXml();
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `SFTR_Portfolio_${new Date().toISOString().slice(0,10)}.xml`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('XML export failed — check API connection');
    }
  };

  const exportTradeXML = async (repoId) => {
    try {
      const res = await api.downloadSFTRXml(repoId);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `SFTR_${repoId}_${new Date().toISOString().slice(0,10)}.xml`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('XML export failed — check API connection');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">SFTR Regulatory Report</h1>
          <p className="mt-1 text-slate-500">
            Securities Financing Transaction Regulation (EU 2015/2365) — trade-level reporting per ESMA RTS 2019/363.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-md" onClick={exportCSV}>
            <FileText className="h-4 w-4 mr-1.5" /> Export CSV
          </Button>
          <Button variant="outline" className="rounded-md" onClick={exportXML}>
            <FileCode className="h-4 w-4 mr-1.5" /> Export XML
          </Button>
          <Button className="rounded-md" onClick={submitAll} disabled={submitting || pending === 0}>
            <Send className="h-4 w-4 mr-1.5" />
            {submitting ? "Submitting…" : `Submit to Regis-TR${pending > 0 ? ` (${pending})` : ""}`}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="Reportable Trades" value={String(rows.length)} description="Total SFTR-reportable transactions" icon={FileBarChart} />
        <KpiCard title="Pending Submission" value={String(pending)} description="Awaiting regulatory transmission" icon={Clock3} alert={pending > 0} />
        <KpiCard title="Accepted / Filed" value={String(accepted)} description="Confirmed by trade repository" icon={CheckCircle2} />
        <KpiCard title="Total Notional" value={fmtMoney(totalNotional)} description="Aggregate principal across all trades" icon={FileBarChart} />
      </div>

      {/* Summary metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-md shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Reporting Entity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Legal Entity</span><span className="font-medium">Banca Demo Romania</span></div>
            <div className="flex justify-between"><span className="text-slate-500">LEI</span><span className="font-mono text-xs">549300BNCDEMORO00066</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Counterparty Type</span><span>Financial (F)</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Trade Repository</span><span>Regis-TR</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Reporting Jurisdiction</span><span>Romania / EU</span></div>
          </CardContent>
        </Card>
        <Card className="rounded-md shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Portfolio Totals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Total Principal</span><span className="font-semibold">{fmtMoney(totalNotional)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Total Collateral MV</span><span className="font-semibold">{fmtMoney(totalCollateral)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Avg Repo Rate</span>
              <span className="font-semibold">{rows.length > 0 ? (rows.reduce((s, r) => s + r.repoRate, 0) / rows.length).toFixed(2) : "0.00"}%</span>
            </div>
            <div className="flex justify-between"><span className="text-slate-500">Settlement Type</span><span>DVP (DVCP)</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Execution Venue</span><span>Bilateral (XOFF)</span></div>
          </CardContent>
        </Card>
        <Card className="rounded-md shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Collateral Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {collateralBreakdown.map((cb) => (
              <div key={cb.type} className="flex justify-between text-sm">
                <span className="text-slate-500">{cb.type}</span>
                <span className="font-semibold">{fmtMoney(cb.value)}</span>
              </div>
            ))}
            {collateralBreakdown.length === 0 && (
              <div className="text-sm text-slate-400 italic">No collateral data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trade-level SFTR table */}
      <Card className="rounded-md shadow-sm">
        <CardHeader>
          <CardTitle>Trade-Level Report — ESMA Fields</CardTitle>
          <CardDescription>
            Full SFTR field set per trade. Click any row to expand collateral detail and re-use data.
            UTI format: RO-BDEMO-{"{repoId}"}-01 per BNR/ESMA convention.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[160px]">UTI</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Other Cpty LEI</TableHead>
                  <TableHead>Principal</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Tenor</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Maturity</TableHead>
                  <TableHead>Collateral MV</TableHead>
                  <TableHead>Haircut</TableHead>
                  <TableHead>Sett. Type</TableHead>
                  <TableHead>Re-use</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <>
                    <TableRow
                      key={row.uti}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => setExpanded(expanded === row.uti ? null : row.uti)}
                    >
                      <TableCell className="font-mono text-xs">{row.uti}</TableCell>
                      <TableCell>
                        <ReportTypeBadge
                          type={row.reportType}
                          status={submittedUtis.has(row.uti) ? "Submitted" : row.reportStatus}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{row.otherCptyLei}</TableCell>
                      <TableCell className="font-medium">{fmtMoney(row.principalAmount, row.currency)}</TableCell>
                      <TableCell>{row.repoRate}%</TableCell>
                      <TableCell>{row.tenor}d</TableCell>
                      <TableCell className="text-slate-500">{row.startDate}</TableCell>
                      <TableCell className="text-slate-500">{row.maturityDate}</TableCell>
                      <TableCell>{fmtMoney(row.collateralMarketValue, row.collateralCurrency)}</TableCell>
                      <TableCell>{row.haircut}%</TableCell>
                      <TableCell><span className="font-mono text-xs text-slate-500">{row.settlementType}</span></TableCell>
                      <TableCell><Badge variant="outline" className="text-xs rounded bg-slate-50 text-slate-500">{row.reuseFlag}</Badge></TableCell>
                    </TableRow>

                    {/* Expanded collateral detail */}
                    {expanded === row.uti && (
                      <TableRow key={`${row.uti}-detail`} className="bg-slate-50">
                        <TableCell colSpan={12} className="py-4 px-6">
                          <div className="flex justify-end mb-3">
                            <Button size="sm" variant="outline" className="rounded-md text-xs gap-1.5" onClick={() => exportTradeXML(row._raw.repo.id)}>
                              <Download className="h-3.5 w-3.5" /> Download ISO 20022 XML
                            </Button>
                          </div>
                          <div className="grid gap-6 md:grid-cols-2">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Collateral Securities (Table 3)</div>
                              <div className="space-y-2">
                                {row._raw.repoAssets.map((a) => (
                                  <div key={a.id} className="rounded border bg-white px-3 py-2 flex items-center justify-between text-xs">
                                    <div>
                                      <div className="font-medium text-slate-800">{a.name}</div>
                                      <div className="font-mono text-slate-400">{a.isin} · {a.type}</div>
                                    </div>
                                    <div className="text-right">
                                      <div className="font-semibold text-slate-800">{fmtMoney(a.marketValue, a.currency)}</div>
                                      <div className="text-slate-400">{a.haircut}% haircut</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Loan Data Fields (Table 2)</div>
                              <div className="space-y-1.5 text-xs">
                                {[
                                  ["Day Count Convention", row.dayCountConvention],
                                  ["Maturity Type", row.maturityType],
                                  ["Execution Venue", row.executionVenue],
                                  ["Interest at Maturity", fmtMoney(row.interestAmount, row.currency)],
                                  ["Collateral Quality", row.collateralQuality],
                                  ["Custodian", row.custodianName],
                                  ["Re-use Flag", row.reuseFlag === "N" ? "Not authorised" : "Authorised"],
                                  ["Reporting Cpty Type", "Financial Counterparty (F)"],
                                ].map(([label, value]) => (
                                  <div key={label} className="flex justify-between border-b border-slate-100 pb-1">
                                    <span className="text-slate-500">{label}</span>
                                    <span className="font-medium text-slate-800">{value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* T+1 Report Scheduler */}
      <Card className="rounded-md shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-slate-500" />
            <CardTitle>SFTR Reporting Schedule — T+1 Tracker</CardTitle>
          </div>
          <CardDescription>
            SFTR requires submission by T+1 09:00 CET to the trade repository. Overdue submissions must be escalated to Compliance.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>UTI</TableHead>
                  <TableHead>Trade Date (T)</TableHead>
                  <TableHead>Report Deadline (T+1 09:00)</TableHead>
                  <TableHead>Report Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const tradeDate = new Date(row.startDate);
                  const deadline = new Date(tradeDate);
                  deadline.setDate(deadline.getDate() + 1);
                  deadline.setHours(9, 0, 0, 0);
                  const now = new Date();
                  const isOverdue = now > deadline && row.reportStatus === "Pending";
                  const isDueSoon = !isOverdue && (deadline - now) < 2 * 3600000 && row.reportStatus === "Pending";
                  const isSubmitted = row.reportStatus === "Submitted" || row.reportStatus === "Accepted";

                  return (
                    <TableRow key={row.uti}>
                      <TableCell className="font-mono text-xs">{row.uti}</TableCell>
                      <TableCell className="text-slate-500">{row.startDate}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {deadline.toISOString().slice(0, 10)} 09:00 CET
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs rounded bg-blue-50 text-blue-700 border-blue-200">{row.reportType}</Badge>
                      </TableCell>
                      <TableCell>
                        {isSubmitted ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Submitted
                          </div>
                        ) : isOverdue ? (
                          <div className="flex items-center gap-1.5 text-xs text-red-600 font-semibold">
                            <AlertTriangle className="h-3.5 w-3.5" /> OVERDUE — escalate
                          </div>
                        ) : isDueSoon ? (
                          <div className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                            <Clock3 className="h-3.5 w-3.5" /> Due soon
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            <Clock3 className="h-3.5 w-3.5" /> Pending
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {isSubmitted ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : isOverdue ? (
                          <Badge variant="outline" className="text-xs rounded bg-red-50 text-red-700 border-red-200 cursor-pointer">Escalate to Compliance</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs rounded bg-slate-50 text-slate-600 cursor-pointer">Submit to Regis-TR</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Regulatory note */}
      <Card className="rounded-md border-dashed bg-slate-50">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-slate-500 space-y-1.5">
              <p>
                <span className="font-semibold text-slate-700">Regulatory framework:</span> SFTR (EU 2015/2365), ESMA RTS/ITS 2019/363. Reporting obligation: T+1 for all new, modified, and terminated repo transactions.
              </p>
              <p>
                <span className="font-semibold text-slate-700">Production submission:</span> Requires connectivity to a registered EU trade repository (Regis-TR, DTCC, UnaVista). UTIs must be generated using the approved LEI-prefix format. XML export uses the ESMA SFTR schema namespace.
              </p>
              <p>
                <span className="font-semibold text-slate-700">Data quality:</span> LEI values are illustrative for this demo. Production requires validated LEIs sourced from GLEIF and real-time ISIN/issuer data from the BNR custodian interface.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
