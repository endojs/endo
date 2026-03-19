// @ts-check

/**
 * Unit tests for `makeModelHandler` — the `/model` subcommand family
 * introduced by sub-task 95 of `TODO/92_genie_primordial.md`.
 *
 * These tests drive each subcommand (`list`, `show`, `set`, `test`,
 * `commit`, `clear`, `help`) through a fake `state` + fake `persistence`
 * pair so we can assert on both the emitted reply chunks and the
 * side-effects on `state.draft` / `state.committed` without booting a
 * worker.  The scratch-agent / pi-ai round-trip path is covered
 * indirectly — `/model test` is driven with a stubbed `providerSpec`
 * and against a draft that {@link buildScratchPiAgent} rejects (an
 * unknown provider) so we exercise the failure-classification branch
 * without a real network hop.
 */

import '../setup.js';

import test from 'ava';

import {
  makeModelHandler,
  maskCredential,
} from '../../src/primordial/model-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Drain an `AsyncGenerator<string>` into an array.
 *
 * @template T
 * @param {AsyncGenerator<T>} it
 */
const drain = async it => {
  /** @type {T[]} */
  const out = [];
  for await (const chunk of it) out.push(chunk);
  return out;
};

/**
 * `SpecialsIO` stub that tags every rendered chunk with its level so
 * tests can assert both content and classification without coupling to
 * ANSI / rendering details.
 */
const makeIo = () => {
  /** @type {any} */
  const io = {
    info: msg => `info:${msg}`,
    notice: msg => `notice:${msg}`,
    warn: msg => `warn:${msg}`,
    error: msg => `error:${msg}`,
    success: msg => `success:${msg}`,
    renderEvents: async function* render() {},
  };
  return io;
};

/**
 * Build a blank `PrimordialState` shell.  `mode` defaults to
 * `'primordial'` so `/model commit` drives the "awaiting hand-off"
 * branch (sub-task 97); override via `overrides` when a test needs the
 * piAgent-mode branch.
 *
 * @param {Partial<import('../../src/primordial/index.js').PrimordialState>} [overrides]
 */
const makeState = (overrides = {}) =>
  /** @type {import('../../src/primordial/index.js').PrimordialState} */ ({
    mode: 'primordial',
    activate: async () => {},
    ...overrides,
  });

/**
 * Minimal provider catalog used across tests — keeps the surface small
 * so the handler's provider-agnostic behaviour is obvious from the
 * assertions.  Two providers are enough to exercise the list / active
 * marker branches; one requires credentials and one does not.
 */
const makeProviderSpec = () =>
  /** @type {Readonly<Record<string, import('../../src/primordial/providers.js').ProviderCredentialSpec>>} */ ({
    ollama: {
      api: 'openai-completions',
      requiredCreds: [],
      optionalOptions: ['OLLAMA_HOST', 'OLLAMA_API_KEY'],
      notes: 'Local Ollama.',
    },
    anthropic: {
      api: 'anthropic-messages',
      requiredCreds: ['ANTHROPIC_API_KEY'],
      altCreds: ['ANTHROPIC_OAUTH_TOKEN'],
      optionalOptions: [],
      notes: 'Anthropic Claude.',
    },
  });

/**
 * Build a handler bound to fresh state + io + provider spec.  Callers
 * get back the handler plus the pieces they care about for assertions.
 *
 * @param {object} [options]
 * @param {Partial<import('../../src/primordial/index.js').PrimordialState>} [options.stateOverrides]
 * @param {import('../../src/primordial/model-handler.js').ModelHandlerPersistence} [options.persistence]
 */
const makeHandler = ({ stateOverrides, persistence } = {}) => {
  const state = makeState(stateOverrides);
  const io = makeIo();
  const providerSpec = makeProviderSpec();
  const handler = makeModelHandler({
    workspaceDir: '/tmp/ws',
    state,
    io,
    providerSpec,
    ...(persistence ? { persistence } : {}),
  });
  return { handler, state, io, providerSpec };
};

// ---------------------------------------------------------------------------
// maskCredential
// ---------------------------------------------------------------------------

test('maskCredential — short values collapse to the redacted sentinel', t => {
  t.is(maskCredential(''), '');
  t.is(maskCredential('short'), '…<redacted>');
  t.is(maskCredential('12345678'), '…<redacted>');
});

