// @ts-check

/**
 * Tests for the reflector module.
 *
 * These tests exercise the reflector's pure logic (constants, shape,
 * concurrency guard, file token estimation) without requiring a live
 * LLM connection.  The `makePiAgent` call inside `runReflection` is
 * not invoked in unit tests — integration tests that hit a real model
 * belong in a separate suite.
 */

import '@endo/harden';
import test from 'ava';

import {
  makeReflector,
  REFLECTOR_SYSTEM_PROMPT,
  DEFAULT_REFLECTION_THRESHOLD,
  estimateFileTokens,
} from '../src/reflector/index.js';

/** @import { ChatEvent } from '../src/agent/index.js' */

// ---------------------------------------------------------------------------
// Helpers
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

// Gate-satisfying events: the reflector's `makeToolGate` requires a
// successful `memorySet` call for both observations.md and
// reflections.md before it considers the cycle "done".  Tests that
// want the retry loop to complete in a single round include these
// events in their scripted event list.
const OBSERVATION_PATH = 'memory/observations.md';
const REFLECTION_PATH = 'memory/reflections.md';

/**
 * Scripted events that satisfy the reflector's tool-gate.  Pre-pend or
 * concatenate with test-specific events as needed.
 *
 * @returns {ChatEvent[]}
 */
const gateSatisfyingEvents = () => [
  {
    type: 'ToolCallStart',
    toolName: 'memorySet',
    args: { path: OBSERVATION_PATH },
  },
  { type: 'ToolCallEnd', toolName: 'memorySet', result: { success: true } },
  {
    type: 'ToolCallStart',
    toolName: 'memorySet',
    args: { path: REFLECTION_PATH },
  },
  { type: 'ToolCallEnd', toolName: 'memorySet', result: { success: true } },
];

/**
 * Build minimal memoryGet / memorySet / memorySearch tool stubs.
 *
 * @returns {{ memoryGet: any, memorySet: any, memorySearch: any, store: Map<string, string> }}
 */
const stubTools = () => {
  /** @type {Map<string, string>} */
  const store = new Map();

  const memoryGet = {
    desc: () => 'Reads a memory file.',
    execute: async (/** @type {{ path: string }} */ { path }) => {
      const content = store.get(path);
      if (content === undefined) {
        throw new Error(`File not found: ${path}`);
      }
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

  const memorySearch = {
    desc: () => 'Searches memory files.',
    execute: async (/** @type {{ query: string }} */ _opts) => ({
      success: true,
      query: _opts.query,
      limit: 5,
      results: [],
    }),
  };

  return { memoryGet, memorySet, memorySearch, store };
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test('DEFAULT_REFLECTION_THRESHOLD is 40000', t => {
  t.is(DEFAULT_REFLECTION_THRESHOLD, 40_000);
});

test('REFLECTOR_SYSTEM_PROMPT is a non-empty string', t => {
  t.true(typeof REFLECTOR_SYSTEM_PROMPT === 'string');
  t.true(REFLECTOR_SYSTEM_PROMPT.length > 100);
});

test('REFLECTOR_SYSTEM_PROMPT mentions observations.md', t => {
  t.true(REFLECTOR_SYSTEM_PROMPT.includes('observations.md'));
});

test('REFLECTOR_SYSTEM_PROMPT mentions reflections.md', t => {
  t.true(REFLECTOR_SYSTEM_PROMPT.includes('reflections.md'));
});

test('REFLECTOR_SYSTEM_PROMPT mentions profile.md', t => {
  t.true(REFLECTOR_SYSTEM_PROMPT.includes('profile.md'));
});

// ---------------------------------------------------------------------------
// estimateFileTokens
// ---------------------------------------------------------------------------

test('estimateFileTokens — returns token estimate for existing file', async t => {
  const { memoryGet, store } = stubTools();
  // 400 chars / 4 = 100 tokens
  store.set('memory/observations.md', 'x'.repeat(400));
  const count = await estimateFileTokens(memoryGet, 'memory/observations.md');
  t.is(count, 100);
});

test('estimateFileTokens — returns 0 for missing file', async t => {
  const { memoryGet } = stubTools();
  const count = await estimateFileTokens(memoryGet, 'memory/nonexistent.md');
  t.is(count, 0);
});

test('estimateFileTokens — returns 0 for empty file', async t => {
  const { memoryGet, store } = stubTools();
  store.set('memory/observations.md', '');
  const count = await estimateFileTokens(memoryGet, 'memory/observations.md');
  t.is(count, 0);
});

// ---------------------------------------------------------------------------
// makeReflector — structure and guards
// ---------------------------------------------------------------------------

test('makeReflector — returns an object with the expected methods', t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    workspaceDir: '/dev/null',
  });

  t.is(typeof reflector.run, 'function');
  t.is(typeof reflector.checkAndRun, 'function');
  t.is(typeof reflector.reflect, 'function');
  t.is(typeof reflector.stop, 'function');
  t.is(typeof reflector.isRunning, 'function');
});

