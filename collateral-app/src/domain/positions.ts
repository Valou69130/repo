// ─── Domain — Collateral Position Model ──────────────────────────────────────
//
// CollateralPosition is a first-class domain object that elevates a raw Asset
// record into a fully-stateful settlement entity, enriched with:
//   • settlement identity   — ledger type, accounts, instruction references
//   • ownership chain       — legal owner, operational controller
//   • encumbrance state     — Free / Reserved / Repo / Pledged / Restricted
//   • reconciliation state  — Matched / Breaks / Pending / Unmatched
//   • lifecycle event log   — ordered, typed, actor-attributed events
//   • source ledger metadata— system BICs, safekeeping accounts, protocols
//
// derivePositions() derives CollateralPosition[] from data already present
// in the DomainStore — no additional API calls required.

import type { Asset, Repo, AuditEntry } from "./types";

// ── Type definitions ──────────────────────────────────────────────────────────

export type LedgerType =
  | "SaFIR"
  | "TARGET2-Securities"
  | "Euroclear"
  | "BVB CSD"
  | "Internal";

export type EncumbranceState =
  | "Free"
  | "Reserved"
  | "Repo"
  | "Pledged"
  | "Restricted";

export type ReconciliationState =
  | "Matched"
  | "Breaks"
  | "Pending"
  | "Unmatched";

export type PositionStatus =
  | "Active"
  | "Pending Settlement"
  | "Settled"
  | "Maturing"
  | "Recalled"
  | "Failed";

export type PositionEventType =
  | "created"
  | "allocated"
  | "settled"
  | "margined"
  | "substituted"
  | "recalled"
  | "recon_update"
  | "valuation"
  | "state_change"
  | "instruction";

export interface PositionEvent {
  id:          string;
  ts:          string;
  type:        PositionEventType;
  description: string;
  actor:       string;
  system:      string;
  prev?:       string;
  next?:       string;
}

export interface LedgerMetadata {
  system:              string;
  accountId:           string;
  safekeepingAccount:  string;
  quantity:            number;
  nominalValue:        number;
  settlementDate:      string;
  valueDate:           string;
  instructionRef:      string;
  counterpartyBIC:     string;
  custodianBIC:        string;
  messagingProtocol:   string;
}

export interface LifecycleEntry {
  state:  string;
  ts:     string;
  actor:  string;
  note?:  string;
}

export interface CollateralPosition {
  id:                  string;   // POS-001
  assetId:             string;
  isin:                string;
  name:                string;
  currency:            string;
  type:                string;
  quantity:            number;   // face / nominal value
  marketValue:         number;
  haircutPct:          number;
  haircutAdjValue:     number;
  legalOwner:          string;
  controller:          string;
  linkedRepoId:        string | null;
  ledgerType:          LedgerType;
  positionStatus:      PositionStatus;
  encumbranceState:    EncumbranceState;
  reconciliationState: ReconciliationState;
  eligibility:         string;
  custody:             string;
  lastUpdate:          string;
  events:              PositionEvent[];
  ledgerMetadata:      LedgerMetadata;
  lifecycleHistory:    LifecycleEntry[];
}

// ── Private helpers ────────────────────────────────────────────────────────────

function resolveLedgerType(custody: string): LedgerType {
  const c = custody.toLowerCase();
  if (c.includes("safir") || c.includes("bnr")) return "SaFIR";
  if (c.includes("global custody"))             return "Euroclear";
  if (c.includes("bvb"))                        return "BVB CSD";
  if (c.includes("t2s") || c.includes("target")) return "TARGET2-Securities";
  return "Internal";
}

function resolveEncumbranceState(asset: Asset, repo: Repo | null): EncumbranceState {
  if (asset.status === "Pledged")  return "Pledged";
  if (asset.status === "Locked")   return repo ? "Repo" : "Restricted";
  if (asset.status === "Reserved") return "Reserved";
  return "Free";
}

