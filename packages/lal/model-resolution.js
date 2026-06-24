// @ts-check
/**
 * Model + provider resolution for the Lal agent.
 *
 * pi-ai expects a single "provider/modelId" string and reads provider API
 * keys from `process.env.<PROVIDER>_API_KEY`. lal's historical configuration
 * passes LAL_HOST + LAL_MODEL + LAL_AUTH_TOKEN.
 *
 * `resolveModelString` (the legacy LAL_* → "provider/modelId" translation) and
 * `resolveModel` (the "provider/modelId" → pi-ai Model resolver, including the
 * Ollama special case) now live in `@endo/agentry/harness`; lal re-exports them
 * so the harness owns the extracted primitives. The two helpers defined locally
 * (`setProviderApiKey` / `getOllamaApiKey`) stay here because they touch the
 * ambient provider-key environment, which the harness's read-only credential
 * seam does not model — but they now read through `getAmbientEnv`.
 *
 * `spawnWorkerLoop` in `agent.js` is the sole consumer.
 */

import {
  getAmbientEnv,
  resolveModelString,
  resolveModel,
} from '@endo/agentry/harness';

export { resolveModelString, resolveModel };

/**
 * Install the caller-supplied API key into the appropriate environment
 * variable so pi-ai's provider adaptor finds it. We avoid clobbering an
 * already-set variable; this is best-effort and explicitly per-worker.
 *
 * @param {string} modelString - "provider/modelId"
 * @param {string} authToken
 */
export function setProviderApiKey(modelString, authToken) {
  const env = getAmbientEnv();
  const [provider] = modelString.split('/');
  const keyName = `${provider.toUpperCase()}_API_KEY`;
  if (!env[keyName] || env[keyName] === 'ollama') {
    env[keyName] = authToken;
  }
}
harden(setProviderApiKey);

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
  return getAmbientEnv().OLLAMA_API_KEY || 'ollama';
}
harden(getOllamaApiKey);
