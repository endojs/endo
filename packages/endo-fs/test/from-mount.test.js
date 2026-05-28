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
      async writeBytes(bytes) {
        // Bytes may arrive as Uint8Array or as a Far iterator.
        // For the adapter's use we always pass Uint8Array.
        if (bytes instanceof Uint8Array) {
          node.content = new Uint8Array(bytes);
        } else if (
          bytes &&
          typeof bytes === 'object' &&
          bytes.length !== undefined
        ) {
          node.content = new Uint8Array(bytes);
        } else {
          throw new Error('unsupported writeBytes arg');
        }
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
  await t.throwsAsync(
    () => E(x).set('security.capability', {}),
    { message: /ENOTSUP/ },
  );
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
