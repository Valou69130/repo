const express = require('express');
const router = express.Router();
const { requireAuth, ROLE_PERMS } = require('../middleware/auth');
const { appendAuditEntry } = require('../middleware/auditHelper');
const { appendEvent } = require('../db/appendEvent');
const { ConflictError, NotFoundError } = require('../db/errors');
const {
  MAX, badRequest, isNonEmptyString, isFiniteNumber, isOptionalString,
} = require('../validation');

const REASONS = new Set(['valuation', 'portfolio', 'eligibility', 'settlement', 'other']);

function getDb(req) {
  return req.testDb || require('../db/schema').getDb();
}

function rowToDispute(row) {
  return {
    id: row.id,
    marginCallId: row.margin_call_id,
    openedByUserId: row.opened_by_user_id,
    openedAt: row.opened_at,
    reasonCode: row.reason_code,
    theirProposedValue: row.their_proposed_value,
    ourProposedValue: row.our_proposed_value,
    delta: row.delta,
    status: row.status,
    resolutionNote: row.resolution_note,
    resolvedAt: row.resolved_at,
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

function computeDelta(their, ours) {
  if (!isFiniteNumber(their) || !isFiniteNumber(ours)) return null;
  return Math.abs(their - ours);
}

// ── POST /margin-calls/:id/disputes ────────────────────────────────────
router.post('/margin-calls/:id/disputes', requireAuth, (req, res) => {
  const b = req.body || {};
  const perms = ROLE_PERMS[req.user?.role];
  if (!perms?.canOpenDispute) return res.status(403).json({ error: 'Forbidden' });

  if (!isNonEmptyString(b.id, MAX.id))            return badRequest(res, 'dispute id required');
  if (!REASONS.has(b.reasonCode))                 return badRequest(res, 'invalid reasonCode');
  if (b.theirProposedValue !== undefined && !isFiniteNumber(b.theirProposedValue)) {
    return badRequest(res, 'theirProposedValue must be a finite number');
  }
  if (b.ourProposedValue !== undefined && !isFiniteNumber(b.ourProposedValue)) {
    return badRequest(res, 'ourProposedValue must be a finite number');
  }

  const db = getDb(req);
  const call = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(req.params.id);
  if (!call) return res.status(404).json({ error: 'Margin call not found' });

  const existing = db.prepare('SELECT id FROM disputes WHERE id = ?').get(b.id);
  if (existing) return res.status(409).json({ error: 'Dispute id already exists' });

  const delta = computeDelta(b.theirProposedValue, b.ourProposedValue);

  let event;
  try {
    event = appendEvent(db, {
      marginCallId: call.id,
      eventType: 'dispute_opened',
      actor: { id: req.user.id, type: 'user' },
      payload: {
        disputeId: b.id,
        reasonCode: b.reasonCode,
        theirProposedValue: b.theirProposedValue ?? null,
        ourProposedValue:   b.ourProposedValue ?? null,
        delta,
      },
    });
  } catch (err) {
    return writeErr(res, err);
  }

  db.prepare(`
    INSERT INTO disputes
      (id, margin_call_id, opened_by_user_id, opened_at, reason_code,
       their_proposed_value, our_proposed_value, delta, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')
  `).run(
    b.id, call.id, req.user.id, event.occurredAt, b.reasonCode,
    b.theirProposedValue ?? null, b.ourProposedValue ?? null, delta,
  );

  appendAuditEntry(db, req.user, 'dispute opened', b.id, call.current_state, 'disputed', b.reasonCode);
  const drow = db.prepare('SELECT * FROM disputes WHERE id = ?').get(b.id);
  const crow = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(call.id);
  res.status(201).json({ dispute: rowToDispute(drow), marginCall: rowToCall(crow), event });
});

// ── Helpers for /disputes/:id/* ────────────────────────────────────────
function loadDispute(db, id) {
  return db.prepare('SELECT * FROM disputes WHERE id = ?').get(id);
}

// ── POST /disputes/:id/propose ─────────────────────────────────────────
router.post('/disputes/:id/propose', requireAuth, (req, res) => {
  const b = req.body || {};
  const perms = ROLE_PERMS[req.user?.role];
  if (!perms || (!perms.canOpenDispute && !perms.canResolveDispute)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!isFiniteNumber(b.theirProposedValue)) return badRequest(res, 'theirProposedValue required');
  if (!isFiniteNumber(b.ourProposedValue))   return badRequest(res, 'ourProposedValue required');
  if (!isOptionalString(b.note, MAX.mediumText)) return badRequest(res, 'note too long');

  const db = getDb(req);
  const dispute = loadDispute(db, req.params.id);
  if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
  if (dispute.status !== 'open') return res.status(409).json({ error: 'Dispute not open', status: dispute.status });

  const delta = computeDelta(b.theirProposedValue, b.ourProposedValue);
  let event;
  try {
    event = appendEvent(db, {
      marginCallId: dispute.margin_call_id,
      eventType: 'dispute_proposed',
      actor: { id: req.user.id, type: 'user' },
      payload: {
        disputeId: dispute.id,
        theirProposedValue: b.theirProposedValue,
        ourProposedValue: b.ourProposedValue,
        delta,
        note: b.note ?? null,
      },
    });
  } catch (err) {
    return writeErr(res, err);
  }

  db.prepare(`
    UPDATE disputes SET their_proposed_value = ?, our_proposed_value = ?, delta = ?
    WHERE id = ?
  `).run(b.theirProposedValue, b.ourProposedValue, delta, dispute.id);

  appendAuditEntry(db, req.user, 'dispute proposal', dispute.id, '', '', `delta ${delta}`);
  const drow = loadDispute(db, dispute.id);
  const crow = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(dispute.margin_call_id);
  res.json({ dispute: rowToDispute(drow), marginCall: rowToCall(crow), event });
});

// ── POST /disputes/:id/agree ───────────────────────────────────────────
router.post('/disputes/:id/agree', requireAuth, (req, res) => {
  const b = req.body || {};
  const perms = ROLE_PERMS[req.user?.role];
  if (!perms?.canResolveDispute) return res.status(403).json({ error: 'Forbidden' });

  if (b.agreedAmount !== undefined && !isFiniteNumber(b.agreedAmount)) {
    return badRequest(res, 'agreedAmount must be a finite number');
  }
  if (!isOptionalString(b.resolutionNote, MAX.mediumText)) {
    return badRequest(res, 'resolutionNote too long');
  }

  const db = getDb(req);
  const dispute = loadDispute(db, req.params.id);
  if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
  if (dispute.status !== 'open') return res.status(409).json({ error: 'Dispute not open', status: dispute.status });

  let event;
  try {
    event = appendEvent(db, {
      marginCallId: dispute.margin_call_id,
      eventType: 'dispute_agreed',
      actor: { id: req.user.id, type: 'user' },
      payload: {
        disputeId: dispute.id,
        agreedAmount: b.agreedAmount ?? null,
        resolutionNote: b.resolutionNote ?? null,
      },
      expectedState: b.expectedState,
    });
  } catch (err) {
    return writeErr(res, err);
  }

  db.prepare(`
    UPDATE disputes
    SET status = 'agreed', resolution_note = ?, resolved_at = ?
    WHERE id = ?
  `).run(b.resolutionNote ?? null, event.occurredAt, dispute.id);

  if (isFiniteNumber(b.agreedAmount)) {
    db.prepare('UPDATE margin_calls SET call_amount = ?, updated_at = ? WHERE id = ?')
      .run(b.agreedAmount, event.occurredAt, dispute.margin_call_id);
  }

  appendAuditEntry(db, req.user, 'dispute agreed', dispute.id, 'disputed', 'agreed', b.resolutionNote ?? '');
  const drow = loadDispute(db, dispute.id);
  const crow = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(dispute.margin_call_id);
  res.json({ dispute: rowToDispute(drow), marginCall: rowToCall(crow), event });
});

// ── POST /disputes/:id/withdraw ────────────────────────────────────────
router.post('/disputes/:id/withdraw', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!isNonEmptyString(b.reason, MAX.mediumText)) return badRequest(res, 'reason required');

  const db = getDb(req);
  const dispute = loadDispute(db, req.params.id);
  if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
  if (dispute.opened_by_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the originator can withdraw' });
  }
  if (dispute.status !== 'open') return res.status(409).json({ error: 'Dispute not open', status: dispute.status });

  let event;
  try {
    event = appendEvent(db, {
      marginCallId: dispute.margin_call_id,
      eventType: 'dispute_withdrawn',
      actor: { id: req.user.id, type: 'user' },
      payload: { disputeId: dispute.id, reason: b.reason },
      expectedState: b.expectedState,
    });
  } catch (err) {
    return writeErr(res, err);
  }

  db.prepare(`UPDATE disputes SET status = 'withdrawn', resolved_at = ? WHERE id = ?`)
    .run(event.occurredAt, dispute.id);

  appendAuditEntry(db, req.user, 'dispute withdrawn', dispute.id, 'disputed', 'cancelled', b.reason);
  const drow = loadDispute(db, dispute.id);
  const crow = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(dispute.margin_call_id);
  res.json({ dispute: rowToDispute(drow), marginCall: rowToCall(crow), event });
});

