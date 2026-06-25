// @ts-check
/// <reference types="ses"/>

/** @import { Model } from '@earendil-works/pi-ai' */
/** @import { Credentials } from './credentials.js' */

import { getModel, registerBuiltInApiProviders } from '@earendil-works/pi-ai';

import { getAmbientEnv, makeEnvCredentials } from './credentials.js';

// Provider registration is NOT an import side effect: importing
// `@endo/agentry/harness` does not mutate pi-ai's global registry. Instead,
// the harness self-registers lazily on first model resolution. A module-level
// one-shot guard runs `registerBuiltInApiProviders` (idempotent in pi-ai) the
// first time either `resolveModelProfile` or `resolveModel` reaches pi-ai's
// `getModel`, so a registry model resolves without any caller-side setup hook
// while the import itself stays pure. The `let` is module-private (never
// exported), so the mutable flag is safe under SES.
let providersRegistered = false;
const ensureBuiltInApiProvidersRegistered = () => {
  if (!providersRegistered) {
    registerBuiltInApiProviders();
    providersRegistered = true;
  }
};

const DEFAULT_HOST = 'http://localhost:11434';
const DEFAULT_LOCAL_MODEL = 'qwen3';

/**
 * @param {string} value
 * @returns {string}
 */
const trimTrailingSlashes = value => value.replace(/\/+$/, '');

/**
 * @param {string} baseUrl
 * @returns {string}
 */
const normalizeOpenAIBaseUrl = baseUrl => {
  const trimmed = trimTrailingSlashes(baseUrl);
  return trimmed.match(/\/v1(?:\/.*)?$/) ? trimmed : `${trimmed}/v1`;
};

/**
 * @typedef {object} ModelCost The per-token budget pi-ai bills an
 *   accounting surface against. All four fields default to zero for an
 *   OpenAI-compatible / ollama endpoint, which has no known cost table.
 * @property {number} input
 * @property {number} output
 * @property {number} cacheRead
 * @property {number} cacheWrite
 *
 * @typedef {object} ModelBudget The caller-configurable budget fields a built
 *   OpenAI-compatible / ollama `Model` carries. Each is optional; an omitted
 *   field falls back to the conservative default below.
 * @property {ModelCost} [cost]
 * @property {number} [contextWindow]
 * @property {number} [maxTokens]
 *
 * @typedef {object} ModelProfileConfig
 * @property {string} [provider]
 * @property {string} [model]
 * @property {string} [baseUrl]
 * @property {'openai-completions' | string} [api]
 * @property {boolean} [reasoning]
 * @property {ModelCost} [cost]
 * @property {number} [contextWindow]
 * @property {number} [maxTokens]
 */

/**
 * The reasoning-effort budget a caller can request of a thinking-capable model.
 * Universal across providers: pi-agent-core maps the level onto each provider's
 * own reasoning control. `'off'` disables thinking; the remaining levels scale
 * effort from `'minimal'` to `'xhigh'`. The harness default is
 * `reasoning ? 'medium' : 'off'` (see {@link makePiAgent}).
 *
 * @typedef {'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'} ThinkingLevel
 */

/**
 * Conservative defaults for the budget fields of a built OpenAI-compatible /
 * ollama `Model`. pi-ai does not budget these endpoints against a known cost
 * table, so zero cost is the safe default; the context/token sizes match a
 * common small local model. Callers override any field through the model
 * profile (see {@link ModelBudget}).
 *
 * @type {ModelCost}
 */
const DEFAULT_MODEL_COST = harden({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
});
const DEFAULT_CONTEXT_WINDOW = 32_768;
const DEFAULT_MAX_TOKENS = 8192;

/**
 * @param {string} id
 * @param {string} baseUrl
 * @param {string} provider
 * @param {string} namePrefix
 * @param {string} api
 * @param {boolean | undefined} reasoning
 * @param {ModelBudget} [budget]
 * @returns {Model<string>}
 */
const buildOpenAICompatibleModel = (
  id,
  baseUrl,
  provider,
  namePrefix,
  api,
  reasoning,
  budget = {},
) =>
  harden({
    id,
    name: `${namePrefix}/${id}`,
    api,
    provider,
    baseUrl,
    reasoning: reasoning === true,
    input: ['text'],
    cost: budget.cost ?? DEFAULT_MODEL_COST,
    contextWindow: budget.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: budget.maxTokens ?? DEFAULT_MAX_TOKENS,
  });

