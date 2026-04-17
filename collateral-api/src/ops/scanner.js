const { appendEvent } = require('../db/appendEvent');
const { verifyChain } = require('../db/verifyChain');

const NON_TERMINAL_STATES = ['draft', 'issued', 'pending_four_eyes', 'disputed', 'agreed', 'delivered', 'settled'];

function scanDeadlines(db, now = new Date()) {
  const nowIso = now.toISOString();
  // Only issued and pending_four_eyes surface deadline breaches per spec.
  const rows = db.prepare(`
    SELECT id, current_state, deadline_at
      FROM margin_calls
     WHERE current_state IN ('issued','pending_four_eyes')
       AND deadline_at < ?
  `).all(nowIso);

  const existingStmt = db.prepare(`
    SELECT 1 FROM margin_call_events
     WHERE margin_call_id = ? AND event_type = 'deadline_breached' LIMIT 1
  `);

  const breached = [];
  for (const r of rows) {
    if (existingStmt.get(r.id)) continue;
    try {
      appendEvent(db, {
        marginCallId: r.id,
        eventType: 'deadline_breached',
        actor: { id: null, type: 'system' },
        payload: { deadlineAt: r.deadline_at, observedAt: nowIso },
      });
      breached.push(r.id);
    } catch (err) {
      // Never fail the whole scan because of one bad row; log and carry on.
      console.error('[scanner] deadline append failed', r.id, err.message);
    }
  }

  if (breached.length > 0) {
    db.prepare(`INSERT INTO notifications (severity, text, target) VALUES (?, ?, ?)`)
      .run('Warning', `Deadline breached on ${breached.length} call(s): ${breached.join(', ')}`, 'margin');
  }

  return { breachedCount: breached.length, breached };
}

function scanIntegrity(db) {
  const rows = db.prepare(`SELECT id FROM margin_calls`).all();
  const broken = [];
  for (const r of rows) {
    const res = verifyChain(db, r.id);
    if (res && res.valid === false) broken.push(r.id);
  }
  if (broken.length > 0) {
    db.prepare(`INSERT INTO notifications (severity, text, target) VALUES (?, ?, ?)`)
      .run('Critical', `Hash-chain integrity broken on ${broken.length} call(s): ${broken.join(', ')}`, 'audit');
  }
  return { scanned: rows.length, broken };
}

module.exports = { scanDeadlines, scanIntegrity, NON_TERMINAL_STATES };
