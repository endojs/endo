// @ts-check

/** @import { ERef } from '@endo/eventual-send' */
/** @import { EndoDiagnostics, EndoHost } from '@endo/daemon' */
/** @import { VNode } from 'preact' */
/** @import { FormulaRecord } from './formula-view.js' */

import harden from '@endo/harden';
import { E } from '@endo/eventual-send';
import { passStyleOf } from '@endo/pass-style';

import { h } from 'preact';
import { useState } from 'preact/hooks';
import { renderConfined, unmount } from '@endo/preact-container/renderer';

import { valueToVnodes } from './value-vnodes.js';
import { MarkdownFragment } from './markdown-vnodes.js';
import { inferType, toClipboardText } from './value-render.js';
import { inferLanguage } from './language-detect.js';
import { isMarkdown } from './markdown-preview.js';
import { FormulaView, humanizeName } from './formula-view.js';

// Standalone value viewer, migrated from imperative DOM (composing the
// string/DOM `value-render` via `.innerHTML`) to a confined Preact component
// rendered through a single `renderConfined`.
//
// FRAME OWNERSHIP. The component builds its own modal frame from the static
// `VALUE_FRAME_HTML` and appends it to the host container, rather than querying
// chat.js's page template. It also owns the frame's visibility (the `data-show`
// toggle that used to live in chat.js's `controlsComponent`) and removes the
// frame on `dispose()`. This carries no dependency on host markup or IDs, which
// is the precondition for extracting it into its own package later.
//
// The confined Preact tree owns ONLY the value-content surface (`#value-value`):
// the rendered passable value plus, for blob-like remotables, the inline blob
// preview, mounted into a DEDICATED `$mount` child. The title chips, the type
// `<select>`, the enter-profile button, the close/frame/escape handlers, and the
// context-aware actions (rename / adopt / save / copy) are imperative chrome the
// component drives against its own frame nodes — they were never part of
// `value-render`'s `.innerHTML` sink, so they are not a view-migration target
// here. Only the value rendering itself moves to vnodes (`valueToVnodes`), and
// the blob preview moves from `renderMarkdownToHtml`/`colorize` + `.innerHTML` to
// `MarkdownFragment` vnodes + a plain line-numbered `<pre>` (Monaco colorize of
// the source is the same deferred limitation the inbox / blob-viewer document).
//
// FORMULA BACK FACE. The modal grows a second (verso) card face that inspects
// the value's underlying daemon FORMULA, reached via the F key, the header gear
// icon, or the back-face flip button. The back face fetches the value's formula
// record through `E(powers).diagnostics()` → `getFormula(id)` and renders it through the SAME
// confined `renderConfined` boundary (`FormulaView`), so the daemon-supplied,
// untrusted property values and reference names reach the DOM only as escaped
// text — that confinement is the whole point of the conversion. Reference
// buttons navigate to the referenced formula's value (via `lookupById`), pushing
// a per-session back stack that Backspace pops. The keypair formula type's
// `privateKey` is suppressed in the registry-driven layout.
//
// The returned `{ showValue, dismissValue, dispose }` API: `showValue` reveals
// the frame and renders a value, `dismissValue` hides + resets it, `dispose`
// tears the whole frame down.

/**
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.defaultValue
 * @param {string} props.buttonText
 * @param {(name: string) => Promise<void>} props.handler
 */
const NameAction = ({ label, defaultValue, buttonText, handler }) => {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState(false);

  const submit = () => {
    const name = value.trim();
    if (!name) return;
    Promise.resolve(handler(name)).catch(err => {
      setError(true);
      setTimeout(() => setError(false), 2000);
      console.error(`Failed to ${buttonText.toLowerCase()} value:`, err);
    });
  };

  return h(
    'div',
    { class: 'value-name-form' },
    h('label', null, label),
    h('input', {
      type: 'text',
      class: 'value-name-input',
      placeholder: 'pet/name/path',
      value,
      // The confined renderer strips `ref`, so focus is requested declaratively
      // via the `autofocus` attribute; the controller queries the mounted host
      // node post-render to also `.select()` (matching the original behavior).
      autofocus: true,
      style: error ? 'border-color: #e53e3e' : undefined,
      /** @param {{ target: { value: string } }} event */
      onInput: event => setValue(event.target.value),
      /** @param {{ key: string, shiftKey: boolean, preventDefault: () => void }} event */
      onKeyDown: event => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          submit();
        }
      },
    }),
    h('button', { onClick: submit }, buttonText),
  );
};
harden(NameAction);

/**
 * A "Copy" button that copies the value's clipboard text and shows transient
 * feedback. Renders nothing for non-copyable values.
 *
 * @param {object} props
 * @param {unknown} props.value
 * @param {(text: string) => Promise<void>} props.copy - Clipboard capability
 *   provided by the controller; the button never touches `navigator` itself.
 */
const CopyButton = ({ value, copy }) => {
  const text = toClipboardText(value);
  const [copied, setCopied] = useState(false);
  if (text === undefined) return null;

  return h(
    'button',
    {
      class: copied
        ? 'value-copy-button value-copy-feedback'
        : 'value-copy-button',
      onClick: () => {
        copy(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          error => {
            console.error('Failed to copy:', error);
          },
        );
      },
    },
    copied ? 'Copied!' : 'Copy',
  );
};
harden(CopyButton);

