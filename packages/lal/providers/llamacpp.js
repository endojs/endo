// @ts-check
/**
 * llama.cpp server provider for the Lal agent.
 * Uses the OpenAI-compatible API that many llama.cpp servers expose.
 * Supports context-size and request options that differ from Anthropic.
 */

import OpenAI from 'openai';

/**
 * @typedef {object} CommonTool
 * @property {'function'} type
 * @property {{ name: string, description: string, parameters: object }} function
 */

/**
 * @typedef {object} CommonChatMessage
 * @property {'system'|'user'|'assistant'|'tool'} role
 * @property {string} content
 * @property {Array<{ id?: string, function: { name: string, arguments: string|object }}>} [tool_calls]
 * @property {string} [tool_call_id]
 */

/**
 * Create a llama.cpp-backed chat provider (OpenAI-compatible API).
 * Uses LAL_HOST as baseURL and LAL_MODEL; optional LAL_AUTH_TOKEN.
 * Optional LAL_MAX_TOKENS sets max_tokens for completion (default 4096).
 * If the server returns "context size" errors, increase the server's n_ctx
 * or set LAL_MAX_MESSAGES to truncate to the last N messages before sending.
 *
 * @param {{ baseURL: string, model: string, apiKey?: string, maxTokens?: number, maxMessages?: number }} options
 * @returns {{ chat: (messages: CommonChatMessage[], tools: CommonTool[]) => Promise<{ message: CommonChatMessage }> }}
 */
export const makeLlamaCppProvider = ({
  baseURL,
  model,
  apiKey = 'ollama',
  maxTokens = 4096,
  maxMessages = undefined,
}) => {
  const client = new OpenAI({
    apiKey,
    baseURL,
  });

  return {
    async chat(messages, tools) {
      let sendMessages = messages;
      if (
        typeof maxMessages === 'number' &&
        maxMessages > 0 &&
        messages.length > maxMessages
      ) {
        sendMessages = messages.slice(-maxMessages);
        console.log(
          `[LAL] Truncated to last ${maxMessages} messages (was ${messages.length})`,
        );
      }
      console.log(`[LAL] Calling llama.cpp at ${baseURL} with model: ${model}`);
      let response;
      try {
        response = await client.chat.completions.create({
          model,
          max_tokens: maxTokens,
            tools,
          // @ts-expect-error - our message format matches OpenAI's for this path
          messages: sendMessages,
        });
      } catch (error) {
        console.error('[LAL] llama.cpp API error:', error);
        throw error;
      }
      const choice = response.choices?.[0];
      if (!choice) {
        return { message: { role: 'assistant', content: '' } };
      }
      /** @type {CommonChatMessage} */
      const message = {
        role: 'assistant',
        content: choice.message?.content ?? '',
      };
      if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
        message.tool_calls = choice.message.tool_calls.map(tc => ({
          id: tc.id,
          function: {
            name: tc.function?.name ?? '',
            arguments: tc.function?.arguments ?? '{}',
          },
        }));
      }
      return { message };
    },
  };
};
