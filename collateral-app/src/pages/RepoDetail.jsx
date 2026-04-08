import { useState } from "react";
import { CheckCircle2, Circle, ClipboardList, Clock3, Coins, GitCompareArrows, RefreshCw, ShieldCheck, ThumbsDown, ThumbsUp, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { KpiCard } from "@/components/shared/KpiCard";
import { Info } from "@/components/shared/Info";
import { RoleBanner } from "@/components/shared/RoleBanner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { WorkflowStateBadge, WorkflowStateBar } from "@/components/shared/WorkflowState";
import { fmtMoney, adjustedValue } from "@/domain/format";
import { SubstitutionSheet } from "@/components/substitution/SubstitutionSheet";
import { IntegrationContextPanel } from "@/components/shared/IntegrationContext";

const ROLLOVER_TERMS = [
  { label: "Overnight (1d)", days: 1 },
  { label: "Tom/Next (2d)", days: 2 },
  { label: "1 Week",        days: 7 },
  { label: "2 Weeks",       days: 14 },
  { label: "1 Month",       days: 30 },
];

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center space-y-3">
      <div className="bg-slate-100 p-4">
        <Icon className="h-8 w-8 text-slate-400" />
      </div>
      <div className="font-medium text-slate-700">{title}</div>
      <div className="text-sm text-slate-500">{description}</div>
    </div>
  );
}

// Each stage: label, description keyed on repo state context
const LIFECYCLE_STAGES = [
  {
    key: "draft",
    label: "Draft",
    desc: (repo) => `Trade terms entered: ${repo.counterparty}, ${fmtMoney(repo.amount, repo.currency)} at ${repo.rate}%.`,
  },
  {
    key: "approved",
    label: "Approved",
    desc: () => "Trade approved by Treasury Manager. Counterparty credit limit verified.",
  },
  {
    key: "allocated",
    label: "Collateral Allocated",
    desc: (repo) => `${repo.assets?.length ?? 0} asset(s) locked in SaFIR. Required coverage: ${fmtMoney(repo.requiredCollateral, repo.currency)}.`,
  },
  {
    key: "instructed",
    label: "Settlement Instructed",
    desc: (repo) => `ISO 15022 MT543 generated and submitted to SaFIR/BNR for value date ${repo.startDate}.`,
  },
  {
    key: "active",
    label: "Active",
    desc: (repo) => `Repo live. Margin monitored daily. Maturing ${repo.maturityDate}.`,
  },
  {
    key: "margin",
    label: "Margin Check",
    desc: (repo) => repo.buffer < 0
      ? `Margin deficit of ${fmtMoney(Math.abs(repo.buffer), repo.currency)}. Formal margin call issued.`
      : `Coverage at ${Math.round((repo.postedCollateral / repo.requiredCollateral) * 100)}% — within threshold.`,
    alert: (repo) => repo.buffer < 0,
  },
  {
    key: "maturing",
    label: "Unwind / Close",
    desc: (repo) => repo.state === "Closed"
      ? `Repo closed ${repo.maturityDate}. Collateral released to inventory.`
      : `Unwind pending. Confirm rollover or close with ${repo.counterparty}.`,
  },
];

function stageIndex(repo) {
  if (repo.state === "Closed") return 6;
  if (repo.state === "Maturing") return 5;
  if (repo.state === "Margin deficit") return 5;
  return 4; // Active
}

