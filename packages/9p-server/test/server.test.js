// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

/**
 * 9P server tests against an `@endo/platform/fs/extended` in-memory backing
 * (F14 — bridge integration).
 *
 * Sets up an in-memory `Filesystem`, spawns the 9P bridge on a
 * temp UDS, connects a client, and exercises the wire protocol.
 */

import '@endo/init/debug.js';

import test from 'ava';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';

import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

import { makeInMemoryFilesystem } from '@endo/platform/fs/extended/in-memory.js';
import { makeNodeFilesystem } from '@endo/platform/fs/extended/node-fs.js';

import { makeFsBridge9p } from '../src/fs-bridge.js';
import {
  makeReader,
  makeWriter,
  tryParseMessage,
  wrapMessage,
} from '../src/wire.js';
import { T, E as ERRNO, QT } from '../src/types.js';

const utf8 = s => new TextEncoder().encode(s);

const writeBytesTo = async (writerRef, bytes) => {
  const w = iterateBytesWriter(writerRef);
  await w.next(bytes);
  await w.return();
};

/**
 * Stand up a populated in-memory FS and serve it on a fresh UDS.
 *
 * @param {import('ava').ExecutionContext<any>} t
 */
const setupBridge = async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  // /greet.txt = "hello"
  const greet = await E(root).create('greet.txt', {});
  await writeBytesTo(await E(greet).write(0n), utf8('hello'));
  await E(greet).close();
  // /sub/inner.txt = "deep"
  const sub = await E(root).mkdir('sub', {});
  const inner = await E(sub).create('inner.txt', {});
  await writeBytesTo(await E(inner).write(0n), utf8('deep'));
  await E(inner).close();

  const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-9p-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  const socketPath = path.join(dir, '9p.sock');

  const bridge = makeFsBridge9p({ fs, socketPath });
  await E(bridge).start();
  t.teardown(() => E(bridge).stop());

  return { fs, socketPath };
};

/**
 * Serve a real disk-backed (node-fs) Filesystem on a fresh UDS. The
 * in-memory backing registers new entries eagerly, which masks the
 * Tlcreate create-vs-lookup race; node-fs writes the entry after an
 * await, so it exercises the real-mount path.
 *
 * @param {import('ava').ExecutionContext<any>} t
 */
const setupNodeFsBridge = async t => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'claude-9p-nodefs-'));
  t.teardown(() => rm(rootDir, { recursive: true, force: true }));
  const fs = makeNodeFilesystem({ rootPath: rootDir });

  const sockDir = await mkdtemp(path.join(os.tmpdir(), 'claude-9p-sock-'));
  t.teardown(() => rm(sockDir, { recursive: true, force: true }));
  const socketPath = path.join(sockDir, '9p.sock');

  const bridge = makeFsBridge9p({ fs, socketPath });
  await E(bridge).start();
  t.teardown(() => E(bridge).stop());

  return { fs, rootDir, socketPath };
};

/**
 * A minimal `Filesystem` whose `Directory.create()` makes the new entry
 * visible to `lookup()` only *after* its own promise resolves — exactly
 * how node-fs behaves (the backend writes the dir entry after an internal
 * await). This makes the Tlcreate create-vs-lookup race *deterministic*:
 * a server that dispatches `lookup(name)` concurrently with `create(name)`
 * sees ENOENT, while one that awaits `create` first sees the entry. Only
 * the surface the Tattach → Twalk(clone) → Tlcreate path touches is
 * implemented.
 */
const makeRaceFs = () => {
  /** @type {Map<string, any>} */
  const entries = new Map();
  const dirQid = { type: 'directory', pathId: 0n, version: 0n };
  const fileQid = { type: 'file', pathId: 7n, version: 0n };
  const root = Far('RaceDir', {
    getQid: () => dirQid,
    async create(_name) {
      await null; // entry is written only after this resolves
      entries.set(_name, Far('RaceFile', { getQid: () => fileQid }));
      return Far('RaceOpenFile', { close: async () => {} });
    },
    async lookup(name) {
      const child = entries.get(name);
      if (!child) throw Error('ENOENT: not found');
      return child;
    },
  });
  return Far('RaceFilesystem', { root: () => root });
};

