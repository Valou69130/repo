// Reference rate benchmarks — Romania money market
// In production these would be fetched from BNR's data feed or a market data provider.
// Values represent current indicative fixings as of 2026-04-03.

export const ROBOR = {
  ON:  { rate: 5.75, label: "ROBOR O/N",  tenor: 1  },
  "1W": { rate: 5.82, label: "ROBOR 1W",   tenor: 7  },
  "2W": { rate: 5.87, label: "ROBOR 2W",   tenor: 14 },
  "1M": { rate: 5.90, label: "ROBOR 1M",   tenor: 30 },
  "3M": { rate: 5.95, label: "ROBOR 3M",   tenor: 91 },
  "6M": { rate: 6.02, label: "ROBOR 6M",   tenor: 182 },
};

export const EURIBOR = {
  ON:  { rate: 3.15, label: "€STR",        tenor: 1  },
  "1W": { rate: 3.18, label: "EURIBOR 1W",  tenor: 7  },
  "1M": { rate: 3.22, label: "EURIBOR 1M",  tenor: 30 },
  "3M": { rate: 3.35, label: "EURIBOR 3M",  tenor: 91 },
  "6M": { rate: 3.48, label: "EURIBOR 6M",  tenor: 182 },
};

// BNR policy rate
export const BNR_POLICY_RATE = 6.50;
export const BNR_DEPOSIT_FACILITY = 5.50;
export const BNR_LENDING_FACILITY = 7.50;

// Own funds basis for regulatory large exposure calculations (Art. 395 CRR)
// In production sourced from capital reporting. This demo value = 50M RON.
export const OWN_FUNDS_RON = 50_000_000;
// Large exposure threshold: 25% of own funds per CRR Art. 395
export const LARGE_EXPOSURE_LIMIT_PCT = 0.25;
export const LARGE_EXPOSURE_LIMIT_RON = OWN_FUNDS_RON * LARGE_EXPOSURE_LIMIT_PCT;

/**
 * Returns the closest ROBOR tenor for a given term in days.
 */
export function closestRobor(days) {
  const key = days <= 1 ? "ON" : days <= 10 ? "1W" : days <= 20 ? "2W" : days <= 60 ? "1M" : "3M";
  return ROBOR[key];
}

/**
 * Spread of repo rate vs benchmark in basis points.
 * Positive = above benchmark (repo rate is rich), negative = below (cheap funding).
 */
export function spreadBps(repoRate, benchmarkRate) {
  return Math.round((repoRate - benchmarkRate) * 100);
}

/**
 * Benchmark description for display alongside a given tenor in days.
 */
export function benchmarkLabel(days, currency = "RON") {
  if (currency === "EUR") {
    const key = days <= 1 ? "ON" : days <= 10 ? "1W" : days <= 60 ? "1M" : "3M";
    return EURIBOR[key];
  }
  return closestRobor(days);
}
