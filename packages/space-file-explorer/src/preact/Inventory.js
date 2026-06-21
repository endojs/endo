// @ts-check
import { h } from 'preact';

/** @import { InvItem } from './types.js' */

/**
 * The left inventory sidebar: one pet-name row per entry at the active profile
 * host. A faithful Preact reimplementation of the imperative inventory render
 * (`../file-explorer.js` L2714+); reuses the same `fx-*` classes and DOM
 * nesting verbatim.
 *
 * Each row is a `<button class="fx-inv-item">` carrying `data-name` and a
 * tooltip `title`. Rows start greyed (`fx-inv-disabled`) while classifying and
 * become clickable once `status === 'ready'`; clicking a ready row invokes
 * `onOpen(item)` (the parent maps that to
 * `openFsCap(item.name, item.cap, item.kind, item.name)`). Non-ready rows are
 * inert.
 *
 * @param {object} props
 * @param {Map<string, InvItem>} props.items
 * @param {(item: InvItem) => void} props.onOpen
 * @returns {import('preact').VNode}
 */
export function Inventory({ items, onOpen }) {
  const rows = [];
  for (const item of items.values()) {
    const ready = item.status === 'ready';
    rows.push(
      h(
        'button',
        {
          type: 'button',
          class: `fx-inv-item ${ready ? '' : 'fx-inv-disabled'}`.trim(),
          'data-name': item.name,
          title: item.title,
          disabled: !ready,
          onClick: ready
            ? () => {
                onOpen(item);
              }
            : undefined,
        },
        item.name,
      ),
    );
  }

  return h(
    'div',
    { class: 'fx-inventory' },
    h('div', { class: 'fx-inv-header' }, 'Inventory'),
    h('div', { class: 'fx-inv-list' }, ...rows),
  );
}
harden(Inventory);
