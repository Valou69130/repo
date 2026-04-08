// ─── Collateral Allocation Agent — Core Allocator ────────────────────────────
//
// Implements a scored greedy basket-selection algorithm:
//   1. Filter candidates (filters.ts)
//   2. Score all remaining candidates in context of the current basket (scoring.ts)
//   3. Select the highest-scoring candidate
//   4. Check concentration; if breached, skip and warn (relax if no alternative)
//   5. Repeat until coverage is met or candidates exhausted
//   6. Build AllocationResult with full explanations
//
// Architecture note: the allocator is a pure function — it takes data, returns
// data, and emits no events.  Side effects (audit, notifications) happen in the
// calling service layer.

import type {
  AgentTrade,
  AgentPosition,
  AllocationEntry,
  AllocationResult,
  RejectionEntry,
  ScoringWeights,
} from "./types";
import { DEFAULT_SCORING_WEIGHTS } from "./types";
import { applyFilters }   from "./filters";
import { scorePosition }  from "./scoring";

const AGENT_VERSION = "1.1.0";

// ── Formatting helpers (local — do not expose outside module) ─────────────────

function fmtNum(n: number, ccy = "RON"): string {
  return `${ccy} ${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

// ── Selection reason generators ───────────────────────────────────────────────

function buildSelectionReasons(
  pos:              AgentPosition,
  score:            ReturnType<typeof scorePosition>,
  candidateCount:   number,
  remaining:        number,
  basketSize:       number,
  trade:            AgentTrade,
): string[] {
  const reasons: string[] = [];

  reasons.push(
    `Ranked #1 of ${candidateCount} eligible candidate${candidateCount !== 1 ? "s" : ""} ` +
    `with composite score ${score.totalScore.toFixed(3)}`
  );

  if (score.haircutScore >= 0.80) {
    reasons.push(
      `Low haircut (${pos.haircut}%) — CTD-efficient; ${fmtPct(score.haircutScore)} of available haircut budget`
    );
  } else if (score.haircutScore >= 0.50) {
    reasons.push(`Acceptable haircut (${pos.haircut}%)`);
  } else {
    reasons.push(`Higher haircut (${pos.haircut}%) accepted — insufficient lower-haircut alternatives`);
  }

  if (score.valueMatchScore >= 0.75) {
    reasons.push(
      `Adjusted value ${fmtNum(pos.adjustedValue, pos.currency)} closely matches ` +
      `remaining gap ${fmtNum(remaining, trade.currency)} — minimises excess collateral`
    );
  } else if (score.valueMatchScore >= 0.40) {
    reasons.push(
      `Adjusted value ${fmtNum(pos.adjustedValue, pos.currency)} partially fills ` +
      `remaining gap ${fmtNum(remaining, trade.currency)}`
    );
  } else if (pos.adjustedValue > remaining) {
    reasons.push(
      `Adjusted value ${fmtNum(pos.adjustedValue, pos.currency)} overshoots gap ` +
      `${fmtNum(remaining, trade.currency)} — no smaller eligible position available`
    );
  }

  if (score.concentrationScore >= 0.95) {
    reasons.push("Contributes to a diversified basket — ISIN concentration within limit");
  }

  const isRepoBal = pos.eligibilityTags.some((t) => t.includes("REPO"));
  const isBnr    = pos.eligibilityTags.some((t) => t.includes("BNR"));
  const isCbr    = pos.eligibilityTags.some((t) => t.includes("CBR"));
  const isEcb    = pos.eligibilityTags.some((t) => t.includes("ECB"));
  const qualifiers: string[] = [];
  if (isRepoBal) qualifiers.push("repo-eligible");
  if (isBnr)     qualifiers.push("BNR-eligible");
  if (isCbr)     qualifiers.push("central-bank eligible");
  if (isEcb)     qualifiers.push("ECB-eligible");
  if (qualifiers.length > 0) {
    reasons.push(`Meets eligibility criteria: ${qualifiers.join(", ")}`);
  }

  if (basketSize === 0) {
    reasons.push("First asset in basket — establishes collateral core position");
  }

  return reasons;
}

// ── Main allocate function ────────────────────────────────────────────────────

/**
 * Produce an optimal collateral basket for the given trade.
 *
 * @param trade      the repo trade to collateralise
 * @param positions  all available positions (agent will filter internally)
 * @param weights    optional scoring weight override
 * @returns          AllocationResult with selected basket, rejections, and explanations
 */
