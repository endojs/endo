// @ts-check

/**
 * Tests for the observer module.
 *
 * These tests exercise the observer's pure logic (serialisation,
 * token estimation, trigger conditions, concurrency guards) without
 * requiring a live LLM connection.  The `makePiAgent` call inside
 * `runObservation` is not invoked in unit tests — integration tests
 * that hit a real model belong in a separate suite.
 */

import '@endo/harden';
import test from 'ava';
import { setImmediate } from 'node:timers';

import {
  estimateUnobservedTokens,
  serializeMessages,
  makeObserver,
  DEFAULT_TOKEN_THRESHOLD,
  DEFAULT_IDLE_DELAY_MS,
  OBSERVER_SYSTEM_PROMPT,
} from '../src/observer/index.js';

/** @import { ChatEvent } from '../src/agent/index.js' */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal PiAgent-shaped stub.
 *
 * @param {Array<any>} messages
 * @returns {{ state: { messages: Array<any> } }}
 */
const stubAgent = (messages = []) => ({ state: { messages } });

// Gate-satisfying events: the observer's `makeToolGate` requires a
// successful `memorySet` call for observations.md before the cycle is
// "done".  Tests that want the retry loop to complete in a single
// round include these events in their scripted event list.
const OBSERVATION_PATH = 'memory/observations.md';

/**
 * Scripted events that satisfy the observer's tool-gate.  Pre-pend or
 * concatenate with test-specific events as needed.
 */
const gateSatisfyingEvents = () => [
  {
    type: 'ToolCallStart',
    toolName: 'memorySet',
    args: { path: OBSERVATION_PATH },
  },
  { type: 'ToolCallEnd', toolName: 'memorySet', result: { success: true } },
];

/**
 * Build minimal memoryGet / memorySet tool stubs.
 *
 * @returns {{ memoryGet: any, memorySet: any }}
 */
const stubTools = () => {
  /** @type {Map<string, string>} */
  const store = new Map();

  const memoryGet = {
    desc: () => 'Reads a memory file.',
    execute: async (/** @type {{ path: string }} */ { path }) => {
      const content = store.get(path) || '';
      return { success: true, path, content };
    },
  };

  const memorySet = {
    desc: () => 'Writes a memory file.',
    execute: async (
      /** @type {{ path: string, content: string, append?: boolean }} */
      { path, content, append = false },
    ) => {
      if (append) {
        store.set(path, (store.get(path) || '') + content);
      } else {
        store.set(path, content);
      }
      return {
        success: true,
        path,
        bytesWritten: new TextEncoder().encode(content).byteLength,
      };
    },
  };

  return { memoryGet, memorySet };
};

// ---------------------------------------------------------------------------
// serializeMessages
// ---------------------------------------------------------------------------

test('serializeMessages — empty range returns empty string', t => {
  const messages = [{ role: 'user', content: 'hello' }];
  // fromIndex beyond array length
  t.is(serializeMessages(messages, 5), '');
});

test('serializeMessages — serializes plain-string messages', t => {
  const messages = [
    { role: 'user', content: 'What is 2+2?' },
    { role: 'assistant', content: 'Four.' },
  ];
  const result = serializeMessages(messages, 0);
  t.true(result.includes('[user]: What is 2+2?'));
  t.true(result.includes('[assistant]: Four.'));
});

test('serializeMessages — respects fromIndex', t => {
  const messages = [
    { role: 'user', content: 'first' },
    { role: 'user', content: 'second' },
    { role: 'assistant', content: 'reply' },
  ];
  const result = serializeMessages(messages, 1);
  t.false(result.includes('first'));
  t.true(result.includes('second'));
  t.true(result.includes('reply'));
});

test('serializeMessages — handles array content blocks', t => {
  const messages = [
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Here you go.' },
        { type: 'thinking', thinking: 'Let me ponder...' },
      ],
    },
  ];
  const result = serializeMessages(messages, 0);
  t.true(result.includes('Here you go.'));
  t.true(result.includes('Let me ponder...'));
});

test('serializeMessages — handles toolCall blocks', t => {
  const messages = [
    {
      role: 'assistant',
      content: [{ type: 'toolCall', name: 'bash', input: { command: 'ls' } }],
    },
  ];
  const result = serializeMessages(messages, 0);
  t.true(result.includes('[tool: bash'));
  t.true(result.includes('ls'));
});

