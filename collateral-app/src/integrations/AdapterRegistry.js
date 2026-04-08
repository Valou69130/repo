// ─── Adapter Registry ─────────────────────────────────────────────────────────
// Central registry mapping adapter IDs to live instances.
// Future adapters (Bloomberg API, SaFIR REST, Euroclear DLT connector) are
// registered here — the rest of the system stays unchanged.

import { TradeIntakeAdapter }     from "./adapters/mock/TradeIntakeAdapter.js";
import { PositionSyncAdapter }    from "./adapters/mock/PositionSyncAdapter.js";
import { SettlementAdapter }      from "./adapters/mock/SettlementAdapter.js";
import { ConfirmationAdapter }    from "./adapters/mock/ConfirmationAdapter.js";
import { ReconciliationAdapter }  from "./adapters/mock/ReconciliationAdapter.js";

const ADAPTER_DESCRIPTORS = [
  {
    id:          "mock-trade-intake",
    label:       "Trade Intake",
    channel:     "Mock / Manual",
    description: "Simulates Bloomberg TOMS / FIX JSON feed. Swap for a live WebSocket or REST adapter.",
    Factory:     TradeIntakeAdapter,
  },
  {
    id:          "mock-position-sync",
    label:       "Position Sync",
    channel:     "Mock / SaFIR",
    description: "Simulates MT535 custody position feed from BNR SaFIR. Replace with live custodian API.",
    Factory:     PositionSyncAdapter,
  },
  {
    id:          "mock-settlement",
    label:       "Settlement Instructions",
    channel:     "Mock / SaFIR",
    description: "Generates ISO 15022 MT543 DVP instructions. Replace with SaFIR SWIFT gateway adapter.",
    Factory:     SettlementAdapter,
  },
  {
    id:          "mock-confirmation",
    label:       "Confirmation Handling",
    channel:     "Mock / SaFIR",
    description: "Processes MT544/548 confirmations. Replace with custodian notification webhook.",
    Factory:     ConfirmationAdapter,
  },
  {
    id:          "mock-reconciliation",
    label:       "Reconciliation",
    channel:     "Mock / Recon",
    description: "Compares internal positions to custody feed. Replace with dedicated reconciliation engine.",
    Factory:     ReconciliationAdapter,
  },
];

class AdapterRegistry {
  constructor() {
    this._instances = new Map();
    this._descriptors = ADAPTER_DESCRIPTORS;
  }

  /** Instantiate and connect all registered adapters. */
  bootstrap(config = {}) {
    for (const desc of this._descriptors) {
      const instance = new desc.Factory(config[desc.id] || {});
      instance.connect();
      this._instances.set(desc.id, instance);
    }
    return this;
  }

  get(id) {
    const inst = this._instances.get(id);
    if (!inst) throw new Error(`[AdapterRegistry] No adapter registered for "${id}"`);
    return inst;
  }

  /** List all descriptors + live status. */
  list() {
    return this._descriptors.map((d) => ({
      ...d,
      status: this._instances.get(d.id)?.status || "not bootstrapped",
    }));
  }
}

export const adapterRegistry = new AdapterRegistry();
