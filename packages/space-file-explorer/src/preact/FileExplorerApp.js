// @ts-check

import { h } from 'preact';

import { useFileExplorer } from './use-file-explorer.js';
import { Toolbar } from './Toolbar.js';
import { Inventory } from './Inventory.js';
import { ColumnsView } from './ColumnsView.js';
import { TreeView } from './TreeView.js';
import { Viewer } from './Viewer.js';
import { StatusBar } from './StatusBar.js';
import { Dialog } from './Dialog.js';

/** @import { InvItem } from './types.js' */

/**
 * The empty-state shown in the browser pane when no source is open. Mirrors
 * `renderBrowser`'s no-source branch (file-explorer.js L2488–2513).
 *
 * @param {object} props
 * @param {() => void} props.onCreateMemory
 * @param {() => void} props.onOpenByPetName
 */
function EmptyState({ onCreateMemory, onOpenByPetName }) {
  return h(
    'div',
    { class: 'fx-emptystate' },
    h('div', { class: 'fx-emptystate-title' }, 'No filesystem open'),
    h(
      'div',
      { class: 'fx-emptystate-text' },
      'Browse an endo-fs Filesystem, a legacy Mount (via from-mount), ' +
        'or a fresh in-memory filesystem.',
    ),
    h(
      'div',
      { class: 'fx-emptystate-actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'fx-btn fx-empty-memory fx-primary',
          onClick: onCreateMemory,
        },
        'Create in-memory filesystem',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'fx-btn fx-empty-open',
          onClick: onOpenByPetName,
        },
        'Open by pet name',
      ),
    ),
  );
}
harden(EmptyState);

/**
 * Root of the confined-Preact file explorer. Owns the store hook and composes
 * the shell: toolbar, the body (inventory sidebar + browser + viewer), the
 * status bar, and the modal dialog overlay. Mirrors the imperative shell
 * scaffold (file-explorer.js L327–341).
 *
 * `powers` is the root powers cap; `profilePath` is walked from it inside the
 * store to reach the active profile host.
 *
 * @param {object} props
 * @param {import('./types.js').Cap} props.powers
 * @param {string[]} [props.profilePath]
 */
export function FileExplorerApp({ powers, profilePath = [] }) {
  const store = useFileExplorer(powers, profilePath);
  const { state, activeSource, actions } = store;

  /** @param {InvItem} item */
  const onOpenInventory = item => {
    // Inventory only fires `onOpen` for `'ready'` items, which always carry a
    // kind; guard anyway so the type narrows for `openFsCap`.
    if (!item.kind) return;
    actions.openFsCap(item.name, item.cap, item.kind, item.name);
  };

  let browser;
  if (!activeSource) {
    browser = h(EmptyState, {
      onCreateMemory: actions.addMemoryFilesystem,
      onOpenByPetName: actions.openByPetName,
    });
  } else if (state.viewMode === 'columns') {
    browser = h(ColumnsView, {
      columns: state.columns,
      activePath: state.activePath,
      selectedFile: state.selectedFile,
      readOnly: activeSource.readOnly,
      actions,
    });
  } else {
    browser = h(TreeView, {
      activeSource,
      expandedDirs: state.expandedDirs,
      treeChildren: state.treeChildren,
      treeLoadingDirs: state.treeLoadingDirs,
      treeCurrentDir: state.treeCurrentDir,
      selectedFile: state.selectedFile,
      actions,
    });
  }

  return h(
    'div',
    { class: 'fx-root' },
    h(Toolbar, { store }),
    h(
      'div',
      { class: 'fx-body' },
      h(Inventory, { items: state.invItems, onOpen: onOpenInventory }),
      h('div', { class: 'fx-browser' }, browser),
      // Viewer renders the `fx-splitter` + `fx-viewer` siblings as a Fragment.
      h(Viewer, { state, activeSource, actions }),
    ),
    h(StatusBar, { status: state.status, busy: state.busy }),
    // Key on the request id so each opened dialog remounts <Dialog>, re-seeding
    // its controlled inputs (an object prop can't drive a confined component's
    // effect deps — the sanitizing renderer gives it fresh identity per render).
    h(Dialog, {
      key: state.dialog ? state.dialog.id : 'none',
      dialog: state.dialog,
      onSubmit: actions.submitDialog,
    }),
  );
}
harden(FileExplorerApp);
