const router = require('express').Router();
const { getDb } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { isEnabled } = require('../ai/client');
const rateLimit = require('../ai/rateLimit');
const { logAICall } = require('../ai/audit');
const { explainDeficit, analysePortfolio } = require('../ai/agents/marginIntelligence');
const { correlate } = require('../ai/agents/exceptionCorrelator');
const { chat } = require('../ai/agents/chat');
const { MAX, sanitise, isNonEmptyString, badRequest } = require('../validation');

router.get('/status', requireAuth, (req, res) => {
  res.json({ enabled: isEnabled() });
});

function guard(req, res) {
  if (!isEnabled()) {
    res.status(503).json({ error: 'AI layer is disabled', code: 'AI_DISABLED' });
    return false;
  }
  const rl = rateLimit.check(req.user.name);
  if (!rl.allowed) {
    res.status(429).json({ error: 'AI rate limit exceeded', retryAfterSec: rl.retryAfterSec });
    return false;
  }
  res.setHeader('X-AI-Remaining', String(rl.remaining));
  return true;
}

async function runWithAudit(req, res, agent, input, runner) {
  try {
    const db = getDb();
    const result = await runner();
    logAICall(db, req.user, {
      agent,
      model: result.modelUsed || 'mixed',
      input,
      outputSummary: result.text,
      inputTokens:  result.inputTokens,
      outputTokens: result.outputTokens,
      toolsUsed:    result.toolsUsed,
    });
    res.json({
      text: result.text,
      structured: result.structured ?? null,
      toolsUsed: result.toolsUsed,
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
    });
  } catch (err) {
    if (err.message === 'AI_DISABLED') return res.status(503).json({ error: 'AI disabled' });
    if (err.message === 'AI_TOOL_ROUND_LIMIT') return res.status(504).json({ error: 'AI reasoning exceeded tool round limit' });
    console.error('[ai]', agent, err);
    res.status(502).json({ error: 'AI provider error' });
  }
}

router.post('/margin/explain', requireAuth, async (req, res) => {
  if (!guard(req, res)) return;
  const repoId = sanitise(req.body.repoId);
  if (!isNonEmptyString(repoId, MAX.id)) return badRequest(res, 'repoId required');
  await runWithAudit(req, res, 'margin.explain', { repoId }, () => explainDeficit({ repoId, db: getDb() }));
});

router.post('/margin/portfolio', requireAuth, async (req, res) => {
  if (!guard(req, res)) return;
  await runWithAudit(req, res, 'margin.portfolio', {}, () => analysePortfolio({ db: getDb() }));
});

router.post('/exceptions/correlate', requireAuth, async (req, res) => {
  if (!guard(req, res)) return;
  await runWithAudit(req, res, 'exceptions.correlate', {}, () => correlate({ db: getDb() }));
});

router.post('/chat', requireAuth, async (req, res) => {
  if (!guard(req, res)) return;
  const history = Array.isArray(req.body.history) ? req.body.history : null;
  if (!history || history.length === 0) return badRequest(res, 'history required');
  for (const m of history) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return badRequest(res, 'invalid history role');
    if (!isNonEmptyString(m.content, MAX.longText)) return badRequest(res, `message content required, max ${MAX.longText} chars`);
    m.content = sanitise(m.content);
  }
  await runWithAudit(req, res, 'chat', { turns: history.length }, () => chat({ history, db: getDb() }));
});

module.exports = router;
