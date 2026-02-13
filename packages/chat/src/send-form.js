// @ts-check
/* global window */

import { tokenAutocompleteComponent } from './token-autocomplete.js';

/**
 * @typedef {object} SendFormAPI
 * @property {() => void} focus - Focus the input
 * @property {() => void} clear - Clear the input
 * @property {() => boolean} isMenuVisible - Check if autocomplete menu is visible
 * @property {() => string | null} getLastRecipient - Get the last recipient for continuation
 */

/**
 * Send form component - handles message sending with token autocomplete.
 *
 * @param {object} options
 * @param {HTMLElement} options.$input - The contenteditable div
 * @param {HTMLElement} options.$menu - The autocomplete menu container
 * @param {HTMLElement} options.$error - Error display element
 * @param {HTMLElement} options.$sendButton - Send button element
 * @param {(target: unknown) => unknown} options.E - Eventual send function
 * @param {(ref: unknown) => AsyncIterable<unknown>} options.makeRefIterator - Ref iterator factory
 * @param {unknown} options.powers - Powers object
 * @param {() => boolean} [options.shouldHandleEnter] - Optional callback to check if Enter should be handled
 * @returns {SendFormAPI}
 */
export const sendFormComponent = ({
  $input,
  $menu,
  $error,
  $sendButton,
  E,
  makeRefIterator,
  powers,
  shouldHandleEnter = () => true,
}) => {
  const clearError = () => {
    $error.textContent = '';
  };

  /** @type {string | null} */
  let lastRecipient = null;

  // Initialize token autocomplete
  const tokenComponent = tokenAutocompleteComponent($input, $menu, {
    E,
    makeRefIterator,
    powers,
  });

  /**
   * Check if the input is empty or cursor is at the very beginning.
   * @returns {boolean}
   */
  const isAtEmptyStart = () => {
    const content = $input.textContent || '';
    if (content.trim()) return false;

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return true;

    const range = sel.getRangeAt(0);
    return range.startOffset === 0;
  };

  /** @param {Event} event */
  const handleSend = event => {
    event.preventDefault();
    event.stopPropagation();

    // Don't send if token menu is visible (Enter selects token)
    if (tokenComponent.isMenuVisible()) {
      return;
    }

    // Get structured message from the component
    const { strings, petNames, edgeNames } = tokenComponent.getMessage();

    // Check if message is empty
    const hasContent = strings.some(s => s.trim()) || petNames.length > 0;
    if (!hasContent) {
      return;
    }

    // First token is the recipient if the message starts with a token
    const firstStringEmpty = !strings[0] || !strings[0].trim();
    if (!firstStringEmpty || petNames.length === 0) {
      $error.textContent = 'Start with @recipient';
      return;
    }

    // Extract recipient from first token, rest is the message
    const to = petNames[0];
    const rawMessageStrings = [strings[0] + strings[1], ...strings.slice(2)];
    const messageStrings = rawMessageStrings.map((s, i) => {
      if (i === 0) return s.trimStart();
      if (i === rawMessageStrings.length - 1) return s.trimEnd();
      return s;
    });
    const messagePetNames = petNames.slice(1);
    const messageEdgeNames = edgeNames.slice(1);

    E(powers)
      .send(to, messageStrings, messageEdgeNames, messagePetNames)
      .then(
        () => {
          lastRecipient = to;
          tokenComponent.clear();
          clearError();
        },
        (/** @type {Error} */ error) => {
          $error.textContent = error.message;
        },
      );
  };

  $sendButton.addEventListener('click', handleSend);

  $input.addEventListener('keydown', (/** @type {KeyboardEvent} */ event) => {
    // Space at empty start inserts last recipient
    if (
      event.key === ' ' &&
      !tokenComponent.isMenuVisible() &&
      lastRecipient &&
      isAtEmptyStart()
    ) {
      event.preventDefault();
      tokenComponent.insertTokenAtCursor(lastRecipient);
      return;
    }

    // Only handle Enter for send if menu is not visible and shouldHandleEnter allows it
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !tokenComponent.isMenuVisible() &&
      shouldHandleEnter()
    ) {
      event.preventDefault();
      handleSend(event);
    }
  });

  $input.addEventListener('input', clearError);

  return {
    focus: () => $input.focus(),
    clear: () => tokenComponent.clear(),
    isMenuVisible: () => tokenComponent.isMenuVisible(),
    getLastRecipient: () => lastRecipient,
  };
};
