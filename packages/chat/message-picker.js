// @ts-check

import harden from '@endo/harden';

import {
  h,
  renderConfined,
  useEffect,
  useState,
} from './setup-preact-container.js';

// Message picker, migrated from imperative DOM to a confined Preact component
// rendered through a single `renderConfined`.
//
// CONFINEMENT BOUNDARY. `createMessagePicker` is trusted host code. The host's
// live message list (`$messagesContainer`) is read, decorated (badges,
// `selectable`/`highlighted` classes, `message-picking-mode` on the container)
// and scrolled imperatively in the entry closure — that DOM never enters the
// Preact tree, because `renderConfined` strips refs and real DOM nodes from
// vnodes. Only the picker's OWN overlay (a list of pickable messages with
// keyboard navigation) renders confined, into its own container element created
// by the entry function. The component receives only plain data (message
// numbers and text snippets) as props/state, never host nodes.
//
// All visual state of the overlay is Preact state: the visible items and the
// keyboard-driven `selectedIndex` highlight live in `useState`, since confined
// event handlers receive a frozen `SafeEvent` (which exposes `key`/`code`) and
// no DOM nodes.

/**
 * @typedef {object} PickerMessage
 * @property {number} number - The message number (#N).
 * @property {string} text - A short text snippet for display.
 */

/**
 * @typedef {object} MessagePickerAPI
 * @property {() => void} enable - Enable message picking mode
 * @property {() => void} disable - Disable message picking mode
 * @property {() => boolean} isActive - Check if picker is active
 * @property {(number: number) => void} setSelected - Set the selected message number
 * @property {() => number | null} getSelected - Get the selected message number
 */

/**
 * The picker overlay view. Renders one row per pickable message and supports
 * keyboard navigation (Arrow keys move the highlight, Enter confirms, Escape
 * closes). All visual state is Preact state: the highlight is the
 * `selectedNumber` prop resolved to an index, and navigation is handled by an
 * `onKeyDown` handler scoped to the (autofocused, focusable) overlay element.
 *
 * @param {object} props
 * @param {PickerMessage[]} props.messages
 * @param {number | null} props.selectedNumber
 * @param {(number: number) => void} props.onPick - Confirm a message number.
 * @param {(number: number) => void} props.onHighlight - Move highlight without confirming.
 * @param {() => void} props.onClose - Close the picker (Escape).
 */
const MessagePickerOverlay = ({
  messages,
  selectedNumber,
  onPick,
  onHighlight,
  onClose,
}) => {
  // Resolve the externally-controlled selected number to a list index. When
  // nothing is selected yet, start at the first row so arrow keys have an
  // anchor.
  const selectedIndex = (() => {
    const i = messages.findIndex(m => m.number === selectedNumber);
    return i >= 0 ? i : 0;
  })();

  if (messages.length === 0) {
    return null;
  }

  // Keyboard navigation is scoped to the overlay element via `onKeyDown` rather
  // than a document listener. The frozen SafeEvent exposes `key`; the element is
  // focusable (`tabindex`) and `autofocus`es on open so arrow/Enter/Escape land
  // here without any ref. Element scoping also keeps multiple pickers'
  // handlers independent — no shared document listeners to contend over.
  /** @param {{ key?: string, preventDefault: () => void }} e */
  const onKeyDown = e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(messages.length - 1, selectedIndex + 1);
      onHighlight(messages[next].number);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(0, selectedIndex - 1);
      onHighlight(messages[prev].number);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = messages[selectedIndex];
      if (current) onPick(current.number);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return h(
    'div',
    {
      class: 'message-picker',
      tabindex: 0,
      autofocus: true,
      onKeyDown,
    },
    h(
      'div',
      { class: 'message-picker-header' },
      'Pick a message — ↑↓ navigate · Enter select · Esc cancel',
    ),
    h(
      'div',
      { class: 'message-picker-list' },
      messages.map((msg, index) =>
        h(
          'div',
          {
            key: msg.number,
            class: [
              'message-picker-item',
              index === selectedIndex && 'highlighted',
            ]
              .filter(Boolean)
              .join(' '),
            onMouseEnter: () => onHighlight(msg.number),
            onClick: () => onPick(msg.number),
          },
          h('span', { class: 'message-num-badge' }, String(msg.number)),
          h('span', { class: 'message-picker-item-text' }, msg.text),
        ),
      ),
    ),
  );
};
harden(MessagePickerOverlay);

/**
 * Root component: owns the overlay's view state and exposes its setter to the
 * host via a mutable controller. Renders nothing while disabled so the overlay
 * container is empty.
 *
 * @param {object} props
 * @param {{ setState?: (s: PickerState) => void }} props.controller
 * @param {(number: number) => void} props.onPick
 * @param {(number: number) => void} props.onHighlight
 * @param {() => void} props.onClose
 */
const MessagePickerRoot = ({ controller, onPick, onHighlight, onClose }) => {
  const [state, setState] = useState(
    /** @type {PickerState} */ ({
      active: false,
      messages: [],
      selectedNumber: null,
    }),
  );

  useEffect(() => {
    controller.setState = setState;
    return () => {
      if (controller.setState === setState) delete controller.setState;
    };
  }, [controller]);

  if (!state.active) {
    return null;
  }

  return h(MessagePickerOverlay, {
    messages: state.messages,
    selectedNumber: state.selectedNumber,
    onPick,
    onHighlight,
    onClose,
  });
};
harden(MessagePickerRoot);

/**
 * @typedef {object} PickerState
 * @property {boolean} active
 * @property {PickerMessage[]} messages
 * @property {number | null} selectedNumber
 */

