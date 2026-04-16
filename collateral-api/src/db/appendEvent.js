const { sha256, stableStringify, GENESIS_HASH } = require('./hash');
const { stateForEvent, allowedTransitions } = require('./transitions');
const { ConflictError, NotFoundError } = require('./errors');

function appendEvent(db, {
  marginCallId,
  eventType,
  actor,
  payload,
  expectedState,
  occurredAt,
}) {
  if (!actor || !actor.type) {
    throw new Error('appendEvent: actor.type is required');
  }
  if (typeof eventType !== 'string') {
    throw new Error('appendEvent: eventType must be a string');
  }

  return db.transaction(() => {
    const call = db.prepare(`SELECT current_state FROM margin_calls WHERE id = ?`).get(marginCallId);
    if (!call) {
      throw new NotFoundError(`margin call ${marginCallId} not found`);
    }
    if (expectedState !== undefined && call.current_state !== expectedState) {
      throw new ConflictError('state mismatch', {
        currentState: call.current_state,
        expectedState,
        allowed: allowedTransitions(call.current_state),
      });
    }

    let newState;
    try {
      newState = stateForEvent(eventType, call.current_state);
    } catch (err) {
      throw new ConflictError(err.message, {
        currentState: call.current_state,
        attemptedEvent: eventType,
        allowed: allowedTransitions(call.current_state),
      });
    }

    const prevRow = db.prepare(
      `SELECT hash FROM margin_call_events WHERE margin_call_id = ? ORDER BY id DESC LIMIT 1`
    ).get(marginCallId);
    const prevHash = prevRow?.hash ?? GENESIS_HASH;

    const ts = occurredAt ?? new Date().toISOString();
    const actorIdStr = actor.id === null || actor.id === undefined ? '' : String(actor.id);
    const payloadStr = stableStringify(payload ?? {});
    const hash = sha256(prevHash + eventType + ts + actorIdStr + payloadStr);

    const insert = db.prepare(`
      INSERT INTO margin_call_events
        (margin_call_id, event_type, occurred_at, actor_user_id, actor_type, payload_json, prev_hash, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = insert.run(marginCallId, eventType, ts, actor.id ?? null, actor.type, payloadStr, prevHash, hash);

    db.prepare(`UPDATE margin_calls SET current_state = ?, updated_at = ? WHERE id = ?`)
      .run(newState, ts, marginCallId);

    return {
      id: info.lastInsertRowid,
      eventType,
      hash,
      prevHash,
      occurredAt: ts,
      newState,
    };
  })();
}

module.exports = { appendEvent };
