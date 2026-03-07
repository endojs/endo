// @ts-check
/**
 * Native Ollama provider for the Lal agent.
 * Uses the `ollama` npm package directly for Ollama-specific features.
 * Adapted from llamadrome/ollama-backend.js.
 */

import { Ollama } from 'ollama';

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
 * Convert common tool format to Ollama's tool format.
 * @param {CommonTool[]} tools
 * @returns {import('ollama').Tool[]}
 */
const toOllamaTools = tools =>
  tools.map(t => ({
    type: /** @type {const} */ ('function'),
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    },
  }));

/**
 * Convert common messages to Ollama's message format.
 * @param {CommonChatMessage[]} messages
 * @returns {import('ollama').Message[]}
 */
const toOllamaMessages = messages => {
  /** @type {import('ollama').Message[]} */
  const ollamaMessages = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      ollamaMessages.push({ role: 'system', content: msg.content });
    } else if (msg.role === 'user') {
      ollamaMessages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      /** @type {import('ollama').Message} */
      const ollamaMsg = { role: 'assistant', content: msg.content || '' };
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        ollamaMsg.tool_calls = msg.tool_calls.map(tc => ({
          function: {
            name: tc.function.name,
            arguments:
              typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments,
          },
        }));
      }
      ollamaMessages.push(ollamaMsg);
    } else if (msg.role === 'tool') {
      // Ollama expects tool results as a tool message
      ollamaMessages.push({
        role: 'tool',
        content: msg.content,
      });
    }
  }

  return ollamaMessages;
};

/**
 * Create a native Ollama-backed chat provider.
 * Uses OLLAMA_HOST for the Ollama server URL (defaults to http://localhost:11434).
 * Uses OLLAMA_API_KEY for authentication if required.
 *
 * @param {{ host?: string, model: string, apiKey?: string }} options
 * @returns {{ chat: (messages: CommonChatMessage[], tools: CommonTool[]) => Promise<{ message: CommonChatMessage }> }}
 */
export const makeOllamaProvider = ({ host, model, apiKey }) => {
  const ollama = new Ollama({
    ...(host && { host }),
    headers: {
      ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
    },
  });

  return {
    async chat(messages, tools) {
      console.log(
        `[LAL] Calling Ollama at ${host || 'localhost:11434'} with model: ${model}`,
      );

      let response;
      try {
        response = await ollama.chat({
          model,
          messages: toOllamaMessages(messages),
          tools: toOllamaTools(tools),
        });
      } catch (error) {
        console.error('[LAL] Ollama API error:', error);
        throw error;
      }

      const content = response.message?.content || '';

      /** @type {CommonChatMessage} */
      const message = {
        role: 'assistant',
        content,
      };

      // Handle tool calls if present
      if (
        response.message?.tool_calls &&
        response.message.tool_calls.length > 0
      ) {
        message.tool_calls = response.message.tool_calls.map(
          (
            /** @type {{ function?: { name?: string, arguments?: object }}} */ tc,
            /** @type {number} */ index,
          ) => ({
            id: `ollama_tool_${Date.now()}_${index}`,
            function: {
              name: tc.function?.name ?? '',
              arguments: JSON.stringify(tc.function?.arguments ?? {}),
            },
          }),
        );
      }

      return { message };
    },
  };
};
