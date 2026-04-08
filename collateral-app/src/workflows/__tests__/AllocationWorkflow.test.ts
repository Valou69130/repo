import { describe, expect, it } from "vitest";
import { approveAllocation, runAllocation } from "@/workflows/AllocationWorkflow";
import { ASSETS_STANDARD, TRADE_INFEASIBLE, TRADE_OVERNIGHT } from "@/agents/collateral/testData";

const context = {
  actor: "Test Trader",
  role: "Treasury Manager",
  ts: "2026-04-07T09:00:00.000Z",
};

describe("AllocationWorkflow", () => {
  it("returns a feasible allocation for a standard overnight trade", () => {
    const result = runAllocation(
      { repo: TRADE_OVERNIGHT, assets: ASSETS_STANDARD },
      context,
    );

    expect(result.success).toBe(true);
    expect(result.payload.feasible).toBe(true);
    expect(result.payload.selected.length).toBeGreaterThan(0);
    expect(result.auditEntries[0]?.action).toBe("allocation recommendation");
    expect(result.agentEvents[0]?.type).toBe("agent.allocation.completed");
  });

  it("surfaces an infeasible recommendation without throwing", () => {
    const result = runAllocation(
      { repo: TRADE_INFEASIBLE, assets: ASSETS_STANDARD },
      context,
    );

    expect(result.success).toBe(true);
    expect(result.payload.feasible).toBe(false);
    expect(result.payload.rejected.length).toBeGreaterThan(0);
  });

  it("records approval as a separate workflow result", () => {
    const generated = runAllocation(
      { repo: TRADE_OVERNIGHT, assets: ASSETS_STANDARD },
      context,
    );

    const approved = approveAllocation(
      { repoId: TRADE_OVERNIGHT.id, result: generated.payload },
      context,
    );

    expect(approved.success).toBe(true);
    expect(approved.auditEntries[0]?.action).toBe("allocation approved");
    expect(approved.agentEvents[0]?.type).toBe("workflow.allocation.approved");
  });
});
