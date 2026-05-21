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
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';

import {
  FilesystemInterface,
  DirectoryInterface,
  CursorInterface,
  NodeWatcherInterface,
} from './type-guards.js';
import { materialiseViaWalk, mintBrand } from './shared/helpers.js';

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

const fresh = () => Symbol('endo-fs:tag');

/**
 * Build a `NodeWatcher` that subscribes to each of `participants`'
 * `watch()` and interleaves their events into one stream. `cancel()`
 * cancels every participant's underlying watcher.
 *
 * @param {object[]} participants  caps to call `.watch()` on
 */
const makeMergedWatcher = async participants => {
  const watchers = await Promise.all(participants.map(p => E(p).watch()));
  const streams = await Promise.all(watchers.map(w => E(w).events()));

  /** @type {any[]} */
  const queue = [];
  /** @type {Array<(r: IteratorResult<any>) => void>} */
  const waiters = [];
  let active = streams.length;
  let cancelled = false;

  const yieldNext = value => {
    if (waiters.length > 0) {
      const w = /** @type {(r: IteratorResult<any>) => void} */ (
        waiters.shift()
      );
      w({ value, done: false });
    } else {
      queue.push(value);
    }
  };

  const finishOne = () => {
    active -= 1;
    if (active <= 0 && waiters.length > 0) {
      for (const w of waiters) w({ value: undefined, done: true });
      waiters.length = 0;
    }
  };

  for (const stream of streams) {
    void (async () => {
      try {
        for await (const ev of iterateReader(stream)) {
          if (cancelled) break;
          yieldNext(ev);
        }
      } catch {
        // Swallow per-participant failures; the merge stays alive
        // as long as any participant produces events.
      } finally {
        finishOne();
      }
    })();
  }

  const cancelAll = async () => {
    cancelled = true;
    await Promise.allSettled(watchers.map(w => E(w).cancel()));
    // Unblock anyone still waiting.
    for (const w of waiters) w({ value: undefined, done: true });
    waiters.length = 0;
  };

  const mergedIter = harden({
    async next() {
      if (queue.length > 0) {
        return harden({ value: queue.shift(), done: false });
      }
      if (active <= 0 || cancelled) {
        return harden({ value: undefined, done: true });
      }
      return new Promise(resolve => waiters.push(resolve));
    },
    async return(value) {
      await cancelAll();
      return harden({ value, done: true });
    },
    [Symbol.asyncIterator]() {
      return mergedIter;
    },
  });

  return makeExo('NodeWatcher', NodeWatcherInterface, {
    async events() {
      return readerFromIterator(mergedIter);
    },
    async cancel() {
      await cancelAll();
    },
  });
};

/**
 * Aggregate `statfs` results across a set of participants. Each
 * participant's stats are summed, so a `namespace({ a, b })`
 * reports the union of the two mounts' totals and free space. For
 * `compose(layer, backing)` the sum represents "what's reachable
 * across the union"; writes still only target the layer, so a
 * caller treating `freeBytes` as writable headroom should consult
 * the layer's `statfs` directly when that distinction matters.
 *
 * @param {object[]} participants
 */
const aggregateStatfs = async participants => {
  const results = await Promise.allSettled(
    participants.map(p => E(p).statfs()),
  );
  let totalBytes = 0n;
  let freeBytes = 0n;
  let availableBytes = 0n;
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const v = /** @type {any} */ (r.value);
    if (typeof v.totalBytes === 'bigint') totalBytes += v.totalBytes;
    if (typeof v.freeBytes === 'bigint') freeBytes += v.freeBytes;
    if (typeof v.availableBytes === 'bigint') {
      availableBytes += v.availableBytes;
    }
  }
  return harden({ totalBytes, freeBytes, availableBytes });
};

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

/**
 * Resolve the brand-union of `participants` (each participant's
 * `brands()` is a `bigint[]`). If any brand appears under more
 * than one participant, throws — that's the cross-CapTP cycle the
 * Symbol-based check (which keys on per-presence identity) misses.
 * Participants that don't expose `brands()` are tolerated as
 * brand-less (best-effort: they don't contribute to the check).
 *
 * @param {string} primitive  composer name, for the error message
 * @param {object[]} participants
 * @returns {Promise<readonly bigint[]>}  union of every participant's brands
 */
