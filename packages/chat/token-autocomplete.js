// @ts-check
/* eslint-disable no-use-before-define */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import harden from '@endo/harden';

import {
  Fragment,
  h,
  renderConfined,
  useEffect,
  useState,
} from './setup-preact-container.js';

// Token autocomplete, migrated from imperative `innerHTML`/`createElement` DOM
// to a confined Preact component rendered through a single `renderConfined`.
//
// CONFINEMENT BOUNDARY. `tokenAutocompleteComponent` is trusted host code that
// owns the contenteditable host `$input` and the dropdown container `$menu`
// imperatively, OUTSIDE the Preact tree. Contenteditable structured-message
// editing (token insertion, edge-name entry, directory drilling, message
// parsing) is irreducibly host-DOM work: it walks text nodes, manipulates the
// live `Selection`/`Range`, and inserts `chat-token` elements into `$input`.
// None of those nodes ever enter the vnode tree (refs are stripped there). Only
// the dropdown body — the filtered pet-name list, the highlighted index, and
// the keyboard hint — renders confined, into the host-provided `$menu`. The
// component receives only plain data (the filtered names, the selected index,
// the empty-state filter text) and reports row hover/click back through
// plain-data callbacks on a mutable controller.
//
// The host keeps the `.visible` class on `$menu` (its position is CSS-driven,
// as in the original) and drives keyboard navigation off the host `$input`'s
// own `keydown`, since the menu is not focusable and the caret must stay in the
// contenteditable. The selected row is scrolled into view imperatively against
// `$menu` after each render — a trusted operation on the host's own container.
//
// The exported entry keeps its exact signature
// (`tokenAutocompleteComponent($input, $menu, { E, iterateReader, powers,
// externalPetNames })`) and hardened control object
// (`{ getMessage, clear, isMenuVisible, insertTokenAtCursor }`) so callers
// (send-form, outliner-component, inline-command-form) need no changes.

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
 * Plain-data view state pushed into the confined dropdown.
 *
 * @typedef {object} TokenMenuState
 * @property {string[]} names - The filtered pet-name list.
 * @property {number} selectedIndex - Index of the highlighted name.
 * @property {string} filterText - The active filter (for the empty-state label).
 */

/**
 * Mutable bridge between the host controller and the root component. The
 * component writes its state setter; the host writes the row callbacks. Not
 * hardened — both sides assign onto it.
 *
 * @typedef {object} TokenMenuController
 * @property {(s: TokenMenuState | null) => void} [setState]
 * @property {(index: number) => void} [onHover]
 * @property {(name: string) => void} [onPick]
 */

/**
 * One pet-name row. `@`-prefixed special names render verbatim; ordinary names
 * get a leading `@` from the `token-prefix` span, matching the original markup.
 * Hovering highlights the row, clicking inserts the token. Event handlers
 * receive a frozen SafeEvent (no DOM nodes).
 *
 * @param {object} props
 * @param {string} props.name
 * @param {number} props.index
 * @param {boolean} props.selected
 * @param {(index: number) => void} props.onHover
 * @param {(name: string) => void} props.onPick
 */
const TokenItem = ({ name, index, selected, onHover, onPick }) =>
  h(
    'div',
    {
      class: selected ? 'token-menu-item selected' : 'token-menu-item',
      onMouseEnter: () => onHover(index),
      /** @param {{ preventDefault: () => void }} e */
      onClick: e => {
        e.preventDefault();
        onPick(name);
      },
    },
    name.startsWith('@')
      ? name
      : h(Fragment, null, h('span', { class: 'token-prefix' }, '@'), name),
  );
harden(TokenItem);

/**
 * The dropdown body: either the name rows or an empty-state message, followed
 * by the keyboard-hint footer. Pure view over plain-data state.
 *
 * @param {object} props
 * @param {TokenMenuState} props.state
 * @param {(index: number) => void} props.onHover
 * @param {(name: string) => void} props.onPick
 */
