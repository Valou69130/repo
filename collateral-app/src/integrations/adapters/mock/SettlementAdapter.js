// ─── Mock Settlement Instruction Adapter ─────────────────────────────────────
// Generates ISO 15022 MT543 Deliver Free / Deliver Against Payment messages.
// Simulates transmission to SaFIR/BNR custodian network.
// toInternal  : raw confirmation message → canonical SettlementInstruction
// fromInternal: canonical SettlementInstruction → MT543 SWIFT text
// NO business logic.

import { BaseAdapter }               from "../BaseAdapter.js";
import { EVENT_TYPES }               from "../../core/events.js";
import { createSettlementInstruction } from "../../core/models.js";

// ── MT543 builder ─────────────────────────────────────────────────────────────
function formatSwiftDate(isoDate) {
  return (isoDate || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
}

function buildMT543(instr) {
  const lines = [
    `{1:F01${instr.deliveryAgentBic}AXXX0000000001}`,
    `{2:I543${instr.receivingAgentBic}XXXXN}`,
    `{4:`,
    `:16R:GENL`,
    `:20C::SEME//${instr.id}`,
    `:23G:NEWM`,
    `:98A::PREP//${formatSwiftDate(new Date().toISOString().slice(0, 10))}`,
    `:16E:GENL`,
    `:16R:TRADDET`,
    `:98A::SETT//${formatSwiftDate(instr.settlementDate)}`,
    `:35B:ISIN ${instr.isin}`,
    instr.assetName ? `${instr.assetName}` : "",
    `:16R:FIA`,
    `:22F::MICO//XBSE`,
    `:16E:FIA`,
    `:16E:TRADDET`,
    `:16R:FIAC`,
    `:36B::ESTT//UNIT/${instr.quantity},`,
    `:97A::SAFE//${instr.custodyAccount}`,
    `:16E:FIAC`,
    `:16R:SETDET`,
    `:22F::SETR//REPO`,
    `:22F::STCO//CODU`,
    `:22F::PRIC//ACTU`,
    `:16R:AMT`,
    `:19A::DEAL//${instr.currency}${instr.amount.toFixed(2)}`,
    `:16E:AMT`,
    `:16R:SETPRTY`,
    `:95P::DEAG//${instr.deliveryAgentBic}`,
    `:97A::SAFE//${instr.custodyAccount}`,
    `:16E:SETPRTY`,
    `:16R:SETPRTY`,
    `:95P::REAG//${instr.receivingAgentBic}`,
    `:97A::SAFE//${instr.counterpartyCustody}`,
    `:16E:SETPRTY`,
    `:16E:SETDET`,
    `-}`,
  ].filter((l) => l !== "");
  return lines.join("\n");
}

export class SettlementAdapter extends BaseAdapter {
  constructor(config = {}) {
    super("mock-settlement", "mock", config);
  }

  /**
   * Generate a SettlementInstruction from a repo trade + asset record.
   * Emits SETTLEMENT_INSTRUCTED.
   */
  generate(repo, asset) {
    const instr = createSettlementInstruction({
      repoId:             repo.id,
      assetId:            asset.id,
      isin:               asset.isin,
      assetName:          asset.name,
      deliverySide:       "DELIVER",
      quantity:           1_000_000,
      amount:             repo.amount,
      currency:           repo.currency || "RON",
      settlementDate:     repo.startDate,
      custodyAccount:     "BNR-SAFIR-001",
      counterpartyCustody: "CPTY-SAFIR-002",
      deliveryAgentBic:   "BRDEROBU",
      receivingAgentBic:  "RNCBROBUXXX",
      status:             "instructed",
    });

    instr.rawMessage = buildMT543(instr);
    this.emit(EVENT_TYPES.SETTLEMENT_INSTRUCTED, { instruction: instr });
    return instr;
  }

  /**
   * Simulate transmitting an instruction to the custodian network.
   * Returns a promise that resolves after a mock network delay.
   * Emits SETTLEMENT_TRANSMITTED on success, SETTLEMENT_FAILED on simulated error.
   */
  async transmit(instruction, simulateFailure = false) {
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));

    if (simulateFailure) {
      const failed = { ...instruction, status: "failed", failureReason: "SAFIR rejected: insufficient collateral account balance" };
      this.emit(EVENT_TYPES.SETTLEMENT_FAILED, { instruction: failed });
      return failed;
    }

    const transmitted = { ...instruction, status: "transmitted", transmittedAt: new Date().toISOString() };
    this.emit(EVENT_TYPES.SETTLEMENT_TRANSMITTED, { instruction: transmitted });
    return transmitted;
  }

  /** toInternal: incoming confirmation message → SettlementInstruction update. */
  toInternal(confirmationMsg) {
    return {
      id:          confirmationMsg.instructionRef,
      status:      confirmationMsg.status === "CONF" ? "confirmed" : "failed",
      confirmedAt: confirmationMsg.confirmationTime || new Date().toISOString(),
      failureReason: confirmationMsg.rejectReason || null,
    };
  }

  /** fromInternal: SettlementInstruction → MT543 text (already built during generate). */
  fromInternal(instruction) {
    return instruction.rawMessage || buildMT543(instruction);
  }
}
