// ─── Canonical Internal Domain Models ───────────────────────────────────────
// These are the ONLY shapes that flow through the integration bus.
// Adapters must map external formats → these before emitting events.
// No business logic here — pure data constructors with safe defaults.

let _idSeq = 0;
function uid(prefix) {
  _idSeq += 1;
  return `${prefix}-${String(_idSeq).padStart(4, "0")}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

export function createAsset({
  id, isin, name, currency, marketValue, haircut, status, custody, eligibility,
}) {
  return { id, isin, name, currency: currency || "RON", marketValue, haircut, status, custody, eligibility };
}

export function createCollateralPosition({
  id, assetId, repoId, quantity, marketValue, adjustedValue, currency, lockedAt, custody, status,
}) {
  return {
    id: id || uid("POS"),
    assetId, repoId, quantity: quantity || 0,
    marketValue: marketValue || 0,
    adjustedValue: adjustedValue || 0,
    currency: currency || "RON",
    lockedAt: lockedAt || new Date().toISOString(),
    custody: custody || "Unknown",
    status: status || "locked",
  };
}

export function createRepoTrade({
  id, counterpartyId, counterpartyLei, startDate, maturityDate,
  rate, amount, currency, dayCount, collateralIsins, state,
  settlementType, tradeSource,
}) {
  return {
    id: id || uid("TRD"),
    counterpartyId, counterpartyLei,
    startDate, maturityDate,
    rate, amount,
    currency:       currency       || "RON",
    dayCount:       dayCount       || 360,
    collateralIsins: collateralIsins || [],
    state:          state          || "draft",
    settlementType: settlementType || "DVP",
    tradeSource:    tradeSource    || "manual",
  };
}

export function createSettlementInstruction({
  id, repoId, assetId, isin, assetName, deliverySide,
  quantity, amount, currency, settlementDate,
  custodyAccount, counterpartyCustody,
  deliveryAgentBic, receivingAgentBic,
  rawMessage, status, transmittedAt, confirmedAt, failureReason,
}) {
  return {
    id:                 id || uid("SI"),
    repoId,
    assetId,
    isin,
    assetName:          assetName || isin,
    deliverySide:       deliverySide || "DELIVER",   // DELIVER | RECEIVE
    quantity:           quantity || 0,
    amount:             amount || 0,
    currency:           currency || "RON",
    settlementDate,
    custodyAccount:     custodyAccount || "BNR-SAFIR-001",
    counterpartyCustody: counterpartyCustody || "UNKNOWN",
    deliveryAgentBic:   deliveryAgentBic || "BRDEROBU",
    receivingAgentBic:  receivingAgentBic || "RNCBROBUXXX",
    messageType:        "MT543",
    rawMessage:         rawMessage || "",
    status:             status || "draft",     // draft | instructed | transmitted | confirmed | failed | cancelled
    generatedAt:        new Date().toISOString(),
    transmittedAt:      transmittedAt || null,
    confirmedAt:        confirmedAt || null,
    failureReason:      failureReason || null,
  };
}

export function createMarginEvent({
  id, repoId, type, requiredAmount, postedAmount, deficit,
  currency, callIssuedAt, responseDeadline, status,
}) {
  return {
    id: id || uid("MGN"),
    repoId,
    type: type || "MARGIN_CALL",   // MARGIN_CALL | TOP_UP | RELEASE
    requiredAmount, postedAmount, deficit,
    currency: currency || "RON",
    callIssuedAt:     callIssuedAt || new Date().toISOString(),
    responseDeadline: responseDeadline || null,
    status:           status || "open",   // open | acknowledged | resolved | escalated
  };
}

export function createExceptionItem({
  id, type, severity, repoId, assetId, isin, description,
  detectedAt, status, resolution, assignedTo, source,
}) {
  return {
    id:          id || uid("EXC"),
    type,        // MISSING_EXTERNAL | MISSING_INTERNAL | VALUE_MISMATCH | STATUS_MISMATCH | SETTLEMENT_FAIL | TIMEOUT
    severity,    // Critical | Warning | Info
    repoId:      repoId || null,
    assetId:     assetId || null,
    isin:        isin || null,
    description,
    source:      source || "reconciliation",
    detectedAt:  detectedAt || new Date().toISOString(),
    status:      status || "open",   // open | acknowledged | resolved | suppressed
    resolution:  resolution || null,
    assignedTo:  assignedTo || null,
  };
}

export function createSyncRecord({
  id, runAt, adapter, totalExternal, totalInternal, matched, breaks, durationMs,
}) {
  return {
    id:            id || uid("SYNC"),
    runAt:         runAt || new Date().toISOString(),
    adapter:       adapter || "mock",
    totalExternal: totalExternal || 0,
    totalInternal: totalInternal || 0,
    matched:       matched || 0,
    breaks:        breaks || 0,
    durationMs:    durationMs || 0,
  };
}
