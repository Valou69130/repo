// ─── Domain — Structured Event System ────────────────────────────────────────
//
// Every agent action emits a structured AgentAuditEvent.
// Workflows convert these to AuditEntry objects for the audit trail.
//
// Rule: agents produce structured output objects — never raw strings.
// Rule: side effects (audit, notifications) live in workflows, never in agents.
// Rule: every major agent action MUST generate at least one AgentAuditEvent.

import type { AuditEntry } from "./types";

// ── Event type catalogue ──────────────────────────────────────────────────────

export type AgentEventType =
  | "agent.allocation.completed"
  | "agent.allocation.approved"
  | "agent.margin.scan_completed"
  | "agent.margin.alert_transitioned"
  | "agent.margin.topup_approved"
  | "agent.margin.escalated";

export type WorkflowEventType =
  | "workflow.allocation.requested"
  | "workflow.allocation.approved"
  | "workflow.allocation.rejected"
  | "workflow.margin.scan_requested"
  | "workflow.margin.topup_approved"
  | "workflow.margin.alert_reviewed"
  | "workflow.margin.alert_escalated"
  | "workflow.margin.resolved"
  | "workflow.substitution.executed"
  | "workflow.substitution.proposed";

export type DomainEventType = AgentEventType | WorkflowEventType;

// ── Structured agent audit event ──────────────────────────────────────────────

/**
 * Rich, machine-readable record of an agent decision or workflow action.
 *
 * Always produced by the workflow layer — NEVER by UI components directly.
 * The workflow layer maps these to AuditEntry for storage in the audit trail.
 */
export interface AgentAuditEvent {
  id:           string;
  ts:           string;
  type:         DomainEventType;
  agentId:      string;
  agentVersion: string;
  actor:        string;          // user name or "system"
  action:       string;          // human-readable verb phrase
  input: {
    repoId?:     string;
    alertId?:    string;
    assetCount?: number;
    repoCount?:  number;
    fromState?:  string;
    toState?:    string;
    [key: string]: unknown;
  };
  output: {
    summary:      string;
    feasible?:    boolean;
    alertCount?:  number;
    state?:       string;
    [key: string]: unknown;
  };
  repoId?:  string;
  alertId?: string;
}

// ── Factory ───────────────────────────────────────────────────────────────────

let _seq = 0;

export function createAgentAuditEvent(
  params: Omit<AgentAuditEvent, "id" | "ts">,
): AgentAuditEvent {
  return {
    id: `AAE-${Date.now()}-${(++_seq).toString().padStart(4, "0")}`,
    ts: new Date().toISOString(),
    ...params,
  };
}

/**
 * Convert a structured AgentAuditEvent to a human-readable AuditEntry
 * ready for persistence in the audit trail.
 */
export function toAuditEntry(event: AgentAuditEvent): AuditEntry {
  return {
    ts:      event.ts.slice(0, 16).replace("T", " "),
    user:    event.actor,
    role:    "system",
    action:  event.action,
    object:  event.repoId ?? event.alertId ?? event.agentId,
    prev:    String(event.input.fromState ?? ""),
    next:    String(event.output.state    ?? ""),
    comment: event.output.summary,
  };
}
