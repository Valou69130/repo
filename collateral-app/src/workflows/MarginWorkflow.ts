// ─── Margin Workflow ──────────────────────────────────────────────────────────
//
// Orchestrates the Margin Protection Agent with full audit trail generation.
//
// runMarginScan()  — full scan + per-Critical audit entries + notifications
// advanceAlert()   — lifecycle transition + structured audit event
// approveTopUp()   — approval-specific enriched audit record
//
// Pure functions — no React, no store access, no side effects.

import { marginAgent }           from "@/agents/margin";
import type {
  AppMarginRepo, AppMarginAsset,
  MarginAlert, MarginAlertState, MarginScanResult,
} from "@/agents/margin";
import { createAgentAuditEvent } from "@/domain/events";
import type { AuditEntry }       from "@/domain/types";
import type { WorkflowResult, WorkflowContext } from "./types";
import { failedWorkflow }        from "./types";

const AGENT_ID      = "margin";
const AGENT_VERSION = "1.0.0";

// ── Input types ───────────────────────────────────────────────────────────────

export interface RunMarginScanInput {
  repos:   AppMarginRepo[];
  assets:  AppMarginAsset[];
  mtaMap?: Record<string, number>;
}

export interface AdvanceAlertInput {
  alert:    MarginAlert;
  newState: MarginAlertState;
}

// ── runMarginScan ─────────────────────────────────────────────────────────────

/**
 * Run a full margin scan across all active repos.
 *
 * Emits:
 *   - One aggregate scan AgentAuditEvent
 *   - Individual AuditEntry records for every Critical and Warning alert
 *
 * Returns the complete MarginScanResult plus audit artifacts.
 */
export function runMarginScan(
  input:   RunMarginScanInput,
  context: WorkflowContext,
): WorkflowResult<MarginScanResult> {
  const ts = context.ts ?? new Date().toISOString();

  let result: MarginScanResult;
  try {
    result = marginAgent.scan(input.repos, input.assets, { mtaMap: input.mtaMap });
  } catch (err) {
    return failedWorkflow(err instanceof Error ? err.message : String(err), context);
  }

  const agentEvent = createAgentAuditEvent({
    type:         "agent.margin.scan_completed",
    agentId:      AGENT_ID,
    agentVersion: AGENT_VERSION,
    actor:        context.actor,
    action:       "margin scan",
    input: {
      repoCount:  input.repos.filter((r) => r.state !== "Closed").length,
      assetCount: input.assets.length,
    },
    output: {
      summary:       `${result.alertCount} alert(s): ${result.criticalCount} Critical, ${result.warningCount} Warning, ${result.watchCount} Watch.`,
      alertCount:    result.alertCount,
      criticalCount: result.criticalCount,
      warningCount:  result.warningCount,
      watchCount:    result.watchCount,
    },
  });

  const scanEntry: AuditEntry = {
    ts:      ts.slice(0, 16).replace("T", " "),
    user:    context.actor,
    role:    context.role,
    action:  "margin scan",
    object:  "MARGIN-MONITOR",
    comment: `Scanned ${result.totalActive} active repos. ` +
             `${result.alertCount} alert(s): ` +
             `${result.criticalCount} Critical, ${result.warningCount} Warning, ${result.watchCount} Watch.`,
  };

  // Per-alert audit entries for Critical and Warning alerts
  const alertEntries: AuditEntry[] = result.alerts
    .filter((a) => a.severity === "Critical" || a.severity === "Warning")
    .map((a) => ({
      ts:      ts.slice(0, 16).replace("T", " "),
      user:    "margin-agent",
      role:    "system",
      action:  "margin alert triggered",
      object:  a.position.repoId,
      next:    a.state,
      comment: `[${a.severity}] ${a.explanation[0] ?? ""} ` +
               (a.proposal
                 ? `Proposal: ${a.proposal.summary}`
                 : "No eligible collateral — escalated."),
    }));

  const warnings = result.alerts
    .filter((a) => a.state === "escalated")
    .map((a) => `Alert ${a.id} escalated — no eligible collateral for ${a.position.repoId}.`);

  return {
    payload:      result,
    agentEvents:  [agentEvent],
    auditEntries: [scanEntry, ...alertEntries],
    warnings,
    success:      true,
  };
}

