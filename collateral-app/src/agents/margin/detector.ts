// ─── Margin Protection Agent — Deficit Detector ──────────────────────────────
//
// Pure function: takes app-domain repos + assets → MarginAlert[].
// No side effects, no state, no I/O.
//
// Severity classification:
//   Critical  → postedCollateral < notional  (actual under-collateralisation)
//   Warning   → notional ≤ posted < requiredCollateral  (103% rule breached)
//   Watch     → posted ≥ requiredCollateral but bufferPct < THIN_THRESHOLD
//
// The returned alerts are in "detected" state with proposal = null.
// The proposer step populates proposal; the MarginProtectionAgent class
// transitions state to "proposed" or "escalated".

import type { AppMarginRepo, AppMarginAsset } from "./appTypes";
import type {
  MarginAlert,
  MarginAlertSeverity,
  MarginPosition,
  DeficitType,
} from "./types";

// ── Public constants (re-used by proposer and test data) ─────────────────────

export const COVERAGE_RATIO      = 1.03;   // 103% contractual minimum
export const THIN_THRESHOLD      = 0.05;   // bufferPct < 5% of required → Watch alert
export const MATURITY_WARN_DAYS  = 3;      // ≤ 3 days to maturity → NEAR_MATURITY flag
export const CONCENTRATION_LIMIT = 0.60;   // max single-ISIN share of basket

/** Minimum Transfer Amount by currency. */
export const MTA: Record<string, number> = {
  RON: 150_000,
  EUR:  15_000,
};

/** MTA for an unknown / unlisted currency falls back to the RON value. */
export function mtaForCurrency(currency: string): number {
  return MTA[currency] ?? MTA.RON;
}

// ── Formatting helpers (private) ──────────────────────────────────────────────

