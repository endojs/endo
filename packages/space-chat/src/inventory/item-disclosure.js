// @ts-check

import harden from '@endo/harden';

import { h } from '../setup-preact-container.js';

// The inventory item's disclosure triangle. A single `▶` button; the
// `expanded` class rotates it 90° (CSS), `loading` pulses it, `hidden` hides
// it. Expand/collapse behavior (the async lookup + recursive child mount) is
// the host's; this is just the view. See
// designs/preact-confinement-migration.md.

/**
 * @param {object} props
 * @param {boolean} [props.hidden]
 * @param {boolean} [props.loading]
 * @param {boolean} [props.expanded]
 * @param {() => void} props.onToggle
 */
export const ItemDisclosure = ({ hidden, loading, expanded, onToggle }) =>
  h(
    'button',
    {
      class: [
        'pet-disclosure',
        hidden && 'hidden',
        loading && 'loading',
        expanded && 'expanded',
      ]
        .filter(Boolean)
        .join(' '),
      title: expanded ? 'Collapse' : 'Expand',
      onClick: onToggle,
    },
    '▶',
  );
harden(ItemDisclosure);
