// @ts-check

import harden from '@endo/harden';

import { Fragment, h } from '../setup-preact-container.js';

// Inventory item label: the pet name plus an optional formula-type badge.
// Returns a Fragment so the name and badge render directly as flex children of
// the item row.

/**
 * @param {object} props
 * @param {string} props.name
 * @param {string} [props.title] - Tooltip for the name.
 * @param {boolean} [props.selectable] - Adds the `selectable` class.
 * @param {string | null} [props.type] - Formula type; renders a badge when set.
 * @param {(() => void) | undefined} [props.onClick] - Click handler for the name.
 */
export const ItemLabel = ({ name, title, selectable, type, onClick }) =>
  h(
    Fragment,
    null,
    h(
      'span',
      {
        class: ['pet-name', selectable && 'selectable']
          .filter(Boolean)
          .join(' '),
        title,
        onClick,
      },
      name,
    ),
    type
      ? h(
          'span',
          { class: 'pet-type-badge', title: `Formula type: ${type}` },
          type,
        )
      : null,
  );
harden(ItemLabel);
