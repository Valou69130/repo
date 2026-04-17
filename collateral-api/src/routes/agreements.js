const router = require('express').Router();
const { requireAuth, requirePerm } = require('../middleware/auth');
const { appendAuditEntry } = require('../middleware/auditHelper');
const {
  MAX, sanitise, badRequest,
  isNonEmptyString, isFiniteNumber, isOptionalString,
  isIsoCurrency, isIsoDate,
} = require('../validation');

const AGREEMENT_TYPES = new Set(['GMRA', 'CSA']);
const STATUSES = new Set(['active', 'terminated']);

function getDb(req) {
  return req.testDb || require('../db/schema').getDb();
}

function rowToAgreement(row) {
  return {
    id: row.id,
    counterparty: row.counterparty,
    agreementType: row.agreement_type,
    governingLaw: row.governing_law,
    baseCurrency: row.base_currency,
    threshold: row.threshold,
    minimumTransferAmount: row.minimum_transfer_amount,
    rounding: row.rounding,
    callNoticeDeadlineTime: row.call_notice_deadline_time,
    fourEyesThreshold: row.four_eyes_threshold,
    status: row.status,
    effectiveDate: row.effective_date,
    terminationDate: row.termination_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', requireAuth, (req, res) => {
  const db = getDb(req);
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (req.query.counterparty) { where.push('counterparty = ?'); params.push(req.query.counterparty); }
  if (req.query.type)         { where.push('agreement_type = ?'); params.push(req.query.type); }
  if (req.query.status)       { where.push('status = ?'); params.push(req.query.status); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM collateral_agreements ${whereSql}`).get(...params).c;
  const rows  = db.prepare(
    `SELECT * FROM collateral_agreements ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ data: rows.map(rowToAgreement), total, page, limit });
});

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb(req);
  const row = db.prepare('SELECT * FROM collateral_agreements WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Agreement not found' });
  const elig = db.prepare('SELECT * FROM eligibility_schedules WHERE agreement_id = ? ORDER BY priority ASC, id ASC').all(req.params.id);
  const hair = db.prepare('SELECT * FROM haircut_schedules WHERE agreement_id = ? ORDER BY id ASC').all(req.params.id);
  res.json({
    ...rowToAgreement(row),
    eligibilitySchedules: elig.map(r => ({
      id: r.id, agreementId: r.agreement_id, name: r.name,
      criteria: JSON.parse(r.criteria_json), priority: r.priority,
    })),
    haircutSchedules: hair.map(r => ({
      id: r.id, agreementId: r.agreement_id,
      eligibilityScheduleId: r.eligibility_schedule_id,
      criteria: JSON.parse(r.criteria_json), haircut: r.haircut,
    })),
  });
});

router.post('/', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const b = req.body || {};
  const governingLaw = sanitise(b.governingLaw);

  if (!isNonEmptyString(b.id, MAX.id))                     return badRequest(res, 'id required');
  if (!isNonEmptyString(b.counterparty))                   return badRequest(res, 'counterparty required');
  if (!AGREEMENT_TYPES.has(b.agreementType))               return badRequest(res, 'agreementType must be GMRA or CSA');
  if (!isOptionalString(governingLaw, MAX.shortText))      return badRequest(res, 'governingLaw too long');
  if (!isIsoCurrency(b.baseCurrency))                      return badRequest(res, 'baseCurrency must be 3-letter ISO 4217');
  if (![b.threshold, b.minimumTransferAmount, b.rounding, b.fourEyesThreshold].every(isFiniteNumber)) {
    return badRequest(res, 'numeric fields must be finite numbers');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.callNoticeDeadlineTime || '')) {
    return badRequest(res, 'callNoticeDeadlineTime must be HH:MM');
  }
  if (!STATUSES.has(b.status))                             return badRequest(res, 'status must be active or terminated');
  if (!isIsoDate(b.effectiveDate))                         return badRequest(res, 'effectiveDate must be YYYY-MM-DD');
  if (b.terminationDate !== undefined && b.terminationDate !== null && !isIsoDate(b.terminationDate)) {
    return badRequest(res, 'terminationDate must be YYYY-MM-DD');
  }

  const existing = db.prepare('SELECT id FROM collateral_agreements WHERE id = ?').get(b.id);
  if (existing) return res.status(409).json({ error: 'Agreement id already exists' });

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO collateral_agreements
      (id, counterparty, agreement_type, governing_law, base_currency,
       threshold, minimum_transfer_amount, rounding, call_notice_deadline_time,
       four_eyes_threshold, status, effective_date, termination_date,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.id, b.counterparty, b.agreementType, governingLaw || null, b.baseCurrency,
    b.threshold, b.minimumTransferAmount, b.rounding, b.callNoticeDeadlineTime,
    b.fourEyesThreshold, b.status, b.effectiveDate, b.terminationDate || null,
    now, now
  );

  appendAuditEntry(db, req.user, 'agreement created', b.id, '',
    `${b.agreementType} · ${b.counterparty} · ${b.baseCurrency}`);

  const row = db.prepare('SELECT * FROM collateral_agreements WHERE id = ?').get(b.id);
  res.status(201).json(rowToAgreement(row));
});

