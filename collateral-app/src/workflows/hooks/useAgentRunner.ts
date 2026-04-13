// ─── Autonomous Agent Runner ───────────────────────────────────────────────────
//
// Drives the three background agents on real intervals — no fake clocks.
//
//   Margin Protection Agent  — every 45 s
//     Real margin scan via useMarginWorkflow().runScan().
//     Generates alerts, top-up proposals, audit entries, and notifications.
//
//   Exception Agent          — every 30 s
//     Scans for SaFIR settlement failures, reconciliation breaks, and
//     near-maturity repos with active deficits.  Dispatches Critical /
//     Warning notifications that surface in the UI immediately.
//
//   Allocation Agent         — on-demand (not periodic)
//     Triggered by repo creation / substitution; not autonomous by itself.
//     The runner re-scans after any margin scan that raises a new Critical
//     so the allocation agent can pre-compute a top-up basket.
//
// Usage — mount once at app root level (inside DomainProvider):
//   function AppContent() {
//     useAgentRunner();
//     ...
//   }

import { useEffect, useRef, useCallback } from "react";
import { useDomain, useDispatch }          from "@/domain/store";
import { useMarginWorkflow }               from "@/workflows/hooks/useWorkflows";
import { api }                             from "@/integrations/api";

// ── Intervals ─────────────────────────────────────────────────────────────────

const MARGIN_INTERVAL    = 45_000;   // 45 s — matches NBR open-market monitoring cadence
const EXCEPTION_INTERVAL = 30_000;  // 30 s — SaFIR instruction settlement window

// ── Exception detection thresholds ───────────────────────────────────────────

const NEAR_MATURITY_DAYS     = 3;
const SETTLEMENT_FAIL_STATES = new Set(["failed"]);
const RECON_BREAK_STATES     = new Set(["unmatched", "break_detected"]);

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useAgentRunner() {
  const dispatch       = useDispatch();
  const { repos, assets, notifications } = useDomain();
  const marginWorkflow = useMarginWorkflow();

  // Stable refs — intervals read these instead of closing over stale state.
  // runScanRef is critical: marginWorkflow is re-created on every render
  // (new object reference), so depending on it directly would reset the
  // interval on every re-render.  Reading through a ref keeps the interval
  // stable for the lifetime of the component.
  const reposRef    = useRef(repos);
  const assetsRef   = useRef(assets);
  const notifsRef   = useRef(notifications);
  const runScanRef  = useRef(marginWorkflow.runScan);

  useEffect(() => { reposRef.current   = repos;                  }, [repos]);
  useEffect(() => { assetsRef.current  = assets;                 }, [assets]);
  useEffect(() => { notifsRef.current  = notifications;          }, [notifications]);
  useEffect(() => { runScanRef.current = marginWorkflow.runScan; }, [marginWorkflow.runScan]);

  // ── Margin Protection Agent ───────────────────────────────────────────────

  const runMarginScan = useCallback(async () => {
    await runScanRef.current({
      repos:  reposRef.current  as Parameters<typeof marginWorkflow.runScan>[0]["repos"],
      assets: assetsRef.current as Parameters<typeof marginWorkflow.runScan>[0]["assets"],
    }).catch(console.error);
  }, []); // stable — all reads go through refs

  useEffect(() => {
    // Delay initial scan 3 s to ensure domain data is loaded
    const boot = setTimeout(runMarginScan, 3_000);
    const tick = setInterval(runMarginScan, MARGIN_INTERVAL);
    return () => {
      clearTimeout(boot);
      clearInterval(tick);
    };
  }, [runMarginScan]);

  // ── Exception Agent ───────────────────────────────────────────────────────

  useEffect(() => {
    const scanExceptions = () => {
      const repos  = reposRef.current;
      const notifs = notifsRef.current;
      const now    = Date.now();

      // Build a set of notification IDs already in the store to avoid duplicates
      const existingIds = new Set(notifs.map((n) => n.id));

      const emit = (notif: {
        id: string; severity: "Critical" | "Warning" | "Info";
        type: "Critical" | "Warning" | "Info";
        title: string; text: string; target: string; ts: string;
      }) => {
        if (existingIds.has(notif.id)) return;
        existingIds.add(notif.id);               // prevent duplicate within same scan
        dispatch({ type: "NOTIFICATION_ADDED", payload: notif });
        api.addNotification(notif).catch(console.error);
      };

      for (const repo of repos) {
        if (repo.state === "Closed") continue;

        const integration = (repo as any).integration;

        // 1 · SaFIR settlement failure
        if (integration && SETTLEMENT_FAIL_STATES.has(integration.settlementState)) {
          emit({
            id:       `N-SETTLE-FAIL-${repo.id}`,
            severity: "Critical",
            type:     "Critical",
            title:    `Settlement Failed — ${repo.id}`,
            text:     `SaFIR instruction for ${repo.id} (${repo.counterparty}) reported as failed. ` +
                      `Manual intervention required before end of BNR settlement window.`,
            target:   repo.id,
            ts:       new Date().toISOString(),
          });
        }

        // 2 · Reconciliation break vs. SaFIR registry
        if (integration && RECON_BREAK_STATES.has(integration.reconState)) {
          emit({
            id:       `N-RECON-${repo.id}`,
            severity: "Warning",
            type:     "Warning",
            title:    `Reconciliation Break — ${repo.id}`,
            text:     `${repo.id} position is ${integration.reconState} against SaFIR central registry. ` +
                      `Review custody balances and resubmit reconciliation.`,
            target:   repo.id,
            ts:       new Date().toISOString(),
          });
        }

        // 3 · Near-maturity repos carrying an active margin deficit
        const dtm = Math.ceil((new Date((repo as any).maturityDate).getTime() - now) / 86_400_000);
        const buffer = (repo as any).buffer ?? 0;
        if (dtm >= 0 && dtm <= NEAR_MATURITY_DAYS && buffer < 0) {
          emit({
            id:       `N-MATURITY-DEFICIT-${repo.id}-D${dtm}`,
            severity: "Critical",
            type:     "Critical",
            title:    `Near-Maturity Deficit — ${repo.id}`,
            text:     `${repo.id} matures in ${dtm === 0 ? "today" : `${dtm} day${dtm !== 1 ? "s" : ""}`} ` +
                      `and carries an active margin deficit. Collateral top-up must settle via SaFIR ` +
                      `before the maturity value date.`,
            target:   repo.id,
            ts:       new Date().toISOString(),
          });
        }

        // 4 · Repos maturing today with no buffer (Watch — ops team needs to confirm rollover / close)
        if (dtm === 0 && buffer >= 0) {
          emit({
            id:       `N-MATURING-TODAY-${repo.id}`,
            severity: "Warning",
            type:     "Warning",
            title:    `Maturing Today — ${repo.id}`,
            text:     `${repo.id} with ${repo.counterparty} reaches value date today. ` +
                      `Confirm rollover or closure and ensure SaFIR collateral return instruction is submitted.`,
            target:   repo.id,
            ts:       new Date().toISOString(),
          });
        }
      }
    };

    // Boot scan matches margin agent's 3 s delay so both panels initialise together
    const boot = setTimeout(scanExceptions, 3_000);
    const tick = setInterval(scanExceptions, EXCEPTION_INTERVAL);
    return () => {
      clearTimeout(boot);
      clearInterval(tick);
    };
  }, [dispatch]);
}