/**
 * Open a connecting 9P client on the bridge's UDS. The client
 * provides `send(type, tag, payload)` which writes a framed
 * message, and `recv()` which awaits the next inbound framed
 * message.
 */
const connectClient = socketPath => {
  const sock = net.createConnection(socketPath);
  let buf = Buffer.alloc(0);
  /** @type {{ resolve: (m: any) => void, reject: (e: any) => void }[]} */
  const waiters = [];
  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const parsed = tryParseMessage(buf);
      if (!parsed) break;
      buf = parsed.rest;
      const w = waiters.shift();
      if (w) w.resolve(parsed.msg);
    }
  });
  sock.on('error', e => {
    for (const w of waiters.splice(0)) w.reject(e);
  });

  const wait = () =>
    new Promise((resolve, reject) => {
      waiters.push({ resolve, reject });
    });

  return {
    sock,
    async waitConnect() {
      if (sock.readyState === 'open') return;
      await new Promise((resolve, reject) => {
        sock.once('connect', resolve);
        sock.once('error', reject);
      });
    },
    send(type, tag, payload) {
      sock.write(wrapMessage(type, tag, payload));
    },
    recv() {
      return wait();
    },
    close() {
      sock.destroy();
    },
  };
};

/**
 * Read a single 9P qid (13 bytes: u8 type, u32 ver, u64 path).
 *
 * @param {ReturnType<typeof makeReader>} r
 */
const readQid = r => ({
  type: r.u8(),
  ver: r.u32(),
  path: r.u64(),
});

const setupClient = async (t, socketPath) => {
  const c = connectClient(socketPath);
  await c.waitConnect();
  t.teardown(() => c.close());
  return c;
};

const negotiate = async c => {
  // Tversion: u32 msize, str version
  const w = makeWriter();
  w.u32(8192);
  w.str('9P2000.L');
  c.send(T.Tversion, 0xffff, w.finish());
  const rep = await c.recv();
  const r = makeReader(rep.payload);
  return { msize: r.u32(), version: r.str(), msg: rep };
};

const attach = async (c, fid) => {
  // Tattach: u32 fid, u32 afid, str uname, str aname, u32 n_uname
  const w = makeWriter();
  w.u32(fid);
  w.u32(0xffff_ffff);
  w.str('');
  w.str('');
  w.u32(0);
  c.send(T.Tattach, 1, w.finish());
  const rep = await c.recv();
  if (rep.type !== T.Rattach) {
    throw new Error(`expected Rattach, got type=${rep.type}`);
  }
  return readQid(makeReader(rep.payload));
};

const walk = async (c, fid, newfid, wnames) => {
  // Twalk: u32 fid, u32 newfid, u16 nwname, [str]
  const w = makeWriter();
  w.u32(fid);
  w.u32(newfid);
  w.u16(wnames.length);
  for (const n of wnames) w.str(n);
  c.send(T.Twalk, 2, w.finish());
  const rep = await c.recv();
  return rep;
};

const lopen = async (c, fid, flags) => {
  const w = makeWriter();
  w.u32(fid);
  w.u32(flags);
  c.send(T.Tlopen, 3, w.finish());
  return c.recv();
};

const tread = async (c, fid, offset, count) => {
  const w = makeWriter();
  w.u32(fid);
  w.u64(offset);
  w.u32(count);
  c.send(T.Tread, 4, w.finish());
  return c.recv();
};

const treaddir = async (c, fid, offset, count) => {
  const w = makeWriter();
  w.u32(fid);
  w.u64(offset);
  w.u32(count);
  c.send(T.Treaddir, 5, w.finish());
  return c.recv();
};