const TokenMenu = ({ state, onHover, onPick }) => {
  const { names, selectedIndex, filterText } = state;
  return h(
    Fragment,
    null,
    names.length === 0
      ? h(
          'div',
          { class: 'token-menu-empty' },
          filterText ? 'No matches' : 'No pet names',
        )
      : names.map((name, index) =>
          h(TokenItem, {
            key: name,
            name,
            index,
            selected: index === selectedIndex,
            onHover,
            onPick,
          }),
        ),
    // The keyboard-hint footer, rendered as real <kbd> vnodes (the confined
    // renderer strips dangerouslySetInnerHTML), reproducing the original
    // markup.
    h(
      'div',
      { class: 'token-menu-hint' },
      h('kbd', null, '↑↓'),
      ' navigate · ',
      h('kbd', null, 'Tab'),
      '/',
      h('kbd', null, 'Enter'),
      ' select · ',
      h('kbd', null, '/'),
      ' drill down · ',
      h('kbd', null, ':'),
      ' add label · ',
      h('kbd', null, 'Esc'),
      ' cancel',
    ),
  );
};
harden(TokenMenu);

/**
 * Root component: owns the dropdown's view state and exposes its setter to the
 * host via a mutable controller. Renders nothing while hidden so the container
 * is empty, matching the original `innerHTML = ''` teardown.
 *
 * @param {object} props
 * @param {TokenMenuController} props.controller
 */
const TokenAutocompleteRoot = ({ controller }) => {
  const [state, setState] = useState(
    /** @type {TokenMenuState | null} */ (null),
  );

  useEffect(() => {
    controller.setState = setState;
    return () => {
      if (controller.setState === setState) delete controller.setState;
    };
  }, [controller]);

  if (!state) {
    return null;
  }

  return h(TokenMenu, {
    state,
    onHover: index => {
      if (controller.onHover) controller.onHover(index);
    },
    onPick: name => {
      if (controller.onPick) controller.onPick(name);
    },
  });
};
harden(TokenAutocompleteRoot);

/**
 * Token autocomplete and structured message component for contenteditable input.
 *
 * @param {HTMLElement} $input - The contenteditable div
 * @param {HTMLElement} $menu - The autocomplete menu container
 * @param {object} options
 * @param {typeof import('@endo/far').E} options.E - Eventual send function
 * @param {(ref: unknown) => AsyncIterable<unknown>} options.iterateReader - Ref iterator factory
 * @param {ERef<EndoHost>} options.powers - Powers object for following name changes
 * @param {string[]} [options.externalPetNames] - Pre-managed pet names array (skips followNameChanges subscription)
 * @returns {TokenAutocompleteAPI}
 */
