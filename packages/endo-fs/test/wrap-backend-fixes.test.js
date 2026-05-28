// @ts-nocheck
/* eslint-disable no-await-in-loop */
/* global setTimeout */
/**
 * Regression tests for the post-migration audit fixes.
 *
 * Each test pins down a specific bug or contract violation that the
 * code-review pass found in the FsBackend seam refactor.
 */

import '@endo/init/debug.js';

import test from 'ava';
import { E, Far } from '@endo/far';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';

import { wrapBackend } from '../src/wrap-backend.js';
import { makeFromMountBackend } from '../src/backends/from-mount-backend.js';
import { makeInMemoryFilesystem } from '../src/in-memory.js';

const utf8 = s => new TextEncoder().encode(s);
const fromUtf8 = b => new TextDecoder().decode(b);

const writeBytes = async (writerRef, bytes) => {
  const w = iterateBytesWriter(writerRef);
  await w.next(bytes);
  await w.return();
};

const drainReader = async readerRef => {
  const chunks = [];
  let total = 0;
  for await (const c of iterateBytesReader(readerRef)) {
    chunks.push(c);
    total += c.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
};

const drainEvents = async (events, timeoutMs = 1000) => {
  const out = [];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const next = events.next();
    const sleep = new Promise(resolve =>
      setTimeout(() => resolve({ kind: 'timeout' }), 50),
    );
    const res = await Promise.race([
      next.then(r => ({ kind: 'value', r })),
      sleep,
    ]);
    if (res.kind === 'timeout') break;
    if (res.r.done) {
      out.push({ done: true });
      break;
    }
    out.push(res.r.value);
  }
  return out;
};

/**
 * Build a minimal FsBackend over a `Map<string, { kind, bytes? }>` —
 * the shape lets us construct stripped-down backends (no setStat, no
 * watch, etc.) for the contract tests below.
 *
 * @param {object} opts
 */
const makeStubBackend = opts => {
  const recs = new Map();
  recs.set('', { kind: 'directory' });
  const keyOf = path => path.join('\0');

  const base = {
    async kind(path) {
      const r = recs.get(keyOf(path));
      return r ? r.kind : undefined;
    },
    async *list(_dirPath) {
      // empty; this stub backend doesn't enumerate
    },
    async read(path) {
      const r = recs.get(keyOf(path));
      return r && r.bytes ? r.bytes : new Uint8Array(0);
    },
    /**
     * @param {string[]} path
     * @param {Uint8Array} bytes
     * @param {bigint} [offset]
     */
    async write(path, bytes, offset) {
      const off = offset === undefined ? 0 : Number(offset);
      let r = recs.get(keyOf(path));
      if (!r) {
        r = { kind: 'file', bytes: new Uint8Array(0) };
        recs.set(keyOf(path), r);
      }
      const needed = off + bytes.length;
      let buf = /** @type {Uint8Array} */ (r.bytes);
      if (needed > buf.length) {
        const grown = new Uint8Array(needed);
        grown.set(buf, 0);
        buf = grown;
      }
      buf.set(bytes, off);
      r.bytes = buf;
    },
    async makeDirectory(path) {
      recs.set(keyOf(path), { kind: 'directory' });
    },
    async remove(path) {
      recs.delete(keyOf(path));
    },
  };
  return harden({ ...base, ...(opts || {}) });
};

// ---------- Fix #20: rename fires child-removed / child-added ----------

