// @ts-nocheck
/* eslint-disable import/order */

/**
 * Coverage for the small pure helpers in `src/shared/` and a few
 * cas / readonly edge cases that the integration tests did not
 * exercise. Each test names the specific branch or function it
 * pins so a regression points back at its target without ambiguity.
 */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import {
  rangesOverlap,
  assertChildName,
  computeOpenMode,
  makeNotSupported,
  toSafeNumber,
} from '../src/shared/helpers.js';
import { makeLockTable } from '../src/shared/lock-table.js';
import { makeMemoryCas } from '../src/cas.js';
import { makeInMemoryFilesystem } from '../src/in-memory.js';
import { readOnly } from '../src/readonly.js';
import { namespace } from '../src/compose.js';

// ---------- rangesOverlap (pure) ----------

test('rangesOverlap: a unbounded, b bounded — b within or past a.start', t => {
  const a = { start: 10n, length: 0n }; // [10, ∞)
  t.true(rangesOverlap(a, { start: 5n, length: 100n }), 'crosses a.start');
  t.false(rangesOverlap(a, { start: 0n, length: 5n }), 'ends before a.start');
  t.false(rangesOverlap(a, { start: 0n, length: 10n }), 'ends at a.start');
});

test('rangesOverlap: b unbounded, a bounded — covers the b-unbounded branch', t => {
  const b = { start: 50n, length: 0n }; // [50, ∞)
  t.true(rangesOverlap({ start: 0n, length: 100n }, b), 'a crosses b.start');
  t.false(rangesOverlap({ start: 0n, length: 50n }, b), 'a ends at b.start');
  t.false(rangesOverlap({ start: 0n, length: 25n }, b), 'a ends before b');
});

test('rangesOverlap: both unbounded always overlap', t => {
  t.true(
    rangesOverlap({ start: 0n, length: 0n }, { start: 1000n, length: 0n }),
  );
});

test('rangesOverlap: bounded vs bounded, half-open semantics', t => {
  const a = { start: 0n, length: 10n }; // [0, 10)
  const b = { start: 10n, length: 5n }; // [10, 15)
  t.false(rangesOverlap(a, b), 'adjacent ranges do not overlap');
  t.true(
    rangesOverlap(a, { start: 9n, length: 2n }),
    'overlap by one byte counts',
  );
});

// ---------- assertChildName ----------

test('assertChildName: non-string rejects with EINVAL', t => {
  t.throws(() => assertChildName(undefined), { message: /EINVAL/ });
  t.throws(() => assertChildName(null), { message: /EINVAL/ });
  t.throws(() => assertChildName(42), { message: /EINVAL/ });
});

test('assertChildName: empty string rejects', t => {
  t.throws(() => assertChildName(''), { message: /EINVAL/ });
});

test('assertChildName: "." and ".." reserved', t => {
  t.throws(() => assertChildName('.'), { message: /reserved/ });
  t.throws(() => assertChildName('..'), { message: /reserved/ });
});

test('assertChildName: slash or NUL rejects', t => {
  t.throws(() => assertChildName('a/b'), { message: /path separator/ });
  t.throws(() => assertChildName('a\0b'), { message: /path separator/ });
});

test('assertChildName: plain names accepted', t => {
  t.notThrows(() => assertChildName('hello'));
  t.notThrows(() => assertChildName('with space'));
});

// ---------- computeOpenMode ----------

test('computeOpenMode: append implies write', t => {
  const m = computeOpenMode({ append: true });
  t.true(m.write);
  t.true(m.append);
});

test('computeOpenMode: truncate implies write', t => {
  const m = computeOpenMode({ truncate: true });
  t.true(m.write);
  t.true(m.truncate);
});

test('computeOpenMode: default (no flags) is read', t => {
  const m = computeOpenMode({});
  t.true(m.read);
  t.false(m.write);
});

test('computeOpenMode: read:false + no write rejects with EINVAL', t => {
  // A handle with neither read nor write is useless; reject
  // rather than silently flip a flag the caller didn't request.
  t.throws(() => computeOpenMode({ read: false }), { message: /EINVAL/ });
});

test('computeOpenMode: write:true + read:false honors explicit read suppression', t => {
  const m = computeOpenMode({ write: true, read: false });
  t.false(m.read);
  t.true(m.write);
});

// ---------- toSafeNumber ----------