function resolveReconciliationState(asset: Asset, repo: Repo | null): ReconciliationState {
  if (!repo) return asset.status === "Reserved" ? "Pending" : "Matched";
  if (repo.state === "Margin deficit") return "Breaks";
  if (repo.state === "Maturing")       return "Pending";
  return "Matched";
}

function resolvePositionStatus(asset: Asset, repo: Repo | null): PositionStatus {
  if (!repo) {
    if (asset.status === "Pledged")  return "Active";
    if (asset.status === "Reserved") return "Pending Settlement";
    return "Active";
  }
  if (repo.state === "Maturing") return "Maturing";
  if (repo.state === "Closed")   return "Settled";
  return "Active";
}

const LEDGER_BICS: Record<LedgerType, string> = {
  "SaFIR":               "BRDEROBU",
  "TARGET2-Securities":  "CRESTGB2L",
  "Euroclear":           "MGTCBEBEECL",
  "BVB CSD":             "BVBUROBU",
  "Internal":            "BRBUROBUX",
};

const LEDGER_ACCOUNTS: Record<LedgerType, { accountId: string; safekeeping: string }> = {
  "SaFIR":               { accountId: "BNR-SAFIR-001", safekeeping: "SK-BNR-2026-RON" },
  "TARGET2-Securities":  { accountId: "T2S-BCR-4421",  safekeeping: "SK-T2S-2026-EUR" },
  "Euroclear":           { accountId: "EC-92837-XX",   safekeeping: "SK-EC-GBL-001"   },
  "BVB CSD":             { accountId: "BVB-CSD-3301",  safekeeping: "SK-BVB-RON-007"  },
  "Internal":            { accountId: "INT-BOOK-001",  safekeeping: "SK-INT-RON-000"  },
};

const MESSAGING: Record<LedgerType, string> = {
  "SaFIR":               "Proprietary SaFIR API v3.1",
  "TARGET2-Securities":  "ISO 20022 sese.023.001.06",
  "Euroclear":           "SWIFT MT54x / ISO 15022",
  "BVB CSD":             "ISO 20022 sese.023.001.04",
  "Internal":            "Internal Message Bus (AMQP)",
};

const LEGAL_OWNERS: Record<string, string> = {
  "RON": "BNR Collateral Desk",
  "EUR": "BCR International Treasury",
};

const CONTROLLERS: Record<EncumbranceState, string> = {
  "Free":       "Collateral Desk / Free Pool",
  "Reserved":   "Repo Ops / Pre-Allocation",
  "Repo":       "Repo Ops / Encumbrance Desk",
  "Pledged":    "Legal / Pledge Registry",
  "Restricted": "Risk Management",
};

function buildInstructionRef(assetId: string): string {
  const hash = assetId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return `INST-${assetId}-${((hash * 7919) & 0xFFFFFF).toString(16).toUpperCase().padStart(6, "0")}`;
}

