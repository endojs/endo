// @ts-check

/**
 * Tests for `makeBuiltinSpecials` — the shared built-in specials
 * handler map consumed by both `dev-repl.js` and `main.js`.
 *
 * These tests validate that each built-in handler:
 *
 * - guards correctly on missing / busy sub-agents,
 * - forwards progress messages through the injected `io` surface
 *   (so deployment-specific rendering can style them),
 * - consumes sub-agent event streams via `io.renderEvents` so the
 *   caller controls whether events become output chunks or are
 *   silently drained,
 * - mutes / unmutes the background stream across the scope of a
 *   caller-driven command,
 * - falls through `clearHistory` / `requestExit` no-ops when the
 *   deployment does not supply them.
 *
 * See `PLAN/genie_loop_overview.md` § phase 4 and
 * `PLAN/genie_loop_architecture.md` § "Specials dispatcher".
 */

// `makeBuiltinSpecials` transitively pulls in `src/primordial/providers.js`,
// which freezes its catalog at module load via the global `harden`.  The
// shared `../setup.js` runs SES lockdown so that global is installed
// before the import graph resolves regardless of which driver started us.
import '../setup.js';

import test from 'ava';

import { makeBuiltinSpecials } from '../../src/loop/builtin-specials.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Drain an `AsyncGenerator<string>` into an array of emitted chunks.
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
 * Build a minimal `SpecialsIO<string>` that tags every rendered chunk
 * with its level (e.g. `notice:Running heartbeat cycle...`) so tests
 * can assert both the level and the content without coupling to
 * ANSI escape codes.  Optional hooks are captured in a `log` array
 * for later assertions.
 *
 * @param {object} [options]
 * @param {Array<string>} [options.toolNames] - Value returned by
 *   `listToolNames`.
 * @param {Array<string>} [options.helpLines] - Value returned by
 *   `listHelpLines`.
 * @param {boolean} [options.withClearHistory]
 * @param {boolean} [options.withRequestExit]
 */
const makeIo = ({
  toolNames,
  helpLines,
  withClearHistory = false,
  withRequestExit = false,
} = {}) => {
  /** @type {string[]} */
  const log = [];
  /** @type {{ clearHistory?: number, requestExit?: number }} */
  const counts = {};
  /** @type {Array<any>} */
  const renderedBatches = [];
  /** @type {any} */
  const io = {
    info: msg => `info:${msg}`,
    notice: msg => `notice:${msg}`,
    warn: msg => `warn:${msg}`,
    error: msg => `error:${msg}`,
    success: msg => `success:${msg}`,
    renderEvents: async function* render(events, options = {}) {
      const { label } = options;
      const batch = { label, events: [] };
      renderedBatches.push(batch);
      for await (const event of events) {
        batch.events.push(event);
        yield `event:${label ?? 'genie'}:${event.type}`;
      }
    },
    muteBackground: label => log.push(`mute:${label}`),
    unmuteBackground: label => log.push(`unmute:${label}`),
  };
  if (toolNames !== undefined) {
    io.listToolNames = () => toolNames.slice();
  }
  if (helpLines !== undefined) {
    io.listHelpLines = () => helpLines.slice();
  }
  if (withClearHistory) {
    io.clearHistory = () => {
      counts.clearHistory = (counts.clearHistory ?? 0) + 1;
    };
  }
  if (withRequestExit) {
    io.requestExit = () => {
      counts.requestExit = (counts.requestExit ?? 0) + 1;
    };
  }
  return { io, log, counts, renderedBatches };
};

/**
 * Minimal stub agent pack — only the shape accessed by the built-in
 * handlers (no actual PiAgent instances).
 *
 * @param {{
 *   observer?: any,
 *   reflector?: any,
 * }} [options]
 */
const makeAgents = ({ observer, reflector } = {}) => ({
  piAgent: /** @type {any} */ ({ __stub: 'piAgent' }),
  heartbeatAgent: /** @type {any} */ ({ __stub: 'heartbeatAgent' }),
  observer,
  reflector,
});

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