test('serializeMessages — handles toolResult blocks', t => {
  const messages = [
    {
      role: 'toolResult',
      content: [{ type: 'toolResult', result: 'file1.txt' }],
    },
  ];
  const result = serializeMessages(messages, 0);
  t.true(result.includes('[result: file1.txt]'));
});

// ---------------------------------------------------------------------------
// estimateUnobservedTokens
// ---------------------------------------------------------------------------

test('estimateUnobservedTokens — returns 0 for empty slice', t => {
  const messages = [{ role: 'user', content: 'hello' }];
  t.is(estimateUnobservedTokens(messages, 1), 0);
});

test('estimateUnobservedTokens — counts plain-string messages', t => {
  const messages = [
    { role: 'user', content: 'a'.repeat(120) }, // 30 tokens
    { role: 'assistant', content: 'b'.repeat(80) }, // 20 tokens
  ];
  // From index 0: 30 + 20 = 50
  t.is(estimateUnobservedTokens(messages, 0), 50);
  // From index 1: 20
  t.is(estimateUnobservedTokens(messages, 1), 20);
});

test('estimateUnobservedTokens — counts array content blocks', t => {
  const messages = [
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'a'.repeat(40) }, // 10 tokens
        { type: 'thinking', thinking: 'b'.repeat(20) }, // 5 tokens
      ],
    },
  ];
  t.is(estimateUnobservedTokens(messages, 0), 15);
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test('DEFAULT_TOKEN_THRESHOLD is 30000', t => {
  t.is(DEFAULT_TOKEN_THRESHOLD, 30_000);
});

test('DEFAULT_IDLE_DELAY_MS is 120000', t => {
  t.is(DEFAULT_IDLE_DELAY_MS, 120_000);
});

test('OBSERVER_SYSTEM_PROMPT is a non-empty string', t => {
  t.true(typeof OBSERVER_SYSTEM_PROMPT === 'string');
  t.true(OBSERVER_SYSTEM_PROMPT.length > 100);
});

// ---------------------------------------------------------------------------
// makeObserver — structure and guards
// ---------------------------------------------------------------------------

test('makeObserver — returns an object with the expected methods', t => {
  const { memoryGet, memorySet } = stubTools();
  const observer = makeObserver({ memoryGet, memorySet });

  t.is(typeof observer.check, 'function');
  t.is(typeof observer.onIdle, 'function');
  t.is(typeof observer.resetIdleTimer, 'function');
  t.is(typeof observer.scheduleIdle, 'function');
  t.is(typeof observer.stop, 'function');
  t.is(typeof observer.isRunning, 'function');
  t.is(typeof observer.highWaterMark, 'function');
});

test('makeObserver — initial state is idle at hwm 0', t => {
  const { memoryGet, memorySet } = stubTools();
  const observer = makeObserver({ memoryGet, memorySet });

  t.false(observer.isRunning());
  t.is(observer.highWaterMark(), 0);
});

test('makeObserver — check does not trigger below threshold', t => {
  const { memoryGet, memorySet } = stubTools();
  const observer = makeObserver({
    memoryGet,
    memorySet,
    tokenThreshold: 100,
  });

  // 10 chars = ~3 tokens, well below 100
  const agent = stubAgent([{ role: 'user', content: 'hello' }]);
  observer.check(/** @type {any} */ (agent));

  // Should not have started (no model to call, would throw if it did)
  t.false(observer.isRunning());
});

test('makeObserver — stop resolves when nothing is running', async t => {
  const { memoryGet, memorySet } = stubTools();
  const observer = makeObserver({ memoryGet, memorySet });

  // Should resolve immediately
  await observer.stop();
  t.pass();
});

test('makeObserver — resetIdleTimer is idempotent', t => {
  const { memoryGet, memorySet } = stubTools();
  const observer = makeObserver({ memoryGet, memorySet });

  // Calling resetIdleTimer multiple times should not throw.
  observer.resetIdleTimer();
  observer.resetIdleTimer();
  observer.resetIdleTimer();
  t.pass();
});

// ---------------------------------------------------------------------------
// makeObserver — observe() streaming API
// ---------------------------------------------------------------------------

/**
 * Build a stub PiAgent factory that returns a sentinel agent object.
 * The returned factory records invocation count so tests can assert
 * whether the agent was constructed at all.
 *
 * @returns {{ makeAgent: (opts: any) => Promise<any>, calls: number[] }}
 */