function fmt(value: number, currency: string): string {
  return new Intl.NumberFormat("en-RO", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(value);
}

function generateEvents(
  asset:  Asset,
  repo:   Repo | null,
  audit:  AuditEntry[],
  posId:  string,
): PositionEvent[] {
  const ledger = resolveLedgerType(asset.custody);
  const events: PositionEvent[] = [];

  events.push({
    id:          `${posId}-E001`,
    ts:          "2026-04-01 07:30",
    type:        "created",
    description: "Position initialised from Start-of-Day ledger snapshot",
    actor:       "System / Ledger Adapter",
    system:      ledger,
    next:        "Active",
  });

  events.push({
    id:          `${posId}-E002`,
    ts:          "2026-04-01 08:00",
    type:        "valuation",
    description: `Daily mark-to-market: ${fmt(asset.marketValue, asset.currency)} · haircut-adj ${fmt(asset.marketValue * (1 - asset.haircut / 100), asset.currency)}`,
    actor:       "Risk / Pricing Engine",
    system:      "Internal",
  });

  if (repo && repo.state !== "Closed") {
    events.push({
      id:          `${posId}-E003`,
      ts:          "2026-04-01 09:10",
      type:        "allocated",
      description: `Allocated to repo ${repo.id} — ${repo.counterparty}`,
      actor:       "Collateral Manager",
      system:      "Collateral OS",
      prev:        "Free",
      next:        asset.status,
    });

    if (repo.settlement === "Confirmed") {
      events.push({
        id:          `${posId}-E004`,
        ts:          "2026-04-01 09:22",
        type:        "settled",
        description: "Settlement instruction confirmed by custodian",
        actor:       "Operations Analyst",
        system:      ledger,
        prev:        "Pending Settlement",
        next:        "Settled",
      });
    } else if (repo.settlement === "Awaiting confirmation") {
      events.push({
        id:          `${posId}-E004`,
        ts:          "2026-04-01 09:18",
        type:        "instruction",
        description: "Settlement instruction dispatched — pending custodian acknowledgement",
        actor:       "Repo Ops Desk",
        system:      ledger,
      });
    }
  }

  // Derive events from the audit trail
  const relevantAudit = audit.filter(e =>
    e.object === asset.id ||
    (repo && e.object === repo.id) ||
    e.comment?.includes(asset.id) ||
    (repo && e.comment?.includes(repo.id))
  );

  relevantAudit.forEach((entry, i) => {
    const eventType: PositionEventType =
      entry.action.includes("margin")     ? "margined"    :
      entry.action.includes("settlement") ? "settled"     :
      entry.action.includes("allocation") ? "allocated"   :
      entry.action.includes("substitute") ? "substituted" :
      "state_change";

    events.push({
      id:          `${posId}-AUDIT-${i}`,
      ts:          entry.ts,
      type:        eventType,
      description: entry.comment || entry.action,
      actor:       `${entry.user} (${entry.role})`,
      system:      "Collateral OS",
      prev:        entry.prev,
      next:        entry.next,
    });
  });

  if (repo?.state === "Margin deficit") {
    events.push({
      id:          `${posId}-E005`,
      ts:          "2026-04-01 11:05",
      type:        "margined",
      description: "Reconciliation break flagged — collateral shortfall on linked repo",
      actor:       "Margin Protection Agent",
      system:      "Collateral OS",
      prev:        "Matched",
      next:        "Breaks",
    });
  }

  if (repo?.state === "Maturing") {
    events.push({
      id:          `${posId}-E006`,
      ts:          "2026-04-01 15:30",
      type:        "recalled",
      description: "Maturity notice issued — unwind and collateral recall in progress",
      actor:       "Repo Ops Desk",
      system:      "Internal",
    });
  }

  if (asset.status === "Pledged") {
    events.push({
      id:          `${posId}-E007`,
      ts:          "2026-04-01 10:00",
      type:        "state_change",
      description: "Asset pledged under bilateral collateral arrangement",
      actor:       "Treasury Manager",
      system:      "Internal",
      prev:        "Available",
      next:        "Pledged",
    });
  }

  return events.sort((a, b) => a.ts.localeCompare(b.ts));
}

function generateLifecycle(asset: Asset, repo: Repo | null): LifecycleEntry[] {
  const entries: LifecycleEntry[] = [
    { state: "Position Created",    ts: "2026-04-01 07:30", actor: "System",                note: "SoD ledger snapshot loaded" },
    { state: "Valuation Confirmed", ts: "2026-04-01 08:05", actor: "Risk / Pricing Engine" },
  ];

  if (repo && repo.state !== "Closed") {
    entries.push({ state: "Allocated to Repo",   ts: "2026-04-01 09:10", actor: "Collateral Manager", note: `Repo ${repo.id}` });

    if (repo.settlement === "Confirmed") {
      entries.push({ state: "Settlement Confirmed", ts: "2026-04-01 09:22", actor: "Operations Analyst" });
    } else if (repo.settlement === "Awaiting confirmation") {
      entries.push({ state: "Pending Settlement",   ts: "2026-04-01 09:18", actor: "Repo Ops Desk",     note: "Awaiting custodian confirmation" });
    }
  }

  if (repo?.state === "Margin deficit") {
    entries.push({ state: "Reconciliation Break", ts: "2026-04-01 11:05", actor: "Margin Agent",       note: "Collateral shortfall detected" });
  }

  if (repo?.state === "Maturing") {
    entries.push({ state: "Unwind Initiated",     ts: "2026-04-01 15:30", actor: "Repo Ops Desk" });
  }

  if (asset.status === "Pledged") {
    entries.push({ state: "Pledged",              ts: "2026-04-01 10:00", actor: "Treasury Manager",  note: "Bilateral pledge arrangement" });
  }

  if (repo?.state === "Closed") {
    entries.push({ state: "Collateral Recalled",  ts: "2026-03-29 16:00", actor: "Repo Ops Desk",    note: "Repo matured — collateral returned" });
    entries.push({ state: "Position Settled",     ts: "2026-03-29 16:30", actor: "System" });
  }

  return entries;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function derivePositions(
  assets: Asset[],
  repos:  Repo[],
  audit:  AuditEntry[],
): CollateralPosition[] {
  // Build asset → active repo mapping
  const repoByAsset = new Map<string, Repo>();
  for (const repo of repos) {
    for (const assetId of (repo.assets ?? [])) {
      if (!repoByAsset.has(assetId)) {
        repoByAsset.set(assetId, repo);
      }
    }
  }

  return assets.map((asset, idx) => {
    const repo        = repoByAsset.get(asset.id) ?? null;
    const ledgerType  = resolveLedgerType(asset.custody);
    const encumbrance = resolveEncumbranceState(asset, repo);
    const recon       = resolveReconciliationState(asset, repo);
    const status      = resolvePositionStatus(asset, repo);
    const posId       = `POS-${String(idx + 1).padStart(3, "0")}`;
    const accounts    = LEDGER_ACCOUNTS[ledgerType];

    const lastUpdate =
      repo?.state === "Margin deficit"        ? "2026-04-01 11:05" :
      repo?.state === "Maturing"              ? "2026-04-01 15:30" :
      repo?.settlement === "Confirmed"        ? "2026-04-01 09:22" :
      repo?.settlement === "Awaiting confirmation" ? "2026-04-01 09:18" :
                                                "2026-04-01 08:05";

    // Show active repo linkage only if repo is not closed
    const activeRepoId = repo && repo.state !== "Closed" ? repo.id : null;

    return {
      id:                  posId,
      assetId:             asset.id,
      isin:                asset.isin,
      name:                asset.name,
      currency:            asset.currency,
      type:                (asset as { type?: string }).type ?? "Unknown",
      quantity:            asset.marketValue,   // nominal / face value proxy
      marketValue:         asset.marketValue,
      haircutPct:          asset.haircut,
      haircutAdjValue:     asset.marketValue * (1 - asset.haircut / 100),
      legalOwner:          LEGAL_OWNERS[asset.currency] ?? "BNR Collateral Desk",
      controller:          CONTROLLERS[encumbrance],
      linkedRepoId:        activeRepoId,
      ledgerType,
      positionStatus:      status,
      encumbranceState:    encumbrance,
      reconciliationState: recon,
      eligibility:         asset.eligibility,
      custody:             asset.custody,
      lastUpdate,
      events:              generateEvents(asset, repo, audit, posId),
      ledgerMetadata: {
        system:             ledgerType,
        accountId:          accounts.accountId,
        safekeepingAccount: accounts.safekeeping,
        quantity:           asset.marketValue,
        nominalValue:       asset.marketValue,
        settlementDate:     repo?.startDate ?? "2026-04-01",
        valueDate:          "2026-04-01",
        instructionRef:     buildInstructionRef(asset.id),
        counterpartyBIC:    activeRepoId ? "BRDEROBU" : "—",
        custodianBIC:       LEDGER_BICS[ledgerType],
        messagingProtocol:  MESSAGING[ledgerType],
      },
      lifecycleHistory: generateLifecycle(asset, repo),
    };
  });
}