const MUTABLE = new Set([
  'counterparty', 'governingLaw', 'threshold', 'minimumTransferAmount',
  'rounding', 'callNoticeDeadlineTime', 'fourEyesThreshold',
]);

router.patch('/:id', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const existing = db.prepare('SELECT * FROM collateral_agreements WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Agreement not found' });

  const b = req.body || {};
  const keys = Object.keys(b);
  for (const k of keys) {
    if (!MUTABLE.has(k)) return badRequest(res, `field "${k}" is not mutable`);
  }

  const updates = [];
  const params = [];
  if (b.counterparty !== undefined) {
    if (!isNonEmptyString(b.counterparty)) return badRequest(res, 'counterparty invalid');
    updates.push('counterparty = ?'); params.push(b.counterparty);
  }
  if (b.governingLaw !== undefined) {
    const gl = sanitise(b.governingLaw);
    if (gl !== null && !isOptionalString(gl, MAX.shortText)) return badRequest(res, 'governingLaw invalid');
    updates.push('governing_law = ?'); params.push(gl || null);
  }
  for (const [key, col] of [
    ['threshold', 'threshold'],
    ['minimumTransferAmount', 'minimum_transfer_amount'],
    ['rounding', 'rounding'],
    ['fourEyesThreshold', 'four_eyes_threshold'],
  ]) {
    if (b[key] !== undefined) {
      if (!isFiniteNumber(b[key])) return badRequest(res, `${key} must be a finite number`);
      updates.push(`${col} = ?`); params.push(b[key]);
    }
  }
  if (b.callNoticeDeadlineTime !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.callNoticeDeadlineTime)) {
      return badRequest(res, 'callNoticeDeadlineTime must be HH:MM');
    }
    updates.push('call_notice_deadline_time = ?'); params.push(b.callNoticeDeadlineTime);
  }
  if (updates.length === 0) return badRequest(res, 'no mutable fields provided');

  const now = new Date().toISOString();
  updates.push('updated_at = ?'); params.push(now);
  params.push(req.params.id);

  db.prepare(`UPDATE collateral_agreements SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  appendAuditEntry(db, req.user, 'agreement updated', req.params.id, '', keys.join(','));

  const row = db.prepare('SELECT * FROM collateral_agreements WHERE id = ?').get(req.params.id);
  res.json(rowToAgreement(row));
});

router.post('/:id/terminate', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const existing = db.prepare('SELECT * FROM collateral_agreements WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Agreement not found' });
  if (existing.status === 'terminated') return res.status(409).json({ error: 'Already terminated' });

  const termDate = req.body?.terminationDate;
  if (!isIsoDate(termDate)) return badRequest(res, 'terminationDate must be YYYY-MM-DD');

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE collateral_agreements SET status = 'terminated', termination_date = ?, updated_at = ? WHERE id = ?`
  ).run(termDate, now, req.params.id);
  appendAuditEntry(db, req.user, 'agreement terminated', req.params.id, existing.status, 'terminated');

  const row = db.prepare('SELECT * FROM collateral_agreements WHERE id = ?').get(req.params.id);
  res.json(rowToAgreement(row));
});

module.exports = router;