const tgetattr = async (c, fid, mask = 0x7ffn) => {
  const w = makeWriter();
  w.u32(fid);
  w.u64(mask);
  c.send(T.Tgetattr, 6, w.finish());
  return c.recv();
};

const tlcreate = async (c, dfid, name) => {
  const w = makeWriter();
  w.u32(dfid);
  w.str(name);
  w.u32(0o2);
  w.u32(0o644);
  w.u32(0);
  c.send(T.Tlcreate, 7, w.finish());
  return c.recv();
};

const twrite = async (c, fid, offset, data) => {
  const w = makeWriter();
  w.u32(fid);
  w.u64(offset);
  w.u32(data.length);
  w.bytes(data);
  c.send(T.Twrite, 8, w.finish());
  return c.recv();
};

const tclunk = async (c, fid) => {
  const w = makeWriter();
  w.u32(fid);
  c.send(T.Tclunk, 9, w.finish());
  return c.recv();
};

const tmkdir = async (c, dfid, name) => {
  const w = makeWriter();
  w.u32(dfid);
  w.str(name);
  w.u32(0o755);
  w.u32(0);
  c.send(T.Tmkdir, 10, w.finish());
  return c.recv();
};

const tunlinkat = async (c, dfid, name) => {
  const w = makeWriter();
  w.u32(dfid);
  w.str(name);
  w.u32(0);
  c.send(T.Tunlinkat, 11, w.finish());
  return c.recv();
};

const trenameat = async (c, oldDirFid, oldName, newDirFid, newName) => {
  const w = makeWriter();
  w.u32(oldDirFid);
  w.str(oldName);
  w.u32(newDirFid);
  w.str(newName);
  c.send(T.Trenameat, 12, w.finish());
  return c.recv();
};

// Tsetattr with only ATTR_SIZE set — i.e. ftruncate(fid, size).
const tsetattrSize = async (c, fid, size) => {
  const w = makeWriter();
  w.u32(fid);
  w.u32(0x8); // valid = ATTR_SIZE
  w.u32(0); // mode
  w.u32(0); // uid
  w.u32(0); // gid
  w.u64(size);
  w.u64(0n); // atime_sec
  w.u64(0n); // atime_nsec
  w.u64(0n); // mtime_sec
  w.u64(0n); // mtime_nsec
  c.send(T.Tsetattr, 13, w.finish());
  return c.recv();
};

test.serial('Tversion negotiates 9P2000.L', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  const { msize, version } = await negotiate(c);
  t.is(version, '9P2000.L');
  t.true(msize >= 4096);
});

test.serial('Tattach returns the root qid', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  const qid = await attach(c, 1);
  t.is(qid.type, QT.DIR);
});

test.serial('Twalk to /greet.txt yields a file qid', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  const rep = await walk(c, 1, 2, ['greet.txt']);
  t.is(rep.type, T.Rwalk);
  const r = makeReader(rep.payload);
  t.is(r.u16(), 1);
  const qid = readQid(r);
  t.is(qid.type, QT.FILE);
});

test.serial('Twalk + Tlopen + Tread round-trips file content', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  await walk(c, 1, 2, ['greet.txt']);
  const open = await lopen(c, 2, 0);
  t.is(open.type, T.Rlopen);
  const readRep = await tread(c, 2, 0n, 4096);
  t.is(readRep.type, T.Rread);
  const r = makeReader(readRep.payload);
  const count = r.u32();
  const bytes = r.take(count);
  t.is(bytes.toString('utf8'), 'hello');
});

test.serial('Twrite to a read-only fid is EBADF', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  await walk(c, 1, 2, ['greet.txt']);
  await lopen(c, 2, 0); // O_RDONLY
  const wr = await twrite(c, 2, 0n, Buffer.from('nope'));
  t.is(wr.type, T.Rlerror);
  t.is(makeReader(wr.payload).u32(), ERRNO.EBADF);
});

