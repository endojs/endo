// @ts-check
/* global Buffer */
/* eslint-disable no-await-in-loop, no-bitwise */
//
// 9P2000.L server backed by an `@endo/remote-fs` `Filesystem` cap.
//
// fid model: each fid holds a Node cap (Directory or File) plus an
// ancestry stack `[{ parent: Directory, name: string }, ...]` for
// supporting `..` walks and the (parent, name) bookkeeping that
// Tunlinkat / Trenameat need.
//
// Opened fids additionally carry an `openFile` (File case) or a
// `cursor` (Directory case) cap from remote-fs.
//
// Pipelining: Twalk builds a chain `E(cur).lookup(n0).lookup(n1)...`
// without awaiting between steps. Each step's qid is requested
// in parallel via `E(intermediate).getQid()` and gathered with
// `Promise.allSettled` to support partial-success semantics.
//
// Wire qid <-> remote-fs qid mapping:
//   remote-fs `Qid` = { type: 'directory'|'file', pathId: bigint, version: bigint }
//   9P wire qid    = u8 type, u32 ver, u64 pathHash
// We mask ver/pathHash to fit; the truncated bits don't matter for
// cache invariants since the kernel treats them as opaque.

import { E } from '@endo/eventual-send';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import {
  makeReader,
  makeWriter,
  tryParseMessage,
  wrapMessage,
} from './wire.js';
import { E as ERRNO, QT, S, T, GETATTR_BASIC } from './types.js';

const VERSION_9P2000_L = '9P2000.L';
const MIN_MSIZE = 4096;
const DEFAULT_MSIZE = 131072;

const MASK_U32 = 0xffffffffn;
const MASK_U64 = (1n << 64n) - 1n;

/**
 * @typedef {object} Fid
 * @property {any} cap                 Node cap (Directory or File).
 * @property {{ type: 'directory' | 'file', pathId: bigint, version: bigint }} qid
 * @property {Array<{ parent: any, name: string }>} ancestry
 *   Most-recent-first list of (parentCap, name) tuples leading
 *   back to the FS root. Used for `..` walks and the (parent,
 *   name) bookkeeping Tunlinkat / Trenameat need.
 * @property {boolean} open
 * @property {any} [openFile]          remote-fs OpenFile cap (File open)
 * @property {any} [cursor]            remote-fs Cursor cap (Directory open)
 * @property {Array<{ name: string, qid: any }>} [dirBuffer]
 *   Cached entries for Treaddir, drained as the kernel reads.
 * @property {boolean} [dirBufferDone]
 */

/**
 * @param {{ type: 'directory' | 'file', pathId: bigint, version: bigint }} qid
 * @returns {{ type: number, ver: number, pathHash: bigint }}
 */
const qidToWire = qid => ({
  type: qid.type === 'directory' ? QT.DIR : QT.FILE,
  ver: Number(qid.version & MASK_U32),
  pathHash: qid.pathId & MASK_U64,
});

/**
 * Translate a remote-fs error to a 9P errno. We pattern-match on
 * the error message (which carries the `Exxxx:` prefix the
 * in-memory and disk implementations attach). Unknown errors map
 * to EIO.
 *
 * @param {unknown} e
 */
const errnoOf = e => {
  const msg = e instanceof Error ? e.message : String(e);
  const m = /\bE([A-Z][A-Z0-9]+)\b/.exec(msg);
  if (m) {
    const name = `E${m[1]}`;
    if (Object.prototype.hasOwnProperty.call(ERRNO, name)) {
      return /** @type {number} */ (
        /** @type {Record<string, number>} */ (ERRNO)[name]
      );
    }
  }
  return ERRNO.EIO;
};

/**
 * @param {{
 *   fs: import('@endo/eventual-send').ERef<any>,
 *   socket: import('node:net').Socket,
 *   onClose?: () => void,
 * }} opts
 */
