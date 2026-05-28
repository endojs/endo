// @ts-check
/// <reference types="ses"/>

import { q } from '@endo/errors';
import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { readOnly as readOnlyFs, wrapBackend } from '@endo/endo-fs';

import { makeGitFsBackend } from './git-filesystem.js';
import { GitInterface } from './interfaces.js';
import { lineageOf } from './mount.js';

/**
 * @import {
 *   EndoGit,
 *   GitCommit,
 *   GitCreateBranchOptions,
 *   GitDeleteBranchOptions,
 *   GitDiffOptions,
 *   GitIndexStatus,
 *   GitLogOptions,
 *   GitMergeOptions,
 *   GitRebaseInput,
 *   GitRef,
 *   GitRestoreOptions,
 *   GitStashPushOptions,
 *   GitStatusEntry,
 *   GitWorktreeStatus,
 * } from './types.js'
 */

/**
 * Host-private map from daemon-minted Git exos to their mutability posture.
 * Trusted adjacent providers such as GitRemote can reject read-only Git caps
 * without adding a guest-visible inspection method.
 *
 * @type {WeakMap<object, boolean>}
 */
const gitReadOnly = new WeakMap();
/** @type {WeakMap<object, GitBackend>} */
const gitBackends = new WeakMap();

/**
 * Host-private accessor: returns whether a daemon-minted Git exo is
 * read-only, or undefined for fakes / remotes not minted in this vat.
 *
 * @param {unknown} git
 * @returns {boolean | undefined}
 */
export const isGitReadOnly = git =>
  gitReadOnly.get(/** @type {object} */ (git));
harden(isGitReadOnly);

/**
 * Host-private accessor for adjacent daemon providers such as GitRemote.
 * Returns undefined for fakes or Git caps not minted in this vat.
 *
 * @param {unknown} git
 * @returns {GitBackend | undefined}
 */
export const getGitBackend = git =>
  gitBackends.get(/** @type {object} */ (git));
harden(getGitBackend);

/**
 * Backend-facing row produced by `GitBackend.status`.  The public Git exo
 * wraps each `BackendStatusEntry` into a `GitStatusEntry` by minting an
 * `EndoMountEntry` for the path; the public type lives in `types.d.ts`.
 *
 * @typedef {object} BackendStatusEntry
 * @property {string} path
 * @property {GitIndexStatus} index
 * @property {GitWorktreeStatus} worktree
 * @property {string} [renamedFrom]
 */

/**
 * Backend-facing diff options.  The public Git exo collapses `GitRef`
 * values to strings and `entries` (EndoMountEntry[]) to repo-relative
 * `paths` before calling the backend.
 *
 * @typedef {object} GitBackendDiffOptions
 * @property {boolean} [cached]
 * @property {string} [base]
 * @property {string} [head]
 * @property {string[]} [paths]
 */

/**
 * Backend-facing log options.  Mirrors the public `GitLogOptions` after the
 * public Git exo collapses `GitRef | string` to a plain string.
 *
 * @typedef {object} GitBackendLogOptions
 * @property {number} [maxCount]
 * @property {string} [ref]
 * @property {string} [since]
 * @property {string} [until]
 */

/**
 * Backend-facing stash-push options.  The public Git exo resolves
 * `entries` to repo-relative `paths` before calling the backend.
 *
 * @typedef {object} GitBackendStashPushOptions
 * @property {string} [message]
 * @property {string[]} [paths]
 * @property {boolean} [includeUntracked]
 */

