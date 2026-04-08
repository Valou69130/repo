// ─── Margin Protection Agent — Domain Types ───────────────────────────────────
//
// These types are isolated from the React app's representation.
// The agent maps app-domain repos/assets → these via MarginProtectionAgent.
// All monetary values are in the repo's base currency (RON or EUR).

// ── Alert lifecycle ───────────────────────────────────────────────────────────

/**
 * Five-state lifecycle for a margin alert.
 * Transitions: detected → proposed (agent adds top-up) → reviewed (ops acks)
 *           → approved (treasury approves execution) → resolved (collateral delivered)
 * Separate branch: detected → escalated (when no top-up is possible)
 */
export type MarginAlertState =
  | "detected"   // agent identified a deficit or thin buffer
  | "proposed"   // agent has generated a top-up proposal
  | "reviewed"   // operations team has acknowledged the alert
  | "approved"   // treasury manager has approved the top-up execution
  | "resolved"   // collateral delivered, coverage restored
  | "escalated"; // no eligible collateral available — requires manual escalation

export type MarginAlertSeverity =
  | "Critical"  // posted < notional (actual under-collateralisation)
  | "Warning"   // posted >= notional but below the 103% required threshold
  | "Watch";    // technically compliant, but buffer is dangerously thin

// ── Deficit taxonomy ──────────────────────────────────────────────────────────

/**
 * Structured reason for the margin shortfall.
 * Multiple types can apply to a single alert (e.g. BELOW_THRESHOLD + NEAR_MATURITY).
 */
export type DeficitType =
  | "BELOW_THRESHOLD"    // postedCollateral < requiredCollateral (103% rule)
  | "BELOW_MTA"          // shortfall < MTA — no formal call yet, but monitor
  | "THIN_BUFFER"        // coverage > 103% but buffer < THIN_THRESHOLD
  | "CONCENTRATION_RISK" // single ISIN dominates the basket
  | "NEAR_MATURITY"      // repo matures within 3 days with active deficit
  | "UNCOVERED_CALL";    // formal margin call issued with no collateral proposal possible

// ── Financial position ────────────────────────────────────────────────────────

/**
 * Snapshot of the margin position for a single repo.
 */
export interface MarginPosition {
  repoId:             string;
  counterparty:       string;
  currency:           string;
  notional:           number;
  requiredCollateral: number;   // notional × 1.03
  postedCollateral:   number;
  deficit:            number;   // negative = shortfall, positive = surplus
  coverageRatio:      number;   // actual (e.g. 0.97 or 1.05)
  targetRatio:        number;   // contractual minimum (e.g. 1.03)
  bufferAbs:          number;   // |deficit| in monetary terms
  bufferPct:          number;   // (coverage - target) / target
}

// ── Top-up proposal ───────────────────────────────────────────────────────────

/**
 * An individual position the agent proposes to add to the collateral basket.
 */
export interface ProposedPosition {
  assetId:          string;
  isin:             string;
  name:             string;
  marketValue:      number;
  haircut:          number;
  adjustedValue:    number;
  currency:         string;
  custody:          string;
  score:            number;
  haircutScore:     number;
  valueMatchScore:  number;
  selectionReasons: string[];
}

/**
 * Full top-up proposal for a margin alert.
 * Includes all positions needed + expected post-delivery coverage.
 */
export interface TopUpProposal {
  id:                  string;
  alertId:             string;
  positions:           ProposedPosition[];
  targetTopUp:         number;   // collateral value needed to restore full coverage
  totalProposedValue:  number;   // sum of adjustedValues of proposed positions
  shortfallCovered:    boolean;  // true if totalProposedValue >= targetTopUp
  expectedPosted:      number;   // current posted + totalProposedValue
  expectedCoverage:    number;   // expectedPosted / notional
  expectedBuffer:      number;   // expectedPosted - requiredCollateral
  summary:             string;
  warnings:            string[];
  proposedAt:          string;
}

// ── Alert ─────────────────────────────────────────────────────────────────────

/**
 * A margin alert produced by the detection step.
 * The proposal field is populated by the proposer step (may be null if
 * no eligible collateral is available).
 */
export interface MarginAlert {
  id:                     string;
  position:               MarginPosition;
  severity:               MarginAlertSeverity;
  state:                  MarginAlertState;
  deficitTypes:           DeficitType[];
  explanation:            string[];   // ordered bullet points — primary explanation for UI
  riskFactors:            string[];   // secondary risk notes (maturity, concentration)
  callRequired:           boolean;    // true when deficit ≥ MTA
  minimumTransferAmount:  number;
  proposal:               TopUpProposal | null;
  detectedAt:             string;
  reviewedAt:             string | null;
  approvedAt:             string | null;
  resolvedAt:             string | null;
}

// ── Scan result ───────────────────────────────────────────────────────────────

/**
 * Complete output of a margin scan run.
 * Returned by MarginProtectionAgent.scan() and stored in React state.
 */
export interface MarginScanResult {
  scannedAt:     string;
  totalActive:   number;   // number of non-Closed repos scanned
  alertCount:    number;
  criticalCount: number;
  warningCount:  number;
  watchCount:    number;
  alerts:        MarginAlert[];
  agentVersion:  string;
}
