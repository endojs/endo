// @ts-check
/**
 * Streaming-capable provider selection for the Floot agent.
 *
 * The default is the Anthropic API endpoint: Floot talks to a plain LLM API,
 * configured programmatically from an env-shaped config (API key, model). This
 * keeps the agent a pure chat agent — no local CLI session, no expansion of
 * capabilities beyond conversation. Set FLOOT_PROVIDER (or the legacy LAL_HOST)
 * to opt into the @endo/lal backend for other hosts.
 *
 * Anthropic gets genuine token streaming via the dedicated streaming provider.
 * Every other backend reuses @endo/lal's buffered provider unchanged and is
 * adapted to the streaming contract by emitting the whole reply as a single
 * delta — so Floot works everywhere lal works, and streams for real where the
 * SDK supports it. This keeps lal untouched (we import, never modify).
 */

import { createProvider as createLalProvider } from '@endo/lal/providers/index.js';
import { makeStreamingAnthropicProvider } from './anthropic-streaming.js';

/**
 * @typedef {object} StreamingProvider
 * @property {(messages: object[], tools: object[]) => Promise<{ message: object }>} chat
 * @property {(messages: object[], tools: object[], onToken?: (delta: string) => void) => Promise<{ message: object }>} chatStream
 */

/**
 * Wrap a buffered lal provider so it satisfies the streaming contract.
 *
 * @param {{ chat: (messages: object[], tools: object[]) => Promise<{ message: any }> }} base
 * @returns {StreamingProvider}
 */
const adaptBufferedProvider = base => ({
  chat: base.chat,
  async chatStream(messages, tools, onToken) {
    const result = await base.chat(messages, tools);
    const content = result?.message?.content;
    if (onToken && content) onToken(content);
    return result;
  },
});

/**
 * Create a streaming provider programmatically from an env-shaped config.
 *
 * Selection order:
 *   1. `FLOOT_PROVIDER` if set (`anthropic` | `lal`).
 *   2. legacy `LAL_HOST` detection (anthropic.com → streaming Anthropic, else lal).
 *   3. default → Anthropic API.
 *
 * @param {{
 *   FLOOT_PROVIDER?: string,
 *   FLOOT_MODEL?: string,
 *   FLOOT_AUTH_TOKEN?: string,
 *   FLOOT_MAX_TOKENS?: string,
 *   LAL_HOST?: string,
 *   LAL_MODEL?: string,
 *   LAL_AUTH_TOKEN?: string,
 *   LAL_MAX_TOKENS?: string,
 * }} env
 * @returns {StreamingProvider}
 */
export const createStreamingProvider = env => {
  const kind = env.FLOOT_PROVIDER || (env.LAL_HOST ? 'lal' : 'anthropic');

  if (kind === 'anthropic') {
    const apiKey = env.FLOOT_AUTH_TOKEN || env.LAL_AUTH_TOKEN;
    if (!apiKey) {
      throw new Error(
        'FLOOT_AUTH_TOKEN is required for Anthropic. Set it to your API key.',
      );
    }
    const model = env.FLOOT_MODEL || env.LAL_MODEL || 'claude-sonnet-4-6';
    const maxTokens = env.FLOOT_MAX_TOKENS
      ? parseInt(env.FLOOT_MAX_TOKENS, 10)
      : 4096;
    console.log(`[floot] Streaming Anthropic provider with model: ${model}`);
    return makeStreamingAnthropicProvider({ apiKey, model, maxTokens });
  }

  const baseURL = env.LAL_HOST || 'http://localhost:11434';
  console.log(`[floot] Buffered (non-streaming) provider for host: ${baseURL}`);
  return adaptBufferedProvider(createLalProvider(env));
};
harden(createStreamingProvider);

export { makeStreamingAnthropicProvider } from './anthropic-streaming.js';
