// @ts-check
/* eslint-disable no-await-in-loop, no-continue */
/**
 * Composition primitives (F11/F12/F13, DESIGN.md §8.4 / §8.5 / §8.6).
 *
 * Five primitives, each returning a `Filesystem` indistinguishable
 * from a primitive one:
 *
 *   compose(layer, backing)        — CoW union (§8.4)
 *   chroot(fs, subPath)            — present a subtree as the root
 *   bind(host, mountPath, guest)   — graft `guest` at `mountPath` of `host`
 *   namespace(mounts)              — synthetic empty root + named children
 *   emptyFilesystem()              — the unit object (root with no entries)
 *
 * Plus `Layer` semantics — every writable `Filesystem` can serve as
 * a layer; `compose` exposes `Layer.diff()` / `Layer.apply()` via a
 * separate sub-cap (DESIGN.md §8.5). The diff/apply pieces are
 * deferred to a follow-up commit; this commit lands the structural
 * primitives that make composition usable.
 *
 * Cycle defense (DESIGN.md §3 #5 + §8.6): every primitive Filesystem
 * gets a unique opaque tag (a Symbol). Composed Filesystems carry the
 * union of their participants' tags. `bind` and `compose` refuse to
 * combine two caps whose tag sets overlap. Caps from a different
 * package or implementation aren't in any of our tag sets, so they
 * default to "no conflict" — which means truly external composition
 * (cross-implementation) bypasses the cycle check, but that's
 * acceptable since the cycle would require both peers to alias the
 * same underlying state, which can't happen across implementations.
 */

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { makeError, X, q } from '@endo/errors';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';

import {
  FilesystemInterface,
  DirectoryInterface,
  CursorInterface,
  NodeWatcherInterface,
} from './guards.js';

/**
 * Opaque tag stamped onto every Filesystem this module hands out.
 * Used by cycle-detection — the union of a composed FS's
 * participants' tags is its own tag set. Two caps with overlapping
 * tags must NOT be combined as different roles in a single
 * composition.
 *
 * @type {WeakMap<object, ReadonlySet<symbol>>}
 */
const tagSets = new WeakMap();

const fresh = () => Symbol('remote-fs:tag');

/**
 * Return the tag set for a Filesystem cap. Auto-registers any cap
 * this module hasn't seen before with a fresh tag so that cycle
 * detection covers primitive Filesystems too (`makeInMemoryFilesystem`,
 * `makeDiskFilesystem`, `mountAsFilesystem`).
 *
 * @param {object} fs
 * @returns {ReadonlySet<symbol>}
 */
const tagsOf = fs => {
  let tags = tagSets.get(fs);
  if (!tags) {
    tags = harden(new Set([fresh()]));
    tagSets.set(fs, tags);
  }
  return tags;
};

/**
 * @param {object} fs
 * @param {Set<symbol>} tags
 */
const registerTags = (fs, tags) => {
  tagSets.set(fs, harden(new Set(tags)));
};

/**
 * Throw if the participants' tag sets overlap.
 *
 * @param {string} primitive   the primitive's name, for the error
 * @param {object[]} participants
 */
const assertNoCycle = (primitive, participants) => {
  const seen = new Set();
  for (const p of participants) {
    for (const tag of tagsOf(p)) {
      if (seen.has(tag)) {
        throw makeError(
          X`${q(primitive)}: participants share a tag — would create a cycle`,
        );
      }
      seen.add(tag);
    }
  }
};

// ---------- emptyFilesystem ----------

/**
 * The unit Filesystem — a single empty directory, mutations
 * uniformly rejected with ENOSYS (the empty FS is informational,
 * not a scratch space — use makeInMemoryFilesystem for that).
 *
 * @returns {object}
 */
