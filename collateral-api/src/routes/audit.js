const router = require('express').Router();
const { getDb } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { badRequest, isNonEmptyString, isOptionalString } = require('../validation');

router.get('/', requireAuth, (req, res) => {
  const rows = getDb().prepare('SELECT * FROM audit_events ORDER BY id DESC').all();
  res.json(rows.map(r => ({
    ts: r.ts, user: r.user_name, role: r.role, action: r.action,
    object: r.object, prev: r.prev_state, next: r.next_state, comment: r.comment,
  })));
});

router.post('/', requireAuth, (req, res) => {
  const { ts, user, role, action, object, prev, next, comment } = req.body;
  if (![ts, user, role, action, object].every(isNonEmptyString)) {
    return badRequest(res, 'Missing required audit fields');
  }
  if (![prev, next, comment].every(isOptionalString)) {
    return badRequest(res, 'prev, next, and comment must be strings when provided');
  }
  getDb().prepare('INSERT INTO audit_events (ts,user_name,role,action,object,prev_state,next_state,comment) VALUES (?,?,?,?,?,?,?,?)')
    .run(ts, user, role, action, object, prev, next, comment);
  res.status(201).json({ ok: true });
});

module.exports = router;
