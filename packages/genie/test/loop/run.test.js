// @ts-check

/**
 * Tests for `runGenieLoop` — the shared message-dispatch loop used
 * by both `dev-repl.js` and `main.js`.
 *
 * These tests exercise the runner end-to-end with a fake `GenieIO`
 * that records every side effect (prompts consumed, chunks written,
 * replies sent, dismisses ordered, idle/busy transitions).  They cover
 * the three dispatch paths the loop must support:
 *
 * - `special`: prefix matches → routed through the supplied
 *   `SpecialsDispatcher`.
 * - `heartbeat`: `kind === 'heartbeat'` prompts → routed to
 *   `handlers.runHeartbeat` and never to the specials dispatcher.
 * - `user`: anything else → routed to `handlers.runUserPrompt`; output
 *   chunks are streamed via `io.write` when provided, or batched into
 *   per-chunk `io.reply(promptId, [chunk])` calls when only `reply`
 *   is configured (matching the daemon adapter's shape).
 *
 * Plus the cross-cutting invariants described in
 * `PLAN/genie_loop_architecture.md` § "IO adapter":
 *
 * - `onIdle` / `onBusy` fire around each prompt.
 * - `afterDispatch` + `io.dismiss` fire after every dispatch (including
 *   errors).
 * - `shouldExit()` terminates the loop after the current prompt.
 * - Errors in any dispatch path are forwarded to `handlers.onError`
 *   and do not kill the loop.
 */

import '@endo/harden';

import test from 'ava';

import { makeSpecialsDispatcher } from '../../src/loop/specials.js';
import { runGenieLoop } from '../../src/loop/run.js';

/** @import { GenieIO, InboundPrompt } from '../../src/loop/io.js' */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake `GenieIO<string>` that records every method call.  The
 * constructor accepts an optional list of prompts to emit; the
 * returned handle exposes the recording arrays + control hooks so
 * tests can drive individual scenarios without mocking a real
 * readline or daemon inbox.
 *
 * @param {object} [options]
 * @param {Array<InboundPrompt>} [options.prompts]
 *   - Prompts emitted by `io.prompts()` in order.
 * @param {boolean} [options.withWrite] - When `true`, install an
 *   `io.write` hook; otherwise the runner falls back to `io.reply`.
 * @param {boolean} [options.withReply]
 * @param {boolean} [options.withDismiss]
 * @param {boolean} [options.withOnIdle]
 * @param {boolean} [options.withOnBusy]
 */
const makeFakeIo = ({
  prompts = [],
  withWrite = true,
  withReply = false,
  withDismiss = false,
  withOnIdle = false,
  withOnBusy = false,
} = {}) => {
  /** @type {string[]} */
  const writes = [];
  /** @type {Array<{ id: any, chunks: string[] }>} */
  const replies = [];
  /** @type {any[]} */
  const dismisses = [];
  /** @type {Array<'idle' | 'busy'>} */
  const transitions = [];

  /** @type {GenieIO<string>} */
  const io = /** @type {any} */ ({
    prompts: () =>
      (async function* promptsGen() {
        for (const p of prompts) yield p;
      })(),
  });
  if (withWrite) {
    io.write = chunk => {
      writes.push(chunk);
    };
  }
  if (withReply) {
    io.reply = (id, chunks) => {
      replies.push({ id, chunks: chunks.slice() });
    };
  }
  if (withDismiss) {
    io.dismiss = id => {
      dismisses.push(id);
    };
  }
  if (withOnIdle) {
    io.onIdle = () => {
      transitions.push('idle');
    };
  }
  if (withOnBusy) {
    io.onBusy = () => {
      transitions.push('busy');
    };
  }
  return { io, writes, replies, dismisses, transitions };
};

/**
 * Wrap an array of chunks into a matching async generator for use as
 * a handler return value.
 *
 * @param {string[]} chunks
 */
const asyncGenOf = chunks =>
  (async function* gen() {
    for (const c of chunks) yield c;
  })();

// ---------------------------------------------------------------------------
// Basic shape
// ---------------------------------------------------------------------------

