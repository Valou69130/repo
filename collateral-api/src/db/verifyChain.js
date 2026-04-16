const { sha256, stableStringify, GENESIS_HASH } = require('./hash');

function verifyChain(db, marginCallId) {
  const call = db.prepare(`SELECT id FROM margin_calls WHERE id = ?`).get(marginCallId);
  if (!call) return null;

  const events = db.prepare(`
    SELECT id, event_type, occurred_at, actor_user_id, payload_json, prev_hash, hash
      FROM margin_call_events
     WHERE margin_call_id = ?
     ORDER BY id ASC
  `).all(marginCallId);

  let prevHash = GENESIS_HASH;
  for (const ev of events) {
    if (ev.prev_hash !== prevHash) {
      return { valid: false, brokenAt: ev.id, eventCount: events.length };
    }
    const actorIdStr = ev.actor_user_id === null ? '' : String(ev.actor_user_id);
    let canonicalPayload;
    try {
      canonicalPayload = stableStringify(JSON.parse(ev.payload_json));
    } catch {
      return { valid: false, brokenAt: ev.id, eventCount: events.length };
    }
    const expected = sha256(prevHash + ev.event_type + ev.occurred_at + actorIdStr + canonicalPayload);
    if (expected !== ev.hash) {
      return { valid: false, brokenAt: ev.id, eventCount: events.length };
    }
    prevHash = ev.hash;
  }
  return { valid: true, brokenAt: null, eventCount: events.length };
}

module.exports = { verifyChain };
