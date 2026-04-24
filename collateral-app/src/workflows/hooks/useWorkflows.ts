// ─── UI Hooks — Workflow Dispatch ─────────────────────────────────────────────
//
// React hooks that bridge workflow functions ↔ domain store + API persistence.
//
// Pattern for every action:
//   1. Read actor/role from domain store
//   2. Call pure workflow function (returns result + audit artifacts)
//   3. Dispatch result actions to domain store
//   4. Persist audit entries to API
//   5. Surface critical alerts as notifications
//
// Rule: components MUST use these hooks — never call agents or workflows directly.

import { useCallback, useEffect, useRef } from "react";
import { useDomain, useDispatch } from "@/domain/store";
import { runAllocation, approveAllocation } from "@/workflows/AllocationWorkflow";
import { runMarginScan, advanceAlert, approveTopUp } from "@/workflows/MarginWorkflow";
import { api }   from "@/integrations/api";
import type { AppRepo, AppAsset, RecommendOptions, AllocationResult } from "@/agents/collateral";
import type { MarginAlert, MarginAlertState, MarginScanResult, AppMarginRepo, AppMarginAsset } from "@/agents/margin";

// ── Context helper ────────────────────────────────────────────────────────────

function useWorkflowContext() {
  const { user } = useDomain();
  return {
    actor: user?.name ?? "system",
    role:  user?.role ?? "system",
  };
}

// ── Allocation workflow hook ──────────────────────────────────────────────────

export interface AllocationWorkflowActions {
  /**
   * Run the allocation agent for a repo.
   * Results stored under `key` in the domain store (default: "DRAFT").
   */
  runAllocation(params: {
    repo:     AppRepo;
    assets:   AppAsset[];
    options?: RecommendOptions;
    key?:     string;
  }): Promise<AllocationResult | null>;

  /** Record user approval of a recommendation. Clears the store key on success. */
  approveAllocation(params: {
    repoId: string;
    result: AllocationResult;
    key?:   string;
  }): Promise<void>;

  /** Clear a stored allocation result (e.g. when the booking form resets). */
  clearAllocation(key?: string): void;
}

export function useAllocationWorkflow(): AllocationWorkflowActions {
  const dispatch = useDispatch();
  const ctx      = useWorkflowContext();
  const { ruleEngine } = useDomain();

  const runFn = useCallback(async ({
    repo, assets, options, key = "DRAFT",
  }: {
    repo: AppRepo; assets: AppAsset[]; options?: RecommendOptions; key?: string;
  }): Promise<AllocationResult | null> => {
    dispatch({ type: "ALLOCATION_PENDING", payload: { key } });

    const wf = runAllocation({ repo, assets, options, ruleEngine }, ctx);

    if (!wf.success) {
      dispatch({ type: "ALLOCATION_FAILED", payload: { key, error: wf.error ?? "Unknown error" } });
      return null;
    }

    dispatch({ type: "ALLOCATION_COMPLETED", payload: { key, result: wf.payload } });

    for (const entry of wf.auditEntries) {
      dispatch({ type: "AUDIT_APPENDED", payload: entry });
      api.addAudit(entry).catch(console.error);
    }

    return wf.payload;
  }, [dispatch, ctx]);

  const approveFn = useCallback(async ({
    repoId, result, key = "DRAFT",
  }: {
    repoId: string; result: AllocationResult; key?: string;
  }): Promise<void> => {
    const wf = approveAllocation({ repoId, result }, ctx);
    if (!wf.success) return;

    for (const entry of wf.auditEntries) {
      dispatch({ type: "AUDIT_APPENDED", payload: entry });
      api.addAudit(entry).catch(console.error);
    }

    // Clear the draft after approved booking
    dispatch({ type: "ALLOCATION_CLEARED", payload: { key } });
  }, [dispatch, ctx]);

  const clearFn = useCallback((key = "DRAFT") => {
    dispatch({ type: "ALLOCATION_CLEARED", payload: { key } });
  }, [dispatch]);

  return {
    runAllocation:   runFn,
    approveAllocation: approveFn,
    clearAllocation: clearFn,
  };
}

// ── Margin workflow hook ──────────────────────────────────────────────────────

export interface MarginWorkflowActions {
  /** Run a full margin scan and store the result globally. Returns the scan result for callers that need it (e.g. auto-MC). */
  runScan(params: { repos: AppRepo[]; assets: AppAsset[] }): Promise<MarginScanResult | null>;
  /** Advance an alert's lifecycle state. */
  advanceAlert(params: { alert: MarginAlert; newState: MarginAlertState }): Promise<MarginAlert | null>;
  /** Approve a top-up proposal (reviewed → approved). */
  approveTopUp(params: {
    alert:    MarginAlert;
    proposal: NonNullable<MarginAlert["proposal"]>;
  }): Promise<MarginAlert | null>;
}

