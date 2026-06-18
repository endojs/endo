// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */
/* global Buffer */

/**
 * `mountAsFilesystem` tests (F5).
 *
 * Uses a hand-rolled in-memory mock `Mount` (matching the
 * `@endo/daemon` `EndoMount` / `EndoMountFile` shape) rather than
 * spinning up a real daemon. Exercises the adapter's read/write
 * round-trip, list, lookup, mkdir, unlink, rename, snapshot.
 */

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/far';
import { E } from '@endo/eventual-send';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { mountAsFilesystem } from '../src/from-mount.js';
import { makeFromMountBackend } from '../src/backends/from-mount-backend.js';

const utf8 = s => new TextEncoder().encode(s);
const fromUtf8 = b => new TextDecoder().decode(b);

const writeBytes = async (writerRef, bytes) => {
  const w = iterateBytesWriter(writerRef);
  await w.next(bytes);
  await w.return();
};

const collectBytes = async readerRef => {
  const chunks = [];
  let total = 0;
  for await (const chunk of iterateBytesReader(readerRef)) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  return buf;
};

const collectStream = async readerRef => {
  const out = [];
  for await (const v of iterateReader(readerRef)) {
    out.push(v);
  }
  return out;
};

/**
 * Build a minimal in-memory Mount mock.
 * Internal state is a tree of nodes:
 *   { kind: 'dir', children: Map<name, Node> }
 *   { kind: 'file', content: Uint8Array }
 */
