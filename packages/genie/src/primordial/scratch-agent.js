// @ts-check

/**
 * Scratch piAgent factory — builds a one-shot client that pings a model
 * once and reports either the raw reply text or a classified failure.
 *
 * Used by the `/model test` subcommand of the primordial `/model`
 * builtin (sub-task 95 of `TODO/92_genie_primordial.md`).  The goal is
 * to give operators a quick go / no-go signal after `/model set` before
 * they commit — without wiring the full agent pack, pulling in tools,
 * or leaking credentials into shared `process.env`.
 *
 * Credentials are passed directly to pi-ai via the per-call `apiKey`
 * option; see `packages/genie/node_modules/@mariozechner/pi-ai/dist/providers/openai-completions.js:248`
 * for the upstream plumbing.  The scratch agent never mutates
 * `process.env` — that would leak the draft secret to every co-tenant
 * in the worker.
 */

import { completeSimple, getModel } from '@mariozechner/pi-ai';

import { getProviderSpec } from './providers.js';

/** @import { ProviderCredentialSpec } from './providers.js' */

/**
 * @typedef {object} ScratchDraft
 * @property {string} provider
 * @property {string} modelId
 * @property {Record<string, string>} [credentials]
 * @property {Record<string, string>} [options]
 */

/**
 * @typedef {object} ScratchAgent
 * @property {() => Promise<string>} runPing
 *   - Issues the fixed `"Say \`pong\`."` prompt and resolves with the
 *     assistant's reply text.  Throws on any provider error so the
 *     caller can classify the failure with {@link classifyPingError}.
 */

/** Fixed prompt sent by `/model test`. */
export const SCRATCH_PING_PROMPT = harden('Say `pong`.');

/** Fixed system prompt used by the scratch ping. */
export const SCRATCH_SYSTEM_PROMPT = harden(
  'You are a connectivity probe.  Reply with a single word: pong.',
);

/**
 * Build a pi-ai Model for a local Ollama endpoint.  Mirrors the shape
 * used by `src/agent/index.js:buildOllamaModel`; kept here so the
 * scratch agent stays decoupled from the piAgent construction path.
 *
 * @param {string} modelId
 * @param {Record<string, string>} options
 */
const buildOllamaScratchModel = (modelId, options) => {
  const ollamaHost = options.OLLAMA_HOST || 'http://127.0.0.1:11434';
  return harden({
    id: modelId,
    name: `ollama/${modelId}`,
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: `${ollamaHost}/v1`,
    reasoning: false,
    input: harden(['text']),
    cost: harden({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    }),
    contextWindow: 32768,
    maxTokens: 1024,
  });
};

/**
 * Resolve the pi-ai Model object for the given provider/modelId pair.
 *
 * @param {string} provider
 * @param {string} modelId
 * @param {Record<string, string>} options
 */
const resolveScratchModel = (provider, modelId, options) => {
  if (provider === 'ollama') {
    return buildOllamaScratchModel(modelId, options);
  }
  const model = getModel(provider, modelId);
  if (!model) {
    throw new Error(
      `Unknown model for provider "${provider}": "${modelId}".  ` +
        `Pick a modelId that pi-ai recognises, or use ollama/<name> for a local endpoint.`,
    );
  }
  return model;
};

/**
 * Pick the API key to hand to pi-ai from the draft's credentials.
 * Prefers required keys in declaration order, then alt keys.  Falls
 * back to the literal `'ollama'` placeholder for the local Ollama case
 * (pi-ai's openai-completions provider rejects empty keys even when
 * the upstream does not validate them).
 *
 * @param {ProviderCredentialSpec} spec
 * @param {string} provider
 * @param {Record<string, string>} credentials
 */
const pickApiKey = (spec, provider, credentials) => {
  for (const key of spec.requiredCreds) {
    if (credentials[key]) return credentials[key];
  }
  const alts = spec.altCreds || [];
  for (const key of alts) {
    if (credentials[key]) return credentials[key];
  }
  if (provider === 'ollama') {
    return credentials.OLLAMA_API_KEY || 'ollama';
  }
  return undefined;
};

/**
 * Extract a plain-text reply from a pi-ai assistant message.  Handles
 * both the legacy string form and the structured content-array form.
 *
 * @param {any} message
 */
const extractReplyText = message => {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    const parts = [];
    for (const block of message.content) {
      if (block && block.type === 'text' && typeof block.text === 'string') {
        parts.push(block.text);
      }
    }
    return parts.join('');
  }
  return '';
};

/**
 * Build a scratch piAgent — a one-shot client wired to the draft's
 * provider/modelId/credentials.  Credentials are captured in the
 * closure and handed to pi-ai per call; `process.env` stays untouched.
 *
 * @param {ScratchDraft} draft
 * @returns {ScratchAgent}
 */