export const serveConnection = ({ fs, socket, onClose }) => {
  /** @type {Map<number, Fid>} */
  const fids = new Map();
  let msize = DEFAULT_MSIZE;
  let negotiated = false;
  let buf = /** @type {Buffer} */ (Buffer.alloc(0));

  let closed = false;

  const close = () => {
    // Idempotent. `'error'` and `'close'` can both fire (an
    // error usually triggers a subsequent close), and `dispatch`
    // failures can call this from the data path too.
    if (closed) return;
    closed = true;
    socket.removeListener('error', close);
    socket.removeListener('close', close);
    socket.removeListener('data', onData);
    fids.clear();
    socket.destroy();
    if (onClose) onClose();
  };

  // Drain every complete message currently sitting in `buf`.
  // Each call awaits its own dispatches in order; concurrent
  // calls are serialised by chaining onto `processing` (below).
  const drainOnce = async () => {
    for (;;) {
      if (closed) return;
      const parsed = tryParseMessage(buf);
      if (!parsed) return;
      buf = parsed.rest;
      try {
        await dispatch(parsed.msg);
      } catch (e) {
        try {
          sendError(parsed.msg.tag, errnoOf(e));
          // eslint-disable-next-line no-console
          console.error('[9p] dispatch error', e);
        } catch {
          close();
          return;
        }
      }
    }
  };

  // Per-connection processing queue. Node fires `'data'` events
  // independently of any async work the handler kicks off, so a
  // raw `async (chunk) => { await dispatch(...) }` lets two
  // events re-enter `buf` / `fids` concurrently. Chaining each
  // event onto a single promise sequence keeps message handling
  // strictly serial; `.then(drainOnce, drainOnce)` continues the
  // chain even if a prior drain rejected.
  let processing = Promise.resolve();

  /** @param {Buffer} chunk */
  const onData = chunk => {
    if (closed) return;
    buf = Buffer.concat([buf, chunk]);
    processing = processing.then(drainOnce, drainOnce);
  };

  socket.on('error', close);
  socket.on('close', close);
  socket.on('data', onData);

  /**
   * @param {{ type: number, tag: number, payload: Buffer }} msg
   */
  const dispatch = async msg => {
    const r = makeReader(msg.payload);
    const { type, tag } = msg;
    switch (type) {
      case T.Tversion:
        return onVersion(tag, r);
      case T.Tauth:
        return sendError(tag, ERRNO.ENOSYS);
      case T.Tattach:
        return onAttach(tag, r);
      case T.Tflush:
        return sendEmpty(tag, T.Rflush);
      case T.Twalk:
        return onWalk(tag, r);
      case T.Tlopen:
        return onLopen(tag, r);
      case T.Tread:
        return onRead(tag, r);
      case T.Tclunk:
        return onClunk(tag, r);
      case T.Tgetattr:
        return onGetattr(tag, r);
      case T.Treaddir:
        return onReaddir(tag, r);
      case T.Tstatfs:
        return onStatfs(tag, r);
      case T.Tlcreate:
        return onLcreate(tag, r);
      case T.Twrite:
        return onWrite(tag, r);
      case T.Tmkdir:
        return onMkdir(tag, r);
      case T.Tunlinkat:
        return onUnlinkat(tag, r);
      case T.Trenameat:
        return onRenameat(tag, r);
      case T.Tsetattr:
        return onSetattr(tag, r);
      case T.Txattrwalk:
        return sendError(tag, ERRNO.ENOSYS);
      default:
        return sendError(tag, ERRNO.ENOSYS);
    }
  };

  const send = (/** @type {Buffer} */ data) => {
    socket.write(data);
  };

  const sendEmpty = (
    /** @type {number} */ tag,
    /** @type {number} */ rtype,
  ) => {
    send(wrapMessage(rtype, tag, Buffer.alloc(0)));
  };

  /**
   * @param {number} tag
   * @param {number} errno
   */
  const sendError = (tag, errno) => {
    const w = makeWriter(4);
    w.u32(errno);
    send(wrapMessage(T.Rlerror, tag, w.finish()));
  };

  /**
   * @param {ReturnType<typeof makeWriter>} w
   * @param {{ type: number, ver: number, pathHash: bigint }} q
   */
  const writeQid = (w, q) => {
    w.u8(q.type);
    w.u32(q.ver);
    w.u64(q.pathHash);
  };

  /**
   * @param {number} tag
   * @param {number} rtype
   * @param {{ type: number, ver: number, pathHash: bigint }} q
   */
  const sendQid = (tag, rtype, q) => {
    const w = makeWriter(13);
    writeQid(w, q);
    send(wrapMessage(rtype, tag, w.finish()));
  };

  // ---- ops ----

  const onVersion = (/** @type {number} */ tag, r) => {
    const reqMsize = r.u32();
    const ver = r.str();
    msize = Math.max(MIN_MSIZE, Math.min(reqMsize, DEFAULT_MSIZE));
    const replyVer = ver.startsWith('9P2000.L') ? VERSION_9P2000_L : 'unknown';
    const w = makeWriter(2 + 4 + 2 + replyVer.length);
    w.u32(msize);
    w.str(replyVer);
    send(wrapMessage(T.Rversion, tag, w.finish()));
    negotiated = replyVer === VERSION_9P2000_L;
  };

  const onAttach = async (/** @type {number} */ tag, r) => {
    if (!negotiated) return sendError(tag, ERRNO.EINVAL);
    const fid = r.u32();
    r.u32(); // afid (unused)
    r.str(); // uname
    r.str(); // aname
    r.u32(); // n_uname
    try {
      const root = await E(fs).root();
      const qid = await E(root).getQid();
      fids.set(fid, {
        cap: root,
        qid,
        ancestry: [],
        open: false,
      });
      sendQid(tag, T.Rattach, qidToWire(qid));
    } catch (e) {
      return sendError(tag, errnoOf(e));
    }
    return undefined;
  };

  const onWalk = async (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    const newfid = r.u32();
    const nwname = /** @type {number} */ (r.u16());
    const wnames = [];
    for (let i = 0; i < nwname; i += 1) wnames.push(r.str());

    const src = fids.get(fid);
    if (!src) return sendError(tag, ERRNO.EBADF);

    // Build the pipelined chain. `steps[i]` describes the i-th
    // step's resulting cap + qid promise + new ancestry. Caps
    // are promises during the chain build; resolved at the end.
    let curCap = src.cap;
    let curAncestry = src.ancestry;
    const steps = [];
    for (const name of wnames) {
      if (name === '..') {
        if (curAncestry.length === 0) {
          steps.push({
            capRef: curCap,
            qidPromise: E(curCap).getQid(),
            ancestry: curAncestry,
            name: '',
          });
        } else {
          const parent = curAncestry[0].parent;
          curAncestry = curAncestry.slice(1);
          curCap = parent;
          steps.push({
            capRef: parent,
            qidPromise: E(parent).getQid(),
            ancestry: curAncestry,
            name: curAncestry.length > 0 ? curAncestry[0].name : '',
          });
        }
      } else if (name === '.' || name === '') {
        steps.push({
          capRef: curCap,
          qidPromise: E(curCap).getQid(),
          ancestry: curAncestry,
          name: '',
        });
      } else {
        const childRef = E(curCap).lookup(name);
        const newAncestry = [{ parent: curCap, name }, ...curAncestry];
        curAncestry = newAncestry;
        curCap = childRef;
        steps.push({
          capRef: childRef,
          qidPromise: E(childRef).getQid(),
          ancestry: newAncestry,
          name,
        });
      }
    }

    // Collect qids until the first failure (partial-success).
    /** @type {Array<{ type: 'directory' | 'file', pathId: bigint, version: bigint }>} */
    const qids = [];
    let lastSuccess = -1;
    for (let i = 0; i < steps.length; i += 1) {
      try {
        const q = await steps[i].qidPromise;
        qids.push(q);
        lastSuccess = i;
      } catch (e) {
        if (qids.length === 0) {
          return sendError(tag, errnoOf(e));
        }
        break;
      }
    }

    // Set newfid only when every component walked successfully.
    if (qids.length === nwname) {
      if (fid !== newfid && fids.has(newfid)) {
        return sendError(tag, ERRNO.EBADF);
      }
      if (nwname === 0) {
        // Clone.
        fids.set(newfid, {
          cap: src.cap,
          qid: src.qid,
          ancestry: src.ancestry,
          open: false,
        });
      } else {
        const last = steps[lastSuccess];
        const resolvedCap = await Promise.resolve(last.capRef);
        const lastQid = qids[qids.length - 1];
        fids.set(newfid, {
          cap: resolvedCap,
          qid: lastQid,
          ancestry: last.ancestry,
          open: false,
        });
      }
    }

    const w = makeWriter(2 + qids.length * 13);
    w.u16(qids.length);
    for (const q of qids) writeQid(w, qidToWire(q));
    send(wrapMessage(T.Rwalk, tag, w.finish()));
    return undefined;
  };

  const onLopen = async (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    const flags = r.u32();
    const f = fids.get(fid);
    if (!f) return sendError(tag, ERRNO.EBADF);
    try {
      if (f.qid.type === 'directory') {
        const cursor = await E(f.cap).list();
        f.cursor = cursor;
        f.dirBuffer = [];
        f.dirBufferDone = false;
        f.open = true;
      } else {
        // POSIX-style flag bits: O_RDWR=0o2, O_WRONLY=0o1, O_RDONLY=0o0.
        const oflag = flags & 0o3;
        const wantRead = oflag === 0 || oflag === 0o2;
        const wantWrite = oflag === 0o1 || oflag === 0o2;
        const wantAppend = !!(flags & 0o2000);
        const wantTrunc = !!(flags & 0o1000);
        const oh = await E(f.cap).open(
          harden({
            read: wantRead,
            write: wantWrite,
            append: wantAppend,
            truncate: wantTrunc,
          }),
        );
        f.openFile = oh;
        f.open = true;
      }
    } catch (e) {
      return sendError(tag, errnoOf(e));
    }
    const w = makeWriter(13 + 4);
    writeQid(w, qidToWire(f.qid));
    w.u32(0); // iounit = use msize - 24
    send(wrapMessage(T.Rlopen, tag, w.finish()));
    return undefined;
  };

  const onRead = async (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    const offset = r.u64();
    const count = r.u32();
    const f = fids.get(fid);
    if (!f || !f.open) return sendError(tag, ERRNO.EBADF);
    if (f.qid.type === 'directory') {
      return sendError(tag, ERRNO.EISDIR);
    }
    if (!f.openFile) return sendError(tag, ERRNO.EBADF);
    try {
      const reader = await E(f.openFile).read(offset, BigInt(count));
      const chunks = [];
      let total = 0;
      const want = Number(count);
      for await (const chunk of iterateBytesReader(reader)) {
        chunks.push(chunk);
        total += chunk.length;
        if (total >= want) break;
      }
      const data = Buffer.concat(
        chunks.map(c => Buffer.from(c.buffer, c.byteOffset, c.byteLength)),
      );
      const slice = data.subarray(0, Math.min(data.length, count));
      const w = makeWriter(4 + slice.length);
      w.u32(slice.length);
      w.bytes(slice);
      send(wrapMessage(T.Rread, tag, w.finish()));
    } catch (e) {
      return sendError(tag, errnoOf(e));
    }
    return undefined;
  };

  const onClunk = async (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    const f = fids.get(fid);
    if (f) {
      // Best-effort close of any open handle.
      if (f.openFile) {
        try {
          await E(f.openFile).close();
        } catch {
          // ignore
        }
      }
      fids.delete(fid);
    }
    sendEmpty(tag, T.Rclunk);
    return undefined;
  };

  const onGetattr = async (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    r.u64(); // request_mask (we always return basic stat)
    const f = fids.get(fid);
    if (!f) return sendError(tag, ERRNO.EBADF);
    try {
      const attrs = await E(f.cap).getAttrs();
      const w = makeWriter(160);
      w.u64(GETATTR_BASIC);
      writeQid(w, qidToWire(f.qid));
      const isDir = f.qid.type === 'directory';
      const mode = (isDir ? S.IFDIR : S.IFREG) | (isDir ? 0o755 : 0o644);
      w.u32(mode);
      w.u32(1000); // uid — base FS has no concept; default for guest mount.
      w.u32(1000); // gid
      w.u64(1n); // nlink
      w.u64(0n); // rdev
      w.u64(BigInt(attrs.size ?? 0n));
      w.u64(4096n); // blksize
      w.u64(BigInt(attrs.size ?? 0n) / 512n + 1n); // blocks
      const writeNs = ns => {
        const s = BigInt(ns) / 1_000_000_000n;
        const sub = BigInt(ns) % 1_000_000_000n;
        w.u64(s);
        w.u64(sub);
      };
      writeNs(attrs.atime ?? 0n);
      writeNs(attrs.mtime ?? 0n);
      writeNs(attrs.ctime ?? 0n);
      writeNs(attrs.btime ?? 0n);
      w.u64(0n); // gen
      w.u64(0n); // data_version
      send(wrapMessage(T.Rgetattr, tag, w.finish()));
    } catch (e) {
      return sendError(tag, errnoOf(e));
    }
    return undefined;
  };

  /**
   * @param {Fid} f
   */
  const fillDirBuffer = async f => {
    if (f.dirBufferDone || !f.cursor) return;
    if (!f.dirBuffer) f.dirBuffer = [];
    // Open one stream and drain entirely. Cheap for small dirs;
    // larger dirs could chunk, but the in-memory + disk Cursor
    // already snapshot at stream() time, so a single drain is OK.
    const reader = await E(f.cursor).stream();
    for await (const entry of iterateReader(reader)) {
      f.dirBuffer.push(/** @type {{ name: string, qid: any }} */ (entry));
    }
    f.dirBufferDone = true;
  };

  const onReaddir = async (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    const offset = Number(r.u64());
    const count = /** @type {number} */ (r.u32());
    const f = fids.get(fid);
    if (!f || !f.open || !f.cursor) return sendError(tag, ERRNO.EBADF);

    try {
      await fillDirBuffer(f);
    } catch (e) {
      return sendError(tag, errnoOf(e));
    }

    const entries = f.dirBuffer || [];
    const w = makeWriter(count + 4);
    w.u32(0); // placeholder; rewrite after
    let written = 0;

    const offSize = (/** @type {string} */ name) =>
      13 + 8 + 1 + 2 + Buffer.byteLength(name, 'utf8');

    let i = offset;
    while (i < entries.length) {
      const { name, qid } = entries[i];
      const size = offSize(name);
      if (written + size > count) break;
      writeQid(w, qidToWire(qid));
      w.u64(BigInt(i + 1)); // next offset cookie
      w.u8(qid.type === 'directory' ? 4 : 8); // DT_DIR | DT_REG
      w.str(name);
      written += size;
      i += 1;
    }

    const out = w.finish();
    out.writeUInt32LE(written, 0);
    send(wrapMessage(T.Rreaddir, tag, out));
    return undefined;
  };

  const onStatfs = async (/** @type {number} */ tag, r) => {
    r.u32(); // fid (we report process-global statfs; the fid's FS
    // identity isn't exposed by remote-fs at the Node level)
    let stats;
    try {
      stats = await E(fs).statfs();
    } catch {
      stats = { totalBytes: 0n, freeBytes: 0n };
    }
    const blockSize = 4096n;
    const totalBlocks = BigInt(stats.totalBytes ?? 0n) / blockSize;
    const freeBlocks = BigInt(stats.freeBytes ?? 0n) / blockSize;
    const w = makeWriter(48);
    w.u32(0x01021997); // V9FS_MAGIC
    w.u32(Number(blockSize));
    w.u64(totalBlocks);
    w.u64(freeBlocks);
    w.u64(freeBlocks);
    w.u64(0n); // files
    w.u64(0n); // ffree
    w.u64(0n); // fsid
    w.u32(255); // namelen
    send(wrapMessage(T.Rstatfs, tag, w.finish()));
    return undefined;
  };

  const onLcreate = async (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    const name = r.str();
    r.u32(); // flags
    r.u32(); // mode
    r.u32(); // gid
    const f = fids.get(fid);
    if (!f) return sendError(tag, ERRNO.EBADF);
    if (f.qid.type !== 'directory') return sendError(tag, ERRNO.ENOTDIR);
    try {
      const oh = await E(f.cap).create(name, harden({}));
      // Reconstruct the created file's qid via getQid is not on
      // OpenFile — we need the File cap. Re-lookup the child to
      // get a Node cap + its qid.
      const childCap = await E(f.cap).lookup(name);
      const childQid = await E(childCap).getQid();
      // Replace fid: 9P semantics put newly-created file at the
      // original fid. Ancestry extends.
      const newAncestry = [{ parent: f.cap, name }, ...f.ancestry];
      fids.set(fid, {
        cap: childCap,
        qid: childQid,
        ancestry: newAncestry,
        open: true,
        openFile: oh,
      });
      const w = makeWriter(17);
      writeQid(w, qidToWire(childQid));
      w.u32(0);
      send(wrapMessage(T.Rlcreate, tag, w.finish()));
    } catch (e) {
      return sendError(tag, errnoOf(e));
    }
    return undefined;
  };

  const onWrite = async (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    const offset = r.u64();
    const count = r.u32();
    const data = r.take(count);
    const f = fids.get(fid);
    if (!f || !f.open) return sendError(tag, ERRNO.EBADF);
    if (f.qid.type === 'directory') return sendError(tag, ERRNO.EISDIR);
    if (!f.openFile) return sendError(tag, ERRNO.EBADF);
    try {
      const writer = await E(f.openFile).write(offset);
      const w8 = iterateBytesWriter(writer);
      // r.take returns a Buffer; the bytes writer wants Uint8Array.
      await w8.next(
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      );
      await w8.return();
      const w = makeWriter(4);
      w.u32(count);
      send(wrapMessage(T.Rwrite, tag, w.finish()));
    } catch (e) {
      return sendError(tag, errnoOf(e));
    }
    return undefined;
  };

  const onMkdir = async (/** @type {number} */ tag, r) => {
    const dfid = r.u32();
    const name = r.str();
    r.u32(); // mode
    r.u32(); // gid
    const f = fids.get(dfid);
    if (!f) return sendError(tag, ERRNO.EBADF);
    if (f.qid.type !== 'directory') return sendError(tag, ERRNO.ENOTDIR);
    try {
      const newDir = await E(f.cap).mkdir(name, harden({}));
      const qid = await E(newDir).getQid();
      sendQid(tag, T.Rmkdir, qidToWire(qid));
    } catch (e) {
      return sendError(tag, errnoOf(e));
    }
    return undefined;
  };

  const onUnlinkat = async (/** @type {number} */ tag, r) => {
    const dfid = r.u32();
    const name = r.str();
    r.u32(); // flags
    const f = fids.get(dfid);
    if (!f) return sendError(tag, ERRNO.EBADF);
    if (f.qid.type !== 'directory') return sendError(tag, ERRNO.ENOTDIR);
    try {
      await E(f.cap).unlink(name);
      sendEmpty(tag, T.Runlinkat);
    } catch (e) {
      return sendError(tag, errnoOf(e));
    }
    return undefined;
  };

  const onRenameat = async (/** @type {number} */ tag, r) => {
    const oldDirFid = r.u32();
    const oldName = r.str();
    const newDirFid = r.u32();
    const newName = r.str();
    const a = fids.get(oldDirFid);
    const b = fids.get(newDirFid);
    if (!a || !b) return sendError(tag, ERRNO.EBADF);
    if (a.qid.type !== 'directory' || b.qid.type !== 'directory') {
      return sendError(tag, ERRNO.ENOTDIR);
    }
    try {
      await E(a.cap).rename(oldName, b.cap, newName);
      sendEmpty(tag, T.Rrenameat);
    } catch (e) {
      return sendError(tag, errnoOf(e));
    }
    return undefined;
  };

  const onSetattr = async (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    const valid = r.u32();
    r.u32(); // mode (ignored — POSIX-only)
    r.u32(); // uid
    r.u32(); // gid
    const size = r.u64();
    const atimeS = r.u64();
    const atimeNs = r.u64();
    const mtimeS = r.u64();
    const mtimeNs = r.u64();
    const f = fids.get(fid);
    if (!f) return sendError(tag, ERRNO.EBADF);
    const ATTR_SIZE = 0x8;
    const ATTR_ATIME = 0x10;
    const ATTR_MTIME = 0x20;
    /** @type {{ size?: bigint, atime?: bigint, mtime?: bigint }} */
    const updates = {};
    if (valid & ATTR_SIZE) updates.size = size;
    if (valid & ATTR_ATIME) {
      updates.atime = atimeS * 1_000_000_000n + atimeNs;
    }
    if (valid & ATTR_MTIME) {
      updates.mtime = mtimeS * 1_000_000_000n + mtimeNs;
    }
    try {
      if (Object.keys(updates).length > 0) {
        await E(f.cap).setAttrs(harden(updates));
      }
      sendEmpty(tag, T.Rsetattr);
    } catch (e) {
      return sendError(tag, errnoOf(e));
    }
    return undefined;
  };
};
harden(serveConnection);
