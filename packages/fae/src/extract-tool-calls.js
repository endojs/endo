// @ts-check

/**
 * @typedef {object} ChatMessage
 * @property {'system'|'user'|'assistant'|'tool'} role
 * @property {string} [content]
 * @property {Array<{ id?: string, function: { name: string, arguments: string|object }}>} [tool_calls]
 * @property {string} [tool_call_id]
 */

/**
 * Extract tool calls embedded in assistant content as XML tags.
 * Some models embed tool calls as <tool_call>...</tool_call> in text content
 * rather than using the structured tool_calls field.
 *
 * @param {string} content
 * @returns {{ toolCalls: ChatMessage['tool_calls'], cleanedContent: string }}
 */
export const extractToolCallsFromContent = content => {
  /** @type {NonNullable<ChatMessage['tool_calls']>} */
  const toolCalls = [];
  const toolCallRe = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  const matches = content.matchAll(toolCallRe);
  let index = 0;
  for (const match of matches) {
    const block = match[1].trim();
    let name = '';
    /** @type {string | object} */
    let args = '{}';
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
      const nameMatch = block.match(/"name"\s*:\s*"([^"]+)"/);
      const argsMatch = block.match(/"arguments"\s*:\s*(\{[\s\S]*\})/);
      name = nameMatch ? nameMatch[1] : '';
      args = argsMatch ? argsMatch[1].trim() : '{}';
    }
    if (name) {
      toolCalls.push({
        id: `tool_${Date.now()}_${index}`,
        function: { name, arguments: args },
      });
      index += 1;
    }
  }

  let cleanedContent = content.replace(toolCallRe, '');
  cleanedContent = cleanedContent.replace(/<think>[\s\S]*?<\/think>/g, '');
  cleanedContent = cleanedContent.trim();

  return {
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    cleanedContent,
  };
};
harden(extractToolCallsFromContent);
