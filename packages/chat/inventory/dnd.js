// @ts-check

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import harden from '@endo/harden';
import { E } from '@endo/far';

import { DropMenu } from './drop-menu.js';
import { h, renderConfined, unmount } from '../setup-preact-container.js';

// Framework-agnostic drag-and-drop behavior for the inventory tree's
// link/move system. Phase 1 of the Preact migration (see
// designs/preact-confinement-migration.md): `makeItemDragDrop` attaches DOM
// listeners imperatively and is callable from today's imperative
// `inventoryComponent`. During convert-in-place each attach* helper is
// invoked from `useEffect(() => makeItemDragDrop(...).attachX(...).dispose,
// deps)`; the reusable core is this agnostic factory, not a hook.

// MIME used to carry the dragged item's absolute pet-name path (JSON).
const ENDO_PETNAME_MIME = 'application/x-endo-petname';

/**
 * Compute the absolute destination path for a drop, or undefined when the
 * drop is a no-op or would move an item into itself or its own descendant.
 *
 * @param {string[]} sourceAbsPath - Absolute path of the dragged item.
 * @param {string[]} targetDirAbs - Absolute path of the destination directory.
 * @returns {string[] | undefined}
 */
const dropTargetPath = (sourceAbsPath, targetDirAbs) => {
  // Reject dropping an item into itself or any of its own descendants:
  // that is the case where the source path is a prefix of the target dir.
  const intoSelf =
    sourceAbsPath.length <= targetDirAbs.length &&
    sourceAbsPath.every((seg, i) => seg === targetDirAbs[i]);
  if (intoSelf) return undefined;
  const sourceLeaf = sourceAbsPath[sourceAbsPath.length - 1];
  const targetAbsPath = [...targetDirAbs, sourceLeaf];
  // No-op when the item already lives at exactly this location.
  if (
    targetAbsPath.length === sourceAbsPath.length &&
    targetAbsPath.every((seg, i) => seg === sourceAbsPath[i])
  ) {
    return undefined;
  }
  return targetAbsPath;
};
harden(dropTargetPath);

/**
 * Clear any lingering drop-zone highlight from every row and list under the
 * inventory. Browsers fire `dragleave` on the most-specific element only;
 * when a drag crosses INTO a hub row that is nested inside a list-level
 * drop zone (or inside an outer hub row that is itself a drop target), the
 * outer element keeps its highlight because its `dragleave` listener sees
 * the move as a descendant transition, not a leave. The inner element's
 * `drop` handler clears only its own class. Without a sweep here, the
 * outer highlight survives the drop-menu interaction and never retracts.
 * Called when the drop menu opens and when the source's `dragend` fires.
 */
const clearAllDropTargets = () => {
  for (const $el of document.querySelectorAll('.drop-target')) {
    $el.classList.remove('drop-target');
  }
  for (const $el of document.querySelectorAll('.drop-target-list')) {
    $el.classList.remove('drop-target-list');
  }
};
harden(clearAllDropTargets);

/**
 * @typedef {{ dispose: () => void }} DragDropBinding
 */

/**
 * Create the inventory item-move drag-and-drop behavior bound to a tree
 * root's powers. Returns imperative `attach*` helpers; each wires listeners
 * on the given element and returns a `dispose()` that removes them again.
 *
 * @param {object} opts
 * @param {ERef<EndoHost>} opts.rootPowers - Powers for the whole tree, against
 *   which link/move operate in absolute coordinates.
 */
