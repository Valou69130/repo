// ─── Margin Protection Agent — Public API ────────────────────────────────────
//
// Single import point for application code.
//
//   import { marginAgent }           from "@/agents/margin";  // singleton
//   import { MarginProtectionAgent } from "@/agents/margin";  // class (if you need a custom instance)
//   import type { MarginScanResult } from "@/agents/margin";  // domain types
//
// Internal modules (detector, proposer, appTypes) are NOT re-exported here;
// callers must interact exclusively through MarginProtectionAgent / marginAgent.
// This boundary keeps the algorithm evolvable without breaking consumers.

export { marginAgent, MarginProtectionAgent } from "./MarginProtectionAgent";
export type { AppMarginRepo, AppMarginAsset }  from "./MarginProtectionAgent";

// ── Domain types ─────────────────────────────────────────────────────────────

export type {
  MarginAlert,
  MarginAlertState,
  MarginAlertSeverity,
  MarginPosition,
  ProposedPosition,
  TopUpProposal,
  MarginScanResult,
  DeficitType,
} from "./types";

// ── Test data ─────────────────────────────────────────────────────────────────
// Exported so UI dev fixtures and unit tests share the same source of truth.

export {
  // Repos
  REPO_CRITICAL,
  REPO_WARNING,
  REPO_BELOW_MTA,
  REPO_WATCH,
  REPO_NEAR_MATURITY,
  REPO_EUR_WARNING,
  REPO_CONCENTRATION,
  REPO_HEALTHY,
  REPO_CLOSED,
  REPOS_ALL,
  // Assets
  ASSET_GOV_RON_A,
  ASSET_GOV_RON_B,
  ASSET_GOV_RON_C,
  ASSET_GOV_EUR,
  ASSET_RESERVED,
  ASSET_RESTRICTED,
  ASSET_ALREADY_POSTED,
  ASSET_CONC_A,
  ASSET_CONC_B,
  ASSETS_RON,
  ASSETS_ALL,
} from "./testData";