// ── POST /disputes/:id/escalate ────────────────────────────────────────
router.post('/disputes/:id/escalate', requireAuth, (req, res) => {
  const b = req.body || {};
  const perms = ROLE_PERMS[req.user?.role];
  if (!perms?.canResolveDispute) return res.status(403).json({ error: 'Forbidden' });

  if (!isNonEmptyString(b.reason, MAX.mediumText)) return badRequest(res, 'reason required');

  const db = getDb(req);
  const dispute = loadDispute(db, req.params.id);
  if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
  if (dispute.status !== 'open') return res.status(409).json({ error: 'Dispute not open', status: dispute.status });

  let event;
  try {
    event = appendEvent(db, {
      marginCallId: dispute.margin_call_id,
      eventType: 'dispute_escalated',
      actor: { id: req.user.id, type: 'user' },
      payload: { disputeId: dispute.id, reason: b.reason },
    });
  } catch (err) {
    return writeErr(res, err);
  }

  db.prepare(`UPDATE disputes SET status = 'escalated' WHERE id = ?`).run(dispute.id);

  appendAuditEntry(db, req.user, 'dispute escalated', dispute.id, 'open', 'escalated', b.reason);
  const drow = loadDispute(db, dispute.id);
  const crow = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(dispute.margin_call_id);
  res.json({ dispute: rowToDispute(drow), marginCall: rowToCall(crow), event });
});

module.exports = router;