/**
 * Render the context-aware actions (rename / adopt / save plus copy) as a
 * confined Preact tree. Mirrors the original imperative action layout and class
 * names; the name input requests focus declaratively via `autofocus`, and the
 * controller queries the mounted node post-render to also select its contents.
 *
 * @param {object} props
 * @param {unknown} props.value
 * @param {string | undefined} props.id
 * @param {string[] | undefined} props.petNamePath
 * @param {{ number: bigint, edgeName: string }} [props.messageContext]
 * @param {boolean} props.isAdopted
 * @param {() => string[] | undefined} props.getCurrentPetNamePath
 * @param {ERef<EndoHost>} props.powers
 * @param {() => void} props.clearValue
 * @param {(text: string) => Promise<void>} props.copy - Clipboard capability
 */
const ValueActions = ({
  value,
  id,
  petNamePath,
  messageContext,
  isAdopted,
  getCurrentPetNamePath,
  powers,
  clearValue,
  copy,
}) => {
  let passStyle;
  try {
    passStyle = passStyleOf(value);
  } catch {
    passStyle = undefined;
  }
  const isPlainPassable =
    passStyle !== undefined &&
    passStyle !== 'remotable' &&
    passStyle !== 'promise';

  // Build the NameAction as props rendered via `h()` (NOT by calling the
  // function), so its `useState` slots live in their OWN component instance.
  // The `key` changes with the value identity, so Preact remounts NameAction
  // (fresh input default, no carried-over hook count) when chat.js calls
  // focusValue again without an intervening unmount.
  /** @type {{ key: string, label: string, defaultValue: string, buttonText: string, handler: (name: string) => Promise<void> } | null} */
  let nameActionProps = null;
  if (messageContext && !isAdopted) {
    nameActionProps = {
      key: `adopt-${String(messageContext.number)}-${messageContext.edgeName}`,
      label: 'Adopt as:',
      defaultValue: messageContext.edgeName,
      buttonText: 'Adopt',
      handler: async name => {
        const targetPath = name.split('/');
        await E(powers).adopt(
          messageContext.number,
          messageContext.edgeName,
          targetPath,
        );
        clearValue();
      },
    };
  } else if (petNamePath) {
    nameActionProps = {
      key: `rename-${petNamePath.join('/')}`,
      label: 'Rename to:',
      defaultValue: petNamePath.join('/'),
      buttonText: 'Rename',
      handler: async newName => {
        const fromPath = /** @type {string[]} */ (getCurrentPetNamePath());
        const toPath = newName.split('/');
        await E(powers).move(fromPath, toPath);
        clearValue();
      },
    };
  } else if (!id && isPlainPassable) {
    nameActionProps = {
      key: 'save',
      label: 'Save as:',
      defaultValue: '',
      buttonText: 'Save',
      handler: async name => {
        const targetPath = name.split('/');
        await E(powers).storeValue(
          /** @type {import('@endo/pass-style').Passable} */ (value),
          targetPath,
        );
        clearValue();
      },
    };
  }

  return h(
    'div',
    { class: 'value-actions-inner' },
    nameActionProps ? h(NameAction, nameActionProps) : null,
    isPlainPassable ? h(CopyButton, { value, copy }) : null,
  );
};
harden(ValueActions);

/**
 * Render blob text content with appropriate visualization based on the file
 * language. Markdown gets a rendered preview with a source toggle; other text
 * gets line-numbered preformatted source. Mirrors the original imperative
 * `renderBlobContent`, but emits vnodes (no `.innerHTML`).
 *
 * @param {object} props
 * @param {string} props.text
 * @param {string} props.language - Monaco language identifier
 */
const BlobContent = ({ text, language }) => {
  const [showSource, setShowSource] = useState(false);
  const lines = text.split('\n');

  const sourcePre = h(
    'pre',
    { class: 'value-blob-source' },
    h(
      'code',
      null,
      ...lines.map((line, i) =>
        h(
          'span',
          { class: 'value-blob-line', key: String(i) },
          h('span', { class: 'value-blob-linenum' }, String(i + 1)),
          h('span', { class: 'value-blob-linetext' }, line),
        ),
      ),
    ),
  );

  if (isMarkdown(language)) {
    return h(
      'div',
      { class: 'value-blob-content' },
      h(
        'div',
        { class: 'value-blob-toolbar' },
        h(
          'button',
          {
            class: showSource
              ? 'value-blob-toggle'
              : 'value-blob-toggle active',
            onClick: () => setShowSource(false),
          },
          'Preview',
        ),
        h(
          'button',
          {
            class: showSource
              ? 'value-blob-toggle active'
              : 'value-blob-toggle',
            onClick: () => setShowSource(true),
          },
          'Source',
        ),
      ),
      showSource
        ? sourcePre
        : h(
            'div',
            { class: 'value-blob-md-preview' },
            MarkdownFragment(text, {}),
          ),
    );
  }

  return h('div', { class: 'value-blob-content' }, sourcePre);
};
harden(BlobContent);

