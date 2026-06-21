// @ts-check
import { h } from 'preact';
import { useState } from 'preact/hooks';

/** @import { DirEntry } from './types.js' */
/** @import { SafeDataTransfer } from '@endo/preact-container/renderer' */

/**
 * One browser row: a file / directory / git-workspace / unknown-cap entry,
 * shared by both the columns and tree views. Purely presentational: it holds no
 * actions or powers and raises semantic callbacks that the parent maps onto
 * `actions.*`. Mirrors `entryRowHtml` (file-explorer.js L2155–2204) plus its
 * `bindBrowserEvents` row handlers (L2328–2435): same DOM nesting, same `fx-*`
 * classes, same drag/drop payload.
 *
 * `entry.type` of `'git'` / `'unknown'` are cap entries (not plain fs nodes):
 * no rename/delete/drag affordances, even though git ones are clickable.
 *
 * @param {object} props
 * @param {DirEntry} props.entry
 * @param {string[]} props.parentPath Directory the entry lives in.
 * @param {boolean} [props.selected] Highlight the row.
 * @param {boolean} [props.readOnly] Suppress mutation affordances.
 * @param {number} [props.depth] Tree depth (drives indent + twisty); omit in columns.
 * @param {boolean} [props.expanded] Tree: directory is open (twisty glyph).
 * @param {(entry: DirEntry) => void} props.onOpen Primary activation.
 * @param {(entry: DirEntry) => void} [props.onRename]
 * @param {(entry: DirEntry) => void} [props.onDelete]
 * @param {(fromParent: string[], name: string, toParent: string[], type: 'directory' | 'file') => void} [props.onMove]
 */
export function EntryRow({
  entry,
  parentPath,
  selected = false,
  readOnly = false,
  depth,
  expanded,
  onOpen,
  onRename,
  onDelete,
  onMove,
}) {
  const [dropTarget, setDropTarget] = useState(false);

  const unsupported = entry.type === 'unknown';
  const isGit = entry.type === 'git';
  // Cap entries (git workspaces, unsupported caps) aren't plain fs nodes: no
  // rename/delete/drag, even though git ones are clickable.
  const capEntry = unsupported || isGit;
  const isDirectory = entry.type === 'directory';

  let icon;
  if (isGit) icon = '\u{1F33F}';
  else if (unsupported) icon = '\u{2754}';
  else if (isDirectory) icon = '\u{1F4C1}';
  else icon = '\u{1F4C4}';

  // Tree rows carry an explicit depth (and therefore a twisty). Columns rows
  // pass `depth === undefined` → no indent, no twisty.
  const inTree = depth !== undefined;
  const style = inTree
    ? { paddingLeft: `${8 + (depth || 0) * 16}px` }
    : undefined;

  let twisty;
  if (inTree) {
    if (isDirectory) twisty = expanded ? '▾' : '▸';
    else twisty = ' ';
  }

  let title;
  if (unsupported) {
    title = 'Not an endo-fs Filesystem, Layer, or Mount';
  } else if (isGit) {
    title = 'Git repository — click to open its worktree';
  }

  const draggable = !readOnly && !capEntry && entry.name !== '';
  const showActions = !readOnly && !capEntry;

  const onClick = () => {
    // Unsupported (non-fs) entries are display-only.
    if (unsupported) return;
    onOpen(entry);
  };

  /** @param {{ stopPropagation: () => void }} event */
  const onRenameClick = event => {
    event.stopPropagation();
    onRename && onRename(entry);
  };

  /** @param {{ stopPropagation: () => void }} event */
  const onDeleteClick = event => {
    event.stopPropagation();
    onDelete && onDelete(entry);
  };

  /** @param {{ dataTransfer?: SafeDataTransfer }} event */
  const onDragStart = event => {
    if (!draggable) return;
    const transfer = event.dataTransfer;
    if (transfer) {
      transfer.effectAllowed = 'move';
      // Carry the entry type alongside the source coordinates so `moveEntry`
      // can decide whether descendants need path rewrites (only directories do).
      transfer.setData(
        'application/json',
        JSON.stringify({ parentPath, name: entry.name, type: entry.type }),
      );
    }
  };

  // A directory row is a drop target (writable sources only): dropping moves the
  // dragged entry into this directory.
  const acceptsDrop = !readOnly && isDirectory;

  /** @param {{ preventDefault: () => void, stopPropagation: () => void, dataTransfer?: SafeDataTransfer }} event */
  const onDragOver = event => {
    if (!acceptsDrop) return;
    event.preventDefault();
    // Don't let the column-level drop handler also claim this drop — that would
    // move into the column's own path instead of the (deeper) target directory.
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    setDropTarget(true);
  };

  const onDragLeave = () => {
    if (!acceptsDrop) return;
    setDropTarget(false);
  };

  /** @param {{ preventDefault: () => void, stopPropagation: () => void, dataTransfer?: SafeDataTransfer }} event */
  const onDrop = event => {
    if (!acceptsDrop) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(false);
    const transfer = event.dataTransfer;
    if (!transfer) return;
    let payload;
    try {
      payload = JSON.parse(transfer.getData('application/json'));
    } catch {
      return;
    }
    const destPath = entry.name === '' ? [] : [...parentPath, entry.name];
    onMove && onMove(payload.parentPath, payload.name, destPath, payload.type);
  };

  const className = `fx-entry ${entry.type}${selected ? ' fx-selected' : ''}${
    dropTarget ? ' fx-drop-target' : ''
  }`;

  return h(
    'div',
    {
      class: className,
      style,
      title,
      draggable,
      'data-name': entry.name,
      'data-type': entry.type,
      'data-parent': JSON.stringify(parentPath),
      onClick,
      onDragStart: draggable ? onDragStart : undefined,
      onDragOver: acceptsDrop ? onDragOver : undefined,
      onDragLeave: acceptsDrop ? onDragLeave : undefined,
      onDrop: acceptsDrop ? onDrop : undefined,
    },
    twisty !== undefined ? h('span', { class: 'fx-twisty' }, twisty) : null,
    h('span', { class: 'fx-entry-icon' }, icon),
    h('span', { class: 'fx-entry-name' }, entry.name),
    showActions
      ? h(
          'span',
          { class: 'fx-entry-actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'fx-mini fx-entry-rename',
              title: 'Rename',
              draggable: false,
              onClick: onRenameClick,
            },
            '✎',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'fx-mini fx-entry-delete',
              title: 'Delete',
              draggable: false,
              onClick: onDeleteClick,
            },
            '✕',
          ),
        )
      : null,
  );
}
harden(EntryRow);
