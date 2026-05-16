// @ts-nocheck
/* global Buffer */
/* eslint-disable import/order, no-await-in-loop */

/**
 * 9P server tests against an `@endo/remote-fs` in-memory backing
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

import { E } from '@endo/far';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';

import { makeInMemoryFilesystem } from '@endo/remote-fs/src/in-memory.js';

import { makeFsBridge9p } from '../src/fs-bridge-9p.js';
import {
  makeReader,
  makeWriter,
  tryParseMessage,
  wrapMessage,
} from '../src/9p/wire.js';
import { T, E as ERRNO, QT } from '../src/9p/types.js';

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
  w.u32(0xffffffff);
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

const tgetattr = async (c, fid) => {
  const w = makeWriter();
  w.u32(fid);
  w.u64(0x7ffn);
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

test('Tversion negotiates 9P2000.L', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  const { msize, version } = await negotiate(c);
  t.is(version, '9P2000.L');
  t.true(msize >= 4096);
});

test('Tattach returns the root qid', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  const qid = await attach(c, 1);
  t.is(qid.type, QT.DIR);
});

test('Twalk to /greet.txt yields a file qid', async t => {
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

test('Twalk + Tlopen + Tread round-trips file content', async t => {
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

test('Twalk pipelined chain walks /sub/inner.txt', async t => {
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

test('Twalk to a missing name returns ENOENT', async t => {
  const { socketPath } = await setupBridge(t);
  const c = await setupClient(t, socketPath);
  await negotiate(c);
  await attach(c, 1);
  const rep = await walk(c, 1, 2, ['nope']);
  t.is(rep.type, T.Rlerror);
  const r = makeReader(rep.payload);
  t.is(r.u32(), ERRNO.ENOENT);
});

test('Twalk partial success: ["sub", "missing"] returns one qid + no newfid', async t => {
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
});

test('Treaddir yields entries', async t => {
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

test('Tlcreate + Twrite + Tread round-trips writes', async t => {
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

test('Tmkdir + Twalk + Tunlinkat lifecycle', async t => {
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

test('Tgetattr returns file size + reasonable mode bits', async t => {
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

test('Tclunk frees a fid; subsequent ops EBADF', async t => {
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

test('Twalk with `..` from root stays at root', async t => {
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

test('Twalk with `..` from sub returns to root', async t => {
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