test('toSafeNumber: bigint within range converts', t => {
  t.is(toSafeNumber(0n, 'x'), 0);
  t.is(toSafeNumber(42n, 'x'), 42);
  t.is(
    toSafeNumber(BigInt(Number.MAX_SAFE_INTEGER), 'x'),
    Number.MAX_SAFE_INTEGER,
  );
});

test('toSafeNumber: negative bigint rejects with EINVAL', t => {
  t.throws(() => toSafeNumber(-1n, 'offset'), {
    message: /EINVAL.*offset.*non-negative/,
  });
});

test('toSafeNumber: bigint past Number.MAX_SAFE_INTEGER rejects', t => {
  const huge = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
  t.throws(() => toSafeNumber(huge, 'length'), {
    message: /EINVAL.*length.*MAX_SAFE_INTEGER/,
  });
});

test('toSafeNumber: number safe-integer accepted', t => {
  t.is(toSafeNumber(0, 'x'), 0);
  t.is(toSafeNumber(123, 'x'), 123);
});

test('toSafeNumber: non-integer or negative number rejects', t => {
  t.throws(() => toSafeNumber(1.5, 'offset'), { message: /EINVAL/ });
  t.throws(() => toSafeNumber(-1, 'offset'), { message: /EINVAL/ });
  t.throws(() => toSafeNumber(Number.NaN, 'offset'), { message: /EINVAL/ });
  t.throws(() => toSafeNumber(Number.POSITIVE_INFINITY, 'offset'), {
    message: /EINVAL/,
  });
});

test('toSafeNumber: non-bigint/non-number rejects with type message', t => {
  t.throws(() => toSafeNumber('42', 'offset'), {
    message: /EINVAL.*offset.*bigint or number/,
  });
  t.throws(() => toSafeNumber(undefined, 'offset'), {
    message: /EINVAL.*offset.*bigint or number/,
  });
  t.throws(() => toSafeNumber(null, 'offset'), {
    message: /EINVAL.*offset.*bigint or number/,
  });
});

// ---------- makeNotSupported ----------

test('makeNotSupported: bound factory tags ENOSYS with the backing description', t => {
  const NotSupported = makeNotSupported('test-backing');
  const e = NotSupported('flush');
  t.regex(e.message, /ENOSYS/);
  t.regex(e.message, /flush/);
  t.regex(e.message, /test-backing/);
});

// ---------- lock-table ----------

test('lock-table: invalid type rejects with EINVAL', t => {
  const lt = makeLockTable();
  t.throws(
    () => lt.acquire('k', { type: 'mandatory', start: 0n, length: 1n }),
    {
      message: /EINVAL/,
    },
  );
});

test('lock-table: opts defaults — undefined opts treated as exclusive zero-range? no, type required', t => {
  const lt = makeLockTable();
  // Missing type → EINVAL even with no opts.
  t.throws(() => lt.acquire('k', undefined), { message: /EINVAL/ });
  t.throws(() => lt.acquire('k', {}), { message: /EINVAL/ });
});

test('lock-table: start/length default to 0n', t => {
  const lt = makeLockTable();
  // Explicit zero range "to end of file" via length:0n.
  const lock = lt.acquire('k', { type: 'exclusive' });
  // Probing any other range hits the held lock.
  const hit = lt.probe('k', { start: 5n, length: 1n });
  t.truthy(hit);
  t.is(hit.type, 'exclusive');
  // Release returns the slot.
  return E(lock)
    .release()
    .then(() => {
      t.is(lt.probe('k', { start: 5n, length: 1n }), null);
    });
});

test('lock-table: probe on a never-locked key returns null', t => {
  const lt = makeLockTable();
  t.is(lt.probe('never', { start: 0n, length: 100n }), null);
});

// ---------- cas.has + invalid info ----------

test('cas: has() returns false on a miss and true after put', t => {
  const cas = makeMemoryCas();
  const info = { algorithm: 'sha256', hash: 'abc', size: 0n };
  t.false(cas.has(info));
  cas.put(info, new Uint8Array());
  t.true(cas.has(info));
});

test('cas: put with non-string algorithm rejects', t => {
  const cas = makeMemoryCas();
  t.throws(
    () => cas.put({ algorithm: 42, hash: 'abc', size: 0n }, new Uint8Array()),
    {
      message: /CAS/,
    },
  );
});

