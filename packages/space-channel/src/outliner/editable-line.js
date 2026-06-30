// @ts-check

import harden from '@endo/harden';

// HOST-SIDE editable-line island for the outliner migration (Phase 0). This is
// trusted host code, NOT a confined component: it creates and owns a persistent
// `contentEditable` `<div class="outliner-text">` node that the host controller
// re-parents into the confined tree's `[data-line-anchor]` slot after each
// render. Because the host owns this node outright, ambient `document` /
// `getSelection` are legitimate here — and the live caret/selection survive
// confined re-renders since Preact never diffs this DOM.
//
// The content model is `{ strings, names }`: `strings` are plain-text runs and
// `names` are pet-name token chips interleaved between them. `parseContent`
// (DOM → structured) and `renderContent` (structured → DOM) are minimal ports
// of `parseNodeContent` (outliner-component.js:422) and `renderNodeContent`
// (:471).

/**
 * @typedef {object} LineContent
 * @property {string[]} strings - Plain-text runs, one more than `names`.
 * @property {string[]} names - Pet-name token chips interleaved between runs.
 */

/**
 * Render structured content into a `contentEditable` element as text nodes
 * interleaved with `span.chat-token[contenteditable=false]` chips. Minimal port
 * of `renderNodeContent` (outliner-component.js:471).
 *
 * @param {HTMLElement} $text
 * @param {LineContent} content
 */
const renderContent = ($text, content) => {
  $text.innerHTML = '';
  const { strings, names } = content;
  if (!names || names.length === 0) {
    $text.textContent = strings.join('');
    return;
  }
  for (let i = 0; i < strings.length; i += 1) {
    if (strings[i]) {
      $text.appendChild(document.createTextNode(strings[i]));
    }
    if (i < names.length) {
      const name = names[i];
      const $token = document.createElement('span');
      $token.className = 'chat-token';
      $token.contentEditable = 'false';
      $token.dataset.petName = name;
      $token.dataset.edgeName = name;
      const $tokenName = document.createElement('span');
      $tokenName.className = 'token-name';
      $tokenName.textContent = name;
      $token.appendChild($tokenName);
      $text.appendChild($token);
    }
  }
};
harden(renderContent);

/**
 * Parse a `contentEditable` element's DOM into structured content. Minimal port
 * of `parseNodeContent` (outliner-component.js:422): text nodes accumulate into
 * `strings`; `span.chat-token` elements split a run and contribute a name.
 *
 * @param {HTMLElement} $text
 * @returns {LineContent}
 */
const parseContent = $text => {
  /** @type {string[]} */
  const strings = [];
  /** @type {string[]} */
  const names = [];
  let currentText = '';

  /** @param {Node} node */
  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      currentText += (node.textContent || '').replace(/\u200B/g, '');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = /** @type {HTMLElement} */ (node);
      if (el.classList.contains('chat-token')) {
        strings.push(currentText);
        currentText = '';
        names.push(el.dataset.petName || '');
      } else {
        for (const child of node.childNodes) {
          walk(child);
        }
      }
    }
  };

  for (const child of $text.childNodes) {
    walk(child);
  }
  strings.push(currentText);

  // Trim leading/trailing whitespace on the outer runs, matching the original.
  const trimmedStrings = strings.map((s, i) => {
    if (i === 0) return s.trimStart();
    if (i === strings.length - 1) return s.trimEnd();
    return s;
  });

  return { strings: trimmedStrings, names };
};
harden(parseContent);

/**
 * The caret position within a line, computed island-side from the real
 * Selection/Range. Mirrors `getCursorPosition` (outliner-component.js:407).
 *
 * @typedef {object} CaretPosition
 * @property {number} position - Caret text offset from the start of the line.
 * @property {boolean} atStart - Whether the caret is at offset 0.
 * @property {boolean} atEnd - Whether the caret is at (or past) the last offset.
 */

/**
 * Read the caret position inside `$node` from the real Selection/Range API.
 * Legitimate here because this node is host-owned, never confined; the booleans
 * are the only thing that crosses the seam. Mirrors `getCursorPosition`
 * (outliner-component.js:407): if the selection is missing or anchored outside
 * the line we treat the caret as both at the start AND the end (the original's
 * conservative default), so a blurred line never spuriously triggers a
 * cross-node arrow.
 *
 * @param {HTMLElement} $node
 * @returns {CaretPosition}
 */