const computeBrands = async (primitive, participants) => {
  const lists = await Promise.all(
    participants.map(async p => {
      try {
        return /** @type {readonly bigint[]} */ (await E(p).brands());
      } catch {
        // Participant isn't endo-fs-compatible (no `brands()` method);
        // treat as brand-less for the cycle check.
        return [];
      }
    }),
  );
  const seen = new Set();
  for (const list of lists) {
    for (const b of list) {
      if (seen.has(b)) {
        throw makeError(
          X`${q(primitive)}: participants share brand ${q(b)} — cycle detected (cross-CapTP)`,
        );
      }
      seen.add(b);
    }
  }
  return harden([...seen]);
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
      async materialise(path, _opts) {
        if (Array.isArray(path) && path.length === 0) return makeEmptyDir();
        throw reject('materialise');
      },
      async watchFrom() {
        // emptyFilesystem is immutable; return a fresh empty
        // cursor + the (never-firing) watcher that `watch()` returns.
        const watcher = makeExo('NodeWatcher', NodeWatcherInterface, {
          async events() {
            const empty = async function* () {
              // emptyFilesystem is immutable; no events.
            };
            return readerFromIterator(empty());
          },
          async cancel() {
            // nothing to cancel
          },
        });
        return harden({ cursor: makeEmptyCursor(), watcher });
      },
      help: method =>
        method === undefined
          ? 'Directory (emptyFilesystem): always empty.'
          : `No documentation for method "${method}".`,
    });
  }

  const emptyBrands = harden([mintBrand()]);

  const fs = makeExo('Filesystem', FilesystemInterface, {
    async root() {
      return root();
    },
    async named(viewName) {
      throw makeError(
        X`ENOTSUP: emptyFilesystem has a single root, not ${q(viewName)}`,
      );
    },
    async brands() {
      return emptyBrands;
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
    if (
      typeof seg !== 'string' ||
      seg.length === 0 ||
      seg === '.' ||
      seg === '..'
    ) {
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
      throw makeError(X`ENOTSUP: chroot has a single root, not ${q(viewName)}`);
    },
    async statfs() {
      return E(fs).statfs();
    },
    async brands() {
      // chroot is a path-relative view of `fs`; cycle-wise it IS `fs`.
      return E(fs).brands();
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
    // eslint-disable-next-line no-use-before-define
    const exo = makeExo('Directory', DirectoryInterface, {
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
      async materialise(path, opts) {
        return materialiseViaWalk(exo, path, opts);
      },
      async watchFrom() {
        // Forward to the wrapped host dir; the host owns events
        // and entries at this position. Atomicity is the host's
        // responsibility — bind is just a path-aware wrapper.
        return E(dir).watchFrom();
      },
      help: method =>
        method === undefined
          ? 'Directory (bind-wrapping).'
          : `No documentation for method "${method}".`,
    });
    return exo;
  }

  // Async brand-based cycle check + cached union. Runs in the
  // background; any user-facing method (root, statfs, named, brands)
  // awaits the result so a cross-CapTP cycle surfaces before any
  // mutation. See ROADMAP §1.6.
  const brandsP = computeBrands('bind', [host, guest]);
  // Don't leave unhandled rejections — consumers see the error via
  // `await brandsP` inside the methods below.
  brandsP.catch(() => {});

  const fs = makeExo('Filesystem', FilesystemInterface, {
    async root() {
      await brandsP;
      const r = await E(host).root();
      return wrap(r, 0);
    },
    async named(viewName) {
      await brandsP;
      throw makeError(X`ENOTSUP: bind has a single root, not ${q(viewName)}`);
    },
    async statfs() {
      await brandsP;
      return aggregateStatfs([host, guest]);
    },
    async brands() {
      return brandsP;
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
      async materialise(path, opts) {
        if (!Array.isArray(path)) {
          throw makeError(X`EINVAL: materialise path must be an array`);
        }
        if (path.length === 0) return makeNamespaceRoot();
        // First segment selects a mount; remaining segments are
        // materialised under that mount's root.
        const [head, ...rest] = path;
        const mount = mounts[head];
        if (!mount) throw makeError(X`ENOENT: ${q(head)}`);
        const mountRoot = await E(mount).root();
        if (rest.length === 0) return mountRoot;
        return E(mountRoot).materialise(rest, opts || {});
      },
      async watchFrom() {
        // The namespace root is fixed (the mount set doesn't
        // change at runtime); pair a fresh entries cursor with the
        // same never-firing watcher `watch()` returns.
        const watcher = makeExo('NodeWatcher', NodeWatcherInterface, {
          async events() {
            const empty = async function* () {
              // namespace root is fixed; no events.
            };
            return readerFromIterator(empty());
          },
          async cancel() {
            // namespace root is fixed; nothing to cancel.
          },
        });
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
        const cursor = makeExo('Cursor', CursorInterface, {
          async stream() {
            return readerFromIterator(gen());
          },
          async skip(_n) {
            // no-op: cursor is single-shot for namespace root
          },
          async rewind() {
            // no-op
          },
          help: m =>
            m === undefined
              ? 'Cursor (namespace root watchFrom snapshot).'
              : `No documentation for method "${m}".`,
        });
        return harden({ cursor, watcher });
      },
      help: method =>
        method === undefined
          ? 'Directory (namespace root): synthetic with named mounts.'
          : `No documentation for method "${method}".`,
    });

  // Async brand-based cycle check + cached union of participant
  // brands. Methods below gate on this so a cross-CapTP cycle
  // surfaces before the namespace is used.
  const brandsP = computeBrands('namespace', participants);
  brandsP.catch(() => {});

  const fs = makeExo('Filesystem', FilesystemInterface, {
    async root() {
      await brandsP;
      return makeNamespaceRoot();
    },
    async named(viewName) {
      await brandsP;
      const m = mounts[viewName];
      if (!m) throw makeError(X`ENOENT: ${q(viewName)}`);
      return E(m).root();
    },
    async statfs() {
      await brandsP;
      return aggregateStatfs(participants);
    },
    async brands() {
      return brandsP;
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
 * @param {object} layer    a endo-fs Filesystem (writable)
 * @param {object} backing  a endo-fs Filesystem (any)
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
  // as the marker channel: a file with xattr `user.endo-fs-whiteout`
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
   * Copy a single file by name from one Directory cap into another.
   * Used by the file branch of `compose.rename` and as the leaf of
   * recursive directory rename.
   *
   * @param {object} srcFile
   * @param {object} dstParent
   * @param {string} dstName
   */
  const copyFileTo = async (srcFile, dstParent, dstName) => {
    const srcOh = await E(srcFile).open({ read: true });
    try {
      const dstOh = await E(dstParent).create(dstName, {});
      try {
        const attrs = await E(srcFile).getAttrs();
        const size = /** @type {bigint} */ (attrs.size);
        if (size > 0n) {
          // Read the full source in one batch; chunked emission
          // for very large files is deferred (same caveat as
          // `Layer.apply` — ROADMAP §2.2 streaming).
          const reader = await E(srcOh).read(0n, size);
          const writer = await E(dstOh).write(0n);
          const w = iterateBytesWriter(writer);
          for await (const chunk of iterateBytesReader(reader)) {
            await w.next(chunk);
          }
          await w.return();
        }
      } finally {
        await E(dstOh).close();
      }
    } finally {
      await E(srcOh).close();
    }
  };

  /**
   * Recursively copy every entry visible through `srcDir` into
   * `dstDir`. Directories are materialised under `dstDir`; files
   * are copied via `copyFileTo`. Iterates the composed view's
   * `list()` so layer/backing semantics (whiteouts, opaque
   * markers) flow naturally.
   *
   * @param {object} srcDir
   * @param {object} dstDir
   */
  const copyDirInto = async (srcDir, dstDir) => {
    const cursor = await E(srcDir).list();
    const stream = await E(cursor).stream();
    /** @type {Array<{ name: string, qid: any }>} */
    const entries = [];
    for await (const entry of iterateReader(stream)) {
      entries.push(/** @type {any} */ (entry));
    }
    for (const { name, qid } of entries) {
      if (qid.type === 'directory') {
        const subDst = await E(dstDir).materialise([name], {});
        const subSrc = await E(srcDir).lookup(name);
        // eslint-disable-next-line no-await-in-loop
        await copyDirInto(subSrc, subDst);
      } else if (qid.type === 'file') {
        const file = await E(srcDir).lookup(name);
        // eslint-disable-next-line no-await-in-loop
        await copyFileTo(file, dstDir, name);
      }
    }
  };

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
    for await (const entry of iterateReader(stream)) {
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
    for await (const entry of iterateReader(stream)) {
      out.set(entry.name, entry);
    }
    return out;
  };

  /**
   * @param {object | null} initialLayerDir
   * @param {object | null} backingDir
   * @param {string[]} path
   */
  function makeComposedDir(initialLayerDir, backingDir, path) {
    let layerDir = initialLayerDir;
    const reqDir = () => {
      if (!layerDir && !backingDir) {
        throw makeError(X`ENOENT: composed directory not present`);
      }
    };

    // Auto-copy-up: when the layer doesn't yet have a directory at
    // this composed path but a mutation arrives, walk the layer from
    // root and `mkdir` each missing segment to mint a matching
    // directory chain. EEXIST along the way is benign — only the
    // leaf needs to be writable. Returns the layer Directory cap at
    // `path`, and caches it on the closure so subsequent mutations
    // skip the walk.
    const materializeLayerDir = async () => {
      if (layerDir) return layerDir;
      let cur = await E(layer).root();
      for (const seg of path) {
        try {
          cur = await E(cur).mkdir(seg, {});
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!/EEXIST/.test(msg)) throw e;
          cur = await E(cur).lookup(seg);
        }
      }
      layerDir = cur;
      return cur;
    };
    // eslint-disable-next-line no-use-before-define
    const composedExo = makeExo('Directory', DirectoryInterface, {
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
        const ld = await materializeLayerDir();
        return E(ld).setAttrs(updates);
      },
      async watch() {
        const participants = [];
        if (layerDir) participants.push(layerDir);
        if (backingDir) participants.push(backingDir);
        if (participants.length === 0) {
          throw makeError(X`ENOENT: composed directory not present`);
        }
        if (participants.length === 1) return E(participants[0]).watch();
        return makeMergedWatcher(participants);
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
          for await (const entry of iterateReader(stream)) {
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
        const ld = await materializeLayerDir();
        // Drop any whiteout marker for this name.
        const layerNames = await layerEntries(ld);
        if (layerNames.has(whiteoutName(name))) {
          try {
            await E(ld).unlink(whiteoutName(name));
          } catch {
            // ignore
          }
        }
        return E(ld).create(name, opts);
      },
      async mkdir(name, opts) {
        reqDir();
        const ld = await materializeLayerDir();
        const layerNames = await layerEntries(ld);
        if (layerNames.has(whiteoutName(name))) {
          try {
            await E(ld).unlink(whiteoutName(name));
          } catch {
            // ignore
          }
        }
        const newDir = await E(ld).mkdir(name, opts);
        return wrapDir(newDir, null, [...path, name]);
      },
      async unlink(name) {
        reqDir();
        // If the layer has the entry, remove it. If the backing has
        // it, mint a whiteout marker (after materializing the layer
        // chain so the marker has somewhere to live).
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
        const ld = await materializeLayerDir();
        const opened = await E(ld).create(whiteoutName(name), {});
        // Stamp the whiteout file with the sentinel bytes.
        const writer = await E(opened).write(0n);
        const w = iterateBytesWriter(writer);
        await w.next(new TextEncoder().encode(WHITEOUT_PREFIX));
        await w.return();
        await E(opened).close();
      },
      async rename(oldName, newParent, newName) {
        reqDir();
        // CoW rename is copy + unlink. Source bytes come from layer
        // (if present) or backing; destination is materialised via
        // `newParent` so a CoW destination picks up auto-copy-up too.
        // For directories, we recursively copy the subtree (layer +
        // backing merged through the composed view) into a fresh
        // destination directory before whiteouting the source.
        const layerNames = await layerEntries(layerDir);
        if (layerNames.has(whiteoutName(oldName))) {
          throw makeError(X`ENOENT: ${q(oldName)} (whiteout)`);
        }
        const opaque = layerNames.has(OPAQUE_NAME);
        let src = null;
        if (layerNames.has(oldName)) {
          src = await E(layerDir).lookup(oldName);
        } else if (!opaque && backingDir) {
          src = await lookupSafe(backingDir, oldName);
        }
        if (!src) {
          throw makeError(X`ENOENT: ${q(oldName)}`);
        }
        const srcQid = await E(src).getQid();
        if (srcQid.type === 'file') {
          // Copy file bytes through the composed view.
          // eslint-disable-next-line no-use-before-define
          await copyFileTo(src, newParent, newName);
        } else if (srcQid.type === 'directory') {
          // Recursively materialise the destination subtree and
          // copy every visible entry from the composed source.
          // The composed `src` already handles layer+backing
          // semantics (whiteouts, opaque markers, merged list).
          const dstDir = await E(newParent).materialise([newName], {});
          // eslint-disable-next-line no-use-before-define
          await copyDirInto(src, dstDir);
        } else {
          throw makeError(
            X`ENOSYS: rename of non-file/non-directory ${q(oldName)}`,
          );
        }

        // Remove the source. If only the layer has it, drop the
        // entry; otherwise mint a whiteout so the backing entry
        // doesn't shine through.
        if (layerNames.has(oldName)) {
          await E(layerDir).unlink(oldName);
        }
        let backingHas = false;
        if (backingDir && !opaque) {
          backingHas = await hasName(backingDir, oldName);
        }
        if (backingHas) {
          const ld = await materializeLayerDir();
          // After materialization, the whiteout file lands in the
          // layer. If a same-name layer entry was just removed above,
          // the whiteout creates a fresh marker.
          const opened = await E(ld).create(whiteoutName(oldName), {});
          const writer = await E(opened).write(0n);
          const w = iterateBytesWriter(writer);
          await w.next(new TextEncoder().encode(WHITEOUT_PREFIX));
          await w.return();
          await E(opened).close();
        }
      },
      async fsync() {
        if (layerDir) await E(layerDir).fsync();
      },
      async materialise(p, opts) {
        return materialiseViaWalk(composedExo, p, opts);
      },
      async watchFrom() {
        // Atomic: build the merged watcher across whichever
        // participants are present at this composed path, then
        // mint the composed-view cursor. Both come from the
        // composed wrapper itself, so the existing composed-
        // semantics (whiteouts, opaque markers, merged listing)
        // apply uniformly.
        const participants = [];
        if (layerDir) participants.push(layerDir);
        if (backingDir) participants.push(backingDir);
        if (participants.length === 0) {
          throw makeError(X`ENOENT: composed directory not present`);
        }
        const watcher =
          participants.length === 1
            ? await E(participants[0]).watch()
            : await makeMergedWatcher(participants);
        const cursor = await E(composedExo).list();
        return harden({ cursor, watcher });
      },
      help: method =>
        method === undefined
          ? 'Directory (composed: CoW union of layer over backing).'
          : `No documentation for method "${method}".`,
    });
    return composedExo;
  }

  // Async brand-based cycle check + cached union. The CoW union of
  // a Filesystem with itself (or with a CapTP-mediated copy of
  // itself) creates a cycle the Symbol-based check can't see; this
  // catches it before any layer mutation lands.
  const brandsP = computeBrands('compose', [layer, backing]);
  brandsP.catch(() => {});

  const fs = makeExo('Filesystem', FilesystemInterface, {
    async root() {
      await brandsP;
      const layerRoot = await E(layer).root();
      const backingRoot = await E(backing).root();
      return wrapDir(layerRoot, backingRoot, []);
    },
    async named(viewName) {
      await brandsP;
      throw makeError(
        X`ENOTSUP: compose has a single root, not ${q(viewName)}`,
      );
    },
    async statfs() {
      await brandsP;
      return aggregateStatfs([layer, backing]);
    },
    async brands() {
      return brandsP;
    },
    help: method =>
      method === undefined
        ? 'Filesystem (compose: layer over backing, CoW union).'
        : `No documentation for method "${method}".`,
  });
  registerTags(fs, new Set([tag, ...tagsOf(layer), ...tagsOf(backing)]));
  return fs;
};
harden(compose);