const stubMakeAgent = () => {
  /** @type {number[]} */
  const calls = [];
  const makeAgent = async (/** @type {any} */ _opts) => {
    calls.push(calls.length);
    return { __stub: true };
  };
  return { makeAgent, calls };
};

/**
 * Build a stub `runAgent` that yields the provided scripted events.
 * The returned `runs` array records the prompt of each invocation so
 * tests can assert the stream was started exactly once per cycle.
 *
 * @param {Array<any>} events
 * @returns {{
 *   runAgent: (agent: any, prompt: string) => AsyncIterable<any>,
 *   runs: string[],
 * }}
 */
const stubRunAgent = events => {
  /** @type {string[]} */
  const runs = [];
  const runAgent = (
    /** @type {any} */ _agent,
    /** @type {string} */ prompt,
  ) => {
    runs.push(prompt);
    async function* iterate() {
      for (const event of events) {
        yield event;
      }
    }
    return iterate();
  };
  return { runAgent, runs };
};

test('observe — returns undefined when there are no unobserved messages', async t => {
  const { memoryGet, memorySet } = stubTools();
  const { makeAgent, calls } = stubMakeAgent();
  const { runAgent, runs } = stubRunAgent([]);
  const observer = makeObserver({
    memoryGet,
    memorySet,
    makeAgent,
    runAgent,
  });

  const agent = stubAgent([]);
  const result = await observer.observe(/** @type {any} */ (agent));
  t.is(result, undefined);
  t.false(observer.isRunning());
  t.is(calls.length, 0, 'makeAgent should not be called');
  t.is(runs.length, 0, 'runAgent should not be called');
});

test('observe — returns undefined when hwm >= messages.length', async t => {
  const { memoryGet, memorySet } = stubTools();
  const { makeAgent } = stubMakeAgent();
  const { runAgent } = stubRunAgent([
    ...gateSatisfyingEvents(),
    { type: 'Message', role: 'assistant', content: 'ok' },
  ]);
  const observer = makeObserver({
    memoryGet,
    memorySet,
    makeAgent,
    runAgent,
  });

  const agent = stubAgent([
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
  ]);

  // First observation: drain to completion so hwm advances.
  const first = await observer.observe(/** @type {any} */ (agent));
  t.truthy(first);
  // eslint-disable-next-line no-unused-vars
  for await (const _ of /** @type {AsyncIterable<any>} */ (first)) {
    // drain
  }
  t.is(observer.highWaterMark(), agent.state.messages.length);

  // Second observation against the same agent: no new messages, should
  // return undefined.
  const second = await observer.observe(/** @type {any} */ (agent));
  t.is(second, undefined);
});

test('observe — yields events when invoked with unobserved messages', async t => {
  const { memoryGet, memorySet } = stubTools();
  const { makeAgent, calls } = stubMakeAgent();
  const scripted = [
    { type: 'UserMessage', content: 'prompt' },
    ...gateSatisfyingEvents(),
    { type: 'Message', role: 'assistant', content: 'done' },
  ];
  const { runAgent, runs } = stubRunAgent(scripted);
  const observer = makeObserver({
    memoryGet,
    memorySet,
    makeAgent,
    runAgent,
  });

  const agent = stubAgent([{ role: 'user', content: 'remember this' }]);

  const stream = await observer.observe(/** @type {any} */ (agent));
  t.truthy(stream);
  t.true(observer.isRunning(), 'running flag set as soon as observe() returns');

  /** @type {Array<any>} */
  const collected = [];
  for await (const event of /** @type {AsyncIterable<any>} */ (stream)) {
    collected.push(event);
  }

  t.deepEqual(collected, scripted);
  t.is(calls.length, 1, 'makeAgent invoked exactly once');
  t.is(runs.length, 1, 'runAgent invoked exactly once');
});

