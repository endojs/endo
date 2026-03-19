// @ts-check

/**
 * Tests for `makePrimordialAutomaton` — the pre-LLM reply path used
 * while the root genie is still waiting for a model configuration.
 *
 * Sub-task 94 of `TODO/92_genie_primordial.md` only covers the
 * plain-text reply: the automaton must answer every prompt (including
 * the empty string) with a friendly pointer at `/help` and `/model
 * list` so an operator who just met a fresh bottle can move forward
 * without reading any docs.  Specials (`/help`, `/tools`, and later
 * `/model`) are routed through the shared dispatcher before the
 * automaton is reached and are therefore not covered here.
 */

import '../setup.js';

import test from 'ava';

import {
  NOT_CONFIGURED_MESSAGE,
  makePrimordialAutomaton,
} from '../../src/primordial/index.js';

/**
 * Drain an `AsyncIterable<string>` into an array so tests can assert
 * against the full reply sequence.
 *
 * @param {AsyncIterable<string>} iter
 */
const collect = async iter => {
  /** @type {string[]} */
  const chunks = [];
  for await (const c of iter) chunks.push(c);
  return chunks;
};

const makeState = () =>
  /** @type {import('../../src/primordial/index.js').PrimordialState} */ ({
    mode: 'primordial',
    activate: async () => {},
  });

// ---------------------------------------------------------------------------
// Constructor validation
// ---------------------------------------------------------------------------

test('makePrimordialAutomaton — requires workspaceDir', t => {
  t.throws(
    () =>
      makePrimordialAutomaton({
        workspaceDir: /** @type {any} */ (''),
        state: makeState(),
      }),
    { message: /workspaceDir/u },
  );
  t.throws(
    () =>
      makePrimordialAutomaton({
        workspaceDir: /** @type {any} */ (undefined),
        state: makeState(),
      }),
    { message: /workspaceDir/u },
  );
});

test('makePrimordialAutomaton — requires a state object', t => {
  t.throws(
    () =>
      makePrimordialAutomaton({
        workspaceDir: '/tmp/ws',
        state: /** @type {any} */ (null),
      }),
    { message: /state/u },
  );
});

// ---------------------------------------------------------------------------
// processPrompt
// ---------------------------------------------------------------------------

test('processPrompt — plain-text prompt yields one chunk pointing at /help and /model', async t => {
  const automaton = makePrimordialAutomaton({
    workspaceDir: '/tmp/ws',
    state: makeState(),
  });

  const chunks = await collect(automaton.processPrompt('hello there'));

  t.is(chunks.length, 1, 'exactly one reply chunk per prompt');
  const [reply] = chunks;
  t.regex(
    reply,
    /\/help/u,
    'reply must point at /help so the operator can list specials',
  );
  t.regex(
    reply,
    /\/model/u,
    'reply must point at /model list so the operator can configure a provider',
  );
});

test('processPrompt — empty prompt still yields the friendly pointer', async t => {
  const automaton = makePrimordialAutomaton({
    workspaceDir: '/tmp/ws',
    state: makeState(),
  });

  const emptyChunks = await collect(automaton.processPrompt(''));
  t.deepEqual(
    emptyChunks,
    [NOT_CONFIGURED_MESSAGE],
    'empty string must receive the canonical pointer, not be dropped',
  );

  // Whitespace-only prompts normalise to empty too.
  const whitespaceChunks = await collect(automaton.processPrompt('   \n\t '));
  t.deepEqual(whitespaceChunks, [NOT_CONFIGURED_MESSAGE]);
});

test('processPrompt — non-string input is treated as empty', async t => {
  const automaton = makePrimordialAutomaton({
    workspaceDir: '/tmp/ws',
    state: makeState(),
  });

  const chunks = await collect(
    automaton.processPrompt(/** @type {any} */ (undefined)),
  );
  t.deepEqual(chunks, [NOT_CONFIGURED_MESSAGE]);
});
