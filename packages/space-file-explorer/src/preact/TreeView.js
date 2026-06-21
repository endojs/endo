// @ts-check
import { h } from 'preact';

import { EntryRow } from './EntryRow.js';

/** @import { Source, DirEntry, SelectedFile, FileExplorerActions } from './types.js' */

// Path equality key (mirrors file-explorer.js `pathKey`); a pure presentational
// helper, no authority.
const KEY_SEP = '\u0000';
/** @param {string[]} path */
const pathKey = path => path.join(KEY_SEP);

/**
 * The tree browser. Source: `renderTree` + `renderTreeNode` (file-explorer.js
 * L2260–2322). Recurses through {@link EntryRow}, passing `depth`/`expanded` so
 * each row draws its twisty + indent. The synthetic root row is rendered
 * directly (it carries the source label and a distinct icon, unlike a plain
 * directory entry).
 *
 * @param {object} props
 * @param {Source | null} props.activeSource
 * @param {Set<string>} props.expandedDirs pathKeys of open directories.
 * @param {Map<string, DirEntry[]>} props.treeChildren pathKey → cached listing.
 * @param {Set<string>} props.treeLoadingDirs pathKeys currently fetching.
 * @param {string[]} props.treeCurrentDir Selected directory.
 * @param {SelectedFile | null} props.selectedFile
 * @param {FileExplorerActions} props.actions
 */
export function TreeView({
  activeSource,
  expandedDirs,
  treeChildren,
  treeLoadingDirs,
  treeCurrentDir,
  selectedFile,
  actions,
}) {
  const readOnly = !!activeSource && activeSource.readOnly;
  const currentKey = pathKey(treeCurrentDir);

  /**
   * Render a child node and (when it's an open directory) its descendants.
   *
   * @param {string[]} path Parent directory path.
   * @param {DirEntry} entry
   * @param {number} depth
   * @returns {import('preact').ComponentChildren}
   */
  const renderNode = (path, entry, depth) => {
    const selfPath = [...path, entry.name];

    /** @param {DirEntry} e */
    const onOpen = e => {
      if (e.type === 'git') {
        actions.openGitEntry(path, e.name);
      } else if (e.type === 'directory') {
        actions.toggleTreeDir(selfPath);
      } else {
        actions.openFile(path, e.name);
      }
    };

    /** @param {DirEntry} e */
    const onRename = e =>
      actions.renameEntryAction(
        path,
        e.name,
        e.type === 'directory' ? 'directory' : 'file',
      );
    /** @param {DirEntry} e */
    const onDelete = e =>
      actions.deleteEntryAction(
        path,
        e.name,
        e.type === 'directory' ? 'directory' : 'file',
      );
    /**
     * @param {string[]} fromParent
     * @param {string} name
     * @param {string[]} toParent
     * @param {'directory' | 'file'} type
     */
    const onMove = (fromParent, name, toParent, type) =>
      actions.moveEntry(fromParent, name, toParent, type);

    if (entry.type !== 'directory') {
      const selected =
        !!selectedFile &&
        pathKey(selectedFile.parentPath) === pathKey(path) &&
        selectedFile.name === entry.name;
      return h(EntryRow, {
        key: `${entry.type}:${entry.name}`,
        entry,
        parentPath: path,
        selected,
        readOnly,
        depth,
        onOpen,
        onRename,
        onDelete,
        onMove,
      });
    }

    const key = pathKey(selfPath);
    const isOpen = expandedDirs.has(key);
    const selected = currentKey === key;
    /** @type {import('preact').ComponentChildren[]} */
    const rows = [
      h(EntryRow, {
        key: `dir:${entry.name}`,
        entry,
        parentPath: path,
        selected,
        readOnly,
        depth,
        expanded: isOpen,
        onOpen,
        onRename,
        onDelete,
        onMove,
      }),
    ];
    if (isOpen) {
      if (treeLoadingDirs.has(key)) {
        rows.push(
          h(
            'div',
            {
              key: `loading:${key}`,
              class: 'fx-loading-row',
              style: { paddingLeft: `${8 + (depth + 1) * 16}px` },
            },
            h('span', { class: 'fx-spinner' }),
            'Loading…',
          ),
        );
      }
      const children = treeChildren.get(key);
      if (children) {
        for (const child of children) {
          rows.push(renderNode(selfPath, child, depth + 1));
        }
      }
    }
    return rows;
  };

  const rootKey = pathKey([]);
  const rootOpen = expandedDirs.has(rootKey);
  const rootSelected = currentKey === rootKey;

  /** @type {import('preact').ComponentChildren[]} */
  const children = [
    h(
      'div',
      {
        key: 'root',
        class: `fx-entry directory${rootSelected ? ' fx-selected' : ''}`,
        'data-name': '',
        'data-type': 'directory',
        'data-parent': '[]',
        draggable: false,
        onClick: () => actions.toggleTreeDir([]),
      },
      h('span', { class: 'fx-twisty' }, rootOpen ? '▾' : '▸'),
      h('span', { class: 'fx-entry-icon' }, '\u{1F5C2}'),
      h(
        'span',
        { class: 'fx-entry-name' },
        activeSource ? activeSource.label : '/',
      ),
    ),
  ];

  if (rootOpen) {
    if (treeLoadingDirs.has(rootKey)) {
      children.push(
        h(
          'div',
          {
            key: 'root-loading',
            class: 'fx-loading-row',
            style: { paddingLeft: '24px' },
          },
          h('span', { class: 'fx-spinner' }),
          'Loading…',
        ),
      );
    }
    for (const child of treeChildren.get(rootKey) || []) {
      children.push(renderNode([], child, 1));
    }
  }

  return h('div', { class: 'fx-tree' }, children);
}
harden(TreeView);
