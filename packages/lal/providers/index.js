// @ts-check
/**
 * LLM providers for the Lal agent.
 * Use createProvider(env) to get a provider for the current configuration.
 */

import { makeAnthropicProvider } from './anthropic.js';
import { makeLlamaCppProvider } from './llamacpp.js';

/**
 * @typedef {object} Provider
 * @property {(messages: object[], tools: object[]) => Promise<{ message: object }>} chat
 */

/**
 * Create the appropriate chat provider from environment.
 * - If LAL_HOST contains 'anthropic.com', returns an Anthropic provider.
 * - Otherwise returns a llama.cpp (OpenAI-compatible) provider.
 *
 * @param {{ LAL_HOST?: string, LAL_MODEL?: string, LAL_AUTH_TOKEN?: string, LAL_MAX_TOKENS?: string, LAL_MAX_MESSAGES?: string }} env
 * @returns {Provider}
 */
export const createProvider = env => {
  const baseURL = env.LAL_HOST || 'http://localhost:11434/v1';
  const isAnthropic = baseURL.includes('anthropic.com');
  const defaultModel = isAnthropic ? 'claude-opus-4-5-20251101' : 'qwen3';
  const model = env.LAL_MODEL || defaultModel;

  if (isAnthropic) {
    const apiKey = env.LAL_AUTH_TOKEN;
    if (!apiKey || apiKey === '') {
      throw new Error(
        'LAL_AUTH_TOKEN is required for Anthropic. Set it to your API key.',
      );
    }
    console.log(`[LAL] Using Anthropic provider with model: ${model}`);
    return makeAnthropicProvider({ apiKey, model });
  }

  const apiKey = env.LAL_AUTH_TOKEN || 'ollama';

  const maxTokens = env.LAL_MAX_TOKENS
    ? parseInt(env.LAL_MAX_TOKENS, 10)
    : 4096;
  const maxMessages = env.LAL_MAX_MESSAGES
    ? parseInt(env.LAL_MAX_MESSAGES, 10)
    : undefined;
  console.log(
    `[LAL] Using llama.cpp provider at ${baseURL} with model: ${model}`,
  );
  return makeLlamaCppProvider({
    baseURL,
    model,
    apiKey,
    maxTokens,
    maxMessages,
  });
};

export { makeAnthropicProvider } from './anthropic.js';
export { makeLlamaCppProvider } from './llamacpp.js';