test('observe — advances hwm and clears running after full drain', async t => {
  const { memoryGet, memorySet } = stubTools();
  const { makeAgent } = stubMakeAgent();
  const { runAgent } = stubRunAgent([
    ...gateSatisfyingEvents(),
    { type: 'Message', role: 'assistant', content: 'noted' },
  ]);
  const observer = makeObserver({
    memoryGet,
    memorySet,
    makeAgent,
    runAgent,
  });

  const agent = stubAgent([
    { role: 'user', content: 'one' },
    { role: 'assistant', content: 'two' },
    { role: 'user', content: 'three' },
  ]);

  t.is(observer.highWaterMark(), 0);

  const stream = await observer.observe(/** @type {any} */ (agent));
  t.truthy(stream);

  // eslint-disable-next-line no-unused-vars
  for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
    // drain
  }

  t.false(observer.isRunning());
  t.is(observer.highWaterMark(), agent.state.messages.length);
});

test('observe — returns undefined while another cycle is running', async t => {
  const { memoryGet, memorySet } = stubTools();
  const { makeAgent } = stubMakeAgent();

  // A runAgent that never yields until we release it — lets us observe the
  // "running" state between start and drain.
  /** @type {(_: any) => void} */
  let release = () => {};
  const gate = new Promise(resolve => {
    release = resolve;
  });

  /**
   * @param {any} _agent
   * @param {any} _prompt
   */
  const runAgent = (_agent, _prompt) => {
    /** @returns {AsyncGenerator<ChatEvent>} */
    async function* iterate() {
      await gate;
      yield { type: 'Message', role: 'assistant', content: 'done' };
    }
    return iterate();
  };

  const observer = makeObserver({
    memoryGet,
    memorySet,
    makeAgent,
    runAgent,
  });

  const agent = stubAgent([{ role: 'user', content: 'hi' }]);

  const first = await observer.observe(/** @type {any} */ (agent));
  t.truthy(first);
  t.true(observer.isRunning());

  // Second call must return undefined while the first is in flight.
  const second = await observer.observe(/** @type {any} */ (agent));
  t.is(second, undefined);

  release(null);
  // eslint-disable-next-line no-unused-vars
  for await (const _ of /** @type {AsyncIterable<any>} */ (first)) {
    // drain to completion
  }

  t.false(observer.isRunning());
});

test('observe — clears running when consumer aborts early', async t => {
  const { memoryGet, memorySet } = stubTools();
  const { makeAgent } = stubMakeAgent();
  const { runAgent } = stubRunAgent([
    { type: 'UserMessage', content: 'one' },
    { type: 'UserMessage', content: 'two' },
    { type: 'UserMessage', content: 'three' },
  ]);
  const observer = makeObserver({
    memoryGet,
    memorySet,
    makeAgent,
    runAgent,
  });

  const agent = stubAgent([
    { role: 'user', content: 'a' },
    { role: 'user', content: 'b' },
  ]);

  const stream = await observer.observe(/** @type {any} */ (agent));
  t.truthy(stream);
  t.true(observer.isRunning());

  // Consume only the first event, then break.
  let seen = 0;
  // eslint-disable-next-line no-unreachable-loop
  for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
    seen += 1;
    break;
  }
  t.is(seen, 1);

  // After `break`, the for-await loop invokes the iterator's `return()`,
  // which runs the `finally` blocks in `runObservation` and `guarded`.
  // `running` must be cleared; `hwm` stays at 0 because the tool-gate
  // was not satisfied (no successful `memorySet` on observations.md)
  // before the abort.  Partial progress that didn't complete a
  // memorySet is discarded on purpose — retrying the same range is
  // safe.
  t.false(observer.isRunning());
  t.is(observer.highWaterMark(), 0);

  // A follow-up observe() should now be allowed to run again rather
  // than being blocked by a stuck `running` flag.
  const followUp = await observer.observe(/** @type {any} */ (agent));
  t.truthy(followUp, 'follow-up observe() is not blocked by the aborted cycle');
  // eslint-disable-next-line no-unreachable-loop
  for await (const _ of /** @type {AsyncIterable<any>} */ (followUp)) {
    break;
  }
  t.false(observer.isRunning());
});

test('observe — searchBackend.sync() is flushed after a run', async t => {
  const { memoryGet, memorySet } = stubTools();
  const { makeAgent } = stubMakeAgent();
  const { runAgent } = stubRunAgent([
    ...gateSatisfyingEvents(),
    { type: 'Message', role: 'assistant', content: 'done' },
  ]);

  let syncCalls = 0;
  /** @type {any} */
  const searchBackend = {
    sync: async () => {
      syncCalls += 1;
    },
  };

  const observer = makeObserver({
    memoryGet,
    memorySet,
    makeAgent,
    runAgent,
    searchBackend,
  });

  const agent = stubAgent([{ role: 'user', content: 'hi' }]);
  const stream = await observer.observe(/** @type {any} */ (agent));
  t.truthy(stream);

  // eslint-disable-next-line no-unused-vars
  for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
    // drain
  }

  t.is(syncCalls, 1);
});