// ── advanceAlert ──────────────────────────────────────────────────────────────

/**
 * Transition a margin alert through its lifecycle state machine.
 * Validates the transition via the agent and generates a structured audit event.
 */
export function advanceAlert(
  input:   AdvanceAlertInput,
  context: WorkflowContext,
): WorkflowResult<MarginAlert> {
  const ts = context.ts ?? new Date().toISOString();
  const { alert, newState } = input;

  let updated: MarginAlert;
  try {
    updated = marginAgent.updateAlertState(alert, newState, ts);
  } catch (err) {
    return failedWorkflow(err instanceof Error ? err.message : String(err), context);
  }

  const actionLabel: Partial<Record<MarginAlertState, string>> = {
    reviewed:  "margin alert reviewed",
    approved:  "margin top-up approved",
    resolved:  "margin call resolved",
    escalated: "margin alert escalated",
  };
  const action = actionLabel[newState] ?? `margin alert → ${newState}`;

  const agentEvent = createAgentAuditEvent({
    type: newState === "approved"  ? "agent.margin.topup_approved"
        : newState === "escalated" ? "agent.margin.escalated"
        :                           "agent.margin.alert_transitioned",
    agentId:      AGENT_ID,
    agentVersion: AGENT_VERSION,
    actor:        context.actor,
    action,
    input: {
      alertId:   alert.id,
      repoId:    alert.position.repoId,
      fromState: alert.state,
      toState:   newState,
    },
    output: {
      summary:   `Alert ${alert.id}: "${alert.state}" → "${newState}".`,
      state:     newState,
    },
    repoId:  alert.position.repoId,
    alertId: alert.id,
  });

  const auditEntry: AuditEntry = {
    ts:      ts.slice(0, 16).replace("T", " "),
    user:    context.actor,
    role:    context.role,
    action,
    object:  alert.position.repoId,
    prev:    alert.state,
    next:    newState,
    comment: `Margin alert ${alert.id} (${alert.position.counterparty}): ` +
             `${alert.state} → ${newState}. ` +
             (alert.proposal ? `Top-up: ${alert.proposal.summary}` : "No top-up proposal."),
  };

  return {
    payload:      updated,
    agentEvents:  [agentEvent],
    auditEntries: [auditEntry],
    warnings:     [],
    success:      true,
  };
}

// ── approveTopUp ──────────────────────────────────────────────────────────────

/**
 * Approve a top-up proposal (reviewed → approved).
 * Generates a richer audit entry capturing the proposal value and expected coverage.
 */
export function approveTopUp(
  input:   AdvanceAlertInput & { proposal: NonNullable<MarginAlert["proposal"]> },
  context: WorkflowContext,
): WorkflowResult<MarginAlert> {
  const base = advanceAlert({ alert: input.alert, newState: "approved" }, context);
  if (!base.success) return base;

  const ts  = context.ts ?? new Date().toISOString();
  const { proposal, alert } = input;
  const ccy = alert.position.currency;
  const fmt = (n: number) =>
    `${ccy} ${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

  const approvalEntry: AuditEntry = {
    ts:      ts.slice(0, 16).replace("T", " "),
    user:    context.actor,
    role:    context.role,
    action:  "collateral top-up approved",
    object:  alert.position.repoId,
    comment: `Approved top-up: ${proposal.positions.length} position(s), ` +
             `${fmt(proposal.totalProposedValue)} adjusted value. ` +
             `Expected coverage after delivery: ${(proposal.expectedCoverage * 100).toFixed(2)}%. ` +
             (proposal.shortfallCovered ? "Fully covered." : "Partial — escalation may be required."),
  };

  return {
    ...base,
    auditEntries: [...base.auditEntries, approvalEntry],
  };
}
