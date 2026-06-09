// @ts-check

// Integration test: drive `@endo/chacha12` as a `fast-check@4`
// `RandomGenerator` via the `randomType` parameter, and validate
// that:
//
// 1. `fast-check` accepts the `ChaCha12Generator` shape directly
//    through `randomType` (i.e. the v8-compatible `next` /
//    `clone` / `getState` surface plugs in without an adapter
//    layer).
// 2. Property-based runs are seed-stable: two runs of the same
//    `fc.assert` call with the same `seed` and `randomType` cover
//    the same shrinking trajectory.
// 3. The keystream `getState()` snapshot can be captured mid-run and
//    a `makeChaCha12FromState`-restored generator continues the same
//    stream that `fast-check` would have observed.

import test from '@endo/ses-ava/test.js';

import fc from 'fast-check';

import {
  makeChaCha12,
  makeChaCha12FromState,
  makeChaCha12RandomType,
} from './_random-type.js';

test('fast-check accepts ChaCha12Generator as a randomType source', t => {
  const randomType = makeChaCha12RandomType();

  // Run a property that always succeeds; the assertion here is that
  // `fast-check` runs to completion against our generator.  If the
  // structural compatibility ever regresses, fast-check will throw
  // at run start (e.g. "next is not a function").
  fc.assert(
    fc.property(fc.integer(), n => Number.isInteger(n)),
    { randomType, seed: 42, numRuns: 100 },
  );
  t.pass();
});

test('fast-check randomType run is reproducible with the same seed', t => {
  const randomType = makeChaCha12RandomType();

  const collect = () => {
    const seen = [];
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), n => {
        seen.push(n);
        return true;
      }),
      { randomType, seed: 12_345, numRuns: 50 },
    );
    return seen;
  };

  const runA = collect();
  const runB = collect();
  t.deepEqual(runA, runB);
  // And not trivial: the generator actually walked the space.
  t.true(runA.length > 1);
});

test('fast-check randomType: different seeds produce different runs', t => {
  const randomType = makeChaCha12RandomType();
  const collect = seed => {
    const seen = [];
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), n => {
        seen.push(n);
        return true;
      }),
      { randomType, seed, numRuns: 50 },
    );
    return seen;
  };
  t.notDeepEqual(collect(1), collect(2));
});

test('fast-check shrinking with chacha12 randomType reaches a stable counterexample', t => {
  // A property that is false for any n > 100; fast-check should
  // shrink toward 101 (or some small value > 100) deterministically
  // given the same seed and randomType.
  const randomType = makeChaCha12RandomType();
  const findCounterexample = () => {
    const distinctResults = new Set();
    const r = fc.check(
      fc.property(fc.integer({ min: 0, max: 1000 }), n => {
        const pass = n <= 100;
        distinctResults.add(pass);
        return pass;
      }),
      { randomType, seed: 7, numRuns: 200 },
    );
    t.deepEqual(
      [...distinctResults].sort(),
      [false, true],
      'fast-check explored the domain',
    );
    return r.failed ? r.counterexample : null;
  };
  const a = findCounterexample();
  const b = findCounterexample();
  t.truthy(a, 'fast-check found a counterexample');
  t.deepEqual(a, b, 'shrinking is deterministic across runs');
});

test('keystream getState round-trip matches the byte stream observed mid-run', t => {
  // Build a generator, advance it through a `fast-check`-style
  // workload (lots of `next()` calls), snapshot, and confirm that
  // a generator restored from the snapshot continues the same
  // int32 stream.
  const randomType = makeChaCha12RandomType();
  const gen = randomType(99);
  // Burn through 250 ints (~ 1000 bytes ~ 16 blocks) so we land
  // mid-block at a position fast-check might naturally reach.
  const prefix = [];
  for (let i = 0; i < 250; i += 1) prefix.push(gen.next());

  const snapshot = gen.getState();
  const restored = makeChaCha12FromState(snapshot);

  // Both `gen` and `restored` should produce the same next 1000
  // ints.
  const tail = [];
  const tailRestored = [];
  for (let i = 0; i < 1000; i += 1) tail.push(gen.next());
  for (let i = 0; i < 1000; i += 1) tailRestored.push(restored.next());
  t.deepEqual(tail, tailRestored);
  // And `prefix` was non-trivial.
  t.true(new Set(prefix).size > 1);
});

test('clone independence under fast-check-style mixed access', t => {
  // Simulates what fast-check's shrinking does internally: take an
  // independent clone of the generator at a chosen point, drain the
  // clone exhaustively, and confirm the original advances exactly as
  // it would have without the clone existing.
  const randomType = makeChaCha12RandomType();
  const reference = randomType(2026);

  const gen = randomType(2026);
  // Drain `gen` past a block boundary into a half-used block.
  const prefix = [];
  for (let i = 0; i < 19; i += 1) prefix.push(gen.next());

  // Clone, then exhaustively drain the clone.
  const cloned = gen.clone();
  const clonedTail = [];
  for (let i = 0; i < 200; i += 1) clonedTail.push(cloned.next());

  // `gen` continuing from the clone point should produce the same
  // 200 ints as the clone did.
  const genTail = [];
  for (let i = 0; i < 200; i += 1) genTail.push(gen.next());
  t.deepEqual(genTail, clonedTail);

  // And the full sequence (prefix + tail) should match a single
  // uninterrupted reference run.
  const refSeq = [];
  for (let i = 0; i < 19 + 200; i += 1) refSeq.push(reference.next());
  t.deepEqual([...prefix, ...genTail], refSeq);
});

test('makeChaCha12 outside the randomType wrapper conforms to the same interface', t => {
  // Sanity: the generator returned by `makeChaCha12` directly (no
  // seed-broadcast wrapper) is also a valid fast-check randomType
  // source.  This documents that fast-check users with their own
  // 32-byte keying material can plug `makeChaCha12(key)` straight
  // in as a one-shot `randomType: () => makeChaCha12(key)` (the
  // `seed` argument is ignored when the generator is pre-keyed).
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) key[i] = i + 1;
  /** @param {number} _seed */
  const oneShotRandomType = _seed => makeChaCha12(key);
  fc.assert(
    fc.property(fc.string(), s => typeof s === 'string'),
    { randomType: oneShotRandomType, seed: 1, numRuns: 50 },
  );
  t.pass();
});
