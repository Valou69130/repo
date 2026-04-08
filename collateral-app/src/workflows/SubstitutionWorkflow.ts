// ─── Substitution Workflow ────────────────────────────────────────────────────
//
// Pure workflow functions for collateral substitution on active repo trades.
//
// analyzeSubstitution() — produce a structured SubstitutionAnalysis object:
//   • validity gate (can the trade proceed?)
//   • coverage impact (before / after)
//   • collateral-cost impact (haircut delta)
//   • concentration analysis
//   • liquidity benefit detection
//   • recommendation with structured reasons
//
// executeSubstitution() — commit the substitution:
//   • returns updated repo + both asset snapshots
//   • emits structured audit events + human-readable audit entries
//
// Pure functions — no React, no store access, no side effects.
// useSubstitutionWorkflow() (useWorkflows.ts) handles dispatch + persistence.

import type { Asset, Repo, AuditEntry } from "@/domain/types";
import { createAgentAuditEvent }        from "@/domain/events";
import type { WorkflowResult, WorkflowContext } from "./types";
import { failedWorkflow }               from "./types";

const AGENT_ID      = "substitution";
const AGENT_VERSION = "1.0.0";

const REQUIRED_COVERAGE_RATIO  = 1.03;   // 103% — hard minimum for healthy repo
const MINIMUM_COVERAGE_RATIO   = 1.00;   // 100% — absolute floor to allow execution
const CONCENTRATION_HARD_LIMIT = 0.70;   // flag if single ISIN > 70% of basket

// ── Domain helpers ────────────────────────────────────────────────────────────

function adjValue(a: Asset): number {
  return a.marketValue * (1 - a.haircut / 100);
}

function fmt(v: number, ccy = "RON"): string {
  return new Intl.NumberFormat("en-RO", {
    style: "currency", currency: ccy, maximumFractionDigits: 0,
  }).format(v);
}