export const buildScratchPiAgent = draft => {
  if (!draft || typeof draft !== 'object') {
    throw new Error('buildScratchPiAgent: draft must be an object');
  }
  const { provider, modelId } = draft;
  if (typeof provider !== 'string' || provider.length === 0) {
    throw new Error('buildScratchPiAgent: draft.provider must be a non-empty string');
  }
  if (typeof modelId !== 'string' || modelId.length === 0) {
    throw new Error('buildScratchPiAgent: draft.modelId must be a non-empty string');
  }
  const spec = getProviderSpec(provider);
  if (!spec) {
    throw new Error(`buildScratchPiAgent: unknown provider "${provider}"`);
  }
  const credentials = draft.credentials || {};
  const options = draft.options || {};

  const model = resolveScratchModel(provider, modelId, options);
  const apiKey = pickApiKey(spec, provider, credentials);

  const runPing = async () => {
    const context = {
      systemPrompt: SCRATCH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: SCRATCH_PING_PROMPT }],
      tools: [],
    };
    /** @type {Record<string, unknown>} */
    const callOptions = {};
    if (apiKey !== undefined) callOptions.apiKey = apiKey;
    const result = await completeSimple(
      /** @type {any} */ (model),
      /** @type {any} */ (context),
      /** @type {any} */ (callOptions),
    );
    // `completeSimple` resolves with either a proper assistant message
    // (`stopReason !== 'error'`) or an error-shaped payload produced by
    // the streaming provider.  Re-throw the error case so callers can
    // classify failures uniformly via `classifyPingError`.
    if (result && result.stopReason === 'error') {
      const reason = /** @type {any} */ (result).errorMessage ||
        `Provider ${provider} returned an error without a message`;
      const err = /** @type {Error & { response?: unknown }} */ (
        new Error(reason)
      );
      err.response = result;
      throw err;
    }
    return extractReplyText(result);
  };

  return harden({ runPing });
};
harden(buildScratchPiAgent);

/**
 * Categories reported by `/model test`.  Ordered from "clear operator
 * action" (check your key) through "retry later" (network) to
 * "something else" (catch-all).
 *
 * @typedef {'AUTH' | 'NETWORK' | 'PROVIDER_ERROR' | 'OTHER'} PingFailureKind
 */

/**
 * Classify a thrown error from {@link ScratchAgent#runPing} into one of
 * four operator-visible buckets.  The classifier errs on the side of
 * pushing ambiguous errors to `OTHER` rather than mis-reporting an
 * auth failure as a network blip.
 *
 * @param {unknown} err
 * @returns {{ kind: PingFailureKind, message: string }}
 */
export const classifyPingError = err => {
  const wrapped = /** @type {Error & { code?: string, status?: number, statusCode?: number, response?: any }} */ (
    err || {}
  );
  const message = wrapped && wrapped.message ? wrapped.message : String(err);
  const code = typeof wrapped.code === 'string' ? wrapped.code : '';
  const status =
    typeof wrapped.status === 'number'
      ? wrapped.status
      : typeof wrapped.statusCode === 'number'
        ? wrapped.statusCode
        : undefined;

  // NETWORK — connection-level failures surface as node errno codes
  // from undici / the openai client, or as a generic `fetch failed`
  // message when the underlying AbortError unwraps.
  if (code) {
    if (
      code === 'ECONNREFUSED' ||
      code === 'ECONNRESET' ||
      code === 'ENOTFOUND' ||
      code === 'ETIMEDOUT' ||
      code === 'EAI_AGAIN' ||
      code.startsWith('ECONN')
    ) {
      return harden({ kind: 'NETWORK', message });
    }
    if (code.startsWith('ERR_TLS') || code === 'CERT_HAS_EXPIRED') {
      return harden({ kind: 'NETWORK', message });
    }
  }
  if (/fetch failed|getaddrinfo|ENOTFOUND|ECONNREFUSED|TLS/iu.test(message)) {
    return harden({ kind: 'NETWORK', message });
  }

  // AUTH — 401/403 or provider-specific auth signalling.
  if (status === 401 || status === 403) {
    return harden({ kind: 'AUTH', message });
  }
  if (/invalid[_ ]?api[_ ]?key|unauthori[sz]ed|permission_denied/iu.test(message)) {
    return harden({ kind: 'AUTH', message });
  }
  if (/authentication/iu.test(message) && /key|token/iu.test(message)) {
    return harden({ kind: 'AUTH', message });
  }
  if (/auth_error/iu.test(message) && /api key|token/iu.test(message)) {
    return harden({ kind: 'AUTH', message });
  }
  if (/invalid_request_error/iu.test(message) && /api key/iu.test(message)) {
    return harden({ kind: 'AUTH', message });
  }

  // PROVIDER_ERROR — any other 4xx/5xx or structured provider error.
  if (typeof status === 'number' && status >= 400 && status < 600) {
    return harden({ kind: 'PROVIDER_ERROR', message });
  }
  if (/auth_error|invalid_request_error|rate[_ ]?limit|server_error/iu.test(message)) {
    return harden({ kind: 'PROVIDER_ERROR', message });
  }

  return harden({ kind: 'OTHER', message });
};
harden(classifyPingError);
