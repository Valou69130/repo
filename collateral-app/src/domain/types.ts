// ─── Domain — Canonical Application Types ────────────────────────────────────
//
// Authoritative type definitions for the application domain.
// The API layer, domain store, agents (via their app-facing adapters),
// and UI all use these shapes.
//
// Agents have their own internal types (AgentPosition, AgentTrade, etc.).
// They map these externally via their anti-corruption layer.

// ── Core entities ─────────────────────────────────────────────────────────────

/**
 * Integration and settlement context for a domain object.
 * Represents what the platform knows about the external systems it orchestrates.
 */
export interface IntegrationContext {
  /** Which external system originated or last confirmed this record. */
  sourceSystem:    string;   // e.g. "Bloomberg Tradebook" | "SaFIR position feed" | "Murex import"
  /** The ledger or book in which the object lives externally. */
  sourceLedger:    string;   // e.g. "Bloomberg OTC Fixed Income" | "SaFIR custody register"
  /** Settlement confirmation state as last reported by the settlement system. */
  settlementState: "confirmed" | "pending_confirmation" | "pending_settlement" | "failed";
  /** Reconciliation match state between internal ledger and external CSD. */
  reconState:      "matched" | "unmatched" | "pending" | "break_detected";
  /** Primary custody location — identifies the CSD holding the security. */
  custodyLocation: string;   // e.g. "SaFIR / BNR Central Registry" | "Euroclear Bank SA/NV"
  /** ISO timestamp of the last successful sync with the external system. */
  lastSyncTs:      string;
  /** External reference identifier (SWIFT SEME, Bloomberg ticket, Murex deal ID, etc.). */
  externalRef?:    string;
  /** SaFIR instruction reference number, if applicable. */
  safirRef?:       string;
}

export interface Asset {
  id:           string;
  isin:         string;
  name:         string;
  currency:     string;
  marketValue:  number;
  haircut:      number;
  status:       "Available" | "Reserved" | "Locked" | "Pledged";
  eligibility:  string;
  custody:      string;
  type?:        string;
  rating?:      string;
  integration?: IntegrationContext;
}

export interface Repo {
  id:                 string;
  counterparty:       string;
  amount:             number;
  currency:           string;
  rate:               number;
  startDate:          string;
  maturityDate:       string;
  state:              string;
  requiredCollateral: number;
  postedCollateral:   number;
  buffer:             number;
  settlement?:        string;
  notes?:             string;
  assets:             string[];   // IDs of posted collateral assets
  integration?:       IntegrationContext;
}

export interface AuditEntry {
  id?:      string;
  ts:       string;
  user:     string;
  role:     string;
  action:   string;
  object:   string;
  prev?:    string;
  next?:    string;
  comment?: string;
}

export interface Notification {
  id:        string;
  /** Normalised severity used by the new architecture. */
  type?:     "Critical" | "Warning" | "Info";
  /** Legacy field — same values as type, kept for backwards compat. */
  severity?: "Critical" | "Warning" | "Info";
  title?:    string;
  /** Legacy display text */
  text?:     string;
  message?:  string;
  ts?:       string;
  target?:   string;
  read?:     boolean;
}

export interface User {
  name:   string;
  role:   string;
  email?: string;
}

// ── Workflow state ─────────────────────────────────────────────────────────────

/**
 * Seven-state lifecycle for any agent-generated recommendation.
 * Happy path: detected → proposed → under_review → approved → executed
 * Terminal failure states: failed | dismissed
 */
export type WorkflowState =
  | "detected"     // agent identified a condition requiring action
  | "proposed"     // agent has generated a recommendation / proposal
  | "under_review" // operations team is reviewing the proposal
  | "approved"     // treasury / authorised user has approved execution
  | "executed"     // action has been carried out and confirmed
  | "failed"       // execution failed or escalation required
  | "dismissed";   // operator dismissed without action

/**
 * Typed audit record for every workflow state transition.
 * Written to the domain store on each advance; forms an immutable event log.
 */
export interface WorkflowEvent {
  id:         string;
  objectId:   string;   // ID of the action / alert this event belongs to
  objectType: string;   // e.g. "margin-alert", "substitution", "recommendation"
  state:      WorkflowState;
  prevState?: WorkflowState;
  actor:      string;   // user.name at time of transition
  ts:         string;   // ISO 8601
  comment?:   string;
}
