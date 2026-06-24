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
 * @typedef {object} EditableLine
 * @property {HTMLElement} $node - The persistent host-owned editable element.
 * @property {(atEnd?: boolean) => void} requestFocus - Focus the line, placing
 *   the caret at the end when `atEnd` (default), else at the start.
 * @property {() => void} dispose - Detach and tear down the line's listeners.
 */

/**
 * Create a persistent host-owned editable line. The returned `$node` is the
 * node the controller re-parents into a confined `[data-line-anchor]` slot.
 *
 * @param {object} options
 * @param {string} options.key - The node key this line belongs to (mirrored
 *   onto the node as `data-key` so the controller can match anchors).
 * @param {LineContent} options.initialContent - Initial `{ strings, names }`.
 * @param {(key: string, parsed: LineContent) => void} [options.onInput] - Fired
 *   on every `input` event with the freshly parsed content.
 * @param {(key: string, parsed: LineContent) => void} [options.onCommit] -
 *   Fired on `blur` with the parsed content (the edit-commit seam).
 * @returns {EditableLine}
 */
export const makeEditableLine = ({
  key,
  initialContent,
  onInput,
  onCommit,
}) => {
  const $node = document.createElement('div');
  $node.className = 'outliner-text';
  $node.contentEditable = 'true';
  $node.dataset.key = key;
  renderContent($node, initialContent);

  const handleInput = () => {
    if (onInput) onInput(key, parseContent($node));
  };
  const handleBlur = () => {
    if (onCommit) onCommit(key, parseContent($node));
  };

  $node.addEventListener('input', handleInput);
  $node.addEventListener('blur', handleBlur);

  /** @param {boolean} [atEnd] */
  const requestFocus = (atEnd = true) => {
    $node.focus();
    // Caret placement uses the real Selection/Range API — legitimate here
    // because this node is host-owned, never confined.
    const selection =
      typeof getSelection === 'function' ? getSelection() : null;
    if (!selection || typeof document.createRange !== 'function') return;
    const range = document.createRange();
    range.selectNodeContents($node);
    range.collapse(!atEnd);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const dispose = () => {
    $node.removeEventListener('input', handleInput);
    $node.removeEventListener('blur', handleBlur);
    if ($node.parentElement) {
      $node.parentElement.removeChild($node);
    }
  };

  // NOT `harden`-ed: the returned handle carries the live `$node` DOM element,
  // and deep-freezing a host DOM node throws (it is a non-extensible host
  // proxy). The methods are hardened individually; the host owns this handle.
  harden(requestFocus);
  harden(dispose);
  return { $node, requestFocus, dispose };
};
harden(makeEditableLine);
