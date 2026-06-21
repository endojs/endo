// @ts-check
/* eslint-disable no-await-in-loop */

// THE STORE for the Preact file-explorer rewrite. A faithful port of the
// imperative `mountFileExplorer` closure (../file-explorer.js, L232–1936): same
// behaviour, same helper calls, same capability discipline — only the
// `render()` / `renderToolbar()` / `renderViewer()` side effects are replaced by
// immutable state updates that drive Preact re-renders.
//
// Capability discipline (see CONTRACT.md): this hook owns ALL authority — the
// resolved endo powers and every fs/git/layer/mount cap. The public surface is
// EXACTLY `FileExplorerStore`; view components consume only that.

import {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from 'preact/hooks';
import { E } from '@endo/far';

import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import { buildUnifiedDiffSection } from '../layer-diff.js';
import {
  applyLayer,
  classifyCapability,
  collectLayerOps,
  createDirectory,
  createFile,
  decodeText,
  getRoot,
  gitWorktreeMount,
  listDirectory,
  listMountDirectory,
  lookupChild,
  makeCachedFilesystem,
  readFile,
  removeEntry,
  renameEntry,
  subscribeChanges,
  toFilesystem,
  writeFileText,
} from '../file-explorer-fs.js';

/**
 * @import { DirEntry } from '../file-explorer-fs.js'
 * @import {
 *   Cap,
 *   Source,
 *   BrowserColumn,
 *   SelectedFile,
 *   LayerDiffView,
 *   InvItem,
 *   DialogOptions,
 *   DialogRequest,
 *   FileExplorerState,
 *   FileExplorerActions,
 *   FileExplorerFeatures,
 *   FileExplorerStore,
 * } from './types.js'
 */

// File URLs for the endo-fs caplet modules the daemon uses to formulate
// filesystem/layer/read-only caps. Injected at Vite build time; falsy at runtime
// when loaded outside the Vite dev server (in which case the "Save" actions
// degrade with a clear error rather than a cryptic marshaller failure).
const ENDO_FS_IN_MEMORY_MODULE_URL =
  // @ts-ignore Vite injects this at build time
  import.meta.env?.ENDO_FS_IN_MEMORY_PATH || '';
const ENDO_FS_READONLY_MODULE_URL =
  // @ts-ignore Vite injects this at build time
  import.meta.env?.ENDO_FS_READONLY_PATH || '';
const ENDO_FS_LAYER_MODULE_URL =
  // @ts-ignore Vite injects this at build time
  import.meta.env?.ENDO_FS_LAYER_PATH || '';

const KEY_SEP = '\u0000';
const NAME_PATTERN = /^[^/\0]+$/;
const LIVE_REFRESH_DELAY = 200;
// Sentinel `gitRef` for "browse the live writable worktree" (vs. a branch name
// or commit oid, which open read-only via filesystemAt).
const GIT_WORKTREE = ' worktree'; // leading space: never a valid git ref
// Cap on commits listed in the revision picker.
const GIT_LOG_LIMIT = 20;
// Sentinel choice value for the "(layer backing)" entry in the Apply-layer
// dialog (pet names can't contain `__`-bracketed sentinels, so it can't collide).
const APPLY_BACKING_CHOICE = '__layer-backing__';

/**
 * @param {string[]} path
 * @returns {string}
 */
const pathKey = path => path.join(KEY_SEP);

/**
 * @param {string} key
 * @returns {string[]}
 */
const keyToPath = key => (key === '' ? [] : key.split(KEY_SEP));

/**
 * If `path` starts with `[...oldPrefix, oldName]`, rewrite it to start with
 * `[...newPrefix, newName]` (preserving any deeper segments). Otherwise return
 * `path` unchanged.
 *
 * @param {string[]} path
 * @param {string[]} oldPrefix
 * @param {string} oldName
 * @param {string[]} newPrefix
 * @param {string} newName
 * @returns {string[]}
 */
const rewritePath = (path, oldPrefix, oldName, newPrefix, newName) => {
  if (path.length <= oldPrefix.length) return path;
  if (path[oldPrefix.length] !== oldName) return path;
  for (let i = 0; i < oldPrefix.length; i += 1) {
    if (path[i] !== oldPrefix[i]) return path;
  }
  return [...newPrefix, newName, ...path.slice(oldPrefix.length + 1)];
};

/**
 * @param {string} name
 * @returns {boolean}
 */
const validName = name =>
  name.length > 0 && name !== '.' && name !== '..' && NAME_PATTERN.test(name);

/**
 * Extract a human-readable message from a thrown value. CapTP/cross-peer
 * rejections can arrive as error-like objects that are NOT `instanceof Error` in
 * this realm; `String()` on those yields a useless "[object Object]", so prefer a
 * `.message` field and fall back to a JSON dump before `String()`.
 *
 * @param {unknown} error
 * @returns {string}
 */
const errorMessage = error => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const { message } = /** @type {{ message?: unknown }} */ (error);
    if (typeof message === 'string' && message !== '') return message;
    try {
      return JSON.stringify(error);
    } catch {
      // Not JSON-serializable (e.g. a presence); fall through to String().
    }
  }
  return String(error);
};

/**
 * The initial reactive snapshot.
 *
 * @returns {FileExplorerState}
 */
const initialState = () => ({
  sources: [],
  activeSourceId: null,
  viewMode: 'columns',
  viewerCollapsed: true,
  viewerWidth: 440,
  activePath: [],
  columns: [],
  expandedDirs: new Set(),
  treeChildren: new Map(),
  treeLoadingDirs: new Set(),
  treeCurrentDir: [],
  selectedFile: null,
  editing: false,
  viewerLoading: false,
  layerDiff: null,
  viewerMode: 'file',
  status: { message: '', kind: '' },
  busy: false,
  invItems: new Map(),
  dialog: null,
});

/**
 * The store hook. Owns all authority (powers + every fs/git/layer/mount cap) and
 * exposes exactly `FileExplorerStore`.
 *
 * `profilePath` is walked from `powers` once, lazily, to get a host cap for the
 * current profile. The inventory sidebar, the "Open by pet name" dialog, and the
 * "Save as…" actions all operate against that profile-resolved host. When
 * `profilePath` is empty we use `powers` directly.
 *
 * @param {Cap} powers - the resolved root endo powers
 * @param {string[]} [profilePath]
 * @returns {FileExplorerStore}
 */