export function useMarginWorkflow(): MarginWorkflowActions {
  const dispatch = useDispatch();
  const ctx      = useWorkflowContext();
  const { ruleEngine, notifications } = useDomain();

  // Stable ref so runScanFn always sees the latest notifications without
  // needing to declare them as a useCallback dep (which would cause frequent
  // function recreation and interval restarts in useAgentRunner).
  const notificationsRef = useRef(notifications);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);

  const runScanFn = useCallback(async ({
    repos, assets,
  }: { repos: AppRepo[]; assets: AppAsset[] }): Promise<MarginScanResult | null> => {
    dispatch({ type: "MARGIN_SCAN_PENDING" });

    const mtaMap = ruleEngine  // ruleEngine in deps — stale closure fix
      ? Object.fromEntries(
          Object.entries(ruleEngine.counterparties).map(([cp, v]) => [cp, v.mta])
        )
      : undefined;

    const wf = runMarginScan(
      { repos: repos as AppMarginRepo[], assets: assets as AppMarginAsset[], mtaMap },
      ctx,
    );

    if (!wf.success) {
      dispatch({ type: "MARGIN_SCAN_FAILED", payload: wf.error ?? "Scan failed" });
      return null;
    }

    dispatch({ type: "MARGIN_SCAN_COMPLETED", payload: wf.payload });

    for (const entry of wf.auditEntries) {
      dispatch({ type: "AUDIT_APPENDED", payload: entry });
      api.addAudit(entry).catch(console.error);
    }

    // Surface Critical/Warning alerts as notifications.
    // IDs are stable (no Date.now()) — deduplication checks the live
    // notifications ref so each alert fires at most once per session.
    const existingIds = new Set(notificationsRef.current.map((n) => n.id));
    for (const alert of wf.payload.alerts) {
      if (alert.severity === "Critical" || alert.severity === "Warning") {
        const id = `N-MA-${alert.id}`;
        if (existingIds.has(id)) continue;
        existingIds.add(id);
        const notif = {
          id,
          severity: alert.severity as "Critical" | "Warning",
          type:     alert.severity as "Critical" | "Warning",
          text:     `Margin ${alert.severity}: ${alert.position.repoId} — ${alert.explanation[0] ?? ""}`,
          title:    `Margin ${alert.severity}: ${alert.position.repoId}`,
          target:   alert.position.repoId,
          ts:       new Date().toISOString(),
        };
        dispatch({ type: "NOTIFICATION_ADDED", payload: notif });
        api.addNotification(notif).catch(console.error);
      }
    }

    return wf.payload;
  }, [dispatch, ctx, ruleEngine]);

  const advanceFn = useCallback(async ({
    alert, newState,
  }: { alert: MarginAlert; newState: MarginAlertState }): Promise<MarginAlert | null> => {
    const wf = advanceAlert({ alert, newState }, ctx);
    if (!wf.success) {
      console.error("[MarginWorkflow] advanceAlert failed:", wf.error);
      return null;
    }

    dispatch({ type: "MARGIN_ALERT_UPDATED", payload: wf.payload });

    for (const entry of wf.auditEntries) {
      dispatch({ type: "AUDIT_APPENDED", payload: entry });
      api.addAudit(entry).catch(console.error);
    }

    return wf.payload;
  }, [dispatch, ctx]);

  const approveFn = useCallback(async ({
    alert, proposal,
  }: { alert: MarginAlert; proposal: NonNullable<MarginAlert["proposal"]> }): Promise<MarginAlert | null> => {
    const wf = approveTopUp({ alert, proposal }, ctx);
    if (!wf.success) {
      console.error("[MarginWorkflow] approveTopUp failed:", wf.error);
      return null;
    }

    dispatch({ type: "MARGIN_ALERT_UPDATED", payload: wf.payload });

    for (const entry of wf.auditEntries) {
      dispatch({ type: "AUDIT_APPENDED", payload: entry });
      api.addAudit(entry).catch(console.error);
    }

    return wf.payload;
  }, [dispatch, ctx]);

  return {
    runScan:      runScanFn,
    advanceAlert: advanceFn,
    approveTopUp: approveFn,
  };
}

// ── Substitution workflow hook ────────────────────────────────────────────────

import {
  analyzeSubstitution,
  executeSubstitution,
  recordSubstitutionProposal,
} from "@/workflows/SubstitutionWorkflow";
import type {
  SubstitutionAnalysis,
  SubstitutionExecution,
  AnalyzeSubstitutionInput,
} from "@/workflows/SubstitutionWorkflow";
import type { Repo, Asset } from "@/domain/types";

export type { SubstitutionAnalysis, SubstitutionExecution };

export interface SubstitutionWorkflowActions {
  /** Pure analysis — no side effects, no dispatch. Call freely. */
  analyze(input: AnalyzeSubstitutionInput): SubstitutionAnalysis;