export const emptyFilesystem = () => {
  const tag = fresh();

  const emptyAttrs = harden({
    size: 0n,
    mtime: 0n,
    atime: 0n,
    ctime: 0n,
    btime: null,
  });
  const rootQid = harden({
    type: 'directory',
    pathId: 0n,
    version: 0n,
  });

  const makeEmptyCursor = () => {
    return makeExo('Cursor', CursorInterface, {
      async stream() {
        const empty = async function* () {
          // yields nothing
        };
        return readerFromIterator(empty());
      },
      async skip(_n) {
        // no-op
      },
      async rewind() {
        // no-op
      },
      help: method =>
        method === undefined
          ? 'Cursor (emptyFilesystem): always empty.'
          : `No documentation for method "${method}".`,
    });
  };

  const reject = method =>
    makeError(X`ENOSYS: ${q(method)} on emptyFilesystem`);

  // eslint-disable-next-line no-use-before-define
  const root = makeEmptyDir;
  /** @type {() => object} */
  // eslint-disable-next-line no-use-before-define
  function makeEmptyDir() {
    return makeExo('Directory', DirectoryInterface, {
      getQid: () => rootQid,
      async getAttrs() {
        return emptyAttrs;
      },
      async setAttrs(_u) {
        throw reject('setAttrs');
      },
      async watch() {
        return makeExo('NodeWatcher', NodeWatcherInterface, {
          async events() {
            const empty = async function* () {
              // emptyFilesystem is immutable; no events.
            };
            return readerFromIterator(empty());
          },
          async cancel() {
        // namespace root is fixed; nothing to cancel.
      },
        });
      },
      async xattrs() {
        throw reject('xattrs');
      },
      async lookup(name) {
        throw makeError(X`ENOENT: ${q(name)}`);
      },
      async list() {
        return makeEmptyCursor();
      },
      async create(_n, _o) {
        throw reject('create');
      },
      async mkdir(_n, _o) {
        throw reject('mkdir');
      },
      async unlink(_n) {
        throw reject('unlink');
      },
      async rename(_o, _np, _n) {
        throw reject('rename');
      },
      async fsync() {
        // no-op
      },
      help: method =>
        method === undefined
          ? 'Directory (emptyFilesystem): always empty.'
          : `No documentation for method "${method}".`,
    });
  }

  const fs = makeExo('Filesystem', FilesystemInterface, {
    async root() {
      return root();
    },
    async named(viewName) {
      throw makeError(
        X`ENOTSUP: emptyFilesystem has a single root, not ${q(viewName)}`,
      );
    },
    async statfs() {
      return harden({
        totalBytes: 0n,
        freeBytes: 0n,
        availableBytes: 0n,
      });
    },
    help: method =>
      method === undefined
        ? 'emptyFilesystem (DESIGN.md §8.6).'
        : `No documentation for method "${method}".`,
  });
  registerTags(fs, new Set([tag]));
  return fs;
};
harden(emptyFilesystem);

// ---------- chroot ----------

/**
 * Present a subtree of `fs` as the root.
 *
 * @param {object} fs
 * @param {string[]} subPath
 */
export const chroot = (fs, subPath) => {
  if (!Array.isArray(subPath)) {
    throw makeError(X`chroot: subPath must be an array of names`);
  }
  for (const seg of subPath) {
    if (typeof seg !== 'string' || seg.length === 0 || seg === '.' || seg === '..') {
      throw makeError(X`chroot: invalid path segment ${q(seg)}`);
    }
    if (seg.includes('/') || seg.includes('\0')) {
      throw makeError(X`chroot: invalid path segment ${q(seg)}`);
    }
  }

  const tag = fresh();
  const inner = makeExo('Filesystem', FilesystemInterface, {
    async root() {
      let cur = await E(fs).root();
      for (const seg of subPath) {
        cur = await E(cur).lookup(seg);
      }
      // cur must be a directory.
      const qid = await E(cur).getQid();
      if (qid.type !== 'directory') {
        throw makeError(X`ENOTDIR: chroot subPath terminates at a file`);
      }
      return cur;
    },
    async named(viewName) {
      throw makeError(
        X`ENOTSUP: chroot has a single root, not ${q(viewName)}`,
      );
    },
    async statfs() {
      return E(fs).statfs();
    },
    help: method =>
      method === undefined
        ? `Filesystem (chrooted to /${subPath.join('/')}).`
        : `No documentation for method "${method}".`,
  });
  registerTags(inner, new Set([tag, ...tagsOf(fs)]));
  return inner;
};
harden(chroot);