test('makeBuiltinSpecials — returns every documented handler', t => {
  const { io } = makeIo();
  const handlers = makeBuiltinSpecials({
    agents: makeAgents(),
    workspaceDir: '/w',
    io,
  });
  for (const name of [
    'heartbeat',
    'observe',
    'reflect',
    'help',
    'tools',
    'clear',
    'exit',
    'model',
  ]) {
    t.is(typeof handlers[name], 'function', `handler ${name}`);
  }
});

// ---------------------------------------------------------------------------
// observe
// ---------------------------------------------------------------------------

test('observe — errors when the observer is absent', async t => {
  const { io } = makeIo();
  const handlers = makeBuiltinSpecials({
    agents: makeAgents(), // no observer
    workspaceDir: '/w',
    io,
  });
  const out = await drain(handlers.observe([]));
  t.deepEqual(out, ['error:Observer not available (memory tools required).']);
});

test('observe — warns when the observer is already running', async t => {
  const observer = {
    isRunning: () => true,
    observe: async () => {
      throw new Error('observe() should not be called when already running');
    },
  };
  const { io } = makeIo();
  const handlers = makeBuiltinSpecials({
    agents: makeAgents({ observer }),
    workspaceDir: '/w',
    io,
  });
  const out = await drain(handlers.observe([]));
  t.deepEqual(out, ['warn:Observation is already in progress.']);
});

test('observe — info when there are no unobserved messages', async t => {
  const observer = {
    isRunning: () => false,
    observe: async () => undefined, // nothing to observe
  };
  const { io } = makeIo();
  const handlers = makeBuiltinSpecials({
    agents: makeAgents({ observer }),
    workspaceDir: '/w',
    io,
  });
  const out = await drain(handlers.observe([]));
  t.deepEqual(out, ['info:No unobserved messages to process.']);
});

test('observe — streams events through renderEvents and brackets with mute/unmute + success', async t => {
  const events = [{ type: 'Thinking' }, { type: 'Message' }];
  /** @type {any} */
  const observer = {
    isRunning: () => false,
    observe: async () =>
      (async function* runObserve() {
        for (const e of events) yield e;
      })(),
  };
  const { io, log, renderedBatches } = makeIo();
  const handlers = makeBuiltinSpecials({
    agents: makeAgents({ observer }),
    workspaceDir: '/w',
    io,
  });
  const out = await drain(handlers.observe([]));
  t.deepEqual(out, [
    'notice:Running observation cycle...',
    'event:observer:Thinking',
    'event:observer:Message',
    'success:✓ Observation complete.',
  ]);
  t.deepEqual(log, ['mute:observer', 'unmute:observer']);
  t.is(renderedBatches.length, 1);
  t.is(renderedBatches[0].label, 'observer');
  t.is(renderedBatches[0].events.length, 2);
});

test('observe — unmutes even when renderEvents throws', async t => {
  /** @type {any} */
  const observer = {
    isRunning: () => false,
    observe: async () =>
      (async function* runObserve() {
        throw new Error('boom');
        // eslint-disable-next-line no-unreachable
        yield undefined;
      })(),
  };
  const { io, log } = makeIo();
  const handlers = makeBuiltinSpecials({
    agents: makeAgents({ observer }),
    workspaceDir: '/w',
    io,
  });
  const out = await drain(handlers.observe([]));
  t.deepEqual(out, [
    'notice:Running observation cycle...',
    'error:Observation failed: boom',
  ]);
  t.deepEqual(log, ['mute:observer', 'unmute:observer']);
});

// ---------------------------------------------------------------------------
// reflect
// ---------------------------------------------------------------------------

test('reflect — errors when the reflector is absent', async t => {
  const { io } = makeIo();
  const handlers = makeBuiltinSpecials({
    agents: makeAgents(), // no reflector
    workspaceDir: '/w',
    io,
  });
  const out = await drain(handlers.reflect([]));
  t.deepEqual(out, ['error:Reflector not available (memory tools required).']);
});

test('reflect — warns when the reflector is already running', async t => {
  const reflector = {
    isRunning: () => true,
    reflect: async () => {
      throw new Error('reflect() should not be called when already running');
    },
  };
  const { io } = makeIo();
  const handlers = makeBuiltinSpecials({
    agents: makeAgents({ reflector }),
    workspaceDir: '/w',
    io,
  });
  const out = await drain(handlers.reflect([]));
  t.deepEqual(out, ['warn:Reflection is already in progress.']);
});