const makeMockMount = () => {
  const root = { kind: 'dir', children: new Map() };

  const lookupNode = (node, segments) => {
    let cur = node;
    for (const s of segments) {
      if (cur.kind !== 'dir') return null;
      const child = cur.children.get(s);
      if (!child) return null;
      cur = child;
    }
    return cur;
  };

  const segmentsOf = path => (typeof path === 'string' ? [path] : path);

  const makeFileFar = node =>
    Far('EndoMountFile', {
      async text() {
        return fromUtf8(node.content);
      },
      async streamBase64() {
        // Yield the whole content as one base64 chunk.
        let yielded = false;
        return Far('AsyncIterator', {
          async next() {
            if (yielded) return harden({ done: true, value: undefined });
            yielded = true;
            return harden({
              done: false,
              value: Buffer.from(node.content).toString('base64'),
            });
          },
        });
      },
      async json() {
        return JSON.parse(fromUtf8(node.content));
      },
      async writeText(text) {
        node.content = utf8(text);
      },
      async writeBytes(readableRef) {
        // The real `EndoMountFile.writeBytes` is guarded `M.remotable()`
        // and a raw `Uint8Array` cannot cross CapTP — reject it here so
        // a regression that passes raw bytes fails the test instead of
        // silently passing same-vat (the divergence that hid this bug).
        if (readableRef instanceof Uint8Array) {
          throw new Error(
            'writeBytes expects a reader reference, not raw bytes',
          );
        }
        const reader = await E(readableRef).streamBase64();
        const chunks = [];
        let total = 0;
        for (;;) {
          const { done, value: b64 } = await E(reader).next();
          if (done) break;
          const decoded = new Uint8Array(Buffer.from(b64, 'base64'));
          chunks.push(decoded);
          total += decoded.length;
        }
        const content = new Uint8Array(total);
        let o = 0;
        for (const c of chunks) {
          content.set(c, o);
          o += c.length;
        }
        node.content = content;
      },
      readOnly() {
        return this;
      },
      help() {
        return 'mock EndoMountFile';
      },
    });

  const makeMountFar = base => {
    /** @type {any} */
    const m = Far('EndoMount', {
      async has(...path) {
        return lookupNode(base, path) !== null;
      },
      async list(...path) {
        const node = lookupNode(base, path);
        if (!node || node.kind !== 'dir') {
          throw new Error(`ENOTDIR: ${path.join('/')}`);
        }
        return [...node.children.keys()];
      },
      async lookup(path) {
        const segs = segmentsOf(path);
        const node = lookupNode(base, segs);
        if (!node) throw new Error(`ENOENT: ${segs.join('/')}`);
        if (node.kind === 'dir') return makeMountFar(node);
        return makeFileFar(node);
      },
      async readText(path) {
        const segs = segmentsOf(path);
        const node = lookupNode(base, segs);
        if (!node || node.kind !== 'file') {
          throw new Error(`ENOENT: ${segs.join('/')}`);
        }
        return fromUtf8(node.content);
      },
      async maybeReadText(path) {
        try {
          return await m.readText(path);
        } catch {
          return undefined;
        }
      },
      async writeText(path, text) {
        const segs = segmentsOf(path);
        const parent = segs.slice(0, -1);
        const name = segs[segs.length - 1];
        const parentNode = lookupNode(base, parent);
        if (!parentNode || parentNode.kind !== 'dir') {
          throw new Error('ENOTDIR');
        }
        parentNode.children.set(name, { kind: 'file', content: utf8(text) });
      },
      // Mirrors the real `EndoMount.write(path, ReadableBlob)`: the
      // value is a *remotable* reader reference (never raw bytes, which
      // are not passable over CapTP), drained via its `streamBase64`
      // method and base64-decoded.
      async write(path, value) {
        const segs = segmentsOf(path);
        const name = segs[segs.length - 1];
        // The real `EndoMount.write` calls `filePowers.makePath(parent)`,
        // so missing intermediate directories are created on demand. The
        // mock mirrors that mkdir-p behavior (it previously threw ENOTDIR,
        // diverging from production and leaving the creates-parents path
        // the adapter depends on untested).
        let parentNode = base;
        for (const seg of segs.slice(0, -1)) {
          let child = parentNode.children.get(seg);
          if (child === undefined) {
            child = { kind: 'dir', children: new Map() };
            parentNode.children.set(seg, child);
          } else if (child.kind !== 'dir') {
            throw new Error(`ENOTDIR: ${seg}`);
          }
          parentNode = child;
        }
        const reader = await E(value).streamBase64();
        const chunks = [];
        let total = 0;
        for (;;) {
          const { done, value: b64 } = await E(reader).next();
          if (done) break;
          const decoded = new Uint8Array(Buffer.from(b64, 'base64'));
          chunks.push(decoded);
          total += decoded.length;
        }
        const content = new Uint8Array(total);
        let o = 0;
        for (const c of chunks) {
          content.set(c, o);
          o += c.length;
        }
        parentNode.children.set(name, { kind: 'file', content });
      },
      async remove(path) {
        const segs = segmentsOf(path);
        const parent = segs.slice(0, -1);
        const name = segs[segs.length - 1];
        const parentNode = lookupNode(base, parent);
        if (!parentNode || !parentNode.children.has(name)) {
          throw new Error('ENOENT');
        }
        parentNode.children.delete(name);
      },
      async move(from, to) {
        const fromSegs = segmentsOf(from);
        const toSegs = segmentsOf(to);
        const fromParent = lookupNode(base, fromSegs.slice(0, -1));
        const fromName = fromSegs[fromSegs.length - 1];
        if (!fromParent || !fromParent.children.has(fromName)) {
          throw new Error('ENOENT');
        }
        const moved = fromParent.children.get(fromName);
        const toParent = lookupNode(base, toSegs.slice(0, -1));
        if (!toParent || toParent.kind !== 'dir') {
          throw new Error('ENOTDIR');
        }
        const toName = toSegs[toSegs.length - 1];
        toParent.children.set(toName, moved);
        fromParent.children.delete(fromName);
      },
      async makeDirectory(path) {
        const segs = segmentsOf(path);
        const parent = segs.slice(0, -1);
        const name = segs[segs.length - 1];
        const parentNode = lookupNode(base, parent);
        if (!parentNode || parentNode.kind !== 'dir') {
          throw new Error('ENOTDIR');
        }
        parentNode.children.set(name, { kind: 'dir', children: new Map() });
      },
      readOnly() {
        return m;
      },
      async snapshot() {
        return m;
      },
      help() {
        return 'mock EndoMount';
      },
    });
    return m;
  };

  return makeMountFar(root);
};

test('adapter exposes a endo-fs Filesystem with root Directory', async t => {
  const mount = makeMockMount();
  const fs = mountAsFilesystem(mount);
  const root = await E(fs).root();
  const qid = await E(root).getQid();
  t.is(qid.type, 'directory');
});

test('create + read round-trips bytes via Mount', async t => {
  const mount = makeMockMount();
  const fs = mountAsFilesystem(mount);
  const root = await E(fs).root();

  const opened = await E(root).create('hello.txt', {});
  await writeBytes(await E(opened).write(0n), utf8('hello mount'));
  await E(opened).close();

  const file = await E(root).lookup('hello.txt');
  const qid = await E(file).getQid();
  t.is(qid.type, 'file');

  const oh = await E(file).open({ read: true });
  const bytes = await collectBytes(await E(oh).read(0n, 1024n));
  t.is(fromUtf8(bytes), 'hello mount');
});

