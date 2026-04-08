// ─── Mock Reconciliation Adapter ─────────────────────────────────────────────
// Compares internal collateral positions against a mock external custody feed.
// Raises ExceptionItems for: VALUE_MISMATCH, MISSING_EXTERNAL, MISSING_INTERNAL,
// and STATUS_MISMATCH.
// toInternal  : external position record → canonical CollateralPosition
// fromInternal: canonical CollateralPosition → external record format
// reconcile() is the only method that contains logic — pure diffing, no domain rules.

import { BaseAdapter }              from "../BaseAdapter.js";
import { EVENT_TYPES }              from "../../core/events.js";
import { createCollateralPosition, createExceptionItem, createSyncRecord } from "../../core/models.js";

const VALUE_TOLERANCE_PCT = 0.5;   // 50 bps — breaks below this are not raised
const PHANTOM_ISIN = "RO_PHANTOM_001";

export class ReconciliationAdapter extends BaseAdapter {
  constructor(config = {}) {
    super("mock-reconciliation", "mock", config);
  }

  toInternal(extRecord) {
    return createCollateralPosition({
      id:           `EXT-${extRecord.isin}`,
      assetId:      extRecord.isin,
      repoId:       extRecord.repoRef || null,
      quantity:     extRecord.quantity || 0,
      marketValue:  extRecord.marketValue || 0,
      adjustedValue: extRecord.adjustedValue || extRecord.marketValue || 0,
      currency:     extRecord.currency || "RON",
      custody:      extRecord.custodyAccount || "UNKNOWN",
      status:       extRecord.status || "locked",
    });
  }

  fromInternal(pos) {
    return {
      isin:          pos.assetId,
      quantity:      pos.quantity,
      marketValue:   pos.marketValue,
      currency:      pos.currency,
      custodyAccount: pos.custody,
      status:        pos.status,
    };
  }

  /**
   * Run a reconciliation between internalAssets and a mock external feed.
   * Returns { exceptions, syncRecord, externalFeed }.
   * Emits RECONCILIATION_STARTED, RECONCILIATION_COMPLETED, EXCEPTION_RAISED per break.
   */
  reconcile(internalAssets) {
    const startedAt = Date.now();
    this.emit(EVENT_TYPES.RECONCILIATION_STARTED, { assetCount: internalAssets.length });

    // Build internal map: isin → asset (locked/pledged/reserved only)
    const internalLocked = internalAssets.filter((a) =>
      ["Locked", "Reserved", "Pledged"].includes(a.status)
    );
    const internalMap = new Map(internalLocked.map((a) => [a.isin, a]));

    // Generate external mock feed with deliberate discrepancies
    const externalFeed = this._generateFeed(internalLocked);
    const externalMap  = new Map(externalFeed.map((r) => [r.isin, r]));

    const exceptions = [];

    // Check every internal position against external feed
    for (const [isin, internal] of internalMap) {
      const external = externalMap.get(isin);
      if (!external) {
        const exc = createExceptionItem({
          type:        "MISSING_EXTERNAL",
          severity:    "Critical",
          isin,
          assetId:     internal.id,
          description: `${isin} (${internal.name || isin}) registered internally as "${internal.status}" but absent from custody feed.`,
          source:      "reconciliation",
        });
        exceptions.push(exc);
        this.emit(EVENT_TYPES.EXCEPTION_RAISED, { exception: exc });
        continue;
      }

      // Value mismatch check
      if (internal.marketValue > 0) {
        const delta    = Math.abs(internal.marketValue - external.marketValue);
        const deltaPct = (delta / internal.marketValue) * 100;
        if (deltaPct > VALUE_TOLERANCE_PCT) {
          const exc = createExceptionItem({
            type:        "VALUE_MISMATCH",
            severity:    deltaPct > 3 ? "Critical" : "Warning",
            isin,
            assetId:     internal.id,
            description: `Market value mismatch for ${isin}: internal ${internal.marketValue.toLocaleString()} vs custody ${external.marketValue.toLocaleString()} (Δ ${deltaPct.toFixed(2)}%).`,
            source:      "reconciliation",
          });
          exceptions.push(exc);
          this.emit(EVENT_TYPES.EXCEPTION_RAISED, { exception: exc });
        }
      }
    }

    // Phantom positions: in custody but not internal
    for (const [isin, ext] of externalMap) {
      if (!internalMap.has(isin)) {
        const exc = createExceptionItem({
          type:        "MISSING_INTERNAL",
          severity:    "Warning",
          isin,
          description: `${isin} found in custody feed (${ext.marketValue.toLocaleString()} ${ext.currency}) but not registered in internal inventory.`,
          source:      "reconciliation",
        });
        exceptions.push(exc);
        this.emit(EVENT_TYPES.EXCEPTION_RAISED, { exception: exc });
      }
    }

    const durationMs = Date.now() - startedAt;
    const syncRecord = createSyncRecord({
      adapter:       this.id,
      totalExternal: externalFeed.length,
      totalInternal: internalLocked.length,
      matched:       internalLocked.length - exceptions.filter((e) => e.type === "MISSING_EXTERNAL").length,
      breaks:        exceptions.length,
      durationMs,
    });

    this.emit(EVENT_TYPES.RECONCILIATION_COMPLETED, { syncRecord, exceptionCount: exceptions.length });

    return { exceptions, syncRecord, externalFeed };
  }

  // Deterministic mock feed — second asset gets a value drift; phantom added
  _generateFeed(lockedAssets) {
    const feed = lockedAssets.map((a, i) => ({
      isin:          a.isin,
      custodyAccount: "BNR-SAFIR-001",
      quantity:      1_000_000,
      marketValue:   i === 1 ? Math.round(a.marketValue * 1.034) : a.marketValue,
      adjustedValue: i === 1
        ? Math.round(a.marketValue * 1.034 * (1 - (a.haircut || 0) / 100))
        : Math.round(a.marketValue * (1 - (a.haircut || 0) / 100)),
      currency:      a.currency || "RON",
      status:        "locked",
      repoRef:       null,
      settlementDate: new Date().toISOString().slice(0, 10),
    }));

    // Skip last internal asset to simulate MISSING_EXTERNAL (if there are 3+)
    if (lockedAssets.length >= 3) feed.splice(-1, 1);

    // Add phantom
    feed.push({
      isin:          PHANTOM_ISIN,
      custodyAccount: "BNR-SAFIR-001",
      quantity:      500_000,
      marketValue:   3_500_000,
      adjustedValue: 3_360_000,
      currency:      "RON",
      status:        "locked",
      repoRef:       null,
      settlementDate: new Date().toISOString().slice(0, 10),
    });

    return feed;
  }
}