test('reflect — streams events with mute/unmute bracketing + success', async t => {
  const events = [{ type: 'Thinking' }, { type: 'Message' }];
  /** @type {any} */
  const reflector = {
    isRunning: () => false,
    reflect: async () =>
      (async function* runRefleect() {
        for (const e of events) yield e;
      })(),
  };
  const { io, log, renderedBatches } = makeIo();
  const handlers = makeBuiltinSpecials({
    agents: makeAgents({ reflector }),
    workspaceDir: '/w',
    io,
  });
  const out = await drain(handlers.reflect([]));
  t.deepEqual(out, [
    'notice:Running reflection cycle...',
    'event:reflector:Thinking',
    'event:reflector:Message',
    'success:✓ Reflection cycle complete.',
  ]);
  t.deepEqual(log, ['mute:reflector', 'unmute:reflector']);
  t.is(renderedBatches[0].label, 'reflector');
});

// ---------------------------------------------------------------------------
// help / tools / clear / exit — simple info + io delegation
// ---------------------------------------------------------------------------

test('help — yields every help line via io.info', async t => {
  const { io } = makeIo({ helpLines: ['Commands:', '  .help', '  .exit'] });
  const handlers = makeBuiltinSpecials({
    agents: makeAgents(),
    workspaceDir: '/w',
    io,
  });
  const out = await drain(handlers.help([]));
  t.deepEqual(out, ['info:Commands:', 'info:  .help', 'info:  .exit']);
});

test('help — no help lines when io.listHelpLines is unset', async t => {
  const { io } = makeIo();
  const handlers = makeBuiltinSpecials({
    agents: makeAgents(),
    workspaceDir: '/w',
    io,
  });
  const out = await drain(handlers.help([]));
  t.deepEqual(out, ['info:No help available.']);
});

test('tools — lists every registered tool name', async t => {
  const { io } = makeIo({ toolNames: ['bash', 'memoryGet'] });
  const handlers = makeBuiltinSpecials({
    agents: makeAgents(),
    workspaceDir: '/w',
    io,
  });
  const out = await drain(handlers.tools([]));
  t.deepEqual(out, ['info:  • bash', 'info:  • memoryGet']);
});

test('tools — placeholder when there are no tools', async t => {
  const { io } = makeIo({ toolNames: [] });
  const handlers = makeBuiltinSpecials({
    agents: makeAgents(),
    workspaceDir: '/w',
    io,
  });
  const out = await drain(handlers.tools([]));
  t.deepEqual(out, ['info:-- No Tools --']);
});

test('clear — warns when io.clearHistory is unset', async t => {
  const { io } = makeIo();
  const handlers = makeBuiltinSpecials({
    agents: makeAgents(),
    workspaceDir: '/w',
    io,
  });
  const out = await drain(handlers.clear([]));
  t.deepEqual(out, ['warn:Clear not supported in this deployment.']);
});

test('clear — invokes io.clearHistory once and notices', async t => {
  const { io, counts } = makeIo({ withClearHistory: true });
  const handlers = makeBuiltinSpecials({
    agents: makeAgents(),
    workspaceDir: '/w',
    io,
  });
  const out = await drain(handlers.clear([]));
  t.deepEqual(out, ['info:Conversation history cleared.']);
  t.is(counts.clearHistory, 1);
});

test('exit — invokes io.requestExit when provided', async t => {
  const { io, counts } = makeIo({ withRequestExit: true });
  const handlers = makeBuiltinSpecials({
    agents: makeAgents(),
    workspaceDir: '/w',
    io,
  });
  const out = await drain(handlers.exit([]));
  t.deepEqual(out, ['info:Goodbye.']);
  t.is(counts.requestExit, 1);
});

test('exit — silently no-ops requestExit when unset', async t => {
  const { io } = makeIo();
  const handlers = makeBuiltinSpecials({
    agents: makeAgents(),
    workspaceDir: '/w',
    io,
  });
  const out = await drain(handlers.exit([]));
  t.deepEqual(out, ['info:Goodbye.']);
  // No throw and no further assertions — requestExit was not supplied,
  // so the handler silently skips that side-effect.
});

