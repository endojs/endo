// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';
import { getModel } from '@earendil-works/pi-ai/compat';

import { defineAgent, makeEnvCredentials } from '../src/define-agent.js';

/** @import { Model } from '@earendil-works/pi-ai' */
/** @import { AgentTool } from '@earendil-works/pi-agent-core' */

/**
 * A minimal, well-typed `AgentTool` stub: enough fields to satisfy the pi-agent
 * tool shape without a real schema or execution. Used to observe which tool
 * surface `defineAgent` installs.
 *
 * @param {string} name
 * @returns {AgentTool<any>}
 */
const fauxTool = name => ({
  name,
  label: name,
  description: name,
  parameters: /** @type {any} */ ({ type: 'object', properties: {} }),
  execute: async () => ({ content: [], details: undefined }),
});

/** @type {Model<string>} */
const concreteModel = harden({
  id: 'x',
  name: 'provider/x',
  api: 'openai-completions',
  provider: 'openai',
  baseUrl: 'http://host/v1',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1,
  maxTokens: 1,
});

test('defineAgent passes a concrete Model object through unchanged', t => {
  const maker = defineAgent({ model: concreteModel });
  const agent = maker();
  t.is(agent.state.model, concreteModel);
});

test('defineAgent resolves a model-profile config through the harness', t => {
  const maker = defineAgent({
    model: { provider: 'ollama', model: 'qwen3' },
    instructions: 'hi',
  });
  const agent = maker();
  t.is(agent.state.model.name, 'ollama/qwen3');
  t.is(agent.state.systemPrompt, 'hi');
});

test('defineAgent defaults the model to a local ollama profile', t => {
  const agent = defineAgent()();
  t.is(agent.state.model.name, 'ollama/qwen3');
  t.is(agent.state.systemPrompt, '');
});

test('defineAgent drives the endow seam to derive powered tools and getApiKey', t => {
  /** @type {Array<{ localOllama: boolean, hasPowers: boolean }>} */
  const seen = [];
  const maker = defineAgent({
    model: { provider: 'ollama', model: 'qwen3' },
    instructions: 'sys',
    tools: [fauxTool('placeholder')],
    endow: (definition, options) => {
      seen.push({
        localOllama: definition.localOllama,
        hasPowers: options.powers !== undefined,
      });
      return {
        tools: [fauxTool('powered')],
        getApiKey: () => 'KEY',
      };
    },
  });
  const agent = maker({ powers: { p: 1 } });
  // The endow-derived tool surface replaces the powerless placeholder.
  t.deepEqual(
    agent.state.tools.map(tool => tool.name),
    ['powered'],
  );
  t.deepEqual(seen, [{ localOllama: true, hasPowers: true }]);
});

test('defineAgent falls back to the powerless tool surface when no powered tools are supplied', t => {
  const maker = defineAgent({
    model: concreteModel,
    tools: [fauxTool('only')],
  });
  const agent = maker();
  t.deepEqual(
    agent.state.tools.map(tool => tool.name),
    ['only'],
  );
});

test('defineAgent resolves a registry-provider model without any caller-side registration', t => {
  // Preserves the intent the prior `onDefine` hook served: a registry model
  // ('anthropic') resolves through defineAgent from configuration alone, with
  // no `registerBuiltInApiProviders` call by the caller. The harness's lazy
  // self-registration (the module-level guard at the top of
  // `resolveModelProfile`/`resolveModel`) is what makes the caller-side hook
  // unnecessary. NOTE: this asserts the wired-correctly end state, not the
  // guard's first-call timing — pi-ai populates its own provider registry as an
  // import side effect, so the registry lookup here would succeed even without
  // the harness guard; the guard's value is for any future pi-ai that defers
  // its own registration, and for keeping the harness import itself pure.
  const maker = defineAgent({
    model: { provider: 'anthropic', model: 'claude-opus-4-5-20251101' },
  });
  const agent = maker();
  // The resolved model is the very object pi-ai's registry hands back, proving
  // the registry lookup succeeded (it would throw 'Unknown pi-ai model' had the
  // provider not been registered).
  t.is(agent.state.model, getModel('anthropic', 'claude-opus-4-5-20251101'));
});

test('defineAgent resolves a "provider/modelId" string config through the harness', t => {
  // Regression: a string config (the README's documented `model: 'anthropic/...'`
  // form) was read as if it were an object — its absent `.provider` / `.model`
  // properties resolved to `undefined` and the agent silently fell back to the
  // default `ollama/qwen3` profile. The string now routes through the resolver.
  const agent = defineAgent({
    model: 'anthropic/claude-opus-4-5-20251101',
  })();
  t.is(agent.state.model, getModel('anthropic', 'claude-opus-4-5-20251101'));
});

test('defineAgent resolves a bare string model config rather than the default profile', t => {
  // The README's other documented string form (`model: 'sonnet'`). Before the
  // fix the bare string also collapsed to the default `ollama/qwen3`; it now
  // names the resolved profile's model id.
  const agent = defineAgent({ model: 'sonnet' })();
  t.is(agent.state.model.name, 'ollama/sonnet');
  t.not(agent.state.model.name, 'ollama/qwen3');
});

test('defineAgent derives getApiKey from supplied credentials for a local-Ollama model', t => {
  // Regression: a caller wiring only the advertised `credentials` seam (no
  // explicit getApiKey, no endow hook) built an agent with no key resolver at
  // all, so the default local-Ollama path threw 'No API key for provider:
  // openai'. The seam now yields a getApiKey; for a local-Ollama model it
  // resolves the harmless 'ollama' sentinel when no real key is present.
  const credentials = makeEnvCredentials({});
  const agent = defineAgent({ model: { provider: 'ollama', model: 'qwen3' } })({
    credentials,
  });
  t.is(typeof agent.getApiKey, 'function');
  // `getApiKey` is optional on the Agent type; the `typeof` assertion above
  // proves it is present, and the optional-chained call keeps the type-check
  // happy without weakening the value assertion (a regressed `undefined`
  // resolver yields `undefined !== 'ollama'` and still fails the test).
  t.is(agent.getApiKey?.('openai'), 'ollama');
});

test('defineAgent-derived getApiKey resolves a real provider key from credentials', t => {
  const credentials = makeEnvCredentials({ ANTHROPIC_API_KEY: 'real-key' });
  const agent = defineAgent({
    model: { provider: 'anthropic', model: 'claude-opus-4-5-20251101' },
  })({ credentials });
  t.is(agent.getApiKey?.('anthropic'), 'real-key');
});

test('defineAgent lets an explicit getApiKey win over the credentials seam', t => {
  const credentials = makeEnvCredentials({ ANTHROPIC_API_KEY: 'seam-key' });
  const agent = defineAgent({
    model: { provider: 'anthropic', model: 'claude-opus-4-5-20251101' },
  })({ credentials, getApiKey: () => 'explicit-key' });
  t.is(agent.getApiKey?.('anthropic'), 'explicit-key');
});
