// ─── Collateral Allocation Agent — Public API ─────────────────────────────────
// Single import point for application code.
// Internal modules (allocator, filters, scoring) are NOT re-exported;
// callers should only interact through CollateralAllocationAgent.

export { collateralAgent, CollateralAllocationAgent } from "./CollateralAllocationAgent";
export type { AppAsset, AppRepo, RecommendOptions }   from "./CollateralAllocationAgent";
export type {
  AllocationResult,
  AllocationEntry,
  RejectionEntry,
  AgentTrade,
  AgentPosition,
  PositionScore,
  ScoringWeights,
  RejectCode,
} from "./types";
export { DEFAULT_SCORING_WEIGHTS } from "./types";

// Test data exported so UI dev fixtures and unit tests share the same source
export {
  TRADE_OVERNIGHT,
  TRADE_1W_LARGE,
  TRADE_EUR,
  TRADE_INFEASIBLE,
  ASSETS_STANDARD,
  ASSETS_EUR,
} from "./testData";
