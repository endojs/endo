// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';
import { getModel } from '@earendil-works/pi-ai/compat';

import {
  resolveModelProfile,
  resolveModelString,
  buildOllamaModel,
  resolveModel,
  defineModels,
} from '../src/harness/model.js';

// Registry-provider resolution is not an import side effect of
// `@endo/agentry/harness`: the harness self-registers pi-ai's built-in
// providers lazily, on the first `resolveModelProfile`/`resolveModel` call that
// reaches a registry lookup. The registry-resolution tests below therefore
// resolve a known provider WITHOUT any caller-side registration call, proving
// the lazy self-registration is wired correctly.

const KNOWN_PROVIDER = 'anthropic';
const KNOWN_MODEL = 'claude-opus-4-5-20251101';

test('resolveModelProfile resolves a registry provider through getModel', t => {
  const { model, localOllama } = resolveModelProfile({
    provider: KNOWN_PROVIDER,
    model: KNOWN_MODEL,
  });
  t.is(localOllama, false);
  // The registry path returns the very object getModel hands back.
  t.is(model, getModel(KNOWN_PROVIDER, KNOWN_MODEL));
});

test('resolveModelProfile throws on an unknown registry model', t => {
  t.throws(
    () =>
      resolveModelProfile({
        provider: KNOWN_PROVIDER,
        model: 'definitely-not-a-real-model-xyz',
      }),
    {
      message:
        /Unknown pi-ai model: anthropic\/definitely-not-a-real-model-xyz/,
    },
  );
});

test('resolveModelProfile builds a local ollama OpenAI-compatible model', t => {
  const { model, localOllama } = resolveModelProfile({
    provider: 'ollama',
    model: 'qwen3',
  });
  t.is(localOllama, true);
  t.is(model.name, 'ollama/qwen3');
  t.is(model.provider, 'openai');
  t.is(model.api, 'openai-completions');
  t.is(model.baseUrl, 'http://localhost:11434/v1');
  t.is(model.reasoning, false);
});

test('resolveModelProfile builds a bare openai-compatible model and normalizes baseUrl', t => {
  const { model, localOllama } = resolveModelProfile({
    provider: 'openai-compatible',
    baseUrl: 'http://host:1234',
    model: 'mymodel',
  });
  t.is(localOllama, false);
  t.is(model.name, 'openai-compatible/mymodel');
  t.is(model.provider, 'openai');
  // A bare host gains the /v1 suffix.
  t.is(model.baseUrl, 'http://host:1234/v1');
});

test('resolveModelProfile leaves an existing /v1 baseUrl untouched (idempotent)', t => {
  const { model } = resolveModelProfile({
    provider: 'openai-compatible',
    baseUrl: 'http://host/v1/',
    model: 'm',
  });
  t.is(model.baseUrl, 'http://host/v1');
});

test('resolveModelProfile carries reasoning through to the built model', t => {
  const { model } = resolveModelProfile({
    provider: 'ollama',
    model: 'qwen3',
    reasoning: true,
  });
  t.is(model.reasoning, true);
});

test('resolveModelProfile threads caller budget overrides into the built model', t => {
  const cost = { input: 3, output: 7, cacheRead: 1, cacheWrite: 2 };
  const { model } = resolveModelProfile({
    provider: 'ollama',
    model: 'qwen3',
    cost,
    contextWindow: 200_000,
    maxTokens: 16_384,
  });
  // The override reaches the built pi-ai Model, not the conservative defaults.
  t.deepEqual(model.cost, cost);
  t.is(model.contextWindow, 200_000);
  t.is(model.maxTokens, 16_384);
});

test('resolveModelProfile falls back to the conservative budget defaults', t => {
  const { model } = resolveModelProfile({ provider: 'ollama', model: 'qwen3' });
  // Omitting the overrides yields the documented defaults.
  t.deepEqual(model.cost, {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  });
  t.is(model.contextWindow, 32_768);
  t.is(model.maxTokens, 8192);
});

test('buildOllamaModel threads a caller budget override and falls back to defaults', async t => {
  const cost = { input: 5, output: 11, cacheRead: 0, cacheWrite: 0 };
  const overridden = await buildOllamaModel(
    'qwen3',
    { get: () => undefined },
    { cost, contextWindow: 128_000, maxTokens: 4096 },
  );
  t.deepEqual(overridden.cost, cost);
  t.is(overridden.contextWindow, 128_000);
  t.is(overridden.maxTokens, 4096);

  const defaulted = await buildOllamaModel('qwen3', { get: () => undefined });
  t.deepEqual(defaulted.cost, {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  });
  t.is(defaulted.contextWindow, 32_768);
  t.is(defaulted.maxTokens, 8192);
});

test('defineModels threads a profile budget override into the built model', t => {
  const cost = { input: 9, output: 13, cacheRead: 4, cacheWrite: 6 };
  const registry = defineModels([
    {
      id: 'budgeted',
      provider: 'ollama',
      model: 'qwen3',
      cost,
      contextWindow: 64_000,
      maxTokens: 2048,
    },
    { id: 'defaulted', provider: 'ollama', model: 'qwen3' },
  ]);
  const budgeted = registry.get('budgeted')?.model;
  t.deepEqual(budgeted?.cost, cost);
  t.is(budgeted?.contextWindow, 64_000);
  t.is(budgeted?.maxTokens, 2048);

  const defaulted = registry.get('defaulted')?.model;
  t.deepEqual(defaulted?.cost, {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  });
  t.is(defaulted?.contextWindow, 32_768);
  t.is(defaulted?.maxTokens, 8192);
});

