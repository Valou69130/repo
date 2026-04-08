// Counterparty bilateral agreement profiles
// In production these come from the master agreement database
export const COUNTERPARTY_PROFILES = {
  "UniBank Bucharest": {
    lei: "LEI-UNIBAN-001-RO",
    creditLimit: 25000000,
    eligibleTypes: ["Government Bond", "T-Bill"],
    minRating: "BBB",
    maxHaircut: 8,
    currency: "RON",
    agreementType: "GMRA 2011",
    agreementDate: "2023-06-15",
    settlementSystem: "SaFIR",
    relationshipManager: "Maria Ionescu",
    marginCallFrequency: "Daily",
    minimumTransferAmount: 100000,
    concentrationLimit: 0.30, // max 30% single ISIN
  },
  "Danube Capital": {
    lei: "LEI-DANUBE-002-RO",
    creditLimit: 15000000,
    eligibleTypes: ["Government Bond", "T-Bill", "MMF"],
    minRating: "BBB+",
    maxHaircut: 6,
    currency: "RON",
    agreementType: "GMRA 2011",
    agreementDate: "2024-01-10",
    settlementSystem: "SaFIR",
    relationshipManager: "Andrei Popescu",
    marginCallFrequency: "Daily",
    minimumTransferAmount: 150000,
    concentrationLimit: 0.25,
  },
  "Carpathia Bank": {
    lei: "LEI-CARPAT-003-RO",
    creditLimit: 12000000,
    eligibleTypes: ["Government Bond"],
    minRating: "A-",
    maxHaircut: 5,
    currency: "RON",
    agreementType: "GMRA 2000",
    agreementDate: "2022-09-01",
    settlementSystem: "SaFIR",
    relationshipManager: "Elena Gheorghe",
    marginCallFrequency: "Daily",
    minimumTransferAmount: 200000,
    concentrationLimit: 0.40,
  },
  "Balkan Treasury House": {
    lei: "LEI-BALKAN-004-EU",
    creditLimit: 10000000,
    eligibleTypes: ["Government Bond", "MMF"],
    minRating: "BBB",
    maxHaircut: 10,
    currency: "EUR",
    agreementType: "GMRA 2011",
    agreementDate: "2023-11-22",
    settlementSystem: "Euroclear",
    relationshipManager: "Stefan Munteanu",
    marginCallFrequency: "Weekly",
    minimumTransferAmount: 50000,
    concentrationLimit: 0.35,
  },
};

export function getProfile(counterparty) {
  return COUNTERPARTY_PROFILES[counterparty] || null;
}

export function utilizationColor(pct) {
  if (pct >= 90) return "text-red-600";
  if (pct >= 70) return "text-amber-600";
  return "text-emerald-600";
}

export function utilizationBg(pct) {
  if (pct >= 90) return "#ef4444";
  if (pct >= 70) return "#f59e0b";
  return "#10b981";
}
