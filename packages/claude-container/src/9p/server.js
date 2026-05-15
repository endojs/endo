// @ts-check
/* eslint-disable no-await-in-loop */
//
// Minimal 9P2000.L server backed by an Endo filesystem capability.
//
// Implements the operations needed to mount the workspace inside the guest
// and traverse + read it:
//   Tversion, Tattach, Twalk, Tlopen, Tread, Tclunk, Tgetattr, Treaddir,
//   Tstatfs, Tflush.
// Mutating ops (Tlcreate, Twrite, Tmkdir, Tunlinkat, Trenameat, Tsetattr)
// are wired but minimal — Rlerror(EOPNOTSUPP) if the FS capability does
// not expose the required method. Everything else returns Rlerror(ENOSYS).
//
// FID model: each fid maps to a path (string, "" for root). Open fids
// additionally carry an open mode and, for directories, a readdir cursor.
//
// Performance: every Tread on a file calls E(fs).readFile(path) and
// slices. Every Tgetattr round-trips E(fs).stat. v1 is correct but chatty;
// see ENDO-INTEGRATION.md §9 R1 for the remote-FS roadmap item.

import { E } from '@endo/eventual-send';

import { makeReader, makeWriter, tryParseMessage, wrapMessage } from './wire.js';
import { E as ERRNO, QT, S, T, GETATTR_BASIC } from './types.js';

const VERSION_9P2000_L = '9P2000.L';
const MIN_MSIZE = 4096;
const DEFAULT_MSIZE = 131072;