test.serial('Tread from a write-only fid is EBADF', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  await walk(c, 1, 2, ['greet.txt']);
  await lopen(c, 2, 1); // O_WRONLY
  const rd = await tread(c, 2, 0n, 16);
  t.is(rd.type, T.Rlerror);
  t.is(makeReader(rd.payload).u32(), ERRNO.EBADF);
});

test.serial('Twalk from an open fid is rejected (EBADF)', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  await walk(c, 1, 2, ['sub']); // fid 2 = /sub (directory)
  await lopen(c, 2, 0); // open it
  const wrep = await walk(c, 2, 3, ['inner.txt']); // walk from the open fid
  t.is(wrep.type, T.Rlerror);
  t.is(makeReader(wrep.payload).u32(), ERRNO.EBADF);
});

test.serial('Tlopen advertises a nonzero iounit (msize - 24)', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  const { msize } = await negotiate(c);
  await attach(c, 1);
  await walk(c, 1, 2, ['greet.txt']);
  const open = await lopen(c, 2, 0);
  t.is(open.type, T.Rlopen);
  const r = makeReader(open.payload);
  readQid(r); // qid (13 bytes)
  t.is(r.u32(), msize - 24);
});

test.serial('Tclunk closes an open directory cursor', async t => {
  const closes = { n: 0 };
  const dirQid = { type: 'directory', pathId: 0n, version: 0n };
  const cursor = Far('FakeCursor', {
    close: async () => {
      closes.n += 1;
    },
  });
  const dir = Far('FakeDir', {
    getQid: () => dirQid,
    list: async () => cursor,
  });
  const fs = Far('FakeFs', { root: () => dir });

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'claude-9p-curclose-'));
  t.teardown(() => rm(tmp, { recursive: true, force: true }));
  const socketPath = path.join(tmp, '9p.sock');
  const bridge = makeFsBridge9p({ fs, socketPath });
  await E(bridge).start();
  t.teardown(() => E(bridge).stop());

  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  t.is((await lopen(c, 1, 0)).type, T.Rlopen); // open root dir → cursor
  t.is((await tclunk(c, 1)).type, T.Rclunk);
  t.is(closes.n, 1, 'cursor.close() invoked on Tclunk');
});

test.serial('Tgetattr st_result_mask honours the requested mask', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  await walk(c, 1, 2, ['greet.txt']);
  // Request only P9_GETATTR_SIZE (0x200); the reply's valid mask should
  // be the intersection with what we provide, not the full basic set.
  const ga = await tgetattr(c, 2, 0x200n);
  t.is(ga.type, T.Rgetattr);
  t.is(makeReader(ga.payload).u64(), 0x200n);
});

test.serial('Tgetattr reports nlink >= 2 for a directory', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1); // root directory, fid 1
  const ga = await tgetattr(c, 1);
  t.is(ga.type, T.Rgetattr);
  const r = makeReader(ga.payload);
  r.u64(); // valid mask
  readQid(r); // qid
  r.u32(); // mode
  r.u32(); // uid
  r.u32(); // gid
  t.is(r.u64(), 2n); // nlink
});

test.serial('Twalk pipelined chain walks /sub/inner.txt', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  const rep = await walk(c, 1, 2, ['sub', 'inner.txt']);
  t.is(rep.type, T.Rwalk);
  const r = makeReader(rep.payload);
  t.is(r.u16(), 2);
  const q1 = readQid(r);
  const q2 = readQid(r);
  t.is(q1.type, QT.DIR);
  t.is(q2.type, QT.FILE);
});

test.serial('Twalk to a missing name returns ENOENT', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  const rep = await walk(c, 1, 2, ['nope']);
  t.is(rep.type, T.Rlerror);
  const r = makeReader(rep.payload);
  t.is(r.u32(), ERRNO.ENOENT);
});

