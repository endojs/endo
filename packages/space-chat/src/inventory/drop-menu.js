// @ts-check

import harden from '@endo/harden';

import { h } from '../setup-preact-container.js';

// The inventory link/move context menu: a Preact `h()` component (no JSX)
// rendered in-tree by the inventory (inventory.js) at a drop location.

/**
 * The link/move context menu shown at a drop location. The host owns the
 * mount lifecycle (positioning host, dismiss-on-click, teardown); this is the
 * pure view. `onLink`/`onMove` receive no event — the renderer hands confined
 * handlers a `SafeEvent`, and these actions do not need it.
 *
 * @param {object} props
 * @param {number} props.x - Viewport x (px) for the fixed-position menu.
 * @param {number} props.y - Viewport y (px).
 * @param {() => void} props.onLink - Chosen "Link here".
 * @param {() => void} props.onMove - Chosen "Move here".
 */
export const DropMenu = ({ x, y, onLink, onMove }) =>
  h(
    'div',
    {
      class: 'inventory-drop-menu',
      style: `position: fixed; left: ${x}px; top: ${y}px`,
    },
    h(
      'button',
      { class: 'inventory-drop-menu-item', onClick: onLink },
      'Link here',
    ),
    h(
      'button',
      { class: 'inventory-drop-menu-item', onClick: onMove },
      'Move here',
    ),
  );
harden(DropMenu);
