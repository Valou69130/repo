// ─── Margin Protection Agent — App-Domain Types ──────────────────────────────
//
// Shared interfaces that mirror the React app's data structures.
// Imported by detector, proposer, and the MarginProtectionAgent class.
// Kept in a separate file to avoid circular imports between those modules.
//
// AppMarginAsset is structurally identical to CollateralAllocationAgent.AppAsset —
// TypeScript structural typing means values of either type are interchangeable,
// but we keep the declaration here so the margin sub-package has no compile-time
// dependency on the parent allocation agent.

// ── Asset ─────────────────────────────────────────────────────────────────────

/**
 * An inventory position as seen by the margin agent.
 * Mirrors CollateralAllocationAgent.AppAsset exactly so that the same runtime
 * objects can be passed to both agents without a copy.
 */
export interface AppMarginAsset {
  id:          string;
  isin:        string;
  name:        string;
  currency:    string;
  marketValue: number;
  haircut:     number;       // percentage, e.g. 3 = 3%
  status:      string;       // "Available" | "Reserved" | "Locked" | "Pledged"
  eligibility: string;       // free-text, e.g. "Eligible for overnight repo"
  custody:     string;
  type?:       string;
  rating?:     string;
}

// ── Repo ──────────────────────────────────────────────────────────────────────

/**
 * An active repo trade as seen by the margin agent.
 * Extends the base trade shape with the margin-monitoring fields that
 * the app already maintains (requiredCollateral, postedCollateral, buffer).
 */
export interface AppMarginRepo {
  id:                  string;
  counterparty:        string;
  amount:              number;       // notional
  currency:            string;
  rate:                number;
  startDate:           string;       // ISO date
  maturityDate:        string;       // ISO date
  state:               string;       // "Active" | "Closed" | "Pending" | …
  requiredCollateral:  number;       // notional × 1.03 (pre-computed by app)
  postedCollateral:    number;
  buffer:              number;       // postedCollateral − requiredCollateral
  assets?:             string[];     // IDs of currently posted collateral assets
}