// ---------- bind ----------

/**
 * Build a Filesystem whose `host` is shadowed by `guest` at
 * `mountPath`. Reads at `mountPath` (and beyond) come from `guest`;
 * other reads come from `host`.
 *
 * v1 limitations: mutations at or below `mountPath` go to `guest`;
 * mutations elsewhere go to `host`. The bind is read-only at the
 * mount point itself (you can't rename the mount). Path arithmetic
 * is done with name-tracking on every Directory lookup chain.
 *
 * @param {object} host
 * @param {string[]} mountPath
 * @param {object} guest
 */
export const bind = (host, mountPath, guest) => {
  assertNoCycle('bind', [host, guest]);
  if (!Array.isArray(mountPath) || mountPath.length === 0) {
    throw makeError(X`bind: mountPath must be a non-empty array`);
  }

  const tag = fresh();

  // Build a "join" Directory at any position in the host tree that
  // is a prefix of the mount path. At the exact mount point, return
  // the guest root. Below the mount point, return guest's lookup
  // result.
  /** @type {(hostDir: object, pos: number) => object} */
  // eslint-disable-next-line no-use-before-define
  const wrap = (hostDir, pos) => wrapDirectory(hostDir, pos);

  /** @param {object} dir @param {number} pos */
  function wrapDirectory(dir, pos) {
    // pos === mountPath.length means we're AT the mount point. We
    // return the guest's root directly (no wrap needed — the guest
    // owns this subtree).
    if (pos === mountPath.length) {
      return dir;
    }
    return makeExo('Directory', DirectoryInterface, {
      getQid() {
        return /** @type {any} */ (dir).getQid();
      },
      async getAttrs() {
        return E(dir).getAttrs();
      },
      async setAttrs(updates) {
        return E(dir).setAttrs(updates);
      },
      async watch() {
        return E(dir).watch();
      },
      async xattrs() {
        return E(dir).xattrs();
      },
      async lookup(name) {
        const matchesMount = name === mountPath[pos];
        const child = await E(dir).lookup(name);
        if (matchesMount) {
          // Replace this name with the guest root or with a
          // wrapped directory deeper into the mount path.
          if (pos + 1 === mountPath.length) {
            return E(guest).root();
          }
          return wrap(child, pos + 1);
        }
        return child;
      },
      async list() {
        return E(dir).list();
      },
      async create(name, opts) {
        return E(dir).create(name, opts);
      },
      async mkdir(name, opts) {
        if (name === mountPath[pos]) {
          // Can't shadow the mount point with a directory.
          throw makeError(X`EBUSY: cannot mkdir over a bind mount`);
        }
        const newDir = await E(dir).mkdir(name, opts);
        return wrap(newDir, pos);
      },
      async unlink(name) {
        if (name === mountPath[pos]) {
          throw makeError(X`EBUSY: cannot unlink a bind mount`);
        }
        return E(dir).unlink(name);
      },
      async rename(oldName, newParent, newName) {
        if (oldName === mountPath[pos] || newName === mountPath[pos]) {
          throw makeError(X`EBUSY: cannot rename across a bind mount`);
        }
        return E(dir).rename(oldName, newParent, newName);
      },
      async fsync() {
        return E(dir).fsync();
      },
      help: method =>
        method === undefined
          ? 'Directory (bind-wrapping).'
          : `No documentation for method "${method}".`,
    });
  }

  const fs = makeExo('Filesystem', FilesystemInterface, {
    async root() {
      const r = await E(host).root();
      return wrap(r, 0);
    },
    async named(viewName) {
      throw makeError(
        X`ENOTSUP: bind has a single root, not ${q(viewName)}`,
      );
    },
    async statfs() {
      return E(host).statfs();
    },
    help: method =>
      method === undefined
        ? `Filesystem (bind: guest grafted at /${mountPath.join('/')}).`
        : `No documentation for method "${method}".`,
  });
  registerTags(fs, new Set([tag, ...tagsOf(host), ...tagsOf(guest)]));
  return fs;
};
harden(bind);

