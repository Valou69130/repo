// ─── Integration Hub ──────────────────────────────────────────────────────────
// Full visibility into the integration layer: trade intake, settlement
// instructions, position sync, reconciliation, and the live event stream.

import { useState, useMemo } from "react";
import {
  Activity, AlertTriangle, ArrowDownToLine, CheckCircle2,
  ChevronDown, ChevronRight, Circle, Clock, Download,
  FileCode2, GitCompareArrows, Link2, Play, RefreshCw,
  Send, ShieldAlert, TerminalSquare, Upload, Wifi, WifiOff, XCircle,
} from "lucide-react";
import { Button }  from "@/components/ui/button";
import { Input }   from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SAMPLE_PAYLOADS } from "@/integrations/adapters/mock/TradeIntakeAdapter";
import { fmtMoney } from "@/domain/format";

// ── Utility helpers ──────────────────────────────────────────────────────────

function timeSince(isoTs) {
  if (!isoTs) return "—";
  const s = Math.floor((Date.now() - new Date(isoTs)) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function shortId(id = "") {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

// ── Small shared components ──────────────────────────────────────────────────

function StatusDot({ status }) {
  const cls = {
    draft:       "bg-slate-300",
    instructed:  "bg-blue-400",
    transmitted: "bg-amber-400 animate-pulse",
    confirmed:   "bg-emerald-500",
    failed:      "bg-red-500",
    cancelled:   "bg-slate-400",
  }[status] || "bg-slate-300";
  return <span className={`inline-block w-2 h-2 rounded-full ${cls} mr-1.5 flex-shrink-0`} />;
}

function SeverityBadge({ severity }) {
  const cls = {
    Critical: "bg-red-100 text-red-700 border-red-200",
    Warning:  "bg-amber-100 text-amber-700 border-amber-200",
    Info:     "bg-blue-100 text-blue-700 border-blue-200",
  }[severity] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 border rounded ${cls}`}>
      {severity}
    </span>
  );
}

function TypePill({ type }) {
  const map = {
    MISSING_EXTERNAL: { label: "Missing Ext",  cls: "bg-red-100 text-red-700" },
    MISSING_INTERNAL: { label: "Missing Int",  cls: "bg-amber-100 text-amber-700" },
    VALUE_MISMATCH:   { label: "Value Δ",      cls: "bg-orange-100 text-orange-700" },
    STATUS_MISMATCH:  { label: "Status Δ",     cls: "bg-purple-100 text-purple-700" },
    SETTLEMENT_FAIL:  { label: "Settlement",   cls: "bg-red-100 text-red-700" },
    TIMEOUT:          { label: "Timeout",      cls: "bg-slate-100 text-slate-600" },
  };
  const { label, cls } = map[type] || { label: type, cls: "bg-slate-100 text-slate-600" };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cls}`}>{label}</span>;
}

function EventTypeBadge({ type = "" }) {
  const group =
    type.startsWith("TRADE")          ? "bg-violet-100 text-violet-700" :
    type.startsWith("SETTLEMENT")     ? "bg-blue-100 text-blue-700" :
    type.startsWith("RECONCILIATION") ? "bg-teal-100 text-teal-700" :
    type.startsWith("POSITION")       ? "bg-sky-100 text-sky-700" :
    type.startsWith("EXCEPTION")      ? "bg-red-100 text-red-700" :
    type.startsWith("CONFIRMATION")   ? "bg-emerald-100 text-emerald-700" :
    type.startsWith("ADAPTER")        ? "bg-slate-100 text-slate-600" :
                                        "bg-slate-100 text-slate-500";
  return (
    <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${group}`}>
      {type}
    </span>
  );
}

function KpiTile({ label, value, sub, icon: Icon, alert }) {
  return (
    <div className={`rounded border p-4 ${alert ? "bg-red-50 border-red-200" : "bg-slate-50"}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${alert ? "text-red-500" : "text-slate-400"}`} />
        <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-500">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${alert ? "text-red-700" : "text-slate-900"}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ integration }) {
  const openExceptions  = integration.exceptions.filter((e) => e.status === "open").length;
  const openInstructions = integration.instructions.filter((i) => ["instructed", "transmitted"].includes(i.status)).length;
  const lastSync        = integration.syncHistory[0];
  const recentEvents    = integration.events.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiTile label="Event Count"        value={integration.events.length}      sub="since session start"   icon={Activity} />
        <KpiTile label="Instructions"       value={integration.instructions.length} sub={`${openInstructions} in flight`} icon={Send} />
        <KpiTile label="Open Exceptions"    value={openExceptions}  sub="pending resolution" icon={ShieldAlert} alert={openExceptions > 0} />
        <KpiTile label="Sync Runs"          value={integration.syncHistory.length} sub={lastSync ? timeSince(lastSync.runAt) : "Never run"} icon={RefreshCw} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Adapter status */}
        <Card className="rounded-md shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Registered Adapters</CardTitle>
            <CardDescription>All channels bootstrapped at session start. Swap mock adapters for live connectors without changing downstream code.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {integration.adapters.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded border p-3">
                  {a.status === "ready"
                    ? <Wifi className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    : a.status === "error"
                    ? <WifiOff className="h-4 w-4 text-red-500 flex-shrink-0" />
                    : <Circle className="h-4 w-4 text-slate-300 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900">{a.label}</div>
                    <div className="text-xs text-slate-400 truncate">{a.description}</div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className={`text-[10px] font-semibold uppercase tracking-wide ${a.status === "ready" ? "text-emerald-600" : "text-slate-400"}`}>
                      {a.status}
                    </div>
                    <div className="text-[10px] text-slate-400">{a.channel}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent event stream */}
        <Card className="rounded-md shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Events</CardTitle>
            <CardDescription>Live feed from the integration bus (all adapters).</CardDescription>
          </CardHeader>
          <CardContent>
            {recentEvents.length === 0 ? (
              <div className="text-sm text-slate-400 italic py-6 text-center">No events yet — trigger an action</div>
            ) : (
              <div className="space-y-2">
                {recentEvents.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 text-xs">
                    <span className="text-slate-400 w-16 flex-shrink-0 tabular-nums">{timeSince(e.ts)}</span>
                    <EventTypeBadge type={e.type} />
                    <span className="text-slate-500 flex-1 truncate">{e.source}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Tab: Trade Intake ─────────────────────────────────────────────────────────

function TradeIntakeTab({ integration }) {
  const [raw, setRaw] = useState(JSON.stringify(SAMPLE_PAYLOADS.overnight, null, 2));
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadSample = (key) => setRaw(JSON.stringify(SAMPLE_PAYLOADS[key], null, 2));

  const handleIngest = () => {
    setLoading(true);
    try {
      const parsed = JSON.parse(raw);
      const res = integration.ingestTrade(parsed);
      setResult(res);
    } catch {
      setResult({ result: "rejected", errors: ["Invalid JSON — could not parse payload"] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Intake form */}
        <Card className="rounded-md shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Manual Trade Intake</CardTitle>
            <CardDescription>
              Paste or edit a raw trade payload. In production this arrives via WebSocket / FIX from the front-office system.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <span className="text-xs text-slate-500 self-center">Load sample:</span>
              <button onClick={() => loadSample("overnight")} className="text-xs border rounded px-2 py-1 hover:bg-slate-50 text-slate-600">Overnight</button>
              <button onClick={() => loadSample("oneWeek")}   className="text-xs border rounded px-2 py-1 hover:bg-slate-50 text-slate-600">1-Week</button>
              <button onClick={() => loadSample("invalid")}   className="text-xs border rounded px-2 py-1 hover:bg-red-50 text-red-600">Invalid (test)</button>
            </div>

            <textarea
              className="w-full h-64 rounded border bg-slate-950 text-emerald-300 font-mono text-xs p-3 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              spellCheck={false}
            />

            <Button
              className="w-full rounded-md bg-blue-600 hover:bg-blue-700"
              onClick={handleIngest}
              disabled={loading}
            >
              <Upload className="h-4 w-4 mr-2" />
              {loading ? "Processing…" : "Ingest Trade"}
            </Button>

            {result && (
              <div className={`rounded border p-3 text-sm ${result.result === "accepted" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                <div className={`font-semibold mb-1 ${result.result === "accepted" ? "text-emerald-700" : "text-red-700"}`}>
                  {result.result === "accepted" ? "✓ Trade accepted" : "✗ Trade rejected"}
                </div>
                {result.trade && (
                  <div className="text-xs text-emerald-700 space-y-0.5">
                    <div>ID: <span className="font-mono">{result.trade.id}</span></div>
                    <div>Counterparty: {result.trade.counterpartyId}</div>
                    <div>Amount: {fmtMoney(result.trade.amount, result.trade.currency)} @ {result.trade.rate}%</div>
                    <div>{result.trade.startDate} → {result.trade.maturityDate}</div>
                  </div>
                )}
                {result.errors?.length > 0 && (
                  <ul className="text-xs text-red-700 list-disc list-inside mt-1 space-y-0.5">
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Intake history */}
        <Card className="rounded-md shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Intake History</CardTitle>
            <CardDescription>Last 50 received trade messages with validation outcome.</CardDescription>
          </CardHeader>
          <CardContent>
            {integration.tradeIntakes.length === 0 ? (
              <div className="text-sm text-slate-400 italic py-10 text-center">No trades ingested yet</div>
            ) : (
              <div className="space-y-2">
                {integration.tradeIntakes.map((entry, i) => (
                  <div key={i} className={`rounded border p-3 text-xs ${entry.result === "accepted" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {entry.result === "accepted"
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                        : <XCircle    className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                      <span className="font-mono font-semibold text-slate-700">
                        {entry.trade?.id || entry.payload?.tradeId || "—"}
                      </span>
                      <span className="ml-auto text-slate-400">{timeSince(entry.ts)}</span>
                    </div>
                    {entry.trade && (
                      <div className="text-slate-600">
                        {entry.trade.counterpartyId} · {fmtMoney(entry.trade.amount, entry.trade.currency)} · {entry.trade.rate}%
                      </div>
                    )}
                    {entry.errors?.length > 0 && (
                      <div className="text-red-600 mt-0.5">{entry.errors.join("; ")}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Tab: Settlement Instructions ──────────────────────────────────────────────

function SettlementTab({ integration, repos, assets }) {
  const [expanded, setExpanded] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [transmitting, setTransmitting] = useState(null);
  const [genRepoId, setGenRepoId] = useState("");
  const [genAssetId, setGenAssetId] = useState("");

  const activeRepos = repos.filter((r) => r.state !== "Closed");

  const handleGenerate = () => {
    const repo  = repos.find((r) => r.id === genRepoId);
    const asset = assets.find((a) => a.id === genAssetId);
    if (!repo || !asset) return;
    setGenerating(true);
    const res = integration.generateSettlementInstruction(repo, asset);
    setGenerating(false);
    if (res.error) alert(res.error);
  };

  const handleTransmit = async (instrId, fail = false) => {
    setTransmitting(instrId);
    await integration.transmitInstruction(instrId, fail);
    setTransmitting(null);
  };

  const handleConfirm = (instrId, fail = false) => {
    integration.simulateConfirmation(instrId, fail);
  };

  const selectedRepo = repos.find((r) => r.id === genRepoId);

  return (
    <div className="space-y-6">
      {/* Generator */}
      <Card className="rounded-md shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Generate MT543 Instruction</CardTitle>
          <CardDescription>
            Select a repo and a locked asset — the adapter builds the full ISO 15022 MT543 DVP message.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 items-end">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Repo</label>
              <select
                className="w-full h-9 rounded border bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={genRepoId}
                onChange={(e) => { setGenRepoId(e.target.value); setGenAssetId(""); }}
              >
                <option value="">Select repo…</option>
                {activeRepos.map((r) => (
                  <option key={r.id} value={r.id}>{r.id} — {r.counterparty}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Asset</label>
              <select
                className="w-full h-9 rounded border bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={genAssetId}
                onChange={(e) => setGenAssetId(e.target.value)}
                disabled={!selectedRepo}
              >
                <option value="">Select asset…</option>
                {selectedRepo
                  ? assets.filter((a) => selectedRepo.assets.includes(a.id)).map((a) => (
                      <option key={a.id} value={a.id}>{a.isin} — {a.name}</option>
                    ))
                  : null}
              </select>
            </div>
            <Button
              className="rounded-md bg-blue-600 hover:bg-blue-700"
              disabled={!genRepoId || !genAssetId || generating}
              onClick={handleGenerate}
            >
              <FileCode2 className="h-4 w-4 mr-2" />
              Generate MT543
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Instructions table */}
      <Card className="rounded-md shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Settlement Instructions</CardTitle>
          <CardDescription>ISO 15022 MT543 messages — click a row to view the raw SWIFT text.</CardDescription>
        </CardHeader>
        <CardContent>
          {integration.instructions.length === 0 ? (
            <div className="text-sm text-slate-400 italic py-10 text-center">No instructions generated yet</div>
          ) : (
            <div className="rounded border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-6" />
                    <TableHead>Instruction ID</TableHead>
                    <TableHead>Repo</TableHead>
                    <TableHead>ISIN</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Settlement Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {integration.instructions.map((instr) => (
                    <>
                      <TableRow
                        key={instr.id}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => setExpanded(expanded === instr.id ? null : instr.id)}
                      >
                        <TableCell className="pr-0">
                          {expanded === instr.id
                            ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                            : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{shortId(instr.id)}</TableCell>
                        <TableCell className="font-mono text-xs">{instr.repoId}</TableCell>
                        <TableCell className="font-mono text-xs">{instr.isin}</TableCell>
                        <TableCell>{fmtMoney(instr.amount, instr.currency)}</TableCell>
                        <TableCell className="text-slate-500">{instr.settlementDate}</TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <StatusDot status={instr.status} />
                            <span className="text-xs capitalize text-slate-600">{instr.status}</span>
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1.5">
                            {instr.status === "instructed" && (
                              <>
                                <button
                                  className="text-[10px] font-medium px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                  disabled={transmitting === instr.id}
                                  onClick={() => handleTransmit(instr.id)}
                                >
                                  {transmitting === instr.id ? "…" : "Transmit"}
                                </button>
                                <button
                                  className="text-[10px] font-medium px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
                                  disabled={transmitting === instr.id}
                                  onClick={() => handleTransmit(instr.id, true)}
                                >
                                  Fail
                                </button>
                              </>
                            )}
                            {instr.status === "transmitted" && (
                              <>
                                <button
                                  className="text-[10px] font-medium px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                  onClick={() => handleConfirm(instr.id)}
                                >
                                  Confirm
                                </button>
                                <button
                                  className="text-[10px] font-medium px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
                                  onClick={() => handleConfirm(instr.id, true)}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded === instr.id && (
                        <TableRow key={`${instr.id}-expanded`}>
                          <TableCell colSpan={8} className="p-0">
                            <div className="bg-slate-950 px-4 py-3">
                              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Raw MT543</div>
                              <pre className="text-emerald-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                                {instr.rawMessage}
                              </pre>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
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

// ── Tab: Position Sync ────────────────────────────────────────────────────────

function PositionSyncTab({ integration, assets }) {
  const [syncing, setSyncing] = useState(false);
  const [lastFeed, setLastFeed] = useState(null);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      const feed = integration.syncPositions(assets);
      setLastFeed(feed);
      setSyncing(false);
    }, 800);
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card className="rounded-md shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Position Sync — Mock SaFIR Feed</CardTitle>
          <CardDescription>
            Pulls a simulated MT535 custody position feed. In production, this runs on a schedule or triggers on custodian push notification.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button className="rounded-md bg-blue-600 hover:bg-blue-700" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Run Sync"}
            </Button>
            {integration.syncHistory[0] && (
              <span className="text-sm text-slate-500">
                Last run: {timeSince(integration.syncHistory[0].runAt)} — {integration.syncHistory[0].breaks} break{integration.syncHistory[0].breaks !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* External feed preview */}
      {lastFeed && (
        <Card className="rounded-md shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">External Custody Feed — Last Run</CardTitle>
            <CardDescription>{lastFeed.length} position records received from mock SaFIR</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ISIN</TableHead>
                    <TableHead>Custody Account</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Market Value</TableHead>
                    <TableHead>Adjusted Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Settlement Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lastFeed.map((rec, i) => {
                    const isPhantom = !assets.find((a) => a.isin === rec.isin);
                    return (
                      <TableRow key={i} className={isPhantom ? "bg-amber-50" : ""}>
                        <TableCell className="font-mono text-xs">
                          {rec.isin}
                          {isPhantom && <span className="ml-2 text-[10px] bg-amber-200 text-amber-800 px-1 rounded">PHANTOM</span>}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{rec.custodyAccount}</TableCell>
                        <TableCell className="tabular-nums text-sm">{rec.quantity?.toLocaleString()}</TableCell>
                        <TableCell>{fmtMoney(rec.marketValue, rec.currency)}</TableCell>
                        <TableCell>{fmtMoney(rec.adjustedValue, rec.currency)}</TableCell>
                        <TableCell><span className="text-xs text-slate-600 capitalize">{rec.status}</span></TableCell>
                        <TableCell className="text-slate-500 text-xs">{rec.settlementDate}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync history */}
      {integration.syncHistory.length > 0 && (
        <Card className="rounded-md shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Sync History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run ID</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>External Records</TableHead>
                    <TableHead>Internal Positions</TableHead>
                    <TableHead>Matched</TableHead>
                    <TableHead>Breaks</TableHead>
                    <TableHead>Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {integration.syncHistory.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{shortId(s.id)}</TableCell>
                      <TableCell className="text-xs text-slate-500">{s.runAt?.slice(0, 19).replace("T", " ")}</TableCell>
                      <TableCell className="tabular-nums">{s.totalExternal}</TableCell>
                      <TableCell className="tabular-nums">{s.totalInternal}</TableCell>
                      <TableCell className="tabular-nums text-emerald-600 font-medium">{s.matched}</TableCell>
                      <TableCell>
                        <span className={`font-semibold tabular-nums ${s.breaks > 0 ? "text-red-600" : "text-emerald-600"}`}>
                          {s.breaks}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-500 text-xs">{s.durationMs}ms</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Tab: Reconciliation ───────────────────────────────────────────────────────

function ReconciliationTab({ integration, assets }) {
  const [running, setRunning]     = useState(false);
  const [resolveId, setResolveId] = useState(null);
  const [resolution, setResolution] = useState("");

  const handleRun = () => {
    setRunning(true);
    setTimeout(() => {
      integration.runReconciliation(assets);
      setRunning(false);
    }, 1200);
  };

  const handleResolve = (id) => {
    if (!resolution.trim()) return;
    integration.resolveException(id, resolution.trim());
    setResolveId(null);
    setResolution("");
  };

  const openExc   = integration.exceptions.filter((e) => e.status === "open");
  const resolvedExc = integration.exceptions.filter((e) => e.status === "resolved");

  return (
    <div className="space-y-6">
      {/* Run controls */}
      <Card className="rounded-md shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Run Reconciliation</CardTitle>
          <CardDescription>
            Compares internal collateral positions against the mock custody feed.
            Raises exceptions for value mismatches, phantom positions, and missing records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            <Button className="rounded-md bg-blue-600 hover:bg-blue-700" onClick={handleRun} disabled={running}>
              <Play className={`h-4 w-4 mr-2 ${running ? "animate-pulse" : ""}`} />
              {running ? "Running reconciliation…" : "Run Full Reconciliation"}
            </Button>
            <div className="text-sm text-slate-500 space-x-4">
              <span><span className="font-semibold text-red-600">{openExc.length}</span> open</span>
              <span><span className="font-semibold text-emerald-600">{resolvedExc.length}</span> resolved</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exception table */}
      {integration.exceptions.length === 0 ? (
        <Card className="rounded-md shadow-sm">
          <CardContent className="py-12 text-center text-slate-400 text-sm italic">
            No exceptions detected — run reconciliation first
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-md shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Exceptions</CardTitle>
            <CardDescription>{integration.exceptions.length} total · {openExc.length} requiring action</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>ISIN</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {integration.exceptions.map((exc) => (
                    <>
                      <TableRow key={exc.id} className={exc.status === "resolved" ? "opacity-50" : ""}>
                        <TableCell className="font-mono text-xs">{shortId(exc.id)}</TableCell>
                        <TableCell><TypePill type={exc.type} /></TableCell>
                        <TableCell><SeverityBadge severity={exc.severity} /></TableCell>
                        <TableCell className="font-mono text-xs text-slate-600">{exc.isin || "—"}</TableCell>
                        <TableCell className="text-xs text-slate-600 max-w-[300px]">{exc.description}</TableCell>
                        <TableCell className="text-xs text-slate-400">{timeSince(exc.detectedAt)}</TableCell>
                        <TableCell>
                          <span className={`text-xs font-semibold capitalize ${
                            exc.status === "open" ? "text-red-600" :
                            exc.status === "resolved" ? "text-emerald-600" : "text-slate-500"
                          }`}>{exc.status}</span>
                        </TableCell>
                        <TableCell>
                          {exc.status === "open" && (
                            <button
                              className="text-[10px] font-medium px-2 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
                              onClick={() => setResolveId(exc.id === resolveId ? null : exc.id)}
                            >
                              Resolve
                            </button>
                          )}
                          {exc.status === "resolved" && (
                            <span className="text-[10px] text-slate-400 italic">{exc.resolution}</span>
                          )}
                        </TableCell>
                      </TableRow>
                      {resolveId === exc.id && (
                        <TableRow key={`${exc.id}-resolve`}>
                          <TableCell colSpan={8} className="bg-slate-50 py-3 px-4">
                            <div className="flex gap-3 items-center">
                              <Input
                                className="flex-1 rounded h-8 text-sm"
                                placeholder="Resolution note (required)…"
                                value={resolution}
                                onChange={(e) => setResolution(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleResolve(exc.id)}
                              />
                              <Button size="sm" className="rounded bg-emerald-600 hover:bg-emerald-700 h-8"
                                onClick={() => handleResolve(exc.id)} disabled={!resolution.trim()}>
                                Confirm
                              </Button>
                              <Button size="sm" variant="outline" className="rounded h-8"
                                onClick={() => { setResolveId(null); setResolution(""); }}>
                                Cancel
                              </Button>
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
      )}
    </div>
  );
}

// ── Tab: Event Stream ─────────────────────────────────────────────────────────

const ALL_TYPES = "ALL";

function EventStreamTab({ integration }) {
  const [typeFilter, setTypeFilter]   = useState(ALL_TYPES);
  const [sourceFilter, setSourceFilter] = useState("");
  const [page, setPage]               = useState(0);
  const PAGE_SIZE = 25;

  const uniqueTypes = useMemo(() => {
    const s = new Set(integration.events.map((e) => e.type));
    return [ALL_TYPES, ...Array.from(s)];
  }, [integration.events]);

  const filtered = useMemo(() => {
    return integration.events.filter((e) => {
      if (typeFilter !== ALL_TYPES && e.type !== typeFilter) return false;
      if (sourceFilter && !e.source.toLowerCase().includes(sourceFilter.toLowerCase())) return false;
      return true;
    });
  }, [integration.events, typeFilter, sourceFilter]);

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <Card className="rounded-md shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base">Integration Event Stream</CardTitle>
              <CardDescription>{filtered.length} events · from {integration.events.length} total</CardDescription>
            </div>
            <div className="flex gap-3 items-center flex-wrap">
              <select
                className="h-8 rounded border px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
              >
                {uniqueTypes.map((t) => <option key={t} value={t}>{t === ALL_TYPES ? "All types" : t}</option>)}
              </select>
              <Input
                className="h-8 text-xs rounded w-36"
                placeholder="Filter source…"
                value={sourceFilter}
                onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {paginated.length === 0 ? (
            <div className="text-sm text-slate-400 italic py-8 text-center">No events match the current filter</div>
          ) : (
            <>
              <div className="rounded border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Payload Summary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-mono text-xs text-slate-500">{shortId(e.id)}</TableCell>
                        <TableCell><EventTypeBadge type={e.type} /></TableCell>
                        <TableCell className="text-xs text-slate-500">{e.source}</TableCell>
                        <TableCell className="text-xs text-slate-400 tabular-nums">
                          {e.ts?.slice(0, 19).replace("T", " ")}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 max-w-[320px] truncate font-mono">
                          {JSON.stringify(e.payload).slice(0, 120)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                  <span>Page {page + 1} of {totalPages}</span>
                  <div className="flex gap-2">
                    <button className="px-2 py-1 border rounded hover:bg-slate-50 disabled:opacity-40"
                      disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
                    <button className="px-2 py-1 border rounded hover:bg-slate-50 disabled:opacity-40"
                      disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview",      label: "Overview",       icon: Activity },
  { key: "intake",        label: "Trade Intake",    icon: ArrowDownToLine },
  { key: "settlement",    label: "Settlement",      icon: Send },
  { key: "sync",          label: "Position Sync",   icon: RefreshCw },
  { key: "reconciliation",label: "Reconciliation",  icon: GitCompareArrows },
  { key: "events",        label: "Event Stream",    icon: TerminalSquare },
];

export function IntegrationHub({ integration, repos, assets }) {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Integration Hub</h1>
          <p className="mt-1 text-slate-500">
            Adapter-based integration layer — trade intake, settlement instructions, position sync, and reconciliation.
            Structured for drop-in replacement of mock adapters with live Bloomberg, SaFIR, or DLT connectors.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400 border rounded px-3 py-1.5">
          <Link2 className="h-3 w-3" />
          <span>{integration.adapters.filter((a) => a.status === "ready").length} adapters online</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? "border-blue-500 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {key === "reconciliation" && integration.exceptions.filter((e) => e.status === "open").length > 0 && (
              <span className="ml-1 text-[10px] bg-red-500 text-white rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {integration.exceptions.filter((e) => e.status === "open").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview"       && <OverviewTab       integration={integration} />}
      {activeTab === "intake"         && <TradeIntakeTab    integration={integration} />}
      {activeTab === "settlement"     && <SettlementTab     integration={integration} repos={repos} assets={assets} />}
      {activeTab === "sync"           && <PositionSyncTab   integration={integration} assets={assets} />}
      {activeTab === "reconciliation" && <ReconciliationTab integration={integration} assets={assets} />}
      {activeTab === "events"         && <EventStreamTab    integration={integration} />}
    </div>
  );
}
