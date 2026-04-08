// ─── Integration Service ──────────────────────────────────────────────────────
// Orchestrator. The ONLY module that calls adapters, enforces domain rules,
// updates state, and publishes final results back through the bus.
// Receives app state via dependency injection (no direct React coupling).
// React hooks subscribe to the service via the subscriber pattern.

import { integrationBus }   from "./core/IntegrationBus.js";
import { EVENT_TYPES }      from "./core/events.js";
import { adapterRegistry }  from "./AdapterRegistry.js";

export function createIntegrationService({ appendAudit, addNotification } = {}) {
  // ── Internal mutable state ──────────────────────────────────────────────────
  let state = {
    events:        [],        // last N integration bus events
    instructions:  [],        // SettlementInstruction[]
    exceptions:    [],        // ExceptionItem[]
    syncHistory:   [],        // SyncRecord[]
    tradeIntakes:  [],        // { ts, payload, result }[]
    adapters:      [],        // AdapterDescriptor + status
  };

  const _subscribers = new Set();

  function _notify() {
    _subscribers.forEach((fn) => {
      try {
        fn({ ...state });
      } catch {
        // Ignore subscriber errors so one broken listener does not break the bus.
      }
    });
  }

  function _patchState(partial) {
    state = { ...state, ...partial };
    _notify();
  }

  // ── Bootstrap adapters ──────────────────────────────────────────────────────
  adapterRegistry.bootstrap();

  // ── Listen to bus wildcard ──────────────────────────────────────────────────
  integrationBus.on("*", (event) => {
    state.events = [event, ...state.events].slice(0, 200);
    _notify();
  }, "integration-service-wildcard");

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Ingest a raw external trade payload.
   * Domain rule: duplicate tradeId is rejected.
   */
  function ingestTrade(rawPayload) {
    const adapter = adapterRegistry.get("mock-trade-intake");
    const { valid, trade, errors } = adapter.ingest(rawPayload);

    const entry = {
      ts:      new Date().toISOString(),
      payload: rawPayload,
      result:  valid ? "accepted" : "rejected",
      errors,
      trade:   trade || null,
    };

    _patchState({ tradeIntakes: [entry, ...state.tradeIntakes].slice(0, 50) });

    if (valid && addNotification) {
      addNotification({
        severity: "Info",
        text:     `Trade ${trade.id} ingested from ${trade.tradeSource} — pending booking`,
        target:   null,
      });
    }

    if (valid && appendAudit) {
      appendAudit({
        ts:      new Date().toISOString().slice(0, 16).replace("T", " "),
        user:    "Integration Bus",
        role:    "system",
        action:  "trade received",
        object:  trade.id,
        comment: `Trade intake via ${trade.tradeSource}: ${trade.counterpartyId} ${trade.amount.toLocaleString()} ${trade.currency} at ${trade.rate}%`,
      });
    }

    return entry;
  }

  /**
   * Generate an MT543 settlement instruction for a repo + asset.
   * Raises a duplicate-check against existing instructions.
   */
  function generateSettlementInstruction(repo, asset) {
    const existing = state.instructions.find(
      (i) => i.repoId === repo.id && i.assetId === asset.id && i.status !== "failed" && i.status !== "cancelled"
    );
    if (existing) return { error: `Instruction ${existing.id} already exists for ${repo.id}/${asset.id}`, existing };

    const adapter  = adapterRegistry.get("mock-settlement");
    const instr    = adapter.generate(repo, asset);

    _patchState({ instructions: [instr, ...state.instructions] });

    if (appendAudit) {
      appendAudit({
        ts:      new Date().toISOString().slice(0, 16).replace("T", " "),
        user:    "Integration Bus",
        role:    "system",
        action:  "settlement instructed",
        object:  repo.id,
        comment: `MT543 generated for ${repo.id} / ${asset.isin} — settlement ${instr.settlementDate}`,
      });
    }

    return { instruction: instr };
  }

  /**
   * Transmit a settlement instruction to the custodian network.
   * simulateFailure = true exercises the rejection path.
   */
  async function transmitInstruction(instructionId, simulateFailure = false) {
    const instr = state.instructions.find((i) => i.id === instructionId);
    if (!instr) return { error: "Instruction not found" };
    if (instr.status === "transmitted" || instr.status === "confirmed") return { error: "Already transmitted" };

    const adapter    = adapterRegistry.get("mock-settlement");
    const transmitted = await adapter.transmit(instr, simulateFailure);

    _patchState({
      instructions: state.instructions.map((i) => i.id === instructionId ? transmitted : i),
    });

    if (transmitted.status === "failed" && addNotification) {
      addNotification({
        severity: "Critical",
        text:     `Settlement instruction ${instructionId} failed: ${transmitted.failureReason}`,
        target:   transmitted.repoId,
      });
    }

    return { instruction: transmitted };
  }

  /**
   * Process an incoming settlement confirmation message.
   */
  function processConfirmation(rawMsg) {
    const adapter = adapterRegistry.get("mock-confirmation");
    const patch   = adapter.process(rawMsg);

    _patchState({
      instructions: state.instructions.map((i) =>
        i.id === patch.id ? { ...i, ...patch } : i
      ),
    });

    if (patch.status === "confirmed" && addNotification) {
      addNotification({ severity: "Info", text: `Settlement confirmed: ${patch.id}`, target: null });
    }

    return patch;
  }

  /**
   * Simulate receiving a confirmation for a given instruction.
   */
  function simulateConfirmation(instructionId, simulateFailure = false) {
    const adapter = adapterRegistry.get("mock-confirmation");
    const patch   = adapter.simulateConfirmation(instructionId, simulateFailure);

    _patchState({
      instructions: state.instructions.map((i) =>
        i.id === patch.id ? { ...i, ...patch } : i
      ),
    });

    return patch;
  }

  /**
   * Run a full position sync against the mock custody feed.
   */
  function syncPositions(currentAssets) {
    const adapter = adapterRegistry.get("mock-position-sync");
    const feed    = adapter.sync(currentAssets);

    if (appendAudit) {
      appendAudit({
        ts:      new Date().toISOString().slice(0, 16).replace("T", " "),
        user:    "Integration Bus",
        role:    "system",
        action:  "collateral released",
        object:  "POSITION-SYNC",
        comment: `Position sync run: ${feed.length} records received from mock custody feed`,
      });
    }

    return feed;
  }

  /**
   * Run reconciliation. Surfaces exceptions, updates state.
   */
  function runReconciliation(currentAssets) {
    const adapter = adapterRegistry.get("mock-reconciliation");
    const { exceptions, syncRecord, externalFeed } = adapter.reconcile(currentAssets);

    // Merge exceptions (don't duplicate by isin+type)
    const merged = [...state.exceptions];
    for (const exc of exceptions) {
      if (!merged.find((e) => e.isin === exc.isin && e.type === exc.type && e.status === "open")) {
        merged.unshift(exc);
      }
    }

    _patchState({
      exceptions:  merged.slice(0, 200),
      syncHistory: [syncRecord, ...state.syncHistory].slice(0, 50),
    });

    if (exceptions.length > 0 && addNotification) {
      addNotification({
        severity: "Warning",
        text:     `Reconciliation completed: ${exceptions.length} break${exceptions.length > 1 ? "s" : ""} detected`,
        target:   null,
      });
    }

    return { exceptions, syncRecord, externalFeed };
  }

  /**
   * Resolve an open exception.
   */
  function resolveException(exceptionId, resolution) {
    _patchState({
      exceptions: state.exceptions.map((e) =>
        e.id === exceptionId ? { ...e, status: "resolved", resolution: resolution || "Manually resolved" } : e
      ),
    });

    if (appendAudit) {
      appendAudit({
        ts:      new Date().toISOString().slice(0, 16).replace("T", " "),
        user:    "Integration Bus",
        role:    "system",
        action:  "collateral released",
        object:  exceptionId,
        comment: `Exception ${exceptionId} resolved: ${resolution}`,
      });
    }

    integrationBus.publish({
      id:      `EVT-RESOLVE-${exceptionId}`,
      type:    EVENT_TYPES.EXCEPTION_RESOLVED,
      payload: { exceptionId, resolution },
      source:  "integration-service",
      ts:      new Date().toISOString(),
    });
  }

  /** Subscribe to state changes. Returns unsubscribe fn. */
  function subscribe(fn) {
    _subscribers.add(fn);
    fn({ ...state }); // immediate call with current state
    return () => _subscribers.delete(fn);
  }

  /** Refresh adapter list in state. */
  function refreshAdapters() {
    _patchState({ adapters: adapterRegistry.list() });
  }

  // Initial adapter list
  refreshAdapters();

  return {
    ingestTrade,
    generateSettlementInstruction,
    transmitInstruction,
    processConfirmation,
    simulateConfirmation,
    syncPositions,
    runReconciliation,
    resolveException,
    subscribe,
    refreshAdapters,
    getState: () => ({ ...state }),
  };
}