export const makeItemDragDrop = ({ rootPowers }) => {
  /**
   * Show a small context menu at the cursor to choose whether a drop should
   * link (alias the capability under a new name) or move (relink, then unbind
   * the source). Both operate in absolute coordinates against `rootPowers`.
   *
   * @param {number} x
   * @param {number} y
   * @param {string[]} sourceAbsPath
   * @param {string[]} targetAbsPath
   */
  const showDropMenu = (x, y, sourceAbsPath, targetAbsPath) => {
    // Sweep any ancestor drop-zone highlight that the browser's per-element
    // dragleave model left behind when the cursor descended into this drop
    // target without first leaving the outer one. See clearAllDropTargets.
    clearAllDropTargets();

    // Tear down any menu already open, then mount a fresh one into a host
    // element. The DropMenu view renders the fixed-position `.inventory-drop-menu`
    // inside the host, so the host itself needs no styling.
    const $existingHost = document.querySelector('.inventory-drop-menu-host');
    if ($existingHost) {
      unmount($existingHost);
      $existingHost.remove();
    }
    const host = document.createElement('div');
    host.className = 'inventory-drop-menu-host';
    document.body.appendChild(host);

    const from = /** @type {[string, ...string[]]} */ (sourceAbsPath);
    const to = /** @type {[string, ...string[]]} */ (targetAbsPath);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      unmount(host);
      host.remove();
      document.removeEventListener('click', close);
    };

    renderConfined(
      h(DropMenu, {
        x,
        y,
        onLink: () => {
          close();
          E(rootPowers)
            .copy(from, to)
            .catch(err => console.error('[inventory] Link failed:', err));
        },
        onMove: () => {
          close();
          E(rootPowers)
            .move(from, to)
            .catch(err => console.error('[inventory] Move failed:', err));
        },
      }),
      host,
    );

    // Defer the dismiss-on-click listener past the current event so the
    // interaction that opened the menu does not immediately close it.
    requestAnimationFrame(() => {
      document.addEventListener('click', close);
    });
  };

  /**
   * Make a row a drag source carrying its absolute pet-name path so it can be
   * dropped at any level (up or down the tree), not just within its own.
   *
   * @param {HTMLElement} row
   * @param {string[]} absPath
   * @returns {DragDropBinding}
   */
  const attachDragSource = (row, absPath) => {
    row.draggable = true;
    /** @param {DragEvent} e */
    const onDragStart = e => {
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', absPath.join('/'));
        e.dataTransfer.setData(ENDO_PETNAME_MIME, JSON.stringify(absPath));
        e.dataTransfer.effectAllowed = 'copyMove';
      }
      row.classList.add('dragging');
    };
    const onDragEnd = () => {
      row.classList.remove('dragging');
      // Sweep any drop-zone highlight left behind by the per-element
      // dragleave model (the inner drop handler clears only its own class).
      // Also handles drag-cancel cases where no drop fires.
      clearAllDropTargets();
    };
    row.addEventListener('dragstart', onDragStart);
    row.addEventListener('dragend', onDragEnd);
    return harden({
      dispose: () => {
        row.removeEventListener('dragstart', onDragStart);
        row.removeEventListener('dragend', onDragEnd);
      },
    });
  };

  /**
   * Make a hub row a drop target offering to link or move the dragged item
   * into that hub. Non-hub (leaf) rows pass `acceptsDrop` returning false, so
   * the event bubbles to the containing directory's list-level drop zone.
   * `acceptsDrop` is read at event time because a row's hub status is probed
   * asynchronously after the row is created.
   *
   * @param {HTMLElement} row
   * @param {object} opts
   * @param {string[]} opts.absPath
   * @param {() => boolean} opts.acceptsDrop
   * @returns {DragDropBinding}
   */
  const attachRowDropTarget = (row, { absPath, acceptsDrop }) => {
    /** @param {DragEvent} e */
    const onDragOver = e => {
      if (!acceptsDrop()) return;
      if (!e.dataTransfer) return;
      if (!e.dataTransfer.types.includes(ENDO_PETNAME_MIME)) return;
      e.preventDefault();
      // Don't also light up the enclosing list-level drop zone.
      e.stopPropagation();
      // The link-vs-move choice is made from the drop menu, so advertise copy.
      e.dataTransfer.dropEffect = 'copy';
      row.classList.add('drop-target');
    };
    const onDragLeave = () => {
      row.classList.remove('drop-target');
    };
    /** @param {DragEvent} e */
    const onDrop = e => {
      if (!acceptsDrop()) return;
      row.classList.remove('drop-target');
      if (!e.dataTransfer) return;
      const raw = e.dataTransfer.getData(ENDO_PETNAME_MIME);
      if (!raw) return;
      e.preventDefault();
      // Handle here so the enclosing list-level drop zone does not also fire.
      e.stopPropagation();
      // Narrow the try to JSON.parse alone; a broad try would mask errors
      // from dropTargetPath, showDropMenu, or any future addition.
      let sourceAbsPath;
      try {
        sourceAbsPath = JSON.parse(raw);
      } catch (err) {
        console.error(
          `[inventory] Cannot parse drag payload from ${ENDO_PETNAME_MIME} onto row ${absPath.join('/')}: ${
            /** @type {Error} */ (err).message
          }`,
        );
        return;
      }
      const targetAbsPath = dropTargetPath(sourceAbsPath, absPath);
      if (!targetAbsPath) return;
      showDropMenu(e.clientX, e.clientY, sourceAbsPath, targetAbsPath);
    };
    row.addEventListener('dragover', onDragOver);
    row.addEventListener('dragleave', onDragLeave);
    row.addEventListener('drop', onDrop);
    return harden({
      dispose: () => {
        row.removeEventListener('dragover', onDragOver);
        row.removeEventListener('dragleave', onDragLeave);
        row.removeEventListener('drop', onDrop);
      },
    });
  };

  /**
   * Make a directory's list background a drop zone: dropping onto it links or
   * moves the dragged item into that directory (`rootPrefix`). At the
   * outermost level `rootPrefix` is empty, so this is how an item is moved
   * *up* to the root.
   *
   * @param {HTMLElement} list
   * @param {string[]} rootPrefix
   * @returns {DragDropBinding}
   */
  const attachListDropZone = (list, rootPrefix) => {
    /** @param {DragEvent} e */
    const onDragOver = e => {
      if (!e.dataTransfer) return;
      if (!e.dataTransfer.types.includes(ENDO_PETNAME_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      list.classList.add('drop-target-list');
    };
    /** @param {DragEvent} e */
    const onDragLeave = e => {
      // Ignore dragleave bubbling up from descendant rows.
      if (e.target !== list) return;
      list.classList.remove('drop-target-list');
    };
    /** @param {DragEvent} e */
    const onDrop = e => {
      list.classList.remove('drop-target-list');
      if (!e.dataTransfer) return;
      const raw = e.dataTransfer.getData(ENDO_PETNAME_MIME);
      if (!raw) return;
      e.preventDefault();
      // A row handler already ran if the drop landed on an item.
      e.stopPropagation();
      // Narrow the try to JSON.parse alone; a broad try would mask errors
      // from dropTargetPath, showDropMenu, or any future addition.
      let sourceAbsPath;
      try {
        sourceAbsPath = JSON.parse(raw);
      } catch (err) {
        const at = rootPrefix.length === 0 ? '<root>' : rootPrefix.join('/');
        console.error(
          `[inventory] Cannot parse drag payload from ${ENDO_PETNAME_MIME} onto list at ${at}: ${
            /** @type {Error} */ (err).message
          }`,
        );
        return;
      }
      const targetAbsPath = dropTargetPath(sourceAbsPath, rootPrefix);
      if (!targetAbsPath) return;
      showDropMenu(e.clientX, e.clientY, sourceAbsPath, targetAbsPath);
    };
    list.addEventListener('dragover', onDragOver);
    list.addEventListener('dragleave', onDragLeave);
    list.addEventListener('drop', onDrop);
    return harden({
      dispose: () => {
        list.removeEventListener('dragover', onDragOver);
        list.removeEventListener('dragleave', onDragLeave);
        list.removeEventListener('drop', onDrop);
      },
    });
  };

  return harden({ attachDragSource, attachRowDropTarget, attachListDropZone });
};
harden(makeItemDragDrop);

/**
 * Create the channel-list reordering behavior. Channel mode lets the user
 * drag channel rows to reorder them; this owns the shared drag state
 * (the dragged wrapper and the drop-position indicator) that the per-row
 * drag source and the list-level reorder zone both touch.
 *
 * Returns imperative `attach*` helpers; each wires listeners on the given
 * element and returns a `dispose()` that removes them again.
 */
export const makeChannelReorder = () => {
  /** @type {HTMLElement | null} */
  let draggedWrapper = null;
  /** @type {HTMLElement | null} */
  let dropIndicator = null;

  const clearIndicator = () => {
    if (dropIndicator) {
      dropIndicator.remove();
      dropIndicator = null;
    }
  };

  /**
   * Make a channel row a reorder drag source. The wrapper (not the row) is
   * what moves in the list, so it is carried separately.
   *
   * @param {HTMLElement} row
   * @param {HTMLElement} wrapper
   * @param {string} name
   * @returns {DragDropBinding}
   */
  const attachDragSource = (row, wrapper, name) => {
    row.draggable = true;
    /** @param {DragEvent} e */
    const onDragStart = e => {
      if (!e.dataTransfer) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', name);
      draggedWrapper = wrapper;
      wrapper.classList.add('channel-dragging');
    };
    const onDragEnd = () => {
      wrapper.classList.remove('channel-dragging');
      draggedWrapper = null;
      clearIndicator();
    };
    row.addEventListener('dragstart', onDragStart);
    row.addEventListener('dragend', onDragEnd);
    return harden({
      dispose: () => {
        row.removeEventListener('dragstart', onDragStart);
        row.removeEventListener('dragend', onDragEnd);
      },
    });
  };

  /**
   * Make the channel list a reorder drop zone: shows a position indicator
   * while dragging, moves the dragged wrapper on drop, and reports the new
   * order via `onReorder`.
   *
   * @param {HTMLElement} list
   * @param {object} opts
   * @param {(order: string[]) => void} [opts.onReorder]
   * @returns {DragDropBinding}
   */
  const attachReorderZone = (list, { onReorder }) => {
    list.style.position = 'relative';

    /** @param {DragEvent} e */
    const onDragOver = e => {
      if (!draggedWrapper || !e.dataTransfer) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const items = [
        .../** @type {NodeListOf<HTMLElement>} */ (
          list.querySelectorAll('.channel-item:not(.channel-dragging)')
        ),
      ];
      const mouseY = e.clientY;
      let bestY = 0;
      let bestDist = Infinity;

      // Gap before first item
      if (items.length > 0) {
        const rect = items[0].getBoundingClientRect();
        const dist = Math.abs(mouseY - rect.top);
        if (dist < bestDist) {
          bestDist = dist;
          bestY = rect.top;
        }
      }
      // Gap after each item
      for (const item of items) {
        const rect = item.getBoundingClientRect();
        const dist = Math.abs(mouseY - rect.bottom);
        if (dist < bestDist) {
          bestDist = dist;
          bestY = rect.bottom;
        }
      }

      if (!dropIndicator) {
        dropIndicator = document.createElement('div');
        dropIndicator.className = 'channel-drop-indicator';
        list.appendChild(dropIndicator);
      }
      const listRect = list.getBoundingClientRect();
      dropIndicator.style.top = `${bestY - listRect.top}px`;
    };

    /** @param {DragEvent} e */
    const onDragLeave = e => {
      if (!list.contains(/** @type {Node | null} */ (e.relatedTarget))) {
        clearIndicator();
      }
    };

    /** @param {DragEvent} e */
    const onDrop = e => {
      e.preventDefault();
      if (!draggedWrapper) return;

      const items = [
        .../** @type {NodeListOf<HTMLElement>} */ (
          list.querySelectorAll('.channel-item:not(.channel-dragging)')
        ),
      ];
      const mouseY = e.clientY;
      /** @type {Element | null} */
      let insertBefore = null;

      for (const item of items) {
        const rect = item.getBoundingClientRect();
        const midY = (rect.top + rect.bottom) / 2;
        if (Number(mouseY) < Number(midY)) {
          insertBefore = item;
          break;
        }
      }

      if (insertBefore) {
        list.insertBefore(draggedWrapper, insertBefore);
      } else {
        list.appendChild(draggedWrapper);
      }

      draggedWrapper.classList.remove('channel-dragging');
      draggedWrapper = null;
      clearIndicator();

      // Persist the new channel order
      if (onReorder) {
        const orderedNames = [
          .../** @type {NodeListOf<HTMLElement>} */ (
            list.querySelectorAll('.channel-item')
          ),
        ]
          .map(el => el.dataset.name)
          .filter(
            /**
             * @param n
             * @returns {n is string}
             */ n => typeof n === 'string',
          );
        onReorder(orderedNames);
      }
    };

    list.addEventListener('dragover', onDragOver);
    list.addEventListener('dragleave', onDragLeave);
    list.addEventListener('drop', onDrop);
    return harden({
      dispose: () => {
        list.removeEventListener('dragover', onDragOver);
        list.removeEventListener('dragleave', onDragLeave);
        list.removeEventListener('drop', onDrop);
      },
    });
  };

  return harden({ attachDragSource, attachReorderZone });
};
harden(makeChannelReorder);