test.serial(
  'Twalk partial success: ["sub", "missing"] returns one qid + no newfid',
  async t => {
    const { socketPath } = await setupBridge(t);
    const c = await setupClient(t, socketPath);
    await negotiate(c);
    await attach(c, 1);
    const rep = await walk(c, 1, 2, ['sub', 'missing']);
    t.is(rep.type, T.Rwalk);
    const r = makeReader(rep.payload);
    t.is(r.u16(), 1);
    const q1 = readQid(r);
    t.is(q1.type, QT.DIR);
    // newfid=2 should NOT have been set; a subsequent Tgetattr on it
    // is EBADF.
    const ga = await tgetattr(c, 2);
    t.is(ga.type, T.Rlerror);
    const rr = makeReader(ga.payload);
    t.is(rr.u32(), ERRNO.EBADF);
  },
);

test.serial('Treaddir yields entries', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  const lop = await lopen(c, 1, 0);
  t.is(lop.type, T.Rlopen);
  const rep = await treaddir(c, 1, 0n, 4096);
  t.is(rep.type, T.Rreaddir);
  const r = makeReader(rep.payload);
  const total = r.u32();
  t.true(total > 0);
  // Parse entries; verify "greet.txt" and "sub" appear.
  const names = new Set();
  while (r.remaining() > 0) {
    readQid(r); // qid
    r.u64(); // next offset
    r.u8(); // type
    names.add(r.str());
  }
  t.true(names.has('greet.txt'));
  t.true(names.has('sub'));
});

test.serial('Tlcreate + Twrite + Tread round-trips writes', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  // Clone root to fid 2; create 'newfile' under fid 2.
  await walk(c, 1, 2, []);
  const create = await tlcreate(c, 2, 'newfile');
  t.is(create.type, T.Rlcreate);
  const writeRep = await twrite(c, 2, 0n, Buffer.from('written via 9P'));
  t.is(writeRep.type, T.Rwrite);
  // Re-walk from root to find newfile.
  await walk(c, 1, 3, ['newfile']);
  await lopen(c, 3, 0);
  const readRep = await tread(c, 3, 0n, 4096);
  t.is(readRep.type, T.Rread);
  const r = makeReader(readRep.payload);
  const count = r.u32();
  t.is(r.take(count).toString('utf8'), 'written via 9P');
});

test.serial(
  'Tlcreate on a disk-backed (node-fs) FS creates without ENOENT (regression)',
  async t => {
    // `echo x > newfile.txt` on a real mount is O_CREAT|O_WRONLY|O_TRUNC
    // on a missing path → a single Tlcreate. Before the onLcreate fix,
    // the same-batch lookup(name) raced create(name) on node-fs (whose
    // create writes the entry after an await), so the server returned
    // Rlerror(ENOENT) even though the 0-byte file landed on disk. The
    // in-memory backend masks this, so the regression test must use
    // node-fs.
    const { rootDir, socketPath } = await setupNodeFsBridge(t);
    const c = await setupClient(t, socketPath);
    await negotiate(c);
    await attach(c, 1);
    await walk(c, 1, 2, []); // clone root to fid 2
    const create = await tlcreate(c, 2, 'newfile.txt');
    t.is(create.type, T.Rlcreate, 'Tlcreate must return Rlcreate, not Rlerror');
    t.true(
      existsSync(path.join(rootDir, 'newfile.txt')),
      'file exists on disk',
    );
  },
);

test.serial(
  'Tlcreate awaits create before lookup (deterministic race regression)',
  async t => {
    // Unlike the node-fs test above (which leans on real disk timing),
    // makeRaceFs exposes the new entry only after create() resolves, so
    // the race is deterministic on every machine: with the fix (await
    // create, then lookup) this is Rlcreate; reverting to a concurrent
    // create+lookup batch yields ENOENT here every time.
    const fs = makeRaceFs();
    const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-9p-race-'));
    t.teardown(() => rm(dir, { recursive: true, force: true }));
    const socketPath = path.join(dir, '9p.sock');
    const bridge = makeFsBridge9p({ fs, socketPath });
    await E(bridge).start();
    t.teardown(() => E(bridge).stop());

    const c = await setupClient(t, socketPath);
    await negotiate(c);
    await attach(c, 1);
    await walk(c, 1, 2, []); // clone root to fid 2
    const create = await tlcreate(c, 2, 'newfile.txt');
    t.is(create.type, T.Rlcreate);
  },
);