// ---------- namespace ----------

/**
 * Build a Filesystem whose root contains a synthetic empty root
 * with named children, each mapped to another Filesystem's root.
 *
 * @param {Record<string, object>} mounts
 */
export const namespace = mounts => {
  // Cycle check: no two mounts should share a tag, and no mount
  // should re-use a tag that's already in another participant.
  const participants = Object.values(mounts);
  assertNoCycle('namespace', participants);

  const tag = fresh();
  const names = Object.keys(mounts);
  for (const name of names) {
    if (
      typeof name !== 'string' ||
      name.length === 0 ||
      name === '.' ||
      name === '..' ||
      name.includes('/') ||
      name.includes('\0')
    ) {
      throw makeError(X`namespace: invalid mount name ${q(name)}`);
    }
  }

  const rootQid = harden({
    type: 'directory',
    pathId: 0n,
    version: 0n,
  });

  const makeNamespaceRoot = () =>
    makeExo('Directory', DirectoryInterface, {
      getQid: () => rootQid,
      async getAttrs() {
        return harden({
          size: 0n,
          mtime: 0n,
          atime: 0n,
          ctime: 0n,
          btime: null,
        });
      },
      async setAttrs(_u) {
        throw makeError(X`ENOSYS: setAttrs on namespace root`);
      },
      async watch() {
        return makeExo('NodeWatcher', NodeWatcherInterface, {
          async events() {
            const empty = async function* () {
              // namespace root is fixed.
            };
            return readerFromIterator(empty());
          },
          async cancel() {
        // namespace root is fixed; nothing to cancel.
      },
        });
      },
      async xattrs() {
        throw makeError(X`ENOSYS: xattrs on namespace root`);
      },
      async lookup(name) {
        const mount = mounts[name];
        if (!mount) throw makeError(X`ENOENT: ${q(name)}`);
        return E(mount).root();
      },
      async list() {
        const childMounts = names.map(name => ({ name, mount: mounts[name] }));
        const gen = async function* () {
          for (const { name, mount } of childMounts) {
            try {
              const root = await E(mount).root();
              const qid = await E(root).getQid();
              yield harden({ name, qid });
            } catch {
              // mount fetch failed; skip silently.
            }
          }
        };
        return makeExo('Cursor', CursorInterface, {
          async stream() {
            return readerFromIterator(gen());
          },
          async skip(_n) {
            // no-op: cursor is single-shot for namespace root
          },
          async rewind() {
            // no-op
          },
          help: method =>
            method === undefined
              ? 'Cursor (namespace root).'
              : `No documentation for method "${method}".`,
        });
      },
      async create(_n, _o) {
        throw makeError(X`ENOSYS: cannot create at namespace root`);
      },
      async mkdir(_n, _o) {
        throw makeError(X`ENOSYS: cannot mkdir at namespace root`);
      },
      async unlink(_n) {
        throw makeError(X`ENOSYS: cannot unlink at namespace root`);
      },
      async rename(_o, _np, _n) {
        throw makeError(X`ENOSYS: cannot rename at namespace root`);
      },
      async fsync() {
        // no-op
      },
      help: method =>
        method === undefined
          ? 'Directory (namespace root): synthetic with named mounts.'
          : `No documentation for method "${method}".`,
    });

  const fs = makeExo('Filesystem', FilesystemInterface, {
    async root() {
      return makeNamespaceRoot();
    },
    async named(viewName) {
      const m = mounts[viewName];
      if (!m) throw makeError(X`ENOENT: ${q(viewName)}`);
      return E(m).root();
    },
    async statfs() {
      // Aggregate would need cross-mount stats; report zeros for v1.
      return harden({
        totalBytes: 0n,
        freeBytes: 0n,
        availableBytes: 0n,
      });
    },
    help: method =>
      method === undefined
        ? `Filesystem (namespace with mounts: ${names.join(', ')}).`
        : `No documentation for method "${method}".`,
  });

  const allTags = new Set([tag]);
  for (const m of participants) {
    for (const t of tagsOf(m)) allTags.add(t);
  }
  registerTags(fs, allTags);
  return fs;
};
harden(namespace);

