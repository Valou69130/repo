// ─── Domain — Global State Store ─────────────────────────────────────────────
//
// React context + useReducer store.
//
// Key separation: raw domain data (assets, repos, audit, notifications)
// lives alongside — but never inside — agent state (allocation results,
// margin scan results).  Components that only need domain data never
// re-render due to an agent state update, and vice-versa.
//
// Usage:
//   import { DomainProvider }         from "@/domain/store";  // wrap the app
//   import { useDomain, useDispatch } from "@/domain/store";  // read + write
//   import { useAllocationResult }    from "@/domain/store";  // agent slice
//   import { useMarginScan }          from "@/domain/store";  // agent slice

import React, {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
} from "react";
import type { Asset, Repo, AuditEntry, Notification, User, WorkflowEvent } from "./types";
import type { AllocationResult }             from "@/agents/collateral";
import type { MarginScanResult, MarginAlert } from "@/agents/margin";
import { ruleEngineSeed } from "@/data/ruleEngineSeed";

// ── Rule engine types ─────────────────────────────────────────────────────────

export interface RuleEngineCounterparty {
  minCoverageRatio: number;
  maxExposure:      number;
  mta:              number;
}

export interface RuleEngine {
  haircuts:          Record<string, number>;
  eligibility:       Record<string, string[]>;
  counterparties:    Record<string, RuleEngineCounterparty>;
  approvalThreshold: number;
  stressPct:         number;
}

// ── Agent state sub-tree ──────────────────────────────────────────────────────

export interface AgentState {
  allocation: {
    /**
     * Map of booking-session key → AllocationResult.
     * The in-progress booking wizard uses the key "DRAFT".
     * Completed repos use their real repo ID.
     */
    results: Record<string, AllocationResult>;
    pending: Record<string, boolean>;
    errors:  Record<string, string>;
  };
  margin: {
    scanResult: MarginScanResult | null;
    pending:    boolean;
    error:      string | null;
    lastScanAt: number | null;   // real epoch ms of last completed scan
    scanCount:  number;          // total scans run since session start
  };
}

// ── Full domain state ─────────────────────────────────────────────────────────

export interface DomainState {
  user:           User | null;
  assets:         Asset[];
  repos:          Repo[];
  audit:          AuditEntry[];
  notifications:  Notification[];
  workflowEvents: WorkflowEvent[];
  ruleEngine:     RuleEngine;
  /** Agent state — strictly separated from raw domain data. */
  agentState:     AgentState;
  loading:        boolean;
  error:          string | null;
}

const initialState: DomainState = {
  user:           null,
  assets:         [],
  repos:          [],
  audit:          [],
  notifications:  [],
  workflowEvents: [],
  ruleEngine:     ruleEngineSeed as RuleEngine,
  agentState: {
    allocation: { results: {}, pending: {}, errors: {} },
    margin:     { scanResult: null, pending: false, error: null, lastScanAt: null, scanCount: 0 },
  },
  loading: false,
  error:   null,
};

// ── Actions ───────────────────────────────────────────────────────────────────

export type DomainAction =
  // Auth
  | { type: "USER_LOGGED_IN";  payload: User }
  | { type: "USER_LOGGED_OUT" }
  // Data lifecycle
  | { type: "LOAD_STARTED" }
  | { type: "LOAD_SUCCESS"; payload: Pick<DomainState, "assets" | "repos" | "audit" | "notifications" | "ruleEngine"> }
  | { type: "LOAD_FAILED";  payload: string }
  // Repos
  | { type: "REPO_CREATED"; payload: Repo }
  | { type: "REPO_UPDATED"; payload: Repo }
  // Assets
  | { type: "ASSET_UPDATED";   payload: Asset }
  | { type: "ASSETS_REPLACED"; payload: Asset[] }
  // Audit & notifications
  | { type: "AUDIT_APPENDED";         payload: AuditEntry }
  | { type: "NOTIFICATION_ADDED";     payload: Notification }
  | { type: "NOTIFICATION_DISMISSED"; payload: string }
  // Workflow events
  | { type: "WORKFLOW_EVENT_ADDED"; payload: WorkflowEvent }
  // Allocation agent state
  | { type: "ALLOCATION_PENDING";   payload: { key: string } }
  | { type: "ALLOCATION_COMPLETED"; payload: { key: string; result: AllocationResult } }
  | { type: "ALLOCATION_FAILED";    payload: { key: string; error: string } }
  | { type: "ALLOCATION_CLEARED";   payload: { key: string } }
  // Margin agent state
  | { type: "MARGIN_SCAN_PENDING" }
  | { type: "MARGIN_SCAN_COMPLETED"; payload: MarginScanResult }
  | { type: "MARGIN_SCAN_FAILED";    payload: string }
  | { type: "MARGIN_ALERT_UPDATED";  payload: MarginAlert }
  // Rule engine
  | { type: "RULE_ENGINE_UPDATED"; payload: Partial<RuleEngine> };

// ── Reducer ───────────────────────────────────────────────────────────────────