// The in-memory backing registers mutations eagerly and is the only one
// the rest of this file exercises; the Tlcreate race showed that hides
// real-backend bugs. This block re-runs the mutating ops against a
// disk-backed (node-fs) Filesystem to catch sibling regressions.

test.serial(
  'node-fs: Tlcreate + Twrite + reopen + Tread round-trips on disk',
  async t => {
    const { rootDir, socketPath } = await setupNodeFsBridge(t);
    const c = await setupClient(t, socketPath);
    await negotiate(c);
    await attach(c, 1);
    await walk(c, 1, 2, []); // clone root to fid 2
    t.is((await tlcreate(c, 2, 'f.txt')).type, T.Rlcreate);
    t.is((await twrite(c, 2, 0n, Buffer.from('on disk'))).type, T.Rwrite);
    // Reopen via a fresh walk from root so we read through a new fid.
    t.is((await walk(c, 1, 3, ['f.txt'])).type, T.Rwalk);
    t.is((await lopen(c, 3, 0)).type, T.Rlopen);
    const rd = await tread(c, 3, 0n, 4096);
    t.is(rd.type, T.Rread);
    const r = makeReader(rd.payload);
    t.is(r.take(r.u32()).toString('utf8'), 'on disk');
    t.is(readFileSync(path.join(rootDir, 'f.txt'), 'utf8'), 'on disk');
  },
);

test.serial(
  'node-fs: Tmkdir creates a directory reachable by Twalk',
  async t => {
    const { rootDir, socketPath } = await setupNodeFsBridge(t);
    const c = await setupClient(t, socketPath);
    await negotiate(c);
    await attach(c, 1);
    const mk = await tmkdir(c, 1, 'd');
    t.is(mk.type, T.Rmkdir);
    const w = await walk(c, 1, 2, ['d']);
    t.is(w.type, T.Rwalk);
    const r = makeReader(w.payload);
    t.is(r.u16(), 1);
    t.is(readQid(r).type, QT.DIR);
    t.true(existsSync(path.join(rootDir, 'd')));
  },
);

test.serial('node-fs: Trenameat moves a file', async t => {
  const { rootDir, socketPath } = await setupNodeFsBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  await walk(c, 1, 2, []);
  t.is((await tlcreate(c, 2, 'old.txt')).type, T.Rlcreate);
  t.is((await trenameat(c, 1, 'old.txt', 1, 'new.txt')).type, T.Rrenameat);
  t.is((await walk(c, 1, 3, ['new.txt'])).type, T.Rwalk);
  t.is((await walk(c, 1, 4, ['old.txt'])).type, T.Rlerror);
  t.false(existsSync(path.join(rootDir, 'old.txt')));
  t.true(existsSync(path.join(rootDir, 'new.txt')));
});

test.serial('node-fs: Tunlinkat removes a file', async t => {
  const { rootDir, socketPath } = await setupNodeFsBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  await walk(c, 1, 2, []);
  t.is((await tlcreate(c, 2, 'doomed.txt')).type, T.Rlcreate);
  t.is((await tunlinkat(c, 1, 'doomed.txt')).type, T.Runlinkat);
  const w = await walk(c, 1, 3, ['doomed.txt']);
  t.is(w.type, T.Rlerror);
  t.is(makeReader(w.payload).u32(), ERRNO.ENOENT);
  t.false(existsSync(path.join(rootDir, 'doomed.txt')));
});

