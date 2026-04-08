// ─── Margin Protection Agent ──────────────────────────────────────────────────
//
// Primary entry point for margin monitoring in application code.
// Exposes a clean scan() API and manages the alert lifecycle state machine.
//
// Pipeline (inside scan()):
//   1. detectAlerts()  — identify repos with deficits or thin buffers
//   2. proposeTopUp()  — for each alert, find top-up positions
//   3. state update    — "detected" → "proposed" | "escalated"
//
// Lifecycle transitions (updateAlertState()):
//   detected  → proposed   (after propose() runs successfully)
//   detected  → escalated  (no eligible collateral at all)
//   proposed  → reviewed   (operations team acknowledgement)
//   proposed  → escalated  (only partial coverage, ops decision to escalate)
//   reviewed  → approved   (treasury manager approves execution)
//   reviewed  → escalated  (reviewed but no approval pathway)
//   approved  → resolved   (collateral delivered, coverage restored)
//
// Architecture note: the agent acts as an anti-corruption layer.
// Application code never calls detector.ts or proposer.ts directly —
// all margin logic flows through this class.  This keeps the algorithm
// independently evolvable without changing callers.

import type { AppMarginRepo, AppMarginAsset }  from "./appTypes";
import type { MarginAlert, MarginAlertState, MarginScanResult } from "./types";
import { detectAlerts }  from "./detector";
import { proposeTopUp }  from "./proposer";

// Re-export app-domain types so callers only need one import
export type { AppMarginRepo, AppMarginAsset };

// ── Constants ─────────────────────────────────────────────────────────────────

const AGENT_VERSION = "1.0.0";

// ── Valid lifecycle transitions ───────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<MarginAlertState, MarginAlertState[]> = {
  detected:  ["proposed", "escalated"],
  proposed:  ["reviewed", "escalated"],
  reviewed:  ["approved", "escalated"],
  approved:  ["resolved"],
  resolved:  [],
  escalated: [],
};

// ── Agent class ───────────────────────────────────────────────────────────────

export class MarginProtectionAgent {
  /**
   * Run a full margin scan across all active repos.
   *
   * Steps performed for each non-Closed repo:
   *   1. Detect: compute margin position and identify deficit / thin-buffer conditions.
   *   2. Propose: attempt to build a collateral top-up basket using available assets.
   *   3. Finalise: set alert state to "proposed" (basket found) or "escalated" (none found).
   *
   * @param repos   the full repo book — closed repos are filtered out internally
   * @param assets  the full inventory — filtering (status, eligibility, …) is done
   *                by the allocation agent during the propose step
   * @returns       MarginScanResult with all alerts and aggregate statistics
   */
  scan(repos: AppMarginRepo[], assets: AppMarginAsset[]): MarginScanResult {
    const scannedAt   = new Date().toISOString();
    const activeRepos = repos.filter((r) => r.state !== "Closed");

    // ── Phase 1: detect ────────────────────────────────────────────────────────
    const rawAlerts = detectAlerts(repos, assets, { now: scannedAt });

    // ── Phase 2: propose + finalise ────────────────────────────────────────────
    const alerts: MarginAlert[] = rawAlerts.map((alert) => {
      const repo         = repos.find((r) => r.id === alert.position.repoId);
      const postedIds    = repo?.assets ?? [];

      const proposal = proposeTopUp(alert, assets, postedIds);

      // Determine final state
      const updatedState: MarginAlertState = proposal ? "proposed" : "escalated";

      // If escalated with an active call requirement, add UNCOVERED_CALL deficit type
      const deficitTypes = [...alert.deficitTypes];
      if (
        !proposal &&
        alert.callRequired &&
        !deficitTypes.includes("UNCOVERED_CALL")
      ) {
        deficitTypes.push("UNCOVERED_CALL");
      }

      return {
        ...alert,
        state:        updatedState,
        deficitTypes,
        proposal,
      };
    });

    // ── Phase 3: aggregate statistics ─────────────────────────────────────────
    const criticalCount = alerts.filter((a) => a.severity === "Critical").length;
    const warningCount  = alerts.filter((a) => a.severity === "Warning").length;
    const watchCount    = alerts.filter((a) => a.severity === "Watch").length;

    return {
      scannedAt,
      totalActive:   activeRepos.length,
      alertCount:    alerts.length,
      criticalCount,
      warningCount,
      watchCount,
      alerts,
      agentVersion:  AGENT_VERSION,
    };
  }

  /**
   * Advance an alert through its lifecycle state machine.
   *
   * Validates the requested transition against the allowed-transitions table
   * and stamps the appropriate timestamp field.
   *
   * @param alert    the current alert object (immutable — returns a new copy)
   * @param newState the target state
   * @param now      optional ISO timestamp override (useful for tests)
   * @throws         Error if the transition is not permitted
   */
  updateAlertState(
    alert:    MarginAlert,
    newState: MarginAlertState,
    now?:     string,
  ): MarginAlert {
    const allowed = ALLOWED_TRANSITIONS[alert.state];
    if (!allowed.includes(newState)) {
      throw new Error(
        `Invalid margin alert state transition: "${alert.state}" → "${newState}". ` +
        `Allowed transitions from "${alert.state}": ${allowed.length > 0 ? allowed.join(", ") : "none"}.`,
      );
    }

    const ts = now ?? new Date().toISOString();

    return {
      ...alert,
      state:      newState,
      reviewedAt: newState === "reviewed" ? ts : alert.reviewedAt,
      approvedAt: newState === "approved" ? ts : alert.approvedAt,
      resolvedAt: newState === "resolved" ? ts : alert.resolvedAt,
    };
  }

  /**
   * Re-run the proposal step for a single alert (e.g. after inventory changes).
   * Returns the alert with an updated proposal and state.
   *
   * @param alert         the existing alert (state does not need to be "detected")
   * @param assets        current full inventory
   * @param postedAssetIds IDs of assets already in the repo's basket
   */
  repropose(
    alert:          MarginAlert,
    assets:         AppMarginAsset[],
    postedAssetIds: string[],
  ): MarginAlert {
    const proposal    = proposeTopUp(alert, assets, postedAssetIds);
    const newState    = proposal ? "proposed" : "escalated";
    const deficitTypes = [...alert.deficitTypes];

    if (
      !proposal &&
      alert.callRequired &&
      !deficitTypes.includes("UNCOVERED_CALL")
    ) {
      deficitTypes.push("UNCOVERED_CALL");
    }

    return { ...alert, state: newState, deficitTypes, proposal };
  }
}

// ── Module-level singleton ────────────────────────────────────────────────────
// Import this instance in application code:
//   import { marginAgent } from "@/agents/margin";

export const marginAgent = new MarginProtectionAgent();
