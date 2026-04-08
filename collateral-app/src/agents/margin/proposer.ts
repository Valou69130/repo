// ─── Margin Protection Agent — Top-Up Proposer ───────────────────────────────
//
// Pure function: takes a MarginAlert + available assets → TopUpProposal | null.
// Returns null when no eligible collateral can cover the shortfall at all.
//
// Strategy:
//   1. Compute targetTopUp — collateral value needed to restore compliance.
//      • Critical / Warning → fill exact shortfall to requiredCollateral.
//      • Watch (thin buffer) → bring buffer up to THIN_THRESHOLD of required.
//   2. Exclude assets already in the repo's posted basket (by asset ID).
//   3. Delegate basket selection to CollateralAllocationAgent using a synthetic
//      "mini-repo" whose notional equals the target and coverageRatio = 1.0.
//   4. Map AllocationResult → TopUpProposal, annotating warnings.
//
// Architecture note: the proposer imports collateralAgent directly from its
// sibling module to avoid going through the barrel export and any future
// circular-dependency risks.

import { collateralAgent }       from "../collateral/CollateralAllocationAgent";
import { THIN_THRESHOLD }        from "./detector";
import type { AppMarginAsset }   from "./appTypes";
import type {
  MarginAlert,
  TopUpProposal,
  ProposedPosition,
} from "./types";

// ── Target top-up computation ─────────────────────────────────────────────────

/**
 * How much additional adjusted collateral value is needed.
 *
 * For a shortfall alert (Warning / Critical) we target exactly the
 * requiredCollateral level — bringing coverage to 103% precisely.
 *
 * For a thin-buffer alert (Watch) we target a buffer equal to
 * THIN_THRESHOLD × requiredCollateral above the required level,
 * which provides a meaningful safety cushion.
 */
function computeTargetTopUp(alert: MarginAlert): number {
  const pos = alert.position;

  if (alert.severity === "Watch") {
    // Desired buffer: THIN_THRESHOLD × requiredCollateral
    const desiredBuffer  = Math.round(pos.requiredCollateral * THIN_THRESHOLD);
    const currentBuffer  = pos.postedCollateral - pos.requiredCollateral; // ≥ 0 for Watch
    const needed         = desiredBuffer - currentBuffer;
    return Math.max(0, needed);
  }

  // Warning or Critical: fill the shortfall to exactly 103% coverage
  return Math.max(0, pos.requiredCollateral - pos.postedCollateral);
}

// ── Formatting helpers (private) ──────────────────────────────────────────────

function fmtMoney(n: number, ccy = "RON"): string {
  return `${ccy} ${Math.abs(n).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

// ── Main proposer function ────────────────────────────────────────────────────

/**
 * Generate a top-up proposal for a margin alert.
 *
 * @param alert          the alert to address (must include position data)
 * @param allAssets      full inventory (proposer filters internally)
 * @param postedAssetIds IDs of assets already in the repo's basket — excluded from candidacy
 * @returns              TopUpProposal, or null if no eligible collateral exists at all
 */
export function proposeTopUp(
  alert:          MarginAlert,
  allAssets:      AppMarginAsset[],
  postedAssetIds: string[],
): TopUpProposal | null {
  const pos         = alert.position;
  const targetTopUp = computeTargetTopUp(alert);

  if (targetTopUp <= 0) return null;

  // ── Candidate pool: Available assets NOT already in the basket ────────────
  // We do not apply eligibility filters here — the allocation agent handles
  // eligibility, status, haircut, currency, and concentration checks internally.
  const candidates = allAssets.filter(
    (a) => !postedAssetIds.includes(a.id),
  );

  if (candidates.length === 0) return null;

  // ── Synthetic mini-repo representing the gap ──────────────────────────────
  // Setting coverageRatio = 1.0 means the allocator targets exactly targetTopUp
  // in adjusted value — no extra multiplier on top of the gap.
  const today = new Date();
  const syntheticRepo = {
    id:           `${alert.id}-topup`,
    counterparty: pos.counterparty,
    amount:       targetTopUp,
    currency:     pos.currency,
    rate:         0,
    startDate:    today.toISOString().slice(0, 10),
    maturityDate: new Date(today.getTime() + 86_400_000).toISOString().slice(0, 10),
  };

  const result = collateralAgent.recommend(syntheticRepo, candidates, {
    coverageRatio: 1.0,
  });

  // ── No positions selected at all ─────────────────────────────────────────
  if (result.selected.length === 0) return null;

  // ── Map AllocationEntry[] → ProposedPosition[] ───────────────────────────
  const positions: ProposedPosition[] = result.selected.map((entry) => ({
    assetId:          entry.position.id,
    isin:             entry.position.isin,
    name:             entry.position.name,
    marketValue:      entry.position.marketValue,
    haircut:          entry.position.haircut,
    adjustedValue:    entry.adjustedValue,
    currency:         entry.position.currency,
    custody:          entry.position.custody,
    score:            entry.score,
    haircutScore:     entry.scoreBreakdown.haircutScore,
    valueMatchScore:  entry.scoreBreakdown.valueMatchScore,
    selectionReasons: entry.selectionReasons,
  }));

  // ── Coverage metrics ──────────────────────────────────────────────────────
  const totalProposedValue = positions.reduce((s, p) => s + p.adjustedValue, 0);
  const shortfallCovered   = totalProposedValue >= targetTopUp;
  const expectedPosted     = pos.postedCollateral + totalProposedValue;
  const expectedCoverage   = pos.notional > 0 ? expectedPosted / pos.notional : 0;
  const expectedBuffer     = expectedPosted - pos.requiredCollateral;
  const ccy                = pos.currency;

  // ── Warnings ─────────────────────────────────────────────────────────────
  const warnings: string[] = [...result.warnings];

  if (!shortfallCovered) {
    const coverPct = Math.round((totalProposedValue / targetTopUp) * 100);
    warnings.push(
      `Partial coverage only — proposal provides ${fmtMoney(totalProposedValue, ccy)} of the ` +
      `required ${fmtMoney(targetTopUp, ccy)} (${coverPct}%). ` +
      `Insufficient eligible collateral in inventory.`,
    );
  }

  if (expectedBuffer < 0) {
    warnings.push(
      `Even after top-up, coverage ${(expectedCoverage * 100).toFixed(2)}% remains below the ` +
      `${(pos.targetRatio * 100).toFixed(0)}% contractual threshold. Manual escalation required.`,
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary = shortfallCovered
    ? `Top-up basket: ${positions.length} position${positions.length !== 1 ? "s" : ""} — ` +
      `${fmtMoney(totalProposedValue, ccy)} adjusted value. ` +
      `Expected coverage: ${(expectedCoverage * 100).toFixed(2)}%, ` +
      `buffer ${expectedBuffer >= 0 ? "+" : ""}${fmtMoney(expectedBuffer, ccy)}.`
    : `PARTIAL — ${fmtMoney(totalProposedValue, ccy)} of ${fmtMoney(targetTopUp, ccy)} required ` +
      `(${Math.round((totalProposedValue / targetTopUp) * 100)}% of target). ` +
      `Expected coverage after top-up: ${(expectedCoverage * 100).toFixed(2)}%.`;

  return {
    id:                 `TP-${alert.id}`,
    alertId:            alert.id,
    positions,
    targetTopUp,
    totalProposedValue,
    shortfallCovered,
    expectedPosted,
    expectedCoverage,
    expectedBuffer,
    summary,
    warnings,
    proposedAt:         new Date().toISOString(),
  };
}
