// ─── Collateral Allocation Agent — Test Data ─────────────────────────────────
//
// Deterministic fixtures for unit tests and UI development.
// Covers all filter outcomes (pass, status reject, currency reject, ineligible,
// haircut exceed) plus concentration scenarios.

import type { AppAsset, AppRepo } from "./CollateralAllocationAgent";

// ── Trade fixtures ────────────────────────────────────────────────────────────

/** Standard overnight repo — should be fully coverable by the sample assets. */
export const TRADE_OVERNIGHT: AppRepo = {
  id:           "TEST-R001",
  counterparty: "UniBank Bucharest",
  amount:       10_000_000,
  currency:     "RON",
  rate:         5.85,
  startDate:    "2026-04-04",
  maturityDate: "2026-04-05",
};

/** One-week repo at higher notional — tests partial basket + concentration. */
export const TRADE_1W_LARGE: AppRepo = {
  id:           "TEST-R002",
  counterparty: "Danube Capital",
  amount:       20_000_000,
  currency:     "RON",
  rate:         5.90,
  startDate:    "2026-04-04",
  maturityDate: "2026-04-11",
};

/** EUR trade — should cause RON assets to be currency-rejected. */
export const TRADE_EUR: AppRepo = {
  id:           "TEST-R003",
  counterparty: "Balkan Treasury House",
  amount:       2_000_000,
  currency:     "EUR",
  rate:         3.50,
  startDate:    "2026-04-04",
  maturityDate: "2026-04-05",
};

/** Impossible trade — notional too large to be covered by available collateral. */
export const TRADE_INFEASIBLE: AppRepo = {
  id:           "TEST-R004",
  counterparty: "UniBank Bucharest",
  amount:       100_000_000,
  currency:     "RON",
  rate:         5.85,
  startDate:    "2026-04-04",
  maturityDate: "2026-04-05",
};

// ── Asset fixtures ────────────────────────────────────────────────────────────

export const ASSETS_STANDARD: AppAsset[] = [
  // ── Should be selected (RON, eligible, available) ──────────────────────────
  {
    id:          "TST-AST-001",
    isin:        "RO1827DBN011",
    name:        "Romania Gov Bond 2028",
    currency:    "RON",
    marketValue: 12_180_000,
    haircut:     3,
    status:      "Available",
    eligibility: "Eligible for overnight repo",
    custody:     "SaFIR / BNR",
    type:        "Government Bond",
  },
  {
    id:          "TST-AST-002",
    isin:        "RO1BVB2029A1",
    name:        "Romania Gov Bond 2029",
    currency:    "RON",
    marketValue: 9_190_000,
    haircut:     4,
    status:      "Available",
    eligibility: "Eligible for overnight repo",
    custody:     "SaFIR / BNR",
    type:        "Government Bond",
  },
  {
    id:          "TST-AST-003",
    isin:        "RO1832DBN0A3",
    name:        "Romania Gov Bond 2032",
    currency:    "RON",
    marketValue: 7_350_000,
    haircut:     5,
    status:      "Available",
    eligibility: "Eligible for overnight repo",
    custody:     "SaFIR / BNR",
    type:        "Government Bond",
  },
  // ── Should be rejected: status = Reserved ──────────────────────────────────
  {
    id:          "TST-AST-004",
    isin:        "ROTBILL2026X",
    name:        "Romania T-Bill 2026",
    currency:    "RON",
    marketValue: 4_470_000,
    haircut:     2,
    status:      "Reserved",
    eligibility: "Eligible for central bank use",
    custody:     "SaFIR / BNR",
    type:        "T-Bill",
  },
  // ── Should be rejected: ineligible (counterparty restriction) ───────────────
  {
    id:          "TST-AST-005",
    isin:        "EUROMMF001",
    name:        "EUR Liquidity Fund A",
    currency:    "RON",     // same currency but restricted
    marketValue: 2_100_000,
    haircut:     6,
    status:      "Available",
    eligibility: "Counterparty restricted",
    custody:     "Global Custody",
    type:        "MMF",
  },
  // ── Should be rejected: currency mismatch ────────────────────────────────────
  {
    id:          "TST-AST-006",
    isin:        "DE0001234567",
    name:        "German Federal Bond 0.5% 2030",
    currency:    "EUR",
    marketValue: 3_200_000,
    haircut:     2,
    status:      "Available",
    eligibility: "Eligible for overnight repo",
    custody:     "Clearstream",
    type:        "Government Bond",
  },
  // ── Should be rejected: status = Locked ──────────────────────────────────────
  {
    id:          "TST-AST-007",
    isin:        "RO1835DBN0B4",
    name:        "Romania Gov Bond 2035",
    currency:    "RON",
    marketValue: 5_600_000,
    haircut:     6,
    status:      "Locked",
    eligibility: "Eligible for overnight repo",
    custody:     "SaFIR / BNR",
    type:        "Government Bond",
  },
  // ── Should be rejected: haircut too high (for maxHaircut=5 scenario) ─────────
  {
    id:          "TST-AST-008",
    isin:        "RO9999CORP01",
    name:        "Romanian Corporate Bond 2027",
    currency:    "RON",
    marketValue: 4_000_000,
    haircut:     12,
    status:      "Available",
    eligibility: "Eligible for overnight repo",
    custody:     "SaFIR / BNR",
    type:        "Corporate Bond",
  },
  // ── Internal restriction ─────────────────────────────────────────────────────
  {
    id:          "TST-AST-009",
    isin:        "RO1835DBN0C5",
    name:        "Romania Gov Bond 2035-B (restricted)",
    currency:    "RON",
    marketValue: 8_000_000,
    haircut:     5,
    status:      "Available",
    eligibility: "Internal restriction",
    custody:     "SaFIR / BNR",
    type:        "Government Bond",
  },
];

/** Minimal EUR-eligible pool for TRADE_EUR tests. */
export const ASSETS_EUR: AppAsset[] = [
  {
    id:          "TST-EUR-001",
    isin:        "DE0001234567",
    name:        "German Federal Bond 0.5% 2030",
    currency:    "EUR",
    marketValue: 3_200_000,
    haircut:     2,
    status:      "Available",
    eligibility: "Eligible for overnight repo",
    custody:     "Clearstream",
    type:        "Government Bond",
  },
];