// ---------------------------------------------------------------------------
// makeObserver — subscribe() broadcast hook
// ---------------------------------------------------------------------------

test('subscribe — receives every event from an explicit observe() cycle', async t => {
  const { memoryGet, memorySet } = stubTools();
  const { makeAgent } = stubMakeAgent();
  const scripted = [
    { type: 'UserMessage', content: 'prompt' },
    { type: 'ToolCallStart', toolName: 'memoryGet', args: {} },
    { type: 'ToolCallEnd', toolName: 'memoryGet', result: {} },
    ...gateSatisfyingEvents(),
    { type: 'Message', role: 'assistant', content: 'done' },
  ];
  const { runAgent } = stubRunAgent(scripted);
  const observer = makeObserver({ memoryGet, memorySet, makeAgent, runAgent });

  /** @type {Array<any>} */
  const seen = [];
  const unsubscribe = observer.subscribe(event => {
    seen.push(event);
  });
  t.is(typeof unsubscribe, 'function');

  const agent = stubAgent([{ role: 'user', content: 'hi' }]);
  const stream = await observer.observe(/** @type {any} */ (agent));
  t.truthy(stream);

  // eslint-disable-next-line no-unused-vars
  for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
    // drain
  }

  t.deepEqual(seen, scripted, 'subscriber saw every event in order');
});

test('subscribe — unsubscribe stops further event delivery', async t => {
  const { memoryGet, memorySet } = stubTools();
  const { makeAgent } = stubMakeAgent();
  const scripted = [
    { type: 'UserMessage', content: 'one' },
    { type: 'Message', role: 'assistant', content: 'two' },
  ];
  const { runAgent } = stubRunAgent(scripted);
  const observer = makeObserver({ memoryGet, memorySet, makeAgent, runAgent });

  /** @type {Array<any>} */
  const seen = [];
  const unsubscribe = observer.subscribe(event => {
    seen.push(event);
  });
  unsubscribe();
  // Idempotent:
  unsubscribe();

  const agent = stubAgent([{ role: 'user', content: 'hi' }]);
  const stream = await observer.observe(/** @type {any} */ (agent));
  // eslint-disable-next-line no-unused-vars
  for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
    // drain
  }
  t.is(seen.length, 0, 'unsubscribed handler saw no events');
});

test('subscribe — multiple subscribers each receive every event', async t => {
  const { memoryGet, memorySet } = stubTools();
  const { makeAgent } = stubMakeAgent();
  const scripted = [
    ...gateSatisfyingEvents(),
    { type: 'Message', role: 'assistant', content: 'done' },
  ];
  const { runAgent } = stubRunAgent(scripted);
  const observer = makeObserver({ memoryGet, memorySet, makeAgent, runAgent });

  /** @type {Array<any>} */
  const a = [];
  /** @type {Array<any>} */
  const b = [];
  observer.subscribe(event => a.push(event));
  observer.subscribe(event => b.push(event));

  const agent = stubAgent([{ role: 'user', content: 'hi' }]);
  const stream = await observer.observe(/** @type {any} */ (agent));
  // eslint-disable-next-line no-unused-vars
  for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
    // drain
  }
  t.deepEqual(a, scripted);
  t.deepEqual(b, scripted);
});

test('subscribe — throwing subscriber is isolated from other subscribers', async t => {
  await Promise.resolve();

  const { memoryGet, memorySet } = stubTools();
  const { makeAgent } = stubMakeAgent();
  const scripted = [
    ...gateSatisfyingEvents(),
    { type: 'Message', role: 'assistant', content: 'done' },
  ];
  const { runAgent } = stubRunAgent(scripted);
  // Capture error logs via the injectable `logError` hook so we don't
  // need to mutate the (frozen-under-SES) global console object.
  /** @type {Array<any[]>} */
  const errorCalls = [];
  /** @param {any[]} args */
  const logError = (...args) => {
    errorCalls.push(args);
  };
  const observer = makeObserver({
    memoryGet,
    memorySet,
    makeAgent,
    runAgent,
    logError,
  });

  observer.subscribe(() => {
    throw new Error('kaboom');
  });

  /** @type {Array<any>} */
  const sane = [];
  observer.subscribe(event => sane.push(event));

  const agent = stubAgent([{ role: 'user', content: 'hi' }]);
  const stream = await observer.observe(/** @type {any} */ (agent));

  /** @type {Array<any>} */
  const drained = [];
  for await (const event of /** @type {AsyncIterable<any>} */ (stream)) {
    drained.push(event);
  }

  t.deepEqual(
    drained,
    scripted,
    'stream is not interrupted by a throwing subscriber',
  );
  t.deepEqual(sane, scripted, 'other subscribers continue to receive events');
  t.true(errorCalls.length >= 1, 'throwing subscriber is logged');
});