test('makeReflector — initial state is not running', t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    workspaceDir: '/dev/null',
  });

  t.false(reflector.isRunning());
});

test('makeReflector — stop resolves when nothing is running', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    workspaceDir: '/dev/null',
  });

  await reflector.stop();
  t.pass();
});

test('makeReflector — checkAndRun returns false below threshold', async t => {
  const { memoryGet, memorySet, memorySearch, store } = stubTools();

  // 100 chars / 4 = 25 tokens, well below 40k default
  store.set('memory/observations.md', 'a'.repeat(100));

  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    workspaceDir: '/dev/null',
  });
  const triggered = await reflector.checkAndRun();
  t.false(triggered);
});

test('makeReflector — checkAndRun returns false when file missing', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();

  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    workspaceDir: '/dev/null',
  });
  const triggered = await reflector.checkAndRun();
  t.false(triggered);
});

test('makeReflector — accepts custom reflectionThreshold', t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();

  // Should not throw
  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    reflectionThreshold: 10_000,
    workspaceDir: '/dev/null',
  });
  t.truthy(reflector);
});

test('makeReflector — accepts custom model option', t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();

  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    model: 'anthropic/claude-sonnet',
    workspaceDir: '/dev/null',
  });
  t.truthy(reflector);
});

// ---------------------------------------------------------------------------
// makeReflector — reflect() streaming API
// ---------------------------------------------------------------------------

test('reflect — yields events from the reflector sub-agent', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
  const { makeAgent, calls } = stubMakeAgent();
  const scripted = [
    { type: 'UserMessage', content: 'prompt' },
    ...gateSatisfyingEvents(),
    { type: 'Message', role: 'assistant', content: 'done' },
  ];
  const { runAgent, runs } = stubRunAgent(scripted);

  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    makeAgent,
    runAgent,
    workspaceDir: '/dev/null',
  });

  const stream = await reflector.reflect();
  t.truthy(stream);
  t.true(
    reflector.isRunning(),
    'running flag set as soon as reflect() returns',
  );

  /** @type {Array<any>} */
  const collected = [];
  for await (const event of /** @type {AsyncIterable<any>} */ (stream)) {
    collected.push(event);
  }

  t.deepEqual(collected, scripted);
  t.is(calls.length, 1, 'makeAgent invoked exactly once');
  t.is(runs.length, 1, 'runAgent invoked exactly once');
});

test('reflect — clears running after the stream is fully drained', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
  const { makeAgent } = stubMakeAgent();
  const { runAgent } = stubRunAgent([
    ...gateSatisfyingEvents(),
    { type: 'Message', role: 'assistant', content: 'done' },
  ]);

  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    makeAgent,
    runAgent,
    workspaceDir: '/dev/null',
  });

  const stream = await reflector.reflect();
  t.truthy(stream);
  t.true(reflector.isRunning());

  // eslint-disable-next-line no-unused-vars
  for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
    // drain
  }

  t.false(reflector.isRunning());

  // stop() should resolve promptly once the in-flight cycle has finished.
  await reflector.stop();
  t.pass();
});

test('reflect — returns undefined while another cycle is running', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
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

  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    makeAgent,
    runAgent,
    workspaceDir: '/dev/null',
  });

  const first = await reflector.reflect();
  t.truthy(first);
  t.true(reflector.isRunning());

  // Second call must return undefined while the first is in flight.
  const second = await reflector.reflect();
  t.is(second, undefined);

  release(null);
  // eslint-disable-next-line no-unused-vars
  for await (const _ of /** @type {AsyncIterable<any>} */ (first)) {
    // drain to completion
  }

  t.false(reflector.isRunning());
});