test('runGenieLoop — returns immediately when prompts is empty', async t => {
  const { io, writes, transitions } = makeFakeIo({
    prompts: [],
    withOnIdle: true,
    withOnBusy: true,
  });
  const specials = makeSpecialsDispatcher({ prefix: '.', handlers: {} });
  await runGenieLoop({
    agents: /** @type {any} */ ({}),
    specials,
    io,
    handlers: {
      runUserPrompt: () => asyncGenOf([]),
    },
  });
  t.deepEqual(writes, []);
  // Only the initial idle transition before awaiting the first
  // (non-existent) prompt.
  t.deepEqual(transitions, ['idle']);
});

// ---------------------------------------------------------------------------
// User-prompt dispatch
// ---------------------------------------------------------------------------

test('runGenieLoop — routes unprefixed prompt to runUserPrompt and streams via write', async t => {
  /** @type {InboundPrompt[]} */
  const prompts = [{ id: 1, text: 'hello' }];
  const { io, writes, transitions } = makeFakeIo({
    prompts,
    withOnIdle: true,
    withOnBusy: true,
  });
  const specials = makeSpecialsDispatcher({ prefix: '.', handlers: {} });

  /** @type {string[]} */
  const seenPrompts = [];
  await runGenieLoop({
    agents: /** @type {any} */ ({}),
    specials,
    io,
    handlers: {
      runUserPrompt: prompt => {
        seenPrompts.push(prompt.text);
        return asyncGenOf(['a', 'b', 'c']);
      },
    },
  });

  t.deepEqual(seenPrompts, ['hello']);
  t.deepEqual(writes, ['a', 'b', 'c']);
  // idle → busy → idle around the single prompt.
  t.deepEqual(transitions, ['idle', 'busy', 'idle']);
});

test('runGenieLoop — falls back to io.reply(id, [chunk]) when write is absent', async t => {
  /** @type {InboundPrompt[]} */
  const prompts = [{ id: 42, text: 'hi' }];
  const { io, replies } = makeFakeIo({
    prompts,
    withWrite: false,
    withReply: true,
  });
  const specials = makeSpecialsDispatcher({ prefix: '/', handlers: {} });

  await runGenieLoop({
    agents: /** @type {any} */ ({}),
    specials,
    io,
    handlers: {
      runUserPrompt: () => asyncGenOf(['x', 'y']),
    },
  });

  // One reply per yielded chunk, correlated by prompt.id.  Mirrors
  // the pre-migration daemon behaviour where each progress string
  // becomes its own mail reply.
  t.deepEqual(replies, [
    { id: 42, chunks: ['x'] },
    { id: 42, chunks: ['y'] },
  ]);
});

// ---------------------------------------------------------------------------
// Specials dispatch
// ---------------------------------------------------------------------------

test('runGenieLoop — routes prefixed prompt through specials.dispatch', async t => {
  /** @type {string[][]} */
  const specialCalls = [];
  /** @type {import('../../src/loop/specials.js').SpecialHandler<string>} */
  const handler = async function* handler(tail) {
    specialCalls.push(tail.slice());
    yield 'ok';
  };
  const specials = makeSpecialsDispatcher({
    prefix: '.',
    handlers: { observe: handler },
  });
  /** @type {InboundPrompt[]} */
  const prompts = [{ id: 'p1', text: '.observe tail1 tail2' }];
  const { io, writes } = makeFakeIo({ prompts });

  await runGenieLoop({
    agents: /** @type {any} */ ({}),
    specials,
    io,
    handlers: {
      runUserPrompt: () => asyncGenOf(['should-not-run']),
    },
  });

  t.deepEqual(specialCalls, [['tail1', 'tail2']]);
  t.deepEqual(writes, ['ok']);
});

test('runGenieLoop — respects explicit prompt.kind="special"', async t => {
  // Even without a matching prefix in specials, an explicit kind of
  // "special" routes through the dispatcher.  Here the dispatcher
  // will throw because the text lacks the configured prefix — the
  // runner must surface that via onError, not crash.
  /** @type {Array<{ prompt: any, err: Error }>} */
  const errors = [];
  const specials = makeSpecialsDispatcher({ prefix: '/', handlers: {} });
  /** @type {InboundPrompt[]} */
  const prompts = [{ id: 1, text: 'no-prefix', kind: 'special' }];
  const { io } = makeFakeIo({ prompts });

  await runGenieLoop({
    agents: /** @type {any} */ ({}),
    specials,
    io,
    handlers: {
      runUserPrompt: () => asyncGenOf(['user']),
      onError: (prompt, error) => {
        errors.push({ prompt, err: /** @type {Error} */ (error) });
      },
    },
  });

  t.is(errors.length, 1);
  t.regex(errors[0].err.message, /not a special command/);
});

