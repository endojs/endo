// @ts-check
/* global document */

/**
 * @typedef {object} MessagePickerAPI
 * @property {() => void} enable - Enable message picking mode
 * @property {() => void} disable - Disable message picking mode
 * @property {() => boolean} isActive - Check if picker is active
 * @property {(number: number) => void} setSelected - Set the selected message number
 * @property {() => number | null} getSelected - Get the selected message number
 */

/**
 * Create a message picker that highlights messages and allows clicking to select.
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

  /**
   * Get all message elements with their numbers.
   * @returns {Array<{ element: HTMLElement, number: number }>}
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
          });
        }
      }
    }

    return result;
  };

  /**
   * Enable message picking mode.
   */
  const enable = () => {
    if (isActive) return;
    isActive = true;

    // Add picking class to container
    $messagesContainer.classList.add('message-picking-mode');

    // Add click handlers and badges to all messages
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
        setSelected(number); // eslint-disable-line no-use-before-define
        onSelect(number);
      };

      element.addEventListener('click', clickHandler);
      cleanupHandlers.push(() => {
        element.removeEventListener('click', clickHandler);
      });
    }
  };

  /**
   * Disable message picking mode.
   */
  const disable = () => {
    if (!isActive) return;
    isActive = false;

    // Remove picking class
    $messagesContainer.classList.remove('message-picking-mode');

    // Clean up all handlers
    for (const cleanup of cleanupHandlers) {
      cleanup();
    }
    cleanupHandlers = [];

    // Remove classes from messages
    const messages = $messagesContainer.querySelectorAll('.message');
    for (const message of messages) {
      message.classList.remove('selectable', 'highlighted');
    }
  };

  /**
   * Set the selected message number.
   * @param {number} number
   */
  const setSelected = number => {
    selectedNumber = number;

    if (isActive) {
      // Update highlighting
      const messages = getMessages();
      for (const { element, number: msgNum } of messages) {
        if (msgNum === number) {
          element.classList.add('highlighted');
        } else {
          element.classList.remove('highlighted');
        }
      }
    }
  };

  /**
   * Get the selected message number.
   * @returns {number | null}
   */
  const getSelected = () => selectedNumber;

  return {
    enable,
    disable,
    isActive: () => isActive,
    setSelected,
    getSelected,
  };
};
