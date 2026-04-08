// ─── Workflows — Base Types ───────────────────────────────────────────────────
//
// A workflow is a pure function that:
//   1. Accepts typed inputs + WorkflowContext (actor + role)
//   2. Calls one or more agents
//   3. Returns WorkflowResult<T> with:
//        payload       — primary agent output (typed object, never a string)
//        agentEvents   — structured, machine-readable audit events
//        auditEntries  — human-readable entries ready for persistence
//        warnings      — non-blocking issues surfaced to the caller
//        success/error — whether the workflow completed
//
// Workflows are pure: no React, no side effects, no store dispatch.
// The UI hook layer (useWorkflows.ts) handles dispatch + API persistence.

import type { AuditEntry }       from "@/domain/types";
import type { AgentAuditEvent }  from "@/domain/events";

export interface WorkflowResult<T> {
  /** Primary output — a typed structured object from the agent. */
  payload:      T;
  /** Structured, machine-readable agent audit events. */
  agentEvents:  AgentAuditEvent[];
  /** Human-readable audit entries ready to be persisted. */
  auditEntries: AuditEntry[];
  /** Non-blocking issues (e.g. concentration relaxed, partial coverage). */
  warnings:     string[];
  /** true if the workflow ran successfully (even with warnings). */
  success:      boolean;
  /** Error message when success = false. */
  error?:       string;
}

/** Caller identity forwarded to every workflow invocation. */
export interface WorkflowContext {
  /** User display name or "system" for automated runs. */
  actor: string;
  /** User role for audit entries. */
  role:  string;
  /** Optional ISO timestamp override for deterministic tests. */
  ts?:   string;
}

/** Convenience: build a failed workflow result without a payload. */
export function failedWorkflow<T>(
  error:   string,
  context: WorkflowContext,
): WorkflowResult<T> {
  void context;
  return {
    payload:      undefined as unknown as T,
    agentEvents:  [],
    auditEntries: [],
    warnings:     [error],
    success:      false,
    error,
  };
}