/**
 * Create a message picker that highlights messages and allows selecting one.
 *
 * The host's message list is read and decorated imperatively in this closure
 * (trusted host DOM); only the picker's own overlay renders confined.
 *
 * @param {object} options
 * @param {HTMLElement} options.$messagesContainer - The messages container element
 * @param {(messageNumber: number) => void} options.onSelect - Called when a message is selected
 * @returns {MessagePickerAPI}
 */
export const createMessagePicker = ({ $messagesContainer, onSelect }) => {
  let isActive = false;
  /** @type {number | null} */
  let selectedNumber = null;
  /** @type {(() => void)[]} */
  let cleanupHandlers = [];

  // The overlay renders into its own container, kept entirely separate from the
  // host's message list. The container and confined tree are created once at
  // construction; visibility is driven by the `active` flag in Preact state.
  const $overlay = document.createElement('div');
  $overlay.className = 'message-picker-overlay';
  $overlay.style.display = 'none';

  // Mutable bridge to the root component's state setter (populated by the
  // component's effect). Intentionally NOT hardened — the component writes its
  // setter onto it.
  /** @type {{ setState?: (s: PickerState) => void }} */
  const controller = {};

  /**
   * Get all message elements with their numbers from the host DOM. Used only
   * for imperative decoration — the elements never cross into the Preact tree.
   * @returns {Array<{ element: HTMLElement, number: number, text: string }>}
   */
  const getMessages = () => {
    const messages = $messagesContainer.querySelectorAll('.message');
    const result = [];

    for (const message of messages) {
      const $msgNum = message.querySelector('.timestamp-num');
      if ($msgNum) {
        const numText = $msgNum.textContent || '';
        const match = numText.match(/#(\d+)/);
        if (match) {
          result.push({
            element: /** @type {HTMLElement} */ (message),
            number: parseInt(match[1], 10),
            text: (message.textContent || '').replace(/\s+/g, ' ').trim(),
          });
        }
      }
    }

    return result;
  };

  /**
   * Push the current pickable messages and selection into the confined overlay
   * as plain data.
   */
  const syncOverlay = () => {
    if (!controller.setState) return;
    const messages = getMessages().map(({ number, text }) => ({
      number,
      text,
    }));
    controller.setState({ active: isActive, messages, selectedNumber });
  };

  /**
   * Update the host-node highlight to match the selected number. Imperative
   * decoration of trusted host DOM.
   */
  const applyHostHighlight = () => {
    const messages = getMessages();
    for (const { element, number: msgNum } of messages) {
      if (msgNum === selectedNumber) {
        element.classList.add('highlighted');
      } else {
        element.classList.remove('highlighted');
      }
    }
  };

  /**
   * Set the selected message number.
   * @param {number} number
   */
  const setSelected = number => {
    selectedNumber = number;
    if (isActive) {
      applyHostHighlight();
      syncOverlay();
    }
  };

  /**
   * Enable message picking mode.
   */
  const enable = () => {
    if (isActive) return;
    isActive = true;

    // Add picking class to host container (trusted DOM).
    $messagesContainer.classList.add('message-picking-mode');

    // Add click handlers and badges to all host messages.
    const messages = getMessages();
    for (const { element, number } of messages) {
      // Add message number badge
      let $badge = element.querySelector('.message-num-badge');
      if (!$badge) {
        $badge = document.createElement('span');
        $badge.className = 'message-num-badge';
        element.style.position = 'relative';
        element.appendChild($badge);
      }
      $badge.textContent = String(number);

      // Add selectable class
      element.classList.add('selectable');

      // Highlight if this is the selected one
      if (number === selectedNumber) {
        element.classList.add('highlighted');
      }

      // Add click handler
      const clickHandler = e => {
        e.preventDefault();
        e.stopPropagation();
        setSelected(number);
        onSelect(number);
      };

      element.addEventListener('click', clickHandler);
      cleanupHandlers.push(() => {
        element.removeEventListener('click', clickHandler);
      });
    }

    // Reveal and populate the confined overlay (rendered once at construction).
    $overlay.style.display = 'block';
    syncOverlay();
  };

  /**
   * Disable message picking mode.
   */
  const disable = () => {
    if (!isActive) return;
    isActive = false;

    // Remove picking class from host container.
    $messagesContainer.classList.remove('message-picking-mode');

    // Clean up all host click handlers.
    for (const cleanup of cleanupHandlers) {
      cleanup();
    }
    cleanupHandlers = [];

    // Remove decoration classes from host messages.
    const messages = $messagesContainer.querySelectorAll('.message');
    for (const message of messages) {
      message.classList.remove('selectable', 'highlighted');
    }

    // Hide the confined overlay and clear its view state (the tree itself
    // persists so the controller setter stays wired for the next enable).
    $overlay.style.display = 'none';
    syncOverlay();
  };

  /**
   * Get the selected message number.
   * @returns {number | null}
   */
  const getSelected = () => selectedNumber;

  // Render the confined overlay once. The Root renders nothing while inactive,
  // matching the hidden container. `onHighlight`/`onPick`/`onClose` drive the
  // imperative host-DOM decoration in this closure.
  document.body.appendChild($overlay);
  renderConfined(
    h(MessagePickerRoot, {
      controller,
      onPick: number => {
        setSelected(number);
        onSelect(number);
      },
      onHighlight: number => {
        setSelected(number);
      },
      onClose: () => {
        disable();
      },
    }),
    $overlay,
  );

  return harden({
    enable,
    disable,
    isActive: () => isActive,
    setSelected,
    getSelected,
  });
};
harden(createMessagePicker);
