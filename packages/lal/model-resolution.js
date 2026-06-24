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
 * so the harness owns the extracted primitives.
 *
 * lal's per-worker API key resolution is now a `getApiKey` callback derived
 * from the harness's `Credentials` seam (`makeWorkerGetApiKey` below) rather
 * than an ambient-env mutation: the worker's LAL_AUTH_TOKEN is handed to pi-ai
 * through the callback, with any pre-existing real `<PROVIDER>_API_KEY` in the
 * environment still taking precedence (matching the prior
 * "don't clobber an already-set key" rule). No module here writes to ambient
 * env any more; the seam is read-only by design.
 *
 * `spawnWorkerLoop` in `agent.js` is the sole consumer.
 */

import {
  getAmbientEnv,
  makeEnvCredentials,
  resolveModelString,
  resolveModel,
} from '@endo/agentry/harness';

/** @import { Credentials, GetApiKey } from '@endo/agentry/harness' */

export { resolveModelString, resolveModel };

/**
 * Build the per-worker `getApiKey` callback for pi-agent-core, resolving keys
 * through the harness `Credentials` seam instead of mutating ambient env.
 *
 * Precedence mirrors the prior `setProviderApiKey` + `getOllamaApiKey`
 * behavior exactly:
 *
 *   - Ollama worker (`isOllama`): a real `OLLAMA_API_KEY` read through the seam
 *     wins, else the per-worker `authToken` (the legacy LAL_AUTH_TOKEN, which
 *     the old `setProviderApiKey` path copied into `OLLAMA_API_KEY` before
 *     `getOllamaApiKey()` read it, so a protected / remote Ollama still
 *     authenticates), else the harmless `'ollama'` sentinel (pi-ai's
 *     openai-completions adaptor rejects a missing key). The sentinel value is
 *     treated as "unset" so the `authToken` overrides it. The ollama-ness is
 *     decided by the resolved model (its `provider` is masqueraded as
 *     `'openai'`, so the `provider` argument pi-agent-core passes cannot be
 *     used to detect it) — hence the flag.
 *   - Any other worker: a pre-existing real `<PROVIDER>_API_KEY` in the
 *     environment wins; otherwise the worker's `authToken` (the legacy
 *     LAL_AUTH_TOKEN) is supplied. The `'ollama'` sentinel value is treated as
 *     "unset" so the auth token overrides it, matching the prior
 *     `!env[KEY] || env[KEY] === 'ollama'` guard.
 *
 * @param {Credentials} credentials The read-only secret seam.
 * @param {string | undefined} authToken The worker's LAL_AUTH_TOKEN, if any.
 * @param {boolean} isOllama Whether the resolved model is a local Ollama model.
 * @returns {GetApiKey}
 */
export function makeWorkerGetApiKey(credentials, authToken, isOllama) {
  return provider => {
    if (isOllama) {
      // A real OLLAMA_API_KEY wins (a remote / protected Ollama the operator
      // configured), else the per-worker authToken (the legacy LAL_AUTH_TOKEN,
      // which the old setProviderApiKey path copied into OLLAMA_API_KEY before
      // getOllamaApiKey() read it), else the harmless 'ollama' sentinel that
      // pi-ai's openai-completions adaptor accepts in lieu of a key. The
      // sentinel value is treated as "unset" so the authToken overrides it.
      const existing = credentials.get('OLLAMA_API_KEY');
      if (existing !== undefined && existing !== 'ollama') {
        return existing;
      }
      return authToken || 'ollama';
    }
    const existing = credentials.get(`${provider.toUpperCase()}_API_KEY`);
    if (existing !== undefined && existing !== 'ollama') {
      return existing;
    }
    return authToken;
  };
}
harden(makeWorkerGetApiKey);

/**
 * Build the worker's `Credentials` seam over the ambient process environment.
 * The seam is the one read-only choke point for the worker's secrets; swapping
 * in a capability-scoped provider later is local to this call.
 *
 * @returns {Credentials}
 */
export function makeWorkerCredentials() {
  return makeEnvCredentials(getAmbientEnv());
}
harden(makeWorkerCredentials);
