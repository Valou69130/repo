import { describe, expect, it } from "vitest";
import { analyzeSubstitution, executeSubstitution, recordSubstitutionProposal } from "@/workflows/SubstitutionWorkflow";
import type { Asset, Repo } from "@/domain/types";

const context = {
  actor: "Collateral Manager",
  role: "Collateral Manager",
  ts: "2026-04-07T09:00:00.000Z",
};

const outgoingAsset: Asset = {
  id: "AST-LOCKED-1",
  isin: "RO1827DBN011",
  name: "Romania Gov Bond 2028",
  currency: "RON",
  marketValue: 10_500_000,
  haircut: 5,
  status: "Locked",
  eligibility: "Eligible for overnight repo",
  custody: "SaFIR / BNR",
  type: "Government Bond",
};

const incomingAsset: Asset = {
  id: "AST-FREE-1",
  isin: "RO1BVB2029A1",
  name: "Romania Gov Bond 2029",
  currency: "RON",
  marketValue: 10_800_000,
  haircut: 3,
  status: "Available",
  eligibility: "Eligible for overnight repo",
  custody: "SaFIR / BNR",
  type: "Government Bond",
};

const repo: Repo = {
  id: "R-SUB-001",
  counterparty: "UniBank Bucharest",
  amount: 10_000_000,
  currency: "RON",
  rate: 5.1,
  startDate: "2026-04-07",
  maturityDate: "2026-04-08",
  state: "Active",
  requiredCollateral: 10_300_000,
  postedCollateral: Math.round(outgoingAsset.marketValue * (1 - outgoingAsset.haircut / 100)),
  buffer: Math.round(outgoingAsset.marketValue * (1 - outgoingAsset.haircut / 100)) - 10_300_000,
  assets: [outgoingAsset.id],
};

describe("SubstitutionWorkflow", () => {
  it("analyzes a lower-haircut eligible substitution even when concentration stays elevated", () => {
    const analysis = analyzeSubstitution({
      repo,
      outAsset: outgoingAsset,
      inAsset: incomingAsset,
      allAssets: [outgoingAsset],
    });

    expect(analysis.validForExecution).toBe(true);
    expect(analysis.recommended).toBe(false);
    expect(analysis.haircutDelta).toBeLessThan(0);
    expect(analysis.warnings.length).toBeGreaterThan(0);
  });

  it("executes a valid substitution and returns updated entities", () => {
    const analysis = analyzeSubstitution({
      repo,
      outAsset: outgoingAsset,
      inAsset: incomingAsset,
      allAssets: [outgoingAsset],
    });

    const result = executeSubstitution(
      { repo, outAsset: outgoingAsset, inAsset: incomingAsset, analysis },
      context,
    );

    expect(result.success).toBe(true);
    expect(result.payload.updatedRepo.assets).toContain(incomingAsset.id);
    expect(result.payload.releasedAsset.status).toBe("Available");
    expect(result.payload.allocatedAsset.status).toBe("Locked");
  });

  it("records a proposal event for 4-eye approval flows", () => {
    const analysis = analyzeSubstitution({
      repo,
      outAsset: outgoingAsset,
      inAsset: incomingAsset,
      allAssets: [outgoingAsset],
    });

    const proposal = recordSubstitutionProposal(
      { repo, outAsset: outgoingAsset, inAsset: incomingAsset, analysis },
      context,
    );

    expect(proposal.success).toBe(true);
    expect(proposal.agentEvents[0]?.type).toBe("workflow.substitution.proposed");
    expect(proposal.auditEntries[0]?.action).toBe("substitution proposed");
  });
});