test('resolveModelProfile splits a bare "provider/model" string when no provider field', t => {
  const { model, localOllama } = resolveModelProfile({ model: 'ollama/qwen3' });
  t.is(localOllama, true);
  t.is(model.name, 'ollama/qwen3');
});

test('resolveModelProfile defaults to a local ollama profile with no config', t => {
  const { model, localOllama } = resolveModelProfile();
  t.is(localOllama, true);
  t.is(model.name, 'ollama/qwen3');
});

test('resolveModelProfile requires a baseUrl for a non-local openai-compatible config', t => {
  t.throws(
    () => resolveModelProfile({ provider: 'openai-compatible', model: 'm' }),
    { message: /openai-compatible model config requires baseUrl/ },
  );
});

test('resolveModelString maps known LAL_HOST patterns to provider/model strings', t => {
  t.is(
    resolveModelString({ LAL_HOST: 'https://api.anthropic.com' }),
    'anthropic/claude-opus-4-5-20251101',
  );
  t.is(
    resolveModelString({
      LAL_HOST: 'https://generativelanguage.googleapis.com',
    }),
    'google/gemini-2.0-flash',
  );
  t.is(
    resolveModelString({ LAL_HOST: 'https://my-gemini-proxy.example' }),
    'google/gemini-2.0-flash',
  );
  t.is(
    resolveModelString({ LAL_HOST: 'https://openrouter.ai/api' }),
    'openrouter/openrouter/auto',
  );
  t.is(
    resolveModelString({ LAL_HOST: 'https://api.openai.com' }),
    'openai/gpt-4o-mini',
  );
  t.is(
    resolveModelString({ LAL_HOST: 'http://localhost:11434' }),
    'ollama/qwen3.6',
  );
  t.is(
    resolveModelString({ LAL_HOST: 'http://localhost:8080/v1' }),
    'openai/qwen3',
  );
});

test('resolveModelString defaults host to local ollama and honors LAL_MODEL', t => {
  // No LAL_HOST -> local ollama default.
  t.is(resolveModelString({}), 'ollama/qwen3.6');
  // An unrecognized host falls through to the ollama default.
  t.is(resolveModelString({ LAL_HOST: 'http://weird.host' }), 'ollama/qwen3.6');
  // LAL_MODEL overrides the per-provider default model id.
  t.is(
    resolveModelString({
      LAL_HOST: 'https://api.anthropic.com',
      LAL_MODEL: 'custom',
    }),
    'anthropic/custom',
  );
});

test('buildOllamaModel uses the default host and reads OLLAMA_HOST through the seam', async t => {
  const defaulted = await buildOllamaModel('qwen3', { get: () => undefined });
  t.is(defaulted.name, 'ollama/qwen3');
  t.is(defaulted.provider, 'openai');
  t.is(defaulted.baseUrl, 'http://127.0.0.1:11434/v1');

  const overridden = await buildOllamaModel('qwen3', {
    get: name => (name === 'OLLAMA_HOST' ? 'http://h:9' : undefined),
  });
  t.is(overridden.baseUrl, 'http://h:9/v1');
});

test('resolveModel routes the ollama prefix to a local OpenAI-compatible model', async t => {
  const model = await resolveModel('ollama/qwen3', { get: () => undefined });
  t.is(model.name, 'ollama/qwen3');
  t.is(model.baseUrl, 'http://127.0.0.1:11434/v1');
});

test('resolveModel routes a non-ollama prefix through the registry', async t => {
  const model = await resolveModel(`${KNOWN_PROVIDER}/${KNOWN_MODEL}`);
  t.is(model, getModel(KNOWN_PROVIDER, KNOWN_MODEL));
});

test('defineModels builds a registry resolving credentials three ways', t => {
  const registry = defineModels([
    { id: 'local', provider: 'ollama', model: 'qwen3' },
    { id: 'keyed', provider: 'ollama', model: 'q', credential: 'MY_KEY' },
    {
      id: 'fn',
      provider: 'ollama',
      model: 'q',
      credential: credentials => credentials.get('X'),
    },
  ]);
  t.deepEqual([...registry.keys()], ['local', 'keyed', 'fn']);

  // No credential configured -> always undefined, even with a populated seam.
  t.is(
    registry.get('local')?.resolveCredential({ get: () => 'anything' }),
    undefined,
  );
  // String credential resolves the named key through the seam.
  t.is(
    registry.get('keyed')?.resolveCredential({
      get: name => (name === 'MY_KEY' ? 'sekret' : undefined),
    }),
    'sekret',
  );
  // Callback credential is invoked with the seam.
  t.is(
    registry.get('fn')?.resolveCredential({
      get: name => (name === 'X' ? 'xval' : undefined),
    }),
    'xval',
  );
});

test('defineModels rejects a definition with an empty id', t => {
  t.throws(() => defineModels([{ id: '', provider: 'ollama', model: 'q' }]), {
    message: /model profile requires a non-empty id/,
  });
});
