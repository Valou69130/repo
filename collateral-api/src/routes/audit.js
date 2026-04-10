const router = require('express').Router();
const crypto = require('crypto');
const { getDb } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { badRequest, isNonEmptyString, isOptionalString } = require('../validation');

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

router.post('/', requireAuth, (req, res) => {
  const { ts, action, object, prev, next, comment } = req.body;
  if (![ts, action, object].every(isNonEmptyString)) {
    return badRequest(res, 'Missing required audit fields');
  }
  if (![prev, next, comment].every(isOptionalString)) {
    return badRequest(res, 'prev, next, and comment must be strings when provided');
  }
  const db = getDb();
  // user and role come from the verified JWT, not the request body
  const entry = { ts, user: req.user.name, role: req.user.role, action, object, prev: prev ?? '', next: next ?? '', comment: comment ?? '' };
  const lastRow = db.prepare('SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1').get();
  const prevHash = lastRow?.hash ?? '';
  const hash = computeEntryHash(prevHash, entry);
  db.prepare('INSERT INTO audit_events (ts,user_name,role,action,object,prev_state,next_state,comment,hash) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(ts, entry.user, entry.role, action, object, prev ?? '', next ?? '', comment ?? '', hash);
  res.status(201).json({ ok: true, hash });
});

module.exports = router;
