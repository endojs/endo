// @ts-check
/// <reference types="ses"/>

/** @import { Message, Model } from '@earendil-works/pi-ai' */
/** @import { Agent, AgentMessage, AgentTool, StreamFn } from '@earendil-works/pi-agent-core' */
/** @import { Credentials, GetApiKey } from './harness/credentials.js' */
/** @import { ThinkingLevel } from './harness/model.js' */

import { makeApiKeyGetter, makeEnvCredentials } from './harness/credentials.js';
import { resolveModelProfile } from './harness/model.js';
import { makePiAgent } from './harness/pi-agent.js';

/**
 * @typedef {object} AgentDefinition The powerless first stage. Everything
 *   derivable from configuration alone — the resolved model, the system
 *   instructions, and the model-facing tool surface — with no powers in hand.
 * @property {Model<string>} model
 * @property {boolean} localOllama
 * @property {string} instructions
 * @property {AgentTool<any>[]} toolSchemas The model-facing tool surface,
 *   built from powerless placeholders so a definition can advertise its tools
 *   before any power is granted.
 *
 * @typedef {object} AgentMakeOptions The powered second-stage inputs: the live
 *   powers handle plus per-construction wiring that only matters once an agent
 *   is actually built.
 * @property {unknown} [powers]
 * @property {Credentials} [credentials]
 * @property {AgentTool<any>[]} [tools] The powered tool surface (closures bound
 *   to live powers). Falls back to the definition's powerless `toolSchemas`.
 * @property {AgentMessage[]} [messages]
 * @property {StreamFn} [streamFn]
 * @property {(messages: AgentMessage[]) => Message[] | Promise<Message[]>} [convertToLlm]
 * @property {GetApiKey} [getApiKey]
 * @property {ThinkingLevel} [thinkingLevel]
 *
 * @typedef {(options?: AgentMakeOptions) => Agent} AgentMaker A maker function:
 *   the powered second stage. Calling it with a powers handle (and optional
 *   per-construction wiring) builds the live pi-agent-core `Agent`.
 *
 * @typedef {object} AgentConfig
 * @property {Model<string> | string | { provider?: string, model?: string, baseUrl?: string, reasoning?: boolean }} [model]
 *   A concrete pi-ai `Model`, a model-profile config object, or a bare profile
 *   string resolved via the harness (`'sonnet'`, `'anthropic/claude-...'`).
 * @property {string} [instructions] The system prompt.
 * @property {AgentTool<any>[]} [tools] The powerless model-facing tool surface.
 * @property {(definition: AgentDefinition, options: AgentMakeOptions) => { tools?: AgentTool<any>[], getApiKey?: GetApiKey }} [endow]
 *   A hook the maker calls at construction time to derive the powered tool
 *   surface and credential resolver from the live powers. This is the seam
 *   where a powerless definition is endowed with powers without the powerless
 *   stage ever holding a capability.
 */

/**
 * @param {AgentConfig['model']} model
 * @returns {{ model: Model<string>, localOllama: boolean }}
 */
const resolveConfiguredModel = model => {
  // A bare string config is the profile-id / "provider/modelId" form the README
  // documents (`model: 'sonnet'`, `model: 'anthropic/claude-...'`). Route it
  // through the resolver as the profile's `model` field. Passing the string
  // straight to `resolveModelProfile` (as the fallthrough below would) reads its
  // absent `.provider` / `.model` properties as `undefined` and silently falls
  // back to the default local `ollama/qwen3` profile, dropping the caller's
  // model choice.
  if (typeof model === 'string') {
    return resolveModelProfile({ model });
  }
  // NOTE: a concrete pi-ai `Model` is discriminated from a model-profile config
  // by the presence of all three of `api`, `provider`, and `id`. The
  // discriminant key is `id` (a concrete `Model` always carries one); the
  // profile shape declared on `AgentConfig['model']` is
  // `{ provider?, model?, baseUrl?, reasoning? }` and has no `id`, so the
  // discriminant is sound for the declared surface. If a future profile-shape
  // extension adds an `id` key, this duck-type would misread the profile as a
  // concrete Model — switch to an explicit tag at that point rather than
  // widening the key set.
  if (
    model !== undefined &&
    typeof model === 'object' &&
    'api' in model &&
    'provider' in model &&
    'id' in model
  ) {
    return harden({ model, localOllama: false });
  }
  return resolveModelProfile(
    /** @type {{ provider?: string, model?: string }} */ (model || {}),
  );
};

