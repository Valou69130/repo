const STATES = [
  'draft', 'issued', 'pending_four_eyes', 'disputed',
  'agreed', 'delivered', 'settled', 'resolved', 'cancelled',
];

const TERMINAL = new Set(['resolved', 'cancelled']);

const EVENTS = [
  'issued', 'accepted', 'four_eyes_requested', 'four_eyes_granted', 'four_eyes_rejected',
  'dispute_opened', 'dispute_proposed', 'dispute_agreed', 'dispute_withdrawn', 'dispute_escalated',
  'delivery_marked', 'settled', 'resolved', 'cancelled',
  'commented', 'deadline_breached',
];

const TRANSITIONS = {
  draft: {
    issued: 'issued',
    four_eyes_requested: 'pending_four_eyes',
    cancelled: 'cancelled',
  },
  issued: {
    accepted: 'agreed',
    four_eyes_requested: 'pending_four_eyes',
    dispute_opened: 'disputed',
    cancelled: 'cancelled',
  },
  pending_four_eyes: {
    four_eyes_granted: 'agreed',
    four_eyes_rejected: 'disputed',
    cancelled: 'cancelled',
  },
  disputed: {
    dispute_agreed: 'agreed',
    dispute_withdrawn: 'cancelled',
    four_eyes_requested: 'pending_four_eyes',
    cancelled: 'cancelled',
  },
  agreed: {
    delivery_marked: 'delivered',
    cancelled: 'cancelled',
  },
  delivered: {
    settled: 'settled',
    cancelled: 'cancelled',
  },
  settled: {
    resolved: 'resolved',
  },
  resolved: {},
  cancelled: {},
};

const NON_PROGRESSING = new Set(['commented', 'deadline_breached', 'dispute_proposed', 'dispute_escalated']);

function stateForEvent(event, currentState) {
  if (TERMINAL.has(currentState)) {
    throw new Error(`Cannot apply event '${event}' to terminal state '${currentState}'`);
  }
  if (NON_PROGRESSING.has(event)) {
    return currentState;
  }
  const next = TRANSITIONS[currentState]?.[event];
  if (!next) {
    throw new Error(`invalid transition: event '${event}' not allowed from state '${currentState}'`);
  }
  return next;
}

function allowedTransitions(currentState) {
  if (TERMINAL.has(currentState)) return [];
  return Object.keys(TRANSITIONS[currentState] ?? {});
}

module.exports = { STATES, EVENTS, TRANSITIONS, stateForEvent, allowedTransitions };
