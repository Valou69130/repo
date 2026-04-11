# CollateralOS — One Page

## The Problem

Romanian banks manage billions in government securities every day. Yet the operational infrastructure behind that activity — repo booking, collateral allocation, margin monitoring, settlement, and regulatory reporting — runs on a combination of spreadsheets, email chains, and manual SaFIR lookups.

The result is four compounding failures every trading day:

**Inventory opacity.** Collateral managers start each day with a phone-and-spreadsheet reconciliation across SaFIR, Euroclear, and internal systems to find out what's actually free. By the time the picture is clear, the morning window for repo activity is half gone.

**Workflow fragmentation.** Repo booking, basket selection, approval routing, and settlement instruction generation each live in different inboxes. The four-eyes principle is enforced by CC'ing a manager on an email. There is no system of record.

**Margin management lag.** Deficits are detected late — when someone checks the spreadsheet, not when they occur. The response workflow (identify eligible top-up, obtain approval, confirm with counterparty) takes hours. By EMIR standards, it should take minutes.

**Compliance and audit risk.** SFTR reporting is compiled manually from multiple sources the morning after each trade. A BNR or ECB inspection requiring a complete, tamper-evident audit trail of every collateral decision would expose significant gaps at most institutions today.

---

## The Solution

**CollateralOS** is the workflow control layer that sits between your people and your collateral infrastructure. It does not replace SaFIR, Euroclear, or your core banking system — it orchestrates them.

| Module | What it does |
|---|---|
| Collateral Inventory | Real-time view of all assets across custodians — free, pledged, encumbered — with haircut-adjusted values and eligibility labels |
| Repo Workflow Engine | Four-step guided repo creation with automatic basket proposal, over-collateralisation enforcement, and full lifecycle tracking |
| Margin Monitor | Continuous coverage ratio tracking; detects deficits in real time and routes structured top-up approval workflows |
| Collateral Substitution | Role-separated substitution with instant coverage recalculation and immutable audit capture |
| Settlement Operations | MT543 settlement instruction generation directly from confirmed trades; six-stage instruction lifecycle tracking |
| SFTR Reporting | Automated daily report generation — UTIs, LEIs, collateral ISINs — ready for ARM submission |
| Audit Trail | Immutable, tamper-evident log of every decision, approval, and state change across the platform |

---

## What Changes

| Metric | Manual today | With CollateralOS |
|---|---|---|
| Collateral basket allocation | 30–90 minutes | < 5 minutes |
| Margin exception response | 2–4 hours | < 30 minutes |
| SFTR daily report | 2–4 hours | < 15 minutes |
| Manual steps per repo trade | ~12 steps | ~3 steps |
| Audit trail completeness | Partial, fragmented | 100% — every decision captured |

---

## Why Now

SFTR obligations, Basel IV liquidity requirements, and ECB supervisory expectations are all increasing the compliance cost of manual processes. The BNR is actively participating in Eurosystem digital settlement exploratory work. Institutions that build the workflow discipline now will be positioned for the transition — not disrupted by it.

---

## Engagement Model

A CollateralOS pilot is a **6–8 week, fixed-fee engagement** configured to your institution's real asset universe, counterparty list, and approval hierarchies. You go live with your own data. You own the output from day one.

**Pilot fee:** EUR 40K–80K (one-time)  
**Annual subscription:** EUR 60K–200K (Foundation → Standard → Advanced tiers)  
**Time to value:** < 8 weeks from contract to first live workflow

---

*CollateralOS · Romania-first collateral & repo workflow platform · collateralos.app*