const readCaret = $node => {
  const selection =
    typeof window !== 'undefined' && typeof window.getSelection === 'function'
      ? window.getSelection()
      : null;
  if (
    !selection ||
    selection.rangeCount === 0 ||
    typeof document.createRange !== 'function' ||
    !$node.contains(/** @type {Node} */ (selection.anchorNode))
  ) {
    return { position: 0, atStart: true, atEnd: true };
  }
  const range = document.createRange();
  range.selectNodeContents($node);
  range.setEnd(
    /** @type {Node} */ (selection.anchorNode),
    selection.anchorOffset,
  );
  const position = range.toString().length;
  const textLength = ($node.textContent || '').length;
  return {
    position,
    atStart: position === 0,
    atEnd: position >= textLength,
  };
};
harden(readCaret);

/**
 * The intent payload raised on Enter. Booleans are computed island-side from
 * the real caret; `parsed` is the structured content (never DOM).
 *
 * @typedef {object} EnterIntent
 * @property {boolean} atStart - Caret at the start of the line.
 * @property {boolean} atEnd - Caret at the end of the line.
 * @property {LineContent} parsed - Parsed structured content.
 */

/**
 * Detect a slash-command trigger at the start of the line. Mirrors
 * `checkSlashTrigger` (outliner-component.js:1709): if the (left-trimmed) text
 * starts with `/`, the query is the remainder after the slash; otherwise there
 * is no trigger. We only fire the trigger off the leading run (the chip-free
 * prefix), matching the original which read `$text.textContent`.
 *
 * @param {HTMLElement} $node
 * @returns {string | null} The query (text after `/`), or `null` when no
 *   trigger is active.
 */
const detectSlashQuery = $node => {
  const text = ($node.textContent || '').trimStart();
  if (text.startsWith('/')) {
    return text.slice(1);
  }
  return null;
};
harden(detectSlashQuery);

/**
 * @typedef {object} EditableLine
 * @property {HTMLElement} $node - The persistent host-owned editable element.
 *   This is also the `$text` the controller attaches token autocomplete onto.
 * @property {(arg?: boolean | { atEnd?: boolean, column?: number }) => void} requestFocus -
 *   Focus the line and place the caret. Pass a boolean (`true` = end, the
 *   default; `false` = start) or `{ atEnd, column }`. When a `column` is given
 *   the caret is placed at that text offset (clamped to the line length); this
 *   is how a cross-node arrow lands the caret near the same column.
 * @property {(content: LineContent) => void} update - Re-render the line's
 *   content in place (for an effective-content change underneath an UNEDITED
 *   line). The controller must NOT call this on the line being edited; doing so
 *   would clobber the caret (the `editingKey` guard enforces this).
 * @property {(open: boolean) => void} setSlashOpen - Tell the island whether the
 *   controller's slash menu is currently open for THIS line. While open, the
 *   island routes ArrowUp/Down/Enter/Tab/Escape to `onSlashNav` (early-return)
 *   instead of its own keyboard intents — the island still owns the caret, the
 *   controller owns the menu state (§ slash menu coordination).
 * @property {() => void} clearSlashText - Clear the line's text (used after a
 *   slash command is applied; mirrors `applySlashCommand`'s
 *   `$text.textContent = ''`, outliner-component.js:1571) and refocus.
 * @property {() => void} dispose - Detach and tear down the line's listeners.
 */