// ---------- compose (CoW union) ----------

/**
 * Compose a writable `layer` over a (typically read-only) `backing`
 * to produce a CoW union (DESIGN.md §8.4).
 *
 * Lookup order at any directory level:
 *   1. Layer has a whiteout entry for `name` → ENOENT
 *      (whiteout marker is a sentinel file with content
 *      '\0__WHITEOUT__\0'; the in-memory FS preserves arbitrary
 *      bytes so this works portably across implementations.)
 *   2. Layer has an opaque marker for the directory (a file named
 *      '.__opaque__') → ignore the backing's children here.
 *   3. Layer has a non-whiteout entry → return the layer's entry.
 *   4. Otherwise → return the backing's entry.
 *
 * `list()` merges the two sides applying whiteouts.
 *
 * **Copy-up**: writing to a file that exists only in the backing
 * triggers a layer-side create + content copy. We don't try to be
 * clever about partial copy-up; the first write fetches the full
 * backing content and replays it through the layer's create.
 *
 * @param {object} layer    a remote-fs Filesystem (writable)
 * @param {object} backing  a remote-fs Filesystem (any)
 * @param {object} [_opts]  policy (reserved for future use)
 */
export const compose = (layer, backing, _opts = {}) => {
  if (layer === backing) {
    throw makeError(X`compose: layer and backing must differ`);
  }
  assertNoCycle('compose', [layer, backing]);

  const tag = fresh();
  const WHITEOUT_PREFIX = ' __WHITEOUT__';
  const OPAQUE_NAME = '.__opaque__';

  // We use the layer's own `user.*` xattr surface (when available)
  // as the marker channel: a file with xattr `user.remote-fs-whiteout`
  // is treated as a whiteout. Falling back to filename markers if
  // xattrs aren't supported.
  //
  // For simplicity in v1, we use FILENAME markers only:
  //   __whiteout__<NAME>    = whiteout marker hiding <NAME>
  //   .__opaque__            = opaque-dir marker hiding all backing
  //                            entries at this directory level
  const isWhiteoutName = n => n.startsWith('__whiteout__');
  const whiteoutTarget = n => n.slice('__whiteout__'.length);
  const whiteoutName = target => `__whiteout__${target}`;

  /**
   * Build a composed Directory at a path level.
   *
   * @param {object | null} layerDir   layer Directory at this path, or null
   * @param {object | null} backingDir backing Directory at this path, or null
   * @param {string[]} path             path-segments from composed root
   */
  // eslint-disable-next-line no-use-before-define
  const wrapDir = (layerDir, backingDir, path) =>
    // eslint-disable-next-line no-use-before-define
    makeComposedDir(layerDir, backingDir, path);

  /**
   * @param {object | null} layerDir
   */
  const lookupSafe = async (layerDir, name) => {
    if (!layerDir) return null;
    try {
      return await E(layerDir).lookup(name);
    } catch {
      return null;
    }
  };

  /**
   * @param {object | null} layerDir
   */
  const hasName = async (layerDir, name) => {
    if (!layerDir) return false;
    const cursor = await E(layerDir).list();
    const stream = await E(cursor).stream();
    for await (const entry of /** @type {AsyncIterable<any>} */ (
      (await import('@endo/exo-stream/iterate-reader.js')).iterateReader(stream)
    )) {
      if (entry.name === name) return true;
    }
    return false;
  };

  /**
   * @param {object | null} layerDir
   */
  const layerEntries = async layerDir => {
    if (!layerDir) return new Map();
    const cursor = await E(layerDir).list();
    const stream = await E(cursor).stream();
    const out = new Map();
    for await (const entry of /** @type {AsyncIterable<any>} */ (
      (await import('@endo/exo-stream/iterate-reader.js')).iterateReader(stream)
    )) {
      out.set(entry.name, entry);
    }
    return out;
  };

  /**
   * @param {object | null} layerDir
   * @param {object | null} backingDir
   * @param {string[]} path
   */
  function makeComposedDir(layerDir, backingDir, path) {
    const reqDir = () => {
      if (!layerDir && !backingDir) {
        throw makeError(X`ENOENT: composed directory not present`);
      }
    };
    return makeExo('Directory', DirectoryInterface, {
      getQid() {
        // Prefer the layer's qid when present; otherwise backing's.
        if (layerDir) {
          // eslint-disable-next-line @endo/no-polymorphic-call
          return /** @type {any} */ (layerDir).getQid();
        }
        // eslint-disable-next-line @endo/no-polymorphic-call
        return /** @type {any} */ (backingDir).getQid();
      },
      async getAttrs() {
        reqDir();
        if (layerDir) return E(layerDir).getAttrs();
        return E(backingDir).getAttrs();
      },
      async setAttrs(updates) {
        reqDir();
        // Always write to the layer; if absent, copy-up the dir.
        if (!layerDir) {
          throw makeError(X`EROFS: layer absent — cannot setAttrs on backing-only directory`);
        }
        return E(layerDir).setAttrs(updates);
      },
      async watch() {
        // Merge watches: prefer the layer's (where most mutations
        // occur). v1 returns the layer's watcher only.
        if (layerDir) return E(layerDir).watch();
        return E(backingDir).watch();
      },
      async xattrs() {
        if (layerDir) return E(layerDir).xattrs();
        return E(backingDir).xattrs();
      },
      async lookup(name) {
        reqDir();
        // Filename whiteouts hide names; opaque marker hides backing.
        const layerNames = await layerEntries(layerDir);
        if (layerNames.has(whiteoutName(name))) {
          throw makeError(X`ENOENT: ${q(name)} (whiteout)`);
        }
        const opaque = layerNames.has(OPAQUE_NAME);
        if (layerNames.has(name)) {
          const lchild = await E(layerDir).lookup(name);
          const qid = await E(lchild).getQid();
          if (qid.type === 'directory') {
            let bchild = null;
            if (!opaque && backingDir) {
              bchild = await lookupSafe(backingDir, name);
              if (bchild) {
                const bqid = await E(bchild).getQid();
                if (bqid.type !== 'directory') bchild = null;
              }
            }
            return wrapDir(lchild, bchild, [...path, name]);
          }
          return lchild;
        }
        if (opaque) {
          throw makeError(X`ENOENT: ${q(name)}`);
        }
        if (backingDir) {
          const bchild = await lookupSafe(backingDir, name);
          if (bchild) {
            const bqid = await E(bchild).getQid();
            if (bqid.type === 'directory') {
              return wrapDir(null, bchild, [...path, name]);
            }
            return bchild;
          }
        }
        throw makeError(X`ENOENT: ${q(name)}`);
      },
      async list() {
        reqDir();
        // Build the merged set of entries.
        const layerNames = await layerEntries(layerDir);
        const opaque = layerNames.has(OPAQUE_NAME);
        /** @type {Map<string, { name: string, qid: any }>} */
        const merged = new Map();
        if (!opaque && backingDir) {
          const backingCursor = await E(backingDir).list();
          const stream = await E(backingCursor).stream();
          for await (const entry of /** @type {AsyncIterable<any>} */ (
            (await import('@endo/exo-stream/iterate-reader.js')).iterateReader(
              stream,
            )
          )) {
            if (!layerNames.has(whiteoutName(entry.name))) {
              merged.set(entry.name, entry);
            }
          }
        }
        for (const [name, entry] of layerNames) {
          if (name === OPAQUE_NAME) continue;
          if (isWhiteoutName(name)) {
            merged.delete(whiteoutTarget(name));
            continue;
          }
          merged.set(name, entry);
        }
        return makeExo('Cursor', CursorInterface, {
          async stream() {
            const gen = async function* () {
              for (const entry of merged.values()) {
                yield entry;
              }
            };
            return readerFromIterator(gen());
          },
          async skip(_n) {
            // no-op for simplicity; consumers can keep reading
          },
          async rewind() {
            // no-op
          },
          help: method =>
            method === undefined
              ? 'Cursor (composed directory).'
              : `No documentation for method "${method}".`,
        });
      },
      async create(name, opts) {
        reqDir();
        if (!layerDir) {
          throw makeError(
            X`EROFS: composed directory has no writable layer`,
          );
        }
        // Drop any whiteout marker for this name.
        const layerNames = await layerEntries(layerDir);
        if (layerNames.has(whiteoutName(name))) {
          try {
            await E(layerDir).unlink(whiteoutName(name));
          } catch {
            // ignore
          }
        }
        return E(layerDir).create(name, opts);
      },
      async mkdir(name, opts) {
        reqDir();
        if (!layerDir) {
          throw makeError(
            X`EROFS: composed directory has no writable layer`,
          );
        }
        const layerNames = await layerEntries(layerDir);
        if (layerNames.has(whiteoutName(name))) {
          try {
            await E(layerDir).unlink(whiteoutName(name));
          } catch {
            // ignore
          }
        }
        const newDir = await E(layerDir).mkdir(name, opts);
        return wrapDir(newDir, null, [...path, name]);
      },
      async unlink(name) {
        reqDir();
        // If the layer has the entry, remove it. If the backing has
        // it, mint a whiteout marker.
        const layerNames = await layerEntries(layerDir);
        if (layerNames.has(name)) {
          await E(layerDir).unlink(name);
          return;
        }
        let backingHas = false;
        if (backingDir) {
          backingHas = await hasName(backingDir, name);
        }
        if (!backingHas) {
          throw makeError(X`ENOENT: ${q(name)}`);
        }
        // Create whiteout in layer.
        if (!layerDir) {
          throw makeError(
            X`EROFS: no writable layer to record whiteout`,
          );
        }
        const opened = await E(layerDir).create(whiteoutName(name), {});
        // Stamp the whiteout file with the sentinel bytes.
        const writer = await E(opened).write(0n);
        const { iterateBytesWriter } = await import(
          '@endo/exo-stream/iterate-bytes-writer.js'
        );
        const w = iterateBytesWriter(writer);
        await w.next(new TextEncoder().encode(WHITEOUT_PREFIX));
        await w.return();
        await E(opened).close();
      },
      async rename(_old, _np, _n) {
        // Rename across a CoW boundary is non-trivial; defer.
        throw makeError(
          X`ENOSYS: rename in composed Filesystem not implemented (use copy + unlink instead)`,
        );
      },
      async fsync() {
        if (layerDir) await E(layerDir).fsync();
      },
      help: method =>
        method === undefined
          ? 'Directory (composed: CoW union of layer over backing).'
          : `No documentation for method "${method}".`,
    });
  }

  const fs = makeExo('Filesystem', FilesystemInterface, {
    async root() {
      const layerRoot = await E(layer).root();
      const backingRoot = await E(backing).root();
      return wrapDir(layerRoot, backingRoot, []);
    },
    async named(viewName) {
      throw makeError(
        X`ENOTSUP: compose has a single root, not ${q(viewName)}`,
      );
    },
    async statfs() {
      return E(layer).statfs();
    },
    help: method =>
      method === undefined
        ? 'Filesystem (compose: layer over backing, CoW union).'
        : `No documentation for method "${method}".`,
  });
  registerTags(
    fs,
    new Set([tag, ...tagsOf(layer), ...tagsOf(backing)]),
  );
  return fs;
};
harden(compose);
