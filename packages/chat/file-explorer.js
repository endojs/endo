// @ts-check
/* eslint-disable no-await-in-loop */

// File-explorer UI for navigating `@endo/endo-fs` filesystem
// objects: Miller columns and a collapsible tree, a split-pane
// syntax-highlighted file viewer, drag-to-move, and tooling to
// build in-memory filesystems, read-only views, CAS-cached
// frontends, and layers.
//
// Capability walks are kept lazy (promises, not awaited values) so
// CapTP pipelines them; directory listings load in parallel; and
// every displayed directory is watched so the view stays live.

import harden from '@endo/harden';
import { E } from '@endo/far';

import { colorize } from './monaco-wrapper.js';
import { makeRefIterator } from './ref-iterator.js';
import { buildUnifiedDiffSection } from './layer-diff.js';
import {
  applyLayer,
  classifyCapability,
  collectLayerOps,
  createDirectory,
  createFile,
  decodeText,
  getRoot,
  listDirectory,
  lookupChild,
  makeCachedFilesystem,
  readFile,
  removeEntry,
  renameEntry,
  subscribeChanges,
  toFilesystem,
  writeFileText,
} from './file-explorer-fs.js';

/** @typedef {any} Cap */

/**
 * @typedef {object} Source
 * @property {string} id
 * @property {string} label
 * @property {'lookup' | 'memory' | 'layer' | 'mount'} kind
 * @property {Cap} filesystem - the underlying, never-wrapped cap
 * @property {boolean} readOnly
 * @property {boolean} useCache - whether to wrap reads through an
 *   ephemeral content-addressed LRU read cache for browsing this
 *   source. Per-source, defaults to true. View-only: never affects
 *   the cap that gets handed back out (e.g. via `storeValue` /
 *   `applyLayer`) — that's always the original `filesystem`.
 * @property {string} [petName] - inventory pet name (or
 *   slash/dot-separated path) where this source's cap lives on
 *   the profile-resolved host. Recorded whenever we know it
 *   (mint actions, inventory click, "Open by pet name"); the
 *   "Save read-only view" / "Save layer" actions need it so the
 *   daemon-side module can `lookup` the backing.
 * @property {Cap} [_viewFilesystem] - memoised wrapped cap, dropped
 *   whenever `useCache` flips so the next browse remints it
 * @property {Cap} [layer] - layer cap when `kind === 'layer'`, so
 *   the Apply/Changes/Revert actions can operate on it
 * @property {string} [backingSourceId]
 */

// File URLs for the endo-fs caplet modules the daemon uses to
// formulate filesystem/layer/read-only caps. Injected at Vite
// build time (see vite-endo-plugin.js); each URL resolves to a
// module on the daemon's local filesystem whose `make(powers,
// _ctx, { env })` factory is the recipe stored in the formula.
// Falsy at runtime if the chat is loaded outside the Vite dev
// server (in which case the "Save" actions degrade with a clear
// error rather than a cryptic marshaller failure).
const ENDO_FS_IN_MEMORY_MODULE_URL =
  // @ts-ignore Vite injects this at build time
  import.meta.env?.ENDO_FS_IN_MEMORY_PATH || '';
const ENDO_FS_READONLY_MODULE_URL =
  // @ts-ignore Vite injects this at build time
  import.meta.env?.ENDO_FS_READONLY_PATH || '';
const ENDO_FS_LAYER_MODULE_URL =
  // @ts-ignore Vite injects this at build time
  import.meta.env?.ENDO_FS_LAYER_PATH || '';

/**
 * @typedef {object} BrowserColumn
 * @property {string[]} path
 * @property {import('./file-explorer-fs.js').DirEntry[]} entries
 * @property {boolean} loading
 * @property {string} error
 */

const KEY_SEP = '\u0000';
const NAME_PATTERN = /^[^/\0]+$/;
const LIVE_REFRESH_DELAY = 200;

/**
 * @param {string} text
 * @returns {string}
 */
const esc = text =>
  String(text).replace(
    /[&<>"']/g,
    ch =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[ch] || ch,
  );

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
 * If `path` starts with `[...oldPrefix, oldName]`, rewrite it to
 * start with `[...newPrefix, newName]` (preserving any deeper
 * segments). Otherwise return `path` unchanged.
 *
 * Lets a single directory rename (or move) propagate to every
 * stored path that referenced the old location: open columns,
 * the active drill-down, the selected file, the tree's current
 * directory, and tree-expansion / cache keys. Without this, the
 * lower miller columns and the tree continue to address the
 * (now-gone) old name and surface ENOENT errors.
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
 * @returns {string}
 */
const languageForName = name => {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'json':
      return 'json';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
      return 'css';
    default:
      return 'plaintext';
  }
};

/**
 * @param {number} bytes
 * @returns {string}
 */
const formatSize = bytes => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Mount the file explorer into a container element.
 *
 * `profilePath` is walked from `rootPowers` once, lazily, to get
 * a host cap for the current profile. The inventory sidebar, the
 * "Open by pet name" dialog, and the "Save as…" actions all
 * operate against that profile-resolved host so this Space stays
 * consistent with the rest of chat's profile model. When
 * `profilePath` is empty we just use `rootPowers` directly.
 *
 * @param {HTMLElement} $parent
 * @param {{ rootPowers: Cap, profilePath?: string[] }} options
 * @returns {() => void} cleanup function
 */