// ---------------------------------------------------------------------------
// Heartbeat dispatch
// ---------------------------------------------------------------------------

test('runGenieLoop — routes kind="heartbeat" to handlers.runHeartbeat and not to specials', async t => {
  /** @type {string[]} */
  const heartbeatCalls = [];
  /** @type {string[][]} */
  const specialCalls = [];
  /** @type {import('../../src/loop/specials.js').SpecialHandler<string>} */
  const heartbeatSpecial = async function* heartbeatSpecial(tail) {
    specialCalls.push(tail.slice());
    yield 'SPECIAL-SHOULD-NOT-FIRE';
  };
  const specials = makeSpecialsDispatcher({
    prefix: '/',
    handlers: { heartbeat: heartbeatSpecial },
  });
  /** @type {InboundPrompt[]} */
  const prompts = [{ id: 1, text: '/heartbeat hb-0', kind: 'heartbeat' }];
  const { io, writes } = makeFakeIo({ prompts });

  await runGenieLoop({
    agents: /** @type {any} */ ({}),
    specials,
    io,
    handlers: {
      runUserPrompt: () => asyncGenOf([]),
      runHeartbeat: async prompt => {
        heartbeatCalls.push(prompt.text);
      },
    },
  });

  t.deepEqual(heartbeatCalls, ['/heartbeat hb-0']);
  t.deepEqual(specialCalls, []);
  t.deepEqual(writes, []);
});

test('runGenieLoop — kind="heartbeat" without a handler is silently dropped', async t => {
  const specials = makeSpecialsDispatcher({ prefix: '/', handlers: {} });
  /** @type {InboundPrompt[]} */
  const prompts = [{ id: 1, text: 'ignored', kind: 'heartbeat' }];
  const { io, writes } = makeFakeIo({ prompts });

  // No runHeartbeat handler — the runner should treat the heartbeat
  // prompt as a no-op rather than throwing.
  await t.notThrowsAsync(() =>
    runGenieLoop({
      agents: /** @type {any} */ ({}),
      specials,
      io,
      handlers: {
        runUserPrompt: () => asyncGenOf(['USER-SHOULD-NOT-FIRE']),
      },
    }),
  );
  t.deepEqual(writes, []);
});

// ---------------------------------------------------------------------------
// afterDispatch + dismiss + shouldExit
// ---------------------------------------------------------------------------

test('runGenieLoop — invokes afterDispatch then io.dismiss per prompt', async t => {
  /** @type {any[]} */
  const afterDispatchCalls = [];
  /** @type {InboundPrompt[]} */
  const prompts = [
    { id: 'u1', text: 'hello' },
    { id: 'u2', text: '.help' },
  ];
  const handler = async function* help() {
    yield 'help-out';
  };
  const specials = makeSpecialsDispatcher({
    prefix: '.',
    handlers: { help: handler },
  });
  const { io, dismisses } = makeFakeIo({ prompts, withDismiss: true });

  await runGenieLoop({
    agents: /** @type {any} */ ({}),
    specials,
    io,
    handlers: {
      runUserPrompt: () => asyncGenOf(['u']),
    },
    afterDispatch: prompt => {
      afterDispatchCalls.push(prompt.id);
    },
  });

  t.deepEqual(afterDispatchCalls, ['u1', 'u2']);
  t.deepEqual(dismisses, ['u1', 'u2']);
});