/**
 * Create a persistent host-owned editable line. The returned `$node` is the
 * node the controller re-parents into a confined `[data-line-anchor]` slot.
 *
 * The keyboard handler computes STRUCTURED intent island-side (from the real
 * Selection/caret — legitimate here, this node is host code) and raises the OUT
 * callbacks; it NEVER mutates sibling nodes or reaches another line's DOM. The
 * controller is the only authority on document order, so cross-node caret
 * movement (Up/Down at an edge) is reported as `onCaretArrow` and the controller
 * routes `requestFocus` to the neighbor it computes from the snapshot (§3.4).
 *
 * @param {object} options
 * @param {string} options.key - The node key this line belongs to (mirrored
 *   onto the node as `data-key` so the controller can match anchors).
 * @param {LineContent} options.initialContent - Initial `{ strings, names }`.
 * @param {boolean} [options.isDraft] - Whether this line backs a draft node;
 *   drives the Backspace-on-empty semantics (a draft is removed even when it is
 *   the only/last line, a committed node fires the delete intent).
 * @param {(key: string) => void} [options.onFocus] - Fired on `focus`; the
 *   controller marks this the `editingKey` and clears the selection (§3.4.3).
 * @param {(key: string, parsed: LineContent) => void} [options.onInput] - Fired
 *   on every `input` event with the freshly parsed content (suppressed mid-IME).
 * @param {(key: string, parsed: LineContent) => void} [options.onCommit] -
 *   Fired on `blur` with the parsed content (the edit-commit seam; suppressed
 *   mid-IME).
 * @param {(key: string, intent: EnterIntent) => void} [options.onEnter] - Fired
 *   on Enter (without Shift); `preventDefault` is called. The controller decides
 *   child-draft (atEnd) vs before-sibling-draft (atStart).
 * @param {(key: string) => void} [options.onBackspaceEmpty] - Fired on Backspace
 *   when the line is empty (`preventDefault` is called). Committed → delete;
 *   draft → remove. The controller focuses the previous visible line.
 * @param {(key: string) => void} [options.onIndent] - Fired on Tab
 *   (`preventDefault`); the controller reparents under the previous sibling.
 * @param {(key: string) => void} [options.onDedent] - Fired on Shift+Tab
 *   (`preventDefault`); the controller reparents to the grandparent level.
 * @param {(key: string, dir: 'up' | 'down', info: { column: number }) => void} [options.onCaretArrow] -
 *   Fired on ArrowUp at the line start / ArrowDown at the line end
 *   (`preventDefault`); the controller moves the caret to the neighbor it
 *   computes from the snapshot. Otherwise the arrow moves natively.
 * @param {(key: string, query: string | null) => void} [options.onSlashQuery] -
 *   Fired on `input` (and `focus`) with the slash-command query (text after a
 *   leading `/`), or `null` when no trigger is active. The controller holds the
 *   confined slash-menu state; the island only detects the trigger string from
 *   its own caret (it never scrapes sibling DOM). Mirrors `checkSlashTrigger`
 *   (outliner-component.js:1709).
 * @param {(key: string, action: 'up' | 'down' | 'select' | 'cancel') => void} [options.onSlashNav] -
 *   Fired while the slash menu is open (after `setSlashOpen(true)`) for the
 *   navigation keys (ArrowUp/Down → move, Enter/Tab → select, Escape → cancel);
 *   `preventDefault` is called and the island's own keyboard intents are
 *   skipped. Mirrors the early-return of `handleSlashMenuKeydown`
 *   (outliner-component.js:1665).
 * @returns {EditableLine}
 */