  /** Execute: dispatch store updates + persist audit + notify. */
  execute(params: {
    repo:     Repo;
    outAsset: Asset;
    inAsset:  Asset;
    analysis: SubstitutionAnalysis;
  }): Promise<SubstitutionExecution | null>;

  /** Propose (4-eye): only records audit trail, no state change. */
  propose(params: {
    repo:     Repo;
    outAsset: Asset;
    inAsset:  Asset;
    analysis: SubstitutionAnalysis;
    onProposed?: (repoId: string, outId: string, inId: string) => void;
  }): Promise<void>;
}

export function useSubstitutionWorkflow(): SubstitutionWorkflowActions {
  const dispatch = useDispatch();
  const ctx      = useWorkflowContext();

  const analyzeFn = (input: AnalyzeSubstitutionInput): SubstitutionAnalysis => {
    return analyzeSubstitution(input);
  };

  const executeFn = useCallback(async ({
    repo, outAsset, inAsset, analysis,
  }: {
    repo: Repo; outAsset: Asset; inAsset: Asset; analysis: SubstitutionAnalysis;
  }): Promise<SubstitutionExecution | null> => {
    const wf = executeSubstitution({ repo, outAsset, inAsset, analysis }, ctx);

    if (!wf.success) {
      console.error("[SubstitutionWorkflow] execute failed:", wf.error);
      return null;
    }

    const { updatedRepo, releasedAsset, allocatedAsset } = wf.payload;

    // Update domain store
    dispatch({ type: "REPO_UPDATED",  payload: updatedRepo   });
    dispatch({ type: "ASSET_UPDATED", payload: releasedAsset  });
    dispatch({ type: "ASSET_UPDATED", payload: allocatedAsset });

    // Persist audit entries
    for (const entry of wf.auditEntries) {
      dispatch({ type: "AUDIT_APPENDED", payload: entry });
      api.addAudit(entry).catch(console.error);
    }

    // Notification if repo state changed or warnings exist
    if (updatedRepo.state === "Margin deficit") {
      const notif = {
        id:       `N-SUB-${repo.id}-${Date.now()}`,
        severity: "Warning" as const,
        type:     "Warning" as const,
        title:    `Substitution on ${repo.id} — margin deficit`,
        text:     `Collateral substitution on ${repo.id} resulted in margin deficit. Buffer: ${updatedRepo.buffer.toLocaleString()} ${repo.currency}.`,
        target:   repo.id,
        ts:       new Date().toISOString(),
      };
      dispatch({ type: "NOTIFICATION_ADDED", payload: notif });
      api.addNotification(notif).catch(console.error);
    } else if (updatedRepo.state !== repo.state) {
      const notif = {
        id:       `N-SUB-${repo.id}-${Date.now()}`,
        severity: "Info" as const,
        type:     "Info" as const,
        title:    `Substitution executed — ${repo.id}`,
        text:     `${outAsset.name} replaced by ${inAsset.name} on ${repo.id}. Coverage: ${(analysis.after.coverageRatio * 100).toFixed(1)}%.`,
        target:   repo.id,
        ts:       new Date().toISOString(),
      };
      dispatch({ type: "NOTIFICATION_ADDED", payload: notif });
      api.addNotification(notif).catch(console.error);
    }

    return wf.payload;
  }, [dispatch, ctx]);

  const proposeFn = useCallback(async ({
    repo, outAsset, inAsset, analysis, onProposed,
  }: {
    repo: Repo; outAsset: Asset; inAsset: Asset; analysis: SubstitutionAnalysis;
    onProposed?: (repoId: string, outId: string, inId: string) => void;
  }): Promise<void> => {
    const wf = recordSubstitutionProposal(
      { repo, outAsset, inAsset, analysis },
      ctx,
    );
    if (!wf.success) return;

    for (const entry of wf.auditEntries) {
      dispatch({ type: "AUDIT_APPENDED", payload: entry });
      api.addAudit(entry).catch(console.error);
    }

    const notif = {
      id:       `N-PROP-${repo.id}-${Date.now()}`,
      severity: "Warning" as const,
      type:     "Warning" as const,
      title:    `Substitution proposed — ${repo.id}`,
      text:     `${ctx.actor} proposed substitution: ${outAsset.name} → ${inAsset.name} on ${repo.id}. Awaiting 4-eye approval.`,
      target:   repo.id,
      ts:       new Date().toISOString(),
    };
    dispatch({ type: "NOTIFICATION_ADDED", payload: notif });
    api.addNotification(notif).catch(console.error);

    onProposed?.(repo.id, outAsset.id, inAsset.id);
  }, [dispatch, ctx]);

  return {
    analyze: analyzeFn,
    execute: executeFn,
    propose: proposeFn,
  };
}
