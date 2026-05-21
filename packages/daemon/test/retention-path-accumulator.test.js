import test from '@endo/ses-ava/prepare-endo.js';
import {
  makeRetentionPathAccumulator,
  pathKey,
} from '../src/retention-path-accumulator.js';

/** @import { RetentionPath } from '../src/graph.js' */

/** @param {string} v */
const id = v => /** @type {any} */ (v);

/**
 * Build a simple two-segment path for a single member.
 *
 * @param {string} member
 * @param {string} root
 * @param {string[]} labels
 * @returns {RetentionPath}
 */
const makePath = (member, root, labels) => [
  { groupMembers: [id(member)] },
  {
    groupMembers: [id(root)],
    referencedBy: id(root),
    labels,
    type: /** @type {'root'} */ ('root'),
  },
];

/**
 * Create a manual flush scheduler for testing.
 */
const makeManualScheduler = () => {
  /** @type {Array<() => void>} */
  const pending = [];
  const scheduleBatch = (/** @type {() => void} */ fn) => {
    pending.push(fn);
  };
  const flushAll = () => {
    while (pending.length > 0) {
      const fn = /** @type {() => void} */ (pending.shift());
      fn();
    }
  };
  return { scheduleBatch, flushAll };
};

test('pathKey is stable across equal paths and diffs unequal paths', t => {
  const a = makePath('m1', 'r1', ['pet:foo']);
  const aDup = makePath('m1', 'r1', ['pet:foo']);
  const b = makePath('m1', 'r1', ['pet:bar']);
  t.is(pathKey(a), pathKey(aDup));
  t.not(pathKey(a), pathKey(b));
});

// `isValidName` in `packages/daemon/src/pet-name.js` allows pet
// names containing commas, pipes, and most other punctuation;
// only `/`, `\0`, `@`, `.`, and `..` are forbidden. A separator
// that *could* appear inside a pet name (such as `,` or `|`)
// would let two distinct label lists hash to the same key:
// for example `['pet:foo,pet:bar']` vs `['pet:foo', 'pet:bar']`
// both join to `"pet:foo,pet:bar"`. The accumulator's diff
// would then drop a real addition or removal whenever the pet
// name in question contained the separator. The implementation
// uses `\0` as the separator, which `isValidName` rejects, so
// the keys must differ.
test('pathKey does not collide when a pet name contains a comma', t => {
  // Two distinct label lists that would collide under a `,`-joined
  // key: one label `pet:foo,pet:bar` vs two labels `pet:foo` and
  // `pet:bar`. The first names a single, comma-containing pet name;
  // the second names two distinct pet names.
  const single = makePath('m', 'r', ['pet:foo,pet:bar']);
  const split = makePath('m', 'r', ['pet:foo', 'pet:bar']);
  t.not(
    pathKey(single),
    pathKey(split),
    'comma in a pet name must not alias two-label encoding',
  );
});

test('pathKey does not collide when a pet name contains a pipe', t => {
  // Same concern at the cross-segment level: a pipe-containing
  // pet name in one segment must not alias a segment break.
  const single = makePath('m', 'r', ['pet:foo|pet:bar']);
  const split = makePath('m', 'r', ['pet:foo', 'pet:bar']);
  t.not(
    pathKey(single),
    pathKey(split),
    'pipe in a pet name must not alias the segment separator',
  );
});

test('first delta is the snapshot', async t => {
  /** @type {RetentionPath[]} */
  const compute1 = [makePath('m1', 'r1', ['pet:foo'])];
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionPathAccumulator({
    compute: () => compute1,
    scheduleBatch,
  });

  const iter = acc.subscribe();
  flushAll();
  const { value } = await iter.next();
  t.truthy(value.snapshot);
  t.is(value.snapshot.length, 1);
  t.is(value.snapshot[0][0].groupMembers[0], 'm1');
});

test('empty snapshot still emits snapshot delta', async t => {
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionPathAccumulator({
    compute: () => [],
    scheduleBatch,
  });

  const iter = acc.subscribe();
  flushAll();
  const { value } = await iter.next();
  t.truthy(value.snapshot);
  t.deepEqual(value.snapshot, []);
});

test('subsequent emissions are diffs', async t => {
  /** @type {RetentionPath[]} */
  let current = [makePath('m1', 'r1', ['pet:foo'])];
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionPathAccumulator({
    compute: () => current,
    scheduleBatch,
  });

  const iter = acc.subscribe();
  flushAll();
  await iter.next(); // snapshot

  current = [
    makePath('m1', 'r1', ['pet:foo']),
    makePath('m1', 'r2', ['pet:bar']),
  ];
  acc.notify();
  flushAll();

  const { value } = await iter.next();
  t.falsy(value.snapshot);
  t.is(value.added.length, 1);
  t.is(value.removed.length, 0);
  t.is(value.added[0][1].groupMembers[0], 'r2');
});

