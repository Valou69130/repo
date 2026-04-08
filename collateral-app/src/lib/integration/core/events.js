// ─── Integration Event Types ────────────────────────────────────────────────
// All integration actions emit one of these typed events via IntegrationBus.
// Do not add business logic here — pure constants + factory only.

export const EVENT_TYPES = {
  // Trade intake pipeline
  TRADE_RECEIVED:           "TRADE_RECEIVED",
  TRADE_VALIDATED:          "TRADE_VALIDATED",
  TRADE_REJECTED:           "TRADE_REJECTED",
  TRADE_BOOKED:             "TRADE_BOOKED",

  // Position synchronisation
  POSITION_SYNC_STARTED:    "POSITION_SYNC_STARTED",
  POSITION_SYNCED:          "POSITION_SYNCED",
  POSITION_BREAK_DETECTED:  "POSITION_BREAK_DETECTED",

  // Settlement lifecycle
  SETTLEMENT_INSTRUCTED:    "SETTLEMENT_INSTRUCTED",
  SETTLEMENT_TRANSMITTED:   "SETTLEMENT_TRANSMITTED",
  SETTLEMENT_CONFIRMED:     "SETTLEMENT_CONFIRMED",
  SETTLEMENT_FAILED:        "SETTLEMENT_FAILED",
  SETTLEMENT_CANCELLED:     "SETTLEMENT_CANCELLED",

  // Confirmation handling
  CONFIRMATION_RECEIVED:    "CONFIRMATION_RECEIVED",

  // Reconciliation
  RECONCILIATION_STARTED:   "RECONCILIATION_STARTED",
  RECONCILIATION_COMPLETED: "RECONCILIATION_COMPLETED",
  EXCEPTION_RAISED:         "EXCEPTION_RAISED",
  EXCEPTION_RESOLVED:       "EXCEPTION_RESOLVED",

  // Adapter infrastructure
  ADAPTER_CONNECTED:        "ADAPTER_CONNECTED",
  ADAPTER_DISCONNECTED:     "ADAPTER_DISCONNECTED",
  ADAPTER_ERROR:            "ADAPTER_ERROR",
};

let _seq = 0;

/**
 * createEvent — produce a canonical integration event envelope.
 * @param {string} type     — one of EVENT_TYPES
 * @param {object} payload  — event-specific data
 * @param {string} source   — adapter id / channel that produced the event
 */
export function createEvent(type, payload, source = "system") {
  _seq += 1;
  return {
    id:        `EVT-${String(_seq).padStart(5, "0")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    type,
    payload,
    source,
    ts:        new Date().toISOString(),
  };
}