/**
 * Derive a pi-agent-core `getApiKey` hook from a `Credentials` seam. Resolves
 * `<PROVIDER>_API_KEY` through the seam; for a local-Ollama model it falls back
 * to the harmless `'ollama'` sentinel pi-ai's openai-completions adaptor
 * accepts in lieu of a real key (a local-Ollama model masquerades as the
 * `'openai'` provider, so no real `OPENAI_API_KEY` is expected for it).
 *
 * @param {Credentials} credentials
 * @param {boolean} localOllama
 * @returns {GetApiKey}
 */
const deriveCredentialApiKeyGetter = (credentials, localOllama) => {
  const getApiKey = makeApiKeyGetter(credentials);
  if (!localOllama) {
    return getApiKey;
  }
  return provider => getApiKey(provider) ?? 'ollama';
};

/**
 * Define an agent from configuration alone, returning a **maker function**. The
 * definition (resolved model, instructions, powerless tool surface) is captured
 * in the maker's closure and holds no powers; calling the returned maker with a
 * powers handle constructs the live agent. The powerless definition is the
 * closure; the powered stage is calling the returned maker.
 *
 * @param {AgentConfig} [config]
 * @returns {AgentMaker}
 */
export const defineAgent = (config = {}) => {
  const { instructions = '', tools = [], endow } = config;
  // Model resolution self-registers pi-ai's built-in providers on first use
  // (see `resolveModelProfile`/`resolveModel`), so a registry model resolves
  // here without any caller-controlled setup hook.
  const { model, localOllama } = resolveConfiguredModel(config.model);

  /** @type {AgentDefinition} */
  const definition = harden({
    model,
    localOllama,
    instructions,
    toolSchemas: harden([...tools]),
  });

  /** @type {AgentMaker} */
  const maker = (options = {}) => {
    // The endow hook runs on every make, even when `options.tools` is
    // supplied: the hook contributes BOTH a powered tool surface and a
    // `getApiKey` credential resolver, and the latter is wanted regardless of
    // who provides the tools. Tool precedence is then explicit caller tools >
    // endow tools > powerless `toolSchemas`; when the caller passes `tools`,
    // `endowments.tools` is intentionally discarded (the hook was still invoked
    // for its `getApiKey` and for whatever live-power side effect it performs).
    const endowments = endow ? endow(definition, options) : {};
    const builtTools =
      options.tools || endowments.tools || definition.toolSchemas;
    // getApiKey precedence: an explicit caller hook wins, then the endow hook's,
    // then one derived from the supplied (or code-mode default) `credentials`
    // seam. Without this last fallback a caller that wires only `credentials`
    // (the advertised seam) would build an agent with no key resolver, and the
    // default local-Ollama path would throw 'No API key for provider: openai'
    // because pi-ai's openai-completions adaptor rejects a missing key.
    const credentialsGetApiKey = options.credentials
      ? deriveCredentialApiKeyGetter(
          options.credentials,
          definition.localOllama,
        )
      : undefined;
    const getApiKey =
      options.getApiKey || endowments.getApiKey || credentialsGetApiKey;
    return makePiAgent({
      model: definition.model,
      tools: builtTools,
      systemPrompt: definition.instructions,
      messages: options.messages,
      streamFn: options.streamFn,
      convertToLlm: options.convertToLlm,
      getApiKey,
      thinkingLevel: options.thinkingLevel,
    });
  };
  return harden(maker);
};
harden(defineAgent);

export { makeEnvCredentials };
