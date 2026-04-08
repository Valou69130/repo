// ─── Margin Protection Agent — Test Data ─────────────────────────────────────
//
// Deterministic fixtures for unit tests and UI development.
//
// Repo fixtures cover all alert paths:
//   REPO_CRITICAL        → posted < notional (actual under-collateralisation)
//   REPO_WARNING         → posted >= notional but below 103% rule, call required
//   REPO_BELOW_MTA       → shortfall < MTA — monitor, no formal call
//   REPO_WATCH           → above 103% but thin buffer (< 5% of required)
//   REPO_NEAR_MATURITY   → Warning + matures in 2 days → NEAR_MATURITY risk flag
//   REPO_EUR_WARNING     → EUR-denominated repo with Warning deficit
//   REPO_CONCENTRATION   → basket dominated by one ISIN → CONCENTRATION_RISK flag
//   REPO_HEALTHY         → compliant with comfortable buffer — no alert generated
//   REPO_CLOSED          → closed repo — skipped by the agent entirely
//
// Asset fixtures:
//   ASSET_GOV_RON_A/B/C  → eligible RON government bonds (suitable for top-ups)
//   ASSET_GOV_EUR        → eligible EUR government bond
//   ASSET_RESERVED       → should be rejected (status = Reserved)
//   ASSET_RESTRICTED     → should be rejected (counterparty restricted eligibility)
//   ASSET_ALREADY_POSTED → simulates an asset already in a repo basket (excluded from candidacy)

import type { AppMarginRepo, AppMarginAsset } from "./appTypes";

// ── Reference date ────────────────────────────────────────────────────────────
// All date offsets below are relative to the app's current date: 2026-04-05.
// Near-maturity repos use 2026-04-07 (2 days out) to trigger the flag.

// ── Repo fixtures ─────────────────────────────────────────────────────────────

/** Critical: postedCollateral < notional — actual under-collateralisation (92%). */
export const REPO_CRITICAL: AppMarginRepo = {
  id:                 "MR-001",
  counterparty:       "UniBank Bucharest",
  amount:             10_000_000,
  currency:           "RON",
  rate:               5.85,
  startDate:          "2026-04-01",
  maturityDate:       "2026-04-08",
  state:              "Active",
  requiredCollateral: 10_300_000,
  postedCollateral:    9_200_000,   // 92.0% coverage → Critical
  buffer:             -1_100_000,
  assets:             ["MA-POSTED-A"],  // one already-posted asset
};

/** Warning: posted >= notional but below 103% rule; shortfall > MTA → call required. */
export const REPO_WARNING: AppMarginRepo = {
  id:                 "MR-002",
  counterparty:       "Danube Capital",
  amount:             8_000_000,
  currency:           "RON",
  rate:               5.90,
  startDate:          "2026-04-01",
  maturityDate:       "2026-04-11",
  state:              "Active",
  requiredCollateral: 8_240_000,
  postedCollateral:   8_040_000,   // 100.5% — below 103% rule; shortfall 200k > MTA
  buffer:              -200_000,
  assets:             [],
};

/** Warning below MTA: shortfall is 80k RON < 150k MTA — no formal call, but monitor. */
export const REPO_BELOW_MTA: AppMarginRepo = {
  id:                 "MR-003",
  counterparty:       "Balkan Treasury House",
  amount:             5_000_000,
  currency:           "RON",
  rate:               4.75,
  startDate:          "2026-04-01",
  maturityDate:       "2026-04-30",
  state:              "Active",
  requiredCollateral: 5_150_000,
  postedCollateral:   5_070_000,   // 101.4% — shortfall 80k < MTA 150k
  buffer:               -80_000,
  assets:             [],
};

/**
 * Watch: above 103% but thin buffer.
 * buffer = 60k = 0.49% of required (< 5% THIN_THRESHOLD).
 */
export const REPO_WATCH: AppMarginRepo = {
  id:                 "MR-004",
  counterparty:       "Meridian Asset Managers",
  amount:             12_000_000,
  currency:           "RON",
  rate:               5.20,
  startDate:          "2026-04-01",
  maturityDate:       "2026-04-15",
  state:              "Active",
  requiredCollateral: 12_360_000,
  postedCollateral:   12_420_000,  // 103.5% — buffer 60k ÷ 12,360k = 0.49% → Watch
  buffer:                 60_000,
  assets:             [],
};

