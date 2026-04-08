const router = require('express').Router();
const { getDb } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { badRequest, isNonEmptyString } = require('../validation');

router.get('/', requireAuth, (req, res) => {
  const rows = getDb().prepare('SELECT * FROM notifications ORDER BY id DESC').all();
  res.json(rows.map(r => ({ id: r.id, severity: r.severity, text: r.text, target: r.target, createdAt: r.created_at })));
});

router.post('/', requireAuth, (req, res) => {
  const { severity, text, target } = req.body;
  const allowedSeverities = new Set(['Critical', 'Warning', 'Info']);
  if (!allowedSeverities.has(severity)) return badRequest(res, 'Invalid notification severity');
  if (!isNonEmptyString(text)) return badRequest(res, 'text is required');
  if (target !== undefined && target !== null && typeof target !== 'string') return badRequest(res, 'target must be a string');
  const result = getDb().prepare('INSERT INTO notifications (severity, text, target) VALUES (?, ?, ?)').run(severity, text, target);
  res.status(201).json({ id: result.lastInsertRowid, severity, text, target });
});

router.delete('/:id', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