// ---------------------------------------------------------------------------
// model — sub-task 95 of TODO/92_genie_primordial.md
// ---------------------------------------------------------------------------
//
// The full subcommand surface is exercised in
// `test/primordial/model-handler.test.js`; here we only check the
// integration points that `makeBuiltinSpecials` is responsible for —
// namely, that the entry exists, that it dispatches into
// `makeModelHandler` when `state` is supplied, and that it falls back
// to a "not available" warning when no primordial state is threaded
// through (matching the dev-repl deployment shape).

test('model — yields a "not available" stub when no state is threaded through', async t => {
  const { io } = makeIo();
  const handlers = makeBuiltinSpecials({
    agents: makeAgents(),
    workspaceDir: '/w',
    io,
    // state intentionally omitted
  });
  const out = await drain(handlers.model([]));
  t.is(out.length, 1);
  t.regex(
    out[0],
    /^warn:\/model is not available/u,
    'absent state must surface a friendly stub instead of throwing',
  );
});

test('model — dispatches into the real /model handler when state is wired', async t => {
  const { io } = makeIo();
  /** @type {import('../../src/primordial/index.js').PrimordialState} */
  const state = {
    mode: 'primordial',
    activate: async () => {},
  };
  const handlers = makeBuiltinSpecials({
    agents: makeAgents(),
    workspaceDir: '/w',
    io,
    state,
  });
  // `/model list` is a side-effect-free probe that exercises the
  // dispatcher hand-off without touching disk or the network.
  const out = await drain(handlers.model(['list']));
  t.true(
    out.length >= 2,
    `expected provider catalog listing; got ${JSON.stringify(out)}`,
  );
  t.is(out[0], 'info:Providers:');
  t.true(
    out.some(line => /ollama/u.test(line)),
    'list output must mention ollama from the real catalog',
  );
});

test('model — accepts an injected providerSpec override', async t => {
  const { io } = makeIo();
  /** @type {import('../../src/primordial/index.js').PrimordialState} */
  const state = {
    mode: 'primordial',
    activate: async () => {},
  };
  const providerSpec =
    /** @type {Readonly<Record<string, import('../../src/primordial/providers.js').ProviderCredentialSpec>>} */ ({
      stubco: {
        api: 'openai-completions',
        requiredCreds: [],
        optionalOptions: [],
        notes: 'Stubbed provider used only by this test.',
      },
    });
  const handlers = makeBuiltinSpecials({
    agents: makeAgents(),
    workspaceDir: '/w',
    io,
    state,
    providerSpec,
  });
  const out = await drain(handlers.model(['list']));
  t.true(
    out.some(line => /stubco/u.test(line)),
    'override providerSpec must surface in /model list output',
  );
  t.false(
    out.some(line => /ollama/u.test(line)),
    'override providerSpec must replace, not extend, the default catalog',
  );
});

test('model — passes the persistence hook through to the underlying handler', async t => {
  const { io } = makeIo();
  /** @type {import('../../src/primordial/index.js').PrimordialState} */
  const state = {
    mode: 'primordial',
    activate: async () => {},
  };
  /** @type {Array<import('../../src/primordial/index.js').ModelDraft>} */
  const saved = [];
  const persistence = {
    /** @param {import('../../src/primordial/index.js').ModelDraft} draft */
    saveConfig: async draft => {
      saved.push(draft);
    },
  };
  const handlers = makeBuiltinSpecials({
    agents: makeAgents(),
    workspaceDir: '/w',
    io,
    state,
    persistence,
  });
  // Stage a draft with the real catalog so /model commit has something
  // to save.  ollama needs no credentials, so the set step is short.
  await drain(handlers.model(['set', 'ollama', 'llama3.2']));
  t.truthy(state.draft);
  await drain(handlers.model(['commit']));
  t.is(
    saved.length,
    1,
    'persistence.saveConfig must run when /model commit succeeds',
  );
  t.is(saved[0].provider, 'ollama');
  t.is(saved[0].modelId, 'llama3.2');
});
