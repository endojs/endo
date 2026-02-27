// @ts-check
/* global window */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { tokenAutocompleteComponent } from './token-autocomplete.js';

/**
 * @typedef {object} SendFormState
 * @property {boolean} menuVisible - Token autocomplete menu is showing
 * @property {boolean} hasToken - Input contains at least one token chip
 * @property {boolean} hasText - Input contains text (not just tokens)
 * @property {boolean} isEmpty - Input is completely empty
 */

/**
 * @typedef {object} SendFormAPI
 * @property {() => void} focus - Focus the input
 * @property {() => void} clear - Clear the input
 * @property {() => boolean} isMenuVisible - Check if autocomplete menu is visible
 * @property {() => string | null} getLastRecipient - Get the last recipient for continuation
 * @property {() => SendFormState} getState - Get current input state for modeline
 * @property {() => boolean} isSubmitting - Check if a send is in progress
 */

/**
 * Send form component - handles message sending with token autocomplete.
 *
 * @param {object} options
 * @param {HTMLElement} options.$input - The contenteditable div
 * @param {HTMLElement} options.$menu - The autocomplete menu container
 * @param {HTMLElement} options.$error - Error display element
 * @param {HTMLElement} options.$sendButton - Send button element
 * @param {HTMLElement} options.$chatBar - Chat bar element (for submitting class)
 * @param {typeof import('@endo/far').E} options.E - Eventual send function
 * @param {(ref: unknown) => AsyncIterable<unknown>} options.makeRefIterator - Ref iterator factory
 * @param {ERef<EndoHost>} options.powers - Powers object
 * @param {(value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>} [options.showValue] - Display a value
 * @param {() => boolean} [options.shouldHandleEnter] - Optional callback to check if Enter should be handled
 * @param {(state: SendFormState) => void} [options.onStateChange] - Called when input state changes
 * @param {() => string | null} [options.getConversationPetName] - Returns active conversation pet name
 * @param {(petName: string) => void} [options.navigateToConversation] - Navigate to a conversation after sending
 * @returns {SendFormAPI}
 */
export const sendFormComponent = ({
  $input,
  $menu,
  $error,
  $sendButton,
  $chatBar,
  E,
  makeRefIterator,
  powers,
  showValue,
  shouldHandleEnter = () => true,
  onStateChange,
  getConversationPetName,
  navigateToConversation,
}) => {
  const clearError = () => {
    $error.textContent = '';
  };

  /** @type {string | null} */
  let lastRecipient = null;
  let submitting = false;

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

  const setSubmitting = (/** @type {boolean} */ value) => {
    submitting = value;
    if (value) {
      $chatBar.classList.add('submitting');
      $sendButton.classList.add('btn-spinner');
      /** @type {HTMLButtonElement} */ ($sendButton).disabled = true;
      $input.contentEditable = 'false';
    } else {
      $chatBar.classList.remove('submitting');
      $sendButton.classList.remove('btn-spinner');
      /** @type {HTMLButtonElement} */ ($sendButton).disabled = false;
      $input.contentEditable = 'true';
    }
  };

  /** @param {Event} event */
  const handleSend = event => {
    event.preventDefault();
    event.stopPropagation();

    if (submitting) return;

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

    const conversationPetName = getConversationPetName
      ? getConversationPetName()
      : null;

    if (conversationPetName) {
      // In conversation mode: all tokens are embedded values, recipient is implicit
      const messageStrings = strings.map((s, i) => {
        if (i === 0) return s.trimStart();
        if (i === strings.length - 1) return s.trimEnd();
        return s;
      });

      setSubmitting(true);
      E(powers)
        .send(conversationPetName, messageStrings, edgeNames, petNames)
        .then(
          () => {
            lastRecipient = conversationPetName;
            tokenComponent.clear();
            clearError();
          },
          (/** @type {Error} */ error) => {
            $error.textContent = error.message;
          },
        )
        .finally(() => setSubmitting(false));
      return;
    }

    // Single token with no message opens the value modal
    const onlyToken =
      petNames.length === 1 && strings.every(part => !part.trim());
    if (onlyToken) {
      const [petName] = petNames;
      const petNamePath = petName.split('.');
      setSubmitting(true);
      Promise.all([
        E(powers).identify(
          .../** @type {[string, ...string[]]} */ (petNamePath),
        ),
        E(powers).lookup(petNamePath),
      ])
        .then(
          ([id, value]) => {
            if (showValue) {
              showValue(value, id, petNamePath, undefined);
            }
            tokenComponent.clear();
            clearError();
          },
          (/** @type {Error} */ error) => {
            $error.textContent = error.message;
          },
        )
        .finally(() => setSubmitting(false));
      return;
    }

    // Determine recipient and message content
    const firstStringEmpty = !strings[0] || !strings[0].trim();
    /** @type {string} */
    let to;
    /** @type {string[]} */
    let messageStrings;
    /** @type {string[]} */
    let messagePetNames;
    /** @type {string[]} */
    let messageEdgeNames;

    if (firstStringEmpty && petNames.length > 0) {
      // First token is the recipient, rest is the message
      to = petNames[0];
      const rawMessageStrings = [strings[0] + strings[1], ...strings.slice(2)];
      messageStrings = rawMessageStrings.map((s, i) => {
        if (i === 0) return s.trimStart();
        if (i === rawMessageStrings.length - 1) return s.trimEnd();
        return s;
      });
      messagePetNames = petNames.slice(1);
      messageEdgeNames = edgeNames.slice(1);
    } else if (lastRecipient) {
      // No leading @-mention: send to last recipient, all tokens are embedded values
      to = lastRecipient;
      messageStrings = strings.map((s, i) => {
        if (i === 0) return s.trimStart();
        if (i === strings.length - 1) return s.trimEnd();
        return s;
      });
      messagePetNames = petNames;
      messageEdgeNames = edgeNames;
    } else {
      $error.textContent =
        'No recipient — start with @name or select a conversation';
      return;
    }

    const navigateAfterSend = firstStringEmpty && petNames.length > 0;

    setSubmitting(true);
    E(powers)
      .send(to, messageStrings, messageEdgeNames, messagePetNames)
      .then(
        () => {
          lastRecipient = to;
          tokenComponent.clear();
          clearError();
          if (navigateAfterSend && navigateToConversation) {
            navigateToConversation(to);
          }
        },
        (/** @type {Error} */ error) => {
          $error.textContent = error.message;
        },
      )
      .finally(() => setSubmitting(false));
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

  /**
   * Get the current state of the input for modeline display.
   * @returns {SendFormState}
   */
  const getState = () => {
    const { strings, petNames } = tokenComponent.getMessage();
    const menuVisible = tokenComponent.isMenuVisible();
    const hasToken = petNames.length > 0;
    const hasText = strings.some(s => s.trim().length > 0);
    const isEmpty = !hasToken && !hasText;
    return { menuVisible, hasToken, hasText, isEmpty };
  };

  const notifyStateChange = () => {
    if (onStateChange) {
      onStateChange(getState());
    }
  };

  $input.addEventListener('input', () => {
    clearError();
    notifyStateChange();
  });

  // Also notify on keyup for menu state changes
  $input.addEventListener('keyup', notifyStateChange);

  return {
    focus: () => $input.focus(),
    clear: () => tokenComponent.clear(),
    isMenuVisible: () => tokenComponent.isMenuVisible(),
    getLastRecipient: () => lastRecipient,
    getState,
    isSubmitting: () => submitting,
  };
};