test('subscribe — automatic trigger (triggerObservation via check) publishes events', async t => {
  const { memoryGet, memorySet } = stubTools();
  const { makeAgent } = stubMakeAgent();
  const scripted = [
    ...gateSatisfyingEvents(),
    { type: 'Message', role: 'assistant', content: 'done' },
  ];
  const { runAgent } = stubRunAgent(scripted);
  const observer = makeObserver({
    memoryGet,
    memorySet,
    makeAgent,
    runAgent,
    // Force a check() to trigger even with tiny messages.
    tokenThreshold: 1,
  });

  /** @type {Array<any>} */
  const seen = [];
  observer.subscribe(event => seen.push(event));

  const agent = stubAgent([
    { role: 'user', content: 'this has enough tokens to trigger' },
  ]);

  observer.check(/** @type {any} */ (agent));
  // check() fires triggerObservation which drains asynchronously; wait for
  // stop() to signal the in-flight cycle has completed.
  await observer.stop();

  t.deepEqual(
    seen,
    scripted,
    'auto-trigger publishes each event to subscribers',
  );
});

// ---------------------------------------------------------------------------
// Follow-ups surfaced during Phase 1 review of TODO/53_genie_obs_bg_stream.md
// ---------------------------------------------------------------------------

test('observe — searchBackend.sync() fires even when consumer aborts early', async t => {
  const { memoryGet, memorySet } = stubTools();
  const { makeAgent } = stubMakeAgent();
  // Multi-event stream so the consumer has something to abort on.
  const { runAgent } = stubRunAgent([
    { type: 'UserMessage', content: 'one' },
    { type: 'UserMessage', content: 'two' },
  ]);

  let syncCalls = 0;
  /** @type {any} */
  const searchBackend = {
    sync: async () => {
      syncCalls += 1;
    },
  };

  const observer = makeObserver({
    memoryGet,
    memorySet,
    makeAgent,
    runAgent,
    searchBackend,
  });

  const agent = stubAgent([{ role: 'user', content: 'hi' }]);
  const stream = await observer.observe(/** @type {any} */ (agent));
  t.truthy(stream);

  // eslint-disable-next-line no-unreachable-loop
  for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
    break;
  }

  t.is(syncCalls, 1, 'searchBackend.sync flushed by runObservation finally');
  t.false(observer.isRunning(), 'running cleared after early abort');
});

test('observe — empty-excerpt short-circuit advances hwm without constructing an agent', async t => {
  const { memoryGet, memorySet } = stubTools();
  const { makeAgent, calls } = stubMakeAgent();
  const { runAgent, runs } = stubRunAgent([
    { type: 'Message', role: 'assistant', content: 'done' },
  ]);
  const observer = makeObserver({
    memoryGet,
    memorySet,
    makeAgent,
    runAgent,
  });

  // Messages whose content serialises to empty text — `serializeMessages`
  // filters them out, producing an empty excerpt.
  const agent = stubAgent([
    { role: 'user', content: '' },
    { role: 'assistant', content: '' },
  ]);

  t.is(observer.highWaterMark(), 0);
  const result = await observer.observe(/** @type {any} */ (agent));
  t.is(result, undefined, 'empty excerpt short-circuits to undefined');
  t.is(
    observer.highWaterMark(),
    agent.state.messages.length,
    'hwm is advanced past the empty range so the next trigger does not re-enter',
  );
  t.false(observer.isRunning());
  t.is(calls.length, 0, 'makeAgent is not invoked for an empty excerpt');
  t.is(runs.length, 0, 'runAgent is not invoked for an empty excerpt');

  // A follow-up observe() against the same agent must return undefined
  // because hwm has caught up — this is the bug the advance prevents.
  const second = await observer.observe(/** @type {any} */ (agent));
  t.is(second, undefined);
});

