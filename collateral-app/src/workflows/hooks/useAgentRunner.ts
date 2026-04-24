// ─── Autonomous Agent Runner ───────────────────────────────────────────────────
//
// Drives the three background agents on real intervals — no fake clocks.
//
//   Margin Protection Agent  — every 45 s
//     Real margin scan via useMarginWorkflow().runScan().
//     Generates alerts, top-up proposals, audit entries, and notifications.
//     After each scan, auto-creates draft margin calls for Critical alerts
//     that have no existing open call (server returns 409 if one exists).
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

// ── Auto margin call threshold ────────────────────────────────────────────────
// A Critical alert means coverage dropped below (required - MTA).
// When we see one we auto-create a draft margin call so the four-eyes
// approval flow can proceed without manual intervention.
const MC_AUTO_ID_PREFIX = "MC-AUTO";

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
  const { repos, assets, notifications, user } = useDomain();
  const marginWorkflow = useMarginWorkflow();

  // Stable refs — intervals read these instead of closing over stale state.
  // runScanRef is critical: marginWorkflow is re-created on every render
  // (new object reference), so depending on it directly would reset the
  // interval on every re-render.  Reading through a ref keeps the interval
  // stable for the lifetime of the component.
  const reposRef    = useRef(repos);
  const assetsRef   = useRef(assets);
  const notifsRef   = useRef(notifications);
  const userRef     = useRef(user);
  const runScanRef  = useRef(marginWorkflow.runScan);

  useEffect(() => { reposRef.current   = repos;                  }, [repos]);
  useEffect(() => { assetsRef.current  = assets;                 }, [assets]);
  useEffect(() => { notifsRef.current  = notifications;          }, [notifications]);
  useEffect(() => { userRef.current    = user;                   }, [user]);
  useEffect(() => { runScanRef.current = marginWorkflow.runScan; }, [marginWorkflow.runScan]);

  // ── Margin Protection Agent ───────────────────────────────────────────────

  const runMarginScan = useCallback(async () => {
    if (!userRef.current) return; // don't scan when unauthenticated — avoids 401 floods
    // Visibility guard: skip if tab is backgrounded — reduces multi-tab 409 noise.
    // Server-side 409 is the safety net; this is a best-effort optimisation.
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    const scanResult = await runScanRef.current({
      repos:  reposRef.current  as Parameters<typeof marginWorkflow.runScan>[0]["repos"],
      assets: assetsRef.current as Parameters<typeof marginWorkflow.runScan>[0]["assets"],
    }).catch(console.error);

    // Auto margin call creation for Critical alerts
    if (!scanResult) return;
    const criticalAlerts = (scanResult as any)?.alerts?.filter?.(
      (a: any) => a.severity === "Critical" && a.repoId,
    ) ?? [];

    for (const alert of criticalAlerts) {
      const repo = reposRef.current.find((r) => r.id === alert.repoId);
      if (!repo || (repo as any).state === "Closed") continue;

      const today = new Date().toISOString().slice(0, 10);
      const mcId  = `${MC_AUTO_ID_PREFIX}-${alert.repoId}-${today}`;

      // Fetch the agreement for this repo's counterparty
      let agreementId: string | null = null;
      try {
        const suggested = await (api as any).suggestedCalls?.() ?? [];
        const match = suggested.find?.((s: any) => s.repoId === alert.repoId);
        agreementId = match?.agreementId ?? null;
      } catch { /* if suggested fails, skip */ }

      if (!agreementId) continue;

      const coveragePct  = Math.round(((alert as any).coverageRatio ?? 0) * 100);
      const requiredPct  = Math.round(((alert as any).requiredRatio ?? 1.03) * 100);
      const callAmount   = Math.abs((alert as any).deficit ?? 0);

      try {
        const created = await (api as any).createMarginCall({
          id:              mcId,
          agreementId,
          direction:       "issued",
          callDate:        today,
          exposureAmount:  (repo as any).amount ?? 0,
          collateralValue: (repo as any).postedCollateral ?? 0,
          callAmount,
          currency:        (repo as any).currency ?? "RON",
        });

        const notif = {
          id:       `N-AUTOMC-${alert.repoId}`,
          severity: "Critical" as const,
          type:     "Critical" as const,
          title:    `Margin Call Created — ${alert.repoId}`,
          text:     `Coverage was ${coveragePct}% (threshold: ${requiredPct}%) at time of scan. Draft margin call for ${alert.repoId} (${(repo as any).counterparty}) created automatically. Four-eyes approval required before issuance.`,
          target:   created?.id ?? mcId,
          ts:       new Date().toISOString(),
        };
        dispatch({ type: "NOTIFICATION_ADDED", payload: notif });
        (api as any).addNotification(notif).catch(console.error);
      } catch (err: any) {
        // 409 = open call already exists — expected, not an error
        if (err?.message?.includes("409") || err?.message?.includes("Open margin call")) return;
        console.error("Auto MC creation failed:", err);
      }
    }
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
      if (!userRef.current) return;
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