test('reflect — clears running when consumer aborts early', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
  const { makeAgent } = stubMakeAgent();
  const { runAgent } = stubRunAgent([
    { type: 'UserMessage', content: 'one' },
    { type: 'UserMessage', content: 'two' },
    { type: 'UserMessage', content: 'three' },
  ]);

  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    makeAgent,
    runAgent,
    workspaceDir: '/dev/null',
  });

  const stream = await reflector.reflect();
  t.truthy(stream);
  t.true(reflector.isRunning());
  // Consume only the first event, then break.
  let seen = 0;
  // eslint-disable-next-line no-unreachable-loop
  for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
    seen += 1;
    break;
  }
  t.is(seen, 1);

  // After `break`, the for-await loop invokes the iterator's `return()`,
  // which runs the `finally` blocks in `runReflection` and `guarded`.
  // The `running` flag must be cleared so subsequent reflections can run.
  t.false(reflector.isRunning());

  // A follow-up reflect() should now be allowed to start rather than be
  // blocked by a stuck `running` flag.
  const followUp = await reflector.reflect();
  t.truthy(followUp);
  for await (const _ of /** @type {AsyncIterable<any>} */ (followUp)) {
    // drain
  }
  t.false(reflector.isRunning());
});

test('reflect — searchBackend.sync() is flushed after a run', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
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

  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    makeAgent,
    runAgent,
    searchBackend,
    workspaceDir: '/dev/null',
  });

  const stream = await reflector.reflect();
  t.truthy(stream);

  // eslint-disable-next-line no-unused-vars
  for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
    // drain
  }

  t.is(syncCalls, 1);
});

test('reflect — searchBackend.sync() fires even when consumer aborts early', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
  const { makeAgent } = stubMakeAgent();
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

  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    makeAgent,
    runAgent,
    searchBackend,
    workspaceDir: '/dev/null',
  });

  const stream = await reflector.reflect();
  t.truthy(stream);

  // eslint-disable-next-line no-unreachable-loop
  for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
    break;
  }
  t.is(syncCalls, 1, 'searchBackend.sync flushed by runReflection finally');
});

// ---------------------------------------------------------------------------
// makeReflector — run() silent-drain behaviour (heartbeat path)
// ---------------------------------------------------------------------------

test('run — silently drains the underlying reflect() stream', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
  const { makeAgent, calls } = stubMakeAgent();
  const { runAgent, runs } = stubRunAgent([
    { type: 'UserMessage', content: 'prompt' },
    ...gateSatisfyingEvents(),
    { type: 'Message', role: 'assistant', content: 'done' },
  ]);

  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    makeAgent,
    runAgent,
    workspaceDir: '/dev/null',
  });

  await reflector.run();

  t.false(reflector.isRunning());
  t.is(calls.length, 1, 'makeAgent invoked exactly once per cycle');
  t.is(runs.length, 1, 'runAgent invoked exactly once per cycle');
});

test('run — skips work when a reflection is already running', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
  const { makeAgent, calls } = stubMakeAgent();

  /** @type {(_: any) => void} */
  let release = () => {};
  const gate = new Promise(resolve => {
    release = resolve;
  });
  /** @type {string[]} */
  const runs = [];
  /**
   * @param {any} _agent
   * @param {any} prompt
   */
  const runAgent = (_agent, prompt) => {
    runs.push(prompt);
    /** @returns {AsyncGenerator<ChatEvent>} */
    async function* iterate() {
      await gate;
      for (const event of gateSatisfyingEvents()) {
        yield event;
      }
      yield { type: 'Message', role: 'assistant', content: 'done' };
    }
    return iterate();
  };

  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    makeAgent,
    runAgent,
    workspaceDir: '/dev/null',
  });

  // Start a cycle via reflect() and leave it in flight.
  const first = await reflector.reflect();
  t.truthy(first);
  t.true(reflector.isRunning());

  // Kick off background drain so `runAgent` actually gets invoked — the
  // underlying generator is lazy and would otherwise never call
  // runAgent until the consumer starts iterating.  The drain will
  // suspend on `await gate` inside `iterate()` until we `release()`
  // below.
  const drain = (async () => {
    // eslint-disable-next-line no-unused-vars
    for await (const _ of /** @type {AsyncIterable<any>} */ (first)) {
      // intentionally empty
    }
  })();

  // Yield the microtask queue so the first `runAgent` call records
  // itself in `runs` before we inspect it.
  await Promise.resolve();
  await Promise.resolve();
  t.is(runs.length, 1, 'first cycle has started runAgent');

  // Concurrent run() should no-op (not construct a new agent / stream).
  await reflector.run();
  t.is(calls.length, 1, 'makeAgent still only invoked for the first cycle');
  t.is(runs.length, 1, 'runAgent still only invoked for the first cycle');

  release(null);
  await drain;
  t.false(reflector.isRunning());
});