/**
 * @typedef {object} Fid
 * @property {string} path        Posix-style path relative to FS root, no leading slash. "" for root.
 * @property {boolean} open
 * @property {number} flags
 * @property {string[]} [dirCache]  Cached child names for readdir cursor.
 */

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
  let buf = Buffer.alloc(0);

  const close = () => {
    fids.clear();
    socket.destroy();
    if (onClose) onClose();
  };

  socket.on('error', close);
  socket.on('close', close);

  socket.on('data', async chunk => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const parsed = tryParseMessage(buf);
      if (!parsed) break;
      buf = parsed.rest;
      try {
        await dispatch(parsed.msg);
      } catch (e) {
        try {
          sendError(parsed.msg.tag, ERRNO.EIO);
          // eslint-disable-next-line no-console
          console.error('[9p] dispatch error', e);
        } catch {
          close();
        }
      }
    }
  });

  /**
   * @param {{ type: number, tag: number, payload: Buffer }} msg
   */
  const dispatch = async msg => {
    const r = makeReader(msg.payload);
    const { type, tag } = msg;
    switch (type) {
      case T.Tversion: return onVersion(tag, r);
      case T.Tauth: return sendError(tag, ERRNO.ENOSYS);
      case T.Tattach: return onAttach(tag, r);
      case T.Tflush: return sendEmpty(tag, T.Rflush);
      case T.Twalk: return onWalk(tag, r);
      case T.Tlopen: return onLopen(tag, r);
      case T.Tread: return onRead(tag, r);
      case T.Tclunk: return onClunk(tag, r);
      case T.Tgetattr: return onGetattr(tag, r);
      case T.Treaddir: return onReaddir(tag, r);
      case T.Tstatfs: return onStatfs(tag, r);
      case T.Tlcreate: return onLcreate(tag, r);
      case T.Twrite: return onWrite(tag, r);
      case T.Tmkdir: return onMkdir(tag, r);
      case T.Tunlinkat: return onUnlinkat(tag, r);
      case T.Trenameat: return onRenameat(tag, r);
      case T.Tsetattr: return sendEmpty(tag, T.Rsetattr); // no-op
      case T.Txattrwalk: return sendError(tag, ERRNO.ENOSYS);
      default: return sendError(tag, ERRNO.ENOSYS);
    }
  };

  const send = (/** @type {Buffer} */ data) => {
    socket.write(data);
  };

  const sendEmpty = (/** @type {number} */ tag, /** @type {number} */ rtype) => {
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
    fids.set(fid, { path: '', open: false, flags: 0 });
    const qid = await qidOf('');
    sendQid(tag, T.Rattach, qid);
    return undefined;
  };

  const onWalk = async (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    const newfid = r.u32();
    const nwname = r.u16();
    const wnames = [];
    for (let i = 0; i < nwname; i += 1) wnames.push(r.str());

    const src = fids.get(fid);
    if (!src) return sendError(tag, ERRNO.EBADF);

    // Resolve walks one component at a time; stop on first ENOENT.
    let cur = src.path;
    /** @type {{ type: number, ver: number, pathHash: bigint }[]} */
    const qids = [];
    for (const part of wnames) {
      if (part === '..') {
        const idx = cur.lastIndexOf('/');
        cur = idx < 0 ? '' : cur.slice(0, idx);
      } else if (part === '.' || part === '') {
        // no-op
      } else {
        cur = cur === '' ? part : `${cur}/${part}`;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        const q = await qidOf(cur);
        qids.push(q);
      } catch {
        if (qids.length === 0) return sendError(tag, ERRNO.ENOENT);
        break;
      }
    }
    // Set newfid only if we walked all the components (per 9P semantics).
    if (qids.length === wnames.length) {
      if (fid !== newfid && fids.has(newfid)) {
        return sendError(tag, ERRNO.EBADF);
      }
      fids.set(newfid, { path: cur, open: false, flags: 0 });
    }
    const w = makeWriter(2 + qids.length * 13);
    w.u16(qids.length);
    for (const q of qids) writeQid(w, q);
    send(wrapMessage(T.Rwalk, tag, w.finish()));
    return undefined;
  };

  const onLopen = async (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    const flags = r.u32();
    const f = fids.get(fid);
    if (!f) return sendError(tag, ERRNO.EBADF);
    const stat = await safeStat(f.path);
    if (!stat) return sendError(tag, ERRNO.ENOENT);
    f.open = true;
    f.flags = flags;
    if (stat.isDirectory) {
      f.dirCache = await safeReadDir(f.path);
    }
    const q = stat.isDirectory
      ? makeQid(QT.DIR, f.path)
      : makeQid(QT.FILE, f.path);
    const w = makeWriter(13 + 4);
    writeQid(w, q);
    w.u32(0); // iounit = use msize - 24
    send(wrapMessage(T.Rlopen, tag, w.finish()));
    return undefined;
  };

  const onRead = async (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    const offset = Number(r.u64());
    const count = r.u32();
    const f = fids.get(fid);
    if (!f || !f.open) return sendError(tag, ERRNO.EBADF);
    const stat = await safeStat(f.path);
    if (!stat) return sendError(tag, ERRNO.ENOENT);
    if (stat.isDirectory) return sendError(tag, ERRNO.EISDIR);
    const data = await safeReadFile(f.path);
    if (!data) return sendError(tag, ERRNO.EIO);
    const end = Math.min(offset + count, data.length);
    const slice = data.subarray(offset, end);
    const w = makeWriter(4 + slice.length);
    w.u32(slice.length);
    w.bytes(slice);
    send(wrapMessage(T.Rread, tag, w.finish()));
    return undefined;
  };

  const onClunk = (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    fids.delete(fid);
    sendEmpty(tag, T.Rclunk);
  };

  const onGetattr = async (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    r.u64(); // request_mask (we always return basic stat)
    const f = fids.get(fid);
    if (!f) return sendError(tag, ERRNO.EBADF);
    const stat = await safeStat(f.path);
    if (!stat) return sendError(tag, ERRNO.ENOENT);
    const qt = stat.isDirectory ? QT.DIR : QT.FILE;
    const q = makeQid(qt, f.path);
    const w = makeWriter(160);
    w.u64(GETATTR_BASIC);
    writeQid(w, q);
    const mode = (stat.isDirectory ? S.IFDIR : S.IFREG) | 0o755;
    w.u32(mode);
    w.u32(1000); // uid
    w.u32(1000); // gid
    w.u64(1); // nlink
    w.u64(0); // rdev
    w.u64(BigInt(stat.size ?? 0));
    w.u64(BigInt(4096)); // blksize
    w.u64(BigInt(Math.ceil((stat.size ?? 0) / 512))); // blocks (512-byte units)
    const mt = BigInt(Math.floor((stat.mtimeMs ?? 0) / 1000));
    const mtN = BigInt(((stat.mtimeMs ?? 0) % 1000) * 1_000_000);
    w.u64(mt); w.u64(mtN); // atime
    w.u64(mt); w.u64(mtN); // mtime
    w.u64(mt); w.u64(mtN); // ctime
    w.u64(0); w.u64(0); // btime
    w.u64(0); // gen
    w.u64(0); // data_version
    send(wrapMessage(T.Rgetattr, tag, w.finish()));
    return undefined;
  };

  const onReaddir = async (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    const offset = Number(r.u64());
    const count = r.u32();
    const f = fids.get(fid);
    if (!f || !f.open || !f.dirCache) return sendError(tag, ERRNO.EBADF);

    const w = makeWriter(count + 4);
    w.u32(0); // placeholder; rewrite after
    const startOff = 4;
    let written = 0;
    const entries = f.dirCache;

    const offSize = (/** @type {string} */ name) =>
      13 + 8 + 1 + 2 + Buffer.byteLength(name, 'utf8');

    let i = offset;
    while (i < entries.length) {
      const name = entries[i];
      const size = offSize(name);
      if (written + size > count) break;
      const childPath = f.path === '' ? name : `${f.path}/${name}`;
      // eslint-disable-next-line no-await-in-loop
      const stat = await safeStat(childPath);
      const qt = stat?.isDirectory ? QT.DIR : QT.FILE;
      writeQid(w, makeQid(qt, childPath));
      w.u64(BigInt(i + 1)); // next offset
      w.u8(stat?.isDirectory ? 4 : 8); // DT_DIR | DT_REG
      w.str(name);
      written += size;
      i += 1;
    }

    // Patch the leading u32 count.
    const out = w.finish();
    out.writeUInt32LE(written, 0);
    void startOff;
    send(wrapMessage(T.Rreaddir, tag, out));
    return undefined;
  };

  const onStatfs = (/** @type {number} */ tag, r) => {
    r.u32(); // fid
    const w = makeWriter(48);
    w.u32(0x01021997); // V9FS_MAGIC
    w.u32(4096); // bsize
    w.u64(0n); // blocks
    w.u64(0n); // bfree
    w.u64(0n); // bavail
    w.u64(0n); // files
    w.u64(0n); // ffree
    w.u64(0n); // fsid
    w.u32(255); // namelen
    send(wrapMessage(T.Rstatfs, tag, w.finish()));
  };

  // -- mutating ops (best-effort via the FS capability) --

  const onLcreate = async (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    const name = r.str();
    r.u32(); // flags
    r.u32(); // mode
    r.u32(); // gid
    const f = fids.get(fid);
    if (!f) return sendError(tag, ERRNO.EBADF);
    const newPath = f.path === '' ? name : `${f.path}/${name}`;
    try {
      await E(fs).writeFile(newPath, new Uint8Array(0));
    } catch {
      return sendError(tag, ERRNO.EACCES);
    }
    f.path = newPath;
    f.open = true;
    const q = makeQid(QT.FILE, newPath);
    const w = makeWriter(17);
    writeQid(w, q);
    w.u32(0);
    send(wrapMessage(T.Rlcreate, tag, w.finish()));
    return undefined;
  };

  const onWrite = async (/** @type {number} */ tag, r) => {
    const fid = r.u32();
    const offset = Number(r.u64());
    const count = r.u32();
    const data = r.take(count);
    const f = fids.get(fid);
    if (!f || !f.open) return sendError(tag, ERRNO.EBADF);
    if (offset !== 0) return sendError(tag, ERRNO.EOPNOTSUPP);
    try {
      await E(fs).writeFile(f.path, new Uint8Array(data));
    } catch {
      return sendError(tag, ERRNO.EIO);
    }
    const w = makeWriter(4);
    w.u32(count);
    send(wrapMessage(T.Rwrite, tag, w.finish()));
    return undefined;
  };

  const onMkdir = async (/** @type {number} */ tag, r) => {
    const dfid = r.u32();
    const name = r.str();
    r.u32(); // mode
    r.u32(); // gid
    const f = fids.get(dfid);
    if (!f) return sendError(tag, ERRNO.EBADF);
    const newPath = f.path === '' ? name : `${f.path}/${name}`;
    try {
      await E(fs).mkdir(newPath);
    } catch {
      return sendError(tag, ERRNO.EACCES);
    }
    sendQid(tag, T.Rmkdir, makeQid(QT.DIR, newPath));
    return undefined;
  };

  const onUnlinkat = async (/** @type {number} */ tag, r) => {
    const dfid = r.u32();
    const name = r.str();
    r.u32(); // flags
    const f = fids.get(dfid);
    if (!f) return sendError(tag, ERRNO.EBADF);
    const target = f.path === '' ? name : `${f.path}/${name}`;
    try {
      await E(fs).unlink(target);
    } catch {
      return sendError(tag, ERRNO.EACCES);
    }
    sendEmpty(tag, T.Runlinkat);
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
    const from = a.path === '' ? oldName : `${a.path}/${oldName}`;
    const to = b.path === '' ? newName : `${b.path}/${newName}`;
    try {
      await E(fs).rename(from, to);
    } catch {
      return sendError(tag, ERRNO.EACCES);
    }
    sendEmpty(tag, T.Rrenameat);
    return undefined;
  };

  // -- helpers backed by the FS capability --

  /** @param {string} path */
  const safeStat = async path => {
    try {
      return await E(fs).stat(path);
    } catch {
      return null;
    }
  };

  /** @param {string} path */
  const safeReadDir = async path => {
    try {
      const entries = await E(fs).readDir(path);
      return Array.isArray(entries) ? entries.slice() : [];
    } catch {
      return [];
    }
  };

  /** @param {string} path */
  const safeReadFile = async path => {
    try {
      const data = await E(fs).readFile(path);
      return Buffer.isBuffer(data) ? data : Buffer.from(data);
    } catch {
      return null;
    }
  };

  /** @param {string} path */
  const qidOf = async path => {
    const stat = await safeStat(path);
    if (!stat) throw new Error(`stat failed: ${path}`);
    return makeQid(stat.isDirectory ? QT.DIR : QT.FILE, path);
  };

  /**
   * Deterministic qid path from the string path so it stays stable across
   * walks. Not cryptographic; collisions for distinct paths in one mount
   * would corrupt the kernel's cache, so use a 64-bit FNV-1a hash.
   *
   * @param {number} qtype
   * @param {string} path
   */
  const makeQid = (qtype, path) => {
    let h = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    const mask = (1n << 64n) - 1n;
    for (let i = 0; i < path.length; i += 1) {
      h = ((h ^ BigInt(path.charCodeAt(i))) * prime) & mask;
    }
    return { type: qtype, ver: 0, pathHash: h };
  };

  /**
   * @param {ReturnType<makeWriter>} w
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
};
harden(serveConnection);