test('open({ truncate: true }) resizes via Mount whole-file write', async t => {
  // Regression: the adapter had no setStat, so truncate threw
  // "ENOSYS: open({ truncate: true }) not implemented on this backend".
  // setStat now emulates resize through Mount.write.
  const mount = makeMockMount();
  const fs = mountAsFilesystem(mount);
  const root = await E(fs).root();

  const opened = await E(root).create('note.txt', {});
  await writeBytes(await E(opened).write(0n), utf8('original content'));
  await E(opened).close();

  const trunc = await E(await E(root).lookup('note.txt')).open({
    write: true,
    truncate: true,
  });
  await writeBytes(await E(trunc).write(0n), utf8('new'));
  await E(trunc).close();

  const rh = await E(await E(root).lookup('note.txt')).open({ read: true });
  const bytes = await collectBytes(await E(rh).read(0n, 1024n));
  t.is(fromUtf8(bytes), 'new');
});

test('setStat grows a file with POSIX zero-fill (from-mount backend)', async t => {
  const backend = makeFromMountBackend(makeMockMount());
  await backend.write(['grow.bin'], utf8('abc'));
  await backend.setStat(['grow.bin'], { size: 6n });
  const bytes = await backend.read(['grow.bin']);
  t.is(bytes.length, 6);
  t.is(fromUtf8(bytes.subarray(0, 3)), 'abc');
  t.deepEqual([...bytes.subarray(3)], [0, 0, 0]);
});

test('setStat shrinks a file to a nonzero length (from-mount backend)', async t => {
  const backend = makeFromMountBackend(makeMockMount());
  await backend.write(['shrink.bin'], utf8('abcde'));
  await backend.setStat(['shrink.bin'], { size: 2n });
  t.is(fromUtf8(await backend.read(['shrink.bin'])), 'ab');
});

test('write at a nonzero offset splices into existing content', async t => {
  const backend = makeFromMountBackend(makeMockMount());
  await backend.write(['range.bin'], utf8('0000'));
  await backend.write(['range.bin'], utf8('XY'), 1n);
  t.is(fromUtf8(await backend.read(['range.bin'])), '0XY0');
});

test('write creates missing parent directories via Mount.write', async t => {
  // The adapter's write relies on the real Mount.write calling makePath to
  // create intermediate parents. Exercise that path directly (the mock now
  // mirrors the mkdir-p behavior).
  const backend = makeFromMountBackend(makeMockMount());
  await backend.write(['deep', 'nested', 'file.txt'], utf8('hi'));
  t.is(await backend.kind(['deep']), 'directory');
  t.is(await backend.kind(['deep', 'nested']), 'directory');
  t.is(fromUtf8(await backend.read(['deep', 'nested', 'file.txt'])), 'hi');
});

test('backend folds a Mount escape (EACCES) into not-found, not an error', async t => {
  // A symlink that escapes the confinement root makes the daemon Mount throw
  // EACCES (not ENOENT). The adapter must read it as "no such node"
  // (undefined), the same as a genuine miss — otherwise a cap holder could
  // distinguish "escapes to an existing host path" from "does not exist" and
  // use it as an out-of-sandbox existence oracle.
  const escapingMount = Far('EndoMount', {
    async lookup() {
      throw new Error('EACCES: path escapes mount root: "/escape"');
    },
  });
  const backend = makeFromMountBackend(escapingMount);
  t.is(await backend.kind(['escape']), undefined);
});

test('mkdir + list + lookup round-trips a sub-directory', async t => {
  const mount = makeMockMount();
  const fs = mountAsFilesystem(mount);
  const root = await E(fs).root();

  await E(root).mkdir('sub', {});
  const sub = await E(root).lookup('sub');
  t.is((await E(sub).getQid()).type, 'directory');

  const cursor = await E(root).list();
  const entries = await collectStream(await E(cursor).stream());
  t.deepEqual(
    entries.map(e => e.name),
    ['sub'],
  );
});

test('unlink + lookup ENOENT', async t => {
  const mount = makeMockMount();
  const fs = mountAsFilesystem(mount);
  const root = await E(fs).root();
  const opened = await E(root).create('doomed', {});
  await E(opened).close();
  await E(root).unlink('doomed');
  await t.throwsAsync(() => E(root).lookup('doomed'), {
    message: /ENOENT/,
  });
});

