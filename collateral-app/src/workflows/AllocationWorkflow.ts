// ─── Allocation Workflow ──────────────────────────────────────────────────────
//
// Orchestrates the Collateral Allocation Agent with full audit trail generation.
//
// runAllocation()     — run the agent, auto-resolve counterparty profile, emit audit
// approveAllocation() — record user approval, emit approval audit event
//
// Pure functions — no React, no store access, no side effects.
// The UI hook (useAllocationWorkflow) handles dispatch + API persistence.

import { collateralAgent }       from "@/agents/collateral";
import type { AppRepo, AppAsset, RecommendOptions, AllocationResult } from "@/agents/collateral";
import { createAgentAuditEvent } from "@/domain/events";
import type { AuditEntry }       from "@/domain/types";
import { COUNTERPARTY_PROFILES } from "@/domain/counterparties";
import type { WorkflowResult, WorkflowContext } from "./types";
import { failedWorkflow }        from "./types";

const AGENT_ID      = "allocation";
const AGENT_VERSION = "1.1.0";

// ── Input types ───────────────────────────────────────────────────────────────

export interface RunAllocationInput {
  repo:     AppRepo;
  assets:   AppAsset[];
  options?: RecommendOptions;
}

export interface ApproveAllocationInput {
  repoId: string;
  result: AllocationResult;
}

// ── runAllocation ─────────────────────────────────────────────────────────────

/**
 * Run the allocation agent for a repo trade.
 *
 * Automatically resolves counterparty profile constraints (maxHaircut,
 * concentrationLimit) unless overridden in options.
 * Returns the AllocationResult plus structured audit events and entries.
 */
export function runAllocation(
  input:   RunAllocationInput,
  context: WorkflowContext,
): WorkflowResult<AllocationResult> {
  const { repo, assets, options = {} } = input;
  const ts = context.ts ?? new Date().toISOString();

  // Resolve counterparty constraints from master profile
  const cp = COUNTERPARTY_PROFILES[repo.counterparty];
  const resolved: RecommendOptions = {
    coverageRatio:          1.03,
    maxHaircut:             cp?.maxHaircut,
    maxSingleConcentration: cp?.concentrationLimit ?? 0.60,
    ...options,
  };

  let result: AllocationResult;
  try {
    result = collateralAgent.recommend(repo, assets, resolved);
  } catch (err) {
    return failedWorkflow(err instanceof Error ? err.message : String(err), context);
  }

  const agentEvent = createAgentAuditEvent({
    type:         "agent.allocation.completed",
    agentId:      AGENT_ID,
    agentVersion: AGENT_VERSION,
    actor:        context.actor,
    action:       "allocation recommendation generated",
    input: {
      repoId:     repo.id,
      notional:   repo.amount,
      currency:   repo.currency,
      assetCount: assets.length,
    },
    output: {
      summary:  result.summary,
      feasible: result.feasible,
      selected: result.selected.length,
      rejected: result.rejected.length,
      coverage: Number(result.coverageAchieved.toFixed(4)),
    },
    repoId: repo.id,
  });

  const auditEntry: AuditEntry = {
    ts:      ts.slice(0, 16).replace("T", " "),
    user:    context.actor,
    role:    context.role,
    action:  "allocation recommendation",
    object:  repo.id,
    next:    result.feasible ? "feasible" : "infeasible",
    comment: `Agent selected ${result.selected.length} position(s), ${result.rejected.length} rejected. ` +
             `Coverage ${(result.coverageAchieved * 100).toFixed(2)}%. ` +
             (result.feasible ? "Fully covered." : "INSUFFICIENT COLLATERAL — escalate."),
  };

  return {
    payload:      result,
    agentEvents:  [agentEvent],
    auditEntries: [auditEntry],
    warnings:     result.warnings,
    success:      true,
  };
}

// ── approveAllocation ─────────────────────────────────────────────────────────

/**
 * Record a user's approval of an allocation recommendation.
 * Call this when the operations team approves the agent's basket before booking.
 */
export function approveAllocation(
  input:   ApproveAllocationInput,
  context: WorkflowContext,
): WorkflowResult<AllocationResult> {
  const ts = context.ts ?? new Date().toISOString();
  const { repoId, result } = input;

  const agentEvent = createAgentAuditEvent({
    type:         "workflow.allocation.approved",
    agentId:      AGENT_ID,
    agentVersion: AGENT_VERSION,
    actor:        context.actor,
    action:       "allocation approved",
    input:  { repoId },
    output: {
      summary:   result.summary,
      approved:  true,
      positions: result.selected.length,
    },
    repoId,
  });

  const auditEntry: AuditEntry = {
    ts:      ts.slice(0, 16).replace("T", " "),
    user:    context.actor,
    role:    context.role,
    action:  "allocation approved",
    object:  repoId,
    prev:    "recommendation",
    next:    "approved",
    comment: `${context.actor} approved allocation basket: ` +
             `${result.selected.length} position(s), ` +
             `coverage ${(result.coverageAchieved * 100).toFixed(2)}%.`,
  };

  return {
    payload:      result,
    agentEvents:  [agentEvent],
    auditEntries: [auditEntry],
    warnings:     [],
    success:      true,
  };
}
