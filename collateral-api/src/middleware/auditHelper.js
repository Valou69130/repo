const crypto = require('crypto');

function computeEntryHash(prevHash, entry) {
  const payload = prevHash + JSON.stringify(entry);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Append a server-side audit entry to the audit chain.
 *
 * @param {object} db   - better-sqlite3 database handle
 * @param {object} user - decoded JWT payload (name, role)
 * @param {string} action
 * @param {string} object
 * @param {string} [prev]
 * @param {string} [next]
 * @param {string} [comment]
 */
function appendAuditEntry(db, user, action, object, prev = '', next = '', comment = '') {
  const ts = new Date().toISOString();
  const entry = { ts, user: user.name, role: user.role, action, object, prev, next, comment };
  const lastRow = db.prepare('SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1').get();
  const prevHash = lastRow?.hash ?? '';
  const hash = computeEntryHash(prevHash, entry);
  db.prepare(
    'INSERT INTO audit_events (ts,user_name,role,action,object,prev_state,next_state,comment,hash) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(ts, user.name, user.role, action, object, prev, next, comment, hash);
}

module.exports = { appendAuditEntry };