function LifecycleTimeline({ repo }) {
  const currentIdx = stageIndex(repo);
  return (
    <div className="space-y-0">
      {LIFECYCLE_STAGES.map((stage, i) => {
        const isActive = i === currentIdx;
        const isPast = i < currentIdx;
        const isAlert = stage.alert?.(repo);
        return (
          <div key={stage.key} className="flex gap-4">
            {/* Spine */}
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 flex items-center justify-center border-2 flex-shrink-0 ${
                isAlert && isActive ? "border-red-500 bg-red-50" :
                isActive ? "border-slate-900 bg-slate-900" :
                isPast   ? "border-emerald-500 bg-emerald-500" :
                           "border-slate-200 bg-white"
              }`}>
                {isPast
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                  : isActive
                  ? <div className={`w-2 h-2 rounded-full ${isAlert ? "bg-red-500" : "bg-white"}`} />
                  : <Circle className="h-3.5 w-3.5 text-slate-300" />}
              </div>
              {i < LIFECYCLE_STAGES.length - 1 && (
                <div className={`w-px flex-1 my-1 ${isPast ? "bg-emerald-300" : "bg-slate-200"}`} style={{ minHeight: 24 }} />
              )}
            </div>
            {/* Content */}
            <div className="pb-4 flex-1 min-w-0">
              <div className={`text-sm font-semibold leading-7 ${
                isAlert && isActive ? "text-red-700" :
                isActive ? "text-slate-900" :
                isPast   ? "text-slate-600" :
                           "text-slate-400"
              }`}>
                {stage.label}
              </div>
              {(isActive || isPast) && (
                <div className={`text-xs mt-0.5 leading-relaxed ${isAlert && isActive ? "text-red-600" : "text-slate-400"}`}>
                  {stage.desc(repo)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RepoDetail({ repo, assets, closeRepo, topUpRepo, substituteCollateral, proposeSubstitution, rolloverRepo, role, permissions, pendingSubstitutions = [], onApproveSubstitution, onRejectSubstitution }) {
  const [subSheetOpen, setSubSheetOpen] = useState(false);
  const [rollSheetOpen, setRollSheetOpen] = useState(false);
  const [rollRate, setRollRate] = useState("");
  const [rollTermIdx, setRollTermIdx] = useState(0);
  const [rollPreviewBaseTs] = useState(() => Date.now());

  if (!repo) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No repo selected"
        description="Select a repo from the book to view details"
      />
    );
  }

  const basket = assets.filter((a) => repo.assets.includes(a.id));
  const availableAsset = assets.find((a) => a.status === "Available" && a.eligibility.includes("Eligible"));

  const canClose     = permissions?.canCloseRepo     ?? role === "Treasury Manager";
  const canRollover  = permissions?.canRolloverRepo  ?? role === "Treasury Manager";
  const canTopUp     = permissions?.canApproveTopUp  ?? role === "Collateral Manager";
  const canSubstitute= permissions?.canSubstitute    ?? (role === "Collateral Manager" || role === "Treasury Manager");
  const canApprove   = role === "Treasury Manager";

  // Pending substitutions for this repo
  const repoPending = pendingSubstitutions.filter((s) => s.repoId === repo.id);

  // Interest accrual
  const elapsed = Math.max(0, Math.ceil((new Date() - new Date(repo.startDate)) / 86400000));
  const accruedInterest = Math.round(repo.amount * (repo.rate / 100) * (elapsed / 360));
  const coverage = Math.round((repo.postedCollateral / repo.requiredCollateral) * 100);

  return (
    <div className="space-y-6">
      <RoleBanner role={role} perms={permissions} />
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Repo Lifecycle — {repo.id}</h1>
          <p className="mt-1 text-slate-500">{repo.counterparty} · {fmtMoney(repo.amount, repo.currency)} · {repo.startDate} → {repo.maturityDate}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {repo.state !== "Closed" && canRollover && (
            <Button variant="outline" className="rounded-md" onClick={() => { setRollRate(String(repo.rate)); setRollSheetOpen(true); }}>
              <RefreshCw className="h-4 w-4 mr-2" /> Roll Repo
            </Button>
          )}
          {repo.state !== "Closed" && canTopUp && (
            <Button variant="outline" className="rounded-md"
              onClick={() => availableAsset && topUpRepo(repo.id, availableAsset.id)}>
              Request Top-Up
            </Button>
          )}
          {repo.state !== "Closed" && canSubstitute && (
            <Button variant="outline" className="rounded-md" onClick={() => setSubSheetOpen(true)}>
              <GitCompareArrows className="h-4 w-4 mr-2" /> Substitute Collateral
            </Button>
          )}
          {repo.state !== "Closed" && canClose && (
            <Button className="rounded-md" onClick={() => closeRepo(repo.id)}>
              Prepare Unwind / Close
            </Button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="Cash Amount" value={fmtMoney(repo.amount, repo.currency)} description={repo.counterparty} icon={Coins} />
        <KpiCard title="Repo Rate" value={`${repo.rate}%`} description={`Trade date ${repo.startDate}`} icon={ShieldCheck} />
        <KpiCard title="Accrued Interest" value={fmtMoney(accruedInterest, repo.currency)}
          description={`${elapsed}d elapsed · ${repo.rate}% / 360`} icon={TrendingUp} />
        <KpiCard title="Coverage" value={`${coverage}%`}
          description={repo.buffer < 0 ? `Deficit ${fmtMoney(Math.abs(repo.buffer), repo.currency)}` : `Buffer ${fmtMoney(repo.buffer, repo.currency)}`}
          icon={ClipboardList} alert={repo.buffer < 0} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Lifecycle */}
        <Card className="xl:col-span-2 rounded-md shadow-sm">
          <CardHeader>
            <CardTitle>Lifecycle Timeline</CardTitle>
            <CardDescription>Full workflow history from booking to unwind — each step linked to SaFIR events and audit trail.</CardDescription>
          </CardHeader>
          <CardContent>
            <LifecycleTimeline repo={repo} />
          </CardContent>
        </Card>

        {/* Settlement */}
        <Card className="rounded-md shadow-sm">
          <CardHeader>
            <CardTitle>Settlement Status</CardTitle>
            <CardDescription>Instruction lifecycle, custody confirmation, and integration state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Info label="Instruction" value="MT543 Generated" />
            <Info label="Transmission" value="Submitted to SaFIR/BNR" />
            <Info label="Confirmation" value={repo.settlement} />
            <Info label="Exception State" value={repo.settlement === "Awaiting confirmation" ? "Pending — escalate if Day 2" : "None"} />
            <Separator />
            <Info label="Maturity" value={repo.maturityDate} />
            <Info label="Days Remaining" value={`${Math.max(0, Math.ceil((new Date(repo.maturityDate) - new Date()) / 86400000))}d`} />
            {repo.integration && (
              <>
                <Separator />
                <IntegrationContextPanel integration={repo.integration} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Collateral basket + Margin */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 rounded-md shadow-sm">
          <CardHeader>
            <CardTitle>Collateral Basket</CardTitle>
            <CardDescription>Assets currently locked in custody to support this transaction.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {basket.length === 0 ? (
              <div className="text-sm text-slate-400 italic">No assets allocated.</div>
            ) : basket.map((a) => (
              <div key={a.id} className="rounded border p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-slate-900">{a.name}</div>
                  <div className="text-xs text-slate-400 font-mono">{a.isin} · {a.custody}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-slate-900">{fmtMoney(adjustedValue(a), a.currency)}</div>
                  <div className="text-xs text-slate-400">{a.haircut}% haircut · {fmtMoney(a.marketValue, a.currency)} gross</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-md shadow-sm">
          <CardHeader>
            <CardTitle>Margin Status</CardTitle>
            <CardDescription>Live coverage and exposure metrics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Info label="Notional" value={fmtMoney(repo.amount, repo.currency)} />
            <Info label="Required (103%)" value={fmtMoney(repo.requiredCollateral, repo.currency)} />
            <Info label="Posted" value={fmtMoney(repo.postedCollateral, repo.currency)} />
            <Separator />
            <div>
              <div className="text-xs text-slate-500 mb-1">Coverage ratio</div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                  <div className={`h-2 rounded ${repo.buffer < 0 ? "bg-red-500" : coverage < 103 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(coverage / 1.3, 100)}%` }} />
                </div>
                <span className={`text-xs font-bold ${repo.buffer < 0 ? "text-red-600" : "text-emerald-600"}`}>{coverage}%</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">{repo.buffer < 0 ? "Deficit" : "Buffer"}</div>
              <div className={`font-bold text-lg ${repo.buffer < 0 ? "text-red-700" : "text-emerald-700"}`}>
                {fmtMoney(repo.buffer, repo.currency)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      <Card className="rounded-md shadow-sm">
        <CardHeader>
          <CardTitle>Activity Notes</CardTitle>
          <CardDescription>{repo.notes}</CardDescription>
        </CardHeader>
      </Card>

      {/* Pending substitutions */}
      {repoPending.length > 0 && (
        <Card className="rounded-md shadow-sm border-violet-200">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <GitCompareArrows className="h-4 w-4 text-violet-500" />
                  Pending Substitutions
                </CardTitle>
                <CardDescription>
                  {repoPending.length} substitution proposal{repoPending.length > 1 ? "s" : ""} awaiting approval.
                </CardDescription>
              </div>
              <WorkflowStateBadge state="proposed" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {repoPending.map((sub) => (
              <div key={sub.id} className="rounded border border-violet-100 bg-violet-50 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900 text-sm">
                      Remove <span className="font-mono">{sub.outAssetId}</span> → Add <span className="font-mono">{sub.inAssetId}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Proposed by {sub.proposedBy} · {sub.proposedAt}
                    </div>
                  </div>
                  <WorkflowStateBadge state="proposed" size="xs" />
                </div>
                <WorkflowStateBar
                  state="proposed"
                  detectedAt={sub.proposedAt}
                  updatedAt={sub.proposedAt}
                  compact
                />
                {canApprove && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      className="rounded text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
                      onClick={() => {}}
                    >
                      <ThumbsUp className="h-3 w-3" /> Approve & Execute
                    </Button>
                    <Button size="sm" variant="outline" className="rounded text-xs flex items-center gap-1.5" onClick={() => {}}>
                      <ThumbsDown className="h-3 w-3" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Rollover Sheet */}
      <Sheet open={rollSheetOpen} onOpenChange={setRollSheetOpen}>
        <SheetContent className="w-[480px] sm:w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Roll Repo — {repo.id}</SheetTitle>
            <SheetDescription>
              Close the current position and book a new repo with the same counterparty and collateral basket under revised terms.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-5 text-sm">
            <div className="rounded border bg-slate-50 p-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Current Terms</div>
              <Info label="Counterparty"   value={repo.counterparty} />
              <Info label="Notional"       value={fmtMoney(repo.amount, repo.currency)} />
              <Info label="Current Rate"   value={`${repo.rate}%`} />
              <Info label="Matures"        value={repo.maturityDate} />
            </div>
            <Separator />
            <div className="space-y-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">New Terms</div>
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wide mb-1.5 block">New Repo Rate (%)</label>
                <Input value={rollRate} onChange={(e) => setRollRate(e.target.value)} className="rounded-md" placeholder={String(repo.rate)} />
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wide mb-1.5 block">New Term</label>
                <Select value={String(rollTermIdx)} onValueChange={(v) => setRollTermIdx(Number(v))}>
                  <SelectTrigger className="rounded-md"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLLOVER_TERMS.map((t, i) => (
                      <SelectItem key={i} value={String(i)}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {rollRate && (
                <div className="rounded border bg-blue-50 border-blue-200 p-3 space-y-2 text-xs">
                  <div className="font-semibold text-blue-700">Rollover Preview</div>
                  <Info label="New Rate"    value={`${rollRate}%`} />
                  <Info label="Term"        value={ROLLOVER_TERMS[rollTermIdx].label} />
                  <Info label="Interest"    value={fmtMoney(Math.round(repo.amount * (Number(rollRate) / 100) * (ROLLOVER_TERMS[rollTermIdx].days / 360)), repo.currency)} />
                  <Info label="New Maturity" value={new Date(rollPreviewBaseTs + ROLLOVER_TERMS[rollTermIdx].days * 86400000).toISOString().slice(0,10)} />
                </div>
              )}
            </div>
            <Button
              className="w-full rounded-md bg-blue-600 hover:bg-blue-700"
              disabled={!rollRate || isNaN(Number(rollRate)) || Number(rollRate) <= 0}
              onClick={() => {
                rolloverRepo(repo.id, Number(rollRate), ROLLOVER_TERMS[rollTermIdx].days);
                setRollSheetOpen(false);
              }}
            >
              Confirm Rollover
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* New workflow-based Substitution Sheet */}
      <SubstitutionSheet
        open={subSheetOpen}
        onClose={() => setSubSheetOpen(false)}
        repo={repo}
        assets={assets}
        canExecute={canApprove}
        onSubstituted={(result) => {
          // Legacy prop bridge: update App state via substituteCollateral
          substituteCollateral(repo.id, result.releasedAsset.id, result.allocatedAsset.id);
        }}
        onProposed={(repoId, outId, inId) => {
          proposeSubstitution(repoId, outId, inId);
        }}
      />

      {/* LEGACY SHEET KEPT FOR REFERENCE — replaced by SubstitutionSheet above */}
      <Sheet open={false} onOpenChange={() => {}}>
        <SheetContent className="w-[600px] sm:w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Substitute Collateral — {repo.id}</SheetTitle>
            <SheetDescription>
              {canApprove
                ? "As Treasury Manager you can approve directly. Substitutions proposed by Collateral Managers appear as pending below."
                : "Propose a replacement asset. The substitution will be staged for Treasury Manager approval (4-eye)."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            <div>
              <h3 className="font-semibold text-slate-900 mb-3 text-sm">Current Basket</h3>
              <div className="space-y-2">
                {basket.map((a) => (
                  <div key={a.id} className="rounded border p-3 bg-slate-50">
                    <div className="font-medium text-sm">{a.name}</div>
                    <div className="text-xs text-slate-400">{a.isin} · {fmtMoney(adjustedValue(a), a.currency)} after haircut</div>
                  </div>
                ))}
              </div>
            </div>
            <Separator />
            <div>
              <h3 className="font-semibold text-slate-900 mb-3 text-sm">Available Substitutes</h3>
              {basket.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No eligible substitutes currently available.</p>
              ) : (
                <div className="space-y-3">
                  {basket.map((sub) => (
                    <div key={sub.id} className="rounded border bg-white p-4">
                      <div className="font-medium text-sm mb-1">{sub.name}</div>
                      <div className="text-xs text-slate-400 mb-3">{sub.isin} · {fmtMoney(adjustedValue(sub), sub.currency)} adjusted</div>
                      <div className="space-y-1.5">
                        {basket.map((cur) => (
                          <Button key={cur.id} variant="outline" size="sm" className="rounded w-full text-left justify-start text-xs"
                            onClick={() => {
                              if (canApprove) {
                                substituteCollateral(repo.id, cur.id, sub.id);
                              } else {
                                proposeSubstitution(repo.id, cur.id, sub.id);
                              }
                              setSubSheetOpen(false);
                            }}>
                            {canApprove ? "Replace" : "Propose replacing"} {cur.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending substitutions for this repo */}
            {repoPending.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3 text-sm flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
                    Pending Approval ({repoPending.length})
                  </h3>
                  <div className="space-y-3">
                    {repoPending.map((sub) => {
                      const oldA = assets.find((a) => a.id === sub.oldAssetId);
                      const newA = assets.find((a) => a.id === sub.newAssetId);
                      return (
                        <div key={sub.id} className="rounded border border-amber-200 bg-amber-50 p-4">
                          <div className="text-xs text-amber-700 mb-2">
                            Proposed by <span className="font-semibold">{sub.proposedBy}</span> at {sub.proposedAt}
                          </div>
                          <div className="text-sm mb-3">
                            <span className="font-medium text-slate-700">{oldA?.name ?? sub.oldAssetId}</span>
                            <span className="text-slate-400 mx-2">→</span>
                            <span className="font-medium text-slate-700">{newA?.name ?? sub.newAssetId}</span>
                          </div>
                          {canApprove && (
                            <div className="flex gap-2">
                              <Button size="sm" className="rounded bg-emerald-600 hover:bg-emerald-700 text-xs flex items-center gap-1.5"
                                onClick={() => { onApproveSubstitution(sub.id); setSubSheetOpen(false); }}>
                                <ThumbsUp className="h-3.5 w-3.5" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" className="rounded text-xs text-red-600 border-red-200 hover:bg-red-50 flex items-center gap-1.5"
                                onClick={() => { onRejectSubstitution(sub.id); setSubSheetOpen(false); }}>
                                <ThumbsDown className="h-3.5 w-3.5" /> Reject
                              </Button>
                            </div>
                          )}
                          {!canApprove && (
                            <div className="text-xs text-amber-600 italic">Awaiting Treasury Manager approval</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