/**
 * Backend-facing contract.  Concrete backends (native git, future JS git
 * libraries, daemon-native commit storage) translate the structured
 * operations into their implementation-specific calls.  All path-bearing
 * inputs are pre-resolved to host-absolute strings by the public Git exo
 * before reaching the backend, so a backend never sees an unauthenticated
 * relative path or an unresolved `EndoMountEntry`.
 *
 * Phase 1 declares the contract; later phases implement the methods.
 *
 * @typedef {object} GitBackend
 * @property {() => Promise<void>} assertRepositoryRoot  Verifies the mount
 *   root is exactly a git worktree root (e.g. `git rev-parse --show-toplevel`
 *   equals the root).  Called by `provideGit` at formula instantiation.
 * @property {() => Promise<void>} assertNoExecutableRepoConfig  Refuses
 *   repository-local config that can execute code via filter or merge
 *   driver hooks before any worktree-mutation method runs.
 * @property {() => Promise<BackendStatusEntry[]>} status
 * @property {(opts?: GitBackendDiffOptions) => Promise<string>} diff
 * @property {(opts?: GitBackendLogOptions) => Promise<GitCommit[]>} log
 * @property {(ref: string) => Promise<string>} show
 * @property {(ref: string) => Promise<GitRef>} revParse
 * @property {(paths: string[]) => Promise<void>} add
 * @property {(paths: string[], opts?: GitRestoreOptions) => Promise<void>} restore
 * @property {(message: string) => Promise<GitCommit>} commit
 * @property {() => Promise<GitRef | undefined>} currentBranch
 * @property {() => Promise<GitRef[]>} branches
 * @property {(name: string, opts?: GitCreateBranchOptions) => Promise<GitRef>} createBranch
 * @property {(name: string, opts?: GitDeleteBranchOptions) => Promise<void>} deleteBranch
 * @property {(from: string, to: string) => Promise<void>} renameBranch
 * @property {(name: string) => Promise<void>} switchBranch
 * @property {(ref: string) => Promise<void>} detach
 * @property {(ref: string) => Promise<void>} switch
 * @property {(ref: string, opts?: GitMergeOptions) => Promise<string>} merge
 * @property {(input: GitRebaseInput) => Promise<string>} rebase
 * @property {(opts?: GitBackendStashPushOptions) => Promise<string>} stashPush
 * @property {() => Promise<string[]>} stashList
 * @property {(index?: number) => Promise<string>} stashShow
 * @property {(index?: number) => Promise<void>} stashApply
 * @property {(index?: number) => Promise<void>} stashPop
 * @property {(index?: number) => Promise<void>} stashDrop
 * @property {(ref: string) => Promise<unknown>} tree  Returns a
 *   `ReadableTree` exo for the given tree-ish; blobs implement
 *   `ReadableBlob`.
 * @property {(input: { url?: unknown, refspecs?: unknown, prune?: boolean, tags?: boolean, credential?: unknown, signal?: AbortSignal }) => Promise<object>} remoteFetch
 *   Fetch from a policy-bound remote URL.  The caller has already
 *   validated the URL and the refspecs against `GitRemote`'s policy;
 *   this method runs the underlying `git fetch` invocation through the
 *   sanitized environment.
 * @property {(input: { url?: unknown, refspecs?: unknown, setUpstream?: boolean, credential?: unknown, signal?: AbortSignal }) => Promise<object>} remotePush
 *   Push to a policy-bound remote URL with the same policy
 *   pre-validation contract as `remoteFetch`.
 * @property {(ref: string) => Promise<{ treeOid: string, commitOid?: string }>} resolveTree
 *   Resolve a ref to a canonical tree OID and (when applicable) the
 *   commit OID that points at it.  Used by `filesystemAt(ref)` at
 *   construction time so the resulting Filesystem is pinned to a
 *   specific tree OID and later ref movement does not affect it.
 * @property {(treeOid: string) => Promise<readonly GitTreeEntryRecord[]>} lsTree
 *   Enumerate entries at a tree OID.  The records are content-addressed
 *   and safe to cache per-OID.
 * @property {(blobOid: string) => Promise<Uint8Array>} readBlobBytes
 *   Read full bytes of a blob.
 * @property {(blobOid: string) => AsyncIterable<Uint8Array>} streamBlobBytes
 *   Stream blob bytes for range-read paths that should not buffer the
 *   full blob in memory.
 */

/**
 * Structural record describing one entry in a git tree object.  Mirrors
 * `git ls-tree -z --long` output: mode is the 6-digit octal string, type
 * is `'blob'` / `'tree'` / `'commit'`, oid is the 40-hex (sha1) or 64-hex
 * (sha256) object identifier, size is present for blobs only, and name
 * is the single-segment entry name (no slashes).
 *
 * @typedef {object} GitTreeEntryRecord
 * @property {string} mode
 * @property {'blob' | 'tree' | 'commit'} type
 * @property {string} oid
 * @property {number} [size]
 * @property {string} name
 */

