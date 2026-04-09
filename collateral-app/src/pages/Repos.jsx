import { useMemo, useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Filter, Search, Star } from "lucide-react";
import { AllocationRecommendation } from "@/components/allocation/AllocationRecommendation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info } from "@/components/shared/Info";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { fmtMoney, adjustedValue } from "@/domain/format";
import { COUNTERPARTY_PROFILES } from "@/domain/counterparties";
import { RoleBanner } from "@/components/shared/RoleBanner";
import { useAllocationResult } from "@/domain/store";
import { useAllocationWorkflow } from "@/workflows/hooks/useWorkflows";

const TERM_OPTIONS = [
  { label: "Overnight (1d)", days: 1 },
  { label: "Tom/Next (2d)", days: 2 },
  { label: "1 Week",         days: 7 },
  { label: "2 Weeks",        days: 14 },
  { label: "1 Month",        days: 30 },
  { label: "3 Months",       days: 91 },
];

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysToMaturity(maturityDate) {
  return Math.max(0, Math.ceil((new Date(maturityDate) - new Date()) / 86400000));
}

function interestAccrual(amount, rate, days) {
  return Math.round(amount * (rate / 100) * (days / 360));
}

const STEPS = [
  { n: 1, label: "Trade terms" },
  { n: 2, label: "Eligibility check" },
  { n: 3, label: "Basket selection" },
  { n: 4, label: "Approve & confirm" },
];

