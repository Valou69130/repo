const Anthropic        = require('@anthropic-ai/sdk');
const AnthropicBedrock = require('@anthropic-ai/bedrock-sdk');

const AI_ENABLED    = process.env.AI_ENABLED === 'true';
const AI_PROVIDER   = process.env.AI_PROVIDER || 'anthropic'; // 'anthropic' | 'bedrock'

// Direct Anthropic API model names
const MODEL_COMPLEX = process.env.AI_MODEL_COMPLEX || 'claude-opus-4-6';
const MODEL_ROUTINE = process.env.AI_MODEL_ROUTINE || 'claude-sonnet-4-6';

// Bedrock cross-region inference profile IDs (eu-central-1)
// These follow the pattern: eu.anthropic.{name}-{date}-v{n}:{minor}
// Check AWS console → Bedrock → Cross-region inference for exact IDs available in your account.
const BEDROCK_MODEL_COMPLEX = process.env.BEDROCK_MODEL_COMPLEX || 'eu.anthropic.claude-opus-4-5-20251101-v1:0';
const BEDROCK_MODEL_ROUTINE = process.env.BEDROCK_MODEL_ROUTINE || 'eu.anthropic.claude-sonnet-4-5-20251001-v1:0';

let _client = null;

function getClient() {
  if (!AI_ENABLED) return null;
  if (_client) return _client;

  if (AI_PROVIDER === 'bedrock') {
    // Auth via standard AWS credential chain:
    // AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY, or IAM role, or ~/.aws/credentials
    _client = new AnthropicBedrock({
      awsRegion: process.env.AWS_REGION || 'eu-central-1',
      ...(process.env.AWS_ACCESS_KEY_ID && {
        awsAccessKey:    process.env.AWS_ACCESS_KEY_ID,
        awsSecretKey:    process.env.AWS_SECRET_ACCESS_KEY,
        awsSessionToken: process.env.AWS_SESSION_TOKEN,
      }),
    });
    return _client;
  }

  // Default: direct Anthropic API
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

function isEnabled() {
  if (!AI_ENABLED) return false;
  if (AI_PROVIDER === 'bedrock') return !!(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ROLE_ARN);
  return !!process.env.ANTHROPIC_API_KEY;
}

function models() {
  if (AI_PROVIDER === 'bedrock') {
    return { complex: BEDROCK_MODEL_COMPLEX, routine: BEDROCK_MODEL_ROUTINE };
  }
  return { complex: MODEL_COMPLEX, routine: MODEL_ROUTINE };
}

function provider() {
  return AI_PROVIDER;
}

module.exports = { getClient, isEnabled, models, provider };