test('removed path appears in removed list', async t => {
  /** @type {RetentionPath[]} */
  let current = [
    makePath('m1', 'r1', ['pet:foo']),
    makePath('m1', 'r2', ['pet:bar']),
  ];
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionPathAccumulator({
    compute: () => current,
    scheduleBatch,
  });
  const iter = acc.subscribe();
  flushAll();
  await iter.next(); // snapshot

  current = [makePath('m1', 'r1', ['pet:foo'])];
  acc.notify();
  flushAll();

  const { value } = await iter.next();
  t.is(value.added.length, 0);
  t.is(value.removed.length, 1);
  t.is(value.removed[0][1].groupMembers[0], 'r2');
});

test('multiple notify() calls coalesce into one delta', async t => {
  let computeCount = 0;
  let current = [makePath('m1', 'r1', ['pet:foo'])];
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionPathAccumulator({
    compute: () => {
      computeCount += 1;
      return current;
    },
    scheduleBatch,
  });

  const iter = acc.subscribe();
  flushAll();
  await iter.next(); // snapshot (compute call 1)
  t.is(computeCount, 1);

  // Burst of notifications before flush: only one compute call.
  current = [
    makePath('m1', 'r1', ['pet:foo']),
    makePath('m1', 'r2', ['pet:bar']),
  ];
  acc.notify();
  acc.notify();
  acc.notify();
  flushAll();
  await iter.next();
  t.is(computeCount, 2, 'three notify() calls produce one compute()');
});

// End-to-end pet-name-with-separator regression: if `pathKey` had
// used `,` as its separator, the second compute (one path labeled
// `pet:foo,pet:bar`) would have aliased the first compute (two
// paths labeled `pet:foo` and `pet:bar`). The accumulator would
// then suppress the diff and the consumer would never learn that
// the path set actually changed shape. The separator is `\0`, so
// the diff fires.
test('accumulator emits a diff when a comma-pet-name path replaces a two-label path', async t => {
  /** @type {RetentionPath[]} */
  let current = [
    makePath('m', 'r1', ['pet:foo']),
    makePath('m', 'r2', ['pet:bar']),
  ];
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionPathAccumulator({
    compute: () => current,
    scheduleBatch,
  });
  const iter = acc.subscribe();
  flushAll();
  await iter.next(); // snapshot

  // Replace with a single path whose single label contains a
  // comma. Under a comma-joined key both states would key the
  // same and the diff would be empty.
  current = [makePath('m', 'r1', ['pet:foo,pet:bar'])];
  acc.notify();
  flushAll();

  const { value } = await iter.next();
  t.falsy(value.snapshot);
  const addedLen = /** @type {number} */ (value.added.length);
  const removedLen = /** @type {number} */ (value.removed.length);
  t.true(
    addedLen > 0 || removedLen > 0,
    'a separator-containing label must not alias a multi-label path',
  );
});

test('late subscribers receive a synthetic snapshot first', async t => {
  /** @type {RetentionPath[]} */
  const stable = [makePath('m1', 'r1', ['pet:foo'])];
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionPathAccumulator({
    compute: () => stable,
    scheduleBatch,
  });

  // First subscriber primes the accumulator.
  const first = acc.subscribe();
  flushAll();
  const firstFirst = await first.next();
  t.truthy(firstFirst.value.snapshot, 'first subscriber receives snapshot');
  t.is(firstFirst.value.snapshot.length, 1);

  // Second subscriber arrives after priming. Without the late-
  // subscriber path it would receive nothing until the next diff;
  // with it, it receives the same snapshot synthetically.
  const second = acc.subscribe();
  flushAll();
  const secondFirst = await second.next();
  t.truthy(secondFirst.value.snapshot, 'late subscriber receives snapshot');
  t.is(secondFirst.value.snapshot.length, 1);
  t.is(secondFirst.value.snapshot[0][0].groupMembers[0], 'm1');
});

test('no-change recompute emits no diff delta', async t => {
  const stable = [makePath('m1', 'r1', ['pet:foo'])];
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionPathAccumulator({
    compute: () => stable,
    scheduleBatch,
  });

  const iter = acc.subscribe();
  flushAll();
  await iter.next(); // snapshot

  // Recompute with identical output: no delta should publish.
  acc.notify();
  flushAll();

  // Race the next() against a microtask delay; should still be pending.
  const racer = Promise.race([
    iter.next().then(() => 'next-resolved'),
    Promise.resolve().then(() => Promise.resolve().then(() => 'timeout')),
  ]);
  t.is(await racer, 'timeout');
});
