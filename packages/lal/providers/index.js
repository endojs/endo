// @ts-check
/**
 * LLM providers for the Lal agent.
 * Use createProvider(env) to get a provider for the current configuration.
 */

import { makeAnthropicProvider } from './anthropic.js';
import { makeLlamaCppProvider } from './llamacpp.js';
import { makeOllamaProvider } from './ollama.js';

/**
 * @typedef {object} Provider
 * @property {(messages: object[], tools: object[]) => Promise<{ message: object }>} chat
 */

/**
 * Create the appropriate chat provider from environment.
 *
 * Provider selection based on LAL_HOST:
 * - Contains 'anthropic.com' -> Anthropic provider
 * - Contains '/v1' suffix -> llama.cpp (OpenAI-compatible) provider
 * - Otherwise (e.g., 'http://localhost:11434') -> Native Ollama provider
 *
 * Environment variables:
 * - LAL_HOST: Base URL for the LLM service (default: http://localhost:11434)
 * - LAL_MODEL: Model name (defaults vary by provider)
 * - LAL_AUTH_TOKEN: API key for authentication
 * - LAL_MAX_TOKENS: Max tokens for completion (llama.cpp only)
 * - LAL_MAX_MESSAGES: Truncate to last N messages (llama.cpp only)
 *
 * @param {{ LAL_HOST?: string, LAL_MODEL?: string, LAL_AUTH_TOKEN?: string, LAL_MAX_TOKENS?: string, LAL_MAX_MESSAGES?: string }} env
 * @returns {Provider}
 */
export const createProvider = env => {
  const baseURL = env.LAL_HOST || 'http://localhost:11434';
  const isAnthropic = baseURL.includes('anthropic.com');
  const isOpenAICompatible = baseURL.includes('/v1');
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

  if (isOpenAICompatible) {
    // Use llama.cpp (OpenAI-compatible) provider when URL contains /v1
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
  }

  // Default: Use native Ollama provider
  const apiKey = env.LAL_AUTH_TOKEN;
  console.log(
    `[LAL] Using native Ollama provider at ${baseURL} with model: ${model}`,
  );
  return makeOllamaProvider({
    host: baseURL,
    model,
    apiKey,
  });
};

export { makeAnthropicProvider } from './anthropic.js';
export { makeLlamaCppProvider } from './llamacpp.js';
export { makeOllamaProvider } from './ollama.js';