function fmtMoney(n: number, ccy = "RON"): string {
  return `${ccy} ${Math.abs(n).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

// ── Days-to-maturity ──────────────────────────────────────────────────────────

function daysToMaturity(maturityDate: string, now: number = Date.now()): number {
  const mat = new Date(maturityDate).getTime();
  return Math.max(0, Math.ceil((mat - now) / 86_400_000));
}

// ── Concentration risk ────────────────────────────────────────────────────────

/**
 * Returns true if any single ISIN in the repo's posted basket exceeds the
 * single-ISIN concentration limit (measured by adjusted value share).
 */
function hasConcentrationRisk(
  repoAssetIds: string[],
  allAssets:    AppMarginAsset[],
): boolean {
  if (repoAssetIds.length === 0) return false;

  const positions = repoAssetIds
    .map((id) => allAssets.find((a) => a.id === id))
    .filter(Boolean) as AppMarginAsset[];

  const totalAdj = positions.reduce(
    (s, a) => s + a.marketValue * (1 - a.haircut / 100),
    0,
  );
  if (totalAdj === 0) return false;

  const isinValues = new Map<string, number>();
  for (const a of positions) {
    const adj = a.marketValue * (1 - a.haircut / 100);
    isinValues.set(a.isin, (isinValues.get(a.isin) ?? 0) + adj);
  }

  for (const val of isinValues.values()) {
    if (val / totalAdj > CONCENTRATION_LIMIT) return true;
  }
  return false;
}

// ── Position builder ──────────────────────────────────────────────────────────

function buildPosition(repo: AppMarginRepo): MarginPosition {
  const notional           = repo.amount;
  const requiredCollateral = repo.requiredCollateral > 0
    ? repo.requiredCollateral
    : Math.round(notional * COVERAGE_RATIO);
  const postedCollateral   = repo.postedCollateral;
  const deficit            = postedCollateral - requiredCollateral;
  const coverageRatio      = notional > 0 ? postedCollateral / notional : 0;
  const targetRatio        = notional > 0 ? requiredCollateral / notional : COVERAGE_RATIO;
  const bufferAbs          = Math.abs(deficit);
  const bufferPct          = targetRatio > 0 ? (coverageRatio - targetRatio) / targetRatio : 0;

  return {
    repoId:             repo.id,
    counterparty:       repo.counterparty,
    currency:           repo.currency,
    notional,
    requiredCollateral,
    postedCollateral,
    deficit,
    coverageRatio,
    targetRatio,
    bufferAbs,
    bufferPct,
  };
}

// ── Severity classifier ───────────────────────────────────────────────────────

function classifySeverity(pos: MarginPosition): MarginAlertSeverity {
  if (pos.postedCollateral < pos.notional)            return "Critical";
  if (pos.postedCollateral < pos.requiredCollateral)  return "Warning";
  return "Watch";
}

// ── Deficit type classifier ───────────────────────────────────────────────────

function classifyDeficitTypes(
  pos:      MarginPosition,
  dtm:      number,
  hasConc:  boolean,
  mta:      number,
): DeficitType[] {
  const types: DeficitType[] = [];
  const shortfall = pos.requiredCollateral - pos.postedCollateral;

  if (pos.postedCollateral < pos.requiredCollateral) {
    // There is a real shortfall — classify as BELOW_MTA or BELOW_THRESHOLD
    types.push(shortfall < mta ? "BELOW_MTA" : "BELOW_THRESHOLD");
  }

  if (
    pos.postedCollateral >= pos.requiredCollateral &&
    pos.bufferPct < THIN_THRESHOLD
  ) {
    types.push("THIN_BUFFER");
  }

  if (hasConc)                              types.push("CONCENTRATION_RISK");
  if (dtm <= MATURITY_WARN_DAYS && shortfall > 0) types.push("NEAR_MATURITY");

  return types;
}

// ── Explanation builder ───────────────────────────────────────────────────────

function buildExplanation(
  pos:          MarginPosition,
  severity:     MarginAlertSeverity,
  deficitTypes: DeficitType[],
  mta:          number,
): string[] {
  const lines: string[] = [];
  const shortfall = Math.max(0, pos.requiredCollateral - pos.postedCollateral);
  const ccy = pos.currency;

  switch (severity) {
    case "Critical":
      lines.push(
        `Posted collateral ${fmtMoney(pos.postedCollateral, ccy)} is below the repo ` +
        `notional ${fmtMoney(pos.notional, ccy)} — ` +
        `actual under-collateralisation at ${fmtPct(pos.coverageRatio)} coverage (target: ${fmtPct(pos.targetRatio)}).`,
      );
      break;

    case "Warning":
      lines.push(
        `Posted collateral ${fmtMoney(pos.postedCollateral, ccy)} is below the ` +
        `required ${fmtMoney(pos.requiredCollateral, ccy)} (${fmtPct(pos.targetRatio)} rule). ` +
        `Shortfall: ${fmtMoney(shortfall, ccy)}.`,
      );
      break;

    case "Watch":
      lines.push(
        `Coverage ${fmtPct(pos.coverageRatio)} exceeds the ${fmtPct(pos.targetRatio)} threshold, ` +
        `but the buffer ${fmtMoney(pos.bufferAbs, ccy)} is dangerously thin ` +
        `(${fmtPct(Math.max(0, pos.bufferPct))} above target). ` +
        `Minor market moves could trigger a formal breach.`,
      );
      break;
  }

  if (deficitTypes.includes("BELOW_MTA")) {
    lines.push(
      `Shortfall ${fmtMoney(shortfall, ccy)} is below the MTA of ${fmtMoney(mta, ccy)} — ` +
      `no formal margin call triggered yet, but active monitoring is required.`,
    );
  } else if (deficitTypes.includes("BELOW_THRESHOLD")) {
    lines.push(
      `Shortfall ${fmtMoney(shortfall, ccy)} ≥ MTA ${fmtMoney(mta, ccy)} — ` +
      `a formal margin call must be issued.`,
    );
  }

  lines.push(
    `Coverage ratio: ${fmtPct(pos.coverageRatio)} | ` +
    `Target: ${fmtPct(pos.targetRatio)} | ` +
    `Buffer: ${pos.deficit >= 0 ? "+" : ""}${fmtMoney(pos.deficit, ccy)}.`,
  );

  return lines;
}

// ── Risk factor builder ───────────────────────────────────────────────────────

function buildRiskFactors(
  pos:          MarginPosition,
  deficitTypes: DeficitType[],
  dtm:          number,
): string[] {
  const factors: string[] = [];
  const ccy = pos.currency;

  if (deficitTypes.includes("NEAR_MATURITY")) {
    factors.push(
      `Repo matures in ${dtm} day${dtm !== 1 ? "s" : ""} — ` +
      `time-critical: any top-up collateral must settle before maturity date.`,
    );
  }

  if (deficitTypes.includes("CONCENTRATION_RISK")) {
    factors.push(
      `Single-ISIN concentration in the posted basket exceeds ${fmtPct(CONCENTRATION_LIMIT)} — ` +
      `diversification risk; counterparty may challenge haircut applicability.`,
    );
  }

  if (deficitTypes.includes("THIN_BUFFER")) {
    factors.push(
      `Buffer ${fmtMoney(pos.bufferAbs, ccy)} (${fmtPct(Math.max(0, pos.bufferPct))} above target) ` +
      `is within the early-warning band. ` +
      `A collateral value decline of ${fmtMoney(pos.bufferAbs, ccy)} would trigger a formal breach.`,
    );
  }

  return factors;
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface DetectOptions {
  /** Override the current timestamp (ISO string) — useful for deterministic tests. */
  now?:     string;
  /** Override the thin-buffer threshold (default: THIN_THRESHOLD = 0.05). */
  thinPct?: number;
}

// ── Main detection function ───────────────────────────────────────────────────

/**
 * Scan all active repos and return a MarginAlert for each that
 * has a deficit or a dangerously thin buffer.
 *
 * Returned alerts are in "detected" state with proposal = null.
 * They are sorted: Critical → Warning → Watch.
 *
 * @param repos   all repos (agent filters to non-Closed internally)
 * @param assets  full inventory (used only for concentration-risk detection)
 * @param opts    optional overrides for testing
 */
export function detectAlerts(
  repos:  AppMarginRepo[],
  assets: AppMarginAsset[],
  opts?:  DetectOptions,
): MarginAlert[] {
  const nowStr   = opts?.now  ?? new Date().toISOString();
  const thinPct  = opts?.thinPct ?? THIN_THRESHOLD;
  const nowMs    = new Date(nowStr).getTime();

  const alerts: MarginAlert[] = [];

  for (const repo of repos) {
    // Skip closed repos — no margin monitoring needed
    if (repo.state === "Closed") continue;

    const pos      = buildPosition(repo);
    const mta      = mtaForCurrency(repo.currency);
    const dtm      = daysToMaturity(repo.maturityDate, nowMs);
    const hasConc  = hasConcentrationRisk(repo.assets ?? [], assets);

    const hasShortfall  = pos.postedCollateral < pos.requiredCollateral;
    const hasThinBuffer =
      pos.postedCollateral >= pos.requiredCollateral &&
      pos.bufferPct < thinPct;

    // Only generate an alert when there is an actionable issue
    if (!hasShortfall && !hasThinBuffer) continue;

    const severity     = classifySeverity(pos);
    const deficitTypes = classifyDeficitTypes(pos, dtm, hasConc, mta);
    const shortfall    = Math.max(0, pos.requiredCollateral - pos.postedCollateral);
    const callRequired = hasShortfall && shortfall >= mta;
    const explanation  = buildExplanation(pos, severity, deficitTypes, mta);
    const riskFactors  = buildRiskFactors(pos, deficitTypes, dtm);

    alerts.push({
      id:                    `MA-${repo.id}`,
      position:              pos,
      severity,
      state:                 "detected",
      deficitTypes,
      explanation,
      riskFactors,
      callRequired,
      minimumTransferAmount: mta,
      proposal:              null,
      detectedAt:            nowStr,
      reviewedAt:            null,
      approvedAt:            null,
      resolvedAt:            null,
    });
  }

  // Sort: Critical → Warning → Watch
  const severityOrder: Record<string, number> = { Critical: 0, Warning: 1, Watch: 2 };
  alerts.sort(
    (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3),
  );

  return alerts;
}