/** Near-maturity: Warning deficit + repo matures 2026-04-07 (2 days from ref date). */
export const REPO_NEAR_MATURITY: AppMarginRepo = {
  id:                 "MR-005",
  counterparty:       "UniBank Bucharest",
  amount:             6_000_000,
  currency:           "RON",
  rate:               5.85,
  startDate:          "2026-04-03",
  maturityDate:       "2026-04-07",  // 2 days — triggers NEAR_MATURITY flag
  state:              "Active",
  requiredCollateral:  6_180_000,
  postedCollateral:    5_820_000,   // deficit 360k > MTA → call required + near maturity
  buffer:               -360_000,
  assets:             [],
};

/** EUR-denominated Warning: shortfall 80k EUR > MTA 15k EUR → call required. */
export const REPO_EUR_WARNING: AppMarginRepo = {
  id:                 "MR-006",
  counterparty:       "Eurozone FI Fund",
  amount:             2_000_000,
  currency:           "EUR",
  rate:               3.20,
  startDate:          "2026-04-01",
  maturityDate:       "2026-04-14",
  state:              "Active",
  requiredCollateral:  2_060_000,
  postedCollateral:    1_980_000,   // shortfall 80k EUR > MTA 15k EUR
  buffer:                -80_000,
  assets:             [],
};

/**
 * Concentration risk: posted basket dominated by a single ISIN.
 * The basket contains two assets with the same ISIN → > 60% concentration.
 */
export const REPO_CONCENTRATION: AppMarginRepo = {
  id:                 "MR-007",
  counterparty:       "Danube Capital",
  amount:             4_000_000,
  currency:           "RON",
  rate:               5.50,
  startDate:          "2026-04-01",
  maturityDate:       "2026-04-20",
  state:              "Active",
  requiredCollateral:  4_120_000,
  postedCollateral:    3_900_000,   // Warning deficit
  buffer:               -220_000,
  assets:             ["MA-CONC-A", "MA-CONC-B"],  // both same ISIN → concentration
};

/** Healthy: compliant with comfortable buffer — agent should NOT generate an alert. */
export const REPO_HEALTHY: AppMarginRepo = {
  id:                 "MR-008",
  counterparty:       "Central Securities Corp",
  amount:             7_000_000,
  currency:           "RON",
  rate:               5.10,
  startDate:          "2026-04-01",
  maturityDate:       "2026-04-20",
  state:              "Active",
  requiredCollateral:  7_210_000,
  postedCollateral:    7_800_000,   // 111.4% — well above threshold, no alert
  buffer:               590_000,
  assets:             [],
};

/** Closed repo — agent should skip it entirely. */
export const REPO_CLOSED: AppMarginRepo = {
  id:                 "MR-009",
  counterparty:       "UniBank Bucharest",
  amount:             3_000_000,
  currency:           "RON",
  rate:               5.85,
  startDate:          "2026-03-28",
  maturityDate:       "2026-04-04",
  state:              "Closed",
  requiredCollateral:  3_090_000,
  postedCollateral:    2_950_000,   // deficit — but closed, so no alert
  buffer:               -140_000,
  assets:             [],
};

// ── Asset fixtures ────────────────────────────────────────────────────────────

/** Eligible RON gov bond — low haircut, suitable for most top-ups. */
export const ASSET_GOV_RON_A: AppMarginAsset = {
  id:          "MA-001",
  isin:        "RO1827DBN011",
  name:        "Romania Gov Bond 2028",
  currency:    "RON",
  marketValue: 3_500_000,
  haircut:     3,
  status:      "Available",
  eligibility: "Eligible for overnight repo",
  custody:     "SaFIR / BNR",
  type:        "Government Bond",
};

/** Eligible RON gov bond — slightly higher haircut. */
export const ASSET_GOV_RON_B: AppMarginAsset = {
  id:          "MA-002",
  isin:        "RO1BVB2029A1",
  name:        "Romania Gov Bond 2029",
  currency:    "RON",
  marketValue: 2_800_000,
  haircut:     4,
  status:      "Available",
  eligibility: "Eligible for overnight repo",
  custody:     "SaFIR / BNR",
  type:        "Government Bond",
};

/** Eligible RON gov bond — longer maturity, 5% haircut. */
export const ASSET_GOV_RON_C: AppMarginAsset = {
  id:          "MA-003",
  isin:        "RO1832DBN0A3",
  name:        "Romania Gov Bond 2032",
  currency:    "RON",
  marketValue: 1_900_000,
  haircut:     5,
  status:      "Available",
  eligibility: "Eligible for overnight repo",
  custody:     "SaFIR / BNR",
  type:        "Government Bond",
};

