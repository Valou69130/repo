const router = require('express').Router({ mergeParams: true });
const { requireAuth, requirePerm } = require('../middleware/auth');
const { appendAuditEntry } = require('../middleware/auditHelper');
const { MAX, badRequest, isNonEmptyString, isFiniteNumber } = require('../validation');

function getDb(req) {
  return req.testDb || require('../db/schema').getDb();
}

function rowToHaircut(r) {
  return {
    id: r.id,
    agreementId: r.agreement_id,
    eligibilityScheduleId: r.eligibility_schedule_id,
    criteria: JSON.parse(r.criteria_json),
    haircut: r.haircut,
  };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isValidHaircut(v) {
  return isFiniteNumber(v) && v >= 0 && v <= 1;
}

router.get('/agreements/:id/haircut-schedules', requireAuth, (req, res) => {
  const db = getDb(req);
  const rows = db.prepare(
    'SELECT * FROM haircut_schedules WHERE agreement_id = ? ORDER BY id ASC'
  ).all(req.params.id);
  res.json(rows.map(rowToHaircut));
});

router.post('/agreements/:id/haircut-schedules', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const agr = db.prepare('SELECT id FROM collateral_agreements WHERE id = ?').get(req.params.id);
  if (!agr) return res.status(404).json({ error: 'Agreement not found' });

  const b = req.body || {};
  if (!isNonEmptyString(b.id, MAX.id))      return badRequest(res, 'id required');
  if (!isPlainObject(b.criteria))           return badRequest(res, 'criteria must be an object');
  if (!isValidHaircut(b.haircut))           return badRequest(res, 'haircut must be between 0 and 1');

  let esId = b.eligibilityScheduleId ?? null;
  if (esId !== null) {
    if (!isNonEmptyString(esId, MAX.id)) return badRequest(res, 'eligibilityScheduleId invalid');
    const es = db.prepare('SELECT agreement_id FROM eligibility_schedules WHERE id = ?').get(esId);
    if (!es) return badRequest(res, 'eligibilityScheduleId not found');
    if (es.agreement_id !== req.params.id) return badRequest(res, 'eligibilityScheduleId belongs to a different agreement');
  }

  const exists = db.prepare('SELECT id FROM haircut_schedules WHERE id = ?').get(b.id);
  if (exists) return res.status(409).json({ error: 'id already exists' });

  db.prepare(`
    INSERT INTO haircut_schedules (id, agreement_id, eligibility_schedule_id, criteria_json, haircut)
    VALUES (?, ?, ?, ?, ?)
  `).run(b.id, req.params.id, esId, JSON.stringify(b.criteria), b.haircut);

  appendAuditEntry(db, req.user, 'haircut schedule created', b.id, '', `${req.params.id} · ${b.haircut}`);
  const row = db.prepare('SELECT * FROM haircut_schedules WHERE id = ?').get(b.id);
  res.status(201).json(rowToHaircut(row));
});

router.patch('/haircut-schedules/:id', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const existing = db.prepare('SELECT * FROM haircut_schedules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });

  const b = req.body || {};
  const updates = [];
  const params = [];
  if (b.criteria !== undefined) {
    if (!isPlainObject(b.criteria)) return badRequest(res, 'criteria must be an object');
    updates.push('criteria_json = ?'); params.push(JSON.stringify(b.criteria));
  }
  if (b.haircut !== undefined) {
    if (!isValidHaircut(b.haircut)) return badRequest(res, 'haircut must be between 0 and 1');
    updates.push('haircut = ?'); params.push(b.haircut);
  }
  if (updates.length === 0) return badRequest(res, 'no fields provided');
  params.push(req.params.id);

  db.prepare(`UPDATE haircut_schedules SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  appendAuditEntry(db, req.user, 'haircut schedule updated', req.params.id, '', Object.keys(b).join(','));

  const row = db.prepare('SELECT * FROM haircut_schedules WHERE id = ?').get(req.params.id);
  res.json(rowToHaircut(row));
});

router.delete('/haircut-schedules/:id', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const existing = db.prepare('SELECT id FROM haircut_schedules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });
  db.prepare('DELETE FROM haircut_schedules WHERE id = ?').run(req.params.id);
  appendAuditEntry(db, req.user, 'haircut schedule deleted', req.params.id, '', '');
  res.status(204).end();
});

module.exports = router;
