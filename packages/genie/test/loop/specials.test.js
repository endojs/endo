// @ts-check

/**
 * Tests for `makeSpecialsDispatcher` — the prefix-parameterised
 * specials-command dispatcher shared by `dev-repl.js` (prefix `.`)
 * and `main.js` (prefix `/`).
 *
 * These tests pin the invariants described in
 * `PLAN/genie_loop_architecture.md` § "Specials dispatcher":
 *
 * - `isSpecial` classifies inputs purely on prefix; both `.` and `/`
 *   work without modification.
 * - `dispatch` tokenises the body after the prefix, routes to the
 *   matching handler by head token, and forwards the remaining tail
 *   tokens to the handler.
 * - Unknown commands fall through to the optional `onUnknown`
 *   fallback; absent that, dispatch silently yields nothing.
 * - `listCommands` returns a stable snapshot of the registered
 *   command names.
 */

import '@endo/harden';

import test from 'ava';

import { makeSpecialsDispatcher } from '../../src/loop/specials.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Drain an `AsyncGenerator<string>` into an array.
 *
 * @param {AsyncGenerator<string>} it
 */
const drain = async it => {
  const out = [];
  for await (const chunk of it) out.push(chunk);
  return out;
};

/**
 * Build a handler that records its tail and yields a fixed
 * response.  Used to prove routing + tail-forwarding.
 *
 * @param {string} name
 */
const makeRecorder = name => {
  /** @type {string[][]} */
  const calls = [];
  /** @type {import('../../src/loop/specials.js').SpecialHandler<string>} */
  const handler = async function* recorder(tail) {
    calls.push(tail.slice());
    yield `${name}:${tail.join(',')}`;
  };
  return { handler, calls };
};

// ---------------------------------------------------------------------------
// Construction / shape
// ---------------------------------------------------------------------------

test('makeSpecialsDispatcher — returns the documented shape', t => {
  const dispatcher = makeSpecialsDispatcher({
    prefix: '.',
    handlers: {},
  });
  t.is(typeof dispatcher.isSpecial, 'function');
  t.is(typeof dispatcher.dispatch, 'function');
  t.is(typeof dispatcher.listCommands, 'function');
  t.deepEqual(dispatcher.listCommands(), []);
});

test('makeSpecialsDispatcher — rejects empty prefix', t => {
  t.throws(() => makeSpecialsDispatcher({ prefix: '', handlers: {} }), {
    message: /non-empty string/,
  });
});

test('makeSpecialsDispatcher — listCommands reflects registered handler names', t => {
  const { handler: h1 } = makeRecorder('a');
  const { handler: h2 } = makeRecorder('b');
  const dispatcher = makeSpecialsDispatcher({
    prefix: '.',
    handlers: { foo: h1, bar: h2 },
  });
  t.deepEqual(dispatcher.listCommands().sort(), ['bar', 'foo']);
});

// ---------------------------------------------------------------------------
// isSpecial — prefix classification
// ---------------------------------------------------------------------------

test('makeSpecialsDispatcher — isSpecial matches the configured prefix (.)', t => {
  const dispatcher = makeSpecialsDispatcher({ prefix: '.', handlers: {} });
  t.true(dispatcher.isSpecial('.help'));
  t.true(dispatcher.isSpecial('.observe extra'));
  t.true(dispatcher.isSpecial('.'));
  t.false(dispatcher.isSpecial('help'));
  t.false(dispatcher.isSpecial('/help'));
  t.false(dispatcher.isSpecial(' .help')); // leading space => not special
});

test('makeSpecialsDispatcher — isSpecial matches the configured prefix (/)', t => {
  const dispatcher = makeSpecialsDispatcher({ prefix: '/', handlers: {} });
  t.true(dispatcher.isSpecial('/observe'));
  t.true(dispatcher.isSpecial('/reflect now'));
  t.false(dispatcher.isSpecial('.observe'));
  t.false(dispatcher.isSpecial('hello'));
});

test('makeSpecialsDispatcher — isSpecial rejects non-string input', t => {
  const dispatcher = makeSpecialsDispatcher({ prefix: '.', handlers: {} });
  t.false(dispatcher.isSpecial(/** @type {any} */ (undefined)));
  t.false(dispatcher.isSpecial(/** @type {any} */ (null)));
  t.false(dispatcher.isSpecial(/** @type {any} */ (42)));
});