test('checkAndRun — triggers run() when threshold is exceeded', async t => {
  const { memoryGet, memorySet, memorySearch, store } = stubTools();
  const { makeAgent, calls } = stubMakeAgent();
  const { runAgent, runs } = stubRunAgent([
    ...gateSatisfyingEvents(),
    { type: 'Message', role: 'assistant', content: 'done' },
  ]);

  // 4000 chars / 4 = 1000 tokens; threshold 100 → triggered.
  store.set('memory/observations.md', 'x'.repeat(4000));

  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    makeAgent,
    runAgent,
    reflectionThreshold: 100,
    workspaceDir: '/dev/null',
  });

  const triggered = await reflector.checkAndRun();
  t.true(triggered);
  t.false(reflector.isRunning());
  t.is(calls.length, 1, 'makeAgent invoked by the triggered run');
  t.is(runs.length, 1, 'runAgent invoked by the triggered run');
});

// ---------------------------------------------------------------------------
// makeReflector — reflect() / run() failure paths
// ---------------------------------------------------------------------------

test('reflect — rejects and clears running when makeAgent throws', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
  const boom = new Error('makeAgent kaboom');
  let throwNext = true;
  /** @type {number} */
  let makeAgentCalls = 0;
  const makeAgent = async (/** @type {any} */ _opts) => {
    makeAgentCalls += 1;
    if (throwNext) {
      throw boom;
    }
    return { __stub: true };
  };
  const scripted = [{ type: 'Message', role: 'assistant', content: 'done' }];
  const { runAgent, runs } = stubRunAgent(scripted);
  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    makeAgent,
    runAgent,
    workspaceDir: '/dev/null',
  });

  // The failure from makeAgent must surface as a synchronous-looking
  // rejection from reflect() rather than a lazy error on first iteration.
  const err = await t.throwsAsync(reflector.reflect());
  t.is(err, boom, 'reflect() surfaces the makeAgent error directly');
  t.is(makeAgentCalls, 1);
  t.false(reflector.isRunning(), 'running cleared after makeAgent failure');
  t.is(runs.length, 0, 'runAgent never invoked when makeAgent throws');

  // stop() must resolve immediately — the failed cycle unwound inflight.
  await reflector.stop();

  // A follow-up reflect() on the same reflector can now proceed — the
  // failure did not leave the instance stuck.
  throwNext = false;
  const stream = await reflector.reflect();
  t.truthy(stream, 'reflector recovers after a transient makeAgent failure');
  // eslint-disable-next-line no-unused-vars
  for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
    // drain
  }
  t.false(reflector.isRunning());
});

test('run — swallows and logs errors from a rejecting reflect()', async t => {
  await Promise.resolve();

  const { memoryGet, memorySet, memorySearch } = stubTools();
  const boom = new Error('makeAgent kaboom');
  /** @type {number} */
  let makeAgentCalls = 0;
  const makeAgent = async (/** @type {any} */ _opts) => {
    makeAgentCalls += 1;
    throw boom;
  };
  const { runAgent, runs } = stubRunAgent([
    { type: 'Message', role: 'assistant', content: 'done' },
  ]);
  // Capture error logs via the injectable `logError` hook so we don't
  // need to mutate the (frozen-under-SES) global console object.
  /** @type {Array<any[]>} */
  const errorCalls = [];
  /** @param {any[]} args */
  const logError = (...args) => {
    errorCalls.push(args);
  };
  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    makeAgent,
    runAgent,
    workspaceDir: '/dev/null',
    logError,
  });

  // run() must swallow the reflect() rejection — a thrown heartbeat
  // cycle cannot be allowed to crash the surrounding loop.
  await t.notThrowsAsync(reflector.run());

  t.is(makeAgentCalls, 1);
  t.is(runs.length, 0, 'runAgent never invoked when reflect() rejects');
  t.false(reflector.isRunning(), 'running cleared after the rejection');
  t.true(errorCalls.length >= 1, 'run() logged the swallowed error');
  t.true(
    errorCalls.some(args => args.includes(boom)),
    'logged error payload includes the original cause',
  );
});

