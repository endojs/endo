// @ts-check
import { h } from 'preact';
import { useState } from 'preact/hooks';

import { EntryRow } from './EntryRow.js';

/** @import { BrowserColumn, DirEntry, SelectedFile, FileExplorerActions } from './types.js' */
/** @import { SafeDataTransfer } from '@endo/preact-container/renderer' */

// Path equality key (mirrors file-explorer.js `pathKey`); a pure presentational
// helper, no authority.
const KEY_SEP = '\u0000';
/** @param {string[]} path */
const pathKey = path => path.join(KEY_SEP);

/**
 * One Miller column rendered through {@link EntryRow}, with its own
 * column-level drop target. Mirrors the per-column body of `bindBrowserEvents`
 * (file-explorer.js L2445–2482).
 *
 * @param {object} props
 * @param {BrowserColumn} props.column
 * @param {number} props.columnIndex
 * @param {string | null} props.drillName Entry drilled into from this column.
 * @param {string | null} props.fileName Selected file living in this column.
 * @param {boolean} props.readOnly
 * @param {FileExplorerActions} props.actions
 */
function Column({
  column,
  columnIndex,
  drillName,
  fileName,
  readOnly,
  actions,
}) {
  const [dropTarget, setDropTarget] = useState(false);

  let body;
  if (column.loading) {
    body = h(
      'div',
      { class: 'fx-loading-row' },
      h('span', { class: 'fx-spinner' }),
      'Loading…',
    );
  } else if (column.error) {
    body = h('div', { class: 'fx-empty-col fx-col-error' }, column.error);
  } else if (column.entries.length === 0) {
    body = h('div', { class: 'fx-empty-col' }, 'empty');
  } else {
    body = column.entries.map(entry =>
      h(EntryRow, {
        key: `${entry.type}:${entry.name}`,
        entry,
        parentPath: column.path,
        selected: entry.name === drillName || entry.name === fileName,
        readOnly,
        onOpen: /** @param {DirEntry} e */ e => {
          if (e.type === 'git') {
            actions.openGitEntryInColumn(columnIndex, e.name);
          } else if (e.type === 'directory') {
            actions.openDirInColumn(columnIndex, e.name);
          } else {
            actions.openFile(column.path, e.name);
          }
        },
        onRename: /** @param {DirEntry} e */ e =>
          actions.renameEntryAction(
            column.path,
            e.name,
            e.type === 'directory' ? 'directory' : 'file',
          ),
        onDelete: /** @param {DirEntry} e */ e =>
          actions.deleteEntryAction(
            column.path,
            e.name,
            e.type === 'directory' ? 'directory' : 'file',
          ),
        onMove: (fromParent, name, toParent, type) =>
          actions.moveEntry(fromParent, name, toParent, type),
      }),
    );
  }

  // Column-level drop: dropping anywhere on the column (empty area, file row, or
  // header) moves the dragged entry into the directory the column represents.
  // Directory-entry rows stopPropagation, so this only fires on the "miss".
  // Only writable sources participate.
  const acceptsDrop = !readOnly;

  /** @param {{ preventDefault: () => void, dataTransfer?: SafeDataTransfer }} event */
  const onDragOver = event => {
    if (!acceptsDrop) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    setDropTarget(true);
  };

  const onDragLeave = () => {
    if (!acceptsDrop) return;
    setDropTarget(false);
  };

  /** @param {{ preventDefault: () => void, dataTransfer?: SafeDataTransfer }} event */
  const onDrop = event => {
    if (!acceptsDrop) return;
    event.preventDefault();
    setDropTarget(false);
    const transfer = event.dataTransfer;
    if (!transfer) return;
    let payload;
    try {
      payload = JSON.parse(transfer.getData('application/json'));
    } catch {
      return;
    }
    actions.moveEntry(
      payload.parentPath,
      payload.name,
      column.path,
      payload.type,
    );
  };

  return h(
    'div',
    {
      class: `fx-column${dropTarget ? ' fx-drop-target' : ''}`,
      'data-column': columnIndex,
      'data-path': JSON.stringify(column.path),
      onDragOver: acceptsDrop ? onDragOver : undefined,
      onDragLeave: acceptsDrop ? onDragLeave : undefined,
      onDrop: acceptsDrop ? onDrop : undefined,
    },
    h(
      'div',
      { class: 'fx-column-head' },
      column.path.length ? column.path[column.path.length - 1] : '/',
    ),
    h('div', { class: 'fx-column-list' }, body),
  );
}

/**
 * The Miller-columns browser. Source: `renderColumns` (file-explorer.js
 * L2205–2251).
 *
 * @param {object} props
 * @param {BrowserColumn[]} props.columns
 * @param {string[]} props.activePath Drill-down path; entry at index N is the
 *   drilled child of column N.
 * @param {SelectedFile | null} props.selectedFile
 * @param {boolean} props.readOnly
 * @param {FileExplorerActions} props.actions
 */
export function ColumnsView({
  columns,
  activePath,
  selectedFile,
  readOnly,
  actions,
}) {
  return h(
    'div',
    { class: 'fx-columns' },
    columns.map((column, columnIndex) => {
      const drillName =
        columnIndex < activePath.length ? activePath[columnIndex] : null;
      const fileName =
        selectedFile &&
        pathKey(selectedFile.parentPath) === pathKey(column.path)
          ? selectedFile.name
          : null;
      return h(Column, {
        key: pathKey(column.path),
        column,
        columnIndex,
        drillName,
        fileName,
        readOnly,
        actions,
      });
    }),
  );
}
harden(ColumnsView);