/**
 * The confined value-content surface: the rendered passable value, optionally
 * replaced by the inline blob preview once a blob-like remotable's text resolves.
 *
 * @param {object} props
 * @param {unknown} props.value
 * @param {string | undefined} props.blobText - Resolved blob text, or undefined.
 * @param {string} props.language - Inferred Monaco language for blob content.
 */
const ValueContent = ({ value, blobText, language }) => {
  if (blobText !== undefined) {
    return h(BlobContent, { text: blobText, language });
  }
  return valueToVnodes(value);
};
harden(ValueContent);

/**
 * Render a readable tree's entries as a confined list of navigation buttons. A
 * readable-tree's children live in its immutable content rather than its formula
 * record, so the names are read live (via `list()`) and passed in here; clicking
 * a button asks the controller to drill into that entry.
 *
 * @param {object} props
 * @param {string[]} props.names
 * @param {(name: string) => void} props.onSelect
 * @returns {VNode}
 */
const TreeChildren = ({ names, onSelect }) => {
  if (!names || names.length === 0) {
    return h(
      'div',
      { class: 'value-tree' },
      h('div', { class: 'value-tree-empty' }, '(empty tree)'),
    );
  }
  return h(
    'div',
    { class: 'value-tree' },
    h(
      'div',
      { class: 'value-tree-children' },
      ...names.map(name =>
        h(
          'button',
          {
            class: 'value-tree-child',
            key: name,
            title: `Open ${name}`,
            onClick: () => onSelect(name),
          },
          name,
        ),
      ),
    ),
  );
};
harden(TreeChildren);

/**
 * Check if a remotable value has a `text` method, indicating it is a
 * ReadableBlob, SnapshotBlob, EndoBlob, or similar.
 *
 * @param {unknown} value
 * @returns {Promise<boolean>}
 */
const isBlobLike = async value => {
  try {
    // eslint-disable-next-line no-underscore-dangle
    const methods = await E(
      /** @type {{ __getMethodNames__: () => Promise<string[]> }} */ (value),
    ).__getMethodNames__();
    return Array.isArray(methods) && methods.includes('text');
  } catch {
    return false;
  }
};
harden(isBlobLike);

/**
 * Detect a readable-tree remotable (an immutable content tree). Trees expose
 * `list`/`lookup`/`sha256`; the `sha256` check distinguishes a tree from a live
 * directory (which exposes `followNameChanges` instead) and from a blob (which
 * exposes `text`).
 *
 * @param {unknown} value
 * @returns {Promise<boolean>}
 */
const isTreeLike = async value => {
  try {
    // eslint-disable-next-line no-underscore-dangle
    const methods = await E(
      /** @type {{ __getMethodNames__: () => Promise<string[]> }} */ (value),
    ).__getMethodNames__();
    return (
      Array.isArray(methods) &&
      methods.includes('list') &&
      methods.includes('lookup') &&
      methods.includes('sha256')
    );
  } catch {
    return false;
  }
};
harden(isTreeLike);

/**
 * Derive a filename from a pet name path for language inference. Uses the last
 * segment of the path.
 *
 * @param {string[] | undefined} petNamePath
 * @returns {string | undefined}
 */
const filenameFromPath = petNamePath => {
  if (!petNamePath || petNamePath.length === 0) return undefined;
  return petNamePath[petNamePath.length - 1];
};
harden(filenameFromPath);

// The value modal's chrome markup. Static (no interpolation), so building the
// frame from this string in the owned `$frame` element is injection-free — the
// component owns its own DOM rather than depending on chat.js's page template.
//
// The window is a flip card (`.value-card`) with a front (value) face and a
// verso (formula) face; the F key / gear / flip button rotate between them. The
// `#value-aria-live` region announces each flip for screen-reader users.
const VALUE_FRAME_HTML = `
  <div id="value-window" class="window value-card">
    <div id="value-front-face" class="value-card-face value-card-face-front">
      <div class="value-header">
        <span id="value-title" class="value-title">Value</span>
        <select id="value-type" class="value-type-select">
          <option value="unknown">Unknown</option>
          <option value="profile">Profile</option>
          <option value="directory">Directory</option>
          <option value="worker">Worker</option>
          <option value="handle">Handle</option>
          <option value="invitation">Invitation</option>
          <option value="readable">Readable</option>
          <option value="string">String</option>
          <option value="number">Number</option>
          <option value="bigint">BigInt</option>
          <option value="boolean">Boolean</option>
          <option value="symbol">Symbol</option>
          <option value="null">Null</option>
          <option value="undefined">Undefined</option>
          <option value="copyArray">Array</option>
          <option value="copyRecord">Record</option>
          <option value="error">Error</option>
          <option value="promise">Promise</option>
          <option value="remotable">Remotable</option>
        </select>
        <button id="value-flip-to-formula" class="value-flip-button" aria-label="Show formula" title="Show formula (F)">&#9881;&#65039;</button>
      </div>
      <div id="value-value"></div>
      <div class="value-actions">
        <div id="value-actions-container"></div>
        <button id="value-enter-profile" style="display: none;">Enter Profile</button>
        <button id="value-close">Close</button>
      </div>
      <div class="value-modeline">
        <span class="modeline-hint"><kbd>F</kbd> flip to formula</span>
        <span class="modeline-hint"><kbd>Shift</kbd>+<kbd>P</kbd> enter profile</span>
        <span class="modeline-hint"><kbd>Esc</kbd> close</span>
      </div>
    </div>
    <div id="value-back-face-wrap" class="value-card-face value-card-face-back" role="region" aria-labelledby="formula-view-title">
      <div class="value-back-face-header">
        <span id="value-back-title" class="value-title"></span>
        <button id="value-flip-to-value" class="value-flip-button" aria-label="Show value" title="Show value (F)">&#128260;</button>
      </div>
      <div id="value-back-face" class="value-back-face"></div>
      <div class="value-modeline">
        <span class="modeline-hint"><kbd>F</kbd> flip to value</span>
        <span class="modeline-hint"><kbd>Backspace</kbd> back</span>
        <span class="modeline-hint"><kbd>Esc</kbd> flip to value</span>
      </div>
    </div>
    <div id="value-aria-live" class="visually-hidden" aria-live="polite" aria-atomic="true"></div>
  </div>
`;

