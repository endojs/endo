// @ts-check

/**
 * Provider credential specification table.
 *
 * Hard-coded metadata for every provider the `/model` builtin (sub-task
 * 95 of `TODO/92_genie_primordial.md`) is willing to configure.  The
 * table is the authoritative source of truth for:
 *
 * - which provider names are accepted by `/model set`,
 * - which credential env-var names each provider requires,
 * - which per-provider non-secret options (e.g. `OLLAMA_HOST`) are
 *   recognised, and
 * - human-readable notes shown by `/model list`.
 *
 * Keys are kept in sync with the pi-ai `getEnvApiKey` convention so
 * that committed credentials can be stamped into `process.env` at boot
 * (sub-task 96) and picked up by the streaming providers unchanged.
 * See `packages/genie/node_modules/@mariozechner/pi-ai/dist/env-api-keys.js`
 * for the authoritative pi-ai-side map.
 */

/**
 * @typedef {object} ProviderCredentialSpec
 * @property {string} api
 *   - The pi-ai API surface this provider speaks (e.g.
 *     `'anthropic-messages'`, `'openai-completions'`,
 *     `'google-generative-ai'`).  Used by `scratch-agent.js` to pick
 *     the right registered streaming backend when building the
 *     one-shot ping agent.
 * @property {readonly string[]} requiredCreds
 *   - Env-var names that must be supplied to `/model set` before the
 *     provider can be tested or committed.  For providers with
 *     alternative auth modes (e.g. `anthropic` accepts either
 *     `ANTHROPIC_API_KEY` or `ANTHROPIC_OAUTH_TOKEN`), supplying any
 *     one of the listed keys is sufficient — the validator treats the
 *     list as a disjunction when `altCreds` is non-empty.
 * @property {readonly string[]} [altCreds]
 *   - Optional alternate credential env-var names.  When present, the
 *     validator accepts the presence of at least one key from the
 *     union of `requiredCreds` and `altCreds`.
 * @property {readonly string[]} optionalOptions
 *   - Non-secret env-var names the operator may pass alongside
 *     credentials via `/model set`.  These are stored under
 *     `config.model.options` and exposed by `/model show`.
 * @property {string} notes
 *   - One-line summary rendered by `/model list` so operators can pick
 *     a provider without consulting external documentation.
 */

/**
 * @type {Readonly<Record<string, ProviderCredentialSpec>>}
 */
export const PROVIDER_CREDENTIAL_SPEC = harden({
  ollama: harden({
    api: 'openai-completions',
    requiredCreds: harden([]),
    optionalOptions: harden(['OLLAMA_HOST', 'OLLAMA_API_KEY']),
    notes:
      'Local inference via Ollama\'s OpenAI-compatible endpoint; no credentials required.',
  }),
  anthropic: harden({
    api: 'anthropic-messages',
    requiredCreds: harden(['ANTHROPIC_API_KEY']),
    altCreds: harden(['ANTHROPIC_OAUTH_TOKEN']),
    optionalOptions: harden([]),
    notes: 'Anthropic Claude (API key or OAuth token).',
  }),
  openai: harden({
    api: 'openai-completions',
    requiredCreds: harden(['OPENAI_API_KEY']),
    optionalOptions: harden([]),
    notes: 'OpenAI (GPT family) via completions API.',
  }),
  google: harden({
    api: 'google-generative-ai',
    requiredCreds: harden(['GEMINI_API_KEY']),
    optionalOptions: harden([]),
    notes: 'Google Gemini via the generative-ai endpoint.',
  }),
  groq: harden({
    api: 'openai-completions',
    requiredCreds: harden(['GROQ_API_KEY']),
    optionalOptions: harden([]),
    notes: 'Groq hosted models via OpenAI-compatible API.',
  }),
  xai: harden({
    api: 'openai-completions',
    requiredCreds: harden(['XAI_API_KEY']),
    optionalOptions: harden([]),
    notes: 'xAI Grok via OpenAI-compatible API.',
  }),
  openrouter: harden({
    api: 'openai-completions',
    requiredCreds: harden(['OPENROUTER_API_KEY']),
    optionalOptions: harden([]),
    notes: 'OpenRouter aggregator (multiple upstream models).',
  }),
  mistral: harden({
    api: 'mistral-conversations',
    requiredCreds: harden(['MISTRAL_API_KEY']),
    optionalOptions: harden([]),
    notes: 'Mistral hosted models.',
  }),
  cerebras: harden({
    api: 'openai-completions',
    requiredCreds: harden(['CEREBRAS_API_KEY']),
    optionalOptions: harden([]),
    notes: 'Cerebras fast inference via OpenAI-compatible API.',
  }),
});
harden(PROVIDER_CREDENTIAL_SPEC);

/**
 * Provider names, in the order `/model list` renders them.
 *
 * `Object.keys` is stable for string keys in ES2015+, but exporting
 * the order explicitly makes listing order part of the public contract
 * so tests and docs can rely on it.
 *
 * @type {readonly string[]}
 */
export const PROVIDER_NAMES = harden(Object.keys(PROVIDER_CREDENTIAL_SPEC));
harden(PROVIDER_NAMES);

/**
 * Look up the spec for a provider name, or `undefined` if unknown.
 *
 * @param {string} name
 * @returns {ProviderCredentialSpec | undefined}
 */
export const getProviderSpec = name => {
  if (typeof name !== 'string') return undefined;
  return PROVIDER_CREDENTIAL_SPEC[name];
};
harden(getProviderSpec);

/**
 * Every env-var key a provider recognises: required credentials,
 * alternative credentials (if any), and optional options.
 *
 * Used by `/model set` to reject unknown `KEY=value` pairs so
 * typos surface immediately instead of being silently dropped.
 *
 * @param {ProviderCredentialSpec} spec
 * @returns {readonly string[]}
 */
export const listKnownKeys = spec => {
  const alt = spec.altCreds || harden([]);
  return harden([...spec.requiredCreds, ...alt, ...spec.optionalOptions]);
};
harden(listKnownKeys);