test('rename across directories via Mount.move', async t => {
  const mount = makeMockMount();
  const fs = mountAsFilesystem(mount);
  const root = await E(fs).root();
  const subA = await E(root).mkdir('a', {});
  const subB = await E(root).mkdir('b', {});
  const f = await E(subA).create('thing', {});
  await writeBytes(await E(f).write(0n), utf8('payload'));
  await E(f).close();
  await E(subA).rename('thing', subB, 'thing');
  await t.throwsAsync(() => E(subA).lookup('thing'), { message: /ENOENT/ });
  const moved = await E(subB).lookup('thing');
  const oh = await E(moved).open({ read: true });
  const bytes = await collectBytes(await E(oh).read(0n, 64n));
  t.is(fromUtf8(bytes), 'payload');
});

test('snapshot fetches Mount content into a BlobRef', async t => {
  const mount = makeMockMount();
  const fs = mountAsFilesystem(mount);
  const root = await E(fs).root();
  const opened = await E(root).create('x', {});
  await writeBytes(await E(opened).write(0n), utf8('snap'));
  await E(opened).close();
  const file = await E(root).lookup('x');
  const blob = await E(file).snapshot();
  const info = await E(blob).getInfo();
  t.is(info.algorithm, 'sha256');
  t.is(info.size, 4n);
});

test('xattrs on Mount-adapted FS: unset xattr reports ENODATA', async t => {
  // After the wrapBackend migration, Mount-adapted Filesystems
  // gain in-vat user.* xattr support (sidecar storage in
  // wrap-backend's xattrTable). Mount itself still has no native
  // xattr surface; the xattrs are scoped to the Filesystem cap
  // and don't persist to the underlying Mount.
  const mount = makeMockMount();
  const fs = mountAsFilesystem(mount);
  const root = await E(fs).root();
  const x = await E(root).xattrs();
  // Unset xattrs report ENODATA (the POSIX-correct signal).
  await t.throwsAsync(() => E(x).get('user.tag'), { message: /ENODATA/ });
});

test('xattrs on Mount-adapted FS: set/get/list/remove round-trips user.* metadata', async t => {
  // Positive verification that the vat-local sidecar actually
  // works — the ENODATA test above only proves the empty case.
  const mount = makeMockMount();
  const fs = mountAsFilesystem(mount);
  const root = await E(fs).root();
  const opened = await E(root).create('marked', {});
  await E(opened).close();
  const file = await E(root).lookup('marked');
  const x = await E(file).xattrs();

  await writeBytes(await E(x).set('user.tag', {}), utf8('payload'));
  const back = await collectBytes(await E(x).get('user.tag'));
  t.is(fromUtf8(back), 'payload');

  const names = await collectStream(await E(x).list());
  t.deepEqual(names.sort(), ['user.tag']);

  await E(x).remove('user.tag');
  await t.throwsAsync(() => E(x).get('user.tag'), { message: /ENODATA/ });
});

test('xattrs on Mount-adapted FS: non-user.* namespace is rejected', async t => {
  // The vat-local sidecar only serves the user.* namespace.
  // Other namespaces (security.*, system.*, etc.) need a real
  // POSIX backing — they go to PosixFs.
  const mount = makeMockMount();
  const fs = mountAsFilesystem(mount);
  const root = await E(fs).root();
  const x = await E(root).xattrs();
  await t.throwsAsync(() => E(x).set('security.capability', {}), {
    message: /ENOTSUP/,
  });
});

test('rename target from a different Filesystem rejects EXDEV', async t => {
  const m1 = makeMockMount();
  const m2 = makeMockMount();
  const fs1 = mountAsFilesystem(m1);
  const fs2 = mountAsFilesystem(m2);
  const r1 = await E(fs1).root();
  const r2 = await E(fs2).root();
  const opened = await E(r1).create('a', {});
  await E(opened).close();
  await t.throwsAsync(() => E(r1).rename('a', r2, 'a'), {
    message: /EXDEV/,
  });
});

test('lookup with invalid name rejects', async t => {
  const mount = makeMockMount();
  const fs = mountAsFilesystem(mount);
  const root = await E(fs).root();
  await t.throwsAsync(() => E(root).lookup('..'), { message: /EINVAL/ });
  await t.throwsAsync(() => E(root).lookup('a/b'), { message: /EINVAL/ });
});
