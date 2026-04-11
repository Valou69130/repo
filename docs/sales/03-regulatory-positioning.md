# CollateralOS — Regulatory Positioning Paper

## Overview

CollateralOS is enterprise workflow software. In Phase 1, it does not issue, transfer, or represent ownership of securities. It does not hold client assets or process payments. It is a system of record and approval-routing layer for collateral management workflows — the same category as treasury management systems and compliance workflow tools that Romanian banks already operate under existing licensing frameworks.

This paper addresses the four regulatory regimes most relevant to the platform's Phase 1 deployment at a Romanian commercial bank.

---

## 1. Securities Financing Transaction Regulation (SFTR — EU 2015/2365)

### The Obligation

SFTR requires financial counterparties to report the details of every securities financing transaction (repo, reverse repo, securities lending, margin lending) to a registered EU trade repository by T+1 09:00 CET. Required fields include UTI, counterparty LEIs, collateral ISINs, notional amounts, repo rate, tenor, collateral quality, and re-use flag. Non-compliance carries supervisory sanctions and reputational risk under ECB SREP.

### How CollateralOS Addresses It

CollateralOS generates a complete SFTR-compliant trade report for every repo booked on the platform. The report is produced automatically at end of day and covers all ESMA RTS 2019/363 mandatory fields:

- **Counterparty data (Table 1):** Reporting entity LEI, other counterparty LEI, counterparty type (Financial / Non-Financial), report type (NEWT / TERM / MODI)
- **Loan data (Table 2):** Principal amount, currency, start date, maturity date, tenor, repo rate (fixed), day count convention (A360), settlement type (DVCP), execution venue (XOFF for bilateral)
- **Collateral data (Table 3):** Collateral type (SECU), quality (INVG), ISIN-level collateral breakdown, market value, haircut percentage, custodian
- **Re-use data (Table 4):** Re-use authorisation flag, reinvestment return

**Phase 1:** Export as ESMA XML (namespace `urn:esma:sftr:v1`) for manual submission to your existing ARM (Regis-TR, UnaVista, DTCC).  
**Phase 2 (Q1 2027):** Direct ARM connectivity — automated T+1 submission without manual file handling.

**UTI generation** follows the BNR/ESMA convention: `RO-{entityLEI}-{tradeId}-01`.

### Compliance Note

LEI values in production deployments must be validated against GLEIF and refreshed per the annual LEI renewal cycle. CollateralOS supports LEI import and validation against your master agreement database.

---

## 2. European Market Infrastructure Regulation (EMIR — EU 648/2012)

### The Obligation

EMIR imposes margin requirements on OTC derivative positions, including variation margin (VM) and initial margin (IM) obligations for in-scope counterparties. For institutions using repo markets and government securities as collateral pools to meet these margin requirements, EMIR creates a direct operational dependency on collateral management efficiency.

### How CollateralOS Addresses It

While CollateralOS is not a derivative reporting system, it directly supports EMIR compliance for institutions managing collateral pools that service both repo and OTC derivative margin requirements:

- **Real-time coverage ratio monitoring** enables rapid identification of eligible collateral available to meet VM calls without double-counting positions pledged to repo counterparties
- **Encumbrance tracking** across the full collateral pool (Free / Reserved / Pledged / Repo / Restricted) prevents the allocation conflicts that create EMIR margin breaches
- **Margin exception workflows** provide structured, time-stamped documentation of every margin response — directly usable as control evidence in EMIR compliance reviews
- **Audit trail** captures every collateral decision with before/after state — the control documentation that EMIR requires institutions to maintain for at least 5 years post-transaction

---

## 3. NBR Regulation No. 5/2013 on Prudential Requirements for Credit Institutions

### The Obligation

NBR Regulation 5/2013 implements CRD IV in Romania and establishes prudential requirements for Romanian-licensed credit institutions, including internal control obligations, operational risk management frameworks, and documentation requirements for material transactions. Article 191 requires that significant operational decisions are subject to segregation of duties and documented approval processes.

### How CollateralOS Addresses It

The platform's approval workflow architecture directly implements the segregation-of-duties requirements under NBR Reg. 5/2013:

- **Four-eyes enforcement:** Every material collateral action (repo creation, margin top-up, collateral substitution) requires approval from a second role. Approval cannot be granted by the initiating user.
- **Role-based access control:** Four distinct roles (Treasury Manager, Collateral Manager, Operations Analyst, Risk Reviewer) with server-side permission enforcement — not just UI-level gating
- **Immutable audit trail:** Every decision, approval, override, and state change is written to a tamper-evident log with timestamp, user identity, role, action type, and before/after state — the exact documentation format required for NBR inspection
- **Operational risk reduction:** Systematic enforcement of eligibility rules, haircut schedules, and concentration limits reduces the category of errors (mis-allocated collateral, breached limits, unsigned approvals) that constitute operational risk events under the regulation