test.serial('node-fs: Tsetattr truncates a file (ftruncate)', async t => {
  const { rootDir, socketPath } = await setupNodeFsBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  await walk(c, 1, 2, []);
  t.is((await tlcreate(c, 2, 'trunc.txt')).type, T.Rlcreate);
  t.is((await twrite(c, 2, 0n, Buffer.from('hello world'))).type, T.Rwrite);
  t.is((await tsetattrSize(c, 2, 5n)).type, T.Rsetattr);
  const ga = await tgetattr(c, 2);
  t.is(ga.type, T.Rgetattr);
  t.is(readFileSync(path.join(rootDir, 'trunc.txt'), 'utf8'), 'hello');
});

test.serial('node-fs: Treaddir lists entries from disk', async t => {
  const { rootDir, socketPath } = await setupNodeFsBridge(t);
  // Seed the directory on disk (node-fs reads the backing live) so
  // readdir reflects real backing content, not just bytes written
  // through the bridge.
  writeFileSync(path.join(rootDir, 'alpha.txt'), 'a');
  mkdirSync(path.join(rootDir, 'beta'));
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  t.is((await lopen(c, 1, 0)).type, T.Rlopen);
  const rep = await treaddir(c, 1, 0n, 4096);
  t.is(rep.type, T.Rreaddir);
  const r = makeReader(rep.payload);
  r.u32(); // total bytes
  const names = new Set();
  while (r.remaining() > 0) {
    readQid(r);
    r.u64();
    r.u8();
    names.add(r.str());
  }
  t.true(names.has('alpha.txt'));
  t.true(names.has('beta'));
});

test.serial('Tmkdir + Twalk + Tunlinkat lifecycle', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  const mkrep = await tmkdir(c, 1, 'created-dir');
  t.is(mkrep.type, T.Rmkdir);
  // Walk to it to confirm.
  const walkRep = await walk(c, 1, 2, ['created-dir']);
  t.is(walkRep.type, T.Rwalk);
  // Unlink it via parent fid.
  const unrep = await tunlinkat(c, 1, 'created-dir');
  t.is(unrep.type, T.Runlinkat);
  // Walk now fails.
  const post = await walk(c, 1, 3, ['created-dir']);
  t.is(post.type, T.Rlerror);
  const r = makeReader(post.payload);
  t.is(r.u32(), ERRNO.ENOENT);
});

test.serial('Tgetattr returns file size + reasonable mode bits', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  await walk(c, 1, 2, ['greet.txt']);
  const rep = await tgetattr(c, 2);
  t.is(rep.type, T.Rgetattr);
  const r = makeReader(rep.payload);
  r.u64(); // valid mask
  readQid(r);
  r.u32(); // mode
  r.u32(); // uid
  r.u32(); // gid
  r.u64(); // nlink
  r.u64(); // rdev
  const size = r.u64();
  t.is(size, 5n); // "hello"
});

test.serial('Tclunk frees a fid; subsequent ops EBADF', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  await walk(c, 1, 2, ['greet.txt']);
  await tclunk(c, 2);
  const ga = await tgetattr(c, 2);
  t.is(ga.type, T.Rlerror);
  const r = makeReader(ga.payload);
  t.is(r.u32(), ERRNO.EBADF);
});

test.serial('Twalk with `..` from root stays at root', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  const rep = await walk(c, 1, 2, ['..']);
  t.is(rep.type, T.Rwalk);
  const r = makeReader(rep.payload);
  t.is(r.u16(), 1);
  const q = readQid(r);
  t.is(q.type, QT.DIR);
});

test.serial('Twalk with `..` from sub returns to root', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  await walk(c, 1, 2, ['sub']);
  // From 2 (sub), walk `..` back; expect dir qid.
  const rep = await walk(c, 2, 3, ['..']);
  t.is(rep.type, T.Rwalk);
  const r = makeReader(rep.payload);
  t.is(r.u16(), 1);
  const q = readQid(r);
  t.is(q.type, QT.DIR);
});
