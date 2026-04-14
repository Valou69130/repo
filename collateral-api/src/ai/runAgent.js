const { getClient, models } = require('./client');
const { toolDefinitions, execute } = require('./tools');

const MAX_TOOL_ROUNDS = 8;

/**
 * Run an AI agent with a system prompt, user input, and tool access.
 * Executes the tool-use loop until the model returns final text.
 *
 * @returns {Promise<{ text: string, toolsUsed: string[], inputTokens: number, outputTokens: number, stopReason: string }>}
 */
async function runAgent({ system, userMessage, db, model, maxTokens = 2048, complex = false }) {
  const client = getClient();
  if (!client) throw new Error('AI_DISABLED');

  const chosenModel = model || (complex ? models().complex : models().routine);
  const messages = [{ role: 'user', content: userMessage }];
  const toolsUsed = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await client.messages.create({
      model: chosenModel,
      max_tokens: maxTokens,
      system,
      tools: toolDefinitions,
      messages,
    });

    inputTokens  += response.usage?.input_tokens  || 0;
    outputTokens += response.usage?.output_tokens || 0;

    if (response.stop_reason !== 'tool_use') {
      const raw = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim();
      // Extract optional structured JSON block fenced with ```json ... ```
      let structured = null;
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try { structured = JSON.parse(jsonMatch[1].trim()); } catch (_) { /* ignore */ }
      }
      // Text without the json block
      const text = raw.replace(/```json[\s\S]*?```/g, '').trim();
      return { text, structured, toolsUsed, inputTokens, outputTokens, stopReason: response.stop_reason };
    }

    messages.push({ role: 'assistant', content: response.content });
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      toolsUsed.push(block.name);
      let result;
      try {
        result = execute(block.name, block.input || {}, db);
      } catch (err) {
        result = { error: err.message };
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  throw new Error('AI_TOOL_ROUND_LIMIT');
}

module.exports = { runAgent };
