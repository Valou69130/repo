const router = require('express').Router();
const { requireAuth, ROLE_PERMS } = require('../middleware/auth');
const { appendAuditEntry } = require('../middleware/auditHelper');
const { appendEvent } = require('../db/appendEvent');
const { ConflictError, NotFoundError } = require('../db/errors');
const { MAX, badRequest, isNonEmptyString } = require('../validation');

function getDb(req) {
  return req.testDb || require('../db/schema').getDb();
}

function rowToApproval(row) {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    requestedByUserId: row.requested_by_user_id,
    requestedAt: row.requested_at,
    approvedByUserId: row.approved_by_user_id,
    approvedAt: row.approved_at,
    status: row.status,
    rejectionReason: row.rejection_reason,
  };
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

function writeErr(res, err) {
  if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
  if (err instanceof ConflictError) return res.status(409).json({ error: err.message, ...err.details });
  throw err;
}

function loadApproval(db, id) {
  return db.prepare('SELECT * FROM approvals WHERE id = ?').get(id);
}

// ── GET /approvals/pending ─────────────────────────────────────────────
router.get('/pending', requireAuth, (req, res) => {
  const db = getDb(req);
  const rows = db.prepare(
    `SELECT * FROM approvals
     WHERE status = 'pending' AND requested_by_user_id != ?
     ORDER BY requested_at ASC`
  ).all(req.user.id);
  res.json({ data: rows.map(rowToApproval) });
});

function decideState(entityType) {
  // Maps approval entity to the appended event type on grant / reject.
  // For now only margin_call_accept is live.
  if (entityType === 'margin_call_accept') {
    return { grantEvent: 'four_eyes_granted', rejectEvent: 'four_eyes_rejected' };
  }
  return null;
}

// ── POST /approvals/:id/grant ─────────────────────────────────────────
router.post('/:id/grant', requireAuth, (req, res) => {
  const perms = ROLE_PERMS[req.user?.role];
  if (!perms?.canApproveFourEyes) return res.status(403).json({ error: 'Forbidden' });

  const db = getDb(req);
  const approval = loadApproval(db, req.params.id);
  if (!approval) return res.status(404).json({ error: 'Approval not found' });
  if (approval.status !== 'pending') {
    return res.status(409).json({ error: 'Approval not pending', status: approval.status });
  }
  if (approval.requested_by_user_id === req.user.id) {
    return res.status(403).json({ error: 'Self-approval not allowed' });
  }

  const mapping = decideState(approval.entity_type);
  if (!mapping) return res.status(400).json({ error: 'Unsupported approval entity_type' });

  let event;
  try {
    event = appendEvent(db, {
      marginCallId: approval.entity_id,
      eventType: mapping.grantEvent,
      actor: { id: req.user.id, type: 'user' },
      payload: { approvalId: approval.id },
    });
  } catch (err) {
    return writeErr(res, err);
  }

  db.prepare(`
    UPDATE approvals SET status='granted', approved_by_user_id=?, approved_at=? WHERE id=?
  `).run(req.user.id, event.occurredAt, approval.id);

  appendAuditEntry(db, req.user, 'four-eyes granted', approval.id, 'pending_four_eyes', event.newState, '');

  const row = loadApproval(db, approval.id);
  const crow = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(approval.entity_id);
  res.json({ approval: rowToApproval(row), marginCall: rowToCall(crow), event });
});

// ── POST /approvals/:id/reject ─────────────────────────────────────────
router.post('/:id/reject', requireAuth, (req, res) => {
  const b = req.body || {};
  const perms = ROLE_PERMS[req.user?.role];
  if (!perms?.canApproveFourEyes) return res.status(403).json({ error: 'Forbidden' });

  if (!isNonEmptyString(b.reason, MAX.mediumText)) return badRequest(res, 'reason required');

  const db = getDb(req);
  const approval = loadApproval(db, req.params.id);
  if (!approval) return res.status(404).json({ error: 'Approval not found' });
  if (approval.status !== 'pending') {
    return res.status(409).json({ error: 'Approval not pending', status: approval.status });
  }
  if (approval.requested_by_user_id === req.user.id) {
    return res.status(403).json({ error: 'Self-approval not allowed' });
  }

  const mapping = decideState(approval.entity_type);
  if (!mapping) return res.status(400).json({ error: 'Unsupported approval entity_type' });

  let event;
  try {
    event = appendEvent(db, {
      marginCallId: approval.entity_id,
      eventType: mapping.rejectEvent,
      actor: { id: req.user.id, type: 'user' },
      payload: { approvalId: approval.id, reason: b.reason },
    });
  } catch (err) {
    return writeErr(res, err);
  }

  db.prepare(`
    UPDATE approvals
    SET status='rejected', approved_by_user_id=?, approved_at=?, rejection_reason=?
    WHERE id=?
  `).run(req.user.id, event.occurredAt, b.reason, approval.id);

  appendAuditEntry(db, req.user, 'four-eyes rejected', approval.id, 'pending_four_eyes', event.newState, b.reason);

  const row = loadApproval(db, approval.id);
  const crow = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(approval.entity_id);
  res.json({ approval: rowToApproval(row), marginCall: rowToCall(crow), event });
});

module.exports = router;
