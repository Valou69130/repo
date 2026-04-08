// ─── Mock Confirmation Adapter ────────────────────────────────────────────────
// Simulates receiving settlement confirmations from the custodian (MT544/MT545 or
// a JSON callback from SaFIR). In production this would listen on a queue or webhook.
// toInternal  : external confirmation → partial SettlementInstruction (status update)
// fromInternal: canonical instruction → confirmation request format
// NO business logic.

import { BaseAdapter }  from "../BaseAdapter.js";
import { EVENT_TYPES }  from "../../core/events.js";

export class ConfirmationAdapter extends BaseAdapter {
  constructor(config = {}) {
    super("mock-confirmation", "mock", config);
  }

  /** External confirmation payload → status-update patch object. */
  toInternal(msg) {
    const confirmed = msg.msgType === "MT544" || msg.status === "CONF" || msg.confirmed === true;
    return {
      id:            msg.instructionRef || msg.seme,
      status:        confirmed ? "confirmed" : "failed",
      confirmedAt:   msg.confirmationTime || msg.ts || new Date().toISOString(),
      failureReason: msg.rejectReason || msg.reason || null,
    };
  }

  fromInternal(instruction) {
    return {
      instructionRef: instruction.id,
      repoId:         instruction.repoId,
      isin:           instruction.isin,
      amount:         instruction.amount,
      currency:       instruction.currency,
      settlementDate: instruction.settlementDate,
    };
  }

  /**
   * Process an incoming confirmation message.
   * Emits CONFIRMATION_RECEIVED + SETTLEMENT_CONFIRMED or SETTLEMENT_FAILED.
   * Returns the status-update patch.
   */
  process(rawMsg) {
    this.emit(EVENT_TYPES.CONFIRMATION_RECEIVED, { raw: rawMsg });
    const patch = this.toInternal(rawMsg);

    if (patch.status === "confirmed") {
      this.emit(EVENT_TYPES.SETTLEMENT_CONFIRMED, { patch });
    } else {
      this.emit(EVENT_TYPES.SETTLEMENT_FAILED, { patch });
    }

    return patch;
  }

  /**
   * Simulate receiving a mock confirmation for a given instructionId.
   * simulateFailure = true exercises the rejection path.
   */
  simulateConfirmation(instructionId, simulateFailure = false) {
    const raw = simulateFailure
      ? {
          msgType:          "MT548",
          seme:             instructionId,
          status:           "REJT",
          rejectReason:     "SAFE — Insufficient securities balance in delivery account",
          confirmationTime: new Date().toISOString(),
        }
      : {
          msgType:          "MT544",
          seme:             instructionId,
          status:           "CONF",
          confirmed:        true,
          confirmationTime: new Date().toISOString(),
        };

    return this.process(raw);
  }
}
