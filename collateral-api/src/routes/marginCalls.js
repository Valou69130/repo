const router = require('express').Router();
const { requireAuth, ROLE_PERMS } = require('../middleware/auth');
const { appendAuditEntry } = require('../middleware/auditHelper');
const { appendEvent } = require('../db/appendEvent');
const { ConflictError, NotFoundError } = require('../db/errors');
const {
  MAX, badRequest, isNonEmptyString, isFiniteNumber, isIsoCurrency, isIsoDate,
} = require('../validation');

const DIRECTIONS = new Set(['issued', 'received']);

function getDb(req) {
  return req.testDb || require('../db/schema').getDb();
}

function rowToCall(row) {
  return {
    id: row.id,
    agreementId: row.agreement_id,
    direction: row.direction,
    callDate: row.call_date,
    exposureAmount: row.exposure_amount,
    collateralValue: row.collateral_value,
    callAmount: row.call_amount,
    currency: row.currency,
    currentState: row.current_state,
    issuedByUserId: row.issued_by_user_id,
    issuedAt: row.issued_at,
    resolvedAt: row.resolved_at,
    settlementRef: row.settlement_ref,
    fourEyesRequired: !!row.four_eyes_required,
    deadlineAt: row.deadline_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function computeDeadline(callDate, deadlineTime) {
  return `${callDate}T${deadlineTime}:00Z`;
}

function writeError(res, err) {
  if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
  if (err instanceof ConflictError) return res.status(409).json({ error: err.message, ...err.details });
  throw err;
}

router.post('/', requireAuth, (req, res) => {
  const b = req.body || {};
  const perms = ROLE_PERMS[req.user?.role];
  if (!perms) return res.status(403).json({ error: 'Forbidden' });
  const needed = b.direction === 'received' ? 'canRespondCall' : 'canIssueCall';
  if (!perms[needed]) return res.status(403).json({ error: 'Forbidden' });

  if (!isNonEmptyString(b.id, MAX.id))               return badRequest(res, 'id required');
  if (!isNonEmptyString(b.agreementId, MAX.id))      return badRequest(res, 'agreementId required');
  if (!DIRECTIONS.has(b.direction))                  return badRequest(res, 'direction must be issued or received');
  if (!isIsoDate(b.callDate))                        return badRequest(res, 'callDate must be YYYY-MM-DD');
  if (![b.exposureAmount, b.collateralValue, b.callAmount].every(isFiniteNumber)) {
    return badRequest(res, 'amount fields must be finite numbers');
  }
  if (!isIsoCurrency(b.currency))                    return badRequest(res, 'currency must be 3-letter ISO 4217');

  const db = getDb(req);
  const agr = db.prepare('SELECT * FROM collateral_agreements WHERE id = ?').get(b.agreementId);
  if (!agr) return res.status(404).json({ error: 'Agreement not found' });

  const existing = db.prepare('SELECT id FROM margin_calls WHERE id = ?').get(b.id);
  if (existing) return res.status(409).json({ error: 'Margin call id already exists' });

  const fourEyes = b.callAmount > agr.four_eyes_threshold ? 1 : 0;
  const now = new Date().toISOString();
  const deadline = computeDeadline(b.callDate, agr.call_notice_deadline_time);

  db.prepare(`
    INSERT INTO margin_calls
      (id, agreement_id, direction, call_date, exposure_amount, collateral_value,
       call_amount, currency, current_state, issued_by_user_id, issued_at,
       four_eyes_required, deadline_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.id, b.agreementId, b.direction, b.callDate,
    b.exposureAmount, b.collateralValue, b.callAmount, b.currency,
    'draft', req.user.id, now, fourEyes, deadline, now, now
  );

  if (b.direction === 'received') {
    try {
      appendEvent(db, {
        marginCallId: b.id,
        eventType: 'issued',
        actor: { id: req.user.id, type: 'user' },
        payload: { agreementId: b.agreementId, callAmount: b.callAmount, currency: b.currency, direction: 'received' },
        expectedState: 'draft',
        occurredAt: now,
      });
    } catch (err) {
      return writeError(res, err);
    }
  }

  appendAuditEntry(db, req.user, 'margin call created', b.id, '', `${b.direction} · ${b.callAmount} ${b.currency}`);
  const row = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(b.id);
  res.status(201).json(rowToCall(row));
});

module.exports = router;