export function Repos({ repos, assets, openRepo, createDemoRepo, role, permissions }) {
  const counterpartyNames = Object.keys(COUNTERPARTY_PROFILES);

  const [counterparty, setCounterparty] = useState(counterpartyNames[0] ?? "");
  const [termIdx, setTermIdx] = useState(0);
  const [currency, setCurrency] = useState("RON");
  const [amount, setAmount] = useState("10000000");
  const [rate, setRate] = useState("5.20");
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});

  // ── Allocation agent state ──────────────────────────────────────────────────
  const { result: agentResult, pending: agentLoading } = useAllocationResult("DRAFT");
  const [agentApproved, setAgentApproved] = useState(false);
  const { runAllocation: runAllocationWorkflow, approveAllocation: approveAllocationWorkflow, clearAllocation } = useAllocationWorkflow();

  // Repo book filters
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");

  const term = TERM_OPTIONS[termIdx];
  const maturityDate = addDays(term.days);
  const amtNum = Number(amount) || 0;
  const rateNum = Number(rate) || 0;
  const interest = interestAccrual(amtNum, rateNum, term.days);

  // Counterparty credit check
  const cpProfile = COUNTERPARTY_PROFILES[counterparty];
  const cpCurrentExposure = useMemo(() => {
    return repos
      .filter((r) => r.counterparty === counterparty && r.state !== "Closed")
      .reduce((s, r) => s + r.amount, 0);
  }, [repos, counterparty]);
  const cpLimit = cpProfile?.creditLimit ?? 20_000_000;
  const cpHeadroom = cpLimit - cpCurrentExposure;
  const cpFit = amtNum <= cpHeadroom;

  // Collateral basket — sorted by haircut asc (cheapest to deliver first)
  const proposedBasket = useMemo(() => {
    const required = amtNum * 1.03;
    const eligible = assets
      .filter((a) => a.status === "Available" && a.eligibility.includes("Eligible"))
      .sort((a, b) => a.haircut - b.haircut); // CTD: lowest haircut first
    let running = 0;
    const picked = [];
    for (const a of eligible) {
      if (running >= required) break;
      picked.push(a);
      running += adjustedValue(a);
    }
    return { required, picked, adjusted: running };
  }, [amtNum, assets]);

  // ── Run agent when entering step 3 ─────────────────────────────────────────
  useEffect(() => {
    if (step !== 3) return;
    setAgentApproved(false);
    clearAllocation("DRAFT");
    const syntheticRepo = {
      id: "DRAFT",
      counterparty,
      amount: amtNum,
      currency,
      rate: rateNum,
      startDate: new Date().toISOString().slice(0, 10),
      maturityDate,
    };
    runAllocationWorkflow({ repo: syntheticRepo, assets, key: "DRAFT" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Derive agent basket (maps agent output → proposedBasket shape) ──────────
  const agentBasket = useMemo(() => {
    if (!agentResult?.feasible || !agentApproved) return null;
    const picked = agentResult.selected
      .map((e) => assets.find((a) => a.id === e.position.id))
      .filter(Boolean);
    return {
      required: agentResult.requiredCollateral,
      picked,
      adjusted: agentResult.postedCollateral,
    };
  }, [agentResult, agentApproved, assets]);

  // Active basket: agent-approved basket takes precedence over CTD heuristic
  const activeBasket = agentBasket ?? proposedBasket;

  // Repo book data
  const filteredRepos = useMemo(() => {
    return repos.filter((r) => {
      const text = [r.id, r.counterparty].join(" ").toLowerCase();
      const matchText = text.includes(search.toLowerCase());
      const matchState = stateFilter === "all" || r.state === stateFilter;
      return matchText && matchState;
    });
  }, [repos, search, stateFilter]);

  const validate = () => {
    const errs = {};
    if (!counterparty) errs.counterparty = "Select a counterparty.";
    if (!amtNum || amtNum <= 0) errs.amount = "Amount must be positive.";
    if (!rateNum || rateNum <= 0 || rateNum > 20) errs.rate = "Rate must be 0–20%.";
    if (amtNum > cpHeadroom) errs.amount = `Exceeds credit headroom (${fmtMoney(cpHeadroom)} available).`;
    return errs;
  };

  const handleNext = () => {
    if (step === 1) {
      const errs = validate();
      if (Object.keys(errs).length) { setErrors(errs); return; }
      setErrors({});
    }
    setStep((s) => Math.min(4, s + 1));
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[linear-gradient(135deg,#f8fbff_0%,#eef6ff_42%,#f8fafc_100%)] px-6 py-6 shadow-sm">
        <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-blue-200/35 blur-3xl" />
        <div className="absolute bottom-0 left-12 h-28 w-28 rounded-full bg-emerald-100/60 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-blue-700 shadow-sm">
              <Star className="h-3.5 w-3.5" />
              Secured funding workflow
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">Repo Transactions</h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              Create, allocate, approve, and track secured funding flows from trade terms through collateral basket selection and booking.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/80 bg-white/75 px-4 py-3 shadow-sm">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-medium">Open repos</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{repos.filter((r) => r.state !== "Closed").length}</div>
              <div className="mt-1 text-xs text-slate-500">Current active funding lines</div>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/75 px-4 py-3 shadow-sm">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-medium">Available assets</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{assets.filter((a) => a.status === "Available").length}</div>
              <div className="mt-1 text-xs text-slate-500">Eligible inventory for allocation</div>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/75 px-4 py-3 shadow-sm">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-medium">Counterparties</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{counterpartyNames.length}</div>
              <div className="mt-1 text-xs text-slate-500">Profiles with limits and criteria</div>
            </div>
          </div>
        </div>
      </div>
      <RoleBanner role={role} perms={permissions} />

      <Tabs defaultValue="book" className="space-y-4">
        <TabsList className="rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <TabsTrigger value="book">New Repo</TabsTrigger>
          <TabsTrigger value="list">Repo Book</TabsTrigger>
        </TabsList>

        {/* ── CREATE REPO ─────────────────────────────────────────── */}
        <TabsContent value="book">
          <Card className="rounded-[1.5rem] border-slate-200 shadow-sm">
            <CardHeader className="pb-5">
              <CardTitle>Create Repo Transaction</CardTitle>
              <CardDescription>Multi-step workflow: trade terms → eligibility → collateral basket → approval.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Step indicator — institutional horizontal bar */}
              <div className="rounded-[1.25rem] border border-slate-100 bg-slate-50/70 px-4 py-4">
              <div className="flex items-center gap-0">
                {STEPS.map((s, i) => {
                  const active = s.n === step;
                  const past = s.n < step;
                  const isLast = i === STEPS.length - 1;
                  return (
                    <div key={s.n} className="flex items-center flex-1 min-w-0">
                      <div className="flex flex-col items-center flex-1">
                        <div className={`w-7 h-7 flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                          active ? "border-slate-900 bg-slate-900 text-white" :
                          past   ? "border-emerald-500 bg-emerald-500 text-white" :
                                   "border-slate-200 bg-white text-slate-400"
                        }`}>
                          {past ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.n}
                        </div>
                        <div className={`text-[10px] mt-1 font-medium ${active ? "text-slate-900" : past ? "text-emerald-600" : "text-slate-400"}`}>
                          {s.label}
                        </div>
                      </div>
                      {!isLast && (
                        <div className={`h-px flex-1 mb-4 ${past ? "bg-emerald-400" : "bg-slate-200"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
              </div>

              {/* Step 1 — Trade Terms */}
              {step === 1 && (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Counterparty dropdown */}
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5 block">Counterparty</label>
                      <Select value={counterparty} onValueChange={(v) => { setCounterparty(v); setErrors((p) => ({ ...p, counterparty: undefined })); }}>
                        <SelectTrigger className="rounded-md">
                          <SelectValue placeholder="Select counterparty" />
                        </SelectTrigger>
                        <SelectContent>
                          {counterpartyNames.map((n) => (
                            <SelectItem key={n} value={n}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.counterparty && <p className="text-xs text-red-600 mt-1">{errors.counterparty}</p>}
                    </div>

                    {/* Term */}
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5 block">Term</label>
                      <Select value={String(termIdx)} onValueChange={(v) => setTermIdx(Number(v))}>
                        <SelectTrigger className="rounded-md">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TERM_OPTIONS.map((t, i) => (
                            <SelectItem key={i} value={String(i)}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Currency */}
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5 block">Currency</label>
                      <Input value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-md" />
                    </div>

                    {/* Cash Amount */}
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5 block">Cash Amount</label>
                      <Input
                        value={amount}
                        onChange={(e) => { setAmount(e.target.value); setErrors((p) => ({ ...p, amount: undefined })); }}
                        className={`rounded-md ${errors.amount ? "border-red-400" : ""}`}
                      />
                      {errors.amount && <p className="text-xs text-red-600 mt-1">{errors.amount}</p>}
                    </div>

                    {/* Repo Rate */}
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5 block">Repo Rate (%)</label>
                      <Input
                        value={rate}
                        onChange={(e) => { setRate(e.target.value); setErrors((p) => ({ ...p, rate: undefined })); }}
                        className={`rounded-md ${errors.rate ? "border-red-400" : ""}`}
                      />
                      {errors.rate && <p className="text-xs text-red-600 mt-1">{errors.rate}</p>}
                    </div>

                    {/* Maturity Date (auto) */}
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5 block">Maturity Date</label>
                      <Input value={maturityDate} disabled className="rounded-md bg-slate-50 text-slate-500" />
                    </div>
                  </div>

                  {/* Credit limit check + Interest preview */}
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className={`rounded border p-3 ${cpFit ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Credit Headroom</div>
                      <div className={`font-semibold text-sm ${cpFit ? "text-emerald-700" : "text-red-700"}`}>
                        {fmtMoney(cpHeadroom, currency)}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Limit {fmtMoney(cpLimit, currency)} · Used {fmtMoney(cpCurrentExposure, currency)}
                      </div>
                      {!cpFit && (
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-red-600 font-medium">
                          <AlertTriangle className="h-3 w-3" /> Exceeds available headroom
                        </div>
                      )}
                    </div>
                    <div className="rounded border bg-slate-50 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Interest at Maturity</div>
                      <div className="font-semibold text-sm text-slate-800">{fmtMoney(interest, currency)}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{term.days}d × {rateNum}% / 360</div>
                    </div>
                    <div className="rounded border bg-slate-50 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Agreement</div>
                      <div className="font-semibold text-sm text-slate-800">{cpProfile?.agreementType ?? "GMRA"}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{cpProfile?.settlementSystem ?? "SaFIR"} · {cpProfile?.marginCallFrequency ?? "Daily"} margin calls</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2 — Eligibility Check */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded border bg-slate-50 p-4">
                      <div className="text-xs text-slate-500 mb-1">Minimum Required Collateral</div>
                      <div className="text-lg font-semibold">{fmtMoney(proposedBasket.required, currency)}</div>
                      <div className="text-xs text-slate-400 mt-1">103% coverage ratio</div>
                    </div>
                    <div className="rounded border bg-slate-50 p-4">
                      <div className="text-xs text-slate-500 mb-1">Eligible Assets Available</div>
                      <div className="text-lg font-semibold">{proposedBasket.picked.length}</div>
                      <div className="text-xs text-slate-400 mt-1">Government bonds, T-Bills</div>
                    </div>
                    <div className="rounded border bg-slate-50 p-4">
                      <div className="text-xs text-slate-500 mb-1">Settlement System</div>
                      <div className="text-lg font-semibold">{cpProfile?.settlementSystem ?? "SaFIR"}</div>
                      <div className="text-xs text-slate-400 mt-1">Custody constraint applied</div>
                    </div>
                  </div>
                  <div className="rounded border bg-slate-50 p-4 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Counterparty Acceptance Criteria — {counterparty}</div>
                    <div className="grid gap-2 md:grid-cols-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">Eligible types</span><span className="font-medium">{(cpProfile?.eligibleTypes ?? []).join(", ")}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Min rating</span><span className="font-medium">{cpProfile?.minRating ?? "BBB"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Max haircut</span><span className="font-medium">{cpProfile?.maxHaircut ?? 10}%</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Concentration limit</span><span className="font-medium">{Math.round((cpProfile?.concentrationLimit ?? 0.35) * 100)}% per ISIN</span></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3 — Basket Selection */}
              {step === 3 && (
                <div className="space-y-4">
                  {/* ── Agent recommendation panel ─────────────────────────────── */}
                  <AllocationRecommendation
                    result={agentResult}
                    loading={agentLoading}
                    onApprove={() => setAgentApproved(true)}
                    onReject={() => setAgentApproved(false)}
                  />

                  {/* ── Manual / CTD basket (shown when agent dismissed or loading) */}
                  {(!agentLoading && (!agentResult || !agentApproved)) && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-700">
                          {agentResult ? "Manual Selection — CTD Heuristic" : "Collateral Basket"}
                        </div>
                        <div className="text-xs text-slate-400">Sorted by cheapest-to-deliver (lowest haircut first)</div>
                      </div>
                      {proposedBasket.picked.length === 0 ? (
                        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                          No eligible collateral available. Add Available positions to inventory.
                        </div>
                      ) : proposedBasket.picked.map((a, idx) => (
                        <div key={a.id} className="rounded border bg-white p-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            {idx === 0 && (
                              <div title="Cheapest to Deliver" className="flex-shrink-0">
                                <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                              </div>
                            )}
                            <div>
                              <div className="font-medium text-slate-900">{a.name}</div>
                              <div className="text-xs text-slate-400 font-mono">{a.isin} · {a.custody}</div>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="font-semibold text-slate-900">{fmtMoney(adjustedValue(a), a.currency)}</div>
                            <div className="text-xs text-slate-400">{a.haircut}% haircut applied</div>
                          </div>
                        </div>
                      ))}
                      <div className="rounded border p-4 bg-slate-50">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">Total allocated vs required</span>
                          <span className="font-semibold text-slate-900">
                            {fmtMoney(proposedBasket.adjusted, currency)}&nbsp;/&nbsp;{fmtMoney(proposedBasket.required, currency)}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-200 rounded overflow-hidden">
                            <div className="h-1.5 bg-emerald-500 rounded"
                              style={{ width: `${Math.min((proposedBasket.adjusted / proposedBasket.required) * 100, 100)}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-emerald-600">
                            {Math.round((proposedBasket.adjusted / proposedBasket.required) * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Approved basket confirmation strip ─────────────────────── */}
                  {agentApproved && agentBasket && (
                    <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-2 text-sm text-emerald-700">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                      <span>
                        Agent recommendation approved — {agentBasket.picked.length} asset{agentBasket.picked.length !== 1 ? "s" : ""} selected.
                        Proceed to review and book.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Step 4 — Approval */}
              {step === 4 && (
                <div className="space-y-4">
                  <div className="rounded border bg-slate-50 p-5 grid gap-4 md:grid-cols-2">
                    <Info label="Counterparty" value={counterparty} />
                    <Info label="Agreement" value={cpProfile?.agreementType ?? "GMRA"} />
                    <Info label="Cash Amount" value={fmtMoney(amtNum, currency)} />
                    <Info label="Repo Rate" value={`${rate}%`} />
                    <Info label="Term" value={term.label} />
                    <Info label="Maturity Date" value={maturityDate} />
                    <Info label="Interest at Maturity" value={fmtMoney(interest, currency)} />
                    <Info label="Coverage Required" value={fmtMoney(activeBasket.required, currency)} />
                    <Info label="Coverage Allocated" value={fmtMoney(activeBasket.adjusted, currency)} />
                    <Info label="Basket Source" value={agentApproved ? "Agent Recommendation" : "CTD Heuristic"} />
                    <Info label="Settlement System" value={cpProfile?.settlementSystem ?? "SaFIR"} />
                  </div>
                  <div className={`flex items-center gap-2 rounded border px-4 py-3 text-sm ${cpFit ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {cpFit
                      ? <><CheckCircle2 className="h-4 w-4" /> Credit limit check passed — {fmtMoney(cpHeadroom - amtNum, currency)} headroom remaining after this trade. Basket: {agentApproved ? "agent-recommended" : "CTD heuristic"}.</>
                      : <><AlertTriangle className="h-4 w-4" /> Warning: this trade exceeds counterparty credit limit.</>}
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between pt-2 border-t">
                <Button variant="outline" className="rounded-md" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>
                  Back
                </Button>
                {step < 4 ? (
                  <Button className="rounded-md" onClick={handleNext}>
                    Continue <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button
                    className="rounded-md bg-emerald-600 hover:bg-emerald-700"
                    disabled={!cpFit || permissions?.readOnly || permissions?.canCreateRepo === false}
                    title={permissions?.canCreateRepo === false ? "Your role cannot book repos" : undefined}
                    onClick={async () => {
                      if (agentApproved && agentResult) {
                        await approveAllocationWorkflow({ repoId: "DRAFT", result: agentResult, key: "DRAFT" });
                      }
                      createDemoRepo({ counterparty, amount: amtNum, currency, rate: rateNum, proposedBasket: activeBasket });
                    }}
                  >
                    Approve & Book Repo
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── REPO BOOK ──────────────────────────────────────────────── */}
        <TabsContent value="list">
          <Card className="rounded-[1.5rem] border-slate-200 shadow-sm">
            <CardContent className="border-b p-4 flex gap-3 flex-col md:flex-row md:items-center">
              <div className="relative flex-1 max-w-sm">
                <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search repo ID or counterparty…" className="pl-9 rounded-xl" />
              </div>
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger className="w-[180px] rounded-xl">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="All states" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All states</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Maturing">Maturing</SelectItem>
                  <SelectItem value="Margin deficit">Margin deficit</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-slate-400 ml-auto">{filteredRepos.length} of {repos.length} repos</div>
            </CardContent>
            <CardContent className="p-0">
              <div className="overflow-hidden rounded-b-[1.5rem]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Repo ID</TableHead>
                    <TableHead>Counterparty</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>Maturity</TableHead>
                    <TableHead>Days Left</TableHead>
                    <TableHead>Accrued Interest</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Settlement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRepos.map((r) => {
                    const dtm = daysToMaturity(r.maturityDate);
                    const elapsed = Math.max(0, Math.ceil((new Date() - new Date(r.startDate)) / 86400000));
                    const accrued = interestAccrual(r.amount, r.rate, elapsed);
                    return (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => openRepo(r.id)}>
                        <TableCell className="font-mono text-sm font-medium">{r.id}</TableCell>
                        <TableCell>{r.counterparty}</TableCell>
                        <TableCell>{fmtMoney(r.amount, r.currency)}</TableCell>
                        <TableCell>{r.rate}%</TableCell>
                        <TableCell className="text-slate-500">{r.startDate}</TableCell>
                        <TableCell className="text-slate-500">{r.maturityDate}</TableCell>
                        <TableCell>
                          <span className={`font-semibold text-sm ${dtm <= 1 ? "text-red-600" : dtm <= 3 ? "text-amber-600" : "text-slate-700"}`}>
                            {r.state === "Closed" ? "—" : `${dtm}d`}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-slate-700">
                          {r.state !== "Closed" ? fmtMoney(accrued, r.currency) : "—"}
                        </TableCell>
                        <TableCell><StatusBadge status={r.state} /></TableCell>
                        <TableCell><StatusBadge status={r.settlement} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