test('runGenieLoop — shouldExit terminates after the current prompt', async t => {
  /** @type {InboundPrompt[]} */
  const prompts = [
    { id: 1, text: 'first' },
    { id: 2, text: 'second' },
    { id: 3, text: 'third' },
  ];
  const { io, writes } = makeFakeIo({ prompts });
  const specials = makeSpecialsDispatcher({ prefix: '.', handlers: {} });
  let seen = 0;

  await runGenieLoop({
    agents: /** @type {any} */ ({}),
    specials,
    io,
    handlers: {
      runUserPrompt: prompt => {
        seen += 1;
        return asyncGenOf([`#${prompt.id}`]);
      },
    },
    shouldExit: () => seen >= 2,
  });

  t.is(seen, 2);
  t.deepEqual(writes, ['#1', '#2']);
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

test('runGenieLoop — forwards runUserPrompt throws to onError and keeps running', async t => {
  /** @type {Array<{ id: any, msg: string }>} */
  const errorLog = [];
  /** @type {InboundPrompt[]} */
  const prompts = [
    { id: 1, text: 'bad' },
    { id: 2, text: 'good' },
  ];
  const { io, writes, dismisses } = makeFakeIo({
    prompts,
    withDismiss: true,
  });
  const specials = makeSpecialsDispatcher({ prefix: '.', handlers: {} });

  await runGenieLoop({
    agents: /** @type {any} */ ({}),
    specials,
    io,
    handlers: {
      runUserPrompt: prompt => {
        if (prompt.text === 'bad') {
          return (async function* throwing() {
            throw new Error('boom');
            // eslint-disable-next-line no-unreachable
            yield '';
          })();
        }
        return asyncGenOf(['ok']);
      },
      onError: (prompt, err) => {
        errorLog.push({
          id: prompt.id,
          msg: /** @type {Error} */ (err).message,
        });
      },
    },
  });

  t.deepEqual(errorLog, [{ id: 1, msg: 'boom' }]);
  t.deepEqual(writes, ['ok']);
  // Both prompts still get dismissed — errors must not skip the
  // acknowledgement path.
  t.deepEqual(dismisses, [1, 2]);
});

test('runGenieLoop — afterDispatch failure does not stop the loop', async t => {
  /** @type {InboundPrompt[]} */
  const prompts = [
    { id: 1, text: 'a' },
    { id: 2, text: 'b' },
  ];
  const { io, writes, dismisses } = makeFakeIo({
    prompts,
    withDismiss: true,
  });
  const specials = makeSpecialsDispatcher({ prefix: '.', handlers: {} });

  await runGenieLoop({
    agents: /** @type {any} */ ({}),
    specials,
    io,
    handlers: {
      runUserPrompt: prompt => asyncGenOf([`->${prompt.id}`]),
    },
    afterDispatch: () => {
      throw new Error('observer blew up');
    },
  });

  t.deepEqual(writes, ['->1', '->2']);
  t.deepEqual(dismisses, [1, 2]);
});

test('runGenieLoop — dismiss failure does not stop the loop', async t => {
  /** @type {InboundPrompt[]} */
  const prompts = [
    { id: 1, text: 'a' },
    { id: 2, text: 'b' },
  ];
  /** @type {any[]} */
  const writes = [];
  /** @type {GenieIO<string>} */
  const io = /** @type {any} */ ({
    prompts: () =>
      (async function* promptsGen() {
        for (const p of prompts) yield p;
      })(),
    write: c => {
      writes.push(c);
    },
    dismiss: () => {
      throw new Error('mail rejected');
    },
  });
  const specials = makeSpecialsDispatcher({ prefix: '.', handlers: {} });

  await runGenieLoop({
    agents: /** @type {any} */ ({}),
    specials,
    io,
    handlers: {
      runUserPrompt: prompt => asyncGenOf([`->${prompt.id}`]),
    },
  });

  t.deepEqual(writes, ['->1', '->2']);
});

// ---------------------------------------------------------------------------
// onIdle / onBusy ordering
// ---------------------------------------------------------------------------

test('runGenieLoop — emits onIdle/onBusy in the documented order', async t => {
  /** @type {InboundPrompt[]} */
  const prompts = [
    { id: 1, text: 'first' },
    { id: 2, text: 'second' },
  ];
  const { io, transitions } = makeFakeIo({
    prompts,
    withOnIdle: true,
    withOnBusy: true,
  });
  const specials = makeSpecialsDispatcher({ prefix: '.', handlers: {} });

  await runGenieLoop({
    agents: /** @type {any} */ ({}),
    specials,
    io,
    handlers: {
      runUserPrompt: () => asyncGenOf(['x']),
    },
  });

  // Initial idle (before first prompt await); then busy/idle per
  // prompt in strict alternation.
  t.deepEqual(transitions, ['idle', 'busy', 'idle', 'busy', 'idle']);
});