export const makeEditableLine = ({
  key,
  initialContent,
  isDraft = false,
  onFocus,
  onInput,
  onCommit,
  onEnter,
  onBackspaceEmpty,
  onIndent,
  onDedent,
  onCaretArrow,
  onSlashQuery,
  onSlashNav,
}) => {
  const $node = document.createElement('div');
  $node.className = 'outliner-text';
  $node.contentEditable = 'true';
  $node.dataset.key = key;
  renderContent($node, initialContent);

  // IME / composition guard (§7): while the user is composing (e.g. an IME
  // candidate window is open) we must not parse, commit, or act on keydown —
  // the DOM is mid-mutation and the keystrokes belong to the IME. Tracked from
  // the real composition events on the host-owned node.
  let composing = false;
  // Whether the controller's slash menu is open for this line. While open, the
  // island routes the navigation keys to `onSlashNav` instead of acting on
  // them itself (the original `handleSlashMenuKeydown` early-return).
  let slashOpen = false;

  // Detect + emit the slash-command trigger. The island only reports the query
  // string; the controller owns the menu. Shared by `input` and `focus`.
  const emitSlashQuery = () => {
    if (onSlashQuery) onSlashQuery(key, detectSlashQuery($node));
  };

  const handleCompositionStart = () => {
    composing = true;
  };
  const handleCompositionEnd = () => {
    composing = false;
    // A composition just finished; surface the now-stable content.
    if (onInput) onInput(key, parseContent($node));
    emitSlashQuery();
  };

  const handleFocus = () => {
    if (onFocus) onFocus(key);
    emitSlashQuery();
  };
  const handleInput = () => {
    if (composing) return;
    if (onInput) onInput(key, parseContent($node));
    emitSlashQuery();
  };
  const handleBlur = () => {
    if (composing) return;
    if (onCommit) onCommit(key, parseContent($node));
  };

  /** @param {KeyboardEvent} e */
  const handleKeydown = e => {
    // Never act mid-composition: an IME may emit Enter/Backspace/arrows to
    // navigate its own candidate list (`e.isComposing` covers the keydown that
    // ends a composition, which `compositionend` has not yet cleared).
    if (composing || e.isComposing) return;

    // Slash menu open: route the navigation keys to the controller and skip the
    // island's own intents (the `handleSlashMenuKeydown` early-return,
    // outliner-component.js:1665). The island still owns the caret; the
    // controller owns the menu state.
    if (slashOpen && onSlashNav) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        onSlashNav(key, 'down');
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        onSlashNav(key, 'up');
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        onSlashNav(key, 'select');
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onSlashNav(key, 'cancel');
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const { atStart, atEnd } = readCaret($node);
      if (onEnter) {
        onEnter(key, { atStart, atEnd, parsed: parseContent($node) });
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (onDedent) onDedent(key);
      } else if (onIndent) {
        onIndent(key);
      }
      return;
    }

    if (e.key === 'Backspace') {
      // Backspace deletes the node only when the line is empty; a non-empty
      // line falls through to the native character delete. Matches the original
      // committed (1790) and draft (2121) handlers, which key off
      // `$text.textContent === ''`.
      if (($node.textContent || '') === '') {
        e.preventDefault();
        if (onBackspaceEmpty) onBackspaceEmpty(key);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      const { atStart, position } = readCaret($node);
      if (atStart) {
        e.preventDefault();
        if (onCaretArrow) onCaretArrow(key, 'up', { column: position });
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      const { atEnd, position } = readCaret($node);
      if (atEnd) {
        e.preventDefault();
        if (onCaretArrow) onCaretArrow(key, 'down', { column: position });
      }
    }
  };

  $node.addEventListener('focus', handleFocus);
  $node.addEventListener('input', handleInput);
  $node.addEventListener('blur', handleBlur);
  $node.addEventListener('keydown', handleKeydown);
  $node.addEventListener('compositionstart', handleCompositionStart);
  $node.addEventListener('compositionend', handleCompositionEnd);

  /**
   * Place the caret inside the line. Pass `true`/`false` for end/start, or
   * `{ atEnd, column }` to land at a specific text offset (used by cross-node
   * arrow routing). Caret placement uses the real Selection/Range API —
   * legitimate here because this node is host-owned, never confined.
   *
   * @param {boolean | { atEnd?: boolean, column?: number }} [arg]
   */
  const requestFocus = (arg = true) => {
    $node.focus();
    const selection =
      typeof window !== 'undefined' && typeof window.getSelection === 'function'
        ? window.getSelection()
        : null;
    if (!selection || typeof document.createRange !== 'function') return;

    const opts = typeof arg === 'boolean' ? { atEnd: arg } : arg;
    const range = document.createRange();
    range.selectNodeContents($node);

    if (typeof opts.column === 'number') {
      // Land near the requested column. happy-dom's Range cannot resolve an
      // arbitrary offset into the right text node, so guard and fall back to a
      // collapse on failure; a real browser places the caret at the column.
      const textLength = ($node.textContent || '').length;
      const target = Math.max(0, Math.min(opts.column, textLength));
      try {
        const firstChild = $node.firstChild;
        if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
          range.setStart(firstChild, target);
          range.collapse(true);
        } else {
          range.collapse(true);
        }
      } catch {
        range.collapse(true);
      }
    } else {
      range.collapse(!opts.atEnd);
    }

    selection.removeAllRanges();
    selection.addRange(range);
  };

  /** @param {LineContent} content */
  const update = content => {
    renderContent($node, content);
  };

  /** @param {boolean} open */
  const setSlashOpen = open => {
    slashOpen = open;
  };

  // Clear the line's text after a slash command is applied, then refocus so the
  // user keeps typing into an empty line. Mirrors `applySlashCommand`
  // (outliner-component.js:1571): `$text.textContent = ''; $text.focus();`.
  const clearSlashText = () => {
    renderContent($node, { strings: [''], names: [] });
    requestFocus(true);
  };

  const dispose = () => {
    $node.removeEventListener('focus', handleFocus);
    $node.removeEventListener('input', handleInput);
    $node.removeEventListener('blur', handleBlur);
    $node.removeEventListener('keydown', handleKeydown);
    $node.removeEventListener('compositionstart', handleCompositionStart);
    $node.removeEventListener('compositionend', handleCompositionEnd);
    if ($node.parentElement) {
      $node.parentElement.removeChild($node);
    }
  };

  // `isDraft` is currently advisory metadata for the controller; the empty-line
  // Backspace semantics differ only controller-side (remove draft vs post
  // deletion), so the island raises the same `onBackspaceEmpty` either way.
  void isDraft;

  // NOT `harden`-ed: the returned handle carries the live `$node` DOM element,
  // and deep-freezing a host DOM node throws (it is a non-extensible host
  // proxy). The methods are hardened individually; the host owns this handle.
  harden(requestFocus);
  harden(update);
  harden(setSlashOpen);
  harden(clearSlashText);
  harden(dispose);
  return { $node, requestFocus, update, setSlashOpen, clearSlashText, dispose };
};
harden(makeEditableLine);
