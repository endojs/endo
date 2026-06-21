// @ts-check

import harden from '@endo/harden';

import {
  Fragment,
  h,
  useEffect,
  useRef,
  useState,
} from '../setup-preact-container.js';

// Inventory item action buttons (info / cancel / remove), converted in place
// to a Preact `h()` component (no JSX). Returns a Fragment of the three
// buttons so it mounts directly into the host's `.pet-buttons` span — the DOM
// is identical to the original imperative markup. See
// designs/preact-confinement-migration.md.

/**
 * @typedef {'idle' | 'confirming' | 'cancelling' | 'cancelled'} CancelPhase
 */

const CANCEL_TITLES = harden(
  /** @type {Record<CancelPhase, string>} */ ({
    idle: 'Cancel incarnation',
    confirming: 'Click again to cancel',
    cancelling: 'Cancelling...',
    cancelled: 'Cancelled',
  }),
);

/**
 * @param {object} props
 * @param {boolean} props.cancelDisabled - True for special (system) names.
 * @param {boolean} props.removeDisabled - True for special or immutable items.
 * @param {string} props.removeTitle
 * @param {() => void} props.onInspect
 * @param {() => Promise<unknown>} props.onCancel - Cancels the incarnation.
 * @param {() => void} props.onRemove
 */
export const ItemActions = ({
  cancelDisabled,
  removeDisabled,
  removeTitle,
  onInspect,
  onCancel,
  onRemove,
}) => {
  const [cancelPhase, setCancelPhase] = useState(
    /** @type {CancelPhase} */ ('idle'),
  );
  const confirmTimer = useRef(
    /** @type {ReturnType<typeof setTimeout> | 0} */ (0),
  );

  // Clear a pending confirm-revert timer if the item unmounts mid-confirm.
  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  /** @param {{ stopPropagation: () => void }} e */
  const onCancelClick = e => {
    e.stopPropagation();
    if (cancelPhase === 'confirming') {
      // Second click — execute the cancel.
      clearTimeout(confirmTimer.current);
      setCancelPhase('cancelling');
      Promise.resolve()
        .then(() => onCancel())
        .then(
          () => setCancelPhase('cancelled'),
          err => {
            console.error('[inventory] Cancel failed:', err);
            setCancelPhase('idle');
          },
        );
    } else if (cancelPhase === 'idle') {
      // First click — arm the confirm state, auto-reverting after 3s.
      setCancelPhase('confirming');
      confirmTimer.current = setTimeout(() => setCancelPhase('idle'), 3000);
    }
  };

  const cancelClass = [
    'cancel-button',
    cancelPhase === 'confirming' && 'confirming',
    cancelPhase === 'cancelled' && 'cancelled',
  ]
    .filter(Boolean)
    .join(' ');

  return h(
    Fragment,
    null,
    h(
      'button',
      { class: 'info-button', title: 'Inspect', onClick: onInspect },
      'ℹ',
    ),
    h(
      'button',
      {
        class: cancelClass,
        title: cancelDisabled
          ? 'Cannot cancel system name'
          : CANCEL_TITLES[cancelPhase],
        disabled:
          cancelDisabled ||
          cancelPhase === 'cancelling' ||
          cancelPhase === 'cancelled',
        onClick: cancelDisabled ? undefined : onCancelClick,
      },
      '⊘',
    ),
    h(
      'button',
      {
        class: 'remove-button',
        title: removeTitle,
        disabled: removeDisabled,
        onClick: removeDisabled ? undefined : onRemove,
      },
      '×',
    ),
  );
};
harden(ItemActions);