export const tokenAutocompleteComponent = (
  $input,
  $menu,
  { E, iterateReader, powers, externalPetNames },
) => {
  /** @type {string[]} */
  // eslint-disable-next-line prefer-const
  let petNames = externalPetNames || [];
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
  /** @type {(() => void) | undefined} */
  let doUpdateFilter;
  // When true, mouseenter on menu items is suppressed to avoid resetting
  // the keyboard-driven selectedIndex during DOM rebuilds.
  let keyboardNav = false;

  // Path drilling state: when the user presses / in the menu, we lock in
  // the selected name as a path prefix and fetch sub-directory names.
  /** @type {string[]} */
  let pathPrefix = [];
  /** @type {string[] | null} */
  let directoryNames = null;

  // Mutable bridge to the root component's state setter (populated by the
  // component's effect). Intentionally NOT hardened — the component writes its
  // setter and the host writes the row callbacks onto it.
  /** @type {TokenMenuController} */
  const controller = {};

  // Subscribe to inventory changes (skip if external names are provided)
  if (!externalPetNames) {
    (async () => {
      for await (const change of iterateReader(E(powers).followNameChanges())) {
        if ('add' in /** @type {object} */ (change)) {
          petNames.push(/** @type {{ add: string }} */ (change).add);
          petNames.sort();
        } else if ('remove' in /** @type {object} */ (change)) {
          const idx = petNames.indexOf(
            /** @type {{ remove: string }} */ (change).remove,
          );
          if (idx !== -1) {
            petNames.splice(idx, 1);
          }
        }
        if (isMenuVisible && doUpdateFilter) {
          doUpdateFilter();
        }
      }
    })().catch(window.reportError);
  }

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
    pathPrefix = [];
    directoryNames = null;
    if (controller.setState) {
      controller.setState(null);
    }
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

  /**
   * Get the partial text after the last `/` (or after `@` if no path).
   * @returns {string}
   */
  const getPartialFilter = () => {
    const full = getFilterText();
    const slashIdx = full.lastIndexOf('/');
    return slashIdx === -1 ? full : full.slice(slashIdx + 1);
  };

  /**
   * Push the current filter/selection state into the confined dropdown as plain
   * data and, once Preact has flushed, scroll the highlighted row into view.
   * The scroll-into-view query reads the host's own container — a trusted,
   * imperative operation outside the vnode tree.
   *
   * @param {string} filterText
   */
  const render = filterText => {
    if (controller.setState) {
      controller.setState(
        harden({
          names: [...filteredNames],
          selectedIndex,
          filterText,
        }),
      );
    }
    const $selected = $menu.querySelector('.token-menu-item.selected');
    if ($selected) {
      $selected.scrollIntoView({ block: 'nearest' });
    }
  };

  const updateFilter = () => {
    const filterText = getPartialFilter();
    const names = directoryNames || petNames;

    filteredNames = names.filter(name => {
      const lower = name.toLowerCase();
      if (lower.startsWith(filterText)) return true;
      // Allow matching @-prefixed special names by the part after @
      if (lower.startsWith('@') && lower.slice(1).startsWith(filterText)) {
        return true;
      }
      return false;
    });

    if (selectedIndex >= filteredNames.length) {
      selectedIndex = Math.max(0, filteredNames.length - 1);
    }

    render(filterText);
  };
  doUpdateFilter = updateFilter;

  // Row callbacks the confined tree invokes with plain-data indices/names.
  controller.onHover = index => {
    if (keyboardNav) return;
    selectedIndex = index;
    render(getPartialFilter());
  };
  controller.onPick = name => {
    insertToken(name, '');
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
   * Drill into a directory: accept the selected name, extend the path prefix,
   * replace the trigger text with the path so far, and fetch sub-directory
   * names for the next level of completion.
   *
   * @param {string} selectedName
   */
  const drillDown = async selectedName => {
    pathPrefix = [...pathPrefix, selectedName];

    // Replace the filter text with the confirmed path + trailing /
    if (!triggerNode) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const fullText = triggerNode.textContent || '';
    const cursorOffset = range.startOffset;

    const beforeTrigger = fullText.slice(0, triggerOffset + 1); // includes @
    const afterCursor = fullText.slice(cursorOffset);
    const confirmedPath = `${pathPrefix.join('/')}/`;
    const newText = `${beforeTrigger}${confirmedPath}${afterCursor}`;

    triggerNode.textContent = newText;

    // Position cursor right after the trailing /
    const newCursorPos = triggerOffset + 1 + confirmedPath.length;
    const newRange = document.createRange();
    newRange.setStart(triggerNode, newCursorPos);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    // Fetch sub-directory names
    try {
      const target = /** @type {{ lookup: (...path: string[]) => unknown }} */ (
        E(powers)
      ).lookup(...pathPrefix);
      const namesP =
        /** @type {{ list: () => Promise<AsyncIterable<string>> }} */ (
          E(target)
        ).list();
      const names = await namesP;
      /** @type {string[]} */
      const result = [];
      for await (const name of names) {
        result.push(name);
      }
      directoryNames = result.sort();
    } catch {
      directoryNames = [];
    }

    selectedIndex = 0;
    updateFilter();
  };

  /**
   * Insert a token at the current trigger position.
   * @param {string} petName
   * @param {string} edgeName
   */
  const insertToken = (petName, edgeName) => {
    // Build the full path pet name when drilling into directories.
    const fullPetName =
      pathPrefix.length > 0 ? `${pathPrefix.join('/')}/${petName}` : petName;

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
    const $token = createTokenElement(fullPetName, edgeName || fullPetName);

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
    // Build the full path pet name when drilling into directories.
    const fullPetName =
      pathPrefix.length > 0 ? `${pathPrefix.join('/')}/${petName}` : petName;

    if (!triggerNode) return;

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const fullText = triggerNode.textContent || '';
    const cursorOffset = range.startOffset;

    // Replace @filter with @fullPetName: in the text
    const beforeText = fullText.slice(0, triggerOffset);
    const afterText = fullText.slice(cursorOffset);
    const newText = `${beforeText}@${fullPetName}:${afterText}`;

    triggerNode.textContent = newText;

    // Position cursor after the colon
    const newCursorPos = triggerOffset + fullPetName.length + 2; // +2 for @ and :
    const newRange = document.createRange();
    newRange.setStart(triggerNode, newCursorPos);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    // Save trigger state before hideMenu() clears it.
    const savedTriggerNode = triggerNode;
    const savedTriggerOffset = triggerOffset;
    hideMenu();
    triggerNode = savedTriggerNode;
    triggerOffset = savedTriggerOffset;
    enteringEdgeName = true;
    pendingToken = { petName: fullPetName, edgeName: '' };
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
    // Dispatch input event to notify listeners
    $input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // Handle input events
  $input.addEventListener('input', () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const node = range.startContainer;

    // Remove space before punctuation after token completion
    if (
      node.nodeType === Node.TEXT_NODE &&
      !enteringEdgeName &&
      !isMenuVisible
    ) {
      const text = node.textContent || '';
      const cursorPos = range.startOffset;
      // Check if we just typed punctuation after " " that follows a token
      if (
        cursorPos >= 2 &&
        /[.,!?;:)]/.test(text[cursorPos - 1]) &&
        text[cursorPos - 2] === ' '
      ) {
        // Check if the space is right after a token
        const prevSibling = node.previousSibling;
        if (
          prevSibling &&
          /** @type {HTMLElement} */ (prevSibling).classList?.contains(
            'chat-token',
          )
        ) {
          // Remove the space
          node.textContent =
            text.slice(0, cursorPos - 2) + text.slice(cursorPos - 1);
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
      if (
        node !== triggerNode ||
        !triggerNode ||
        range.startOffset <= triggerOffset ||
        (triggerNode.textContent || '')[triggerOffset] !== '@'
      ) {
        hideMenu();
        // Fall through to @ detection below — the user may have
        // typed @ immediately after the old trigger became invalid.
      } else {
        updateFilter();
        return;
      }
    }

    {
      // Check if @ was typed. The cursor may be in a text node or
      // at an element boundary (common after token insert/delete),
      // so resolve to the actual text node first.
      let textNode = node;
      let cursorPos = range.startOffset;
      if (textNode.nodeType !== Node.TEXT_NODE) {
        // Cursor is at an element offset — find the adjacent text node
        const child =
          cursorPos > 0
            ? textNode.childNodes[cursorPos - 1]
            : textNode.childNodes[0];
        if (child && child.nodeType === Node.TEXT_NODE) {
          textNode = child;
          cursorPos = (textNode.textContent || '').length;
        }
      }
      if (textNode.nodeType === Node.TEXT_NODE) {
        const text = textNode.textContent || '';
        if (cursorPos > 0 && text[cursorPos - 1] === '@') {
          // Check it's not preceded by alphanumeric
          if (cursorPos === 1 || !/[a-zA-Z0-9]/.test(text[cursorPos - 2])) {
            triggerNode = /** @type {Text} */ (textNode);
            triggerOffset = cursorPos - 1;
            filteredNames = [...petNames];
            selectedIndex = 0;
            showMenu();
            render('');
          }
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

    // Handle Backspace to delete tokens when cursor is immediately after one
    if (e.key === 'Backspace' && !isMenuVisible) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        if (range.collapsed) {
          const node = range.startContainer;
          const offset = range.startOffset;

          // Case 1: Cursor at start of text node, previous sibling is a token
          if (node.nodeType === Node.TEXT_NODE && offset === 0) {
            const prev = node.previousSibling;
            if (
              prev instanceof HTMLElement &&
              prev.classList.contains('chat-token')
            ) {
              e.preventDefault();
              prev.remove();
              return;
            }
          }

          // Case 2: Cursor directly in the input element, previous child is a token
          if (node === $input && offset > 0) {
            const prev = $input.childNodes[offset - 1];
            if (
              prev instanceof HTMLElement &&
              prev.classList.contains('chat-token')
            ) {
              e.preventDefault();
              prev.remove();
              return;
            }
          }
        }
      }
    }

    if (!isMenuVisible) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        keyboardNav = true;
        if (filteredNames.length > 0) {
          selectedIndex = (selectedIndex + 1) % filteredNames.length;
          updateFilter();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        keyboardNav = true;
        if (filteredNames.length > 0) {
          selectedIndex =
            (selectedIndex - 1 + filteredNames.length) % filteredNames.length;
          updateFilter();
        }
        break;

      case 'Home':
        e.preventDefault();
        keyboardNav = true;
        if (filteredNames.length > 0) {
          selectedIndex = 0;
          updateFilter();
        }
        break;

      case 'End':
        e.preventDefault();
        keyboardNav = true;
        if (filteredNames.length > 0) {
          selectedIndex = filteredNames.length - 1;
          updateFilter();
        }
        break;

      case 'PageDown': {
        e.preventDefault();
        keyboardNav = true;
        if (filteredNames.length > 0) {
          const first = /** @type {HTMLElement | null} */ (
            $menu.querySelector('.token-menu-item')
          );
          const itemHeight = first ? first.offsetHeight : 32;
          const pageSize = Math.max(
            1,
            Math.floor($menu.clientHeight / itemHeight),
          );
          const step = Math.max(1, pageSize - 1);
          selectedIndex = Math.min(
            selectedIndex + step,
            filteredNames.length - 1,
          );
          updateFilter();
        }
        break;
      }

      case 'PageUp': {
        e.preventDefault();
        keyboardNav = true;
        if (filteredNames.length > 0) {
          const first = /** @type {HTMLElement | null} */ (
            $menu.querySelector('.token-menu-item')
          );
          const itemHeight = first ? first.offsetHeight : 32;
          const pageSize = Math.max(
            1,
            Math.floor($menu.clientHeight / itemHeight),
          );
          const step = Math.max(1, pageSize - 1);
          selectedIndex = Math.max(selectedIndex - step, 0);
          updateFilter();
        }
        break;
      }

      case 'Tab':
      case ' ':
        if (filteredNames.length > 0) {
          e.preventDefault();
          insertToken(filteredNames[selectedIndex], '');
        }
        break;

      case 'Enter':
        if (filteredNames.length > 0) {
          e.preventDefault();
          insertToken(filteredNames[selectedIndex], '');
        }
        break;

      case '/':
        if (filteredNames.length > 0) {
          e.preventDefault();
          drillDown(filteredNames[selectedIndex]);
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

  // Clear keyboard navigation flag on actual mouse movement. Reads the host's
  // own container; never crosses into the confined tree.
  $menu.addEventListener('mousemove', () => {
    keyboardNav = false;
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

  // Mount the confined dropdown into the host's container. The host owns the
  // container's `.visible` class and lifecycle; the Preact tree renders only the
  // dropdown body. Rendered once; the Root renders nothing while hidden.
  renderConfined(h(TokenAutocompleteRoot, { controller }), $menu);

  return harden({
    getMessage,
    clear,
    isMenuVisible: () => isMenuVisible || enteringEdgeName,
    insertTokenAtCursor,
  });
};
harden(tokenAutocompleteComponent);
