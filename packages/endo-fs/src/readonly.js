// @ts-check
/**
 * Read-only attenuator (DESIGN.md §8.1, §8.6).
 *
 * `readOnly(fs)` wraps any `Filesystem` cap and produces one whose
 * mutating methods reject with `EACCES`. Reads pass through; the
 * tree shape is preserved (mutating methods can't introduce
 * aliasing they can't perform anyway).
 *
 * The attenuator is recursive: `root()` returns a read-only
 * Directory, whose `lookup` returns a read-only Directory or File,
 * etc. Stream-shaped sub-caps (`Cursor`, `OpenFile` opened read-
 * only, `Xattrs`) are passed through unchanged — they have no
 * mutating verbs the attenuator hasn't already blocked at the
 * boundary that minted them.
 */

import { makeExo } from '@endo/exo';
import { E } from '@endo/eventual-send';
import { makeError, X } from '@endo/errors';

import {
  FilesystemInterface,
  DirectoryInterface,
  FileInterface,
  OpenFileInterface,
  XattrsInterface,
} from './type-guards.js';

const denied = method =>
  makeError(X`EACCES: ${method} not permitted on a read-only Filesystem`);

/**
 * @param {object} inner    a endo-fs `Filesystem` cap
 * @returns {object}        a read-only `Filesystem` cap
 */
export const readOnly = inner => {
  // eslint-disable-next-line no-use-before-define
  return makeReadOnlyFilesystem(inner);
};
harden(readOnly);

/**
 * @param {object} inner
 */
const makeReadOnlyFilesystem = inner => {
  return makeExo('Filesystem', FilesystemInterface, {
    async root() {
      const r = await E(inner).root();
      return makeReadOnlyDirectory(r);
    },
    async named(viewName) {
      const r = await E(inner).named(viewName);
      return makeReadOnlyDirectory(r);
    },
    async statfs() {
      return E(inner).statfs();
    },
    async brands() {
      return E(inner).brands();
    },
    help(method) {
      if (method === undefined) {
        return 'Filesystem (read-only attenuator) — mutating methods reject with EACCES.';
      }
      return `No documentation for method "${method}".`;
    },
  });
};

/**
 * @param {object} dir
 */
const makeReadOnlyDirectory = dir => {
  return makeExo('Directory', DirectoryInterface, {
    getQid() {
      // Forward the synchronous getter. If `dir` is a local exo
      // (same vat), this returns the cached qid; if `dir` is
      // remote, the call is eventual but the contract still holds.
      // eslint-disable-next-line @endo/no-polymorphic-call
      return /** @type {any} */ (dir).getQid();
    },
    async getStat() {
      return E(dir).getStat();
    },
    async setStat(_patch) {
      throw denied('setStat');
    },
    async getAttrs() {
      return E(dir).getAttrs();
    },
    async setAttrs(_updates) {
      throw denied('setAttrs');
    },
    async watch() {
      return E(dir).watch();
    },
    async xattrs() {
      const inner = await E(dir).xattrs();
      return makeReadOnlyXattrs(inner);
    },
    async lookup(name) {
      // Pipeline lookup + getQid in one batch so the type
      // discrimination remains correct when `dir` is a remote
      // presence. A sync `child.getQid()` against a remote cap
      // returns a promise (its `type` is `undefined`), which would
      // mis-wrap every node as a File.
      const childP = E(dir).lookup(name);
      const qidP = E(childP).getQid();
      const [child, qid] = await Promise.all([childP, qidP]);
      if (qid && qid.type === 'directory') {
        return makeReadOnlyDirectory(child);
      }
      return makeReadOnlyFile(child);
    },
    async list() {
      // Cursor is read-only by nature.
      return E(dir).list();
    },
    async create(_name, _opts) {
      throw denied('create');
    },
    async mkdir(_name, _opts) {
      throw denied('mkdir');
    },
    async makeDirectory(_name, _opts) {
      throw denied('makeDirectory');
    },
    async unlink(_name) {
      throw denied('unlink');
    },
    async remove(_name) {
      throw denied('remove');
    },
    async rename(_oldName, _newParent, _newName) {
      throw denied('rename');
    },
    async fsync() {
      throw denied('fsync');
    },
    async materialise(_path, _opts) {
      throw denied('materialise');
    },
    async watchFrom() {
      // Read-side primitive; forward to the wrapped dir. The
      // returned cursor is already non-mutating; the watcher is
      // event-only.
      return E(dir).watchFrom();
    },
    help(method) {
      if (method === undefined) {
        return 'Directory (read-only attenuator).';
      }
      return `No documentation for method "${method}".`;
    },
  });
};

/**
 * @param {object} file
 */
const makeReadOnlyFile = file => {
  return makeExo('File', FileInterface, {
    getQid() {
      // eslint-disable-next-line @endo/no-polymorphic-call
      return /** @type {any} */ (file).getQid();
    },
    async getStat() {
      return E(file).getStat();
    },
    async setStat(_patch) {
      throw denied('setStat');
    },
    async getAttrs() {
      return E(file).getAttrs();
    },
    async setAttrs(_updates) {
      throw denied('setAttrs');
    },
    async watch() {
      return E(file).watch();
    },
    async xattrs() {
      const inner = await E(file).xattrs();
      return makeReadOnlyXattrs(inner);
    },
    async open(opts) {
      const o = /** @type {any} */ (opts) || {};
      if (o.write || o.append || o.truncate || o.create) {
        throw denied('open(write|append|truncate|create)');
      }
      const oh = await E(file).open({ ...o, read: true });
      return makeReadOnlyOpenFile(oh);
    },
    async snapshot() {
      return E(file).snapshot();
    },
    help(method) {
      if (method === undefined) {
        return 'File (read-only attenuator).';
      }
      return `No documentation for method "${method}".`;
    },
  });
};

/**
 * @param {object} oh
 */
const makeReadOnlyOpenFile = oh => {
  return makeExo('OpenFile', OpenFileInterface, {
    async read(offset, length) {
      return E(oh).read(offset, length);
    },
    async write(_offset) {
      throw denied('write');
    },
    async truncate(_length) {
      throw denied('truncate');
    },
    async fsync(_opts) {
      throw denied('fsync');
    },
    async lock(_opts) {
      // No mutating implication on a read-only fs.
      throw denied('lock');
    },
    async getLock(opts) {
      return E(oh).getLock(opts);
    },
    async close() {
      return E(oh).close();
    },
    help(method) {
      if (method === undefined) {
        return 'OpenFile (read-only attenuator).';
      }
      return `No documentation for method "${method}".`;
    },
  });
};

/**
 * @param {object} xattrs
 */
const makeReadOnlyXattrs = xattrs => {
  return makeExo('Xattrs', XattrsInterface, {
    async get(name) {
      return E(xattrs).get(name);
    },
    async set(_name, _opts) {
      throw denied('xattrs.set');
    },
    async list() {
      return E(xattrs).list();
    },
    async remove(_name) {
      throw denied('xattrs.remove');
    },
    help(method) {
      if (method === undefined) {
        return 'Xattrs (read-only attenuator).';
      }
      return `No documentation for method "${method}".`;
    },
  });
};