/**
 * Construct the public Git capability exo.  Phase 1: methods are wired
 * to a backend but every backend method throws "not yet implemented"
 * until Phases 2-5 land them.  This commit establishes only the shape
 * and the authority boundary (the mount cap carries the public worktree
 * authority; the host-private backing grant the formula instantiator
 * used to derive this capability is not part of the public surface).
 *
 * @param {object} args
 * @param {object} args.mount  The `EndoMount` that carries the public
 *   worktree authority.  Returned by `worktree()`.
 * @param {GitBackend} args.backend
 * @param {boolean} [args.readOnly]  True when this Git cap is attenuated
 *   or was derived from a read-only mount.  Mutation methods throw before
 *   the backend can touch the worktree.
 * @returns {EndoGit}
 */
export const makeGit = ({ mount, backend, readOnly = false }) => {
  // The mount's lineage sentinel — used to verify that every entry
  // passed to a path-bearing Git method was minted by this Git's bound
  // mount, not by some other mount this guest may also hold.
  const mountLineage = lineageOf(mount);

  // Memoize `filesystemAt(ref)` on the canonical tree OID so repeated
  // calls within one Git instance return the same Filesystem cap (same
  // brand).  Brand identity matters for `compose` cycle detection in
  // `@endo/endo-fs`; without memoization, two `filesystemAt('HEAD')`
  // calls would compose as distinct participants even when HEAD has
  // not moved.  See `designs/endo-fs-from-git.md` § Brands.
  /** @type {Map<string, object>} */
  const filesystemByTreeOid = new Map();

  /**
   * Translate an array of EndoMountEntry caps into the repo-relative
   * path strings that the backend (and the underlying git binary)
   * accept.  Entries from a different mount lineage are rejected
   * before any path is exposed to git.
   *
   * @param {readonly object[]} entries
   * @returns {Promise<string[]>}
   */
  const entriesToRepoPaths = async entries => {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error(
        'entries must be a non-empty array of EndoMountEntry values',
      );
    }
    const paths = [];
    for (const entry of entries) {
      const otherLineage = lineageOf(/** @type {object} */ (entry));
      if (otherLineage === undefined) {
        throw new Error('entry is not an EndoMountEntry minted by this daemon');
      }
      if (otherLineage !== mountLineage) {
        throw new Error(
          'entry was minted by a different mount lineage and cannot be used here',
        );
      }
      // eslint-disable-next-line no-await-in-loop
      const segments = await E(entry).segments();
      paths.push(segments.join('/'));
    }
    return paths;
  };

  const assertWritable = methodName => {
    if (readOnly) {
      throw new Error(
        `Git.${methodName} is not permitted on a read-only Git capability`,
      );
    }
  };

  /**
   * @param {unknown} ref
   * @returns {string}
   */
  const refName = ref =>
    typeof ref === 'string' ? ref : /** @type {{ name: string }} */ (ref).name;

  /** @type {EndoGit} */
  let selfExo;

  const exo = makeExo('Git', GitInterface, {
    worktree() {
      return mount;
    },

    async status() {
      const raw = await backend.status();
      // Wrap each raw record into a GitStatusEntry.  The backend
      // produced repo-relative path strings; here we mint the
      // authority-bearing EndoMountEntry through the bound mount so
      // a caller can hold a path-bearing reference that's confined
      // to this worktree.
      const wrapped = await Promise.all(
        raw.map(async r => {
          const segments = r.path === '' ? [] : r.path.split('/');
          const entry = await E(mount).entry(segments);
          let node;
          try {
            node = await E(mount).lookup(entry);
          } catch (lookupError) {
            node = undefined;
            // A deleted path (in either the index or the worktree)
            // has no live node; a lookup failure is expected and
            // load-bearing for the GitStatusEntry shape (no `node`
            // field).  For every other status, the lookup should
            // have succeeded; surface the swallowed error on stderr
            // so a silent regression does not hide behind the
            // structured row.
            if (r.index !== 'deleted' && r.worktree !== 'deleted') {
              const detail =
                /** @type {Error} */ (lookupError).message ?? lookupError;
              console.error(
                `Git.status: lookup failed for ${q(r.path)} ` +
                  `(index=${q(r.index)}, worktree=${q(r.worktree)}): ${detail}`,
              );
            }
          }
          return harden({
            entry,
            path: r.path,
            index: r.index,
            worktree: r.worktree,
            ...(node !== undefined ? { node } : {}),
            ...(r.renamedFrom !== undefined
              ? { renamedFrom: r.renamedFrom }
              : {}),
          });
        }),
      );
      return harden(wrapped);
    },

    async diff(options = {}) {
      // Translate caller-supplied options to the backend shape:
      // - `base` and `head` accept GitRef-or-string; collapse to a
      //   string name the backend forwards to git unchanged.
      // - `entries` (EndoMountEntry[]) get resolved to repo-relative
      //   paths with the same lineage check `add` uses.  `paths`
      //   (string[]) passes through (callers can use either).
      const opts =
        /** @type {{ cached?: boolean, base?: unknown, head?: unknown, entries?: readonly object[], paths?: string[] }} */ (
          options
        );
      const resolved =
        /** @type {{ cached?: boolean, base?: string, head?: string, paths?: string[] }} */ ({});
      if (opts.cached !== undefined) resolved.cached = opts.cached;
      if (opts.base !== undefined) {
        resolved.base =
          typeof opts.base === 'string'
            ? opts.base
            : /** @type {{ name: string }} */ (opts.base).name;
      }
      if (opts.head !== undefined) {
        resolved.head =
          typeof opts.head === 'string'
            ? opts.head
            : /** @type {{ name: string }} */ (opts.head).name;
      }
      if (Array.isArray(opts.entries) && opts.entries.length > 0) {
        resolved.paths = await entriesToRepoPaths(opts.entries);
      } else if (Array.isArray(opts.paths) && opts.paths.length > 0) {
        resolved.paths = [...opts.paths];
      }
      return backend.diff(resolved);
    },

    async log(options = {}) {
      return backend.log(options);
    },

    async show(ref) {
      return backend.show(refName(ref));
    },

    async revParse(ref) {
      return backend.revParse(refName(ref));
    },

    async add(entries) {
      assertWritable('add');
      const paths = await entriesToRepoPaths(entries);
      return backend.add(paths);
    },

    async restore(entries, options = {}) {
      assertWritable('restore');
      const paths = await entriesToRepoPaths(entries);
      return backend.restore(paths, options);
    },

    async commit(message) {
      assertWritable('commit');
      return backend.commit(message);
    },

    async currentBranch() {
      return backend.currentBranch();
    },

    async branches() {
      return backend.branches();
    },

    async createBranch(name, options = {}) {
      assertWritable('createBranch');
      return backend.createBranch(name, options);
    },

    async deleteBranch(name, options = {}) {
      assertWritable('deleteBranch');
      return backend.deleteBranch(name, options);
    },

    async renameBranch(from, to) {
      assertWritable('renameBranch');
      return backend.renameBranch(from, to);
    },

    async switchBranch(name) {
      assertWritable('switchBranch');
      return backend.switchBranch(name);
    },

    async detach(ref) {
      assertWritable('detach');
      return backend.detach(refName(ref));
    },

    async switch(ref) {
      assertWritable('switch');
      return backend.switch(refName(ref));
    },

    async merge(ref, options = {}) {
      assertWritable('merge');
      return backend.merge(refName(ref), options);
    },

    async rebase(input) {
      assertWritable('rebase');
      return backend.rebase(input);
    },

    async stashPush(options = {}) {
      assertWritable('stashPush');
      const opts =
        /** @type {{ message?: string, entries?: readonly object[], paths?: string[], includeUntracked?: boolean }} */ (
          options
        );
      const resolved =
        /** @type {{ message?: string, paths?: string[], includeUntracked?: boolean }} */ ({});
      if (opts.message !== undefined) resolved.message = opts.message;
      if (opts.includeUntracked !== undefined) {
        resolved.includeUntracked = opts.includeUntracked;
      }
      if (Array.isArray(opts.entries) && opts.entries.length > 0) {
        resolved.paths = await entriesToRepoPaths(opts.entries);
      } else if (Array.isArray(opts.paths) && opts.paths.length > 0) {
        resolved.paths = [...opts.paths];
      }
      return backend.stashPush(resolved);
    },

    async stashList() {
      return backend.stashList();
    },

    async stashShow(index) {
      return backend.stashShow(index);
    },

    async stashApply(index) {
      assertWritable('stashApply');
      return backend.stashApply(index);
    },

    async stashPop(index) {
      assertWritable('stashPop');
      return backend.stashPop(index);
    },

    async stashDrop(index) {
      assertWritable('stashDrop');
      return backend.stashDrop(index);
    },

    async tree(ref) {
      return backend.tree(refName(ref));
    },

    async filesystemAt(ref) {
      const { treeOid, commitOid } = await backend.resolveTree(refName(ref));
      const cached = filesystemByTreeOid.get(treeOid);
      if (cached !== undefined) {
        return cached;
      }
      const fsBackend = makeGitFsBackend({ backend, treeOid });
      const description =
        commitOid !== undefined
          ? `git-tree (commit ${commitOid}, tree ${treeOid})`
          : `git-tree (${treeOid})`;
      const fs = readOnlyFs(wrapBackend(fsBackend, { description }));
      filesystemByTreeOid.set(treeOid, fs);
      return fs;
    },

    readOnly() {
      if (readOnly) {
        return selfExo;
      }
      return makeGit({ mount, backend, readOnly: true });
    },
  });

  const typed = /** @type {EndoGit} */ (/** @type {unknown} */ (exo));
  gitReadOnly.set(typed, readOnly);
  gitBackends.set(typed, backend);
  selfExo = typed;
  return typed;
};
harden(makeGit);

