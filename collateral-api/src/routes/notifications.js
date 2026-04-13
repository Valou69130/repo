const router = require('express').Router();
const { getDb } = require('../db/schema');
const { requireAuth, requireWriteAccess } = require('../middleware/auth');
const { MAX, sanitise, badRequest, isNonEmptyString } = require('../validation');

function toNotification(r) {
  return {
    id:        r.id,
    severity:  r.severity,
    text:      r.text,
    target:    r.target,
    createdAt: r.created_at,
    read:      r.read === 1,
  };
}

router.get('/', requireAuth, (req, res) => {
  const rows = getDb().prepare('SELECT * FROM notifications ORDER BY id DESC').all();
  res.json(rows.map(toNotification));
});

router.post('/', requireAuth, requireWriteAccess, (req, res) => {
  const { severity } = req.body;
  const text   = sanitise(req.body.text);
  const target = sanitise(req.body.target);
  const allowedSeverities = new Set(['Critical', 'Warning', 'Info']);
  if (!allowedSeverities.has(severity)) return badRequest(res, 'Invalid notification severity');
  if (!isNonEmptyString(text, MAX.shortText)) return badRequest(res, `text is required and must be under ${MAX.shortText} characters`);
  if (target !== undefined && target !== null && (typeof target !== 'string' || target.length > MAX.id)) return badRequest(res, 'target must be a string up to 32 characters');
  const result = getDb().prepare('INSERT INTO notifications (severity, text, target) VALUES (?, ?, ?)').run(severity, text, target ?? '');
  res.status(201).json({ id: result.lastInsertRowid, severity, text, target: target ?? '', read: false });
});

// Acknowledge a notification (mark read without deleting)
router.patch('/:id', requireAuth, requireWriteAccess, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Notification not found' });
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id);
  res.json(toNotification({ ...existing, read: 1 }));
});

router.delete('/:id', requireAuth, requireWriteAccess, (req, res) => {
  getDb().prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
