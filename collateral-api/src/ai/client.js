const Anthropic = require('@anthropic-ai/sdk');

const AI_ENABLED = process.env.AI_ENABLED === 'true';
const REGION = process.env.ANTHROPIC_REGION || 'eu';
const MODEL_COMPLEX = process.env.AI_MODEL_COMPLEX || 'claude-opus-4-6';
const MODEL_ROUTINE = process.env.AI_MODEL_ROUTINE || 'claude-sonnet-4-6';

let _client = null;
function getClient() {
  if (!AI_ENABLED) return null;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (_client) return _client;
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

function isEnabled() {
  return AI_ENABLED && !!process.env.ANTHROPIC_API_KEY;
}

function models() {
  return { complex: MODEL_COMPLEX, routine: MODEL_ROUTINE };
}

function region() {
  return REGION;
}

module.exports = { getClient, isEnabled, models, region };
