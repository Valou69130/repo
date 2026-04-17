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

router.get('/', requireAuth, (req, res) => {
  const db = getDb(req);
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (req.query.state)        { where.push('current_state = ?'); params.push(req.query.state); }
  if (req.query.agreement)    { where.push('agreement_id = ?'); params.push(req.query.agreement); }
  if (req.query.direction)    { where.push('direction = ?'); params.push(req.query.direction); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM margin_calls ${whereSql}`).get(...params).c;
  const rows  = db.prepare(
    `SELECT * FROM margin_calls ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ data: rows.map(rowToCall), total, page, limit });
});

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb(req);
  const row = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Margin call not found' });
  const events = db.prepare(
    'SELECT id, event_type, occurred_at, actor_user_id, actor_type, payload_json, prev_hash, hash FROM margin_call_events WHERE margin_call_id = ? ORDER BY id ASC'
  ).all(req.params.id);
  const disputes = db.prepare(
    'SELECT * FROM disputes WHERE margin_call_id = ? ORDER BY opened_at ASC'
  ).all(req.params.id);
  res.json({
    ...rowToCall(row),
    events: events.map(e => ({
      id: e.id,
      eventType: e.event_type,
      occurredAt: e.occurred_at,
      actorUserId: e.actor_user_id,
      actorType: e.actor_type,
      payload: JSON.parse(e.payload_json),
      prevHash: e.prev_hash,
      hash: e.hash,
    })),
    disputes: disputes.map(d => ({
      id: d.id,
      marginCallId: d.margin_call_id,
      openedByUserId: d.opened_by_user_id,
      openedAt: d.opened_at,
      reasonCode: d.reason_code,
      theirProposedValue: d.their_proposed_value,
      ourProposedValue: d.our_proposed_value,
      delta: d.delta,
      status: d.status,
      resolutionNote: d.resolution_note,
      resolvedAt: d.resolved_at,
    })),
  });
});

function runAction(req, res, { eventType, permCheck, payloadBuilder }) {
  const db = getDb(req);
  const id = req.params.id;
  const body = req.body || {};
  const perms = ROLE_PERMS[req.user?.role];
  if (!perms) return res.status(403).json({ error: 'Forbidden' });
  if (!permCheck(perms)) return res.status(403).json({ error: 'Forbidden' });

  const call = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(id);
  if (!call) return res.status(404).json({ error: 'Margin call not found' });

  let event;
  try {
    event = appendEvent(db, {
      marginCallId: id,
      eventType,
      actor: { id: req.user.id, type: 'user' },
      payload: payloadBuilder ? payloadBuilder(body, call) : body,
      expectedState: body.expectedState,
    });
  } catch (err) {
    return writeError(res, err);
  }

  if (eventType === 'delivery_marked' && body.settlementRef) {
    db.prepare('UPDATE margin_calls SET settlement_ref = ?, updated_at = ? WHERE id = ?')
      .run(body.settlementRef, event.occurredAt, id);
  }
  if (event.newState === 'settled' || event.newState === 'resolved') {
    db.prepare('UPDATE margin_calls SET resolved_at = ? WHERE id = ?').run(event.occurredAt, id);
  }

  // Auto-advance settled → resolved per spec.
  if (event.newState === 'settled') {
    try {
      const sys = appendEvent(db, {
        marginCallId: id,
        eventType: 'resolved',
        actor: { id: null, type: 'system' },
        payload: { auto: true },
        expectedState: 'settled',
      });
      db.prepare('UPDATE margin_calls SET resolved_at = ? WHERE id = ?').run(sys.occurredAt, id);
    } catch (_) { /* swallow */ }
  }

  appendAuditEntry(db, req.user, `margin call ${eventType}`, id, call.current_state, '');
  const row = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(id);
  res.json({ marginCall: rowToCall(row), event });
}

router.post('/:id/issue', requireAuth, (req, res) => {
  runAction(req, res, {
    eventType: 'issued',
    permCheck: (p) => p.canIssueCall,
    payloadBuilder: (_b, c) => ({ callAmount: c.call_amount, currency: c.currency }),
  });
});

router.post('/:id/accept', requireAuth, (req, res) => {
  runAction(req, res, {
    eventType: 'accepted',
    permCheck: (p) => p.canRespondCall,
    payloadBuilder: (_b, c) => ({ callAmount: c.call_amount }),
  });
});

router.post('/:id/mark-delivered', requireAuth, (req, res) => {
  const db = getDb(req);
  const call = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(req.params.id);
  const b = req.body || {};
  if (call) {
    if (!isNonEmptyString(b.settlementRef, MAX.shortText)) return badRequest(res, 'settlementRef required');
    if (!isFiniteNumber(b.deliveredAmount)) return badRequest(res, 'deliveredAmount must be a finite number');
    const variance = Math.abs(b.deliveredAmount - call.call_amount) > 0.01;
    if (variance && !isNonEmptyString(b.varianceReason, MAX.mediumText)) {
      return badRequest(res, 'varianceReason required when delivered amount differs from call amount');
    }
  }
  runAction(req, res, {
    eventType: 'delivery_marked',
    permCheck: (p) => p.canRespondCall,
    payloadBuilder: (body) => ({
      settlementRef: body.settlementRef,
      deliveredAmount: body.deliveredAmount,
      varianceReason: body.varianceReason ?? null,
    }),
  });
});

router.post('/:id/confirm-settlement', requireAuth, (req, res) => {
  runAction(req, res, {
    eventType: 'settled',
    permCheck: (p) => p.canRespondCall,
    payloadBuilder: () => ({}),
  });
});

router.post('/:id/cancel', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!isNonEmptyString(b.reason, MAX.mediumText)) {
    // Check perm first — only 400 after a permitted user proves perm.
    const perms = ROLE_PERMS[req.user?.role];
    if (!perms || !perms.canCancelCall) return res.status(403).json({ error: 'Forbidden' });
    return badRequest(res, 'reason required');
  }
  runAction(req, res, {
    eventType: 'cancelled',
    permCheck: (p) => p.canCancelCall,
    payloadBuilder: (body) => ({ reason: body.reason }),
  });
});

module.exports = router;