export const mountFileExplorer = (
  $parent,
  { rootPowers, profilePath = [] },
) => {
  // Profile-resolved host cap (a promise, so chained `lookup` /
  // `storeValue` calls pipeline through CapTP). Cached because
  // every "open", "save", and inventory subscription wants it.
  /** @type {Promise<Cap> | null} */
  let profileHostPromise = null;
  const resolveProfileHost = () => {
    if (profileHostPromise) return profileHostPromise;
    let cap = /** @type {Promise<Cap>} */ (Promise.resolve(rootPowers));
    for (const seg of profilePath) {
      cap = /** @type {Promise<Cap>} */ (E(cap).lookup(seg));
    }
    profileHostPromise = cap;
    return profileHostPromise;
  };
  /** @type {Source[]} */
  const sources = [];
  let sourceCounter = 0;
  /** @type {string | null} */
  let activeSourceId = null;

  /** @type {'columns' | 'tree'} */
  let viewMode = 'columns';
  let viewerCollapsed = true;
  let viewerWidth = 440;

  // Miller-column state: the chain of directories drilled into.
  /** @type {string[]} */
  let activePath = [];
  /** @type {BrowserColumn[]} */
  let columns = [];

  // Tree state.
  /** @type {Set<string>} */
  let expanded = new Set();
  /** @type {Map<string, import('./file-explorer-fs.js').DirEntry[]>} */
  let treeChildren = new Map();
  /** @type {Set<string>} */
  const treeLoading = new Set();
  /** @type {string[]} */
  let treeCurrentDir = [];

  // Shared directory-capability promise cache for the active
  // source. Promises (not resolved caps) so chained lookups
  // pipeline.
  /** @type {Map<string, Cap>} */
  let dirCapCache = new Map();

  /**
   * @typedef {object} SelectedFile
   * @property {Cap} cap
   * @property {string} name
   * @property {string[]} parentPath
   * @property {string} text
   * @property {boolean} binary
   * @property {number} size
   * @property {boolean} truncated
   */
  /** @type {SelectedFile | null} */
  let selectedFile = null;
  let editing = false;
  let viewerLoading = false;

  /**
   * @typedef {object} LayerDiffView
   * @property {string} layerLabel  source.label at the time the
   *   diff was generated
   * @property {string} content  the full diff document
   *   (concatenated unified-diff sections + `#`-comment markers
   *   for non-content ops)
   */
  /** @type {LayerDiffView | null} */
  let layerDiff = null;
  // What the viewer pane is currently showing. `'file'` is the
  // historical default (preview/edit of a single selected file);
  // `'layer-diff'` is the "View layer diff" mode driven by
  // `layerDiff`.
  /** @type {'file' | 'layer-diff'} */
  let viewerMode = 'file';

  /** @type {{ message: string, kind: 'error' | 'info' | '' }} */
  let status = { message: '', kind: '' };
  let busyCount = 0;

  // Live-view watchers, keyed by directory path.
  /** @type {Map<string, () => void>} */
  const watchers = new Map();
  /** @type {ReturnType<typeof setTimeout> | null} */
  let liveTimer = null;

  // ---- shell -------------------------------------------------------

  $parent.innerHTML = `
    <div class="fx-root">
      <div class="fx-toolbar"></div>
      <div class="fx-body">
        <div class="fx-inventory">
          <div class="fx-inv-header">Inventory</div>
          <div class="fx-inv-list"></div>
        </div>
        <div class="fx-browser"></div>
        <div class="fx-splitter" hidden></div>
        <div class="fx-viewer" hidden></div>
      </div>
      <div class="fx-status"></div>
    </div>
  `;
  const $root = /** @type {HTMLElement} */ ($parent.querySelector('.fx-root'));
  const $toolbar = /** @type {HTMLElement} */ (
    $root.querySelector('.fx-toolbar')
  );
  const $invList = /** @type {HTMLElement} */ (
    $root.querySelector('.fx-inv-list')
  );
  const $browser = /** @type {HTMLElement} */ (
    $root.querySelector('.fx-browser')
  );
  const $splitter = /** @type {HTMLElement} */ (
    $root.querySelector('.fx-splitter')
  );
  const $viewer = /** @type {HTMLElement} */ (
    $root.querySelector('.fx-viewer')
  );
  const $status = /** @type {HTMLElement} */ (
    $root.querySelector('.fx-status')
  );

  // ---- small helpers ----------------------------------------------

  /** @returns {Source | null} */
  const activeSource = () =>
    sources.find(source => source.id === activeSourceId) || null;

  /**
   * @param {string} message
   * @param {'error' | 'info' | ''} [kind]
   */
  const setStatus = (message, kind = 'info') => {
    status = { message, kind };
    renderStatus();
  };

  /** @param {unknown} error */
  const reportError = error => {
    setStatus(error instanceof Error ? error.message : String(error), 'error');
  };

  const beginBusy = () => {
    busyCount += 1;
    renderStatus();
  };
  const endBusy = () => {
    busyCount = Math.max(0, busyCount - 1);
    renderStatus();
  };

  /**
   * @param {string} name
   * @returns {boolean}
   */
  const validName = name =>
    name.length > 0 && name !== '.' && name !== '..' && NAME_PATTERN.test(name);

  /**
   * Resolve a directory capability promise by its path, reusing
   * the longest cached prefix so the uncached suffix pipelines
   * into a single round trip.
   *
   * @param {string[]} path
   * @returns {Cap}
   */
  const resolveDir = path => {
    const key = pathKey(path);
    const hit = dirCapCache.get(key);
    if (hit) return hit;
    const source = activeSource();
    if (!source) {
      return Promise.reject(Error('No filesystem selected'));
    }
    let depth = path.length;
    /** @type {Cap} */
    let promise;
    for (; depth > 0; depth -= 1) {
      const cached = dirCapCache.get(pathKey(path.slice(0, depth)));
      if (cached) {
        promise = cached;
        break;
      }
    }
    if (depth === 0) {
      promise = dirCapCache.get('');
      if (!promise) {
        promise = getRoot(getViewFilesystem(source));
        promise.catch(() => {});
        dirCapCache.set('', promise);
      }
    }
    for (let i = depth; i < path.length; i += 1) {
      promise = lookupChild(promise, path[i]);
      promise.catch(() => {});
      dirCapCache.set(pathKey(path.slice(0, i + 1)), promise);
    }
    return promise;
  };

  // ---- live-view watchers -----------------------------------------

  const clearWatchers = () => {
    for (const cancel of watchers.values()) {
      cancel();
    }
    watchers.clear();
  };

  /** @returns {Map<string, string[]>} */
  const visibleDirectories = () => {
    /** @type {Map<string, string[]>} */
    const map = new Map();
    if (viewMode === 'columns') {
      for (const column of columns) {
        map.set(pathKey(column.path), column.path);
      }
    } else {
      map.set('', []);
      for (const key of expanded) {
        map.set(key, keyToPath(key));
      }
    }
    return map;
  };

  const scheduleLiveRefresh = () => {
    if (liveTimer) clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      liveTimer = null;
      liveRefresh().catch(reportError);
    }, LIVE_REFRESH_DELAY);
  };

  /**
   * Subscribe to / unsubscribe from directory watchers so exactly
   * the currently-displayed directories are watched.
   */
  const reconcileWatchers = () => {
    if (!activeSource()) {
      clearWatchers();
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
      if (!watchers.has(key)) {
        watchers.set(
          key,
          subscribeChanges(resolveDir(path), () => scheduleLiveRefresh()),
        );
      }
    }
  };

  // ---- dialog ------------------------------------------------------

  /**
   * Show a modal dialog. Resolves with the entered/selected value,
   * or null if cancelled.
   *
   * @param {object} options
   * @param {string} options.title
   * @param {string} [options.message]
   * @param {{ label: string, value?: string, placeholder?: string }} [options.input]
   * @param {Array<{ value: string, label: string }>} [options.choices]
   * @param {string} [options.bodyHtml]
   * @param {string} [options.confirmLabel]
   * @param {boolean} [options.danger]
   * @returns {Promise<string | null>}
   */
  const openDialog = options =>
    new Promise(resolve => {
      const $overlay = document.createElement('div');
      $overlay.className = 'fx-dialog-overlay';
      const choicesHtml = (options.choices || [])
        .map(
          (choice, index) => `
            <label class="fx-dialog-choice">
              <input type="radio" name="fx-dialog-choice" value="${esc(
                choice.value,
              )}" ${index === 0 ? 'checked' : ''} />
              <span>${esc(choice.label)}</span>
            </label>`,
        )
        .join('');
      $overlay.innerHTML = `
        <div class="fx-dialog">
          <div class="fx-dialog-title">${esc(options.title)}</div>
          ${
            options.message
              ? `<div class="fx-dialog-message">${esc(options.message)}</div>`
              : ''
          }
          ${options.bodyHtml || ''}
          ${
            options.input
              ? `<label class="fx-dialog-field">
                   <span>${esc(options.input.label)}</span>
                   <input type="text" class="fx-dialog-input"
                     placeholder="${esc(options.input.placeholder || '')}"
                     value="${esc(options.input.value || '')}" />
                 </label>`
              : ''
          }
          ${choicesHtml ? `<div class="fx-dialog-choices">${choicesHtml}</div>` : ''}
          <div class="fx-dialog-actions">
            <button type="button" class="fx-btn fx-dialog-cancel">Cancel</button>
            <button type="button" class="fx-btn fx-primary ${
              options.danger ? 'fx-danger' : ''
            } fx-dialog-confirm">${esc(options.confirmLabel || 'OK')}</button>
          </div>
        </div>
      `;
      $root.appendChild($overlay);
      const $input = /** @type {HTMLInputElement | null} */ (
        $overlay.querySelector('.fx-dialog-input')
      );
      if ($input) {
        $input.focus();
        $input.select();
      }

      /** @param {string | null} value */
      const close = value => {
        $overlay.remove();
        resolve(value);
      };
      const confirm = () => {
        if ($input) {
          close($input.value.trim());
        } else if (options.choices && options.choices.length > 0) {
          const checked = /** @type {HTMLInputElement | null} */ (
            $overlay.querySelector('input[name="fx-dialog-choice"]:checked')
          );
          close(checked ? checked.value : null);
        } else {
          close('');
        }
      };
      /** @type {HTMLElement} */ (
        $overlay.querySelector('.fx-dialog-confirm')
      ).addEventListener('click', confirm);
      /** @type {HTMLElement} */ (
        $overlay.querySelector('.fx-dialog-cancel')
      ).addEventListener('click', () => close(null));
      $overlay.addEventListener('click', event => {
        if (event.target === $overlay) close(null);
      });
      $overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') close(null);
        if (event.key === 'Enter' && $input) confirm();
      });
    });

  // ---- source management ------------------------------------------

  /**
   * @param {Omit<Source, 'id' | 'useCache'> & { useCache?: boolean }} spec
   * @returns {Source}
   */
  const addSource = spec => {
    sourceCounter += 1;
    const source = {
      useCache: true,
      ...spec,
      id: `s${sourceCounter}`,
    };
    sources.push(source);
    return source;
  };

  /**
   * Resolve the Filesystem cap the explorer should read through
   * for this source. Wraps in the ephemeral CAS read-cache iff the
   * per-source toggle is on; otherwise hands back the original.
   * Memoises the wrap so successive browse operations don't mint
   * a new cache on every call.
   *
   * @param {Source} source
   * @returns {Cap}
   */
  const getViewFilesystem = source => {
    if (!source.useCache) return source.filesystem;
    if (!source._viewFilesystem) {
      source._viewFilesystem = makeCachedFilesystem(source.filesystem);
    }
    return source._viewFilesystem;
  };

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  const selectSource = async id => {
    clearWatchers();
    activeSourceId = id;
    activePath = [];
    columns = [];
    expanded = new Set([pathKey([])]);
    treeChildren = new Map();
    treeLoading.clear();
    treeCurrentDir = [];
    dirCapCache = new Map();
    selectedFile = null;
    editing = false;
    // Switching sources drops any in-flight layer-diff view —
    // the diff was tied to the outgoing source's layer cap.
    viewerMode = 'file';
    layerDiff = null;
    renderToolbar();
    renderViewer();
    await reloadBrowser(false);
  };

  // ---- browser data loading ---------------------------------------

  /**
   * Rebuild the Miller columns along `activePath`, loading every
   * directory listing in parallel.
   *
   * @param {boolean} silent - keep stale columns until data is ready
   * @returns {Promise<void>}
   */
  const rebuildColumns = async silent => {
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
      columns = next;
      renderBrowser();
    }
    await Promise.all(
      next.map(async column => {
        try {
          column.entries = await listDirectory(resolveDir(column.path));
        } catch (error) {
          column.error = error instanceof Error ? error.message : String(error);
        }
        column.loading = false;
        if (columns === next) renderBrowser();
      }),
    );
    columns = next;
    renderBrowser();
  };

  /**
   * @param {boolean} silent
   * @returns {Promise<void>}
   */
  const reloadTree = async silent => {
    /** @type {string[][]} */
    const paths = [[]];
    for (const key of expanded) {
      if (key !== '') paths.push(keyToPath(key));
    }
    await Promise.all(
      paths.map(async path => {
        const key = pathKey(path);
        if (!silent) {
          treeLoading.add(key);
          renderBrowser();
        }
        try {
          treeChildren.set(key, await listDirectory(resolveDir(path)));
        } catch {
          // Leave any previous listing in place.
        }
        treeLoading.delete(key);
        renderBrowser();
      }),
    );
  };

  /**
   * @param {boolean} silent
   * @returns {Promise<void>}
   */
  const reloadBrowser = async silent => {
    if (!activeSource()) {
      renderBrowser();
      reconcileWatchers();
      return;
    }
    beginBusy();
    try {
      if (viewMode === 'columns') {
        await rebuildColumns(silent);
      } else {
        await reloadTree(silent);
      }
    } catch (error) {
      reportError(error);
    } finally {
      endBusy();
    }
    renderBrowser();
    reconcileWatchers();
  };

  /**
   * Manual refresh: drop cached caps and reload.
   *
   * @returns {Promise<void>}
   */
  const refreshActive = async () => {
    dirCapCache = new Map();
    await reloadBrowser(false);
  };

  /**
   * Live refresh triggered by a watch event: drop caps, reload
   * without the loading flicker.
   *
   * @returns {Promise<void>}
   */
  const liveRefresh = async () => {
    dirCapCache = new Map();
    await reloadBrowser(true);
  };

  // ---- entry actions ----------------------------------------------

  /**
   * @param {string[]} parentPath
   * @param {string} name
   * @returns {Promise<void>}
   */
  const openFile = async (parentPath, name) => {
    viewerCollapsed = false;
    viewerLoading = true;
    selectedFile = null;
    editing = false;
    // Selecting a file pops out of the layer-diff view — the
    // viewer can only show one thing at a time, and the file
    // selection is the more recent intent.
    viewerMode = 'file';
    layerDiff = null;
    renderToolbar();
    renderViewer();
    try {
      const fileCap = lookupChild(resolveDir(parentPath), name);
      const { bytes, size, truncated } = await readFile(fileCap);
      const { text, binary } = decodeText(bytes);
      selectedFile = {
        cap: fileCap,
        name,
        parentPath,
        text,
        binary,
        size,
        truncated,
      };
    } catch (error) {
      reportError(error);
    } finally {
      viewerLoading = false;
      renderViewer();
    }
  };

  /**
   * @param {number} columnIndex
   * @param {string} name
   * @returns {Promise<void>}
   */
  const openDirInColumn = async (columnIndex, name) => {
    const path = columns[columnIndex].path.concat(name);
    activePath = path;
    selectedFile = null;
    /** @type {BrowserColumn} */
    const column = { path, entries: [], loading: true, error: '' };
    columns = columns.slice(0, columnIndex + 1).concat(column);
    renderBrowser();
    renderToolbar();
    beginBusy();
    try {
      column.entries = await listDirectory(resolveDir(path));
    } catch (error) {
      column.error = error instanceof Error ? error.message : String(error);
    } finally {
      endBusy();
    }
    column.loading = false;
    renderBrowser();
    reconcileWatchers();
  };

  /**
   * @param {string[]} path
   * @returns {Promise<void>}
   */
  const toggleTreeDir = async path => {
    const key = pathKey(path);
    treeCurrentDir = path;
    if (expanded.has(key)) {
      expanded.delete(key);
      renderBrowser();
      renderToolbar();
      reconcileWatchers();
      return;
    }
    expanded.add(key);
    if (!treeChildren.has(key)) {
      treeLoading.add(key);
      renderBrowser();
      beginBusy();
      try {
        treeChildren.set(key, await listDirectory(resolveDir(path)));
      } catch (error) {
        reportError(error);
      } finally {
        endBusy();
      }
      treeLoading.delete(key);
    }
    renderBrowser();
    renderToolbar();
    reconcileWatchers();
  };

  /** @returns {string[]} */
  const currentDirPath = () =>
    viewMode === 'columns' ? activePath : treeCurrentDir;

  const newFolder = async () => {
    const source = activeSource();
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
  };

  const newFile = async () => {
    const source = activeSource();
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
  };

  /**
   * Propagate a directory rename / move through every path-bearing
   * piece of UI state so that subsequent renders address the new
   * location instead of the old one.
   *
   * Without this, miller columns deeper than the renamed directory
   * (whose `path` still contains the old name), the `activePath`
   * drill-down, the tree's expanded set / cached listings, the
   * directory-cap cache, and `selectedFile.parentPath` all keep
   * referring to the disappeared path and surface ENOENT on the
   * next refresh. File renames don't have descendants, so we
   * only need to retarget the selected-file pointer in that case.
   *
   * @param {string[]} oldParent
   * @param {string} oldName
   * @param {string[]} newParent
   * @param {string} newName
   * @param {'directory' | 'file'} entryType
   */
  const cascadeRename = (oldParent, oldName, newParent, newName, entryType) => {
    if (selectedFile) {
      const isSelf =
        pathKey(selectedFile.parentPath) === pathKey(oldParent) &&
        selectedFile.name === oldName;
      if (isSelf && entryType === 'file') {
        // The viewer's open file moved with the rename — update the
        // pointer rather than clearing the viewer.
        selectedFile = { ...selectedFile, name: newName, parentPath: newParent };
      } else if (isSelf) {
        // The selected entry *is* a directory that got renamed —
        // a directory was never showing in the viewer anyway, but
        // belt-and-braces: drop the pointer.
        selectedFile = null;
      } else if (entryType !== 'file') {
        // The selected file may live *inside* the moved directory;
        // rewrite its parentPath so the viewer's "save" round-trips
        // hit the right destination.
        const nextParent = rewritePath(
          selectedFile.parentPath,
          oldParent,
          oldName,
          newParent,
          newName,
        );
        if (nextParent !== selectedFile.parentPath) {
          selectedFile = { ...selectedFile, parentPath: nextParent };
        }
      }
    }
    if (entryType === 'file') return;

    activePath = rewritePath(
      activePath,
      oldParent,
      oldName,
      newParent,
      newName,
    );
    treeCurrentDir = rewritePath(
      treeCurrentDir,
      oldParent,
      oldName,
      newParent,
      newName,
    );
    columns = columns.map(column => ({
      ...column,
      path: rewritePath(column.path, oldParent, oldName, newParent, newName),
    }));

    // Tree / cap caches are keyed by pathKey(...) — rebuild the
    // affected entries under their new keys (and drop the old).
    /** @type {Set<string>} */
    const nextExpanded = new Set();
    for (const key of expanded) {
      const next = rewritePath(
        keyToPath(key),
        oldParent,
        oldName,
        newParent,
        newName,
      );
      nextExpanded.add(pathKey(next));
    }
    expanded = nextExpanded;

    /** @type {Map<string, import('./file-explorer-fs.js').DirEntry[]>} */
    const nextChildren = new Map();
    for (const [key, value] of treeChildren) {
      const next = rewritePath(
        keyToPath(key),
        oldParent,
        oldName,
        newParent,
        newName,
      );
      nextChildren.set(pathKey(next), value);
    }
    treeChildren = nextChildren;

    // `dirCapCache` is anyway cleared by `refreshActive()` below,
    // so no need to rewrite — its stale entries would only matter
    // if a caller bypassed `refreshActive`, which none currently do.
  };

  /**
   * @param {string[]} parentPath
   * @param {string} name
   * @param {'directory' | 'file'} type
   */
  const renameEntryAction = async (parentPath, name, type) => {
    const source = activeSource();
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
      cascadeRename(parentPath, name, parentPath, newName, type);
      renderViewer();
      await refreshActive();
    } catch (error) {
      reportError(error);
    }
  };

  /**
   * @param {string[]} parentPath
   * @param {string} name
   * @param {'directory' | 'file'} type
   */
  const deleteEntryAction = async (parentPath, name, type) => {
    const source = activeSource();
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
      if (
        selectedFile &&
        pathKey(selectedFile.parentPath) === pathKey(parentPath) &&
        selectedFile.name === name
      ) {
        selectedFile = null;
        renderViewer();
      }
      await refreshActive();
    } catch (error) {
      reportError(error);
    }
  };

  /**
   * Move an entry by renaming it into a different directory.
   *
   * @param {string[]} fromParent
   * @param {string} name
   * @param {string[]} toParent
   * @param {'directory' | 'file'} [type] - Type of the moved entry,
   *   carried by the drag payload. Needed so that the path-cascade
   *   only rewrites descendants for directory moves; falls back to
   *   `'directory'` (the safe over-approximation) if the caller
   *   didn't supply it.
   */
  const moveEntry = async (fromParent, name, toParent, type = 'directory') => {
    const source = activeSource();
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
      cascadeRename(fromParent, name, toParent, name, type);
      renderViewer();
      await refreshActive();
    } catch (error) {
      reportError(error);
    }
  };

  // ---- filesystem tooling -----------------------------------------

  const addMemoryFilesystem = async () => {
    const defaultName = `scratch-${sourceCounter + 1}`;
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
      // `makeUnconfined` (rather than client-side
      // `makeMemoryFilesystem() + storeValue(...)`) so the daemon
      // formulates the filesystem itself — otherwise storeValue
      // fails with "No corresponding formula for (an object)"
      // because the client-side cap has no daemon recipe.
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
  };

  /**
   * Open an already-classified capability as an explorer source.
   * Shared between the manual "Open by pet name" dialog and the
   * inventory sidebar's click handler — both end up minting an
   * identical `Source`.
   *
   * @param {string} label
   * @param {Cap} cap
   * @param {'filesystem' | 'layer' | 'mount'} kind
   * @param {string} [petName]  inventory pet name (or
   *   slash/dot-separated path) for this cap, when known. Lets
   *   downstream "Save read-only view" / "Save layer" actions
   *   address the cap on the daemon side.
   */
  const openFsCap = async (label, cap, kind, petName) => {
    // `toFilesystem` may return a Promise (layer case) — await
    // uniformly so the caller always gets a concrete Filesystem
    // cap to hand to the source list.
    const filesystem = await toFilesystem(cap, kind);
    /** @type {Source['kind']} */
    let sourceKind;
    if (kind === 'mount') sourceKind = 'mount';
    else if (kind === 'layer') sourceKind = 'layer';
    else sourceKind = 'lookup';
    /** @type {Omit<Source, 'id' | 'useCache'> & { useCache?: boolean }} */
    const spec = {
      label,
      kind: sourceKind,
      filesystem,
      readOnly: false,
    };
    if (petName) spec.petName = petName;
    if (kind === 'layer') {
      // Remember the Layer cap on the source so the layer-specific
      // actions (Apply, Changes, Revert) light up — opening from
      // the inventory should restore them just like creating the
      // layer in this session would.
      spec.layer = cap;
    }
    const source = addSource(spec);
    if (kind === 'mount') {
      setStatus(`Opened Mount "${source.label}" via endo-fs from-mount`);
    } else if (kind === 'layer') {
      setStatus(`Opened layer "${source.label}" (composed view)`);
    } else {
      setStatus(`Opened filesystem "${source.label}"`);
    }
    await selectSource(source.id);
  };

  const openByPetName = async () => {
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
      // Walk the pet-name path one segment at a time; the chain
      // pipelines into a single round trip.
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
  };

  /**
   * Toggle the per-source CAS read-cache. View-only: doesn't
   * affect the underlying cap (so anything we'd hand back via
   * `storeValue` / `applyLayer` is still the raw filesystem),
   * just whether the explorer's reads go through an ephemeral
   * content-addressed LRU. Flipping the toggle drops the
   * memoised wrap + cap cache so the next browse picks up the
   * new view.
   */
  const toggleViewCache = async () => {
    const source = activeSource();
    if (!source) return;
    source.useCache = !source.useCache;
    source._viewFilesystem = undefined;
    dirCapCache = new Map();
    setStatus(
      source.useCache
        ? `Enabled CAS read-cache on "${source.label}"`
        : `Disabled CAS read-cache on "${source.label}"`,
    );
    renderToolbar();
    await reloadBrowser(false);
  };

  /**
   * Prompt for a pet name and ask the daemon to formulate a
   * read-only attenuator over the active source via
   * `makeUnconfined(readonly-module, env.SOURCE_NAME=<source>)`.
   * Going through the module recipe (rather than `storeValue(
   * readOnly(fs))` from the client) is what makes the view
   * durable — a client-side `readOnly` wrap has no formula and
   * would fail to marshal back through the daemon.
   *
   * The active source must itself be addressable from the
   * profile-resolved host's NameHub (i.e. it must be the result
   * of an inventory lookup, "Open by pet name", or another
   * Save action). Ad-hoc session-only sources fail with a clear
   * error rather than a daemon marshalling cryptic.
   */
  const saveReadOnlyView = async () => {
    const source = activeSource();
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
  };

  /**
   * Prompt for a Layer pet name and a composed-view pet name,
   * persist both to the inventory, and open the composed view as
   * the active source.
   *
   * Two daemon formulas are minted (so both survive restart):
   *
   *   1. `makeUnconfined(layer-module, env.BACKING_NAME=<source>)`
   *      → the writable Layer cap, with its diff/apply surface.
   *   2. `evaluate('E(layer).asFilesystem()', {layer}, ...)`
   *      → the composed view, defined as a derivation of the
   *      layer formula so re-instantiation stays consistent.
   *
   * Going through these recipes (rather than client-side wraps
   * + `storeValue`) is what makes both durable — the client's
   * `makeLayer(...)` cap has no formula to marshal.
   */
  const saveLayer = async () => {
    const source = activeSource();
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
      // Note: the daemon worker runs `compartment.evaluate(source)`
      // as a script expression (no top-level await). `E(layer)
      // .asFilesystem()` already returns a Promise that the
      // marshaller resolves on the way back, so we hand the
      // expression in bare.
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
  };

  // Sentinel choice value for the "(layer backing)" entry in the
  // Apply-layer dialog. Picked instead of a real source id so a
  // user can't accidentally provision a pet name that collides
  // (pet names can't contain `__`-bracketed sentinels).
  const APPLY_BACKING_CHOICE = '__layer-backing__';

  const applyActiveLayer = async () => {
    const source = activeSource();
    if (!source || source.kind !== 'layer' || !source.layer) return;
    // De-duplicate sibling sources: multiple inventory clicks on
    // the same pet name (or opening one fs both directly and via
    // a derived view) used to surface as several identical
    // choices. Key on `petName || id` so session-only sources
    // remain individually addressable.
    const seen = new Set();
    /** @type {Source[]} */
    const candidates = [];
    for (const candidate of sources) {
      if (candidate.id === source.id) continue;
      if (candidate.readOnly) continue;
      const key = candidate.petName || candidate.id;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
    }
    // Always offer the layer's own backing as the first (and
    // default-selected) choice. That's the typical commit
    // motion — "fold these staged changes back into the fs they
    // were layered over" — so making the user pick it from a
    // list every time was unnecessary friction. We compute the
    // backing cap lazily, after confirmation, so the dialog
    // doesn't pay a CapTP round trip when the user just wants to
    // cancel.
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
        const target = sources.find(candidate => candidate.id === targetId);
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
  };

  const revertActiveLayer = async () => {
    const source = activeSource();
    if (!source || source.kind !== 'layer') return;
    const confirmed = await openDialog({
      title: 'Revert layer',
      message: `Discard all changes accumulated in "${source.label}"?`,
      confirmLabel: 'Revert',
      danger: true,
    });
    if (confirmed === null) return;
    const index = sources.findIndex(candidate => candidate.id === source.id);
    if (index >= 0) sources.splice(index, 1);
    setStatus(`Reverted layer ${source.label}`);
    const fallback =
      sources.find(candidate => candidate.id === source.backingSourceId) ||
      sources[0];
    if (fallback) {
      await selectSource(fallback.id);
    } else {
      clearWatchers();
      activeSourceId = null;
      columns = [];
      renderToolbar();
      renderBrowser();
      renderViewer();
    }
  };

  /**
   * Read the text of a single file at `pathSegments` out of the
   * given filesystem. Returns `null` if the path doesn't exist or
   * the file is binary — both produce a `# binary or missing`
   * marker in the diff rather than a corrupt patch.
   *
   * Uses the existing `readFile` preview helper, so very large
   * files are truncated to the preview cap; the diff document
   * notes that explicitly via a `# truncated:` comment so the
   * user knows the visible diff isn't the whole story.
   *
   * @param {Cap} fs
   * @param {string[]} pathSegments
   * @returns {Promise<{ text: string, truncated: boolean } | null>}
   */
  const readTextAtPath = async (fs, pathSegments) => {
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
  };

  /**
   * Build a unified-diff document for the active layer's
   * accumulated changes and show it in the viewer pane (with
   * `diff` syntax highlighting), replacing whatever was selected.
   *
   * Per touched path we group the layer ops, look the path up in
   * both the layer's backing and the composed view, and emit a
   * `--- a/path` / `+++ b/path` section comparing the two. For
   * paths whose ops are metadata-only (set-attrs / set-xattr /
   * create-dir / opaque-dir) we emit a one-line `# kind: path`
   * marker — those don't have a meaningful unified-diff form.
   */
  const viewLayerDiff = async () => {
    const source = activeSource();
    if (!source || source.kind !== 'layer' || !source.layer) return;
    beginBusy();
    try {
      const ops = await collectLayerOps(source.layer);
      if (ops.length === 0) {
        layerDiff = {
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
        /** @type {string[]} */
        const sections = [];
        for (const { path, kinds } of byPath.values()) {
          const pathStr = path.join('/');
          if (path.length === 0) {
            sections.push(`# root: ${[...kinds].join(', ')}`);
            continue;
          }
          if (kinds.has('whiteout')) {
            const backingRead = await readTextAtPath(backing, path);
            if (backingRead === null) {
              sections.push(`# whiteout (no backing or binary): ${pathStr}`);
            } else {
              const sec = buildUnifiedDiffSection(
                pathStr,
                backingRead.text,
                '',
              );
              sections.push(
                backingRead.truncated
                  ? `${sec}\n# truncated: backing preview only`
                  : sec,
              );
            }
            continue;
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
              sections.push(
                `# ${[...kinds].join(', ')} (binary or missing): ${pathStr}`,
              );
              continue;
            }
            const sec = buildUnifiedDiffSection(pathStr, oldText, newText);
            const notes = [];
            if (backingRead?.truncated) notes.push('backing preview only');
            if (layerRead?.truncated) notes.push('layer preview only');
            sections.push(
              notes.length ? `${sec}\n# truncated: ${notes.join(', ')}` : sec,
            );
            continue;
          }
          sections.push(`# ${[...kinds].join(', ')}: ${pathStr}`);
        }
        layerDiff = {
          layerLabel: source.label,
          content: sections.join('\n\n'),
        };
      }
      viewerMode = 'layer-diff';
      selectedFile = null;
      editing = false;
      viewerCollapsed = false;
      renderToolbar();
      renderViewer();
    } catch (error) {
      reportError(error);
    } finally {
      endBusy();
    }
  };

  // ---- viewer (file editing) --------------------------------------

  const saveSelectedFile = async () => {
    if (!selectedFile) return;
    const $editor = /** @type {HTMLTextAreaElement | null} */ (
      $viewer.querySelector('.fx-editor')
    );
    if (!$editor) return;
    const text = $editor.value;
    const file = selectedFile;
    beginBusy();
    try {
      await writeFileText(file.cap, text);
      selectedFile = {
        ...file,
        text,
        size: new TextEncoder().encode(text).length,
      };
      editing = false;
      setStatus(`Saved ${file.name}`);
      renderViewer();
      await refreshActive();
    } catch (error) {
      reportError(error);
    } finally {
      endBusy();
    }
  };

  // ---- rendering ---------------------------------------------------

  /**
   * @param {string} label
   * @param {string} cls
   * @param {boolean} [disabled]
   * @returns {string}
   */
  const button = (label, cls, disabled) =>
    `<button type="button" class="fx-btn ${cls}" ${
      disabled ? 'disabled' : ''
    }>${esc(label)}</button>`;

  function renderToolbar() {
    const source = activeSource();
    const isLayer = !!source && source.kind === 'layer';
    const readOnly = !!source && source.readOnly;
    const useCache = !!source && source.useCache;
    const optionsHtml = sources
      .map(
        item =>
          `<option value="${esc(item.id)}" ${
            item.id === activeSourceId ? 'selected' : ''
          }>${esc(item.label)}</option>`,
      )
      .join('');
    // Three categories surfaced as labelled clusters: view options
    // (what the explorer shows), new-fs options (what the user
    // mints into the inventory), and file actions (mutations on
    // the active source). When the active source is a layer, the
    // layer-specific actions show up as a fourth, labelled
    // subgroup.
    $toolbar.innerHTML = `
      <div class="fx-toolbar-group fx-group-view">
        <span class="fx-group-label">View</span>
        <select class="fx-source-select" ${
          sources.length ? '' : 'disabled'
        }>${optionsHtml || '<option>No filesystem</option>'}</select>
        <div class="fx-segmented">
          <button type="button" class="fx-seg ${
            viewMode === 'columns' ? 'fx-seg-on' : ''
          }" data-view="columns">Columns</button>
          <button type="button" class="fx-seg ${
            viewMode === 'tree' ? 'fx-seg-on' : ''
          }" data-view="tree">Tree</button>
        </div>
        <label class="fx-check ${source ? '' : 'fx-check-disabled'}" title="Wrap reads through an ephemeral content-addressed LRU cache (view-only)">
          <input type="checkbox" class="fx-act-cache" ${
            useCache ? 'checked' : ''
          } ${source ? '' : 'disabled'} />
          <span>CAS cache</span>
        </label>
        ${button('↻ Refresh', 'fx-act-refresh', !source)}
      </div>
      <div class="fx-toolbar-group fx-group-new">
        <span class="fx-group-label">New filesystem</span>
        ${button('+ In-memory', 'fx-act-memory')}
        ${button('Open…', 'fx-act-open')}
        ${button('Save read-only view…', 'fx-act-readonly', !source)}
        ${button('Save layer…', 'fx-act-layer', !source)}
      </div>
      <div class="fx-toolbar-group fx-group-actions">
        <span class="fx-group-label">File actions</span>
        ${button('New folder', 'fx-act-newfolder', !source || readOnly)}
        ${button('New file', 'fx-act-newfile', !source || readOnly)}
      </div>
      ${
        isLayer
          ? `<div class="fx-toolbar-group fx-layer-group">
               <span class="fx-group-label">Layer</span>
               ${button('View layer diff', 'fx-act-changes')}
               ${button('Apply layer…', 'fx-act-apply')}
               ${button('Revert layer', 'fx-act-revert')}
             </div>`
          : ''
      }
    `;

    const $select = /** @type {HTMLSelectElement | null} */ (
      $toolbar.querySelector('.fx-source-select')
    );
    if ($select) {
      $select.addEventListener('change', () => {
        selectSource($select.value).catch(reportError);
      });
    }
    /**
     * @param {string} cls
     * @param {() => void} handler
     */
    const onClick = (cls, handler) => {
      const $btn = $toolbar.querySelector(`.${cls}`);
      if ($btn) $btn.addEventListener('click', handler);
    };
    onClick('fx-act-memory', () => {
      addMemoryFilesystem().catch(reportError);
    });
    onClick('fx-act-open', () => {
      openByPetName().catch(reportError);
    });
    onClick('fx-act-readonly', () => {
      saveReadOnlyView().catch(reportError);
    });
    onClick('fx-act-layer', () => {
      saveLayer().catch(reportError);
    });
    onClick('fx-act-refresh', () => {
      refreshActive().catch(reportError);
    });
    onClick('fx-act-newfolder', () => {
      newFolder().catch(reportError);
    });
    onClick('fx-act-newfile', () => {
      newFile().catch(reportError);
    });
    onClick('fx-act-apply', () => {
      applyActiveLayer().catch(reportError);
    });
    onClick('fx-act-changes', () => {
      viewLayerDiff().catch(reportError);
    });
    onClick('fx-act-revert', () => {
      revertActiveLayer().catch(reportError);
    });
    const $cache = $toolbar.querySelector('.fx-act-cache');
    if ($cache) {
      $cache.addEventListener('change', () => {
        toggleViewCache().catch(reportError);
      });
    }
    for (const $seg of $toolbar.querySelectorAll('.fx-seg')) {
      $seg.addEventListener('click', () => {
        const next = /** @type {HTMLElement} */ ($seg).dataset.view;
        if ((next === 'columns' || next === 'tree') && next !== viewMode) {
          viewMode = next;
          renderToolbar();
          reloadBrowser(false).catch(reportError);
        }
      });
    }
  }

  /**
   * Build one entry row.
   *
   * @param {import('./file-explorer-fs.js').DirEntry} entry
   * @param {string[]} parentPath
   * @param {object} flags
   * @param {boolean} flags.selected
   * @param {boolean} flags.readOnly
   * @param {number} [flags.depth]
   * @param {string} [flags.twisty]
   * @returns {string}
   */
  const entryRowHtml = (entry, parentPath, flags) => {
    const icon = entry.type === 'directory' ? '\u{1F4C1}' : '\u{1F4C4}';
    const indent =
      flags.depth !== undefined
        ? ` style="padding-left:${8 + flags.depth * 16}px"`
        : '';
    const actions = flags.readOnly
      ? ''
      : `<span class="fx-entry-actions">
           <button type="button" class="fx-mini fx-entry-rename"
             title="Rename" draggable="false">✎</button>
           <button type="button" class="fx-mini fx-entry-delete"
             title="Delete" draggable="false">✕</button>
         </span>`;
    return `
      <div class="fx-entry ${entry.type} ${
        flags.selected ? 'fx-selected' : ''
      }"${indent}
        draggable="${flags.readOnly ? 'false' : 'true'}"
        data-name="${esc(entry.name)}"
        data-type="${entry.type}"
        data-parent="${esc(JSON.stringify(parentPath))}">
        ${
          flags.twisty !== undefined
            ? `<span class="fx-twisty">${flags.twisty}</span>`
            : ''
        }
        <span class="fx-entry-icon">${icon}</span>
        <span class="fx-entry-name">${esc(entry.name)}</span>
        ${actions}
      </div>
    `;
  };

  const renderColumns = () => {
    const source = activeSource();
    const readOnly = !!source && source.readOnly;
    const html = columns
      .map((column, columnIndex) => {
        const drillName =
          columnIndex < activePath.length ? activePath[columnIndex] : null;
        const fileName =
          selectedFile &&
          pathKey(selectedFile.parentPath) === pathKey(column.path)
            ? selectedFile.name
            : null;
        let inner;
        if (column.loading) {
          inner =
            '<div class="fx-loading-row"><span class="fx-spinner"></span>Loading…</div>';
        } else if (column.error) {
          inner = `<div class="fx-empty-col fx-col-error">${esc(
            column.error,
          )}</div>`;
        } else if (column.entries.length === 0) {
          inner = '<div class="fx-empty-col">empty</div>';
        } else {
          inner = column.entries
            .map(entry =>
              entryRowHtml(entry, column.path, {
                selected: entry.name === drillName || entry.name === fileName,
                readOnly,
              }),
            )
            .join('');
        }
        return `
          <div class="fx-column" data-column="${columnIndex}"
            data-path="${esc(JSON.stringify(column.path))}">
            <div class="fx-column-head">${
              column.path.length
                ? esc(column.path[column.path.length - 1])
                : '/'
            }</div>
            <div class="fx-column-list">${inner}</div>
          </div>
        `;
      })
      .join('');
    $browser.innerHTML = `<div class="fx-columns">${html}</div>`;
  };

  /**
   * @param {string[]} path
   * @param {import('./file-explorer-fs.js').DirEntry} entry
   * @param {number} depth
   * @param {boolean} readOnly
   * @returns {string}
   */
  const renderTreeNode = (path, entry, depth, readOnly) => {
    const selfPath = [...path, entry.name];
    if (entry.type === 'file') {
      const selected =
        !!selectedFile &&
        pathKey(selectedFile.parentPath) === pathKey(path) &&
        selectedFile.name === entry.name;
      return entryRowHtml(entry, path, {
        selected,
        readOnly,
        depth,
        twisty: ' ',
      });
    }
    const key = pathKey(selfPath);
    const isOpen = expanded.has(key);
    const selected = pathKey(treeCurrentDir) === key;
    let html = entryRowHtml(entry, path, {
      selected,
      readOnly,
      depth,
      twisty: isOpen ? '▾' : '▸',
    });
    if (isOpen) {
      if (treeLoading.has(key)) {
        html += `<div class="fx-loading-row" style="padding-left:${
          8 + (depth + 1) * 16
        }px"><span class="fx-spinner"></span>Loading…</div>`;
      }
      const children = treeChildren.get(key);
      if (children) {
        for (const child of children) {
          html += renderTreeNode(selfPath, child, depth + 1, readOnly);
        }
      }
    }
    return html;
  };

  const renderTree = () => {
    const source = activeSource();
    const readOnly = !!source && source.readOnly;
    const rootKey = pathKey([]);
    const rootOpen = expanded.has(rootKey);
    const rootSelected = pathKey(treeCurrentDir) === rootKey;
    let html = `
      <div class="fx-entry directory ${rootSelected ? 'fx-selected' : ''}"
        data-name="" data-type="directory" data-parent="[]" draggable="false">
        <span class="fx-twisty">${rootOpen ? '▾' : '▸'}</span>
        <span class="fx-entry-icon">\u{1F5C2}</span>
        <span class="fx-entry-name">${esc(source ? source.label : '/')}</span>
      </div>
    `;
    if (rootOpen) {
      if (treeLoading.has(rootKey)) {
        html += `<div class="fx-loading-row" style="padding-left:24px"><span class="fx-spinner"></span>Loading…</div>`;
      }
      for (const child of treeChildren.get(rootKey) || []) {
        html += renderTreeNode([], child, 1, readOnly);
      }
    }
    $browser.innerHTML = `<div class="fx-tree">${html}</div>`;
  };

  const bindBrowserEvents = () => {
    const source = activeSource();
    const readOnly = !!source && source.readOnly;

    for (const $entry of $browser.querySelectorAll('.fx-entry')) {
      const el = /** @type {HTMLElement} */ ($entry);
      const name = el.dataset.name || '';
      const type = el.dataset.type === 'directory' ? 'directory' : 'file';
      /** @type {string[]} */
      const parentPath = JSON.parse(el.dataset.parent || '[]');

      el.addEventListener('click', event => {
        const target = /** @type {HTMLElement} */ (event.target);
        if (target.closest('.fx-entry-actions')) return;
        if (viewMode === 'columns') {
          const $column = el.closest('.fx-column');
          const columnIndex = $column
            ? Number(/** @type {HTMLElement} */ ($column).dataset.column)
            : 0;
          if (type === 'directory') {
            openDirInColumn(columnIndex, name).catch(reportError);
          } else {
            activePath = columns[columnIndex].path;
            columns = columns.slice(0, columnIndex + 1);
            renderBrowser();
            renderToolbar();
            openFile(parentPath, name).catch(reportError);
          }
        } else if (type === 'directory') {
          toggleTreeDir(name === '' ? [] : [...parentPath, name]).catch(
            reportError,
          );
        } else {
          openFile(parentPath, name).catch(reportError);
        }
      });

      const $rename = el.querySelector('.fx-entry-rename');
      if ($rename) {
        $rename.addEventListener('click', event => {
          event.stopPropagation();
          renameEntryAction(parentPath, name, type).catch(reportError);
        });
      }
      const $delete = el.querySelector('.fx-entry-delete');
      if ($delete) {
        $delete.addEventListener('click', event => {
          event.stopPropagation();
          deleteEntryAction(parentPath, name, type).catch(reportError);
        });
      }

      if (!readOnly && name !== '') {
        el.addEventListener('dragstart', event => {
          const transfer = /** @type {DragEvent} */ (event).dataTransfer;
          if (transfer) {
            transfer.effectAllowed = 'move';
            // Carry the entry type alongside the source coordinates
            // so `moveEntry` can decide whether descendants need
            // path rewrites (only directories do).
            transfer.setData(
              'application/json',
              JSON.stringify({ parentPath, name, type }),
            );
          }
        });
      }
      if (!readOnly && type === 'directory') {
        el.addEventListener('dragover', event => {
          event.preventDefault();
          // Don't let the column-level drop handler also claim this
          // drop — that would cause us to move into the column's
          // own path instead of the (deeper) target directory.
          event.stopPropagation();
          const transfer = /** @type {DragEvent} */ (event).dataTransfer;
          if (transfer) transfer.dropEffect = 'move';
          el.classList.add('fx-drop-target');
        });
        el.addEventListener('dragleave', () => {
          el.classList.remove('fx-drop-target');
        });
        el.addEventListener('drop', event => {
          event.preventDefault();
          event.stopPropagation();
          el.classList.remove('fx-drop-target');
          const transfer = /** @type {DragEvent} */ (event).dataTransfer;
          if (!transfer) return;
          let payload;
          try {
            payload = JSON.parse(transfer.getData('application/json'));
          } catch {
            return;
          }
          const destPath = name === '' ? [] : [...parentPath, name];
          moveEntry(
            payload.parentPath,
            payload.name,
            destPath,
            payload.type,
          ).catch(reportError);
        });
      }
    }

    // Column-level drop target: dropping an entry anywhere on a
    // column (empty area, file row, or column header) moves it
    // into the directory that column represents. Drops that land
    // on a directory entry are handled by the entry-level
    // listeners above (which stopPropagation), so this only fires
    // for the "miss". Only attach in columns mode and when the
    // source is writable.
    if (!readOnly && viewMode === 'columns') {
      for (const $col of $browser.querySelectorAll('.fx-column')) {
        const col = /** @type {HTMLElement} */ ($col);
        /** @type {string[]} */
        const colPath = JSON.parse(col.dataset.path || '[]');
        col.addEventListener('dragover', event => {
          event.preventDefault();
          const transfer = /** @type {DragEvent} */ (event).dataTransfer;
          if (transfer) transfer.dropEffect = 'move';
          col.classList.add('fx-drop-target');
        });
        col.addEventListener('dragleave', event => {
          // `dragleave` fires when crossing any child boundary, so
          // only drop the highlight when we've actually left the
          // column (relatedTarget is outside it).
          const next = /** @type {DragEvent} */ (event).relatedTarget;
          if (next instanceof Node && col.contains(next)) return;
          col.classList.remove('fx-drop-target');
        });
        col.addEventListener('drop', event => {
          event.preventDefault();
          col.classList.remove('fx-drop-target');
          const transfer = /** @type {DragEvent} */ (event).dataTransfer;
          if (!transfer) return;
          let payload;
          try {
            payload = JSON.parse(transfer.getData('application/json'));
          } catch {
            return;
          }
          moveEntry(
            payload.parentPath,
            payload.name,
            colPath,
            payload.type,
          ).catch(reportError);
        });
      }
    }
  };

  function renderBrowser() {
    if (!activeSource()) {
      $browser.innerHTML = `
        <div class="fx-emptystate">
          <div class="fx-emptystate-title">No filesystem open</div>
          <div class="fx-emptystate-text">
            Browse an endo-fs Filesystem, a legacy Mount (via from-mount),
            or a fresh in-memory filesystem.
          </div>
          <div class="fx-emptystate-actions">
            ${button(
              'Create in-memory filesystem',
              'fx-empty-memory fx-primary',
            )}
            ${button('Open by pet name', 'fx-empty-open')}
          </div>
        </div>
      `;
      const $m = $browser.querySelector('.fx-empty-memory');
      if ($m)
        $m.addEventListener('click', () => {
          addMemoryFilesystem().catch(reportError);
        });
      const $o = $browser.querySelector('.fx-empty-open');
      if ($o)
        $o.addEventListener('click', () => {
          openByPetName().catch(reportError);
        });
      return;
    }
    if (viewMode === 'columns') {
      renderColumns();
    } else {
      renderTree();
    }
    bindBrowserEvents();
  }

  function renderViewer() {
    $viewer.hidden = viewerCollapsed;
    $splitter.hidden = viewerCollapsed;
    if (viewerCollapsed) return;
    $viewer.style.width = `${viewerWidth}px`;

    if (viewerMode === 'layer-diff' && layerDiff) {
      const diffView = layerDiff;
      $viewer.innerHTML = `
        <div class="fx-viewer-head">
          <span class="fx-viewer-title" title="Layer diff: ${esc(
            diffView.layerLabel,
          )}">Layer diff: ${esc(diffView.layerLabel)}</span>
          <button type="button" class="fx-mini fx-viewer-close" title="Collapse">»</button>
        </div>
        <div class="fx-viewer-body">
          <pre class="fx-code"><code>${esc(diffView.content)}</code></pre>
        </div>
      `;
      const $diffCode = $viewer.querySelector('.fx-code code');
      colorize(diffView.content, 'diff')
        .then(coloredHtml => {
          // Re-check that we're still showing the same diff —
          // the user may have navigated away while colorize was
          // resolving.
          if (
            $diffCode &&
            viewerMode === 'layer-diff' &&
            layerDiff === diffView
          ) {
            $diffCode.innerHTML = coloredHtml;
          }
        })
        .catch(() => {
          // Keep the plain-text view on colorize failure.
        });
      const $closeDiff = $viewer.querySelector('.fx-viewer-close');
      if ($closeDiff)
        $closeDiff.addEventListener('click', () => {
          viewerCollapsed = true;
          renderToolbar();
          renderViewer();
        });
      return;
    }

    if (viewerLoading) {
      $viewer.innerHTML = `
        <div class="fx-viewer-head">
          <span class="fx-viewer-title">Loading…</span>
          <button type="button" class="fx-mini fx-viewer-close" title="Collapse">»</button>
        </div>
        <div class="fx-viewer-empty"><span class="fx-spinner"></span>Reading file…</div>
      `;
    } else if (!selectedFile) {
      $viewer.innerHTML = `
        <div class="fx-viewer-head">
          <span class="fx-viewer-title">Viewer</span>
          <button type="button" class="fx-mini fx-viewer-close" title="Collapse">»</button>
        </div>
        <div class="fx-viewer-empty">Select a file to preview it.</div>
      `;
    } else {
      const file = selectedFile;
      const language = languageForName(file.name);
      const meta = `${formatSize(file.size)} · ${language}${
        file.truncated ? ' · truncated' : ''
      }`;
      const source = activeSource();
      // A truncated preview must not be saved — that would
      // overwrite the file with only its first chunk.
      const canEdit =
        !!source && !source.readOnly && !file.binary && !file.truncated;
      const controls = editing
        ? `${button('Save', 'fx-viewer-save fx-primary')}
           ${button('Cancel', 'fx-viewer-cancel')}`
        : canEdit
          ? button('Edit', 'fx-viewer-edit')
          : '';
      let bodyHtml;
      if (file.binary) {
        bodyHtml =
          '<div class="fx-viewer-empty">Binary file — preview not available.</div>';
      } else if (editing) {
        bodyHtml = `<textarea class="fx-editor" spellcheck="false">${esc(
          file.text,
        )}</textarea>`;
      } else {
        bodyHtml = `<pre class="fx-code"><code>${esc(file.text)}</code></pre>`;
      }
      $viewer.innerHTML = `
        <div class="fx-viewer-head">
          <span class="fx-viewer-title" title="${esc(file.name)}">${esc(
            file.name,
          )}</span>
          <span class="fx-viewer-meta">${esc(meta)}</span>
          <span class="fx-viewer-controls">${controls}</span>
          <button type="button" class="fx-mini fx-viewer-close" title="Collapse">»</button>
        </div>
        <div class="fx-viewer-body">${bodyHtml}</div>
      `;
      if (!editing && !file.binary && language !== 'plaintext') {
        const $code = $viewer.querySelector('.fx-code code');
        colorize(file.text, language)
          .then(coloredHtml => {
            if ($code && !editing && selectedFile === file) {
              $code.innerHTML = coloredHtml;
            }
          })
          .catch(() => {});
      }
      const $edit = $viewer.querySelector('.fx-viewer-edit');
      if ($edit)
        $edit.addEventListener('click', () => {
          editing = true;
          renderViewer();
        });
      const $save = $viewer.querySelector('.fx-viewer-save');
      if ($save)
        $save.addEventListener('click', () => {
          saveSelectedFile().catch(reportError);
        });
      const $cancel = $viewer.querySelector('.fx-viewer-cancel');
      if ($cancel)
        $cancel.addEventListener('click', () => {
          editing = false;
          renderViewer();
        });
    }
    const $close = $viewer.querySelector('.fx-viewer-close');
    if ($close)
      $close.addEventListener('click', () => {
        viewerCollapsed = true;
        renderToolbar();
        renderViewer();
      });
  }

  function renderStatus() {
    $status.className = `fx-status ${
      status.kind ? `fx-status-${status.kind}` : ''
    }`;
    const spinner = busyCount > 0 ? '<span class="fx-spinner"></span>' : '';
    $status.innerHTML = `${spinner}<span class="fx-status-text">${esc(
      status.message,
    )}</span>`;
  }

  // ---- splitter ----------------------------------------------------

  $splitter.addEventListener('mousedown', event => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = viewerWidth;
    /** @param {MouseEvent} moveEvent */
    const onMove = moveEvent => {
      const delta = startX - moveEvent.clientX;
      viewerWidth = Math.max(
        260,
        Math.min(window.innerWidth - 320, startWidth + delta),
      );
      $viewer.style.width = `${viewerWidth}px`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // ---- inventory sidebar ------------------------------------------

  // Tracks the per-name <button> + its abort flag so that
  // `{ remove: name }` events can clean up the row and its
  // in-flight classification.
  /** @type {Map<string, { $row: HTMLElement, abort: { aborted: boolean } }>} */
  const invItems = new Map();
  let invStopped = false;
  /** @type {AsyncIterableIterator<{ add?: string, remove?: string }> | null} */
  let invIter = null;

  /**
   * Render a single inventory row and classify it asynchronously.
   * Rows start disabled (greyed) and become clickable once we've
   * confirmed they classify as a Filesystem or a Mount. Anything
   * else stays greyed with an explanatory tooltip.
   *
   * @param {string} name
   */
  const addInvItem = name => {
    if (invItems.has(name)) return;
    const $row = document.createElement('button');
    $row.type = 'button';
    $row.className = 'fx-inv-item fx-inv-disabled';
    $row.dataset.name = name;
    $row.title = 'Classifying…';
    $row.textContent = name;
    $invList.appendChild($row);

    const abort = { aborted: false };
    invItems.set(name, { $row, abort });

    // Classify in the background. We don't block the pump on this
    // — the row stays disabled until the lookup + classify
    // resolves, so the UI remains responsive even if some entries
    // hang.
    (async () => {
      try {
        const cap = await E(resolveProfileHost()).lookup(name);
        if (abort.aborted) return;
        const kind = await classifyCapability(cap);
        if (abort.aborted) return;
        if (kind === 'unknown') {
          $row.title = 'Not an endo-fs Filesystem, Layer, or Mount';
          return;
        }
        $row.classList.remove('fx-inv-disabled');
        if (kind === 'mount') {
          $row.title = `Open Mount "${name}"`;
        } else if (kind === 'layer') {
          $row.title = `Open layer "${name}" (composed view + layer actions)`;
        } else {
          $row.title = `Open filesystem "${name}"`;
        }
        $row.addEventListener('click', () => {
          beginBusy();
          openFsCap(name, cap, kind, name)
            .catch(reportError)
            .finally(() => endBusy());
        });
      } catch {
        // Lookup or classify failed — leave the row disabled. The
        // entry may have been removed between the `add` event and
        // our lookup; the `remove` event will clean it up shortly.
        if (!abort.aborted) {
          $row.title = 'Unavailable';
        }
      }
    })();
  };

  /**
   * @param {string} name
   */
  const removeInvItem = name => {
    const item = invItems.get(name);
    if (!item) return;
    item.abort.aborted = true;
    item.$row.remove();
    invItems.delete(name);
  };

  const pumpInventory = async () => {
    try {
      invIter = makeRefIterator(
        E(resolveProfileHost()).followNameChanges(),
      );
      for await (const change of invIter) {
        if (invStopped) break;
        if (change && typeof change === 'object') {
          if ('add' in change && typeof change.add === 'string') {
            addInvItem(change.add);
          } else if ('remove' in change && typeof change.remove === 'string') {
            removeInvItem(change.remove);
          }
        }
      }
    } catch {
      // No followNameChanges (e.g. a powers object that doesn't
      // expose a NameHub) — the sidebar stays empty rather than
      // breaking the explorer.
    }
  };

  pumpInventory();

  // ---- initial render ---------------------------------------------

  renderToolbar();
  renderBrowser();
  renderViewer();
  setStatus('Open a filesystem to begin.', 'info');

  return () => {
    if (liveTimer) clearTimeout(liveTimer);
    clearWatchers();
    invStopped = true;
    for (const { abort } of invItems.values()) abort.aborted = true;
    invItems.clear();
    if (invIter) {
      // Best-effort: tell the remote side to stop iterating; we
      // don't await this on teardown.
      try {
        invIter.return?.(undefined);
      } catch {
        // Ignore — disposal is best-effort.
      }
      invIter = null;
    }
    $parent.innerHTML = '';
  };
};
harden(mountFileExplorer);
