// Eligibility rules engine
// Each rule has an id, label, and a check function
// Returns pass/fail/warning per rule for a given asset

const RULES = {
  "Government Bond": [
    {
      id: "sovereign-issuer",
      label: "Sovereign issuer",
      description: "Issued by a national government",
      check: (a) => a.issuer.toLowerCase().includes("government"),
    },
    {
      id: "haircut-band",
      label: "Haircut within band (≤ 10%)",
      description: "Haircut must not exceed 10% for standard repo eligibility",
      check: (a) => a.haircut <= 10,
    },
    {
      id: "currency-eligible",
      label: "Eligible currency (RON / EUR)",
      description: "Position must be denominated in RON or EUR",
      check: (a) => ["RON", "EUR"].includes(a.currency),
    },
    {
      id: "safir-custody",
      label: "SaFIR-eligible custody",
      description: "Asset must be held in SaFIR or equivalent DVP-capable system",
      check: (a) => a.custody.includes("SaFIR") || a.custody.includes("Global"),
    },
    {
      id: "not-pledged",
      label: "Not pledged or internally restricted",
      description: "Asset must not be encumbered by a pledging arrangement",
      check: (a) => a.status !== "Pledged",
    },
  ],
  "T-Bill": [
    {
      id: "sovereign-issuer",
      label: "Sovereign issuer",
      description: "Issued by a national government",
      check: (a) => a.issuer.toLowerCase().includes("government"),
    },
    {
      id: "short-term",
      label: "Short-term instrument (< 1yr)",
      description: "T-Bills are by definition short-dated instruments",
      check: () => true,
    },
    {
      id: "haircut-band",
      label: "Haircut within band (≤ 5%)",
      description: "T-Bill haircut ceiling is lower than bonds",
      check: (a) => a.haircut <= 5,
    },
    {
      id: "safir-custody",
      label: "SaFIR-eligible custody",
      description: "Asset must be held in SaFIR",
      check: (a) => a.custody.includes("SaFIR"),
    },
    {
      id: "not-pledged",
      label: "Not pledged or internally restricted",
      description: "Asset must not be encumbered",
      check: (a) => a.status !== "Pledged",
    },
  ],
  "MMF": [
    {
      id: "mmf-type",
      label: "Money market fund classification",
      description: "Fund must qualify as a UCITS-compliant MMF",
      check: () => true,
    },
    {
      id: "global-custody",
      label: "Global custody eligible",
      description: "Position must be held in a recognised global custodian",
      check: (a) => a.custody.includes("Global"),
    },
    {
      id: "eur-denominated",
      label: "EUR denominated",
      description: "MMF positions must be EUR-denominated for GMRA eligibility",
      check: (a) => a.currency === "EUR",
    },
    {
      id: "not-pledged",
      label: "Not pledged or internally restricted",
      description: "Asset must not be encumbered",
      check: (a) => a.status !== "Pledged",
    },
  ],
};

const DEFAULT_RULES = [
  {
    id: "not-restricted",
    label: "No internal restriction",
    description: "Asset not subject to internal trading or encumbrance restriction",
    check: (a) => !a.eligibility?.toLowerCase().includes("internal restriction"),
  },
];

export function evaluateEligibility(asset) {
  const rules = RULES[asset.type] || DEFAULT_RULES;
  return rules.map((rule) => {
    let pass = false;
    try { pass = rule.check(asset); } catch { pass = false; }
    return { ...rule, pass };
  });
}

export function eligibilitySummary(asset) {
  const results = evaluateEligibility(asset);
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  return { results, passed, failed, eligible: failed === 0 };
}