---

## 4. Basel IV / CRR3 — LCR and NSFR Liquidity Requirements

### The Obligation

Basel IV (implemented in the EU as CRR3, phasing in 2025–2028) tightens the calculation of High-Quality Liquid Assets (HQLA) for Liquidity Coverage Ratio (LCR) and Net Stable Funding Ratio (NSFR) purposes. Romanian primary dealers, with ~22% of total assets in government securities, face direct operational exposure to HQLA management requirements. Misallocating HQLA to repo counterparties when it is needed for the regulatory buffer creates compliance breaches.

### How CollateralOS Addresses It

- **HQLA visibility:** The Collateral Inventory view provides real-time haircut-adjusted HQLA values across all custody locations, enabling treasury to maintain the required buffer without manual cross-system reconciliation
- **Cheapest-to-deliver optimisation:** The Portfolio Optimisation module recommends collateral allocations that minimise HQLA usage — deploying lower-quality eligible assets first and reserving Level 1 HQLA for regulatory buffer requirements
- **Encumbrance state machine:** Each asset's encumbrance state (Free / Reserved / Repo / Pledged / Restricted) is tracked in real time, preventing the double-counting errors that create LCR calculation gaps
- **Concentration limit enforcement:** Automated enforcement of per-ISIN and per-counterparty concentration limits reduces the risk of buffer concentration in single issuers

---

## 5. ECB Supervisory Expectations (SREP / AQR)

### The Context

ECB supervisory reviews of significant institutions (and BNR reviews of less-significant institutions under the SSM framework) increasingly focus on the quality of internal controls around collateral management and liquidity risk. Inspectors request complete, time-ordered audit trails of collateral decisions — including who approved what, when, under what authority, and what the before/after state of the collateral pool was.

### What CollateralOS Provides for Inspections

The Audit Trail module is designed to be the primary document of record for a supervisory inspection of collateral management:

- **Complete coverage:** 100% of collateral decisions — repo creation, basket allocation, margin top-up, collateral substitution, settlement instruction, position override — are captured
- **Immutable records:** Audit events are append-only and hash-chained; tampering is detectable
- **Structured fields:** Every event includes timestamp (ISO 8601), user identity, role, action type, object identifier, before-state, after-state, and free-text justification where applicable
- **Export formats:** CSV export for bulk inspection requests; API access for integration with your existing compliance reporting infrastructure
- **Retention:** Configurable retention period (default 90 days rolling; adjustable to 5+ years for EMIR compliance)
- **Instant query:** Full-text search, date range, role filter, and action type filter — a complete inspection response can be produced in minutes, not hours

---

## Regulatory Classification (Phase 1)

CollateralOS Phase 1 is enterprise workflow software operating within the existing perimeter of your banking license. It does not:

- Issue, transfer, or represent ownership of financial instruments
- Hold client assets or act as a custodian
- Process payments or operate as a payment institution
- Fall within the scope of MiCA, the DLT Pilot Regime, or investment services regulation (MiFID II)

**Recommended action:** Obtain a brief legal opinion from Romanian external counsel confirming this classification under Romanian law and EU regulation before the first enterprise pilot go-live. This protects both the bank and the vendor in the event of future regulatory enquiry.

CollateralOS will provide a Phase 1 technical and legal summary document to support this review.

---

## Summary Table

| Regulation | Obligation addressed | How |
|---|---|---|
| SFTR (EU 2015/2365) | T+1 trade reporting to ARM | Automated ESMA XML report generation per trade; UTI generation; ARM connectivity roadmap |
| EMIR (EU 648/2012) | Margin documentation & collateral control | Encumbrance tracking; margin exception workflows; 5-year audit retention |
| NBR Reg. 5/2013 | Segregation of duties; operational risk | Four-eyes enforcement; role-based access; immutable audit trail |
| Basel IV / CRR3 | LCR/NSFR HQLA management | Real-time HQLA visibility; cheapest-to-deliver optimisation; concentration limits |
| ECB SREP / BNR inspection | Audit trail completeness | 100% decision capture; hash-chained immutable log; instant export |

---

*CollateralOS · Regulatory positioning paper v2026.04 · For institutional review only · collateralos.app*