/** Eligible EUR gov bond — used for EUR repo top-ups. */
export const ASSET_GOV_EUR: AppMarginAsset = {
  id:          "MA-004",
  isin:        "DE0001234567",
  name:        "German Federal Bond 0.5% 2030",
  currency:    "EUR",
  marketValue: 3_200_000,
  haircut:     2,
  status:      "Available",
  eligibility: "Eligible for overnight repo",
  custody:     "Clearstream",
  type:        "Government Bond",
};

/** Reserved — should be excluded by the allocation agent (status ≠ Available). */
export const ASSET_RESERVED: AppMarginAsset = {
  id:          "MA-005",
  isin:        "ROTBILL2026X",
  name:        "Romania T-Bill 2026",
  currency:    "RON",
  marketValue: 2_000_000,
  haircut:     2,
  status:      "Reserved",
  eligibility: "Eligible for overnight repo",
  custody:     "SaFIR / BNR",
  type:        "T-Bill",
};

/** Counterparty-restricted — should be rejected by eligibility filter. */
export const ASSET_RESTRICTED: AppMarginAsset = {
  id:          "MA-006",
  isin:        "RO9999CORP01",
  name:        "Romanian Corporate Bond 2027",
  currency:    "RON",
  marketValue: 1_500_000,
  haircut:     10,
  status:      "Available",
  eligibility: "Counterparty restricted",
  custody:     "SaFIR / BNR",
  type:        "Corporate Bond",
};

/**
 * Already-posted asset — simulates an asset in REPO_CRITICAL's basket.
 * The proposer should exclude this from the top-up candidate pool.
 */
export const ASSET_ALREADY_POSTED: AppMarginAsset = {
  id:          "MA-POSTED-A",
  isin:        "RO1835DBN0B4",
  name:        "Romania Gov Bond 2035 (posted)",
  currency:    "RON",
  marketValue: 5_600_000,
  haircut:     6,
  status:      "Available",
  eligibility: "Eligible for overnight repo",
  custody:     "SaFIR / BNR",
  type:        "Government Bond",
};

/** First asset in the concentration-risk basket (dominates with single ISIN). */
export const ASSET_CONC_A: AppMarginAsset = {
  id:          "MA-CONC-A",
  isin:        "RO1827DBN011",   // same ISIN as ASSET_GOV_RON_A
  name:        "Romania Gov Bond 2028 (tranche A)",
  currency:    "RON",
  marketValue: 3_200_000,
  haircut:     3,
  status:      "Available",
  eligibility: "Eligible for overnight repo",
  custody:     "SaFIR / BNR",
  type:        "Government Bond",
};

/** Second asset in the concentration-risk basket (same ISIN → breach). */
export const ASSET_CONC_B: AppMarginAsset = {
  id:          "MA-CONC-B",
  isin:        "RO1827DBN011",   // same ISIN → together > 60% of basket
  name:        "Romania Gov Bond 2028 (tranche B)",
  currency:    "RON",
  marketValue: 1_000_000,
  haircut:     3,
  status:      "Available",
  eligibility: "Eligible for overnight repo",
  custody:     "SaFIR / BNR",
  type:        "Government Bond",
};

// ── Convenient collections ────────────────────────────────────────────────────

/** All repos — covers every test scenario including healthy and closed. */
export const REPOS_ALL: AppMarginRepo[] = [
  REPO_CRITICAL,
  REPO_WARNING,
  REPO_BELOW_MTA,
  REPO_WATCH,
  REPO_NEAR_MATURITY,
  REPO_EUR_WARNING,
  REPO_CONCENTRATION,
  REPO_HEALTHY,
  REPO_CLOSED,
];

/** All RON-eligible assets (excluding EUR). */
export const ASSETS_RON: AppMarginAsset[] = [
  ASSET_GOV_RON_A,
  ASSET_GOV_RON_B,
  ASSET_GOV_RON_C,
  ASSET_RESERVED,
  ASSET_RESTRICTED,
  ASSET_ALREADY_POSTED,
  ASSET_CONC_A,
  ASSET_CONC_B,
];

/** Full inventory — all currencies, all statuses. */
export const ASSETS_ALL: AppMarginAsset[] = [
  ...ASSETS_RON,
  ASSET_GOV_EUR,
];
