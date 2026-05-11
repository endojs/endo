// @ts-check

/**
 * Tests for the shared tool-gate helper.
 *
 * The gate is consumed by the observer and reflector sub-agents; the
 * tests here cover both call-site shapes (single-path and multi-path
 * `memorySet`) and include regression cases for the three bugs
 * documented in `PLAN/genie_loop_architecture.md` § "Tool gate".
 */

import '@endo/harden';

import test from 'ava';
import {
  makeToolCallStart,
  makeToolCallEnd,
  makeMessage,
  makeThinking,
} from '../src/agent/index.js';
import { makeToolGate } from '../src/agent/tool-gate.js';

// ---------------------------------------------------------------------------
// Construction / shape
// ---------------------------------------------------------------------------

test('makeToolGate — returns the documented API', t => {
  const gate = makeToolGate({
    memorySet: { argKey: 'path', expected: ['a'] },
  });
  t.is(typeof gate.done, 'function');
  t.is(typeof gate.update, 'function');
  t.is(typeof gate.pending, 'function');
  t.is(typeof gate.reset, 'function');
});

test('makeToolGate — empty spec is immediately done', t => {
  const gate = makeToolGate({});
  t.true(gate.done());
  t.deepEqual(Array.from(gate.pending()), []);
});

test('makeToolGate — fresh gate is not done and lists every expected pair as pending', t => {
  const gate = makeToolGate({
    memorySet: { argKey: 'path', expected: ['obs.md', 'refl.md'] },
  });
  t.false(gate.done());
  t.deepEqual(Array.from(gate.pending()), [
    ['memorySet', 'obs.md'],
    ['memorySet', 'refl.md'],
  ]);
});

// ---------------------------------------------------------------------------
// Single-path (observer) call-site shape
// ---------------------------------------------------------------------------

test('single-path — ToolCallStart + ToolCallEnd marks the expected value done', t => {
  const gate = makeToolGate({
    memorySet: { argKey: 'path', expected: ['memory/observations.md'] },
  });

  gate.update(
    makeToolCallStart('memorySet', { path: 'memory/observations.md' }),
  );
  t.false(gate.done(), 'not done until ToolCallEnd');

  gate.update(makeToolCallEnd('memorySet', { success: true }));
  t.true(gate.done(), 'done once the matching End arrives');
  t.deepEqual(Array.from(gate.pending()), []);
});

test('single-path — ToolCallStart with an unknown path is ignored', t => {
  const gate = makeToolGate({
    memorySet: { argKey: 'path', expected: ['memory/observations.md'] },
  });

  gate.update(makeToolCallStart('memorySet', { path: 'memory/other.md' }));
  gate.update(makeToolCallEnd('memorySet', { success: true }));
  t.false(gate.done(), 'foreign path must not satisfy the gate');
  t.deepEqual(Array.from(gate.pending()), [
    ['memorySet', 'memory/observations.md'],
  ]);
});

// ---------------------------------------------------------------------------
// Multi-path (reflector) call-site shape
// ---------------------------------------------------------------------------

test('multi-path — both expected values must complete before done()', t => {
  const OBS = 'memory/observations.md';
  const REFL = 'memory/reflections.md';
  const gate = makeToolGate({
    memorySet: { argKey: 'path', expected: [OBS, REFL] },
  });

  gate.update(makeToolCallStart('memorySet', { path: OBS }));
  gate.update(makeToolCallEnd('memorySet', { success: true }));
  t.false(gate.done(), 'one of two pairs still pending');
  t.deepEqual(Array.from(gate.pending()), [['memorySet', REFL]]);

  gate.update(makeToolCallStart('memorySet', { path: REFL }));
  gate.update(makeToolCallEnd('memorySet', { success: true }));
  t.true(gate.done());
});

test('multi-path — failed ToolCallEnd does not record the call as done', t => {
  const gate = makeToolGate({
    memorySet: { argKey: 'path', expected: ['obs.md', 'refl.md'] },
  });

  gate.update(makeToolCallStart('memorySet', { path: 'obs.md' }));
  gate.update(makeToolCallEnd('memorySet', null, new Error('disk full')));
  t.false(gate.done());
  t.deepEqual(Array.from(gate.pending()), [
    ['memorySet', 'obs.md'],
    ['memorySet', 'refl.md'],
  ]);

  // A retry of the same path must still be reachable.
  gate.update(makeToolCallStart('memorySet', { path: 'obs.md' }));
  gate.update(makeToolCallEnd('memorySet', { success: true }));
  t.deepEqual(Array.from(gate.pending()), [['memorySet', 'refl.md']]);
});

// ---------------------------------------------------------------------------
// Regression: bug 1 — typeof check (argVal === 'string' was a no-op)
// ---------------------------------------------------------------------------

