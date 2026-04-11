# CollateralOS — Technical Integration Overview

## Architecture Summary

CollateralOS is a **workflow orchestration layer** deployed between your existing systems and the people who manage collateral operations. It does not replace any infrastructure — it adds the coordination, approval routing, and audit capability that existing systems lack.

```
┌─────────────────────────────────────────────────────────────┐
│                     CollateralOS Platform                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Workflow     │  │  Rule Engine │  │   Audit Trail    │  │
│  │  Orchestration│  │  (eligibility│  │   (immutable,    │  │
│  │  (approval    │  │   haircuts,  │  │   tamper-evident)│  │
│  │   routing)    │  │   limits)    │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
          │                    │                    │
    ┌─────▼─────┐      ┌───────▼──────┐    ┌───────▼──────┐
    │  SaFIR /  │      │  Core Banking│    │  Euroclear / │
    │  BNR      │      │  System      │    │  Clearstream │
    └───────────┘      └──────────────┘    └──────────────┘
```

---

## Integration Points

### 1. SaFIR (BNR Government Securities Registry)

**Phase 1 — Bank-side data feed (CSV/API)**
The primary integration path in Phase 1 does not require direct SaFIR API access. CollateralOS ingests position and asset data through a bank-side export from your SaFIR interface, eliminating the need for BNR API credentials or a direct infrastructure connection during the pilot phase.

- **Format:** CSV (template provided) or direct API call to your internal SaFIR position feed
- **Frequency:** End-of-day batch or intraday refresh (configurable)
- **Fields imported:** ISIN, quantity, market value, haircut, custody location, encumbrance status, settlement state
- **No direct SaFIR API access required in Phase 1**

**Phase 2 — Direct SaFIR feed**
Subject to BNR connectivity agreements, Phase 2 will introduce a real-time position feed from SaFIR, eliminating manual export steps.

### 2. Core Banking System

**Integration method:** REST API or CSV export  
**Data consumed:** Counterparty credit limits, bilateral agreement parameters (GMRA version, coverage ratio, MTA), repo trade confirmations  
**Data written back:** Optional — CollateralOS can push settled trade confirmations and margin call events to your core banking audit log via webhook

No core banking system modification is required. CollateralOS reads from your existing data surfaces.

### 3. Euroclear / Clearstream

**Phase 1:** Position and collateral data ingested via CSV export from your custodian portal (same pattern as SaFIR above).  
**Roadmap (Q4 2026 / Q1 2027):** Native Euroclear API connectivity using the SWIFT/ISO 20022 settlement instruction interface for direct MT543 delivery.

### 4. Market Data (Bloomberg / Refinitiv)

**Phase 1:** Asset market values and haircuts are manually maintained or imported with position data.  
**Roadmap:** Intraday price feed integration for automatic position revaluation and real-time coverage ratio updates.

### 5. Trade Repository (SFTR Reporting — Regis-TR)

**Phase 1:** CollateralOS generates ESMA-compliant SFTR XML reports (UTI, LEI, ISIN, notional, rate, tenor, collateral quality, re-use flag) for manual submission to Regis-TR or your existing ARM.  
**Phase 2 (Q1 2027):** Direct ARM connectivity — automated T+1 submission without manual intervention.

---

## Deployment Architecture

### Option A: Cloud-Hosted (Default)

- Frontend: Vercel (global CDN, HTTPS, automatic TLS)
- API: Railway or AWS (configurable region — EU-West for data residency compliance)
- Database: PostgreSQL (isolated per-tenant schema, encrypted at rest)
- Auth: JWT in httpOnly cookies, bcrypt password hashing, 8-hour session expiry
- Data residency: EU (Frankfurt or Paris region, configurable)

### Option B: On-Premise / Private Cloud

Available for institutions with BNR data residency requirements or internal IT security policies that restrict SaaS deployments. Delivered as a Docker Compose stack deployable on your existing infrastructure.

Requirements: 2 vCPU / 4GB RAM minimum, PostgreSQL 15+, outbound HTTPS for optional ARM connectivity.

---

## Security Architecture

| Control | Implementation |
|---|---|
| Authentication | JWT (httpOnly cookie, Secure, SameSite=Strict), bcrypt password hashing |
| Session management | 8-hour expiry, server-side invalidation on logout |
| Transport security | TLS 1.2+ enforced, HSTS enabled |
| API rate limiting | 10 login attempts / 15 min; 120 write ops / min per session |
| Input validation | Server-side validation on all endpoints; parameterised queries throughout |
| Audit logging | Every API write operation produces an immutable audit event (timestamp, user, role, action, before/after state) |
| Role-based access | Four roles enforced server-side: Treasury Manager, Collateral Manager, Operations Analyst, Risk Reviewer |
| Data encryption | At-rest encryption on all database volumes (AES-256) |
| Penetration testing | Scheduled prior to first enterprise pilot go-live |
| SOC 2 Type II | Audit initiated Q4 2026; report available Q1 2027 |

---

## Roles & Permissions

| Role | Can do | Cannot do |
|---|---|---|
| Treasury Manager | Create, rollover, close repos; propose collateral substitution | Approve own top-ups |
| Collateral Manager | Approve margin top-ups; approve/reject substitutions; import assets | Create or close repos |
| Operations Analyst | Advance settlement instructions; view all data | Modify trades or collateral |
| Risk Reviewer | Export reports; view all data | Any write operation |

---

## Data Model (Phase 1)

| Entity | Key fields |
|---|---|
| Assets | ISIN, type, market value, haircut, eligibility, custody location (SaFIR / Euroclear), encumbrance status |
| Repos | Counterparty, principal, rate, tenor, state, collateral basket, margin buffer, settlement status |
| Counterparties | LEI, GMRA version, credit limit, coverage ratio, MTA, settlement system |
| Audit Events | Timestamp, user, role, action, object ID, before-state, after-state, justification |
| Notifications | Severity (Critical / Warning / Info), linked repo, SLA deadline, escalation state |

---

## Pilot Integration Scope

During the 6–8 week pilot, the integration workload on your IT team is minimal:

**Week 1–2 (Setup):** Provide a CSV export of your current asset universe and counterparty list. CollateralOS configures the platform to your exact haircut schedules, eligibility rules, and approval hierarchies.

**Week 3–4 (Data flow):** Establish the position data refresh cadence (daily CSV export or API hook). Validate that asset and repo data matches your source systems.

**Week 5–8 (Go-live):** Operations team runs live workflows alongside existing manual processes. Parallel run validates data accuracy and workflow coverage before cutover.

**No core banking system changes required for the pilot.**

---

*CollateralOS · Technical documentation v2026.04 · collateralos.app*
