const crypto = require('crypto');
const { appendAuditEntry } = require('../middleware/auditHelper');

function hashInput(input) {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16);
}

function logAICall(db, user, { agent, model, input, outputSummary, inputTokens, outputTokens, toolsUsed }) {
  const comment = JSON.stringify({
    model,
    inputHash: hashInput(input),
    inputTokens,
    outputTokens,
    toolsUsed: toolsUsed || [],
  });
  appendAuditEntry(
    db,
    user,
    `ai.${agent}`,
    `ai-${Date.now()}`,
    '',
    (outputSummary || '').slice(0, 500),
    comment
  );
}

module.exports = { logAICall, hashInput };