/**
 * Resolve a config-object model profile into a concrete pi-ai `Model`. Known
 * registry providers go through `getModel(provider, id)`; ollama and bare
 * OpenAI-compatible endpoints are built as a local OpenAI-completions `Model`.
 *
 * @param {ModelProfileConfig} modelConfig
 * @returns {{ model: Model<string>, localOllama: boolean }}
 */
export const resolveModelProfile = (modelConfig = {}) => {
  // Self-register pi-ai's built-in providers on first use so a registry model
  // resolves without a caller-side setup hook; idempotent across calls.
  ensureBuiltInApiProvidersRegistered();
  const api = modelConfig.api || 'openai-completions';
  const modelName = modelConfig.model || DEFAULT_LOCAL_MODEL;
  const parsed =
    modelConfig.provider === undefined && modelName.includes('/')
      ? {
          provider: modelName.slice(0, modelName.indexOf('/')),
          model: modelName.slice(modelName.indexOf('/') + 1),
        }
      : undefined;
  const provider = modelConfig.provider || parsed?.provider;
  const id = parsed?.model || modelName;
  const baseUrl = modelConfig.baseUrl;

  if (
    provider !== undefined &&
    provider !== 'ollama' &&
    provider !== 'openai-compatible' &&
    baseUrl === undefined
  ) {
    // @ts-expect-error - permissive runtime lookup against KnownProvider overloads
    const registryModel = getModel(provider, id);
    if (registryModel === undefined) {
      throw new Error(`Unknown pi-ai model: ${provider}/${id}`);
    }
    return harden({ model: registryModel, localOllama: false });
  }

  const localOllama =
    provider === 'ollama' ||
    (provider === undefined &&
      (baseUrl === undefined || baseUrl.includes('localhost:11434')));
  const endpoint = localOllama
    ? normalizeOpenAIBaseUrl(baseUrl || DEFAULT_HOST)
    : normalizeOpenAIBaseUrl(
        baseUrl ||
          (() => {
            throw new Error(
              'code-mode openai-compatible model config requires baseUrl',
            );
          })(),
      );

  return harden({
    model: buildOpenAICompatibleModel(
      id,
      endpoint,
      'openai',
      localOllama ? 'ollama' : 'openai-compatible',
      api,
      modelConfig.reasoning,
      {
        cost: modelConfig.cost,
        contextWindow: modelConfig.contextWindow,
        maxTokens: modelConfig.maxTokens,
      },
    ),
    localOllama,
  });
};
harden(resolveModelProfile);

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
 * @deprecated A LAL_* back-compat shim. pi-ai itself takes a
 *   "provider/modelId" string directly and reads `<PROVIDER>_API_KEY` from the
 *   environment (it handles local / ollama models too), so this translation
 *   exists only for lal's legacy LAL_HOST + LAL_MODEL env-var configuration.
 *   Its sole consumer is `packages/lal/agent.js`. Remove it once lal configures
 *   pi-ai via a "provider/modelId" string directly; the harness export is kept
 *   only while lal still depends on it.
 * @param {{ LAL_HOST?: string, LAL_MODEL?: string }} env
 * @returns {string}
 */
export const resolveModelString = env => {
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
};
harden(resolveModelString);

/**
 * Build a pi-ai Model object for a local Ollama instance. Ollama exposes an
 * OpenAI-compatible /v1/chat/completions endpoint, so we masquerade as the
 * "openai" provider with a custom baseUrl.
 *
 * @param {string} id - The ollama model name (e.g. "qwen3")
 * @param {Credentials} [credentials]
 * @param {ModelBudget} [budget] - Caller overrides for the cost / context /
 *   token budget; each field falls back to the conservative default.
 * @returns {Promise<Model<'openai-completions'>>}
 */