// ---------------------------------------------------------------------------
// makeReflector — subscribe() broadcast hook
// ---------------------------------------------------------------------------

test('subscribe — receives every event from an explicit reflect() cycle', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
  const { makeAgent } = stubMakeAgent();
  const scripted = [
    { type: 'UserMessage', content: 'prompt' },
    { type: 'ToolCallStart', toolName: 'memoryGet', args: {} },
    { type: 'ToolCallEnd', toolName: 'memoryGet', result: {} },
    ...gateSatisfyingEvents(),
    { type: 'Message', role: 'assistant', content: 'done' },
  ];
  const { runAgent } = stubRunAgent(scripted);
  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    makeAgent,
    runAgent,
    workspaceDir: '/dev/null',
  });

  /** @type {Array<any>} */
  const seen = [];
  const unsubscribe = reflector.subscribe(event => {
    seen.push(event);
  });
  t.is(typeof unsubscribe, 'function');

  const stream = await reflector.reflect();
  t.truthy(stream);
  // eslint-disable-next-line no-unused-vars
  for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
    // drain
  }

  t.deepEqual(seen, scripted, 'subscriber saw every event in order');
});

test('subscribe — unsubscribe stops further event delivery', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
  const { makeAgent } = stubMakeAgent();
  const scripted = [
    { type: 'UserMessage', content: 'one' },
    { type: 'Message', role: 'assistant', content: 'two' },
  ];
  const { runAgent } = stubRunAgent(scripted);
  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    makeAgent,
    runAgent,
    workspaceDir: '/dev/null',
  });

  /** @type {Array<any>} */
  const seen = [];
  const unsubscribe = reflector.subscribe(event => {
    seen.push(event);
  });
  unsubscribe();
  // Idempotent:
  unsubscribe();

  const stream = await reflector.reflect();
  // eslint-disable-next-line no-unused-vars
  for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
    // drain
  }
  t.is(seen.length, 0, 'unsubscribed handler saw no events');
});

test('subscribe — multiple subscribers each receive every event', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
  const { makeAgent } = stubMakeAgent();
  const scripted = [
    ...gateSatisfyingEvents(),
    { type: 'Message', role: 'assistant', content: 'done' },
  ];
  const { runAgent } = stubRunAgent(scripted);
  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    makeAgent,
    runAgent,
    workspaceDir: '/dev/null',
  });

  /** @type {Array<any>} */
  const a = [];
  /** @type {Array<any>} */
  const b = [];
  reflector.subscribe(event => a.push(event));
  reflector.subscribe(event => b.push(event));

  const stream = await reflector.reflect();
  // eslint-disable-next-line no-unused-vars
  for await (const _ of /** @type {AsyncIterable<any>} */ (stream)) {
    // drain
  }
  t.deepEqual(a, scripted);
  t.deepEqual(b, scripted);
});

test('subscribe — throwing subscriber is isolated from other subscribers', async t => {
  await Promise.resolve();

  const { memoryGet, memorySet, memorySearch } = stubTools();
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
  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    makeAgent,
    runAgent,
    workspaceDir: '/dev/null',
    logError,
  });

  reflector.subscribe(() => {
    throw new Error('kaboom');
  });

  /** @type {Array<any>} */
  const sane = [];
  reflector.subscribe(event => sane.push(event));

  const stream = await reflector.reflect();

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

test('subscribe — automatic run() publishes events to subscribers', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
  const { makeAgent } = stubMakeAgent();
  const scripted = [
    ...gateSatisfyingEvents(),
    { type: 'Message', role: 'assistant', content: 'done' },
  ];
  const { runAgent } = stubRunAgent(scripted);
  const reflector = makeReflector({
    memoryGet,
    memorySet,
    memorySearch,
    makeAgent,
    runAgent,
    workspaceDir: '/dev/null',
  });

  /** @type {Array<any>} */
  const seen = [];
  reflector.subscribe(event => seen.push(event));

  await reflector.run();

  t.deepEqual(
    seen,
    scripted,
    'auto-trigger publishes each event to subscribers',
  );
});
