// ─── Collateral Allocation Agent — Domain Types ───────────────────────────────
//
// These types are owned by the agent, not by the React app.
// Application code maps app-domain objects → these via CollateralAllocationAgent.
// This boundary keeps the algorithm portable and independently testable.

// ── Input types ───────────────────────────────────────────────────────────────

/** Eligibility tag — normalised from free-text custody/counterparty strings. */
export type EligibilityTag =
  | "ELIGIBLE"
  | "REPO_ELIGIBLE"
  | "BNR_ELIGIBLE"
  | "ECB_ELIGIBLE"
  | "CBR_ELIGIBLE"
  | "INELIGIBLE"
  | (string & {}); // allow extension without breaking existing tags

export type PositionStatus = "Available" | "Reserved" | "Locked" | "Pledged";

/**
 * A collateral position as the agent sees it.
 * All monetary values in the trade's base currency.
 */
export interface AgentPosition {
  id:             string;
  isin:           string;
  name:           string;
  currency:       string;
  marketValue:    number;
  haircut:        number;        // decimal percentage, e.g. 3 = 3%
  adjustedValue:  number;        // marketValue × (1 − haircut / 100)  pre-computed for performance
  status:         PositionStatus;
  eligibilityTags: EligibilityTag[];
  custody:        string;
  assetClass?:    string;
  creditRating?:  string;
}

/**
 * The repo trade the agent must collateralise.
 * The agent is ledger-agnostic — it does not know about repo IDs or states.
 */
export interface AgentTrade {
  id:                     string;
  counterparty:           string;
  notional:               number;
  currency:               string;
  coverageRatio:          number;   // e.g. 1.03 for 103%
  requiredCollateral:     number;   // notional × coverageRatio  (pre-computed for clarity)
  eligibilityRequired:    EligibilityTag[];  // asset must have ≥1 matching tag
  maxHaircut?:            number;   // assets above this are excluded
  maxSingleConcentration: number;   // max fraction of basket from one ISIN (0–1), e.g. 0.60
}

// ── Scoring types ─────────────────────────────────────────────────────────────

/**
 * Per-position composite score breakdown.
 * All component scores are in [0, 1]; higher = better.
 */
export interface PositionScore {
  positionId:         string;
  totalScore:         number;
  haircutScore:       number;   // higher when haircut is low (CTD optimisation)
  valueMatchScore:    number;   // higher when adjustedValue closely fills the remaining gap
  concentrationScore: number;   // higher when ISIN concentration stays within limit
  scoringNotes:       string;   // human-readable breakdown for audit / display
}

/**
 * Weights controlling relative importance of each scoring dimension.
 * Must sum to 1.0.  Designed to be overridden per-counterparty or per-desk.
 */
export interface ScoringWeights {
  haircutEfficiency: number;   // prefer CTD (cheapest-to-deliver) assets
  valueMatch:        number;   // prefer assets that fill the gap precisely
  concentration:     number;   // penalise concentration above the limit
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  haircutEfficiency: 0.50,
  valueMatch:        0.30,
  concentration:     0.20,
} as const;

// ── Output types ──────────────────────────────────────────────────────────────

/**
 * One entry in the recommended basket.
 * Includes the scored position and the agent's explanation.
 */
export interface AllocationEntry {
  position:          AgentPosition;
  adjustedValue:     number;
  contributionPct:   number;      // share of requiredCollateral this position covers (%)
  score:             number;      // composite score at time of selection
  scoreBreakdown:    PositionScore;
  selectionReasons:  string[];    // natural-language explanations of why this position was chosen
}

/**
 * One rejected position with structured + human-readable explanations.
 */
export interface RejectionEntry {
  position:     AgentPosition;
  rejectCodes:  RejectCode[];
  humanReasons: string[];
}

export type RejectCode =
  | "STATUS_NOT_AVAILABLE"   // status ≠ "Available"
  | "CURRENCY_MISMATCH"      // asset currency ≠ trade currency
  | "INELIGIBLE"             // no matching eligibility tag
  | "HAIRCUT_EXCEEDED"       // haircut > counterparty max
  | "ZERO_ADJUSTED_VALUE"    // adjustedValue ≤ 0
  | "CONCENTRATION_LIMIT";   // adding this ISIN would breach concentration cap

/**
 * Full allocation result produced by the agent.
 * Self-contained — consumers do not need to re-run any logic.
 */
export interface AllocationResult {
  tradeId:            string;
  notional:           number;
  requiredCollateral: number;
  postedCollateral:   number;
  buffer:             number;         // postedCollateral − requiredCollateral
  coverageRatio:      number;         // target, e.g. 1.03
  coverageAchieved:   number;         // actual = postedCollateral / notional
  selected:           AllocationEntry[];
  rejected:           RejectionEntry[];
  summary:            string;         // executive summary for UI/audit
  warnings:           string[];       // non-blocking issues (e.g. concentration relaxed)
  feasible:           boolean;        // true if requiredCollateral was fully met
  timestamp:          string;         // ISO 8601
  agentVersion:       string;
}
