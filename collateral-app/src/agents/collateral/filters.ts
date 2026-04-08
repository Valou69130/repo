// ─── Collateral Allocation Agent — Pre-Allocation Filter Pipeline ─────────────
//
// Every candidate position passes through this pipeline before scoring begins.
// Each filter is applied independently and records a structured rejection code
// plus a human-readable explanation.
//
// Architecture note: keeping filters separate from the scoring step ensures
// that rejected positions carry full diagnostic information for the UI,
// and that the scorer never sees invalid candidates.

import type { AgentPosition, AgentTrade, RejectCode, RejectionEntry } from "./types";

export interface FilterResult {
  eligible:  AgentPosition[];
  rejected:  RejectionEntry[];
}

// ── Individual filter functions ───────────────────────────────────────────────
// Each returns { code, reason } if the check fails, or null if the position passes.

function checkStatus(pos: AgentPosition): { code: RejectCode; reason: string } | null {
  if (pos.status !== "Available") {
    return {
      code:   "STATUS_NOT_AVAILABLE",
      reason: `Status is "${pos.status}" — only Available positions can be allocated to a repo basket`,
    };
  }
  return null;
}

function checkCurrency(pos: AgentPosition, trade: AgentTrade): { code: RejectCode; reason: string } | null {
  if (pos.currency !== trade.currency) {
    return {
      code:   "CURRENCY_MISMATCH",
      reason: `Asset currency ${pos.currency} does not match trade currency ${trade.currency}`,
    };
  }
  return null;
}

function checkAdjustedValue(pos: AgentPosition): { code: RejectCode; reason: string } | null {
  if (pos.adjustedValue <= 0) {
    return {
      code:   "ZERO_ADJUSTED_VALUE",
      reason: `Adjusted value is ${pos.adjustedValue} after applying ${pos.haircut}% haircut — unusable as collateral`,
    };
  }
  return null;
}

function checkEligibility(
  pos:   AgentPosition,
  trade: AgentTrade,
): { code: RejectCode; reason: string } | null {
  // An asset is ineligible if it carries the INELIGIBLE tag
  if (pos.eligibilityTags.includes("INELIGIBLE")) {
    return {
      code:   "INELIGIBLE",
      reason: `Asset is explicitly marked ineligible (counterparty or internal restriction)`,
    };
  }
  // If the trade specifies required tags, the position must match at least one
  if (trade.eligibilityRequired.length > 0) {
    const matches = trade.eligibilityRequired.some((req) =>
      pos.eligibilityTags.some((tag) => tag.includes(req) || req.includes(tag))
    );
    if (!matches) {
      return {
        code:   "INELIGIBLE",
        reason:
          `Eligibility tags [${pos.eligibilityTags.join(", ") || "none"}] do not satisfy ` +
          `required criteria [${trade.eligibilityRequired.join(", ")}]`,
      };
    }
  }
  return null;
}

function checkHaircut(pos: AgentPosition, trade: AgentTrade): { code: RejectCode; reason: string } | null {
  if (trade.maxHaircut != null && pos.haircut > trade.maxHaircut) {
    return {
      code:   "HAIRCUT_EXCEEDED",
      reason: `Haircut ${pos.haircut}% exceeds counterparty maximum of ${trade.maxHaircut}%`,
    };
  }
  return null;
}

// ── Pipeline orchestrator ─────────────────────────────────────────────────────

/**
 * Apply all structural filters to a set of positions.
 * Positions that fail any check are placed in `rejected` with full diagnostic info.
 * Positions that pass all checks are placed in `eligible` and forwarded to scoring.
 */
export function applyFilters(positions: AgentPosition[], trade: AgentTrade): FilterResult {
  const eligible:  AgentPosition[]  = [];
  const rejected:  RejectionEntry[] = [];

  for (const pos of positions) {
    const failures = [
      checkStatus(pos),
      checkCurrency(pos, trade),
      checkAdjustedValue(pos),
      checkEligibility(pos, trade),
      checkHaircut(pos, trade),
    ].filter((f): f is { code: RejectCode; reason: string } => f !== null);

    if (failures.length > 0) {
      rejected.push({
        position:     pos,
        rejectCodes:  failures.map((f) => f.code),
        humanReasons: failures.map((f) => f.reason),
      });
    } else {
      eligible.push(pos);
    }
  }

  return { eligible, rejected };
}