test('rename fires child-removed on src parent and child-added on dst parent', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await E(root).mkdir('a', {});
  await E(root).mkdir('b', {});
  const subA = await E(root).lookup('a');
  const subB = await E(root).lookup('b');
  const oh = await E(subA).create('thing', {});
  await E(oh).close();

  // Subscribe to both parent watchers BEFORE the rename so we see
  // the event vocabulary.
  const watcherA = await E(subA).watch();
  const eventsA = iterateReader(await E(watcherA).events());
  const watcherB = await E(subB).watch();
  const eventsB = iterateReader(await E(watcherB).events());
  t.teardown(() => E(watcherA).cancel());
  t.teardown(() => E(watcherB).cancel());

  await E(subA).rename('thing', subB, 'moved');

  const aEvents = await drainEvents(eventsA);
  const bEvents = await drainEvents(eventsB);

  // src parent gets child-removed (the legacy 'remove' vocabulary
  // is the bug this test pins down).
  t.true(
    aEvents.some(e => e.kind === 'child-removed' && e.name === 'thing'),
    `expected child-removed/thing in subA events, got ${JSON.stringify(
      aEvents,
    )}`,
  );
  for (const e of aEvents) {
    t.not(
      e.kind,
      'remove',
      `bare 'remove' kind is the bug — got ${JSON.stringify(e)}`,
    );
    t.not(
      e.kind,
      'add',
      `bare 'add' kind is the bug — got ${JSON.stringify(e)}`,
    );
  }
  // dst parent gets child-added.
  t.true(
    bEvents.some(e => e.kind === 'child-added' && e.name === 'moved'),
    `expected child-added/moved in subB events, got ${JSON.stringify(bEvents)}`,
  );
});

// ---------- Fix #22: watcher pump closes subscribers on backend error ----------

test('watcher unblocks pending consumers when the backend iterator errors', async t => {
  t.timeout(2_000);

  // A backend whose `watch` iterator throws on first next(). The
  // pump must surface the failure as a stream-done so subscribers
  // don't deadlock.
  const watchErroringBackend = makeStubBackend({
    watch(_path) {
      const iter = {
        async next() {
          throw Error('synthetic backend watch failure');
        },
        async return(v) {
          return { done: true, value: v };
        },
        [Symbol.asyncIterator]() {
          return iter;
        },
      };
      return iter;
    },
  });

  const fs = wrapBackend(watchErroringBackend);
  const root = await E(fs).root();
  const watcher = await E(root).watch();
  const events = iterateReader(await E(watcher).events());

  // The first .next() should observe the stream done — the pump
  // saw the backend error and closed the watcher (no hang).
  const sleep = new Promise(resolve =>
    setTimeout(() => resolve({ kind: 'TIMEOUT' }), 1500),
  );
  const step = await Promise.race([events.next(), sleep]);
  t.not(step.kind, 'TIMEOUT', 'consumer hung when backend watch errored');
  t.true(step.done, `expected done, got ${JSON.stringify(step)}`);
});

// ---------- Fix #23: File.write rejects truncating overwrite without setStat ----------

test('File.write({}) throws ENOSYS when backend lacks setStat (no silent tail-leak)', async t => {
  // Backend without setStat — wrap-backend can't truncate the
  // file's tail, so it must refuse the whole-file overwrite
  // rather than silently leaving the original tail.
  const noStatBackend = makeStubBackend({});

  const fs = wrapBackend(noStatBackend);
  const root = await E(fs).root();
  // Create a file with 10 bytes so we have a tail to potentially leak.
  const oh = await E(root).create('w', {});
  await writeBytes(await E(oh).write(0n), utf8('0123456789'));
  await E(oh).close();

  const file = await E(root).lookup('w');
  // File.write() with no opts is the whole-file overwrite porcelain;
  // without backend.setStat we can't truncate the tail. Must throw
  // at call time (before the caller pushes any bytes into a sink
  // that wouldn't honor the contract).
  await t.throwsAsync(() => E(file).write(), { message: /ENOSYS/ });

  // Sanity: the file is untouched.
  const reader = await E(file).read();
  const bytes = await drainReader(reader);
  t.is(fromUtf8(bytes), '0123456789', 'file should not have been mutated');
});

test('File.write({offset}) (pwrite) still works without setStat', async t => {
  // The setStat requirement is only for the truncating
  // whole-file path. With an explicit offset, no truncate is
  // implied; the write must proceed.
  const noStatBackend = makeStubBackend({});

  const fs = wrapBackend(noStatBackend);
  const root = await E(fs).root();
  const oh = await E(root).create('w', {});
  await writeBytes(await E(oh).write(0n), utf8('AAAAAAAAAA'));
  await E(oh).close();
  const file = await E(root).lookup('w');
  // pwrite at offset 2 should succeed even without setStat.
  await writeBytes(await E(file).write({ offset: 2n }), utf8('XX'));
  const bytes = await drainReader(await E(file).read());
  t.is(fromUtf8(bytes), 'AAXXAAAAAA');
});

