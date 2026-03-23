// @ts-check

/**
 * @typedef {object} ChatMessage
 * @property {'system'|'user'|'assistant'|'tool'} role
 * @property {string} [content]
 * @property {Array<{ id?: string, function: { name: string, arguments: string|object }}>} [tool_calls]
 * @property {string} [tool_call_id]
 */

/**
 * Parse the `<function=name><parameter=key>value</parameter>...</function>`
 * format that some models (e.g. Qwen) emit inside `<tool_call>` blocks.
 *
 * @param {string} block - content inside `<tool_call>...</tool_call>`
 * @returns {{ name: string, args: string } | undefined}
 */
/**
 * Try to recover a typed value from a raw parameter string.
 * Handles JSON arrays/objects, numbers, booleans, and falls back
 * to plain string.
 *
 * @param {string} raw
 * @returns {unknown}
 */
const parseParamValue = raw => {
  const trimmed = raw.trim();
  // Try JSON parse for arrays, objects, booleans, null
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through
  }
  // Try number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
};

/**
 * @param {string} block
 * @returns {{ name: string, args: string } | undefined}
 */
const parseFunctionParamFormat = block => {
  // Match <function=name> ... </function> or just <function=name> ...
  const fnMatch = block.match(/<function=([^>]+)>/);
  if (!fnMatch) return undefined;

  const name = fnMatch[1].trim();
  /** @type {Record<string, unknown>} */
  const args = {};

  // Match <parameter=key>value</parameter> pairs
  const paramRe = /<parameter=([^>]+)>\s*([\s\S]*?)\s*<\/parameter>/g;
  for (const pm of block.matchAll(paramRe)) {
    args[pm[1].trim()] = parseParamValue(pm[2]);
  }

  // Also handle malformed variant: <parameter=key> value <parameter>
  // (no closing tag, just another <parameter> or end)
  if (Object.keys(args).length === 0) {
    const looseParamRe =
      /<parameter=([^>]+)>\s*([\s\S]*?)(?=<parameter|<\/function|<function|$)/g;
    for (const pm of block.matchAll(looseParamRe)) {
      const key = pm[1].trim();
      const val = pm[2].replace(/<\/?parameter>/g, '').trim();
      if (key && val) {
        args[key] = parseParamValue(val);
      }
    }
  }

  if (!name) return undefined;
  return { name, args: JSON.stringify(args) };
};

/**
 * Extract tool calls embedded in assistant content as XML tags.
 * Handles multiple formats:
 *  1. `<tool_call>{"name":"...","arguments":{...}}</tool_call>` (JSON)
 *  2. `<tool_call><function=name><parameter=k>v</parameter>...</function></tool_call>`
 *  3. Tool calls inside `<think>` blocks
 *
 * @param {string} content
 * @returns {{ toolCalls: ChatMessage['tool_calls'], cleanedContent: string }}
 */
export const extractToolCallsFromContent = content => {
  /** @type {NonNullable<ChatMessage['tool_calls']>} */
  const toolCalls = [];

  // First pass: extract <tool_call>...</tool_call> blocks (including
  // those nested inside <think> blocks).
  const toolCallRe = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  const matches = content.matchAll(toolCallRe);
  let index = 0;
  for (const match of matches) {
    const block = match[1].trim();
    let name = '';
    /** @type {string | object} */
    let args = '{}';

    // Try JSON format first
    try {
      const parsed = JSON.parse(block);
      if (parsed && typeof parsed === 'object') {
        name = parsed.name || '';
        if (parsed.arguments !== undefined) {
          args =
            typeof parsed.arguments === 'string'
              ? parsed.arguments
              : JSON.stringify(parsed.arguments);
        }
      }
    } catch {
      // Try <function=name><parameter=key>value</parameter> format
      const funcResult = parseFunctionParamFormat(block);
      if (funcResult) {
        name = funcResult.name;
        args = funcResult.args;
      } else {
        // Last resort: look for JSON-like patterns
        const nameMatch = block.match(/"name"\s*:\s*"([^"]+)"/);
        const argsMatch = block.match(/"arguments"\s*:\s*(\{[\s\S]*\})/);
        name = nameMatch ? nameMatch[1] : '';
        args = argsMatch ? argsMatch[1].trim() : '{}';
      }
    }

    if (name) {
      toolCalls.push({
        id: `tool_${Date.now()}_${index}`,
        type: 'function',
        function: { name, arguments: args },
      });
      index += 1;
    }
  }

  // Second pass: look for <function=name> blocks NOT inside <tool_call>
  // tags (some models emit these bare).
  const bareFnRe =
    /<function=([^>]+)>([\s\S]*?)(?:<\/function>|$)/g;
  // Only scan content outside of <tool_call> blocks
  const contentWithoutToolCalls = content.replace(toolCallRe, '');
  for (const fm of contentWithoutToolCalls.matchAll(bareFnRe)) {
    const fnName = fm[1].trim();
    const fnBody = fm[2];
    /** @type {Record<string, unknown>} */
    const fnArgs = {};
    const paramRe =
      /<parameter=([^>]+)>\s*([\s\S]*?)(?:<\/parameter>|(?=<parameter)|(?=<\/function)|$)/g;
    for (const pm of fnBody.matchAll(paramRe)) {
      const key = pm[1].trim();
      const val = pm[2].replace(/<\/?parameter>/g, '').trim();
      if (key && val) {
        fnArgs[key] = parseParamValue(val);
      }
    }
    if (fnName) {
      toolCalls.push({
        id: `tool_${Date.now()}_${index}`,
        type: 'function',
        function: { name: fnName, arguments: JSON.stringify(fnArgs) },
      });
      index += 1;
    }
  }

  let cleanedContent = content.replace(toolCallRe, '');
  cleanedContent = cleanedContent.replace(bareFnRe, '');
  cleanedContent = cleanedContent.replace(/<think>[\s\S]*?<\/think>/g, '');
  // Also strip unclosed <think> blocks (model sometimes omits </think>)
  cleanedContent = cleanedContent.replace(/<think>[\s\S]*/g, '');
  cleanedContent = cleanedContent.trim();

  return {
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    cleanedContent,
  };
};
harden(extractToolCallsFromContent);