test('cas: get with non-string hash rejects', t => {
  const cas = makeMemoryCas();
  t.throws(() => cas.get({ algorithm: 'sha256', hash: 42, size: 0n }), {
    message: /CAS/,
  });
});

// ---------- readonly attenuator: named + help passthroughs ----------

test('readOnly: Filesystem.named forwards to the wrapped fs and attenuates', async t => {
  const a = makeInMemoryFilesystem();
  const ns = namespace({ a });
  const ro = readOnly(ns);
  // namespace's named() returns the underlying root for the matching key.
  const dir = await E(ro).named('a');
  // The returned directory is the readOnly attenuator: mutating
  // verbs reject.
  await t.throwsAsync(() => E(dir).mkdir('x', {}), { message: /EACCES/ });
});

test('readOnly: help(method) on every attenuator surface returns a no-doc string', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await E(root)
    .create('f', {})
    .then(o => E(o).close());

  const ro = readOnly(fs);
  const rRoot = await E(ro).root();
  const file = await E(rRoot).lookup('f');
  const oh = await E(file).open({ read: true });
  const xattrs = await E(file).xattrs();

  // Filesystem
  t.regex(await E(ro).help('whatever'), /No documentation/);
  // Directory
  t.regex(await E(rRoot).help('whatever'), /No documentation/);
  // File
  t.regex(await E(file).help('whatever'), /No documentation/);
  // OpenFile
  t.regex(await E(oh).help('whatever'), /No documentation/);
  // Xattrs
  t.regex(await E(xattrs).help('whatever'), /No documentation/);

  // Undefined argument returns the descriptive body (the other branch).
  t.regex(await E(ro).help(), /read-only attenuator/);
  t.regex(await E(rRoot).help(), /read-only attenuator/);
  t.regex(await E(file).help(), /read-only attenuator/);
  t.regex(await E(oh).help(), /read-only attenuator/);
  t.regex(await E(xattrs).help(), /read-only attenuator/);

  await E(oh).close();
});

test('readOnly: Directory.list cursor returns the underlying entries', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await E(root)
    .create('a', {})
    .then(o => E(o).close());
  await E(root).mkdir('d', {});

  const ro = readOnly(fs);
  const rRoot = await E(ro).root();
  const cursor = await E(rRoot).list();
  const entries = [];
  for await (const e of iterateReader(await E(cursor).stream())) {
    entries.push(e.name);
  }
  t.deepEqual(entries.sort(), ['a', 'd']);
});

// ---------- readonly: getQid forwarding (read-side) ----------

test('readOnly: getQid is a synchronous forward on Directory and File', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await E(root)
    .create('f', {})
    .then(o => E(o).close());
  await E(root).mkdir('d', {});

  const ro = readOnly(fs);
  const rRoot = await E(ro).root();
  // The attenuator's getQid forwards to the wrapped exo. Since
  // `rRoot` is a local exo (same vat), the call is synchronous.
  const rootQid = rRoot.getQid();
  t.is(rootQid.type, 'directory');

  const subDir = await E(rRoot).lookup('d');
  t.is(subDir.getQid().type, 'directory');

  const file = await E(rRoot).lookup('f');
  t.is(file.getQid().type, 'file');
});

// ---------- lock-table: shared probe semantics ----------

test('lock-table: shared lock visible to a probe', async t => {
  const lt = makeLockTable();
  const lock = lt.acquire('k', { type: 'shared', start: 0n, length: 10n });
  const hit = lt.probe('k', { start: 5n, length: 1n });
  t.truthy(hit);
  t.is(hit.type, 'shared');
  await E(lock).release();
});

test('lock-table: Lock.help (default body and method-arg fallback)', async t => {
  const lt = makeLockTable();
  const lock = lt.acquire('k', { type: 'exclusive', start: 0n, length: 1n });
  const body = await E(lock).help();
  t.regex(body, /advisory range lock/);
  const fallback = await E(lock).help('whatever');
  t.regex(fallback, /No documentation/);
  await E(lock).release();
});

// ---------- blobref.help ----------

test('BlobRef.help (default body and method-arg fallback)', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const oh = await E(root).create('b', {});
  await E(oh).close();
  const file = await E(root).lookup('b');
  const blob = await E(file).snapshot();
  t.regex(await E(blob).help(), /BlobRef/);
  t.regex(await E(blob).help('whatever'), /No documentation/);
});