/**
 * Phase 1 stub backend.  Every method throws "not yet implemented".
 * Phase 2 replaces this with `makeNativeGitBackend` which runs the
 * sanitized git binary in a confined environment derived from the
 * fae-git-tool-reference work.
 *
 * @returns {GitBackend}
 */
export const makeNotYetImplementedBackend = () => {
  const fail = name => {
    throw new Error(`Git backend method ${q(name)} is not yet implemented`);
  };
  return harden({
    assertRepositoryRoot: async () => undefined,
    assertNoExecutableRepoConfig: async () =>
      fail('assertNoExecutableRepoConfig'),
    status: async () => fail('status'),
    diff: async () => fail('diff'),
    log: async () => fail('log'),
    show: async () => fail('show'),
    revParse: async () => fail('revParse'),
    add: async () => fail('add'),
    restore: async () => fail('restore'),
    commit: async () => fail('commit'),
    currentBranch: async () => fail('currentBranch'),
    branches: async () => fail('branches'),
    createBranch: async () => fail('createBranch'),
    deleteBranch: async () => fail('deleteBranch'),
    renameBranch: async () => fail('renameBranch'),
    switchBranch: async () => fail('switchBranch'),
    detach: async () => fail('detach'),
    switch: async () => fail('switch'),
    merge: async () => fail('merge'),
    rebase: async () => fail('rebase'),
    stashPush: async () => fail('stashPush'),
    stashList: async () => fail('stashList'),
    stashShow: async () => fail('stashShow'),
    stashApply: async () => fail('stashApply'),
    stashPop: async () => fail('stashPop'),
    stashDrop: async () => fail('stashDrop'),
    tree: async () => fail('tree'),
    remoteFetch: async () => fail('remoteFetch'),
    remotePush: async () => fail('remotePush'),
    resolveTree: async () => fail('resolveTree'),
    lsTree: async () => fail('lsTree'),
    readBlobBytes: async () => fail('readBlobBytes'),
    streamBlobBytes: () => {
      fail('streamBlobBytes');
      // Unreachable; satisfies the typedef's async-iterable return.
      return /** @type {AsyncIterable<Uint8Array>} */ ({
        [Symbol.asyncIterator]() {
          return {
            async next() {
              return { done: true, value: undefined };
            },
          };
        },
      });
    },
  });
};
harden(makeNotYetImplementedBackend);
