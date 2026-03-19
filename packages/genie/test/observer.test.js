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

import './setup.js';

import test from 'ava';
import {
  estimateUnobservedTokens,
  serializeMessages,
  makeObserver,
  DEFAULT_TOKEN_THRESHOLD,
  DEFAULT_IDLE_DELAY_MS,
  OBSERVER_SYSTEM_PROMPT,
} from '../src/observer/index.js';

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
      content: [
        { type: 'toolCall', name: 'bash', input: { command: 'ls' } },
      ],
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
      content: [
        { type: 'toolResult', result: 'file1.txt' },
      ],
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