// ---------- Fix #19: from-mount resolve re-raises non-ENOENT errors ----------

test('from-mount backend re-raises non-ENOENT errors from Mount.lookup', async t => {
  // A Mount that throws a non-ENOENT error (e.g. a CapTP connection
  // failure or permission error) must surface as an error, not as
  // "file not found." Otherwise the consumer can't tell a real
  // failure from a missing file.
  const failingMount = Far('FailingMount', {
    async lookup(_path) {
      throw Error('EIO: simulated I/O failure');
    },
    async list() {
      return [];
    },
  });

  const backend = makeFromMountBackend(failingMount);
  // kind() calls resolve() — which should re-raise EIO, not
  // swallow it as undefined.
  await t.throwsAsync(() => backend.kind(['anywhere']), { message: /EIO/ });
});

test('from-mount backend still treats ENOENT as undefined from kind()', async t => {
  // Sanity: an ENOENT-shaped error stays handled as "not found,"
  // matching POSIX semantics that callers can build on.
  const enoentMount = Far('EnoentMount', {
    async lookup(_path) {
      throw Error('ENOENT: missing entry');
    },
    async list() {
      return [];
    },
  });

  const backend = makeFromMountBackend(enoentMount);
  const k = await backend.kind(['somewhere']);
  t.is(k, undefined);
});

// ---------- Copilot review: explicit mtime preserved over size touch ----------

test('File.setStat({size, mtime}) preserves the caller-supplied mtime (no touch clobber)', async t => {
  // Bug: when both size and mtime were provided, the code first
  // set st.mtime = patch.mtime, then unconditionally called
  // touch(path, {mtime: true}) — which clobbered the caller's
  // mtime with "now."
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const oh = await E(root).create('clobber.txt', {});
  await writeBytes(await E(oh).write(0n), utf8('hello'));
  await E(oh).close();

  const file = await E(root).lookup('clobber.txt');
  const explicit = 12345n; // some explicit ns-since-epoch timestamp
  await E(file).setStat({ size: 3n, mtime: explicit });

  const attrs = await E(file).getAttrs();
  t.is(attrs.mtime, explicit, 'explicit mtime should win over touch');
  t.is(attrs.size, 3n);
});

// ---------- Copilot review: read updates atime, write updates mtime ----------

test('OpenFile.read updates atime; OpenFile.write updates mtime', async t => {
  // Bug: the comment on statTable claimed OpenFile.read/write
  // touched atime/mtime, but the call sites didn't actually invoke
  // touch(). So getAttrs returned stale timestamps after I/O.
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const oh0 = await E(root).create('touchy.txt', {});
  await writeBytes(await E(oh0).write(0n), utf8('initial'));
  await E(oh0).close();

  const file = await E(root).lookup('touchy.txt');
  const baseline = await E(file).getAttrs();

  // Force a clock tick — wall-clock granularity on some hosts is
  // ms; the touch() call uses Date.now() * 1_000_000n. A few ms
  // of sleep is enough to ensure the new ns timestamp differs.
  await new Promise(r => setTimeout(r, 5));

  // Read updates atime, not mtime.
  const oh = await E(file).open({ read: true, write: true });
  await drainReader(await E(oh).read(0n, 7n));
  const afterRead = await E(file).getAttrs();
  t.true(
    /** @type {bigint} */ (afterRead.atime) >
      /** @type {bigint} */ (baseline.atime),
    'read should bump atime',
  );
  t.is(afterRead.mtime, baseline.mtime, 'read should not bump mtime');

  await new Promise(r => setTimeout(r, 5));

  // Write updates mtime.
  await writeBytes(await E(oh).write(0n), utf8('changed'));
  const afterWrite = await E(file).getAttrs();
  t.true(
    /** @type {bigint} */ (afterWrite.mtime) >
      /** @type {bigint} */ (afterRead.mtime),
    'write should bump mtime',
  );

  await E(oh).close();
});