test('bug-1 regression — successful call is actually recorded', t => {
  // The pre-fix implementation used `argVal === 'string' && argVal`,
  // which compared the argument value literally to the string
  // `'string'` and therefore never recorded anything.  The fixed
  // implementation must record the call when the argument value is a
  // string that matches an expected entry.
  const gate = makeToolGate({
    memorySet: { argKey: 'path', expected: ['memory/observations.md'] },
  });

  gate.update(
    makeToolCallStart('memorySet', { path: 'memory/observations.md' }),
  );
  gate.update(makeToolCallEnd('memorySet', { success: true }));
  t.true(gate.done(), 'gate recognises the successful call');
});

// ---------------------------------------------------------------------------
// Regression: bug 2 — lookup in per-tool map, not outer did map
// ---------------------------------------------------------------------------

test('bug-2 regression — argument lookup uses the per-tool map', t => {
  // A path value equal to the outer tool name ('memorySet') would
  // previously spuriously satisfy `args[argName] in did` because `did`
  // keyed on tool names.  The fixed implementation must reject it.
  const gate = makeToolGate({
    memorySet: { argKey: 'path', expected: ['memory/observations.md'] },
  });

  gate.update(makeToolCallStart('memorySet', { path: 'memorySet' }));
  gate.update(makeToolCallEnd('memorySet', { success: true }));
  t.false(gate.done(), 'bogus path matching a tool-name key is rejected');
  t.deepEqual(Array.from(gate.pending()), [
    ['memorySet', 'memory/observations.md'],
  ]);
});

// ---------------------------------------------------------------------------
// Regression: bug 3 — default branch does not clobber in-flight state
// ---------------------------------------------------------------------------

test('bug-3 regression — intervening Message does not clear in-flight doing-state', t => {
  const gate = makeToolGate({
    memorySet: { argKey: 'path', expected: ['memory/observations.md'] },
  });

  gate.update(
    makeToolCallStart('memorySet', { path: 'memory/observations.md' }),
  );
  // Simulate a chat event arriving between Start and End — the
  // previous implementation would clear `doing` here.
  gate.update(makeMessage('assistant', 'thinking about writing…'));
  gate.update(makeThinking('thinking', 'step-by-step'));
  gate.update(makeToolCallEnd('memorySet', { success: true }));
  t.true(
    gate.done(),
    'intervening Message/Thinking must not lose the matching ToolCallEnd',
  );
});

// ---------------------------------------------------------------------------
// JSON-encoded args
// ---------------------------------------------------------------------------

test('update — parses string-encoded JSON args', t => {
  const gate = makeToolGate({
    memorySet: { argKey: 'path', expected: ['memory/observations.md'] },
  });

  gate.update(
    makeToolCallStart(
      'memorySet',
      JSON.stringify({ path: 'memory/observations.md' }),
    ),
  );
  gate.update(makeToolCallEnd('memorySet', { success: true }));
  t.true(gate.done(), 'JSON-string args are parsed transparently');
});

test('update — malformed JSON string args are ignored safely', t => {
  const gate = makeToolGate({
    memorySet: { argKey: 'path', expected: ['memory/observations.md'] },
  });

  gate.update(makeToolCallStart('memorySet', '{ not valid json'));
  gate.update(makeToolCallEnd('memorySet', { success: true }));
  t.false(gate.done());
  t.deepEqual(Array.from(gate.pending()), [
    ['memorySet', 'memory/observations.md'],
  ]);
});

// ---------------------------------------------------------------------------
// Unknown tool names
// ---------------------------------------------------------------------------

test('update — events for tools outside the spec are ignored', t => {
  const gate = makeToolGate({
    memorySet: { argKey: 'path', expected: ['memory/observations.md'] },
  });

  gate.update(
    makeToolCallStart('memoryGet', { path: 'memory/observations.md' }),
  );
  gate.update(makeToolCallEnd('memoryGet', { success: true }));
  t.false(gate.done(), 'only spec-listed tools advance the gate');
});

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

test('reset — clears in-flight doing state but preserves recorded completions', t => {
  const gate = makeToolGate({
    memorySet: { argKey: 'path', expected: ['a.md', 'b.md'] },
  });

  // Record one completed pair.
  gate.update(makeToolCallStart('memorySet', { path: 'a.md' }));
  gate.update(makeToolCallEnd('memorySet', { success: true }));
  t.deepEqual(Array.from(gate.pending()), [['memorySet', 'b.md']]);

  // Start a call we're about to abandon mid-flight.
  gate.update(makeToolCallStart('memorySet', { path: 'b.md' }));
  gate.reset();

  // A ToolCallEnd after reset should NOT be paired with the abandoned
  // Start — the in-flight state was cleared.
  gate.update(makeToolCallEnd('memorySet', { success: true }));
  t.false(gate.done(), 'reset drops abandoned in-flight state');
  t.deepEqual(Array.from(gate.pending()), [['memorySet', 'b.md']]);

  // But the completed pair from before reset() is still recorded.
  gate.update(makeToolCallStart('memorySet', { path: 'b.md' }));
  gate.update(makeToolCallEnd('memorySet', { success: true }));
  t.true(gate.done());
});
