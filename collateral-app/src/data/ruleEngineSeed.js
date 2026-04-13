// Rule engine seed — mirrors COUNTERPARTY_PROFILES defaults so zero behaviour
// change until a user explicitly edits a rule.
export const ruleEngineSeed = {
  haircuts: {
    "Government Bond": 3,
    "T-Bill":          2,
    "MMF":             4,
    "Corporate Bond":  8,
    "Covered Bond":    5,
  },
  eligibility: {
    "Government Bond": ["overnight-repo", "central-bank"],
    "T-Bill":          ["overnight-repo", "central-bank"],
    "MMF":             ["overnight-repo"],
    "Corporate Bond":  [],
    "Covered Bond":    ["overnight-repo"],
  },
  counterparties: {
    "UniBank Bucharest":      { minCoverageRatio: 1.02, maxExposure: 25000000, mta: 100000 },
    "Danube Capital":         { minCoverageRatio: 1.03, maxExposure: 15000000, mta: 150000 },
    "Carpathia Bank":         { minCoverageRatio: 1.05, maxExposure: 12000000, mta: 200000 },
    "Balkan Treasury House":  { minCoverageRatio: 1.04, maxExposure: 10000000, mta:  50000 },
    "BNR Open Market":        { minCoverageRatio: 1.01, maxExposure: 50000000, mta: 500000 },
  },
  approvalThreshold: 10000000, // repos above 10 M RON require 4-eyes substitution
  stressPct: 10,               // default stress test slider value in Margin page
};
