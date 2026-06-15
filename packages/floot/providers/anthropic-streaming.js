// @ts-check
/**
 * Streaming Anthropic provider for the Floot agent.
 *
 * Deliberately NOT a modification of @endo/lal's anthropic.js — Floot learns
 * from lal but keeps its own provider so streaming can be added without
 * touching the existing (buffered) harnesses. The message/tool conversion
 * mirrors lal so the common wire shape stays identical; the only new surface
 * is `chatStream(messages, tools, onToken)`, which forwards token deltas as
 * they arrive and still resolves to the same buffered `{ message }` result.
 */

/** @import { Anthropic } from '@anthropic-ai/sdk' */
/** @typedef {import('@anthropic-ai/sdk').default} AnthropicClient */

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
 * @param {CommonTool[]} tools
 * @returns {Anthropic.Tool[]}
 */
const toAnthropicTools = tools =>
  tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: /** @type {Anthropic.Tool.InputSchema} */ (
      t.function.parameters
    ),
  }));

/**
 * @param {CommonChatMessage[]} messages
 * @returns {{ system: string, messages: Anthropic.MessageParam[] }}
 */
const toAnthropicMessages = messages => {
  let system = '';
  /** @type {Anthropic.MessageParam[]} */
  const anthropicMessages = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = msg.content;
    } else if (msg.role === 'user') {
      anthropicMessages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      /** @type {Anthropic.ContentBlockParam[]} */
      const content = [];
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          const args =
            typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments;
          content.push({
            type: 'tool_use',
            id:
              tc.id ||
              `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name: tc.function.name,
            input: args,
          });
        }
      }
      if (content.length > 0) {
        anthropicMessages.push({ role: 'assistant', content });
      }
    } else if (msg.role === 'tool') {
      const toolUseId = msg.tool_call_id || 'unknown';
      anthropicMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: msg.content,
          },
        ],
      });
    }
  }

  return { system, messages: anthropicMessages };
};

/**
 * @param {Anthropic.Message} response
 * @returns {CommonChatMessage}
 */
const fromAnthropicMessage = response => {
  /** @type {CommonChatMessage} */
  const message = { role: 'assistant', content: '' };
  /** @type {CommonChatMessage['tool_calls']} */
  const toolCalls = [];

  for (const block of response.content) {
    if (block.type === 'text') {
      message.content += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }
  return message;
};

/**
 * @param {unknown} error
 * @returns {never}
 */
const rethrowAnthropic = error => {
  const err =
    /** @type {{ status?: number, statusCode?: number, error?: { type?: string, message?: string }, body?: { type?: string, message?: string }, message?: string }} */ (
      error
    );
  const status = err.status ?? err.statusCode;
  const errBody = err.error ?? err.body;
  const isAuthError =
    status === 401 ||
    errBody?.type === 'authentication_error' ||
    /invalid x-api-key|api key|authentication/i.test(
      errBody?.message || err.message || '',
    );
  if (isAuthError) {
    throw new Error(
      'Anthropic API authentication failed (invalid or expired API key). Check LAL_AUTH_TOKEN.',
    );
  }
  throw error;
};

/**
 * Create a streaming Anthropic-backed chat provider.
 *
 * @param {{ apiKey: string, model: string, maxTokens?: number }} options
 * @returns {{
 *   chat: (messages: CommonChatMessage[], tools: CommonTool[]) => Promise<{ message: CommonChatMessage }>,
 *   chatStream: (messages: CommonChatMessage[], tools: CommonTool[], onToken?: (delta: string) => void) => Promise<{ message: CommonChatMessage }>,
 * }}
 */
export const makeStreamingAnthropicProvider = ({
  apiKey,
  model,
  maxTokens = 4096,
}) => {
  /** @type {Promise<AnthropicClient> | undefined} */
  let clientP;

  /** @returns {Promise<AnthropicClient>} */
  const getClient = async () => {
    if (clientP === undefined) {
      clientP = import('@anthropic-ai/sdk').then(
        ({ default: AnthropicClient }) => new AnthropicClient({ apiKey }),
      );
    }
    return clientP;
  };

  return {
    async chat(messages, tools) {
      const client = await getClient();
      const { system, messages: anthropicMessages } =
        toAnthropicMessages(messages);
      try {
        const response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          tools: toAnthropicTools(tools),
          messages: anthropicMessages,
        });
        return { message: fromAnthropicMessage(response) };
      } catch (error) {
        console.error('[floot] Anthropic API error:', error);
        return rethrowAnthropic(error);
      }
    },

    async chatStream(messages, tools, onToken) {
      const client = await getClient();
      const { system, messages: anthropicMessages } =
        toAnthropicMessages(messages);
      try {
        const stream = client.messages.stream({
          model,
          max_tokens: maxTokens,
          system,
          tools: toAnthropicTools(tools),
          messages: anthropicMessages,
        });
        if (onToken) {
          stream.on('text', delta => onToken(delta));
        }
        const response = await stream.finalMessage();
        return { message: fromAnthropicMessage(response) };
      } catch (error) {
        console.error('[floot] Anthropic streaming error:', error);
        return rethrowAnthropic(error);
      }
    },
  };
};
harden(makeStreamingAnthropicProvider);
