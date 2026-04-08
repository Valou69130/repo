// ─── Collateral Allocation Agent ─────────────────────────────────────────────
//
// Primary entry point for application code.
// Exposes a clean recommend() API and handles the mapping between
// the React app's domain objects and the agent's internal types.
//
// Architecture decision: the agent class acts as an anti-corruption layer.
// App code never touches allocator.ts or filters.ts directly — all calls go
// through this class.  This lets us evolve the algorithm without changing callers.

import type {
  AgentTrade,
  AgentPosition,
  AllocationResult,
  ScoringWeights,
  EligibilityTag,
} from "./types";
import { DEFAULT_SCORING_WEIGHTS } from "./types";
import { allocate } from "./allocator";

// ── App-domain shapes (mirrors the React app's data structures) ───────────────
// These are intentionally loose so the agent works with both the API response
// and any mock/test data without a strict import dependency on app types.

export interface AppAsset {
  id:          string;
  isin:        string;
  name:        string;
  currency:    string;
  marketValue: number;
  haircut:     number;
  status:      string;
  eligibility: string;    // free-text, e.g. "Eligible for overnight repo"
  custody:     string;
  type?:       string;
  rating?:     string;
}

export interface AppRepo {
  id:           string;
  counterparty: string;
  amount:       number;
  currency:     string;
  rate:         number;
  startDate:    string;
  maturityDate: string;
}

export interface RecommendOptions {
  coverageRatio?:          number;   // default 1.03
  eligibilityRequired?:    string[]; // default ["ELIGIBLE", "REPO_ELIGIBLE"]
  maxHaircut?:             number;   // from counterparty profile
  maxSingleConcentration?: number;   // from counterparty profile, default 0.60
  weights?:                ScoringWeights;
}

// ── Eligibility normaliser ────────────────────────────────────────────────────

/**
 * Convert a free-text eligibility string to structured tags.
 * Handles the seed data format: "Eligible for overnight repo",
 * "Eligible for central bank use", "Counterparty restricted",
 * "Internal restriction", plus common variants.
 */
function normaliseEligibility(raw: string): EligibilityTag[] {
  const lower = raw.toLowerCase();

  // Hard disqualifiers take precedence
  if (lower.includes("internal restriction") || lower.includes("non-eligible")) {
    return ["INELIGIBLE"];
  }
  if (lower.includes("restricted") || lower.includes("restriction")) {
    return ["INELIGIBLE"];
  }
  if (!lower.includes("eligible")) {
    return ["INELIGIBLE"]; // no positive eligibility signal
  }

  // Build positive tags
  const tags: EligibilityTag[] = ["ELIGIBLE"];
  if (lower.includes("overnight") || lower.includes("repo")) tags.push("REPO_ELIGIBLE");
  if (lower.includes("central bank") || lower.includes("bnr"))  tags.push("BNR_ELIGIBLE");
  if (lower.includes("cbr"))                                     tags.push("CBR_ELIGIBLE");
  if (lower.includes("ecb") || lower.includes("eurosystem"))     tags.push("ECB_ELIGIBLE");
  return tags;
}

// ── Agent class ───────────────────────────────────────────────────────────────

export class CollateralAllocationAgent {
  private readonly defaultWeights: ScoringWeights;

  constructor(weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS) {
    this.defaultWeights = weights;
  }

  /**
   * Produce an allocation recommendation for a repo trade.
   *
   * @param repo             the repo trade to collateralise
   * @param availableAssets  all assets in inventory (agent filters internally)
   * @param options          counterparty constraints and weight overrides
   */
  recommend(
    repo:            AppRepo,
    availableAssets: AppAsset[],
    options:         RecommendOptions = {},
  ): AllocationResult {
    const trade     = this._toAgentTrade(repo, options);
    const positions = availableAssets.map((a) => this._toAgentPosition(a));
    return allocate(trade, positions, options.weights ?? this.defaultWeights);
  }

  // ── Private adapters ─────────────────────────────────────────────────────────

  private _toAgentTrade(repo: AppRepo, opts: RecommendOptions): AgentTrade {
    const coverageRatio = opts.coverageRatio ?? 1.03;
    return {
      id:                     repo.id,
      counterparty:           repo.counterparty,
      notional:               repo.amount,
      currency:               repo.currency,
      coverageRatio,
      requiredCollateral:     Math.round(repo.amount * coverageRatio),
      eligibilityRequired:    opts.eligibilityRequired ?? ["ELIGIBLE", "REPO_ELIGIBLE"],
      maxHaircut:             opts.maxHaircut,
      maxSingleConcentration: opts.maxSingleConcentration ?? 0.60,
    };
  }

  private _toAgentPosition(asset: AppAsset): AgentPosition {
    const adjValue = Math.round(asset.marketValue * (1 - asset.haircut / 100));
    return {
      id:             asset.id,
      isin:           asset.isin,
      name:           asset.name,
      currency:       asset.currency,
      marketValue:    asset.marketValue,
      haircut:        asset.haircut,
      adjustedValue:  adjValue,
      status:         asset.status as AgentPosition["status"],
      eligibilityTags: normaliseEligibility(asset.eligibility),
      custody:        asset.custody,
      assetClass:     asset.type,
      creditRating:   asset.rating,
    };
  }
}

// ── Module-level singleton ────────────────────────────────────────────────────
// Import this instance everywhere in application code:
//   import { collateralAgent } from "@/agents/collateral";

export const collateralAgent = new CollateralAllocationAgent();