function reducer(state: DomainState, action: DomainAction): DomainState {
  switch (action.type) {

    case "USER_LOGGED_IN":
      return { ...state, user: action.payload };
    case "USER_LOGGED_OUT":
      return { ...initialState };

    case "LOAD_STARTED":
      return { ...state, loading: true, error: null };
    case "LOAD_SUCCESS":
      return { ...state, loading: false, ...action.payload };
    case "LOAD_FAILED":
      return { ...state, loading: false, error: action.payload };

    case "REPO_CREATED":
      return { ...state, repos: [action.payload, ...state.repos] };
    case "REPO_UPDATED":
      return {
        ...state,
        repos: state.repos.map((r) =>
          r.id === action.payload.id ? action.payload : r,
        ),
      };

    case "ASSET_UPDATED":
      return {
        ...state,
        assets: state.assets.map((a) =>
          a.id === action.payload.id ? action.payload : a,
        ),
      };
    case "ASSETS_REPLACED":
      return { ...state, assets: action.payload };

    case "AUDIT_APPENDED":
      return { ...state, audit: [action.payload, ...state.audit] };

    case "WORKFLOW_EVENT_ADDED":
      return { ...state, workflowEvents: [action.payload, ...state.workflowEvents] };

    case "NOTIFICATION_ADDED":
      return { ...state, notifications: [action.payload, ...state.notifications] };
    case "NOTIFICATION_DISMISSED":
      return {
        ...state,
        notifications: state.notifications.filter((n) => n.id !== action.payload),
      };

    // ── Allocation agent ─────────────────────────────────────────────────────
    case "ALLOCATION_PENDING":
      return {
        ...state,
        agentState: {
          ...state.agentState,
          allocation: {
            ...state.agentState.allocation,
            pending: { ...state.agentState.allocation.pending, [action.payload.key]: true },
          },
        },
      };

    case "ALLOCATION_COMPLETED": {
      const { [action.payload.key]: _err, ...restErrors } = state.agentState.allocation.errors;
      return {
        ...state,
        agentState: {
          ...state.agentState,
          allocation: {
            results: { ...state.agentState.allocation.results, [action.payload.key]: action.payload.result },
            pending: { ...state.agentState.allocation.pending, [action.payload.key]: false },
            errors:  restErrors,
          },
        },
      };
    }

    case "ALLOCATION_FAILED":
      return {
        ...state,
        agentState: {
          ...state.agentState,
          allocation: {
            ...state.agentState.allocation,
            pending: { ...state.agentState.allocation.pending, [action.payload.key]: false },
            errors:  { ...state.agentState.allocation.errors,  [action.payload.key]: action.payload.error },
          },
        },
      };

    case "ALLOCATION_CLEARED": {
      const { [action.payload.key]: _r, ...restResults } = state.agentState.allocation.results;
      const { [action.payload.key]: _p, ...restPending } = state.agentState.allocation.pending;
      return {
        ...state,
        agentState: {
          ...state.agentState,
          allocation: { ...state.agentState.allocation, results: restResults, pending: restPending },
        },
      };
    }

    // ── Margin agent ─────────────────────────────────────────────────────────
    case "MARGIN_SCAN_PENDING":
      return {
        ...state,
        agentState: {
          ...state.agentState,
          margin: { ...state.agentState.margin, pending: true, error: null },
        },
      };

    case "MARGIN_SCAN_COMPLETED":
      return {
        ...state,
        agentState: {
          ...state.agentState,
          margin: {
            scanResult: action.payload,
            pending:    false,
            error:      null,
            lastScanAt: Date.now(),
            scanCount:  state.agentState.margin.scanCount + 1,
          },
        },
      };

    case "MARGIN_SCAN_FAILED":
      return {
        ...state,
        agentState: {
          ...state.agentState,
          margin: { ...state.agentState.margin, pending: false, error: action.payload },
        },
      };

    case "MARGIN_ALERT_UPDATED": {
      if (!state.agentState.margin.scanResult) return state;
      return {
        ...state,
        agentState: {
          ...state.agentState,
          margin: {
            ...state.agentState.margin,
            scanResult: {
              ...state.agentState.margin.scanResult,
              alerts: state.agentState.margin.scanResult.alerts.map((a) =>
                a.id === action.payload.id ? action.payload : a,
              ),
            },
          },
        },
      };
    }

    case "RULE_ENGINE_UPDATED":
      return { ...state, ruleEngine: { ...state.ruleEngine, ...action.payload } };

    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

const StateCtx    = createContext<DomainState>(initialState);
const DispatchCtx = createContext<Dispatch<DomainAction>>(() => {});

export function DomainProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>
        {children}
      </DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

// ── Core hooks ────────────────────────────────────────────────────────────────

/** Read the full domain state. Prefer the typed slice hooks below when possible. */
export function useDomain(): DomainState {
  return useContext(StateCtx);
}

/** Dispatch an action to the domain store. */
export function useDispatch(): Dispatch<DomainAction> {
  return useContext(DispatchCtx);
}

// ── Agent slice hooks ─────────────────────────────────────────────────────────

/**
 * Read allocation agent state for a specific session key.
 * The booking wizard uses key "DRAFT"; completed repos use their real repo ID.
 */
export function useAllocationResult(key = "DRAFT"): {
  result:  AllocationResult | null;
  pending: boolean;
  error:   string | null;
} {
  const { agentState } = useDomain();
  return {
    result:  agentState.allocation.results[key] ?? null,
    pending: agentState.allocation.pending[key] ?? false,
    error:   agentState.allocation.errors[key]  ?? null,
  };
}

/** Read margin scan agent state. */
export function useMarginScan(): {
  scanResult: MarginScanResult | null;
  pending:    boolean;
  error:      string | null;
} {
  const { agentState } = useDomain();
  return agentState.margin;
}

/** Read the rule engine configuration. */
export function useRuleEngine(): RuleEngine {
  return useDomain().ruleEngine;
}

/**
 * Read workflow events, optionally filtered to a specific objectId.
 * Returns events in reverse-chronological order (newest first).
 */
export function useWorkflowEvents(objectId?: string): WorkflowEvent[] {
  const { workflowEvents } = useDomain();
  if (!objectId) return workflowEvents;
  return workflowEvents.filter((e) => e.objectId === objectId);
}
