// ─── Mock Trade Intake Adapter ────────────────────────────────────────────────
// Simulates receiving a trade message from a front-office system (Bloomberg TOMS,
// T-REX, Murex, or any FIX/JSON feed).
// toInternal  : external JSON trade payload → canonical RepoTrade
// fromInternal: canonical RepoTrade → simplified external representation
// NO business logic — validation rules live in IntegrationService.

import { BaseAdapter }    from "../BaseAdapter.js";
import { EVENT_TYPES }    from "../../core/events.js";
import { createRepoTrade } from "../../core/models.js";

// ── Validation helpers (structural only, no domain rules) ────────────────────
const REQUIRED_FIELDS = ["tradeId", "cptyId", "notional", "currency", "repoRate", "startDate", "endDate"];

function validateStructure(payload) {
  const missing = REQUIRED_FIELDS.filter((f) => payload[f] == null || payload[f] === "");
  if (missing.length > 0) return { valid: false, errors: [`Missing fields: ${missing.join(", ")}`] };
  if (typeof payload.notional !== "number" || payload.notional <= 0)
    return { valid: false, errors: ["notional must be a positive number"] };
  if (typeof payload.repoRate !== "number" || payload.repoRate <= 0)
    return { valid: false, errors: ["repoRate must be a positive number"] };
  return { valid: true, errors: [] };
}

export class TradeIntakeAdapter extends BaseAdapter {
  constructor(config = {}) {
    super("mock-trade-intake", "mock", config);
  }

  /** Map external JSON payload → canonical RepoTrade. */
  toInternal(payload) {
    return createRepoTrade({
      id:               payload.tradeId,
      counterpartyId:   payload.cptyId,
      counterpartyLei:  payload.cptyLei || "UNKNOWN",
      startDate:        payload.startDate,
      maturityDate:     payload.endDate,
      rate:             payload.repoRate,
      amount:           payload.notional,
      currency:         payload.currency || "RON",
      dayCount:         payload.dayCount || 360,
      collateralIsins:  (payload.collateral || []).map((c) => c.isin),
      state:            "draft",
      settlementType:   payload.settlementType || "DVP",
      tradeSource:      payload.tradeSource || "mock",
    });
  }

  /** Map canonical RepoTrade → simplified external representation. */
  fromInternal(trade) {
    return {
      tradeId:        trade.id,
      cptyId:         trade.counterpartyId,
      cptyLei:        trade.counterpartyLei,
      notional:       trade.amount,
      currency:       trade.currency,
      repoRate:       trade.rate,
      startDate:      trade.startDate,
      endDate:        trade.maturityDate,
      dayCount:       trade.dayCount,
      settlementType: trade.settlementType,
      collateral:     trade.collateralIsins.map((isin) => ({ isin })),
    };
  }

  /**
   * Ingest a raw external payload.
   * Emits TRADE_RECEIVED always, then TRADE_VALIDATED or TRADE_REJECTED.
   * Returns { valid, trade?, errors }.
   */
  ingest(rawPayload) {
    this.emit(EVENT_TYPES.TRADE_RECEIVED, { raw: rawPayload });

    const { valid, errors } = validateStructure(rawPayload);
    if (!valid) {
      this.emit(EVENT_TYPES.TRADE_REJECTED, { raw: rawPayload, errors });
      return { valid: false, errors };
    }

    const trade = this.toInternal(rawPayload);
    this.emit(EVENT_TYPES.TRADE_VALIDATED, { trade });
    return { valid: true, trade, errors: [] };
  }
}

// ── Sample payloads for the UI manual intake form ────────────────────────────
export const SAMPLE_PAYLOADS = {
  overnight: {
    msgType: "TRADE_CAPTURE",
    tradeId: `TOMS-${Date.now()}`,
    cptyId:  "RAIFRO2B",
    cptyLei: "529900T8BM49AURSDO55",
    notional: 10000000,
    currency: "RON",
    repoRate: 5.85,
    startDate: new Date().toISOString().slice(0, 10),
    endDate:   new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    dayCount:  360,
    settlementType: "DVP",
    tradeSource: "bloomberg",
    collateral: [{ isin: "RO1234567890", haircut: 2.0 }],
  },
  oneWeek: {
    msgType: "TRADE_CAPTURE",
    tradeId: `TOMS-${Date.now() + 1}`,
    cptyId:  "BCUBRO22",
    cptyLei: "253400XQTWCF5WSJZM23",
    notional: 25000000,
    currency: "RON",
    repoRate: 5.90,
    startDate: new Date().toISOString().slice(0, 10),
    endDate:   new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    dayCount:  360,
    settlementType: "DVP",
    tradeSource: "t-rex",
    collateral: [
      { isin: "RO1234567890", haircut: 2.0 },
      { isin: "RO9876543210", haircut: 3.5 },
    ],
  },
  invalid: {
    msgType: "TRADE_CAPTURE",
    tradeId: "",
    cptyId:  "BCUBRO22",
    notional: -5000,
    currency: "RON",
    repoRate: 0,
  },
};
