// @ts-nocheck
/* eslint-disable import/order */

/**
 * Lock tests (F8: OpenFile.lock / getLock).
 *
 * Advisory byte-range locks in-process. Multiple shared locks on the
 * same range may coexist; an exclusive lock conflicts with any other
 * lock at an overlapping range. Locks are released by calling
 * `release()` on the Lock cap (the cap IS the holder).
 */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';

import { makeInMemoryFilesystem } from '../src/in-memory.js';

const openFile = async (root, name) => {
  return E(root).create(name, {});
};

test('exclusive lock blocks a second exclusive lock on the same range', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const f = await openFile(root, 'f');

  const lockA = await E(f).lock({
    type: 'exclusive',
    start: 0n,
    length: 100n,
  });
  t.truthy(lockA);

  await t.throwsAsync(
    () => E(f).lock({ type: 'exclusive', start: 0n, length: 100n }),
    { message: /EAGAIN/ },
  );

  await E(lockA).release();
});

test('shared locks coexist; exclusive conflicts with shared', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const f = await openFile(root, 'f');

  const s1 = await E(f).lock({ type: 'shared', start: 0n, length: 100n });
  const s2 = await E(f).lock({ type: 'shared', start: 0n, length: 100n });
  t.truthy(s1);
  t.truthy(s2);

  await t.throwsAsync(
    () => E(f).lock({ type: 'exclusive', start: 0n, length: 100n }),
    { message: /EAGAIN/ },
  );

  await E(s1).release();
  // Still blocked while s2 holds.
  await t.throwsAsync(
    () => E(f).lock({ type: 'exclusive', start: 0n, length: 100n }),
    { message: /EAGAIN/ },
  );

  await E(s2).release();
  // Now allowed.
  const x = await E(f).lock({ type: 'exclusive', start: 0n, length: 100n });
  await E(x).release();
});

test('non-overlapping ranges are independent', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const f = await openFile(root, 'f');

  const a = await E(f).lock({ type: 'exclusive', start: 0n, length: 50n });
  const b = await E(f).lock({ type: 'exclusive', start: 100n, length: 50n });
  t.truthy(a);
  t.truthy(b);
  await E(a).release();
  await E(b).release();
});

test('release is idempotent', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const f = await openFile(root, 'f');

  const x = await E(f).lock({ type: 'exclusive', start: 0n, length: 1n });
  await E(x).release();
  await E(x).release(); // no error
  // Range is free; another lock succeeds.
  const y = await E(f).lock({ type: 'exclusive', start: 0n, length: 1n });
  await E(y).release();
  t.pass();
});

test('getLock reports an overlapping lock, null when free', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const f = await openFile(root, 'f');

  // No lock yet.
  t.is(await E(f).getLock({ start: 0n, length: 10n }), null);

  const x = await E(f).lock({
    type: 'exclusive',
    start: 5n,
    length: 10n,
  });
  const probe1 = await E(f).getLock({ start: 0n, length: 100n });
  t.truthy(probe1);
  t.is(probe1.type, 'exclusive');
  t.is(probe1.start, 5n);
  t.is(probe1.length, 10n);

  // Non-overlapping probe is null.
  t.is(await E(f).getLock({ start: 100n, length: 50n }), null);

  await E(x).release();
  t.is(await E(f).getLock({ start: 5n, length: 10n }), null);
});

test('length 0 means "to end of file"', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const f = await openFile(root, 'f');

  // Lock the whole file.
  const whole = await E(f).lock({
    type: 'exclusive',
    start: 0n,
    length: 0n,
  });
  // Any range overlaps.
  await t.throwsAsync(
    () => E(f).lock({ type: 'exclusive', start: 5_000_000n, length: 1n }),
    { message: /EAGAIN/ },
  );
  await E(whole).release();
});

test('lock with invalid type rejects', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const f = await openFile(root, 'f');
  await t.throwsAsync(
    () => E(f).lock({ type: 'mandatory', start: 0n, length: 1n }),
    { message: /EINVAL/ },
  );
});
