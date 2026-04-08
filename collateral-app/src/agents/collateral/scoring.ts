// ─── Collateral Allocation Agent — Scoring Helpers ───────────────────────────
//
// Pure functions — no side effects, no I/O, no state.
// Each scoring dimension is independently testable.
//
// Score convention: all component scores in [0, 1], higher = better.
// The composite is a weighted sum whose weights must sum to 1.
//
// Architecture note: keeping scoring separate from the allocator loop means
// weights can be swapped (e.g. per-desk or per-counterparty overrides)
// without touching allocation logic.

import type { AgentPosition, AgentTrade, PositionScore, ScoringWeights } from "./types";
import { DEFAULT_SCORING_WEIGHTS } from "./types";

// ── Component scores ──────────────────────────────────────────────────────────

/**
 * Haircut efficiency score (CTD principle).
 * A position with haircut = 0% scores 1.0; haircut = maxHaircut scores 0.
 * We prefer low-haircut assets because they are cheapest to deliver:
 * the desk retains more of the market value as unencumbered.
 */
export function scoreHaircut(haircut: number, maxHaircut: number): number {
  if (maxHaircut <= 0) return 1;
  return Math.max(0, 1 - haircut / maxHaircut);
}

/**
 * Value-match score: how precisely this position fills the remaining collateral gap.
 *
 * Rationale: we want to avoid massively overshooting the gap (excess collateral
 * ties up inventory unnecessarily).  Exact fill = 1.0; partial fill scores
 * proportionally; overshoot beyond 2× is penalised but never reaches 0
 * (we still prefer an overshoot to no collateral at all).
 *
 * @param adjustedValue  adjusted value of the candidate position
 * @param remainingGap   collateral still needed in the basket
 */
export function scoreValueMatch(adjustedValue: number, remainingGap: number): number {
  if (remainingGap <= 0) return 0;          // basket already full — this position is surplus
  if (adjustedValue <= 0) return 0;
  const ratio = adjustedValue / remainingGap;
  if (ratio <= 1) return ratio;             // partial fill — proportional score
  // Overshoot: score decays as 1/ratio, floored at 0.25 to retain preference
  return Math.max(0.25, 1 / ratio);
}

/**
 * Concentration score: penalise adding a position when its ISIN would exceed
 * the counterparty's single-ISIN concentration limit.
 *
 * @param proposedContrib   adjustedValue this candidate would add
 * @param currentBasketTotal  total adjustedValue already in basket
 * @param isinAlreadyInBasket  adjustedValue of this ISIN already in basket
 * @param maxConcentration  max allowed ISIN fraction (e.g. 0.60)
 */
export function scoreConcentration(
  proposedContrib:     number,
  currentBasketTotal:  number,
  isinAlreadyInBasket: number,
  maxConcentration:    number,
): number {
  const newTotal    = currentBasketTotal + proposedContrib;
  if (newTotal <= 0) return 1;
  const newFraction = (isinAlreadyInBasket + proposedContrib) / newTotal;
  if (newFraction <= maxConcentration) return 1;
  // Over limit — steep linear penalty; reaches 0 at 2× the allowed fraction
  const overshoot = newFraction - maxConcentration;
  return Math.max(0, 1 - overshoot / maxConcentration);
}

// ── Composite score ───────────────────────────────────────────────────────────

/**
 * Compute the composite score for one candidate position in the context of
 * the current (partial) basket.
 *
 * Called once per candidate on every iteration of the greedy loop — the context
 * (remainingGap, basketTotal, isinValues) changes as the basket fills up,
 * so scores are deliberately re-computed each iteration rather than cached.
 */
export function scorePosition(
  position:         AgentPosition,
  trade:            AgentTrade,
  remainingGap:     number,
  basketTotal:      number,
  isinValues:       Map<string, number>,   // isin → total adjustedValue already in basket
  weights:          ScoringWeights = DEFAULT_SCORING_WEIGHTS,
): PositionScore {
  const effectiveMaxHaircut = trade.maxHaircut ?? 15;
  const isinInBasket        = isinValues.get(position.isin) ?? 0;

  const hScore = scoreHaircut(position.haircut, effectiveMaxHaircut);
  const vScore = scoreValueMatch(position.adjustedValue, remainingGap);
  const cScore = scoreConcentration(
    position.adjustedValue,
    basketTotal,
    isinInBasket,
    trade.maxSingleConcentration,
  );

  const total =
    hScore * weights.haircutEfficiency +
    vScore * weights.valueMatch +
    cScore * weights.concentration;

  // Compute projected ISIN fraction for the notes
  const projectedFraction =
    basketTotal + position.adjustedValue > 0
      ? ((isinInBasket + position.adjustedValue) / (basketTotal + position.adjustedValue)) * 100
      : 0;

  const scoringNotes =
    `haircut ${position.haircut}% → hScore ${hScore.toFixed(3)} (w=${weights.haircutEfficiency}); ` +
    `gap ${remainingGap.toLocaleString()} vs adj ${position.adjustedValue.toLocaleString()} → vScore ${vScore.toFixed(3)} (w=${weights.valueMatch}); ` +
    `ISIN conc ${projectedFraction.toFixed(1)}% vs limit ${(trade.maxSingleConcentration * 100).toFixed(0)}% → cScore ${cScore.toFixed(3)} (w=${weights.concentration}); ` +
    `composite ${total.toFixed(4)}`;

  return {
    positionId:         position.id,
    totalScore:         total,
    haircutScore:       hScore,
    valueMatchScore:    vScore,
    concentrationScore: cScore,
    scoringNotes,
  };
}