test('observe — rejects and clears running when makeAgent throws', async t => {
  const { memoryGet, memorySet } = stubTools();
  const boom = new Error('makeAgent kaboom');
  let throwNext = true;
  /** @type {number} */
  let makeAgentCalls = 0;
  /** @param {any} _opts */
  const makeAgent = async _opts => {
    makeAgentCalls += 1;
    if (throwNext) {
      throw boom;
    }
    return { __stub: true };
  };
  const scripted = [{ type: 'Message', role: 'assistant', content: 'done' }];
  const { runAgent, runs } = stubRunAgent(scripted);
  const observer = makeObserver({
    memoryGet,
    memorySet,
    makeAgent,
    runAgent,
  });

  const agent = stubAgent([{ role: 'user', content: 'hi' }]);

  // The failure from makeAgent must surface as a synchronous-looking
  // rejection from observe() rather than a lazy error on first iteration.
  const err = await t.throwsAsync(observer.observe(/** @type {any} */ (agent)));
  t.is(err, boom, 'observe() surfaces the makeAgent error directly');
  t.is(makeAgentCalls, 1);
  t.false(observer.isRunning(), 'running cleared after makeAgent failure');
  t.is(
    observer.highWaterMark(),
    0,
    'hwm is not advanced when no cycle executed',
  );
  t.is(runs.length, 0, 'runAgent never invoked when makeAgent throws');

  // stop() must resolve immediately — the failed cycle unwound inflight.
  await observer.stop();

  // A follow-up observe() on the same observer can now proceed — the
  // failure did not leave the instance stuck.  (hwm advancement depends
  // on the sub-agent successfully writing observations.md, which is not
  // the point of this test.)
  throwNext = false;
  const stream = await observer.observe(/** @type {any} */ (agent));
  t.truthy(stream, 'observer recovers after a transient makeAgent failure');
  // eslint-disable-next-line no-unused-vars
  for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
    // drain
  }
  t.false(observer.isRunning());
});

test('stop — awaits an in-flight observe() stream', async t => {
  const { memoryGet, memorySet } = stubTools();
  const { makeAgent } = stubMakeAgent();

  // A runAgent that parks on a gate — lets us suspend the cycle between
  // `observe()` returning and the first event arriving.
  /** @type {(_: any) => void} */
  let release = () => {};
  const gate = new Promise(resolve => {
    release = resolve;
  });
  /**
   * @param {any} _agent
   * @param {any} _prompt
   */
  const runAgent = (_agent, _prompt) => {
    /** @returns {AsyncGenerator<ChatEvent>} */
    async function* iterate() {
      await gate;
      yield { type: 'Message', role: 'assistant', content: 'done' };
    }
    return iterate();
  };

  const observer = makeObserver({
    memoryGet,
    memorySet,
    makeAgent,
    runAgent,
  });
  const agent = stubAgent([{ role: 'user', content: 'hi' }]);

  const stream = await observer.observe(/** @type {any} */ (agent));
  t.truthy(stream);
  t.true(observer.isRunning());

  // Start draining and stopping concurrently.  stop() must not resolve
  // until the in-flight cycle completes — otherwise a caller that
  // synchronises on `await observer.stop()` would race with the still
  // running sub-agent.
  let drainDone = false;
  const drainP = (async () => {
    // eslint-disable-next-line no-unused-vars
    for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
      // drain to completion
    }
    drainDone = true;
  })();

  let stopResolved = false;
  const stopP = observer.stop().then(() => {
    stopResolved = true;
  });

  // Let the event loop run — both drain and stop should still be parked
  // on the gate / inflight promise respectively.
  await new Promise(resolve => setImmediate(resolve));
  t.false(drainDone, 'drain still parked on gate');
  t.false(stopResolved, 'stop() has not resolved while cycle is in flight');
  t.true(observer.isRunning(), 'observer still running pre-release');

  // Release the gate — drain completes, which triggers the guarded()
  // finally that resolves the inflight promise, which unblocks stop().
  release(null);
  await Promise.all([drainP, stopP]);

  t.true(drainDone);
  t.true(stopResolved);
  t.false(observer.isRunning(), 'running cleared once the cycle finished');
});
