// ─── Mock Position Sync Adapter ───────────────────────────────────────────────
// Simulates a real-time or batch position feed from a custodian (SaFIR, Euroclear,
// Clearstream) formatted as MT535 Statement of Holdings or a proprietary JSON API.
// toInternal  : external custody record → canonical CollateralPosition
// fromInternal: canonical CollateralPosition → external custody record format
// NO business logic.

import { BaseAdapter }             from "../BaseAdapter.js";
import { EVENT_TYPES }             from "../../core/events.js";
import { createCollateralPosition } from "../../core/models.js";

export class PositionSyncAdapter extends BaseAdapter {
  constructor(config = {}) {
    super("mock-position-sync", "mock", config);
  }

  /** External custody holding record → canonical CollateralPosition. */
  toInternal(extRecord) {
    return createCollateralPosition({
      id:           `EXT-${extRecord.isin}-${extRecord.custodyAccount}`,
      assetId:      extRecord.isin,
      repoId:       extRecord.repoRef || null,
      quantity:     extRecord.quantity || 0,
      marketValue:  extRecord.marketValue || 0,
      adjustedValue: extRecord.adjustedValue || extRecord.marketValue || 0,
      currency:     extRecord.currency || "RON",
      lockedAt:     extRecord.settlementDate || new Date().toISOString(),
      custody:      extRecord.custodyAccount || "UNKNOWN",
      status:       extRecord.status || "locked",
    });
  }

  /** Canonical CollateralPosition → external custody record format. */
  fromInternal(pos) {
    return {
      isin:          pos.assetId,
      quantity:      pos.quantity,
      marketValue:   pos.marketValue,
      adjustedValue: pos.adjustedValue,
      currency:      pos.currency,
      custodyAccount: pos.custody,
      repoRef:       pos.repoId,
      status:        pos.status,
      settlementDate: pos.lockedAt?.slice(0, 10),
    };
  }

  /**
   * Generate mock external position feed from the current internal asset list.
   * Introduces deliberate discrepancies to exercise reconciliation:
   *   - One asset with ~3% market value delta
   *   - One phantom asset (in custody but not internally registered)
   *   - Locked assets appear in feed; available ones may not
   */
  generateMockFeed(internalAssets) {
    const locked = internalAssets.filter((a) => ["Locked", "Reserved", "Pledged"].includes(a.status));
    const feed = locked.map((a, i) => ({
      isin:          a.isin,
      custodyAccount: "BNR-SAFIR-001",
      quantity:      1_000_000,
      // Introduce a value drift on the second asset
      marketValue:   i === 1 ? Math.round(a.marketValue * 1.032) : a.marketValue,
      adjustedValue: i === 1 ? Math.round(a.marketValue * 1.032 * (1 - a.haircut / 100)) : Math.round(a.marketValue * (1 - a.haircut / 100)),
      currency:      a.currency || "RON",
      status:        "locked",
      settlementDate: new Date().toISOString().slice(0, 10),
      repoRef:       null,
    }));

    // Phantom: a position in custody not registered internally
    feed.push({
      isin:          "RO_PHANTOM_001",
      custodyAccount: "BNR-SAFIR-001",
      quantity:      500_000,
      marketValue:   3_500_000,
      adjustedValue: 3_360_000,
      currency:      "RON",
      status:        "locked",
      settlementDate: new Date().toISOString().slice(0, 10),
      repoRef:       null,
    });

    return feed;
  }

  /**
   * Run a sync against internalAssets. Emits POSITION_SYNC_STARTED and
   * one POSITION_SYNCED per matched record, then returns the feed.
   */
  sync(internalAssets) {
    this.emit(EVENT_TYPES.POSITION_SYNC_STARTED, { assetCount: internalAssets.length });
    const feed = this.generateMockFeed(internalAssets);
    feed.forEach((record) => {
      const pos = this.toInternal(record);
      this.emit(EVENT_TYPES.POSITION_SYNCED, { position: pos, external: record });
    });
    return feed;
  }
}