// ---------- Review #4a: backend.getStat preferred over vat-local ----------

test('wrap-backend prefers backend.getStat over the vat-local stat table', async t => {
  // Backend.getStat returns explicit timestamps; wrap-backend's
  // File.getStat must surface those rather than the vat-local
  // "first observation" defaults. This is the disk-truth pathway
  // that node-fs relies on.
  const explicitMtime = 999_888_777_000_000_000n;
  const explicitAtime = 111_222_333_000_000_000n;
  const backend = makeStubBackend({
    async getStat(path) {
      const r = path.join('/');
      if (r === 'tagged') {
        return harden({
          size: 5n,
          mtime: explicitMtime,
          atime: explicitAtime,
        });
      }
      throw Error(`ENOENT: ${r}`);
    },
  });
  const fs = wrapBackend(backend);
  const root = await E(fs).root();
  const oh = await E(root).create('tagged', {});
  await writeBytes(await E(oh).write(0n), utf8('hello'));
  await E(oh).close();

  const file = await E(root).lookup('tagged');
  const stat = await E(file).getStat();
  t.is(stat.mtime, explicitMtime, 'should use backend.getStat mtime');
  t.is(stat.atime, explicitAtime, 'should use backend.getStat atime');
  t.is(stat.size, 5n);
});

// ---------- Review #4b: stat/xattr tables invalidated on remove ----------

test('Directory.remove cleans up xattr / stat table entries', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const oh = await E(root).create('ghost', {});
  await writeBytes(await E(oh).write(0n), utf8('alive'));
  await E(oh).close();
  const file = await E(root).lookup('ghost');

  // Set an xattr.
  await writeBytes(
    await E(await E(file).xattrs()).set('user.tag', {}),
    utf8('ghost-tag'),
  );

  // Remove the file.
  await E(root).remove('ghost');

  // Recreate at the same path.
  const oh2 = await E(root).create('ghost', {});
  await writeBytes(await E(oh2).write(0n), utf8('reborn'));
  await E(oh2).close();
  const file2 = await E(root).lookup('ghost');

  // The new file should NOT inherit the predecessor's xattr.
  const xattrs2 = await E(file2).xattrs();
  await t.throwsAsync(() => E(xattrs2).get('user.tag'), {
    message: /ENODATA/,
  });
});

// ---------- Review #4b: stat/xattr tables transplant on rename ----------

test('Directory.rename moves xattr / stat table entries to the new path', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const oh = await E(root).create('alpha', {});
  await writeBytes(await E(oh).write(0n), utf8('content'));
  await E(oh).close();
  const before = await E(root).lookup('alpha');
  await writeBytes(
    await E(await E(before).xattrs()).set('user.tag', {}),
    utf8('preserved'),
  );

  await E(root).rename('alpha', root, 'beta');

  // Xattr should now be readable on the new path.
  const renamed = await E(root).lookup('beta');
  const back = await drainReader(
    await E(await E(renamed).xattrs()).get('user.tag'),
  );
  t.is(fromUtf8(back), 'preserved');

  // And not present on the old path (a fresh create there would be
  // ENODATA, not the inherited tag).
  await t.throwsAsync(() => E(root).lookup('alpha'), { message: /ENOENT/ });
});

// ---------- Review #11a / #9e: from-mount list() re-raises non-ENOENT ----------

test('from-mount list() re-raises non-ENOENT errors from per-child lookup', async t => {
  // A Mount whose top-level list() returns names but whose
  // per-child lookup throws EIO. The old implementation silently
  // dropped the entry; the fix re-raises so consumers see the
  // real failure.
  const failingMount = Far('FailingMount', {
    async list() {
      return ['child'];
    },
    async lookup(_path) {
      throw Error('EIO: simulated I/O failure on child lookup');
    },
  });
  const backend = makeFromMountBackend(failingMount);
  const iter = backend.list([])[Symbol.asyncIterator]();
  await t.throwsAsync(() => iter.next(), { message: /EIO/ });
});
