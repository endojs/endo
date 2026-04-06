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

import './setup.js';

import test from 'ava';
import {
  makeReflector,
  REFLECTOR_SYSTEM_PROMPT,
  DEFAULT_REFLECTION_THRESHOLD,
  estimateFileTokens,
} from '../src/reflector/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build minimal memoryGet / memorySet / memorySearch tool stubs.
 *
 * @returns {{ memoryGet: any, memorySet: any, memorySearch: any }}
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
  const reflector = makeReflector({ memoryGet, memorySet, memorySearch });

  t.is(typeof reflector.run, 'function');
  t.is(typeof reflector.checkAndRun, 'function');
  t.is(typeof reflector.stop, 'function');
  t.is(typeof reflector.isRunning, 'function');
});

test('makeReflector — initial state is not running', t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
  const reflector = makeReflector({ memoryGet, memorySet, memorySearch });

  t.false(reflector.isRunning());
});

test('makeReflector — stop resolves when nothing is running', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();
  const reflector = makeReflector({ memoryGet, memorySet, memorySearch });

  await reflector.stop();
  t.pass();
});

test('makeReflector — checkAndRun returns false below threshold', async t => {
  const { memoryGet, memorySet, memorySearch, store } = stubTools();

  // 100 chars / 4 = 25 tokens, well below 40k default
  store.set('memory/observations.md', 'a'.repeat(100));

  const reflector = makeReflector({ memoryGet, memorySet, memorySearch });
  const triggered = await reflector.checkAndRun();
  t.false(triggered);
});

test('makeReflector — checkAndRun returns false when file missing', async t => {
  const { memoryGet, memorySet, memorySearch } = stubTools();

  const reflector = makeReflector({ memoryGet, memorySet, memorySearch });
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
  });
  t.truthy(reflector);
});
