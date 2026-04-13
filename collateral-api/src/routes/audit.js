const router = require('express').Router();
const crypto = require('crypto');
const { getDb } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { appendAuditEntry } = require('../middleware/auditHelper');
const { MAX, badRequest, isOptionalString, isNonEmptyString } = require('../validation');

function computeEntryHash(prevHash, entry) {
  const payload = prevHash + JSON.stringify(entry);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

router.get('/', requireAuth, (req, res) => {
  const rows = getDb().prepare('SELECT * FROM audit_events ORDER BY id ASC').all();
  res.json(rows.map(r => ({
    ts: r.ts, user: r.user_name, role: r.role, action: r.action,
    object: r.object, prev: r.prev_state, next: r.next_state, comment: r.comment,
    hash: r.hash,
  })));
});

router.get('/verify', requireAuth, (req, res) => {
  const rows = getDb().prepare('SELECT * FROM audit_events ORDER BY id ASC').all();
  let prevHash = '';
  let valid = true;
  let firstBrokenId = null;
  for (const row of rows) {
    const entry = { ts: row.ts, user: row.user_name, role: row.role, action: row.action, object: row.object, prev: row.prev_state, next: row.next_state, comment: row.comment };
    const expected = computeEntryHash(prevHash, entry);
    if (row.hash && row.hash !== expected) {
      valid = false;
      firstBrokenId = row.id;
      break;
    }
    prevHash = row.hash || expected;
  }
  res.json({ valid, totalEntries: rows.length, firstBrokenId });
});

// POST /audit — client-side audit hook for UI events the server cannot auto-capture.
// Any client-supplied `ts` is ignored; the server stamps the real time.
router.post('/', requireAuth, (req, res) => {
  const { action, object, prev, next, comment } = req.body;
  if (![action, object].every((v) => isNonEmptyString(v, MAX.shortText))) {
    return badRequest(res, 'Missing or oversized required audit fields');
  }
  if (![prev, next].every((v) => isOptionalString(v, MAX.shortText))) {
    return badRequest(res, 'prev and next must be strings up to 100 characters');
  }
  if (!isOptionalString(comment, MAX.longText)) {
    return badRequest(res, `comment must be a string up to ${MAX.longText} characters`);
  }
  const db = getDb();
  appendAuditEntry(db, req.user, action, object, prev ?? '', next ?? '', comment ?? '');
  const lastRow = db.prepare('SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1').get();
  res.status(201).json({ ok: true, hash: lastRow?.hash ?? '' });
});

module.exports = router;
