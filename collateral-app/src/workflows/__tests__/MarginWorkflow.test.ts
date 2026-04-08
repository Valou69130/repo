import { describe, expect, it } from "vitest";
import { approveTopUp, advanceAlert, runMarginScan } from "@/workflows/MarginWorkflow";
import { ASSETS_RON, REPO_CRITICAL, REPO_WARNING } from "@/agents/margin/testData";

const context = {
  actor: "Risk Reviewer",
  role: "Risk Reviewer",
  ts: "2026-04-07T09:00:00.000Z",
};

describe("MarginWorkflow", () => {
  it("produces alerts and audit output for under-collateralised repos", () => {
    const result = runMarginScan(
      { repos: [REPO_CRITICAL, REPO_WARNING], assets: ASSETS_RON },
      context,
    );

    expect(result.success).toBe(true);
    expect(result.payload.alertCount).toBeGreaterThan(0);
    expect(result.payload.criticalCount).toBeGreaterThanOrEqual(1);
    expect(result.auditEntries[0]?.action).toBe("margin scan");
    expect(result.agentEvents[0]?.type).toBe("agent.margin.scan_completed");
  });

  it("advances an alert through review state", () => {
    const scan = runMarginScan(
      { repos: [REPO_CRITICAL], assets: ASSETS_RON },
      context,
    );
    const alert = scan.payload.alerts[0];

    const reviewed = advanceAlert(
      { alert, newState: "reviewed" },
      context,
    );

    expect(reviewed.success).toBe(true);
    expect(reviewed.payload.state).toBe("reviewed");
    expect(reviewed.auditEntries[0]?.next).toBe("reviewed");
  });

  it("captures approval-specific audit detail for a proposed top-up", () => {
    const scan = runMarginScan(
      { repos: [REPO_CRITICAL], assets: ASSETS_RON },
      context,
    );
    const proposed = scan.payload.alerts.find((alert) => alert.proposal);

    expect(proposed?.proposal).toBeTruthy();

    const reviewed = advanceAlert(
      { alert: proposed!, newState: "reviewed" },
      context,
    );
    const approved = approveTopUp(
      { alert: reviewed.payload, proposal: reviewed.payload.proposal! },
      context,
    );

    expect(approved.success).toBe(true);
    expect(approved.payload.state).toBe("approved");
    expect(approved.auditEntries.some((entry) => entry.action === "collateral top-up approved")).toBe(true);
  });
});
