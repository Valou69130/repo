const router = require('express').Router({ mergeParams: true });
const { requireAuth, requirePerm } = require('../middleware/auth');
const { appendAuditEntry } = require('../middleware/auditHelper');
const { MAX, badRequest, isNonEmptyString, isFiniteNumber } = require('../validation');

function getDb(req) {
  return req.testDb || require('../db/schema').getDb();
}

function rowToEligibility(r) {
  return {
    id: r.id,
    agreementId: r.agreement_id,
    name: r.name,
    criteria: JSON.parse(r.criteria_json),
    priority: r.priority,
  };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

router.get('/agreements/:id/eligibility-schedules', requireAuth, (req, res) => {
  const db = getDb(req);
  const rows = db.prepare(
    'SELECT * FROM eligibility_schedules WHERE agreement_id = ? ORDER BY priority ASC, id ASC'
  ).all(req.params.id);
  res.json(rows.map(rowToEligibility));
});

router.post('/agreements/:id/eligibility-schedules', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const agr = db.prepare('SELECT id FROM collateral_agreements WHERE id = ?').get(req.params.id);
  if (!agr) return res.status(404).json({ error: 'Agreement not found' });

  const b = req.body || {};
  if (!isNonEmptyString(b.id, MAX.id))      return badRequest(res, 'id required');
  if (!isNonEmptyString(b.name))            return badRequest(res, 'name required');
  if (!isPlainObject(b.criteria))           return badRequest(res, 'criteria must be an object');
  if (!isFiniteNumber(b.priority))          return badRequest(res, 'priority must be a number');

  const exists = db.prepare('SELECT id FROM eligibility_schedules WHERE id = ?').get(b.id);
  if (exists) return res.status(409).json({ error: 'id already exists' });

  db.prepare(`
    INSERT INTO eligibility_schedules (id, agreement_id, name, criteria_json, priority)
    VALUES (?, ?, ?, ?, ?)
  `).run(b.id, req.params.id, b.name, JSON.stringify(b.criteria), b.priority);

  appendAuditEntry(db, req.user, 'eligibility schedule created', b.id, '', req.params.id);
  const row = db.prepare('SELECT * FROM eligibility_schedules WHERE id = ?').get(b.id);
  res.status(201).json(rowToEligibility(row));
});

router.patch('/eligibility-schedules/:id', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const existing = db.prepare('SELECT * FROM eligibility_schedules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });

  const b = req.body || {};
  const updates = [];
  const params = [];
  if (b.name !== undefined) {
    if (!isNonEmptyString(b.name)) return badRequest(res, 'name invalid');
    updates.push('name = ?'); params.push(b.name);
  }
  if (b.criteria !== undefined) {
    if (!isPlainObject(b.criteria)) return badRequest(res, 'criteria must be an object');
    updates.push('criteria_json = ?'); params.push(JSON.stringify(b.criteria));
  }
  if (b.priority !== undefined) {
    if (!isFiniteNumber(b.priority)) return badRequest(res, 'priority must be a number');
    updates.push('priority = ?'); params.push(b.priority);
  }
  if (updates.length === 0) return badRequest(res, 'no fields provided');
  params.push(req.params.id);

  db.prepare(`UPDATE eligibility_schedules SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  appendAuditEntry(db, req.user, 'eligibility schedule updated', req.params.id, '', Object.keys(b).join(','));

  const row = db.prepare('SELECT * FROM eligibility_schedules WHERE id = ?').get(req.params.id);
  res.json(rowToEligibility(row));
});

router.delete('/eligibility-schedules/:id', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const existing = db.prepare('SELECT id FROM eligibility_schedules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });
  db.prepare('DELETE FROM eligibility_schedules WHERE id = ?').run(req.params.id);
  appendAuditEntry(db, req.user, 'eligibility schedule deleted', req.params.id, '', '');
  res.status(204).end();
});

module.exports = router;
