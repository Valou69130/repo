// ─── BaseAdapter ─────────────────────────────────────────────────────────────
// Abstract base every adapter must extend.
// Enforces the toInternal / fromInternal contract and provides emit() helper.
// Business logic belongs in IntegrationService, NOT in adapters.

import { integrationBus } from "../core/IntegrationBus.js";
import { createEvent }     from "../core/events.js";

export class BaseAdapter {
  /**
   * @param {string} id       — unique adapter identifier, e.g. "mock-trade-intake"
   * @param {string} channel  — source channel label, e.g. "bloomberg", "safir", "mock"
   * @param {object} config   — adapter-specific config (timeout, endpoint, auth, etc.)
   */
  constructor(id, channel, config = {}) {
    if (new.target === BaseAdapter) {
      throw new Error("BaseAdapter is abstract — extend it.");
    }
    this.id      = id;
    this.channel = channel;
    this.config  = config;
    this.status  = "idle";   // idle | ready | error
    this._checkContract();
  }

  _checkContract() {
    if (typeof this.toInternal   !== "function") throw new Error(`${this.constructor.name} must implement toInternal(externalPayload)`);
    if (typeof this.fromInternal !== "function") throw new Error(`${this.constructor.name} must implement fromInternal(domainObject)`);
  }

  /** Publish a typed event to the integration bus. */
  emit(type, payload) {
    return integrationBus.publish(createEvent(type, payload, `${this.channel}/${this.id}`));
  }

  /** Mark adapter ready and announce. */
  connect() {
    this.status = "ready";
    this.emit("ADAPTER_CONNECTED", { adapterId: this.id, channel: this.channel });
    return this;
  }

  /** Mark adapter faulted. */
  fault(reason) {
    this.status = "error";
    this.emit("ADAPTER_ERROR", { adapterId: this.id, reason });
  }
}
