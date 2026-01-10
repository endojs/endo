// @ts-check
/* global window, document, setTimeout */
/* eslint-disable no-use-before-define */

/**
 * @typedef {object} ChatMessage
 * @property {string[]} strings - Text segments between tokens
 * @property {string[]} petNames - Pet names for each token
 * @property {string[]} edgeNames - Edge names (labels) for each token
 */

/**
 * @typedef {object} TokenAutocompleteAPI
 * @property {() => ChatMessage} getMessage - Parse the input into structured message
 * @property {() => void} clear - Clear the input
 * @property {() => boolean} isMenuVisible - Check if autocomplete menu is visible
 * @property {(petName: string) => void} insertTokenAtCursor - Insert a token programmatically
 */

/**
 * Token autocomplete and structured message component for contenteditable input.
 *
 * @param {HTMLElement} $input - The contenteditable div
 * @param {HTMLElement} $menu - The autocomplete menu container
 * @param {object} options
 * @param {(target: unknown) => unknown} options.E - Eventual send function
 * @param {(ref: unknown) => AsyncIterable<unknown>} options.makeRefIterator - Ref iterator factory
 * @param {unknown} options.powers - Powers object for following name changes
 * @returns {TokenAutocompleteAPI}
 */
export const tokenAutocompleteComponent = ($input, $menu, { E, makeRefIterator, powers }) => {
  /** @type {string[]} */
  // eslint-disable-next-line prefer-const
  let petNames = [];
  /** @type {string[]} */
  let filteredNames = [];
  let selectedIndex = 0;
  /** @type {Text | null} */
  let triggerNode = null;
  let triggerOffset = -1;
  let isMenuVisible = false;
  let enteringEdgeName = false;
  /** @type {{ petName: string, edgeName: string } | null} */
  let pendingToken = null;

  // Subscribe to inventory changes
  (async () => {
    for await (const change of makeRefIterator(E(powers).followNameChanges())) {
      if ('add' in /** @type {object} */ (change)) {
        petNames.push(/** @type {{ add: string }} */ (change).add);
        petNames.sort();
      } else if ('remove' in /** @type {object} */ (change)) {
        const idx = petNames.indexOf(/** @type {{ remove: string }} */ (change).remove);
        if (idx !== -1) {
          petNames.splice(idx, 1);
        }
      }
      if (isMenuVisible) {
        updateFilter();
      }
    }
  })().catch(window.reportError);

  const showMenu = () => {
    isMenuVisible = true;
    $menu.classList.add('visible');
  };

  const hideMenu = () => {
    isMenuVisible = false;
    $menu.classList.remove('visible');
    triggerNode = null;
    triggerOffset = -1;
    selectedIndex = 0;
    enteringEdgeName = false;
    pendingToken = null;
  };

  /**
   * Get the current filter text from the trigger position to cursor.
   * @returns {string}
   */
  const getFilterText = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !triggerNode) return '';

    const range = sel.getRangeAt(0);
    if (range.startContainer !== triggerNode) return '';

    const fullText = triggerNode.textContent || '';
    return fullText.slice(triggerOffset + 1, range.startOffset).toLowerCase();
  };

  const updateFilter = () => {
    const filterText = getFilterText();

    filteredNames = petNames.filter(name =>
      name.toLowerCase().startsWith(filterText),
    );

    if (selectedIndex >= filteredNames.length) {
      selectedIndex = Math.max(0, filteredNames.length - 1);
    }

    renderMenu(filterText);
  };

  /** @param {string} filterText */
  const renderMenu = filterText => {
    $menu.innerHTML = '';

    if (filteredNames.length === 0) {
      const $empty = document.createElement('div');
      $empty.className = 'token-menu-empty';
      $empty.textContent = filterText ? 'No matches' : 'No pet names';
      $menu.appendChild($empty);
    } else {
      filteredNames.forEach((name, index) => {
        const $item = document.createElement('div');
        $item.className = 'token-menu-item';
        if (index === selectedIndex) {
          $item.classList.add('selected');
        }

        const $prefix = document.createElement('span');
        $prefix.className = 'token-prefix';
        $prefix.textContent = '@';
        $item.appendChild($prefix);
        $item.appendChild(document.createTextNode(name));

        $item.addEventListener('mouseenter', () => {
          selectedIndex = index;
          renderMenu(filterText);
        });

        $item.addEventListener('click', e => {
          e.preventDefault();
          insertToken(name, '');
        });

        $menu.appendChild($item);
      });
    }

    const $hint = document.createElement('div');
    $hint.className = 'token-menu-hint';
    $hint.innerHTML =
      '<kbd>↑↓</kbd> navigate · <kbd>Tab</kbd>/<kbd>Enter</kbd> select · <kbd>:</kbd> add label · <kbd>Esc</kbd> cancel';
    $menu.appendChild($hint);
  };

  /**
   * Create a token element.
   * @param {string} petName
   * @param {string} edgeName
   * @returns {HTMLSpanElement}
   */
  const createTokenElement = (petName, edgeName) => {
    const $token = document.createElement('span');
    $token.className = 'chat-token';
    $token.contentEditable = 'false';
    $token.dataset.petName = petName;
    $token.dataset.edgeName = edgeName || petName;

    const $name = document.createElement('span');
    $name.className = 'token-name';
    $name.textContent = petName;
    $token.appendChild($name);

    if (edgeName && edgeName !== petName) {
      const $edge = document.createElement('span');
      $edge.className = 'token-edge';
      $edge.textContent = edgeName;
      $token.appendChild($edge);
    }

    return $token;
  };

  /**
   * Insert a token at the current trigger position.
   * @param {string} petName
   * @param {string} edgeName
   */
  const insertToken = (petName, edgeName) => {
    if (!triggerNode) {
      hideMenu();
      return;
    }

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      hideMenu();
      return;
    }

    const range = sel.getRangeAt(0);
    const fullText = triggerNode.textContent || '';
    const cursorOffset = range.startOffset;

    // Text before the @ trigger
    const beforeText = fullText.slice(0, triggerOffset);
    // Text after the cursor (filter text will be removed)
    const afterText = fullText.slice(cursorOffset);

    // Create token element
    const $token = createTokenElement(petName, edgeName || petName);

    // Split the text node and insert token
    // Add a space after the token for easy continuation
    const $before = document.createTextNode(beforeText);
    const $after = document.createTextNode(afterText ? ` ${afterText}` : ' ');

    const parent = triggerNode.parentNode;
    if (parent) {
      parent.insertBefore($before, triggerNode);
      parent.insertBefore($token, triggerNode);
      parent.insertBefore($after, triggerNode);
      parent.removeChild(triggerNode);

      // Set cursor after the space
      const newRange = document.createRange();
      newRange.setStart($after, 1);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    hideMenu();
    $input.focus();
  };

  /**
   * Start edge name entry mode.
   * @param {string} petName
   */
  const startEdgeNameEntry = petName => {
    if (!triggerNode) return;

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const fullText = triggerNode.textContent || '';
    const cursorOffset = range.startOffset;

    // Replace @filter with @petName: in the text
    const beforeText = fullText.slice(0, triggerOffset);
    const afterText = fullText.slice(cursorOffset);
    const newText = `${beforeText}@${petName}:${afterText}`;

    triggerNode.textContent = newText;

    // Position cursor after the colon
    const newCursorPos = triggerOffset + petName.length + 2; // +2 for @ and :
    const newRange = document.createRange();
    newRange.setStart(triggerNode, newCursorPos);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    hideMenu();
    enteringEdgeName = true;
    pendingToken = { petName, edgeName: '' };
  };

  /**
   * Complete edge name entry and insert the token.
   */
  const completeEdgeNameEntry = () => {
    if (!pendingToken || !triggerNode) {
      enteringEdgeName = false;
      pendingToken = null;
      return;
    }

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const fullText = triggerNode.textContent || '';
    const cursorOffset = range.startOffset;

    // Find where the edge name ends (cursor position or first non-alphanumeric)
    const tokenStart = triggerOffset;
    const colonPos = fullText.indexOf(':', tokenStart);
    if (colonPos === -1) {
      enteringEdgeName = false;
      pendingToken = null;
      return;
    }

    const edgeName = fullText.slice(colonPos + 1, cursorOffset);

    // Restore trigger position for insertToken
    const beforeText = fullText.slice(0, tokenStart);
    const afterText = fullText.slice(cursorOffset);

    triggerNode.textContent = beforeText + afterText;

    // Update trigger info
    const oldTriggerNode = triggerNode;
    const newRange = document.createRange();
    newRange.setStart(oldTriggerNode, beforeText.length);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    triggerNode = oldTriggerNode;
    triggerOffset = beforeText.length;

    // Now insert using the special method
    const $token = createTokenElement(
      pendingToken.petName,
      edgeName || pendingToken.petName,
    );
    const $before = document.createTextNode(beforeText);
    const $after = document.createTextNode(afterText ? ` ${afterText}` : ' ');

    const parent = triggerNode.parentNode;
    if (parent) {
      parent.insertBefore($before, triggerNode);
      parent.insertBefore($token, triggerNode);
      parent.insertBefore($after, triggerNode);
      parent.removeChild(triggerNode);

      const finalRange = document.createRange();
      finalRange.setStart($after, 1);
      finalRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(finalRange);
    }

    enteringEdgeName = false;
    pendingToken = null;
    $input.focus();
  };

  /**
   * Parse the contenteditable content into a structured message.
   * @returns {ChatMessage}
   */
  const getMessage = () => {
    /** @type {string[]} */
    const strings = [];
    /** @type {string[]} */
    const messagePetNames = [];
    /** @type {string[]} */
    const edgeNames = [];

    let currentText = '';

    const walk = (/** @type {Node} */ node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        // Filter out zero-width spaces
        currentText += (node.textContent || '').replace(/\u200B/g, '');
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = /** @type {HTMLElement} */ (node);
        if (el.classList.contains('chat-token')) {
          // Push accumulated text and start new segment
          strings.push(currentText);
          currentText = '';
          messagePetNames.push(el.dataset.petName || '');
          edgeNames.push(el.dataset.edgeName || el.dataset.petName || '');
        } else {
          // Recurse into children
          for (const child of node.childNodes) {
            walk(child);
          }
        }
      }
    };

    for (const child of $input.childNodes) {
      walk(child);
    }

    // Push final text segment
    strings.push(currentText);

    // Trim leading/trailing spaces from string segments
    const trimmedStrings = strings.map((s, i) => {
      if (i === 0) return s.trimStart();
      if (i === strings.length - 1) return s.trimEnd();
      return s;
    });

    return { strings: trimmedStrings, petNames: messagePetNames, edgeNames };
  };

  const clear = () => {
    $input.innerHTML = '';
    hideMenu();
  };

  // Handle input events
  $input.addEventListener('input', () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const node = range.startContainer;

    // Remove space before punctuation after token completion
    if (node.nodeType === Node.TEXT_NODE && !enteringEdgeName && !isMenuVisible) {
      const text = node.textContent || '';
      const cursorPos = range.startOffset;
      // Check if we just typed punctuation after " " that follows a token
      if (cursorPos >= 2 && /[.,!?;:)]/.test(text[cursorPos - 1]) && text[cursorPos - 2] === ' ') {
        // Check if the space is right after a token
        const prevSibling = node.previousSibling;
        if (prevSibling && /** @type {HTMLElement} */ (prevSibling).classList?.contains('chat-token')) {
          // Remove the space
          node.textContent = text.slice(0, cursorPos - 2) + text.slice(cursorPos - 1);
          range.setStart(node, cursorPos - 1);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }

    // Handle edge name entry completion
    if (enteringEdgeName && pendingToken) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        const cursorPos = range.startOffset;
        // Check if a non-alphanumeric was typed (ends edge name)
        if (cursorPos > 0) {
          const lastChar = text[cursorPos - 1];
          if (!/[a-zA-Z0-9]/.test(lastChar)) {
            // Remove the terminating character, complete token, re-add character
            const terminator = lastChar;
            node.textContent =
              text.slice(0, cursorPos - 1) + text.slice(cursorPos);
            range.setStart(node, cursorPos - 1);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);

            completeEdgeNameEntry();

            // Re-insert the terminator if it's not a space
            if (terminator !== ' ') {
              document.execCommand('insertText', false, terminator);
            }
            return;
          }
        }
      }
      return;
    }

    if (isMenuVisible) {
      // Check if trigger is still valid
      if (node !== triggerNode || !triggerNode) {
        hideMenu();
        return;
      }

      const text = triggerNode.textContent || '';
      const cursorPos = range.startOffset;

      if (cursorPos <= triggerOffset || text[triggerOffset] !== '@') {
        hideMenu();
        return;
      }

      // Check for @@ escape
      if (cursorPos > triggerOffset + 1 && text[triggerOffset + 1] === '@') {
        // Remove one @
        triggerNode.textContent =
          text.slice(0, triggerOffset) + text.slice(triggerOffset + 1);
        range.setStart(triggerNode, triggerOffset + 1);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        hideMenu();
        return;
      }

      updateFilter();
    } else if (node.nodeType === Node.TEXT_NODE) {
      // Check if @ was typed
      const text = node.textContent || '';
      const cursorPos = range.startOffset;
      if (cursorPos > 0 && text[cursorPos - 1] === '@') {
        // Check it's not preceded by alphanumeric
        if (cursorPos === 1 || !/[a-zA-Z0-9]/.test(text[cursorPos - 2])) {
          triggerNode = /** @type {Text} */ (node);
          triggerOffset = cursorPos - 1;
          filteredNames = [...petNames];
          selectedIndex = 0;
          showMenu();
          renderMenu('');
        }
      }
    }
  });

  $input.addEventListener('keydown', e => {
    // Handle Enter in edge name mode
    if (
      enteringEdgeName &&
      (e.key === 'Enter' || e.key === 'Tab' || e.key === ' ')
    ) {
      e.preventDefault();
      completeEdgeNameEntry();
      return;
    }

    if (!isMenuVisible) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (filteredNames.length > 0) {
          selectedIndex = (selectedIndex + 1) % filteredNames.length;
          updateFilter();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (filteredNames.length > 0) {
          selectedIndex =
            (selectedIndex - 1 + filteredNames.length) % filteredNames.length;
          updateFilter();
        }
        break;

      case 'Tab':
      case 'Enter':
        if (filteredNames.length > 0) {
          e.preventDefault();
          insertToken(filteredNames[selectedIndex], '');
        }
        break;

      case ':':
        if (filteredNames.length > 0) {
          e.preventDefault();
          startEdgeNameEntry(filteredNames[selectedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        hideMenu();
        break;

      case 'Backspace': {
        const sel = window.getSelection();
        if (sel && sel.rangeCount && triggerNode) {
          const range = sel.getRangeAt(0);
          if (
            range.startContainer === triggerNode &&
            range.startOffset === triggerOffset + 1
          ) {
            e.preventDefault();
            hideMenu();
          }
        }
        break;
      }

      default:
        break;
    }
  });

  // Close menu on outside click
  document.addEventListener('click', e => {
    if (
      isMenuVisible &&
      !$menu.contains(/** @type {Node} */ (e.target)) &&
      e.target !== $input
    ) {
      hideMenu();
    }
  });

  // Close on blur
  $input.addEventListener('blur', () => {
    setTimeout(() => {
      if (isMenuVisible && document.activeElement !== $input) {
        hideMenu();
      }
      if (enteringEdgeName) {
        completeEdgeNameEntry();
      }
    }, 150);
  });

  /**
   * Insert a token programmatically at the current cursor or start.
   * @param {string} petName
   */
  const insertTokenAtCursor = petName => {
    // Ensure input has focus
    $input.focus();

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);

    // Create token element
    const $token = createTokenElement(petName, petName);
    const $space = document.createTextNode(' ');

    range.insertNode($space);
    range.insertNode($token);

    // Move cursor after space
    range.setStartAfter($space);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  return {
    getMessage,
    clear,
    isMenuVisible: () => isMenuVisible || enteringEdgeName,
    insertTokenAtCursor,
  };
};
