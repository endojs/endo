// @ts-check
/// <reference types="ses"/>

/** @import { Model } from '@earendil-works/pi-ai' */
/** @import { GetApiKey } from '../harness/credentials.js' */

import { resolveModelProfile } from '../harness/model.js';

/**
 * Build a live eval model from an openai-compatible env-var contract.
 *
 * Reads `ENDO_LLM_HOST` / `ENDO_LLM_MODEL` / `ENDO_LLM_AUTH_TOKEN` (with
 * `LAL_*` aliases) from the environment: a base URL, a model id, and a bearer
 * token. The base URL is expected to point at an endpoint that speaks the
 * OpenAI-completions protocol (an OpenRouter base URL such as
 * `https://openrouter.ai/api/v1` is one such endpoint), so the model is built
 * as an `openai-compatible` profile pointed at that base URL.
 *
 * The full model id (such as `nvidia/nemotron-...:free`) is passed with an
 * explicit `provider` so `resolveModelProfile` does not split the leading
 * `nvidia/` segment off as a pi-ai provider name. The whole string is the
 * endpoint's model id and must reach the request body intact.
 *
 * The returned `getApiKey` ignores its provider argument and returns the single
 * configured token: there is exactly one credential, and the token never
 * appears in code, config, or a committed file. It reaches only the in-process
 * environment.
 *
 * Returns `undefined` when any of host / model / token is absent, so a caller
 * (a test, a runner) can cleanly skip the live path on a host with no
 * credentials rather than constructing a model that would 401.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ model: Model<string>, getApiKey: GetApiKey } | undefined}
 */
export const resolveEvalModelFromEnv = env => {
  const host = env.ENDO_LLM_HOST || env.LAL_HOST;
  const modelId = env.ENDO_LLM_MODEL || env.LAL_MODEL;
  const token = env.ENDO_LLM_AUTH_TOKEN || env.LAL_AUTH_TOKEN;
  if (!host || !modelId || !token) {
    return undefined;
  }
  // A model id advertising itself as a reasoning model gets the harness's
  // default thinking budget (`reasoning ? 'medium' : 'off'`).
  const reasoning = /reasoning|thinking/i.test(modelId);
  const { model } = resolveModelProfile({
    provider: 'openai-compatible',
    baseUrl: host,
    model: modelId,
    api: 'openai-completions',
    reasoning,
  });
  /** @type {GetApiKey} */
  const getApiKey = () => token;
  return harden({ model, getApiKey });
};
harden(resolveEvalModelFromEnv);
