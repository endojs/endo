// @ts-check
/* global globalThis */

/**
 * @typedef {object} KeyboardEventOptions
 * @property {boolean} [shiftKey]
 * @property {boolean} [ctrlKey]
 * @property {boolean} [altKey]
 * @property {boolean} [metaKey]
 */

/**
 * Simulates typing a character into a contenteditable element.
 *
 * @param {HTMLElement} $input - The contenteditable element
 * @param {string} char - Single character to type
 * @param {KeyboardEventOptions} [options]
 */
export const typeChar = ($input, char, options = {}) => {
  const doc = $input.ownerDocument;
  const win = doc.defaultView;
  if (!win) return;

  // Use the window's constructors for happy-dom compatibility
  const KeyboardEventCtor = /** @type {typeof KeyboardEvent} */ (
    /** @type {unknown} */ (win).KeyboardEvent || globalThis.KeyboardEvent
  );
  const EventCtor = /** @type {typeof Event} */ (
    /** @type {unknown} */ (win).Event || globalThis.Event
  );

  // First dispatch keydown
  const keydownEvent = new KeyboardEventCtor('keydown', {
    key: char,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  $input.dispatchEvent(keydownEvent);

  if (keydownEvent.defaultPrevented) {
    return;
  }

  // Then modify content and dispatch input
  // For contenteditable, we need to insert at selection
  const sel = win.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const textNode = doc.createTextNode(char);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    // Fallback: append to textContent
    $input.textContent = ($input.textContent || '') + char;
  }

  // Dispatch input event
  $input.dispatchEvent(new EventCtor('input', { bubbles: true }));

  // Dispatch keyup
  $input.dispatchEvent(
    new KeyboardEventCtor('keyup', {
      key: char,
      bubbles: true,
      ...options,
    }),
  );
};

/**
 * Simulates typing a string into a contenteditable element.
 *
 * @param {HTMLElement} $input - The contenteditable element
 * @param {string} text - String to type
 * @param {KeyboardEventOptions} [options]
 */
export const typeText = ($input, text, options = {}) => {
  for (const char of text) {
    typeChar($input, char, options);
  }
};

/**
 * Simulates pressing a special key (Enter, Escape, Tab, Arrow keys, etc.)
 *
 * @param {HTMLElement} $input - The element to send the key to
 * @param {string} key - Key name (e.g., 'Enter', 'Escape', 'ArrowDown')
 * @param {KeyboardEventOptions} [options]
 * @returns {boolean} - True if the event was not prevented
 */
export const pressKey = ($input, key, options = {}) => {
  const win = $input.ownerDocument.defaultView;
  if (!win) return false;

  const KeyboardEventCtor = /** @type {typeof KeyboardEvent} */ (
    /** @type {unknown} */ (win).KeyboardEvent || globalThis.KeyboardEvent
  );

  const keydownEvent = new KeyboardEventCtor('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  $input.dispatchEvent(keydownEvent);

  if (!keydownEvent.defaultPrevented) {
    $input.dispatchEvent(
      new KeyboardEventCtor('keyup', {
        key,
        bubbles: true,
        ...options,
      }),
    );
  }

  return !keydownEvent.defaultPrevented;
};

/**
 * Simulates pressing Backspace, which may delete content.
 *
 * @param {HTMLElement} $input - The contenteditable element
 * @param {KeyboardEventOptions} [options]
 */
export const pressBackspace = ($input, options = {}) => {
  const doc = $input.ownerDocument;
  const win = doc.defaultView;
  if (!win) return;

  const KeyboardEventCtor = /** @type {typeof KeyboardEvent} */ (
    /** @type {unknown} */ (win).KeyboardEvent || globalThis.KeyboardEvent
  );
  const EventCtor = /** @type {typeof Event} */ (
    /** @type {unknown} */ (win).Event || globalThis.Event
  );

  const keydownEvent = new KeyboardEventCtor('keydown', {
    key: 'Backspace',
    bubbles: true,
    cancelable: true,
    ...options,
  });
  $input.dispatchEvent(keydownEvent);

  if (keydownEvent.defaultPrevented) {
    return;
  }

  // Default behavior: delete character before cursor
  const sel = win.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    if (range.collapsed && range.startOffset > 0) {
      range.setStart(range.startContainer, range.startOffset - 1);
      range.deleteContents();
    }
  }

  $input.dispatchEvent(new EventCtor('input', { bubbles: true }));

  $input.dispatchEvent(
    new KeyboardEventCtor('keyup', {
      key: 'Backspace',
      bubbles: true,
      ...options,
    }),
  );
};

/**
 * Sets the cursor position in a contenteditable element.
 *
 * @param {HTMLElement} $input - The contenteditable element
 * @param {number} position - Character position from start
 */
export const setCursorPosition = ($input, position) => {
  const doc = $input.ownerDocument;
  const win = doc.defaultView;
  if (!win) return;

  const sel = win.getSelection();
  if (!sel) return;

  // Use globalThis.NodeFilter since happy-dom may not expose it on window
  const SHOW_TEXT = globalThis.NodeFilter?.SHOW_TEXT ?? 4;

  // Find the text node and offset
  let currentPos = 0;
  const walker = doc.createTreeWalker($input, SHOW_TEXT, null);

  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length || 0;
    if (currentPos + len >= position) {
      const range = doc.createRange();
      range.setStart(node, position - currentPos);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    currentPos += len;
    node = walker.nextNode();
  }

  // If position exceeds content, place at end
  const range = doc.createRange();
  range.selectNodeContents($input);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
};

/**
 * Clears the content of an element and resets cursor.
 *
 * @param {HTMLElement} $input - The element to clear
 */
export const clearInput = $input => {
  $input.innerHTML = '';
  const win = $input.ownerDocument.defaultView;
  if (!win) return;

  const EventCtor = /** @type {typeof Event} */ (
    /** @type {unknown} */ (win).Event || globalThis.Event
  );

  const sel = win.getSelection();
  if (sel) {
    sel.removeAllRanges();
  }
  $input.dispatchEvent(new EventCtor('input', { bubbles: true }));
};