export function useFileExplorer(powers, profilePath = []) {
  const [state, setState] = useState(initialState);

  // `stateRef` mirrors the latest snapshot so async actions read fresh values
  // rather than the stale closure capture. Every mutation funnels through
  // `update`, which both advances the ref and schedules a Preact re-render.
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * Produce the next snapshot from the current one and commit it.
   *
   * @param {Partial<FileExplorerState>} patch
   */
  const update = useCallback(patch => {
    const next = { ...stateRef.current, ...patch };
    stateRef.current = next;
    setState(next);
  }, []);

  // ---- mutable, non-reactive bookkeeping (refs) -------------------------

  // Profile-resolved host cap (a promise, so chained lookup/storeValue calls
  // pipeline through CapTP). Cached because every open/save/inventory wants it.
  /** @type {{ current: Promise<Cap> | null }} */
  const profileHostRef = useRef(null);
  const resolveProfileHost = useCallback(() => {
    if (profileHostRef.current) return profileHostRef.current;
    let cap = /** @type {Promise<Cap>} */ (Promise.resolve(powers));
    for (const seg of profilePath) {
      cap = /** @type {Promise<Cap>} */ (E(cap).lookup(seg));
    }
    profileHostRef.current = cap;
    return cap;
    // `powers` / `profilePath` are fixed for the hook's lifetime.
  }, []);

  const sourceCounterRef = useRef(0);
  // Shared directory-capability promise cache for the active source. Promises
  // (not resolved caps) so chained lookups pipeline.
  /** @type {{ current: Map<string, Cap> }} */
  const dirCapCacheRef = useRef(new Map());
  // Git worktree mount points recorded for the active source's column path.
  // When a git workspace child is opened in columns mode, its worktree is
  // mounted and recorded here keyed by the workspace's column-path; paths at or
  // under that point resolve through the worktree instead of the base source,
  // so the Miller columns continue into the worktree rather than reopening it
  // as a fresh source. Reset with the dir-cap cache whenever the source changes.
  /** @type {{ current: Map<string, { mountPoint: string[], mount: Cap, filesystem: Cap }> }} */
  const gitMountsRef = useRef(new Map());
  const busyCountRef = useRef(0);

  // ---- small helpers ----------------------------------------------------

  /**
   * Drop the directory-capability cache, then re-seed the root of every active
   * git worktree mount so paths nested inside a git workspace keep resolving
   * after a refresh or live reload. Used at every cache-invalidation point
   * except a source switch, where the mounts themselves are cleared first.
   */
  const resetDirCache = useCallback(() => {
    /** @type {Map<string, Cap>} */
    const cache = new Map();
    for (const entry of gitMountsRef.current.values()) {
      cache.set(pathKey(entry.mountPoint), getRoot(entry.filesystem));
    }
    dirCapCacheRef.current = cache;
  }, []);

  const activeSourceFor = useCallback(
    /**
     * @param {FileExplorerState} s
     * @returns {Source | null}
     */
    s => s.sources.find(source => source.id === s.activeSourceId) || null,
    [],
  );

  /**
   * @param {string} message
   * @param {'error' | 'info' | ''} [kind]
   */
  const setStatus = useCallback(
    (message, kind = 'info') => {
      update({ status: { message, kind } });
    },
    [update],
  );

  /** @param {unknown} error */
  const reportError = useCallback(
    error => {
      setStatus(errorMessage(error), 'error');
    },
    [setStatus],
  );

  const beginBusy = useCallback(() => {
    busyCountRef.current += 1;
    update({ busy: busyCountRef.current > 0 });
  }, [update]);
  const endBusy = useCallback(() => {
    busyCountRef.current = Math.max(0, busyCountRef.current - 1);
    update({ busy: busyCountRef.current > 0 });
  }, [update]);

  /**
   * Resolve the Filesystem cap the explorer should read through for this source.
   * Wraps in the ephemeral CAS read-cache iff the per-source toggle is on;
   * otherwise hands back the original. Memoises the wrap so successive browse
   * operations don't mint a new cache on every call.
   *
   * @param {Source} source
   * @returns {Cap}
   */
  const getViewFilesystem = useCallback(source => {
    if (!source.useCache) return source.filesystem;
    if (!source.viewFsCache) {
      source.viewFsCache = makeCachedFilesystem(source.filesystem);
    }
    return source.viewFsCache;
  }, []);

  /**
   * Resolve a directory capability promise by its path, reusing the longest
   * cached prefix so the uncached suffix pipelines into a single round trip.
   *
   * @param {string[]} path
   * @returns {Cap}
   */
  const resolveDir = useCallback(
    (/** @type {string[]} */ path) => {
      const cache = dirCapCacheRef.current;
      const key = pathKey(path);
      const hit = cache.get(key);
      if (hit) return hit;
      const source = activeSourceFor(stateRef.current);
      if (!source) {
        return Promise.reject(Error('No filesystem selected'));
      }
      let depth = path.length;
      /** @type {Cap} */
      let promise;
      for (; depth > 0; depth -= 1) {
        const cached = cache.get(pathKey(path.slice(0, depth)));
        if (cached) {
          promise = cached;
          break;
        }
      }
      if (depth === 0) {
        promise = cache.get('');
        if (!promise) {
          promise = getRoot(getViewFilesystem(source));
          promise.catch(() => {});
          cache.set('', promise);
        }
      }
      for (let i = depth; i < path.length; i += 1) {
        promise = lookupChild(promise, path[i]);
        promise.catch(() => {});
        cache.set(pathKey(path.slice(0, i + 1)), promise);
      }
      return promise;
    },
    [activeSourceFor, getViewFilesystem],
  );

  /**
   * Find the deepest recorded git worktree mount point that contains `path`.
   * Paths at or under a mounted git workspace resolve through its worktree.
   *
   * @param {string[]} path
   * @returns {{ mountPoint: string[], mount: Cap, filesystem: Cap } | undefined}
   */
  const gitMountFor = useCallback((/** @type {string[]} */ path) => {
    const mounts = gitMountsRef.current;
    if (mounts.size === 0) return undefined;
    /** @type {{ mountPoint: string[], mount: Cap, filesystem: Cap } | undefined} */
    let best;
    for (const entry of mounts.values()) {
      const mp = entry.mountPoint;
      if (mp.length > path.length) {
        // eslint-disable-next-line no-continue
        continue;
      }
      let match = true;
      for (let i = 0; i < mp.length; i += 1) {
        if (mp[i] !== path[i]) {
          match = false;
          break;
        }
      }
      if (match && (!best || mp.length > best.mountPoint.length)) {
        best = entry;
      }
    }
    return best;
  }, []);

  /**
   * List a directory for the browser. Mount-backed sources enumerate the raw
   * Mount so non-fs children surface as `'unknown'` entries; every other source
   * reads through the wrapped Filesystem. Paths inside a git worktree mount are
   * enumerated through that worktree.
   *
   * @param {string[]} path
   * @returns {Promise<DirEntry[]>}
   */
  const listEntries = useCallback(
    path => {
      const gitMount = gitMountFor(path);
      if (gitMount) {
        return listMountDirectory(
          gitMount.mount,
          path.slice(gitMount.mountPoint.length),
        );
      }
      const source = activeSourceFor(stateRef.current);
      if (source && source.mount) {
        return listMountDirectory(source.mount, path);
      }
      return listDirectory(resolveDir(path));
    },
    [activeSourceFor, gitMountFor, resolveDir],
  );

  // ---- dialog -----------------------------------------------------------

  /**
   * Show a modal dialog. Resolves with the entered/selected value, or null if
   * cancelled. The live request is held in `state.dialog`; `<Dialog>` renders it
   * and reports the outcome through `submitDialog`.
   *
   * @param {DialogOptions} options
   * @returns {Promise<string | null>}
   */
  const openDialog = useCallback(
    (/** @type {DialogOptions} */ options) =>
      /** @type {Promise<string | null>} */ (
        new Promise(resolve => {
          update({ dialog: { options, resolve } });
        })
      ),
    [update],
  );

  /** @param {string | null} value */
  const submitDialog = useCallback(
    value => {
      const { dialog } = stateRef.current;
      if (!dialog) return;
      update({ dialog: null });
      dialog.resolve(value);
    },
    [update],
  );

  // ---- source management ------------------------------------------------

  /**
   * Append a new source to the list (committing the new array immutably) and
   * return it. The returned object is the live source — its mutable fields
   * (gitRef, useCache, viewFsCache, …) are updated in place by later actions.
   *
   * @param {Omit<Source, 'id' | 'useCache'> & { useCache?: boolean }} spec
   * @returns {Source}
   */
  const addSource = useCallback(
    spec => {
      sourceCounterRef.current += 1;
      /** @type {Source} */
      const source = {
        useCache: true,
        ...spec,
        id: `s${sourceCounterRef.current}`,
      };
      update({ sources: [...stateRef.current.sources, source] });
      return source;
    },
    [update],
  );

  // ---- browser data loading (declared via refs so the watcher effect and
  // mutually-recursive actions can call the latest versions) ---------------

  /** @type {{ current: (silent: boolean) => Promise<void> }} */
  const reloadBrowserRef = useRef(async () => {});
  /** @type {{ current: () => void }} */
  const reconcileWatchersRef = useRef(() => {});

  /**
   * Rebuild the Miller columns along `activePath`, loading every directory
   * listing in parallel.
   *
   * @param {boolean} silent - keep stale columns until data is ready
   * @returns {Promise<void>}
   */
  const rebuildColumns = useCallback(
    async silent => {
      const { activePath } = stateRef.current;
      /** @type {BrowserColumn[]} */
      const next = [];
      for (let depth = 0; depth <= activePath.length; depth += 1) {
        next.push({
          path: activePath.slice(0, depth),
          entries: [],
          loading: true,
          error: '',
        });
      }
      if (!silent) {
        update({ columns: next });
      }
      await Promise.all(
        next.map(async column => {
          try {
            column.entries = await listEntries(column.path);
          } catch (error) {
            column.error = errorMessage(error);
          }
          column.loading = false;
          // The original re-renders per-column as each lands; with an immutable
          // snapshot we commit a fresh array so Preact observes the change.
          if (stateRef.current.columns === next) {
            update({ columns: [...next] });
          }
        }),
      );
      update({ columns: [...next] });
    },
    [listEntries, update],
  );

  /**
   * @param {boolean} silent
   * @returns {Promise<void>}
   */
  const reloadTree = useCallback(
    async silent => {
      const { expandedDirs } = stateRef.current;
      /** @type {string[][]} */
      const paths = [[]];
      for (const key of expandedDirs) {
        if (key !== '') paths.push(keyToPath(key));
      }
      await Promise.all(
        paths.map(async path => {
          const key = pathKey(path);
          if (!silent) {
            const loading = new Set(stateRef.current.treeLoadingDirs);
            loading.add(key);
            update({ treeLoadingDirs: loading });
          }
          /** @type {DirEntry[] | null} */
          let listing = null;
          try {
            listing = await listEntries(path);
          } catch {
            // Leave any previous listing in place.
          }
          const children = new Map(stateRef.current.treeChildren);
          if (listing) children.set(key, listing);
          const loading = new Set(stateRef.current.treeLoadingDirs);
          loading.delete(key);
          update({ treeChildren: children, treeLoadingDirs: loading });
        }),
      );
    },
    [listEntries, update],
  );

  /**
   * @param {boolean} silent
   * @returns {Promise<void>}
   */
  const reloadBrowser = useCallback(
    async silent => {
      if (!activeSourceFor(stateRef.current)) {
        reconcileWatchersRef.current();
        return;
      }
      beginBusy();
      try {
        if (stateRef.current.viewMode === 'columns') {
          await rebuildColumns(silent);
        } else {
          await reloadTree(silent);
        }
      } catch (error) {
        reportError(error);
      } finally {
        endBusy();
      }
      reconcileWatchersRef.current();
    },
    [
      activeSourceFor,
      beginBusy,
      endBusy,
      rebuildColumns,
      reloadTree,
      reportError,
    ],
  );
  reloadBrowserRef.current = reloadBrowser;

  /**
   * Manual refresh: drop cached caps and reload.
   *
   * @returns {Promise<void>}
   */
  const refreshActive = useCallback(async () => {
    resetDirCache();
    await reloadBrowser(false);
  }, [reloadBrowser, resetDirCache]);

  // ---- source selection -------------------------------------------------

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  const selectSource = useCallback(
    async id => {
      // A different source: discard the git worktree mounts before the cache.
      gitMountsRef.current = new Map();
      dirCapCacheRef.current = new Map();
      update({
        activeSourceId: id,
        activePath: [],
        columns: [],
        expandedDirs: new Set([pathKey([])]),
        treeChildren: new Map(),
        treeLoadingDirs: new Set(),
        treeCurrentDir: [],
        selectedFile: null,
        editing: false,
        // Switching sources drops any in-flight layer-diff view — the diff was
        // tied to the outgoing source's layer cap.
        viewerMode: 'file',
        layerDiff: null,
      });
      await reloadBrowser(false);
    },
    [reloadBrowser, update],
  );

  /**
   * Lazily fetch the branch + commit lists for a git-backed source so the
   * revision picker can offer them.
   *
   * @param {Source} source
   * @returns {Promise<void>}
   */
  const loadGitRefs = useCallback(
    async source => {
      await null;
      if (!source.git || source.gitRefsLoaded) return;
      source.gitRefsLoaded = true;
      let branches = [];
      let commits = [];
      let current;
      try {
        const refs = await E(source.git).branches();
        branches = refs.map((/** @type {{ name: string }} */ ref) => ({
          name: ref.name,
        }));
      } catch {
        branches = [];
      }
      try {
        const entries = await E(source.git).log({ limit: GIT_LOG_LIMIT });
        commits = entries.map(
          (/** @type {{ oid: string, summary: string }} */ entry) => ({
            oid: entry.oid,
            summary: entry.summary,
          }),
        );
      } catch {
        commits = [];
      }
      try {
        const head = await E(source.git).currentBranch();
        if (head) current = head.name;
      } catch {
        current = undefined;
      }
      source.gitRefs = { branches, commits, current };
      // Only the active source's toolbar reflects the picker; commit a fresh
      // sources array if these refs just landed for it.
      if (source.id === stateRef.current.activeSourceId) {
        update({ sources: [...stateRef.current.sources] });
      }
    },
    [update],
  );

  /**
   * Switch the browsed revision of a git-backed source.
   *
   * @param {string} ref - `GIT_WORKTREE` or a branch name / commit oid
   * @returns {Promise<void>}
   */
  const selectGitRevision = useCallback(
    async ref => {
      const source = activeSourceFor(stateRef.current);
      if (!source || !source.git || ref === source.gitRef) return;
      await null;
      beginBusy();
      try {
        if (ref === GIT_WORKTREE) {
          const mountCap = await gitWorktreeMount(source.git);
          source.mount = mountCap;
          source.filesystem = await toFilesystem(mountCap, 'mount');
          source.readOnly = false;
        } else {
          source.filesystem = await E(source.git).filesystemAt(ref);
          source.mount = undefined;
          source.readOnly = true;
        }
        source.gitRef = ref;
        source.viewFsCache = undefined;
        await selectSource(source.id);
      } catch (error) {
        reportError(error);
      } finally {
        endBusy();
      }
    },
    [activeSourceFor, beginBusy, endBusy, reportError, selectSource],
  );

  // ---- view mode --------------------------------------------------------

  /** @param {'columns' | 'tree'} mode */
  const setViewMode = useCallback(
    mode => {
      if (stateRef.current.viewMode === mode) return;
      update({ viewMode: mode });
      reloadBrowser(false).catch(reportError);
    },
    [reloadBrowser, reportError, update],
  );

  // ---- entry actions ----------------------------------------------------

  /**
   * @param {string[]} parentPath
   * @param {string} name
   * @returns {Promise<void>}
   */
  const openFile = useCallback(
    async (parentPath, name) => {
      /** @type {Partial<FileExplorerState>} */
      const open = {
        viewerCollapsed: false,
        viewerLoading: true,
        selectedFile: null,
        editing: false,
        // Selecting a file pops out of the layer-diff view.
        viewerMode: 'file',
        layerDiff: null,
      };
      // In columns mode, opening a file collapses any columns drilled to its
      // right and resets the drill path to the file's parent column — matching
      // the imperative file-click in `file-explorer.js` (L2356–2360). A file in
      // `parentPath` lives in column `parentPath.length`, whose path is exactly
      // `parentPath`, so we keep columns `0..parentPath.length`.
      if (stateRef.current.viewMode === 'columns') {
        open.activePath = parentPath;
        open.columns = stateRef.current.columns.slice(0, parentPath.length + 1);
      }
      update(open);
      try {
        const fileCap = lookupChild(resolveDir(parentPath), name);
        const { bytes, size, truncated } = await readFile(fileCap);
        const { text, binary } = decodeText(bytes);
        update({
          selectedFile: {
            cap: fileCap,
            name,
            parentPath,
            text,
            binary,
            size,
            truncated,
          },
        });
      } catch (error) {
        reportError(error);
      } finally {
        update({ viewerLoading: false });
      }
    },
    [resolveDir, reportError, update],
  );

  /**
   * @param {number} columnIndex
   * @param {string} name
   * @returns {Promise<void>}
   */
  const openDirInColumn = useCallback(
    async (columnIndex, name) => {
      const path = stateRef.current.columns[columnIndex].path.concat(name);
      /** @type {BrowserColumn} */
      const column = { path, entries: [], loading: true, error: '' };
      const columns = stateRef.current.columns
        .slice(0, columnIndex + 1)
        .concat(column);
      update({ activePath: path, selectedFile: null, columns });
      beginBusy();
      try {
        column.entries = await listEntries(path);
      } catch (error) {
        column.error = errorMessage(error);
      } finally {
        endBusy();
      }
      column.loading = false;
      update({ columns: [...stateRef.current.columns] });
      reconcileWatchersRef.current();
    },
    [beginBusy, endBusy, listEntries, update],
  );

  /**
   * Open a git workspace child in columns mode by continuing the Miller
   * columns into its worktree, rather than reopening it as a fresh source at
   * the top. The worktree is mounted and recorded as a git mount point so the
   * new column (and any deeper navigation or file reads) resolve through it.
   *
   * @param {number} columnIndex
   * @param {string} name
   * @returns {Promise<void>}
   */
  const openGitEntryInColumn = useCallback(
    async (columnIndex, name) => {
      const parentPath = stateRef.current.columns[columnIndex].path;
      const path = parentPath.concat(name);
      const key = pathKey(path);
      beginBusy();
      try {
        // Resolve the git cap, honoring a parent git mount when already nested
        // inside one.
        const parentGitMount = gitMountFor(parentPath);
        let gitCapPromise;
        if (parentGitMount) {
          gitCapPromise = E(parentGitMount.mount).lookup(
            path.slice(parentGitMount.mountPoint.length),
          );
        } else {
          const source = activeSourceFor(stateRef.current);
          if (!source || !source.mount) return;
          gitCapPromise = E(source.mount).lookup(path);
        }
        const worktreeMount = await gitWorktreeMount(await gitCapPromise);
        const filesystem = await toFilesystem(worktreeMount, 'mount');
        gitMountsRef.current.set(key, {
          mountPoint: path,
          mount: worktreeMount,
          filesystem,
        });
        // Seed the dir-cap cache so file reads under the worktree resolve from
        // its root rather than the base source.
        dirCapCacheRef.current.set(key, getRoot(filesystem));
        // Continue the columns from where the git entry sits.
        /** @type {BrowserColumn} */
        const column = { path, entries: [], loading: true, error: '' };
        const columns = stateRef.current.columns
          .slice(0, columnIndex + 1)
          .concat(column);
        update({ activePath: path, selectedFile: null, columns });
        try {
          column.entries = await listEntries(path);
        } catch (error) {
          column.error = errorMessage(error);
        }
        column.loading = false;
        update({ columns: [...stateRef.current.columns] });
        reconcileWatchersRef.current();
      } catch (error) {
        reportError(error);
      } finally {
        endBusy();
      }
    },
    [
      activeSourceFor,
      beginBusy,
      endBusy,
      gitMountFor,
      listEntries,
      reportError,
      update,
    ],
  );

  /**
   * @param {string[]} path
   * @returns {Promise<void>}
   */
  const toggleTreeDir = useCallback(
    async path => {
      const key = pathKey(path);
      const expanded = new Set(stateRef.current.expandedDirs);
      if (expanded.has(key)) {
        expanded.delete(key);
        update({ treeCurrentDir: path, expandedDirs: expanded });
        reconcileWatchersRef.current();
        return;
      }
      expanded.add(key);
      update({ treeCurrentDir: path, expandedDirs: expanded });
      if (!stateRef.current.treeChildren.has(key)) {
        const loading = new Set(stateRef.current.treeLoadingDirs);
        loading.add(key);
        update({ treeLoadingDirs: loading });
        beginBusy();
        /** @type {DirEntry[] | null} */
        let listing = null;
        try {
          listing = await listEntries(path);
        } catch (error) {
          reportError(error);
        } finally {
          endBusy();
        }
        const children = new Map(stateRef.current.treeChildren);
        if (listing) children.set(key, listing);
        const nextLoading = new Set(stateRef.current.treeLoadingDirs);
        nextLoading.delete(key);
        update({ treeChildren: children, treeLoadingDirs: nextLoading });
      }
      reconcileWatchersRef.current();
    },
    [beginBusy, endBusy, listEntries, reportError, update],
  );

  /** @returns {string[]} */
  const currentDirPath = useCallback(() => {
    const s = stateRef.current;
    return s.viewMode === 'columns' ? s.activePath : s.treeCurrentDir;
  }, []);

  const newFolder = useCallback(async () => {
    const source = activeSourceFor(stateRef.current);
    if (!source || source.readOnly) return;
    const name = await openDialog({
      title: 'New folder',
      input: { label: 'Folder name', placeholder: 'name' },
      confirmLabel: 'Create',
    });
    if (name === null) return;
    if (!validName(name)) {
      setStatus('Invalid folder name', 'error');
      return;
    }
    try {
      await createDirectory(resolveDir(currentDirPath()), name);
      setStatus(`Created folder ${name}`);
      await refreshActive();
    } catch (error) {
      reportError(error);
    }
  }, [
    activeSourceFor,
    currentDirPath,
    openDialog,
    refreshActive,
    reportError,
    resolveDir,
    setStatus,
  ]);

  const newFile = useCallback(async () => {
    const source = activeSourceFor(stateRef.current);
    if (!source || source.readOnly) return;
    const name = await openDialog({
      title: 'New file',
      input: { label: 'File name', placeholder: 'name.txt' },
      confirmLabel: 'Create',
    });
    if (name === null) return;
    if (!validName(name)) {
      setStatus('Invalid file name', 'error');
      return;
    }
    try {
      await createFile(resolveDir(currentDirPath()), name);
      setStatus(`Created file ${name}`);
      await refreshActive();
    } catch (error) {
      reportError(error);
    }
  }, [
    activeSourceFor,
    currentDirPath,
    openDialog,
    refreshActive,
    reportError,
    resolveDir,
    setStatus,
  ]);

  /**
   * Propagate a directory rename / move through every path-bearing piece of UI
   * state so subsequent renders address the new location instead of the old one.
   * Returns the patch to commit (the caller folds in any other changes).
   *
   * @param {string[]} oldParent
   * @param {string} oldName
   * @param {string[]} newParent
   * @param {string} newName
   * @param {'directory' | 'file'} entryType
   * @returns {Partial<FileExplorerState>}
   */
  const cascadeRename = useCallback(
    (oldParent, oldName, newParent, newName, entryType) => {
      const s = stateRef.current;
      /** @type {Partial<FileExplorerState>} */
      const patch = {};
      if (s.selectedFile) {
        const isSelf =
          pathKey(s.selectedFile.parentPath) === pathKey(oldParent) &&
          s.selectedFile.name === oldName;
        if (isSelf && entryType === 'file') {
          patch.selectedFile = {
            ...s.selectedFile,
            name: newName,
            parentPath: newParent,
          };
        } else if (isSelf) {
          patch.selectedFile = null;
        } else if (entryType !== 'file') {
          const nextParent = rewritePath(
            s.selectedFile.parentPath,
            oldParent,
            oldName,
            newParent,
            newName,
          );
          if (nextParent !== s.selectedFile.parentPath) {
            patch.selectedFile = { ...s.selectedFile, parentPath: nextParent };
          }
        }
      }
      if (entryType === 'file') return patch;

      patch.activePath = rewritePath(
        s.activePath,
        oldParent,
        oldName,
        newParent,
        newName,
      );
      patch.treeCurrentDir = rewritePath(
        s.treeCurrentDir,
        oldParent,
        oldName,
        newParent,
        newName,
      );
      patch.columns = s.columns.map(column => ({
        ...column,
        path: rewritePath(column.path, oldParent, oldName, newParent, newName),
      }));

      /** @type {Set<string>} */
      const nextExpanded = new Set();
      for (const key of s.expandedDirs) {
        const next = rewritePath(
          keyToPath(key),
          oldParent,
          oldName,
          newParent,
          newName,
        );
        nextExpanded.add(pathKey(next));
      }
      patch.expandedDirs = nextExpanded;

      /** @type {Map<string, DirEntry[]>} */
      const nextChildren = new Map();
      for (const [key, value] of s.treeChildren) {
        const next = rewritePath(
          keyToPath(key),
          oldParent,
          oldName,
          newParent,
          newName,
        );
        nextChildren.set(pathKey(next), value);
      }
      patch.treeChildren = nextChildren;
      // `dirCapCache` is cleared by `refreshActive()` below, so no rewrite.
      return patch;
    },
    [],
  );

  /**
   * @param {string[]} parentPath
   * @param {string} name
   * @param {'directory' | 'file'} type
   */
  const renameEntryAction = useCallback(
    async (parentPath, name, type) => {
      const source = activeSourceFor(stateRef.current);
      if (!source || source.readOnly) return;
      const newName = await openDialog({
        title: `Rename ${type}`,
        input: { label: 'New name', value: name },
        confirmLabel: 'Rename',
      });
      if (newName === null || newName === name) return;
      if (!validName(newName)) {
        setStatus('Invalid name', 'error');
        return;
      }
      try {
        const dir = resolveDir(parentPath);
        await renameEntry(dir, name, dir, newName);
        setStatus(`Renamed ${name} to ${newName}`);
        update(cascadeRename(parentPath, name, parentPath, newName, type));
        await refreshActive();
      } catch (error) {
        reportError(error);
      }
    },
    [
      activeSourceFor,
      cascadeRename,
      openDialog,
      refreshActive,
      reportError,
      resolveDir,
      setStatus,
      update,
    ],
  );

  /**
   * @param {string[]} parentPath
   * @param {string} name
   * @param {'directory' | 'file'} type
   */
  const deleteEntryAction = useCallback(
    async (parentPath, name, type) => {
      const source = activeSourceFor(stateRef.current);
      if (!source || source.readOnly) return;
      const confirmed = await openDialog({
        title: `Delete ${type}`,
        message: `Delete "${name}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (confirmed === null) return;
      try {
        await removeEntry(resolveDir(parentPath), name);
        setStatus(`Deleted ${name}`);
        const { selectedFile } = stateRef.current;
        if (
          selectedFile &&
          pathKey(selectedFile.parentPath) === pathKey(parentPath) &&
          selectedFile.name === name
        ) {
          update({ selectedFile: null });
        }
        await refreshActive();
      } catch (error) {
        reportError(error);
      }
    },
    [
      activeSourceFor,
      openDialog,
      refreshActive,
      reportError,
      resolveDir,
      setStatus,
      update,
    ],
  );

  /**
   * Move an entry by renaming it into a different directory.
   *
   * @param {string[]} fromParent
   * @param {string} name
   * @param {string[]} toParent
   * @param {'directory' | 'file'} [type]
   */
  const moveEntry = useCallback(
    async (
      /** @type {string[]} */ fromParent,
      /** @type {string} */ name,
      /** @type {string[]} */ toParent,
      /** @type {'directory' | 'file'} */ type = 'directory',
    ) => {
      const source = activeSourceFor(stateRef.current);
      if (!source || source.readOnly) return;
      if (pathKey(fromParent) === pathKey(toParent)) return;
      const ownPath = [...fromParent, name];
      if (
        toParent.length >= ownPath.length &&
        pathKey(toParent.slice(0, ownPath.length)) === pathKey(ownPath)
      ) {
        setStatus('Cannot move a folder into itself', 'error');
        return;
      }
      try {
        await renameEntry(
          resolveDir(fromParent),
          name,
          resolveDir(toParent),
          name,
        );
        setStatus(`Moved ${name}`);
        update(cascadeRename(fromParent, name, toParent, name, type));
        await refreshActive();
      } catch (error) {
        reportError(error);
      }
    },
    [
      activeSourceFor,
      cascadeRename,
      refreshActive,
      reportError,
      resolveDir,
      setStatus,
      update,
    ],
  );

  // ---- filesystem tooling -----------------------------------------------

  const addMemoryFilesystem = useCallback(async () => {
    if (!ENDO_FS_IN_MEMORY_MODULE_URL) {
      setStatus(
        'Cannot mint an in-memory filesystem: the daemon caplet module URL was not injected at build time. Load the chat through the Vite dev server.',
        'error',
      );
      return;
    }
    const defaultName = `scratch-${sourceCounterRef.current + 1}`;
    const petName = await openDialog({
      title: 'New in-memory filesystem',
      message:
        'Mint a fresh in-memory Filesystem and save it to your inventory under this pet name. Re-opening the name from the inventory sidebar later drops you straight back into editing the same filesystem.',
      input: {
        label: 'Pet name',
        value: defaultName,
        placeholder: defaultName,
      },
      confirmLabel: 'Create',
    });
    if (petName === null || petName === '') return;
    beginBusy();
    try {
      const filesystem = /** @type {Cap} */ (
        await E(resolveProfileHost()).makeUnconfined(
          '@node',
          ENDO_FS_IN_MEMORY_MODULE_URL,
          { powersName: '@agent', resultName: petName },
        )
      );
      const source = addSource({
        label: petName,
        petName,
        kind: 'memory',
        filesystem,
        readOnly: false,
      });
      setStatus(
        `Created in-memory filesystem "${petName}" and saved it to the inventory`,
      );
      await selectSource(source.id);
    } catch (error) {
      reportError(error);
    } finally {
      endBusy();
    }
  }, [
    addSource,
    beginBusy,
    endBusy,
    openDialog,
    reportError,
    resolveProfileHost,
    selectSource,
    setStatus,
  ]);

  /**
   * Open an already-classified capability as an explorer source. Shared between
   * the manual "Open by pet name" dialog and the inventory sidebar's click
   * handler.
   *
   * @param {string} label
   * @param {Cap} cap
   * @param {'filesystem' | 'layer' | 'mount' | 'git'} kind
   * @param {string} [petName]
   */
  const openFsCap = useCallback(
    async (label, cap, kind, petName) => {
      let mountCap = cap;
      let effectiveKind = kind;
      if (kind === 'git') {
        mountCap = await gitWorktreeMount(cap);
        effectiveKind = 'mount';
      }
      const filesystem = await toFilesystem(mountCap, effectiveKind);
      /** @type {Source['kind']} */
      let sourceKind;
      if (effectiveKind === 'mount') sourceKind = 'mount';
      else if (effectiveKind === 'layer') sourceKind = 'layer';
      else sourceKind = 'lookup';
      /** @type {Omit<Source, 'id' | 'useCache'> & { useCache?: boolean }} */
      const spec = {
        label,
        kind: sourceKind,
        filesystem,
        readOnly: false,
      };
      if (petName) spec.petName = petName;
      if (effectiveKind === 'mount') spec.mount = mountCap;
      if (effectiveKind === 'layer') {
        spec.layer = cap;
      }
      if (kind === 'git') {
        spec.git = cap;
        spec.gitRef = GIT_WORKTREE;
      }
      const source = addSource(spec);
      if (kind === 'git') {
        setStatus(`Opened git worktree "${source.label}"`);
      } else if (kind === 'mount') {
        setStatus(`Opened Mount "${source.label}" via endo-fs from-mount`);
      } else if (kind === 'layer') {
        setStatus(`Opened layer "${source.label}" (composed view)`);
      } else {
        setStatus(`Opened filesystem "${source.label}"`);
      }
      await selectSource(source.id);
    },
    [addSource, selectSource, setStatus],
  );

  /**
   * Open a git workspace child (surfaced by raw-Mount enumeration) as its own
   * explorer source, browsing its writable worktree.
   *
   * @param {string[]} parentPath
   * @param {string} name
   * @returns {Promise<void>}
   */
  const openGitEntry = useCallback(
    async (parentPath, name) => {
      const source = activeSourceFor(stateRef.current);
      if (!source || !source.mount) return;
      const segments = [...parentPath, name];
      beginBusy();
      try {
        const gitCap = await E(source.mount).lookup(segments);
        const petName = source.petName
          ? `${source.petName}.${segments.join('.')}`
          : undefined;
        await openFsCap(name, gitCap, 'git', petName);
      } catch (error) {
        reportError(error);
      } finally {
        endBusy();
      }
    },
    [activeSourceFor, beginBusy, endBusy, openFsCap, reportError],
  );

  const openByPetName = useCallback(async () => {
    const entered = await openDialog({
      title: 'Open filesystem by pet name',
      message: 'Separate nested names with "." or "/".',
      input: { label: 'Pet name path', placeholder: 'my-filesystem' },
      confirmLabel: 'Open',
    });
    if (entered === null || entered === '') return;
    const segments = entered.split(/[./]/).filter(Boolean);
    if (segments.length === 0) {
      setStatus('Enter a pet name', 'error');
      return;
    }
    beginBusy();
    try {
      const host = resolveProfileHost();
      let capPromise = /** @type {Promise<Cap>} */ (
        E(host).lookup(segments[0])
      );
      for (let i = 1; i < segments.length; i += 1) {
        capPromise = E(capPromise).lookup(segments[i]);
      }
      const cap = await capPromise;
      const kind = await classifyCapability(cap);
      if (kind === 'unknown') {
        setStatus(
          `"${entered}" is not an endo-fs Filesystem, Layer, or Mount`,
          'error',
        );
        return;
      }
      await openFsCap(
        segments[segments.length - 1] || entered,
        cap,
        kind,
        segments.join('.'),
      );
    } catch (error) {
      reportError(error);
    } finally {
      endBusy();
    }
  }, [
    beginBusy,
    endBusy,
    openDialog,
    openFsCap,
    reportError,
    resolveProfileHost,
    setStatus,
  ]);

  /**
   * Toggle the per-source CAS read-cache. View-only.
   */
  const toggleViewCache = useCallback(async () => {
    const source = activeSourceFor(stateRef.current);
    if (!source) return;
    source.useCache = !source.useCache;
    source.viewFsCache = undefined;
    resetDirCache();
    setStatus(
      source.useCache
        ? `Enabled CAS read-cache on "${source.label}"`
        : `Disabled CAS read-cache on "${source.label}"`,
    );
    update({ sources: [...stateRef.current.sources] });
    await reloadBrowser(false);
  }, [activeSourceFor, reloadBrowser, resetDirCache, setStatus, update]);

  /**
   * Prompt for a pet name and ask the daemon to formulate a read-only
   * attenuator over the active source.
   */
  const saveReadOnlyView = useCallback(async () => {
    if (!ENDO_FS_READONLY_MODULE_URL) {
      setStatus(
        'Cannot save a read-only view: the daemon caplet module URL was not injected at build time. Load the chat through the Vite dev server.',
        'error',
      );
      return;
    }
    const source = activeSourceFor(stateRef.current);
    if (!source) return;
    if (!source.petName) {
      setStatus(
        `Source "${source.label}" has no inventory pet name; save it (or re-open from inventory) before deriving a read-only view`,
        'error',
      );
      return;
    }
    const petName = await openDialog({
      title: 'Save read-only view',
      message: `Freeze a read-only view of "${source.label}" into the inventory.`,
      input: {
        label: 'Pet name',
        placeholder: `${source.label}-ro`,
        value: `${source.label}-ro`,
      },
      confirmLabel: 'Save',
    });
    if (petName === null || petName === '') return;
    beginBusy();
    try {
      await E(resolveProfileHost()).makeUnconfined(
        '@node',
        ENDO_FS_READONLY_MODULE_URL,
        {
          powersName: '@agent',
          resultName: petName,
          env: { SOURCE_NAME: source.petName },
        },
      );
      setStatus(`Saved read-only view of "${source.label}" as "${petName}"`);
    } catch (error) {
      reportError(error);
    } finally {
      endBusy();
    }
  }, [
    activeSourceFor,
    beginBusy,
    endBusy,
    openDialog,
    reportError,
    resolveProfileHost,
    setStatus,
  ]);

  /**
   * Prompt for a Layer pet name and a composed-view pet name, persist both to
   * the inventory, and open the composed view as the active source.
   */
  const saveLayer = useCallback(async () => {
    if (!ENDO_FS_LAYER_MODULE_URL) {
      setStatus(
        'Cannot save a layer: the daemon caplet module URL was not injected at build time. Load the chat through the Vite dev server.',
        'error',
      );
      return;
    }
    const source = activeSourceFor(stateRef.current);
    if (!source) return;
    if (!source.petName) {
      setStatus(
        `Source "${source.label}" has no inventory pet name; save it (or re-open from inventory) before deriving a layer`,
        'error',
      );
      return;
    }
    const baseName = source.label.replace(/\s+/g, '-');
    const layerName = await openDialog({
      title: 'Save layer',
      message: `Create a copy-on-write layer over "${source.label}". The layer captures every write you make to the composed view; the backing stays untouched.`,
      input: {
        label: 'Layer pet name',
        placeholder: `${baseName}-layer`,
        value: `${baseName}-layer`,
      },
      confirmLabel: 'Next',
    });
    if (layerName === null || layerName === '') return;
    const composedName = await openDialog({
      title: 'Save composed view',
      message:
        'A composed view exposes the layer over the backing as a single Filesystem. Re-opening it from the inventory drops you straight back into editing the layer.',
      input: {
        label: 'Composed-view pet name',
        placeholder: `${baseName}-with-layer`,
        value: `${baseName}-with-layer`,
      },
      confirmLabel: 'Save',
    });
    if (composedName === null || composedName === '') return;
    beginBusy();
    try {
      const host = resolveProfileHost();
      const layer = /** @type {Cap} */ (
        await E(host).makeUnconfined('@node', ENDO_FS_LAYER_MODULE_URL, {
          powersName: '@agent',
          resultName: layerName,
          env: { BACKING_NAME: source.petName },
        })
      );
      const composed = /** @type {Cap} */ (
        await E(host).evaluate(
          '@node',
          'E(layer).asFilesystem()',
          ['layer'],
          [layerName],
          composedName,
        )
      );
      const layerSource = addSource({
        label: composedName,
        petName: composedName,
        kind: 'layer',
        filesystem: composed,
        readOnly: false,
        layer,
        backingSourceId: source.id,
      });
      setStatus(
        `Saved layer "${layerName}" + composed view "${composedName}"; opened composed view`,
      );
      await selectSource(layerSource.id);
    } catch (error) {
      reportError(error);
    } finally {
      endBusy();
    }
  }, [
    activeSourceFor,
    addSource,
    beginBusy,
    endBusy,
    openDialog,
    reportError,
    resolveProfileHost,
    selectSource,
    setStatus,
  ]);

  const applyActiveLayer = useCallback(async () => {
    const source = activeSourceFor(stateRef.current);
    if (!source || source.kind !== 'layer' || !source.layer) return;
    // De-duplicate sibling sources: key on `petName || id` so session-only
    // sources remain individually addressable.
    const seen = new Set();
    /** @type {Source[]} */
    const candidates = [];
    for (const candidate of stateRef.current.sources) {
      const key = candidate.petName || candidate.id;
      if (candidate.id !== source.id && !candidate.readOnly && !seen.has(key)) {
        seen.add(key);
        candidates.push(candidate);
      }
    }
    const choices = [
      { value: APPLY_BACKING_CHOICE, label: '(layer backing)' },
      ...candidates.map(candidate => ({
        value: candidate.id,
        label: candidate.label,
      })),
    ];
    const targetId = await openDialog({
      title: 'Apply layer',
      message: `Replay this layer's changes onto a writable filesystem. The default is the layer's own backing — picking it commits the staged changes in place.`,
      choices,
      confirmLabel: 'Apply',
    });
    if (targetId === null) return;
    beginBusy();
    try {
      /** @type {Cap} */
      let targetFs;
      /** @type {string} */
      let targetLabel;
      if (targetId === APPLY_BACKING_CHOICE) {
        targetFs = /** @type {Cap} */ (await E(source.layer).backing());
        targetLabel = '(layer backing)';
      } else {
        const target = stateRef.current.sources.find(
          candidate => candidate.id === targetId,
        );
        if (!target) {
          setStatus('Apply target no longer exists', 'error');
          return;
        }
        targetFs = target.filesystem;
        targetLabel = target.label;
      }
      await applyLayer(source.layer, targetFs);
      setStatus(`Applied layer onto ${targetLabel}`);
    } catch (error) {
      reportError(error);
    } finally {
      endBusy();
    }
  }, [activeSourceFor, beginBusy, endBusy, openDialog, reportError, setStatus]);

  const revertActiveLayer = useCallback(async () => {
    const source = activeSourceFor(stateRef.current);
    if (!source || source.kind !== 'layer' || !source.layer) return;
    const confirmed = await openDialog({
      title: 'Revert layer',
      message: `Discard all changes accumulated in "${source.label}"? Layer-only files disappear, hidden backing entries reappear, and the backing filesystem is left untouched.`,
      confirmLabel: 'Revert',
      danger: true,
    });
    if (confirmed === null) return;
    beginBusy();
    try {
      await E(source.layer).revert();
      resetDirCache();
      /** @type {Partial<FileExplorerState>} */
      const patch = { selectedFile: null, editing: false };
      if (stateRef.current.viewerMode === 'layer-diff') {
        patch.viewerMode = 'file';
        patch.layerDiff = null;
      }
      update(patch);
      await reloadBrowser(false);
      setStatus(`Reverted layer ${source.label}`);
    } catch (error) {
      reportError(error);
    } finally {
      endBusy();
    }
  }, [
    activeSourceFor,
    beginBusy,
    endBusy,
    openDialog,
    reloadBrowser,
    reportError,
    resetDirCache,
    setStatus,
    update,
  ]);

  /**
   * Read the text of a single file at `pathSegments` out of the given
   * filesystem. Returns `null` if the path doesn't exist or the file is binary.
   *
   * @param {Cap} fs
   * @param {string[]} pathSegments
   * @returns {Promise<{ text: string, truncated: boolean } | null>}
   */
  const readTextAtPath = useCallback(async (fs, pathSegments) => {
    if (pathSegments.length === 0) return null;
    try {
      let dirP = getRoot(fs);
      for (let i = 0; i < pathSegments.length - 1; i += 1) {
        dirP = lookupChild(dirP, pathSegments[i]);
      }
      const fileCap = lookupChild(dirP, pathSegments[pathSegments.length - 1]);
      const { bytes, truncated } = await readFile(fileCap);
      const { text, binary } = decodeText(bytes);
      if (binary) return null;
      return { text, truncated };
    } catch {
      return null;
    }
  }, []);

  /**
   * Build a unified-diff document for the active layer's accumulated changes and
   * show it in the viewer pane.
   */
  const viewLayerDiff = useCallback(async () => {
    const source = activeSourceFor(stateRef.current);
    if (!source || source.kind !== 'layer' || !source.layer) return;
    beginBusy();
    try {
      const ops = await collectLayerOps(source.layer);
      /** @type {LayerDiffView} */
      let diffView;
      if (ops.length === 0) {
        diffView = {
          layerLabel: source.label,
          content: '# No changes in this layer yet.\n',
        };
      } else {
        const backing = /** @type {Cap} */ (await E(source.layer).backing());
        /** @type {Map<string, { path: string[], kinds: Set<string> }>} */
        const byPath = new Map();
        for (const op of ops) {
          const raw = Array.isArray(op.path)
            ? /** @type {string[]} */ (op.path)
            : Array.isArray(op.newPath)
              ? /** @type {string[]} */ (op.newPath)
              : [];
          const key = raw.join('/');
          const bucket = byPath.get(key) || { path: raw, kinds: new Set() };
          bucket.kinds.add(String(op.kind));
          if (!byPath.has(key)) byPath.set(key, bucket);
        }
        /**
         * @param {string[]} path
         * @param {Set<string>} kinds
         * @returns {Promise<string>}
         */
        const sectionFor = async (path, kinds) => {
          const pathStr = path.join('/');
          if (path.length === 0) {
            return `# root: ${[...kinds].join(', ')}`;
          }
          if (kinds.has('whiteout')) {
            const backingRead = await readTextAtPath(backing, path);
            if (backingRead === null) {
              return `# whiteout (no backing or binary): ${pathStr}`;
            }
            const sec = buildUnifiedDiffSection(pathStr, backingRead.text, '');
            return backingRead.truncated
              ? `${sec}\n# truncated: backing preview only`
              : sec;
          }
          if (
            kinds.has('create-file') ||
            kinds.has('write-bytes') ||
            kinds.has('truncate')
          ) {
            const [backingRead, layerRead] = await Promise.all([
              readTextAtPath(backing, path),
              readTextAtPath(source.filesystem, path),
            ]);
            const oldText = backingRead ? backingRead.text : '';
            const newText = layerRead ? layerRead.text : '';
            if (backingRead === null && layerRead === null) {
              return `# ${[...kinds].join(', ')} (binary or missing): ${pathStr}`;
            }
            const sec = buildUnifiedDiffSection(pathStr, oldText, newText);
            const notes = [];
            if (backingRead?.truncated) notes.push('backing preview only');
            if (layerRead?.truncated) notes.push('layer preview only');
            return notes.length
              ? `${sec}\n# truncated: ${notes.join(', ')}`
              : sec;
          }
          return `# ${[...kinds].join(', ')}: ${pathStr}`;
        };
        /** @type {string[]} */
        const sections = [];
        for (const { path, kinds } of byPath.values()) {
          sections.push(await sectionFor(path, kinds));
        }
        diffView = {
          layerLabel: source.label,
          content: sections.join('\n\n'),
        };
      }
      update({
        layerDiff: diffView,
        viewerMode: 'layer-diff',
        selectedFile: null,
        editing: false,
        viewerCollapsed: false,
      });
    } catch (error) {
      reportError(error);
    } finally {
      endBusy();
    }
  }, [
    activeSourceFor,
    beginBusy,
    endBusy,
    readTextAtPath,
    reportError,
    update,
  ]);

  // ---- viewer (file editing) --------------------------------------------

  /**
   * Write the editor buffer back to disk. The Viewer pushes its current buffer
   * via the optional `text` argument; absent it, the selected file's text is
   * re-saved (still satisfies the frozen `() => void` signature). See the report
   * note on this contract gap.
   *
   * @param {string} [text]
   * @returns {Promise<void>}
   */
  const saveSelectedFile = useCallback(
    async text => {
      const file = stateRef.current.selectedFile;
      if (!file) return;
      const buffer = text !== undefined ? text : file.text;
      beginBusy();
      try {
        await writeFileText(file.cap, buffer);
        update({
          selectedFile: {
            ...file,
            text: buffer,
            size: new TextEncoder().encode(buffer).length,
          },
          editing: false,
        });
        setStatus(`Saved ${file.name}`);
        await refreshActive();
      } catch (error) {
        reportError(error);
      } finally {
        endBusy();
      }
    },
    [beginBusy, endBusy, refreshActive, reportError, setStatus, update],
  );

  // ---- viewer chrome ----------------------------------------------------

  /** @param {boolean} collapsed */
  const setViewerCollapsed = useCallback(
    collapsed => {
      update({ viewerCollapsed: collapsed });
    },
    [update],
  );

  /** @param {boolean} editingNext */
  const setEditing = useCallback(
    editingNext => {
      update({ editing: editingNext });
    },
    [update],
  );

  /** @param {number} width */
  const setViewerWidth = useCallback(
    width => {
      const clamped = Math.max(
        260,
        Math.min(
          (typeof window !== 'undefined' ? window.innerWidth : 1280) - 320,
          width,
        ),
      );
      update({ viewerWidth: clamped });
    },
    [update],
  );

  // ---- live-view watchers (effect) --------------------------------------

  // The watcher set is keyed by directory path. We track them in a ref so the
  // cleanup can cancel every live subscription + the debounce timer.
  /** @type {{ current: Map<string, () => void> }} */
  const watchersRef = useRef(new Map());
  /** @type {{ current: ReturnType<typeof setTimeout> | null }} */
  const liveTimerRef = useRef(null);

  const scheduleLiveRefresh = useCallback(() => {
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    liveTimerRef.current = setTimeout(() => {
      liveTimerRef.current = null;
      // Live refresh: drop caps, reload without the loading flicker.
      resetDirCache();
      reloadBrowserRef.current(true).catch(reportError);
    }, LIVE_REFRESH_DELAY);
  }, [reportError, resetDirCache]);

  /** @returns {Map<string, string[]>} */
  const visibleDirectories = useCallback(() => {
    const s = stateRef.current;
    /** @type {Map<string, string[]>} */
    const map = new Map();
    if (s.viewMode === 'columns') {
      for (const column of s.columns) {
        map.set(pathKey(column.path), column.path);
      }
    } else {
      map.set('', []);
      for (const key of s.expandedDirs) {
        map.set(key, keyToPath(key));
      }
    }
    return map;
  }, []);

  // Subscribe to / unsubscribe from directory watchers so exactly the
  // currently-displayed directories are watched. Mirrors `reconcileWatchers`.
  const reconcileWatchers = useCallback(() => {
    const watchers = watchersRef.current;
    if (!activeSourceFor(stateRef.current)) {
      for (const cancel of watchers.values()) cancel();
      watchers.clear();
      return;
    }
    const visible = visibleDirectories();
    for (const [key, cancel] of [...watchers]) {
      if (!visible.has(key)) {
        cancel();
        watchers.delete(key);
      }
    }
    for (const [key, path] of visible) {
      // Paths nested inside a git worktree are not change-watched: the worktree
      // Mount need not support subscriptions, and the base behavior (a separate
      // source) was unwatched too.
      if (!watchers.has(key) && !gitMountFor(path)) {
        watchers.set(
          key,
          subscribeChanges(resolveDir(path), () => scheduleLiveRefresh()),
        );
      }
    }
  }, [
    activeSourceFor,
    gitMountFor,
    resolveDir,
    scheduleLiveRefresh,
    visibleDirectories,
  ]);
  reconcileWatchersRef.current = reconcileWatchers;

  // Re-reconcile whenever the active source, the view mode, or the set of
  // visible directories changes. The serialized key collapses the visible-dir
  // set into a stable dependency.
  const visibleKey =
    state.viewMode === 'columns'
      ? state.columns.map(column => pathKey(column.path)).join('|')
      : [...state.expandedDirs].sort().join('|');

  useEffect(() => {
    reconcileWatchers();
    return () => {
      const watchers = watchersRef.current;
      for (const cancel of watchers.values()) cancel();
      watchers.clear();
      if (liveTimerRef.current) {
        clearTimeout(liveTimerRef.current);
        liveTimerRef.current = null;
      }
    };
  }, [state.activeSourceId, state.viewMode, visibleKey, reconcileWatchers]);

  // ---- inventory pump (mount-once effect) -------------------------------

  useEffect(() => {
    let stopped = false;
    /** @type {AsyncIterableIterator<{ add?: string, remove?: string }> | null} */
    let invIter = null;
    // Per-name abort flags so `{ remove }` cancels an in-flight classification.
    /** @type {Map<string, { aborted: boolean }>} */
    const aborts = new Map();

    /** @param {string} name */
    const addInvItem = name => {
      if (stateRef.current.invItems.has(name)) return;
      const abort = { aborted: false };
      aborts.set(name, abort);
      const items = new Map(stateRef.current.invItems);
      items.set(name, {
        name,
        status: 'classifying',
        title: 'Classifying…',
      });
      update({ invItems: items });

      // Classify in the background; the row stays disabled until the lookup +
      // classify resolves.
      (async () => {
        try {
          const cap = await E(resolveProfileHost()).lookup(name);
          if (abort.aborted) return;
          const kind = await classifyCapability(cap);
          if (abort.aborted) return;
          /** @type {InvItem} */
          let item;
          if (kind === 'unknown') {
            item = {
              name,
              status: 'disabled',
              title: 'Not an endo-fs Filesystem, Layer, or Mount',
            };
          } else {
            let title;
            if (kind === 'mount') title = `Open Mount "${name}"`;
            else if (kind === 'git') title = `Open git worktree "${name}"`;
            else if (kind === 'layer')
              title = `Open layer "${name}" (composed view + layer actions)`;
            else title = `Open filesystem "${name}"`;
            item = { name, status: 'ready', kind, cap, title };
          }
          if (abort.aborted) return;
          const nextItems = new Map(stateRef.current.invItems);
          // Only update if the row still exists (a remove may have raced).
          if (nextItems.has(name)) {
            nextItems.set(name, item);
            update({ invItems: nextItems });
          }
        } catch {
          if (!abort.aborted && stateRef.current.invItems.has(name)) {
            const nextItems = new Map(stateRef.current.invItems);
            nextItems.set(name, {
              name,
              status: 'disabled',
              title: 'Unavailable',
            });
            update({ invItems: nextItems });
          }
        }
      })();
    };

    /** @param {string} name */
    const removeInvItem = name => {
      const abort = aborts.get(name);
      if (abort) abort.aborted = true;
      aborts.delete(name);
      if (!stateRef.current.invItems.has(name)) return;
      const items = new Map(stateRef.current.invItems);
      items.delete(name);
      update({ invItems: items });
    };

    const pump = async () => {
      try {
        invIter = iterateReader(E(resolveProfileHost()).followNameChanges());
        for await (const change of invIter) {
          if (stopped) break;
          if (change && typeof change === 'object') {
            if ('add' in change && typeof change.add === 'string') {
              addInvItem(change.add);
            } else if (
              'remove' in change &&
              typeof change.remove === 'string'
            ) {
              removeInvItem(change.remove);
            }
          }
        }
      } catch {
        // No followNameChanges (e.g. a powers object without a NameHub) — the
        // sidebar stays empty rather than breaking the explorer.
      }
    };
    pump();

    return () => {
      stopped = true;
      for (const abort of aborts.values()) abort.aborted = true;
      aborts.clear();
      if (invIter) {
        try {
          invIter.return?.(undefined);
        } catch {
          // Best-effort disposal.
        }
        invIter = null;
      }
    };
    // Mount-once: the pump runs for the hook's whole lifetime.
  }, []);

  // ---- initial status (mount-once) --------------------------------------

  useEffect(() => {
    setStatus('Open a filesystem to begin.', 'info');
    // Mount-once.
  }, []);

  // ---- lazy git-ref picker fetch ----------------------------------------

  // Mirror the imperative toolbar render: when the active source is git-backed
  // and its branch/commit lists haven't been fetched yet, kick the one-shot
  // load. `loadGitRefs` guards re-entry via `gitRefsLoaded`.
  useEffect(() => {
    const source = activeSourceFor(stateRef.current);
    if (source && source.git && !source.gitRefsLoaded) {
      loadGitRefs(source).catch(reportError);
    }
  }, [state.activeSourceId, activeSourceFor, loadGitRefs, reportError]);

  // ---- features ---------------------------------------------------------

  /** @type {FileExplorerFeatures} */
  const features = useMemo(
    () => ({
      canMintMemory: !!ENDO_FS_IN_MEMORY_MODULE_URL,
      canSaveReadOnly: !!ENDO_FS_READONLY_MODULE_URL,
      canSaveLayer: !!ENDO_FS_LAYER_MODULE_URL,
    }),
    [],
  );

  // ---- actions (identity-stable) ----------------------------------------

  /** @type {FileExplorerActions} */
  const actions = useMemo(
    () => ({
      selectSource: id => {
        selectSource(id).catch(reportError);
      },
      selectGitRevision: ref => {
        selectGitRevision(ref).catch(reportError);
      },
      setViewMode,
      openFile: (parentPath, name) => {
        openFile(parentPath, name).catch(reportError);
      },
      openDirInColumn: (columnIndex, name) => {
        openDirInColumn(columnIndex, name).catch(reportError);
      },
      toggleTreeDir: path => {
        toggleTreeDir(path).catch(reportError);
      },
      openGitEntry: (parentPath, name) => {
        openGitEntry(parentPath, name).catch(reportError);
      },
      openGitEntryInColumn: (columnIndex, name) => {
        openGitEntryInColumn(columnIndex, name).catch(reportError);
      },
      refreshActive: () => {
        refreshActive().catch(reportError);
      },
      newFolder: () => {
        newFolder().catch(reportError);
      },
      newFile: () => {
        newFile().catch(reportError);
      },
      renameEntryAction: (parentPath, name, type) => {
        renameEntryAction(parentPath, name, type).catch(reportError);
      },
      deleteEntryAction: (parentPath, name, type) => {
        deleteEntryAction(parentPath, name, type).catch(reportError);
      },
      moveEntry: (fromParent, name, toParent, type) => {
        moveEntry(fromParent, name, toParent, type).catch(reportError);
      },
      saveSelectedFile: text => {
        saveSelectedFile(text).catch(reportError);
      },
      addMemoryFilesystem: () => {
        addMemoryFilesystem().catch(reportError);
      },
      openByPetName: () => {
        openByPetName().catch(reportError);
      },
      openFsCap: (label, cap, kind, petName) => {
        openFsCap(label, cap, kind, petName).catch(reportError);
      },
      toggleViewCache: () => {
        toggleViewCache().catch(reportError);
      },
      saveReadOnlyView: () => {
        saveReadOnlyView().catch(reportError);
      },
      saveLayer: () => {
        saveLayer().catch(reportError);
      },
      applyActiveLayer: () => {
        applyActiveLayer().catch(reportError);
      },
      revertActiveLayer: () => {
        revertActiveLayer().catch(reportError);
      },
      viewLayerDiff: () => {
        viewLayerDiff().catch(reportError);
      },
      setViewerCollapsed,
      setEditing,
      setViewerWidth,
      openDialog,
      submitDialog,
    }),
    [
      addMemoryFilesystem,
      applyActiveLayer,
      deleteEntryAction,
      moveEntry,
      newFile,
      newFolder,
      openByPetName,
      openDialog,
      openDirInColumn,
      openFile,
      openFsCap,
      openGitEntry,
      openGitEntryInColumn,
      refreshActive,
      renameEntryAction,
      reportError,
      revertActiveLayer,
      saveLayer,
      saveReadOnlyView,
      saveSelectedFile,
      selectGitRevision,
      selectSource,
      setEditing,
      setViewMode,
      setViewerCollapsed,
      setViewerWidth,
      submitDialog,
      toggleTreeDir,
      toggleViewCache,
      viewLayerDiff,
    ],
  );

  const activeSource = activeSourceFor(state);

  return { state, activeSource, actions, features };
}
harden(useFileExplorer);