test('maskCredential — long values keep 6+2 characters', t => {
  t.is(
    maskCredential('sk-ant-api03-ABCDEFGHIJKLMN'),
    'sk-ant…<redacted>MN',
  );
});

// ---------------------------------------------------------------------------
// Constructor validation
// ---------------------------------------------------------------------------

test('makeModelHandler — rejects empty workspaceDir', t => {
  t.throws(
    () =>
      makeModelHandler({
        workspaceDir: /** @type {any} */ (''),
        state: makeState(),
        io: makeIo(),
      }),
    { message: /workspaceDir/u },
  );
});

test('makeModelHandler — rejects missing state', t => {
  t.throws(
    () =>
      makeModelHandler({
        workspaceDir: '/tmp/ws',
        state: /** @type {any} */ (null),
        io: makeIo(),
      }),
    { message: /state/u },
  );
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

test('/model list — yields one line per provider plus a trailing hint', async t => {
  const { handler } = makeHandler();
  const out = await drain(handler(['list']));
  t.is(out[0], 'info:Providers:');
  t.true(
    out.some(line => line === 'info:  ollama — Local Ollama.'),
    'lists ollama',
  );
  t.true(
    out.some(line => line === 'info:  anthropic — Anthropic Claude.'),
    'lists anthropic',
  );
  t.true(
    out.some(line =>
      line.startsWith('info:No active model configured'),
    ),
    'prompts operator to stage a draft when nothing is active',
  );
});

test('/model list — marks the committed provider as [active]', async t => {
  const { handler, state } = makeHandler();
  state.committed = harden({
    provider: 'ollama',
    modelId: 'llama3.2',
    credentials: harden({}),
    options: harden({}),
  });
  const out = await drain(handler(['list']));
  t.true(
    out.some(line => line.includes('ollama [active]')),
    `expected ollama marked active; got ${JSON.stringify(out)}`,
  );
  t.false(
    out.some(line => line.includes('anthropic [active]')),
    'anthropic must not be marked active when ollama is committed',
  );
  t.true(
    out.some(line =>
      line === 'info:Active model: ollama/llama3.2',
    ),
    'final hint reports the active model',
  );
});

// ---------------------------------------------------------------------------
// set
// ---------------------------------------------------------------------------

test('/model set — rejects too-few args with usage hint', async t => {
  const { handler, state } = makeHandler();
  const out = await drain(handler(['set']));
  t.true(out[0].startsWith('error:Usage:'));
  t.is(state.draft, undefined);
});

test('/model set — rejects an unknown provider', async t => {
  const { handler, state } = makeHandler();
  const out = await drain(handler(['set', 'nope', 'some-model']));
  t.true(
    out[0].startsWith('error:Unknown provider "nope"'),
    `expected unknown-provider error; got ${out[0]}`,
  );
  t.is(state.draft, undefined);
});

test('/model set — rejects malformed KEY=value tokens', async t => {
  const { handler, state } = makeHandler();
  const out = await drain(
    handler(['set', 'ollama', 'llama3.2', 'bad-token']),
  );
  t.regex(out[0], /^error:Invalid KEY=value token/u);
  t.is(state.draft, undefined);
});

test('/model set — rejects an unknown KEY for the provider', async t => {
  const { handler, state } = makeHandler();
  const out = await drain(
    handler(['set', 'ollama', 'llama3.2', 'UNKNOWN_KEY=oops']),
  );
  t.regex(out[0], /^error:Unknown key "UNKNOWN_KEY"/u);
  t.is(state.draft, undefined);
});

test('/model set — rejects a provider with missing required credentials', async t => {
  const { handler, state } = makeHandler();
  const out = await drain(handler(['set', 'anthropic', 'claude-sonnet-4']));
  t.regex(out[0], /requires one of.*ANTHROPIC_API_KEY/u);
  t.is(state.draft, undefined);
});

test('/model set — stages a draft, splitting secrets from options', async t => {
  const { handler, state } = makeHandler();
  const out = await drain(
    handler([
      'set',
      'ollama',
      'llama3.2',
      'OLLAMA_HOST=http://localhost:11434',
    ]),
  );
  t.is(out.length, 1);
  t.true(out[0].startsWith('success:✓ Draft staged: ollama/llama3.2'));
  t.truthy(state.draft);
  const draft = /** @type {import('../../src/primordial/index.js').ModelDraft} */ (
    state.draft
  );
  t.is(draft.provider, 'ollama');
  t.is(draft.modelId, 'llama3.2');
  t.deepEqual({ ...(draft.credentials || {}) }, {});
  t.deepEqual(
    { ...(draft.options || {}) },
    { OLLAMA_HOST: 'http://localhost:11434' },
  );
});

test('/model set — stashes credentials for a secret key', async t => {
  const { handler, state } = makeHandler();
  const out = await drain(
    handler([
      'set',
      'anthropic',
      'claude-sonnet-4',
      'ANTHROPIC_API_KEY=sk-ant-TOTALLYFAKE01234567',
    ]),
  );
  t.true(out[0].startsWith('success:'));
  const draft = /** @type {import('../../src/primordial/index.js').ModelDraft} */ (
    state.draft
  );
  t.deepEqual(
    { ...(draft.credentials || {}) },
    { ANTHROPIC_API_KEY: 'sk-ant-TOTALLYFAKE01234567' },
  );
  t.deepEqual({ ...(draft.options || {}) }, {});
});

// ---------------------------------------------------------------------------
// show
// ---------------------------------------------------------------------------

test('/model show — reports "no model configured" when both slots are empty', async t => {
  const { handler } = makeHandler();
  const out = await drain(handler(['show']));
  t.is(out.length, 1);
  t.regex(out[0], /No model configured/u);
});

test('/model show — renders the active + draft blocks with masked secrets', async t => {
  const { handler, state } = makeHandler();
  state.committed = harden({
    provider: 'anthropic',
    modelId: 'claude-sonnet-4',
    credentials: harden({
      ANTHROPIC_API_KEY: 'sk-ant-LIVEKEY0123456789AB',
    }),
    options: harden({}),
  });
  state.draft = harden({
    provider: 'ollama',
    modelId: 'llama3.2',
    credentials: harden({}),
    options: harden({ OLLAMA_HOST: 'http://127.0.0.1:11434' }),
  });
  const out = await drain(handler(['show']));
  const joined = out.join('\n');
  t.regex(joined, /Active model:/u);
  t.regex(joined, /Draft model \(not yet committed\):/u);
  // The live credential must never appear verbatim; only the 6+2 mask
  // is allowed through.
  t.false(
    joined.includes('sk-ant-LIVEKEY0123456789AB'),
    'raw credential must not appear in /model show output',
  );
  t.regex(joined, /sk-ant…<redacted>AB/u);
  // Non-secret options are echoed verbatim.
  t.regex(joined, /OLLAMA_HOST: http:\/\/127\.0\.0\.1:11434/u);
});

// ---------------------------------------------------------------------------
// test
// ---------------------------------------------------------------------------

test('/model test — errors when no draft is staged', async t => {
  const { handler } = makeHandler();
  const out = await drain(handler(['test']));
  t.is(out.length, 1);
  t.regex(out[0], /No draft staged/u);
});

test('/model test — routes scratch-agent construction failures through OTHER', async t => {
  // The handler uses the hard-coded PROVIDER_CREDENTIAL_SPEC when it
  // builds the scratch piAgent (see buildScratchPiAgent in
  // src/primordial/scratch-agent.js), not the injected providerSpec
  // stub.  That means a draft whose provider is only present in the
  // stub — but not in the real catalog — lets us exercise the OTHER
  // branch of /model test without any network I/O.
  const stub = /** @type {Readonly<Record<string, import('../../src/primordial/providers.js').ProviderCredentialSpec>>} */ ({
    madeup: {
      api: 'openai-completions',
      requiredCreds: [],
      optionalOptions: [],
      notes: 'Fabricated provider that is NOT in PROVIDER_CREDENTIAL_SPEC.',
    },
  });
  const state = makeState();
  const io = makeIo();
  const handler = makeModelHandler({
    workspaceDir: '/tmp/ws',
    state,
    io,
    providerSpec: stub,
  });
  // Stage a draft against the fabricated provider.
  await drain(handler(['set', 'madeup', 'stub-model']));
  t.truthy(state.draft);

  const out = await drain(handler(['test']));
  // First chunk is the "Testing …" notice; the failure line follows.
  t.is(out[0].startsWith('notice:Testing madeup/stub-model'), true);
  const failure = out[out.length - 1];
  t.regex(failure, /^error:OTHER:/u);
});

// ---------------------------------------------------------------------------
// commit
// ---------------------------------------------------------------------------

test('/model commit — errors when no draft is staged', async t => {
  const { handler } = makeHandler();
  const out = await drain(handler(['commit']));
  t.is(out.length, 1);
  t.regex(out[0], /No draft staged/u);
});

test('/model commit — yields the sub-task 97 stub when persistence is absent', async t => {
  const { handler, state } = makeHandler();
  await drain(handler(['set', 'ollama', 'llama3.2']));
  const out = await drain(handler(['commit']));
  t.is(out.length, 1);
  t.regex(out[0], /sub-task 97 \+ 96/u);
  // Draft must survive — the stub explicitly preserves it.
  t.truthy(state.draft);
});

test('/model commit — primordial mode invokes activate, flips mode, and emits Ready', async t => {
  /** @type {Array<import('../../src/primordial/index.js').ModelDraft>} */
  const saved = [];
  let activateCalls = 0;
  const persistence = harden({
    saveConfig: async draft => {
      saved.push(draft);
    },
  });
  /** @type {import('../../src/primordial/index.js').PrimordialState} */
  const state = /** @type {any} */ ({
    mode: 'primordial',
  });
  state.activate = async () => {
    activateCalls += 1;
    // Sub-task 97's `activatePiAgent` flips the mode flag in-place to
    // route subsequent prompts through the piAgent branch; emulate
    // that here so the commit handler reaches the "Ready" success
    // chunk.
    state.mode = 'piAgent';
  };
  const io = makeIo();
  const providerSpec = makeProviderSpec();
  const handler = makeModelHandler({
    workspaceDir: '/tmp/ws',
    state,
    io,
    providerSpec,
    persistence,
  });
  await drain(handler(['set', 'ollama', 'llama3.2']));
  const out = await drain(handler(['commit']));

  t.is(saved.length, 1, 'persistence.saveConfig runs exactly once');
  t.is(saved[0].provider, 'ollama');
  t.is(saved[0].modelId, 'llama3.2');
  t.is(activateCalls, 1, 'primordial-mode commit invokes activate()');
  t.regex(out[0], /^success:✓ Configuration saved/u);
  t.true(
    out.some(line => /^notice:Activating piAgent/u.test(line)),
    'primordial-mode commit must tell operator the hand-off is in progress',
  );
  t.true(
    out.some(line => /^success:✓ Ready: model=ollama\/llama3\.2/u.test(line)),
    'primordial-mode commit must emit a Ready chunk after a successful activation',
  );
});

test('/model commit — primordial mode warns when activate did not flip mode', async t => {
  // A misbehaving (or stub) `activate` that returns without flipping
  // `state.mode` to `'piAgent'` lands in the degraded branch.  This
  // is the safety net for misconfigured deployments and unit tests
  // that pass a no-op stub.
  /** @type {Array<import('../../src/primordial/index.js').ModelDraft>} */
  const saved = [];
  let activateCalls = 0;
  const persistence = harden({
    saveConfig: async draft => {
      saved.push(draft);
    },
  });
  const state = makeState({
    activate: async () => {
      activateCalls += 1;
    },
  });
  const io = makeIo();
  const providerSpec = makeProviderSpec();
  const handler = makeModelHandler({
    workspaceDir: '/tmp/ws',
    state,
    io,
    providerSpec,
    persistence,
  });
  await drain(handler(['set', 'ollama', 'llama3.2']));
  const out = await drain(handler(['commit']));
  t.is(activateCalls, 1);
  t.is(saved.length, 1);
  t.true(
    out.some(line =>
      /^warn:Activation completed but did not flip to piAgent mode/u.test(
        line,
      ),
    ),
    'primordial-mode commit must warn when activate leaves mode=primordial',
  );
});

test('/model commit — piAgent mode emits the "restart required" hint and triggers requestRestart', async t => {
  /** @type {Array<import('../../src/primordial/index.js').ModelDraft>} */
  const saved = [];
  let activateCalls = 0;
  let restartCalls = 0;
  const persistence = harden({
    saveConfig: async draft => {
      saved.push(draft);
    },
  });
  const { handler, state } = makeHandler({
    stateOverrides: {
      mode: 'piAgent',
      activate: async () => {
        activateCalls += 1;
      },
      requestRestart: async () => {
        restartCalls += 1;
      },
    },
    persistence,
  });
  await drain(handler(['set', 'ollama', 'llama3.2']));
  const out = await drain(handler(['commit']));
  t.is(saved.length, 1);
  t.is(activateCalls, 0, 'piAgent-mode commit must NOT invoke activate');
  t.is(
    restartCalls,
    1,
    'piAgent-mode commit must invoke requestRestart so the daemon can reincarnate',
  );
  t.regex(out[0], /^success:/u);
  t.true(
    out.some(line => /Restart required/u.test(line)),
    'piAgent-mode commit must tell operator the worker must restart',
  );
  // piAgent-mode commit yields a `Configuration saved` success chunk
  // followed by a `Restart required` info chunk; `requestRestart` is
  // a side-effect, not a chunk.
  t.is(out.length, 2, 'one success + one info chunk in piAgent mode');
  // `state` passed in via `makeHandler` is unused for assertions
  // beyond the side-effects above.
  t.is(state.mode, 'piAgent');
});

test('/model commit — piAgent mode runs even without a requestRestart hook', async t => {
  // A deployment that does not wire `requestRestart` (e.g. dev-repl)
  // must still see the persistence + reply-chunk side-effects without
  // throwing on the missing hook.
  const persistence = harden({
    saveConfig: async () => {},
  });
  const { handler } = makeHandler({
    stateOverrides: { mode: 'piAgent' },
    persistence,
  });
  await drain(handler(['set', 'ollama', 'llama3.2']));
  const out = await drain(handler(['commit']));
  t.is(out.length, 2);
  t.regex(out[0], /^success:/u);
  t.true(out.some(line => /Restart required/u.test(line)));
});

test('/model commit — persistence failure is surfaced as a structured error', async t => {
  const persistence = harden({
    saveConfig: async () => {
      throw new Error('disk full');
    },
  });
  const { handler, state } = makeHandler({ persistence });
  await drain(handler(['set', 'ollama', 'llama3.2']));
  const out = await drain(handler(['commit']));
  t.is(out.length, 1);
  t.regex(out[0], /^error:Failed to persist draft: disk full/u);
  // Draft must survive so the operator can retry.
  t.truthy(state.draft);
});

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

test('/model clear — info when no draft is staged', async t => {
  const { handler } = makeHandler();
  const out = await drain(handler(['clear']));
  t.deepEqual(out, ['info:No draft to clear.']);
});

test('/model clear — drops the staged draft', async t => {
  const { handler, state } = makeHandler();
  await drain(handler(['set', 'ollama', 'llama3.2']));
  t.truthy(state.draft);
  const out = await drain(handler(['clear']));
  t.deepEqual(out, ['info:Draft cleared.']);
  t.is(state.draft, undefined);
});

// ---------------------------------------------------------------------------
// help / unknown / empty
// ---------------------------------------------------------------------------

test('/model help — lists every documented subcommand', async t => {
  const { handler } = makeHandler();
  const out = await drain(handler(['help']));
  const joined = out.join('\n');
  for (const name of ['list', 'show', 'set', 'test', 'commit', 'clear', 'help']) {
    t.regex(joined, new RegExp(`/model ${name}\\b`, 'u'));
  }
});

test('/model (no args) — falls through to /model help', async t => {
  const { handler } = makeHandler();
  const out = await drain(handler([]));
  t.regex(out.join('\n'), /Subcommands:/u);
});

test('/model <unknown> — yields a helpful error pointing at /model help', async t => {
  const { handler } = makeHandler();
  const out = await drain(handler(['bogus']));
  t.is(out.length, 1);
  t.regex(out[0], /^error:Unknown \/model subcommand "bogus"/u);
});