/**
 * @param {HTMLElement} $parent - Host container to mount the value frame into.
 * @param {ERef<EndoHost>} powers
 * @param {object} options
 * @param {(hostName: string) => Promise<void>} options.enterProfile
 */
export const valueComponent = ($parent, powers, { enterProfile }) => {
  // Build and own the modal frame, rather than querying chat.js's page
  // template. The component appends `$frame` to the host container and removes
  // it on `dispose()`, so it carries no dependency on host markup or IDs.
  const $document = $parent.ownerDocument;
  const $frame = /** @type {HTMLElement} */ ($document.createElement('div'));
  $frame.id = 'value-frame';
  $frame.className = 'frame';
  $frame.dataset.face = 'front';
  $frame.innerHTML = VALUE_FRAME_HTML;
  $parent.appendChild($frame);

  // `.frame[data-show='true']` reveals the overlay (default `.frame` is hidden).
  const setShown = (/** @type {boolean} */ shown) => {
    $frame.dataset.show = shown ? 'true' : 'false';
  };

  const $window = /** @type {HTMLElement} */ (
    $frame.querySelector('#value-window')
  );
  const $title = /** @type {HTMLElement} */ (
    $frame.querySelector('#value-title')
  );
  const $type = /** @type {HTMLSelectElement} */ (
    $frame.querySelector('#value-type')
  );
  const $value = /** @type {HTMLElement} */ (
    $frame.querySelector('#value-value')
  );
  const $close = /** @type {HTMLElement} */ (
    $frame.querySelector('#value-close')
  );
  const $actionsContainer = /** @type {HTMLElement} */ (
    $frame.querySelector('#value-actions-container')
  );
  const $enterProfile = /** @type {HTMLButtonElement} */ (
    $frame.querySelector('#value-enter-profile')
  );
  // Back-face (formula) chrome.
  const $flipToFormula = /** @type {HTMLButtonElement} */ (
    $frame.querySelector('#value-flip-to-formula')
  );
  const $flipToValue = /** @type {HTMLButtonElement} */ (
    $frame.querySelector('#value-flip-to-value')
  );
  const $backTitle = /** @type {HTMLElement} */ (
    $frame.querySelector('#value-back-title')
  );
  const $backFace = /** @type {HTMLElement} */ (
    $frame.querySelector('#value-back-face')
  );
  const $ariaLive = /** @type {HTMLElement} */ (
    $frame.querySelector('#value-aria-live')
  );

  // The clipboard capability lives in the trusted controller and is threaded
  // into the confined tree as a prop, so the presentational CopyButton stays
  // authority-free (it never reaches the ambient `navigator`).
  /** @param {string} clipboardText */
  const copy = clipboardText => navigator.clipboard.writeText(clipboardText);

  // Dedicated confined mounts for the value content and the context actions.
  // `renderConfined` reconciles against ALL children of its mount node, so each
  // confined surface gets its own child of the host node it renders into.
  const $valueMount = document.createElement('div');
  $value.appendChild($valueMount);
  const $actionsMount = document.createElement('div');
  $actionsContainer.appendChild($actionsMount);
  // The formula view and the (optional) readable-tree listing each get their
  // own confined child of the back face.
  const $backFaceMount = document.createElement('div');
  $backFace.appendChild($backFaceMount);
  const $backTreeMount = document.createElement('div');
  $backFace.appendChild($backTreeMount);

  /** @type {unknown} */
  let currentValue;
  /** @type {string | undefined} */
  let currentId;
  /** @type {string[] | undefined} */
  let currentPetNamePath;
  /** @type {{ number: bigint, edgeName: string } | undefined} */
  let currentMessageContext;
  /** @type {'front' | 'back'} */
  let face = 'front';
  /**
   * Per-modal-session back stack of front-face frames the user can pop back to.
   * Each entry is the seed needed to re-show that frame.
   *
   * @type {Array<{
   *   value: unknown,
   *   id: string | undefined,
   *   petNamePath: string[] | undefined,
   *   messageContext: { number: bigint, edgeName: string } | undefined,
   * }>}
   */
  let backStack = [];
  /**
   * Per-modal-session cache of the most recent FormulaRecord per id, so flipping
   * back and forth on the same value does not refetch.
   *
   * @type {Map<string, FormulaRecord>}
   */
  let formulaCache = new Map();
  /**
   * Whether a modal session is currently open. Set once when the modal first
   * shows and cleared on dismiss, so the open-time focus capture runs exactly
   * once per session rather than on every back-stack navigation (which also
   * routes through `showValue`).
   */
  let sessionActive = false;
  /**
   * The element that held focus before the modal opened (typically the command
   * input). Captured on open, blurred so the modal's window-level accelerators
   * (F to flip, Escape, …) are not also typed into it, and re-focused on close.
   *
   * @type {HTMLElement | null}
   */
  let $restoreFocus = null;

  const updateEnterProfileVisibility = () => {
    const selectedType = $type.value;
    if (
      selectedType === 'profile' &&
      currentPetNamePath &&
      currentPetNamePath.length > 0
    ) {
      $enterProfile.style.display = 'block';
    } else {
      $enterProfile.style.display = 'none';
    }
  };

  /**
   * Update the screen-reader live region.
   *
   * @param {string} text
   */
  const announce = text => {
    if (!$ariaLive) return;
    $ariaLive.textContent = text;
  };

  // Reflect the current face into the card class (the CSS rotates on
  // `.flipped`), the frame dataset, and the gear button's aria-label.
  const updateFaceClass = () => {
    if ($window) {
      $window.classList.toggle('flipped', face === 'back');
    }
    $frame.dataset.face = face;
    if ($flipToFormula) {
      $flipToFormula.setAttribute(
        'aria-label',
        face === 'front' ? 'Show formula' : 'Show value',
      );
    }
  };

  /** Derive a one-line label for the current value, used in aria announcements. */
  const valueLabel = () => {
    if (currentPetNamePath && currentPetNamePath.length > 0) {
      return `@${currentPetNamePath.join('/')}`;
    }
    if (currentId) {
      return currentId;
    }
    if (currentMessageContext) {
      return `#${currentMessageContext.number}:${currentMessageContext.edgeName}`;
    }
    return 'value';
  };

  // Hide the overlay and reset its content. The component owns the frame's
  // visibility now (it was previously a `data-show` toggle in chat.js's
  // controlsComponent), so this is the single dismissal path. Resetting the
  // back-face session state (face / back stack / formula cache) and restoring
  // pre-modal focus happen here too, so the next `showValue` starts a fresh
  // session.
  const dismissValue = () => {
    setShown(false);
    window.removeEventListener('keyup', handleKey);
    unmount($valueMount);
    unmount($actionsMount);
    unmount($backFaceMount);
    unmount($backTreeMount);
    $title.textContent = 'Value';
    if ($backTitle) $backTitle.textContent = '';
    $type.value = 'unknown';
    currentValue = undefined;
    currentId = undefined;
    currentPetNamePath = undefined;
    currentMessageContext = undefined;
    $enterProfile.style.display = 'none';
    face = 'front';
    backStack = [];
    formulaCache = new Map();
    updateFaceClass();
    // Return focus to wherever it was before the modal opened, so the user
    // lands back on the command input (or other prior control).
    sessionActive = false;
    if ($restoreFocus && $restoreFocus.isConnected) {
      $restoreFocus.focus();
    }
    $restoreFocus = null;
  };

  // Named handlers so `dispose()` can detach them.
  const onClose = () => {
    dismissValue();
  };
  const onFrameClick = event => {
    if (event.target === $frame) {
      dismissValue();
    }
  };
  const onTypeChange = () => {
    updateEnterProfileVisibility();
  };
  const onEnterProfile = async () => {
    if (!currentPetNamePath) return;
    const hostName = currentPetNamePath.join('/');
    dismissValue();
    await enterProfile(hostName);
  };
  const onFlip = () => {
    flipFace().catch(window.reportError);
  };

  $close.addEventListener('click', onClose);
  $frame.addEventListener('click', onFrameClick);
  $type.addEventListener('change', onTypeChange);
  $enterProfile.addEventListener('click', onEnterProfile);
  if ($flipToFormula) $flipToFormula.addEventListener('click', onFlip);
  if ($flipToValue) $flipToValue.addEventListener('click', onFlip);

  /**
   * Mirror the recto (value) title bar onto the verso (formula) title bar,
   * annotated with a muted "(formula)" suffix so the back face reads as the
   * formula view of the same value. Reads `$title` at call time, so it reflects
   * whatever the front face currently shows.
   */
  const syncBackTitle = () => {
    if (!$backTitle) return;
    $backTitle.innerHTML = '';
    for (const node of $title.childNodes) {
      $backTitle.appendChild(node.cloneNode(true));
    }
    const $suffix = document.createElement('span');
    $suffix.className = 'value-title-suffix';
    $suffix.textContent = ' (formula)';
    $backTitle.appendChild($suffix);
  };

  /**
   * Drill into a readable-tree entry: look it up and show it on the front face,
   * pushing the current frame so Backspace (on the formula face) returns here.
   *
   * @param {unknown} treeValue
   * @param {string[] | undefined} basePath
   * @param {string} name
   */
  const selectTreeChild = (treeValue, basePath, name) => {
    backStack.push({
      value: currentValue,
      id: currentId,
      petNamePath: currentPetNamePath,
      messageContext: currentMessageContext,
    });
    const childPath = basePath ? [...basePath, name] : [name];
    E(/** @type {{ lookup: (n: string) => Promise<unknown> }} */ (treeValue))
      .lookup(name)
      .then(child => {
        showValue(child, undefined, childPath).catch(window.reportError);
      }, window.reportError);
  };

  /**
   * Render a confined message (loading / empty / error state) into the back
   * face's primary mount, clearing any stale tree listing below it.
   *
   * @param {string} className
   * @param {string} text
   */
  const renderBackFaceMessage = (className, text) => {
    unmount($backTreeMount);
    renderConfined(h('div', { class: className }, text), $backFaceMount);
  };

  /**
   * Render the back face for the currently-focused value. Lazily fetches
   * `getFormula(id)` and caches the result per modal session. The formula record
   * — daemon-supplied and untrusted — renders through the confined `FormulaView`
   * boundary. No-op when the current value lacks an identifier (ephemeral values
   * have no formula to inspect).
   */
  const ensureBackFaceRendered = async () => {
    if (!$backFace) return;
    // Mirror the recto title onto the verso before rendering the formula body,
    // so the back face carries the same identity heading (annotated
    // "(formula)") regardless of which return path follows.
    syncBackTitle();
    if (!currentId) {
      renderBackFaceMessage(
        'formula-view-empty',
        'Ephemeral value: no formula identifier to inspect.',
      );
      return;
    }
    const id = currentId;
    /** @type {FormulaRecord | undefined} */
    let record = formulaCache.get(id);
    if (!record) {
      renderBackFaceMessage('formula-view-loading', 'Loading formula...');
      try {
        // currentId is a daemon-emitted formula identifier string;
        // EndoDiagnostics.getFormula expects the branded FormulaIdentifier
        // subtype of string. Casting via unknown bridges the brand.
        const fetched = await E(E(powers).diagnostics()).getFormula(
          /** @type {Parameters<EndoDiagnostics['getFormula']>[0]} */ (
            /** @type {unknown} */ (id)
          ),
        );
        record = /** @type {FormulaRecord} */ (fetched);
        if (record) {
          formulaCache.set(id, record);
        }
      } catch (err) {
        renderBackFaceMessage(
          'formula-view-error',
          `Could not load formula: ${/** @type {Error} */ (err).message}`,
        );
        return;
      }
    }
    // A flip-away navigation may have changed the focused value while the fetch
    // was in flight; only render if we are still on this id and face.
    if (currentId !== id || face !== 'back') return;
    if (!record) {
      renderBackFaceMessage(
        'formula-view-error',
        'Daemon returned no formula record.',
      );
      return;
    }

    unmount($backTreeMount);
    renderConfined(
      h(FormulaView, {
        record,
        onNavigateReference: async (identifier, _label) => {
          // Clicking a reference button navigates to that formula's front face.
          // The current frame is pushed onto the stack so Backspace returns here.
          backStack.push({
            value: currentValue,
            id: currentId,
            petNamePath: currentPetNamePath,
            messageContext: currentMessageContext,
          });
          try {
            const targetValue = await E(powers).lookupById(
              /** @type {Parameters<EndoHost['lookupById']>[0]} */ (
                /** @type {unknown} */ (identifier)
              ),
            );
            await showValue(targetValue, identifier);
          } catch {
            // The target is not passable over CapTP (e.g. a pet store or
            // mailbox store is a daemon-internal facet). Rather than fail,
            // present it as a remote capability on the front face; its formula
            // remains one flip away.
            await focusRemote(identifier);
          }
        },
        stackDepth: backStack.length + 1,
        stackPosition: backStack.length + 1,
      }),
      $backFaceMount,
    );

    // Move focus to the formula-view's type heading for keyboard users. The
    // initial confined render is synchronous, so the node exists now.
    const $formulaTitle = $backFaceMount.querySelector('#formula-view-title');
    if ($formulaTitle instanceof HTMLElement) {
      $formulaTitle.focus();
    }

    // A readable-tree's children live in its immutable content, not its formula
    // record, so the formula view above is empty. List the live tree entries
    // below it so the back face mirrors the front.
    const treeValue = currentValue;
    isTreeLike(treeValue).then(isTree => {
      if (!isTree) return;
      if (currentValue !== treeValue || currentId !== id) return;
      E(/** @type {{ list: () => Promise<string[]> }} */ (treeValue))
        .list()
        .then(
          names => {
            if (currentValue !== treeValue || currentId !== id) return;
            renderConfined(
              h(TreeChildren, {
                names: /** @type {string[]} */ (names) || [],
                onSelect: name =>
                  selectTreeChild(treeValue, currentPetNamePath, name),
              }),
              $backTreeMount,
            );
          },
          () => {},
        );
    });
  };

  /**
   * Present an identifier whose value cannot be brought across CapTP (a
   * daemon-internal facet such as a pet store or mailbox store) as a remote
   * capability: the front face reads "Remote <Type>" and the formula remains one
   * flip away. Keeps the modal navigable instead of failing the click.
   *
   * @param {string} identifier
   */
  const focusRemote = async identifier => {
    currentValue = undefined;
    currentId = identifier;
    currentPetNamePath = undefined;
    currentMessageContext = undefined;
    window.addEventListener('keyup', handleKey);

    // Name the capability by its formula type when the daemon can tell us; the
    // same record warms the back-face cache for a later flip.
    let typeLabel = 'Value';
    try {
      let record = formulaCache.get(identifier);
      if (!record) {
        record = /** @type {FormulaRecord} */ (
          await E(E(powers).diagnostics()).getFormula(
            /** @type {Parameters<EndoDiagnostics['getFormula']>[0]} */ (
              /** @type {unknown} */ (identifier)
            ),
          )
        );
        if (record) {
          formulaCache.set(identifier, record);
        }
      }
      if (record && record.type) {
        typeLabel = humanizeName(record.type);
      }
    } catch {
      // Leave the generic label in place.
    }
    const remoteLabel = `Remote ${typeLabel}`;

    unmount($valueMount);
    renderConfined(
      h('div', { class: 'value-remote' }, remoteLabel),
      $valueMount,
    );

    $type.value = inferType(undefined);
    $title.textContent = remoteLabel;
    unmount($actionsMount);
    updateEnterProfileVisibility();

    face = 'front';
    updateFaceClass();
  };

  /**
   * Flip from the current face to the other face, performing any lazy-load
   * needed for the back face. Idempotent within a face.
   */
  const flipFace = async () => {
    if (!$backFace) return;
    if (face === 'front') {
      face = 'back';
      updateFaceClass();
      announce(`Showing formula for ${valueLabel()}`);
      await ensureBackFaceRendered();
    } else {
      face = 'front';
      updateFaceClass();
      announce(`Showing value for ${valueLabel()}`);
      // Restore focus to the value content for keyboard users.
      if ($value instanceof HTMLElement) {
        $value.setAttribute('tabindex', '-1');
        $value.focus();
      }
    }
  };

  /** @param {KeyboardEvent} event */
  const handleKey = event => {
    const { key, repeat, metaKey, ctrlKey, altKey } = event;
    if (repeat || metaKey || ctrlKey || altKey) return;
    // Escape works from anywhere in the modal, INCLUDING a focused Save-as /
    // rename input: it dismisses the front face or flips the back face to the
    // front. Handled before the text-input guard below so a focused form field
    // does not swallow it.
    if (key === 'Escape') {
      if (face === 'back') {
        // Escape on back face flips to the front face, not close (per
        // chat-invariants.md Escape Consistency).
        flipFace().catch(window.reportError);
      } else {
        dismissValue();
      }
      event.stopPropagation();
      return;
    }
    // Ignore OTHER key events whose target is a text input (form field inside
    // the modal). Otherwise typing `F` into the rename input would flip the
    // modal.
    const target = /** @type {HTMLElement | null} */ (event.target);
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }
    if (key === 'F' || key === 'f') {
      // F is the symmetric flip accelerator: on the front face it flips to the
      // formula (back) face, and on the back face it flips to the value (front)
      // face. Both directions delegate to flipFace(), whose own toggle on the
      // `face` variable carries the bidirectional semantics.
      if ($backFace) {
        flipFace().catch(window.reportError);
        event.stopPropagation();
      }
      return;
    }
    if (key === 'P' && event.shiftKey) {
      // Shift+P: Enter Profile, when applicable. Matches the visible button's
      // enablement rules.
      if ($enterProfile.style.display !== 'none' && !$enterProfile.disabled) {
        $enterProfile.click();
        event.stopPropagation();
      }
      return;
    }
    if (key === 'Backspace' && face === 'back') {
      if (backStack.length > 0) {
        const frame = backStack.pop();
        if (frame === undefined) return;
        showValue(
          frame.value,
          frame.id,
          frame.petNamePath,
          frame.messageContext,
        ).catch(window.reportError);
        event.stopPropagation();
      }
    }
  };

  /**
   * Render the value content confined into `$valueMount`. Called once on focus
   * and again once a blob-like remotable's text resolves.
   *
   * @param {unknown} value
   * @param {string | undefined} blobText
   * @param {string} language
   */
  const renderValueContent = (value, blobText, language) => {
    renderConfined(h(ValueContent, { value, blobText, language }), $valueMount);
  };

  /**
   * @param {unknown} value
   * @param {string} [id]
   * @param {string[]} [petNamePath]
   * @param {{ number: bigint, edgeName: string }} [messageContext]
   */
  const showValue = async (value, id, petNamePath, messageContext) => {
    // On the first show of a session, capture and blur whatever held focus
    // (e.g. the command input) so keystrokes do not cascade into it while the
    // modal owns the window-level accelerators. Back-stack navigation re-enters
    // here with the session already active, so the original pre-modal focus is
    // preserved for restoration on close.
    if (!sessionActive) {
      sessionActive = true;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) {
        $restoreFocus = active;
        active.blur();
      }
    }
    setShown(true);
    currentValue = value;
    currentId = id;
    currentPetNamePath = petNamePath;
    currentMessageContext = messageContext;
    // Showing a value always lands on the front (value) face; a prior flip on a
    // popped frame must not leak through.
    face = 'front';
    updateFaceClass();
    // The back face is re-derived lazily on the next flip; clear any stale
    // formula content from a previous frame.
    unmount($backFaceMount);
    unmount($backTreeMount);
    window.addEventListener('keyup', handleKey);

    renderValueContent(value, undefined, 'plaintext');

    const inferredType = inferType(value);
    $type.value = inferredType;

    updateEnterProfileVisibility();

    // For blob-like remotables, try to render the content inline. This runs
    // asynchronously — the default value view shows while the text is fetched.
    if (inferredType === 'readable' || inferredType === 'remotable') {
      const filename = filenameFromPath(petNamePath);
      if (filename) {
        const language = inferLanguage(filename);
        isBlobLike(value).then(isBlob => {
          if (!isBlob) return;
          // Value confirmed as blob — fetch text and render.
          E(/** @type {{ text: () => Promise<unknown> }} */ (value))
            .text()
            .then(
              text => {
                // Only update if we're still showing the same value.
                if (currentValue !== value) return;
                renderValueContent(value, String(text), language);
              },
              () => {
                // text() failed — keep the default value view.
              },
            );
        });
      }
    }

    // A readable tree's children live in its immutable content rather than a
    // formula, so `valueToVnodes` renders only the bare remotable tag. List the
    // live entries in its place so the user can drill into the tree directly.
    if (inferredType === 'readable' || inferredType === 'remotable') {
      const treeValue = value;
      isTreeLike(treeValue).then(isTree => {
        if (!isTree) return;
        if (currentValue !== treeValue) return;
        E(/** @type {{ list: () => Promise<string[]> }} */ (treeValue))
          .list()
          .then(
            names => {
              if (currentValue !== treeValue) return;
              renderConfined(
                h(TreeChildren, {
                  names: /** @type {string[]} */ (names) || [],
                  onSelect: name =>
                    selectTreeChild(treeValue, petNamePath, name),
                }),
                $valueMount,
              );
            },
            () => {},
          );
      });
    }

    $title.innerHTML = '';

    /** @type {string[]} */
    let uniquePetNames = [];

    if (messageContext) {
      const $msgChip = document.createElement('span');
      $msgChip.className = 'token message-token';
      $msgChip.textContent = `#${messageContext.number}:${messageContext.edgeName}`;
      $title.appendChild($msgChip);
      $title.appendChild(document.createTextNode(' '));
    }

    if (id) {
      try {
        const petNames = await E(powers).reverseIdentify(
          /** @type {Parameters<EndoHost['reverseIdentify']>[0]} */ (
            /** @type {unknown} */ (id)
          ),
        );
        uniquePetNames = Array.from(new Set(petNames));
        for (const petName of uniquePetNames) {
          const $token = document.createElement('span');
          $token.className = 'token';
          const $name = document.createElement('b');
          $name.textContent = `@${petName}`;
          $token.appendChild($name);
          $title.appendChild($token);
          $title.appendChild(document.createTextNode(' '));
        }
        if (uniquePetNames.length === 0 && !messageContext) {
          $title.textContent = '(unnamed)';
        }
      } catch {
        if (!messageContext) {
          $title.textContent = '(unnamed)';
        }
      }
    } else if (!messageContext) {
      $title.textContent = 'Ephemeral Value';
    }

    if (!currentPetNamePath && uniquePetNames.length > 0) {
      currentPetNamePath = uniquePetNames[0].split('/');
    }

    updateEnterProfileVisibility();

    // Build context-aware actions as a confined Preact tree.
    const isAdopted = uniquePetNames.length > 0;

    renderConfined(
      h(ValueActions, {
        value,
        id,
        petNamePath,
        messageContext,
        isAdopted,
        getCurrentPetNamePath: () => currentPetNamePath,
        powers,
        clearValue: dismissValue,
        copy,
      }),
      $actionsMount,
    );

    // `renderConfined` is synchronous, so the input (if any) exists now. The
    // `autofocus` attribute requests focus; additionally select its contents,
    // matching the original imperative `$focusTarget.focus()/select()`.
    const $focusTarget = /** @type {HTMLInputElement | null} */ (
      $actionsMount.querySelector('.value-name-input')
    );
    if ($focusTarget) {
      $focusTarget.focus();
      $focusTarget.select();
    }
  };

  // Teardown contract: detach the window keyup (added while a value is shown)
  // and the frame's own listeners, unmount the confined surfaces, and remove
  // the frame this component created. The component owns its DOM, so teardown
  // leaves nothing behind — the uniform `component(props) -> cleanup` contract
  // the packaged spaces use.
  const dispose = () => {
    window.removeEventListener('keyup', handleKey);
    $close.removeEventListener('click', onClose);
    $frame.removeEventListener('click', onFrameClick);
    $type.removeEventListener('change', onTypeChange);
    $enterProfile.removeEventListener('click', onEnterProfile);
    if ($flipToFormula) $flipToFormula.removeEventListener('click', onFlip);
    if ($flipToValue) $flipToValue.removeEventListener('click', onFlip);
    unmount($valueMount);
    unmount($actionsMount);
    unmount($backFaceMount);
    unmount($backTreeMount);
    $frame.remove();
  };

  return harden({ showValue, dismissValue, dispose });
};
harden(valueComponent);