function fmtPct(v: number, decimals = 1): string {
  return `${(v * 100).toFixed(decimals)}%`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AssetSnapshot {
  id:          string;
  isin:        string;
  name:        string;
  currency:    string;
  marketValue: number;
  haircutPct:  number;
  adjValue:    number;
  custody:     string;
  eligibility: string;
  type:        string;
}

export interface CoverageSummary {
  postedCollateral:   number;
  requiredCollateral: number;
  buffer:             number;
  coverageRatio:      number;   // posted / required
  repoState:          string;
}

export interface SubstitutionAnalysis {
  repoId:      string;
  outAsset:    AssetSnapshot;
  inAsset:     AssetSnapshot;

  // ── Validity gate ──────────────────────────────────────────────────────────
  validForExecution: boolean;   // false = hard block (coverage would drop below 100%)
  invalidReasons:    string[];  // human-readable hard blocks

  // ── Coverage impact ────────────────────────────────────────────────────────
  before:             CoverageSummary;
  after:              CoverageSummary;
  coverageDeltaRatio: number;   // after.coverageRatio - before.coverageRatio
  meetsRequiredRatio: boolean;  // after >= REQUIRED_COVERAGE_RATIO

  // ── Haircut / cost ─────────────────────────────────────────────────────────
  haircutDelta:   number;   // in.haircut - out.haircut (negative = improvement)
  haircutNote:    string;

  // ── Concentration ──────────────────────────────────────────────────────────
  concentrationBefore: number;   // fraction of basket from out ISIN
  concentrationAfter:  number;   // fraction from in ISIN
  concentrationNote:   string;

  // ── Liquidity ─────────────────────────────────────────────────────────────
  liquidityBenefit: boolean;
  liquidityNote:    string;

  // ── Recommendation ────────────────────────────────────────────────────────
  recommended: boolean;
  reasons:     string[];   // positive reasons (shown in green)
  warnings:    string[];   // non-blocking (shown in amber)
}

export interface ExecuteSubstitutionInput {
  repo:     Repo;
  outAsset: Asset;
  inAsset:  Asset;
  analysis: SubstitutionAnalysis;
}

export interface SubstitutionExecution {
  updatedRepo:    Repo;
  releasedAsset:  Asset;   // outAsset with status → "Available"
  allocatedAsset: Asset;   // inAsset with status → "Locked"
  analysis:       SubstitutionAnalysis;
}

// ── analyzeSubstitution ───────────────────────────────────────────────────────

export interface AnalyzeSubstitutionInput {
  repo:     Repo;
  outAsset: Asset;
  inAsset:  Asset;
  allAssets: Asset[];  // full inventory for concentration calc
}

export function analyzeSubstitution(
  input:   AnalyzeSubstitutionInput,
): SubstitutionAnalysis {
  const { repo, outAsset, inAsset, allAssets } = input;

  const outAdj = adjValue(outAsset);
  const inAdj  = adjValue(inAsset);

  // ── Before state ──────────────────────────────────────────────────────────
  const beforePosted  = repo.postedCollateral;
  const beforeBuffer  = beforePosted - repo.requiredCollateral;
  const beforeRatio   = beforePosted / repo.requiredCollateral;

  const before: CoverageSummary = {
    postedCollateral:   beforePosted,
    requiredCollateral: repo.requiredCollateral,
    buffer:             beforeBuffer,
    coverageRatio:      beforeRatio,
    repoState:          repo.state,
  };

  // ── After state ───────────────────────────────────────────────────────────
  const afterPosted  = Math.round(beforePosted - outAdj + inAdj);
  const afterBuffer  = afterPosted - repo.requiredCollateral;
  const afterRatio   = afterPosted / repo.requiredCollateral;
  const afterState   =
    afterPosted < repo.requiredCollateral * MINIMUM_COVERAGE_RATIO ? "Margin deficit" :
    afterPosted < repo.requiredCollateral * REQUIRED_COVERAGE_RATIO ? "Margin deficit" :
    "Active";

  const after: CoverageSummary = {
    postedCollateral:   afterPosted,
    requiredCollateral: repo.requiredCollateral,
    buffer:             afterBuffer,
    coverageRatio:      afterRatio,
    repoState:          afterState,
  };

  // ── Validity ──────────────────────────────────────────────────────────────
  const invalidReasons: string[] = [];

  if (outAsset.id === inAsset.id) {
    invalidReasons.push("Outgoing and incoming positions are the same asset.");
  }
  if (inAsset.status !== "Available") {
    invalidReasons.push(`Replacement asset is not available (status: ${inAsset.status}).`);
  }
  if (!inAsset.eligibility.includes("Eligible")) {
    invalidReasons.push("Replacement asset is not eligible for repo collateral.");
  }
  if (afterRatio < MINIMUM_COVERAGE_RATIO) {
    invalidReasons.push(
      `After substitution, coverage would fall to ${fmtPct(afterRatio)} — below the 100% minimum. ` +
      `A margin call would be triggered immediately.`
    );
  }

  const validForExecution = invalidReasons.length === 0;

  // ── Coverage delta ────────────────────────────────────────────────────────
  const coverageDeltaRatio  = afterRatio - beforeRatio;
  const meetsRequiredRatio  = afterRatio >= REQUIRED_COVERAGE_RATIO;

  // ── Haircut analysis ─────────────────────────────────────────────────────
  const haircutDelta = inAsset.haircut - outAsset.haircut;
  const haircutNote =
    haircutDelta < 0
      ? `Incoming asset has lower haircut (${inAsset.haircut}% vs ${outAsset.haircut}%) — cheaper to deliver. Collateral efficiency improves by ${Math.abs(haircutDelta)}%.`
      : haircutDelta === 0
      ? `Haircut is unchanged at ${outAsset.haircut}%. No efficiency impact.`
      : `Incoming asset has higher haircut (${inAsset.haircut}% vs ${outAsset.haircut}%) — collateral costs increase by ${haircutDelta}%. Consider a lower-haircut alternative if available.`;

  // ── Concentration ─────────────────────────────────────────────────────────
  const basketAssets = allAssets.filter(a => repo.assets.includes(a.id));
  const basketTotal  = basketAssets.reduce((s, a) => s + adjValue(a), 0) || 1;

  // Before: fraction attributable to outgoing ISIN
  const outIsinTotal = basketAssets
    .filter(a => a.isin === outAsset.isin)
    .reduce((s, a) => s + adjValue(a), 0);
  const concentrationBefore = outIsinTotal / basketTotal;

  // After: same basket but out removed, in added (approx, single-asset basket is common)
  const afterBasketTotal = Math.max(basketTotal - outAdj + inAdj, 1);
  const inIsinTotal = basketAssets
    .filter(a => a.isin === inAsset.isin && a.id !== outAsset.id)
    .reduce((s, a) => s + adjValue(a), 0) + inAdj;
  const concentrationAfter = inIsinTotal / afterBasketTotal;

  let concentrationNote: string;
  if (concentrationAfter > CONCENTRATION_HARD_LIMIT) {
    concentrationNote = `After substitution, ${inAsset.isin} would represent ${fmtPct(concentrationAfter)} of the basket — ` +
      `above the ${fmtPct(CONCENTRATION_HARD_LIMIT)} hard limit. Concentration risk is elevated.`;
  } else if (concentrationAfter > 0.50) {
    concentrationNote = `Incoming ISIN (${inAsset.isin}) would represent ${fmtPct(concentrationAfter)} of the basket — ` +
      `within limits but concentration is elevated. Monitor closely.`;
  } else {
    concentrationNote = `Concentration within acceptable limits. Incoming ISIN represents ${fmtPct(concentrationAfter)} of the basket.`;
  }

  // ── Liquidity benefit ─────────────────────────────────────────────────────
  // Liquidity benefit when releasing a higher-haircut (more expensive) locked asset
  // and replacing with a lower-haircut (cheaper) one, freeing up the expensive asset
  // for other uses.
  const liquidityBenefit = haircutDelta < 0;
  const liquidityNote = liquidityBenefit
    ? `Releasing ${outAsset.name} (${outAsset.haircut}% haircut) returns it to the free pool. ` +
      `The cheaper ${inAsset.name} (${inAsset.haircut}% haircut) is a more efficient use of ` +
      `encumbrance capacity. The released asset can be redeployed in other transactions.`
    : haircutDelta === 0
    ? "No material liquidity benefit — both positions have identical haircut costs."
    : `Substituting into a higher-haircut asset (${inAsset.haircut}% vs ${outAsset.haircut}%) ` +
      `increases collateral cost. This reduces efficient use of the encumbrance capacity.`;

  // ── Recommendation ────────────────────────────────────────────────────────
  const reasons:  string[] = [];
  const warnings: string[] = [];

  if (!validForExecution) {
    // Hard blocks — no positive reasons
  } else {
    if (meetsRequiredRatio) {
      reasons.push(
        `Coverage ratio maintained at ${fmtPct(afterRatio)} — at or above the required ${fmtPct(REQUIRED_COVERAGE_RATIO)} threshold.`
      );
    } else {
      warnings.push(
        `Coverage falls to ${fmtPct(afterRatio)}, below the ${fmtPct(REQUIRED_COVERAGE_RATIO)} required threshold. ` +
        `Repo will enter margin deficit state. A margin call notice will be issued.`
      );
    }

    if (haircutDelta < 0) {
      reasons.push(
        `Haircut reduces from ${outAsset.haircut}% to ${inAsset.haircut}% (−${Math.abs(haircutDelta)}pp). ` +
        `Cheapest-to-deliver optimisation — collateral cost improves.`
      );
    } else if (haircutDelta > 0) {
      warnings.push(
        `Haircut increases by ${haircutDelta}pp. This is a more expensive allocation choice.`
      );
    }

    if (concentrationAfter > CONCENTRATION_HARD_LIMIT) {
      warnings.push(concentrationNote);
    } else if (concentrationAfter < concentrationBefore) {
      reasons.push(`Concentration improves: ${fmtPct(concentrationBefore)} → ${fmtPct(concentrationAfter)}.`);
    }

    if (liquidityBenefit) {
      reasons.push(liquidityNote);
    }

    // Coverage improvement (relevant for margin-deficit repos)
    if (repo.state === "Margin deficit" && afterRatio > beforeRatio) {
      reasons.push(
        `Coverage improves from ${fmtPct(beforeRatio)} → ${fmtPct(afterRatio)}. ` +
        `This partially addresses the current margin deficit.`
      );
    }
  }

  const recommended =
    validForExecution &&
    meetsRequiredRatio &&
    haircutDelta <= 0 &&
    concentrationAfter <= CONCENTRATION_HARD_LIMIT;

  return {
    repoId: repo.id,
    outAsset: {
      id: outAsset.id, isin: outAsset.isin, name: outAsset.name,
      currency: outAsset.currency, marketValue: outAsset.marketValue,
      haircutPct: outAsset.haircut, adjValue: outAdj,
      custody: outAsset.custody,
      eligibility: outAsset.eligibility,
      type: outAsset.type ?? "",
    },
    inAsset: {
      id: inAsset.id, isin: inAsset.isin, name: inAsset.name,
      currency: inAsset.currency, marketValue: inAsset.marketValue,
      haircutPct: inAsset.haircut, adjValue: inAdj,
      custody: inAsset.custody,
      eligibility: inAsset.eligibility,
      type: inAsset.type ?? "",
    },
    validForExecution,
    invalidReasons,
    before,
    after,
    coverageDeltaRatio,
    meetsRequiredRatio,
    haircutDelta,
    haircutNote,
    concentrationBefore,
    concentrationAfter,
    concentrationNote,
    liquidityBenefit,
    liquidityNote,
    recommended,
    reasons,
    warnings,
  };
}

// ── executeSubstitution ───────────────────────────────────────────────────────

export function executeSubstitution(
  input:   ExecuteSubstitutionInput,
  context: WorkflowContext,
): WorkflowResult<SubstitutionExecution> {
  const { repo, outAsset, inAsset, analysis } = input;
  const ts = context.ts ?? new Date().toISOString();

  if (!analysis.validForExecution) {
    return failedWorkflow(
      `Substitution blocked: ${analysis.invalidReasons.join("; ")}`,
      context,
    );
  }

  // ── Compute updated entities ──────────────────────────────────────────────
  const newAssets = repo.assets
    .filter(id => id !== outAsset.id)
    .concat([inAsset.id]);

  const updatedRepo: Repo = {
    ...repo,
    assets:           newAssets,
    postedCollateral: analysis.after.postedCollateral,
    buffer:           analysis.after.buffer,
    state:            analysis.after.repoState,
  };

  const releasedAsset:  Asset = { ...outAsset, status: "Available" };
  const allocatedAsset: Asset = { ...inAsset,  status: "Locked"    };

  // ── Audit events ─────────────────────────────────────────────────────────
  const agentEvent = createAgentAuditEvent({
    type:         "workflow.substitution.executed",
    agentId:      AGENT_ID,
    agentVersion: AGENT_VERSION,
    actor:        context.actor,
    action:       "collateral substitution executed",
    input: {
      repoId:     repo.id,
      outAssetId: outAsset.id,
      inAssetId:  inAsset.id,
      fromState:  repo.state,
    },
    output: {
      summary:      `Substituted ${outAsset.name} → ${inAsset.name} on ${repo.id}. ` +
                    `Coverage: ${(analysis.before.coverageRatio * 100).toFixed(1)}% → ` +
                    `${(analysis.after.coverageRatio * 100).toFixed(1)}%.`,
      state:        analysis.after.repoState,
      coverageAfter: analysis.after.coverageRatio,
    },
    repoId: repo.id,
  });

  const tsShort = ts.slice(0, 16).replace("T", " ");

  const releaseEntry: AuditEntry = {
    ts:      tsShort,
    user:    context.actor,
    role:    context.role,
    action:  "collateral released",
    object:  outAsset.id,
    prev:    "Locked",
    next:    "Available",
    comment: `Released ${outAsset.name} from repo ${repo.id} — substitution approved.`,
  };

  const allocationEntry: AuditEntry = {
    ts:      tsShort,
    user:    context.actor,
    role:    context.role,
    action:  "collateral allocated",
    object:  inAsset.id,
    prev:    "Available",
    next:    "Locked",
    comment: `Allocated ${inAsset.name} to repo ${repo.id} as substitution for ${outAsset.name}.`,
  };

  const substitutionEntry: AuditEntry = {
    ts:      tsShort,
    user:    context.actor,
    role:    context.role,
    action:  "collateral substituted",
    object:  repo.id,
    prev:    outAsset.id,
    next:    inAsset.id,
    comment: `Substitution approved and executed: ${outAsset.name} → ${inAsset.name}. ` +
             `Coverage ${(analysis.before.coverageRatio * 100).toFixed(1)}% → ` +
             `${(analysis.after.coverageRatio * 100).toFixed(1)}%. ` +
             (analysis.after.repoState !== repo.state
               ? `Repo state updated: ${repo.state} → ${analysis.after.repoState}.`
               : "Repo state unchanged."),
  };

  const warnings: string[] = [...analysis.warnings];
  if (analysis.after.repoState === "Margin deficit") {
    warnings.push(
      `Repo ${repo.id} entered margin deficit after substitution. ` +
      `Buffer: ${fmt(analysis.after.buffer, repo.currency)}. Margin call notice required.`
    );
  }

  return {
    payload: { updatedRepo, releasedAsset, allocatedAsset, analysis },
    agentEvents:  [agentEvent],
    auditEntries: [releaseEntry, allocationEntry, substitutionEntry],
    warnings,
    success: true,
  };
}

// ── proposeSubstitution audit trail ───────────────────────────────────────────

export function recordSubstitutionProposal(
  input: { repo: Repo; outAsset: Asset; inAsset: Asset; analysis: SubstitutionAnalysis },
  context: WorkflowContext,
): WorkflowResult<{ proposed: true }> {
  const ts = context.ts ?? new Date().toISOString();
  const { repo, outAsset, inAsset } = input;

  const agentEvent = createAgentAuditEvent({
    type:         "workflow.substitution.proposed",
    agentId:      AGENT_ID,
    agentVersion: AGENT_VERSION,
    actor:        context.actor,
    action:       "collateral substitution proposed",
    input: {
      repoId:     repo.id,
      outAssetId: outAsset.id,
      inAssetId:  inAsset.id,
    },
    output: {
      summary:     `${context.actor} proposed substitution: ${outAsset.name} → ${inAsset.name} on ${repo.id}. Pending approval.`,
      recommended: input.analysis.recommended,
    },
    repoId: repo.id,
  });

  const auditEntry: AuditEntry = {
    ts:      ts.slice(0, 16).replace("T", " "),
    user:    context.actor,
    role:    context.role,
    action:  "substitution proposed",
    object:  repo.id,
    prev:    outAsset.id,
    next:    inAsset.id,
    comment: `${context.actor} proposed: ${outAsset.name} → ${inAsset.name}. ` +
             `Pending Treasury Manager approval (4-eye). ` +
             `Coverage impact: ${(input.analysis.before.coverageRatio * 100).toFixed(1)}% → ` +
             `${(input.analysis.after.coverageRatio * 100).toFixed(1)}%.`,
  };

  return {
    payload:      { proposed: true as const },
    agentEvents:  [agentEvent],
    auditEntries: [auditEntry],
    warnings:     input.analysis.warnings,
    success:      true,
  };
}
