// ─── useIntegration React Hook ────────────────────────────────────────────────
// Bridges IntegrationService to React state. Instantiated once in App.jsx and
// passed down (or through context) to the IntegrationHub page.

import { useState, useEffect, useRef, useCallback } from "react";
import { createIntegrationService } from "@/lib/integration/IntegrationService";

/**
 * @param {{ appendAudit, addNotification }} deps — injected from App
 */
export function useIntegration({ appendAudit, addNotification }) {
  const serviceRef = useRef(null);
  const [integrationState, setIntegrationState] = useState({
    events:       [],
    instructions: [],
    exceptions:   [],
    syncHistory:  [],
    tradeIntakes: [],
    adapters:     [],
  });

  // Create the service once
  useEffect(() => {
    serviceRef.current = createIntegrationService({ appendAudit, addNotification });
    const unsub = serviceRef.current.subscribe(setIntegrationState);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable action wrappers
  const ingestTrade = useCallback((payload) => serviceRef.current?.ingestTrade(payload), []);
  const generateSettlementInstruction = useCallback((repo, asset) =>
    serviceRef.current?.generateSettlementInstruction(repo, asset), []);
  const transmitInstruction = useCallback((id, fail) =>
    serviceRef.current?.transmitInstruction(id, fail), []);
  const simulateConfirmation = useCallback((id, fail) =>
    serviceRef.current?.simulateConfirmation(id, fail), []);
  const syncPositions = useCallback((assets) =>
    serviceRef.current?.syncPositions(assets), []);
  const runReconciliation = useCallback((assets) =>
    serviceRef.current?.runReconciliation(assets), []);
  const resolveException = useCallback((id, resolution) =>
    serviceRef.current?.resolveException(id, resolution), []);

  return {
    ...integrationState,
    ingestTrade,
    generateSettlementInstruction,
    transmitInstruction,
    simulateConfirmation,
    syncPositions,
    runReconciliation,
    resolveException,
  };
}