export const buildOllamaModel = async (
  id,
  credentials = makeEnvCredentials(getAmbientEnv()),
  budget = {},
) => {
  await Promise.resolve();
  const ollamaHost = credentials.get('OLLAMA_HOST') || 'http://127.0.0.1:11434';
  return harden({
    id,
    name: `ollama/${id}`,
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: `${ollamaHost}/v1`,
    reasoning: false,
    input: ['text'],
    cost: budget.cost ?? DEFAULT_MODEL_COST,
    contextWindow: budget.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: budget.maxTokens ?? DEFAULT_MAX_TOKENS,
  });
};
harden(buildOllamaModel);

/**
 * Resolve a "provider/modelId" string into a pi-ai Model object. Known
 * providers go through `getModel(provider, modelId)`; the `ollama/` prefix is
 * treated specially (Ollama is not in pi-ai's built-in registry and exposes an
 * OpenAI-compatible /v1 endpoint).
 *
 * @param {string} modelString
 * @param {Credentials} [credentials]
 * @returns {Promise<Model<string>>}
 */
export const resolveModel = async (modelString, credentials) => {
  // Self-register pi-ai's built-in providers on first use so a registry model
  // resolves without a caller-side setup hook; idempotent across calls.
  ensureBuiltInApiProvidersRegistered();
  const parts = modelString.split('/');
  const provider = parts[0];
  const modelId = parts.slice(1).join('/');
  if (provider === 'ollama') {
    return buildOllamaModel(modelId, credentials);
  }
  // pi-ai's KnownProvider overloads of getModel typically resolve the modelId
  // to `never` for the generic call site; we want the runtime registry lookup
  // here, which works for any string the caller passed.
  // @ts-expect-error - permissive runtime lookup against KnownProvider overloads
  return getModel(provider, modelId);
};
harden(resolveModel);

/**
 * @typedef {object} ModelProfileDefinition
 * @property {string} id A short profile name (e.g. 'sonnet') callers resolve by.
 * @property {string} provider The pi-ai provider (e.g. 'anthropic', 'ollama').
 * @property {string} model The provider's model id.
 * @property {string} [baseUrl]
 * @property {boolean} [reasoning]
 * @property {ModelCost} [cost] Override the per-token budget for a built
 *   OpenAI-compatible / ollama model (ignored for a registry-resolved model,
 *   which carries pi-ai's own cost table).
 * @property {number} [contextWindow] Override the context window for a built
 *   OpenAI-compatible / ollama model.
 * @property {number} [maxTokens] Override the max output tokens for a built
 *   OpenAI-compatible / ollama model.
 * @property {string | ((credentials: Credentials) => string | undefined)} [credential]
 *   The secret this profile pairs with the model: a key-name resolved through
 *   the credential seam, or a callback given the seam. Ollama profiles need
 *   none.
 *
 * @typedef {object} ResolvedModelProfile
 * @property {Model<string>} model
 * @property {(credentials: Credentials) => string | undefined} resolveCredential
 *   Resolve this profile's credential against a (possibly swapped) seam.
 */

/**
 * Build a registry of provider/model profiles, each pairing a concrete pi-ai
 * `Model` with the credential it needs. Callers resolve a profile by its short
 * `id` (e.g. `defineAgent({ model: 'sonnet' })`) and bind the credential
 * through the seam at construction time, so no secret is captured at definition
 * time.
 *
 * @param {ModelProfileDefinition[]} definitions
 * @returns {Map<string, ResolvedModelProfile>}
 */
export const defineModels = definitions => {
  /** @type {Map<string, ResolvedModelProfile>} */
  const registry = new Map();
  for (const definition of definitions) {
    const {
      id,
      provider,
      model,
      baseUrl,
      reasoning,
      cost,
      contextWindow,
      maxTokens,
      credential,
    } = definition;
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('model profile requires a non-empty id');
    }
    const { model: resolvedModel } = resolveModelProfile({
      provider,
      model,
      baseUrl,
      reasoning,
      cost,
      contextWindow,
      maxTokens,
    });
    /** @type {(credentials: Credentials) => string | undefined} */
    const resolveCredential = credentials => {
      if (credential === undefined) {
        return undefined;
      }
      if (typeof credential === 'function') {
        return credential(credentials);
      }
      return credentials.get(credential);
    };
    registry.set(id, harden({ model: resolvedModel, resolveCredential }));
  }
  return registry;
};
harden(defineModels);
