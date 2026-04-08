// ─── Integration Event Bus ───────────────────────────────────────────────────
// Singleton pub/sub bus. All adapters publish here; IntegrationService subscribes.
// Keeps an in-memory ring buffer of recent events for the UI event stream.
// No async I/O — synchronous fan-out only.

const MAX_LOG = 500;

class IntegrationBus {
  constructor() {
    this._handlers = {};   // eventType → [{ id, fn }]
    this._log = [];        // ring buffer, newest first
  }

  /** Subscribe to a specific event type, or "*" for all events. */
  on(eventType, fn, subscriberId) {
    if (!this._handlers[eventType]) this._handlers[eventType] = [];
    const id = subscriberId || `sub-${Math.random().toString(36).slice(2, 8)}`;
    this._handlers[eventType].push({ id, fn });
    return id;
  }

  /** Remove a subscriber by its id from a specific event type. */
  off(eventType, subscriberId) {
    if (this._handlers[eventType]) {
      this._handlers[eventType] = this._handlers[eventType].filter((s) => s.id !== subscriberId);
    }
  }

  /** Publish an event. Returns the event (for chaining). */
  publish(event) {
    if (!event || !event.type) throw new Error("[IntegrationBus] event must have a type");

    // Append to ring buffer
    this._log = [event, ...this._log].slice(0, MAX_LOG);

    // Fan-out: specific handlers then wildcards
    const specific  = this._handlers[event.type] || [];
    const wildcards = this._handlers["*"] || [];
    for (const { fn } of [...specific, ...wildcards]) {
      try { fn(event); } catch (err) {
        console.error("[IntegrationBus] subscriber error:", err);
      }
    }
    return event;
  }

  /** Return a slice of the ring buffer, optionally filtered by type. */
  getLog(limit = 100, typeFilter = null) {
    const src = typeFilter ? this._log.filter((e) => e.type === typeFilter) : this._log;
    return src.slice(0, limit);
  }

  get eventCount() { return this._log.length; }
}

// Module-level singleton — shared across all adapters and the service.
export const integrationBus = new IntegrationBus();