// ---------------------------------------------------------------------------
// dispatch — routing + tail forwarding
// ---------------------------------------------------------------------------

test('makeSpecialsDispatcher — dispatch routes by head token (no tail)', async t => {
  const { handler, calls } = makeRecorder('observe');
  const dispatcher = makeSpecialsDispatcher({
    prefix: '.',
    handlers: { observe: handler },
  });
  const out = await drain(dispatcher.dispatch('.observe'));
  t.deepEqual(out, ['observe:']);
  t.deepEqual(calls, [[]]);
});

test('makeSpecialsDispatcher — dispatch forwards tail tokens', async t => {
  const { handler, calls } = makeRecorder('background');
  const dispatcher = makeSpecialsDispatcher({
    prefix: '.',
    handlers: { background: handler },
  });
  const out = await drain(dispatcher.dispatch('.background on'));
  t.deepEqual(out, ['background:on']);
  t.deepEqual(calls, [['on']]);
});

test('makeSpecialsDispatcher — dispatch collapses runs of whitespace', async t => {
  const { handler, calls } = makeRecorder('cmd');
  const dispatcher = makeSpecialsDispatcher({
    prefix: '/',
    handlers: { cmd: handler },
  });
  await drain(dispatcher.dispatch('/cmd   a    b\tc'));
  t.deepEqual(calls, [['a', 'b', 'c']]);
});

test('makeSpecialsDispatcher — bare prefix yields nothing', async t => {
  const { handler, calls } = makeRecorder('observe');
  const dispatcher = makeSpecialsDispatcher({
    prefix: '.',
    handlers: { observe: handler },
  });
  const out = await drain(dispatcher.dispatch('.'));
  t.deepEqual(out, []);
  t.deepEqual(calls, []); // no handler invoked
});

test('makeSpecialsDispatcher — dispatch on non-special input throws', async t => {
  const dispatcher = makeSpecialsDispatcher({
    prefix: '.',
    handlers: { observe: makeRecorder('observe').handler },
  });
  await t.throwsAsync(() => drain(dispatcher.dispatch('hello')), {
    message: /not a special command/,
  });
});

// ---------------------------------------------------------------------------
// Unknown command fallback
// ---------------------------------------------------------------------------

test('makeSpecialsDispatcher — unknown command without onUnknown yields nothing', async t => {
  const dispatcher = makeSpecialsDispatcher({
    prefix: '.',
    handlers: { observe: makeRecorder('observe').handler },
  });
  const out = await drain(dispatcher.dispatch('.bogus arg1 arg2'));
  t.deepEqual(out, []);
});

test('makeSpecialsDispatcher — onUnknown receives [head, ...tail]', async t => {
  /** @type {string[][]} */
  const unknownCalls = [];
  /** @type {import('../../src/loop/specials.js').SpecialHandler<string>} */
  const onUnknown = async function* unknown(tail) {
    unknownCalls.push(tail.slice());
    yield `unknown:${tail.join(',')}`;
  };
  const dispatcher = makeSpecialsDispatcher({
    prefix: '.',
    handlers: { observe: makeRecorder('observe').handler },
    onUnknown,
  });
  const out = await drain(dispatcher.dispatch('.bogus alpha'));
  t.deepEqual(out, ['unknown:bogus,alpha']);
  t.deepEqual(unknownCalls, [['bogus', 'alpha']]);
});

test('makeSpecialsDispatcher — known handlers bypass onUnknown', async t => {
  /** @type {string[][]} */
  const unknownCalls = [];
  /** @type {import('../../src/loop/specials.js').SpecialHandler<string>} */
  const onUnknown = async function* unknown(tail) {
    unknownCalls.push(tail.slice());
    yield `unknown:${tail.join(',')}`;
  };
  const { handler, calls } = makeRecorder('observe');
  const dispatcher = makeSpecialsDispatcher({
    prefix: '.',
    handlers: { observe: handler },
    onUnknown,
  });
  const out = await drain(dispatcher.dispatch('.observe x y'));
  t.deepEqual(out, ['observe:x,y']);
  t.deepEqual(calls, [['x', 'y']]);
  t.deepEqual(unknownCalls, []);
});
