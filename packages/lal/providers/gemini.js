// @ts-check
/* global Buffer */
/**
 * Gemini OpenAI-compatible provider.
 *
 * Google documents an OpenAI-compatible base URL, but its endpoint and error
 * behavior are inconsistent enough that routing it through the generic OpenAI
 * SDK path leads to opaque 404/no-body failures. This provider issues the HTTP
 * request directly so we can preserve compatibility and surface useful errors.
 */

import https from 'node:https';

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
 * @param {string} baseURL
 * @returns {URL}
 */
const makeChatCompletionsUrl = baseURL => {
  const normalizedBaseURL = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  return new URL('chat/completions', normalizedBaseURL);
};

/**
 * @param {unknown} responseBody
 * @param {number} statusCode
 * @returns {string}
 */
const extractErrorMessage = (responseBody, statusCode) => {
  const body =
    Array.isArray(responseBody) && responseBody.length > 0
      ? responseBody[0]
      : responseBody;
  if (body && typeof body === 'object') {
    const error =
      /** @type {{ error?: { message?: string, status?: string } }} */ (body)
        .error;
    if (error?.message) {
      return error.status
        ? `${error.message} (${error.status})`
        : error.message;
    }
  }
  return `Gemini API request failed with status ${statusCode}`;
};

/**
 * @param {URL} url
 * @param {string} apiKey
 * @param {object} payload
 * @returns {Promise<any>}
 */
const postJson = (url, apiKey, payload) =>
  new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Length': String(Buffer.byteLength(body)),
          'Content-Type': 'application/json',
          Host: url.host,
        },
      },
      response => {
        const chunks = [];
        response.setEncoding('utf8');
        response.on('data', chunk => {
          chunks.push(chunk);
        });
        response.on('end', () => {
          const text = chunks.join('');
          const parsed = text === '' ? undefined : JSON.parse(text);
          const statusCode = response.statusCode || 500;
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(extractErrorMessage(parsed, statusCode)));
            return;
          }
          resolve(parsed);
        });
      },
    );
    request.on('error', reject);
    request.write(body);
    request.end();
  });

/**
 * Create a Gemini-backed chat provider via the Google OpenAI-compatible API.
 *
 * @param {{ baseURL: string, model: string, apiKey: string, maxTokens?: number, maxMessages?: number }} options
 * @returns {{ chat: (messages: CommonChatMessage[], tools: CommonTool[]) => Promise<{ message: CommonChatMessage }> }}
 */
export const makeGeminiProvider = ({
  baseURL,
  model,
  apiKey,
  maxTokens = 4096,
  maxMessages = undefined,
}) => {
  const url = makeChatCompletionsUrl(baseURL);

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
      console.log(
        `[LAL] Calling Gemini at ${url.origin}${url.pathname} with model: ${model}`,
      );
      let response;
      try {
        response = await postJson(url, apiKey, {
          model,
          max_tokens: maxTokens,
          tools,
          messages: sendMessages,
        });
      } catch (error) {
        console.error('[LAL] Gemini API error:', error);
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
      if (
        choice.message?.tool_calls &&
        /** @type {unknown[]} */ (choice.message.tool_calls).length > 0
      ) {
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