export function allocate(
  trade:     AgentTrade,
  positions: AgentPosition[],
  weights:   ScoringWeights = DEFAULT_SCORING_WEIGHTS,
): AllocationResult {
  // ── Phase 1: filter ─────────────────────────────────────────────────────────
  const { eligible, rejected } = applyFilters(positions, trade);

  // ── Phase 2: greedy selection loop ──────────────────────────────────────────
  const selected:  AllocationEntry[] = [];
  const allRejected: RejectionEntry[] = [...rejected]; // grows if concentration rejects

  // Basket accounting
  const isinValues  = new Map<string, number>(); // isin → accumulated adjustedValue in basket
  let   basketTotal = 0;
  let   remaining   = trade.requiredCollateral;
  const warnings:   string[] = [];

  // Mutable pool of candidates not yet selected
  let   candidates  = [...eligible];

  while (remaining > 0 && candidates.length > 0) {
    // Re-score every remaining candidate given current basket context
    const scored = candidates
      .map((pos) => ({
        pos,
        score: scorePosition(pos, trade, remaining, basketTotal, isinValues, weights),
      }))
      .sort((a, b) => b.score.totalScore - a.score.totalScore);

    // Try candidates in score order, skipping hard concentration breaches
    let selectedThisRound = false;

    for (const { pos, score } of scored) {
      const isinCurrent      = isinValues.get(pos.isin) ?? 0;
      const newIsinTotal     = isinCurrent + pos.adjustedValue;
      const newBasketTotal   = basketTotal + pos.adjustedValue;
      const newIsinFraction  = newIsinTotal / newBasketTotal;

      const concentrationBreached = newIsinFraction > trade.maxSingleConcentration;

      if (concentrationBreached) {
        // Check whether any non-breaching candidate exists
        const hasAlternative = scored.some(
          (alt) =>
            alt.pos.id !== pos.id &&
            ((isinValues.get(alt.pos.isin) ?? 0) + alt.pos.adjustedValue) /
              (basketTotal + alt.pos.adjustedValue) <= trade.maxSingleConcentration
        );

        if (hasAlternative) {
          // Skip this candidate; it will be tried again only if no alternative works
          allRejected.push({
            position:     pos,
            rejectCodes:  ["CONCENTRATION_LIMIT"],
            humanReasons: [
              `Adding ${fmtNum(pos.adjustedValue, pos.currency)} would push ${pos.isin} to ` +
              `${fmtPct(newIsinFraction)} of basket — exceeds ${fmtPct(trade.maxSingleConcentration)} limit. ` +
              `Skipped in favour of a more diversified alternative.`,
            ],
          });
          candidates = candidates.filter((c) => c.id !== pos.id);
          warnings.push(
            `${pos.isin} skipped (concentration ${fmtPct(newIsinFraction)} > limit ${fmtPct(trade.maxSingleConcentration)})`
          );
          continue; // try next candidate in this round
        } else {
          // No alternative — accept the breach and warn
          warnings.push(
            `Concentration limit relaxed for ${pos.isin}: ` +
            `${fmtPct(newIsinFraction)} vs limit ${fmtPct(trade.maxSingleConcentration)} ` +
            `— no diversified alternative available`
          );
          // Fall through to selection
        }
      }

      // ── Select this position ─────────────────────────────────────────────────
      const reasons = buildSelectionReasons(
        pos, score, candidates.length, remaining, selected.length, trade
      );

      selected.push({
        position:         pos,
        adjustedValue:    pos.adjustedValue,
        contributionPct:  Math.min(100, (pos.adjustedValue / trade.requiredCollateral) * 100),
        score:            score.totalScore,
        scoreBreakdown:   score,
        selectionReasons: reasons,
      });

      isinValues.set(pos.isin, (isinValues.get(pos.isin) ?? 0) + pos.adjustedValue);
      basketTotal += pos.adjustedValue;
      remaining   -= pos.adjustedValue;
      candidates   = candidates.filter((c) => c.id !== pos.id);
      selectedThisRound = true;
      break; // restart scoring with updated basket context
    }

    // If no candidate was selected this round (all breached, no alternatives), break
    if (!selectedThisRound) break;
  }

  // ── Phase 3: build result ────────────────────────────────────────────────────
  const postedCollateral = basketTotal;
  const buffer           = postedCollateral - trade.requiredCollateral;
  const coverageAchieved = trade.notional > 0 ? postedCollateral / trade.notional : 0;
  const feasible         = postedCollateral >= trade.requiredCollateral;
  const uniqueIsins      = new Set(selected.map((e) => e.position.isin)).size;

  const summary = feasible
    ? `Recommended basket of ${selected.length} position${selected.length !== 1 ? "s" : ""} ` +
      `across ${uniqueIsins} ISIN${uniqueIsins !== 1 ? "s" : ""}: ` +
      `${fmtNum(postedCollateral, trade.currency)} posted against required ` +
      `${fmtNum(trade.requiredCollateral, trade.currency)} ` +
      `(${(coverageAchieved * 100).toFixed(2)}% coverage). ` +
      `Buffer: ${fmtNum(buffer, trade.currency)}.`
    : `INSUFFICIENT COLLATERAL — Only ${fmtNum(postedCollateral, trade.currency)} of ` +
      `available eligible collateral against required ` +
      `${fmtNum(trade.requiredCollateral, trade.currency)}. ` +
      `Shortfall: ${fmtNum(Math.abs(buffer), trade.currency)}. ` +
      `${allRejected.length} position${allRejected.length !== 1 ? "s" : ""} rejected.`;

  return {
    tradeId:            trade.id,
    notional:           trade.notional,
    requiredCollateral: trade.requiredCollateral,
    postedCollateral,
    buffer,
    coverageRatio:      trade.coverageRatio,
    coverageAchieved,
    selected,
    rejected:           allRejected,
    summary,
    warnings,
    feasible,
    timestamp:          new Date().toISOString(),
    agentVersion:       AGENT_VERSION,
  };
}
