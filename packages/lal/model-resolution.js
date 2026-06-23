// @ts-check
/**
 * Model + provider resolution for the Lal agent.
 *
 * pi-ai expects a single "provider/modelId" string and reads provider API
 * keys from `process.env.<PROVIDER>_API_KEY`. lal's historical configuration
 * passes LAL_HOST + LAL_MODEL + LAL_AUTH_TOKEN. The helpers below translate
 * the legacy LAL_* variables into the pi-ai shape so existing `.env.example`
 * files continue to work.
 *
 * `spawnWorkerLoop` in `agent.js` is the sole consumer.
 */

import { getModel } from '@earendil-works/pi-ai';

/** @import { Model } from '@earendil-works/pi-ai' */

/**
 * Translate the legacy LAL_HOST + LAL_MODEL pair into a single
 * "provider/modelId" string suitable for pi-ai's getModel(). Recognized
 * LAL_HOST patterns:
 *
 *   contains "anthropic.com"  -> provider "anthropic"
 *   contains "generativelanguage.googleapis.com" or "gemini" -> "google"
 *   contains "openai.com"     -> provider "openai"
 *   contains "openrouter"     -> provider "openrouter"
 *   contains ":11434"         -> provider "ollama"
 *   otherwise (incl. "/v1" llama.cpp servers) -> provider "openai"
 *     (pi-ai's openai-completions adaptor speaks the same protocol)
 *
 * LAL_MODEL is used as the model id; a sensible default is chosen if
 * LAL_MODEL is empty.
 *
 * @param {{ LAL_HOST?: string, LAL_MODEL?: string }} env
 * @returns {string}
 */
export function resolveModelString(env) {
  const host = (env.LAL_HOST || 'http://localhost:11434').toLowerCase();
  let provider = 'ollama';
  // Temporary default until the subagent creation wizard ships and can guide
  // users to select a model explicitly.
  let defaultModel = 'qwen3.6';
  if (host.includes('anthropic.com')) {
    provider = 'anthropic';
    defaultModel = 'claude-opus-4-5-20251101';
  } else if (
    host.includes('generativelanguage.googleapis.com') ||
    host.includes('gemini')
  ) {
    // pi-ai exposes Google's Gemini models under the provider name 'google'.
    provider = 'google';
    defaultModel = 'gemini-2.0-flash';
  } else if (host.includes('openrouter')) {
    provider = 'openrouter';
    defaultModel = 'openrouter/auto';
  } else if (host.includes('openai.com')) {
    provider = 'openai';
    defaultModel = 'gpt-4o-mini';
  } else if (host.includes(':11434')) {
    // Native Ollama port.
    // Temporary default until the subagent creation wizard ships.
    provider = 'ollama';
    defaultModel = 'qwen3.6';
  } else if (host.includes('/v1')) {
    // Any OpenAI-compatible local server (llama.cpp, vLLM, tgi).
    provider = 'openai';
    defaultModel = 'qwen3';
  }
  const modelId = env.LAL_MODEL || defaultModel;
  return `${provider}/${modelId}`;
}
harden(resolveModelString);

/**
 * Install the caller-supplied API key into the appropriate environment
 * variable so pi-ai's provider adaptor finds it. We avoid clobbering an
 * already-set variable; this is best-effort and explicitly per-worker.
 *
 * @param {string} modelString - "provider/modelId"
 * @param {string} authToken
 */
export function setProviderApiKey(modelString, authToken) {
  // eslint-disable-next-line no-undef
  const env = globalThis?.process?.env;
  if (!env) return;
  const [provider] = modelString.split('/');
  const keyName = `${provider.toUpperCase()}_API_KEY`;
  if (!env[keyName] || env[keyName] === 'ollama') {
    env[keyName] = authToken;
  }
}
harden(setProviderApiKey);

/**
 * Resolve a "provider/modelId" string into a pi-ai Model object. Known
 * providers go through `getModel(provider, modelId)`; the `ollama/` prefix
 * is treated specially (Ollama is not in pi-ai's built-in registry and
 * exposes an OpenAI-compatible /v1 endpoint).
 *
 * @param {string} modelString
 * @returns {Promise<Model<'openai-completions'>>}
 */
export async function resolveModel(modelString) {
  const parts = modelString.split('/');
  const provider = parts[0];
  const modelId = parts.slice(1).join('/');
  if (provider === 'ollama') {
    return buildOllamaModel(modelId);
  }
  // pi-ai's KnownProvider overloads of getModel typically resolve the modelId
  // to `never` for the generic call site; we want the runtime registry lookup
  // here, which works for any string the caller passed.
  // @ts-expect-error - permissive runtime lookup against KnownProvider overloads
  return getModel(provider, modelId);
}
harden(resolveModel);

/**
 * Build a pi-ai Model object for a local Ollama instance. Ollama exposes
 * an OpenAI-compatible /v1/chat/completions endpoint, so we masquerade as
 * the "openai" provider with a custom baseUrl.
 *
 * @param {string} id - The ollama model name (e.g. "qwen3")
 * @returns {Promise<Model<'openai-completions'>>}
 */
async function buildOllamaModel(id) {
  await Promise.resolve();
  // eslint-disable-next-line no-undef
  const env = globalThis?.process?.env ?? {};
  const ollamaHost = env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  return harden({
    id,
    name: `ollama/${id}`,
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: `${ollamaHost}/v1`,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32_768,
    maxTokens: 8192,
  });
}

/**
 * API-key resolver for Ollama models. Ollama itself does not require a key,
 * but pi-ai's openai-completions adaptor refuses requests without one.
 * Prefer `OLLAMA_API_KEY` (in case the operator has set one for a remote
 * Ollama), else fall back to a harmless sentinel that the operator's setup
 * commonly uses already.
 *
 * @returns {string}
 */
export function getOllamaApiKey() {
  // eslint-disable-next-line no-undef
  const env = globalThis?.process?.env ?? {};
  return env.OLLAMA_API_KEY || 'ollama';
}
harden(getOllamaApiKey);
