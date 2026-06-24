// @ts-check

/**
 * @typedef {object} ChatToolCall
 * @property {string} [id]
 * @property {{ name: string, arguments: Record<string, unknown> | string }} function
 */

/**
 * Minimal message shape consumed by `toOpenAICompatibleMessages`. Inlined
 * here because the broader `ChatMessage` type that used to live in
 * `../agent.types.js` was removed when the agent harness migrated to
 * pi-agent-core; the OpenAI-compatible providers in this directory still
 * use this normalization for downstream consumers.
 *
 * @typedef {object} ChatMessage
 * @property {'system' | 'user' | 'assistant' | 'tool'} role
 * @property {string | null} [content]
 * @property {ChatToolCall[]} [tool_calls]
 * @property {string} [tool_call_id]
 */

/** @import { ChatCompletionMessageParam } from 'openai/resources/chat/completions' */

/**
 * Convert a common tool-call argument payload to the string shape required by
 * OpenAI-compatible chat APIs.
 *
 * @param {string | object | undefined} args
 * @returns {string}
 */
const stringifyToolArguments = args => {
  if (typeof args === 'string') {
    return args;
  }
  return JSON.stringify(args ?? {});
};

/**
 * Normalize Lal's common message shape to the stricter OpenAI/OpenRouter
 * history format. Assistant messages with `tool_calls` must preserve each
 * call's `type: "function"` when they are sent back with tool results.
 *
 * @param {ChatMessage[]} messages
 * @returns {ChatCompletionMessageParam[]}
 */
export const toOpenAICompatibleMessages = messages =>
  messages.map((message, messageIndex) => {
    if (message.role === 'assistant') {
      const toolCalls = message.tool_calls?.map((toolCall, toolIndex) => ({
        id: toolCall.id || `tool_${messageIndex}_${toolIndex}`,
        type: /** @type {const} */ ('function'),
        function: {
          name: toolCall.function.name,
          arguments: stringifyToolArguments(toolCall.function.arguments),
        },
      }));

      if (toolCalls && toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: message.content || null,
          tool_calls: toolCalls,
        };
      }
      return { role: 'assistant', content: message.content || '' };
    }

    if (message.role === 'tool') {
      return {
        role: 'tool',
        content: message.content || '',
        tool_call_id: message.tool_call_id || '',
      };
    }

    return { role: message.role, content: message.content || '' };
  });
harden(toOpenAICompatibleMessages);
