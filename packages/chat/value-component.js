// @ts-check

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */
/** @import { VNode } from 'preact' */

import harden from '@endo/harden';
import { E } from '@endo/far';
import { passStyleOf } from '@endo/pass-style';

import {
  h,
  renderConfined,
  unmount,
  useState,
} from './setup-preact-container.js';

import { inferType, toClipboardText } from './value-render.js';
import { valueToVnodes } from './value-vnodes.js';
import { MarkdownFragment } from './markdown-vnodes.js';
import { inferLanguage } from './language-detect.js';
import { isMarkdown } from './markdown-preview.js';

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
 * Check if a remotable value has a `text` method, indicating it is a
 * ReadableBlob, SnapshotBlob, EndoBlob, or similar.
 *
 * @param {unknown} value
 * @returns {Promise<boolean>}
 */
const isBlobLike = async value => {
  try {
    // eslint-disable-next-line no-underscore-dangle
    const methods = await E(value).__getMethodNames__();
    return Array.isArray(methods) && methods.includes('text');
  } catch {
    return false;
  }
};
harden(isBlobLike);

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
const VALUE_FRAME_HTML = `
  <div id="value-window" class="window">
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
    </div>
    <div id="value-value"></div>
    <div class="value-actions">
      <div id="value-actions-container"></div>
      <button id="value-enter-profile" style="display: none;">Enter Profile</button>
      <button id="value-close">Close</button>
    </div>
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
  $frame.innerHTML = VALUE_FRAME_HTML;
  $parent.appendChild($frame);

  // `.frame[data-show='true']` reveals the overlay (default `.frame` is hidden).
  const setShown = (/** @type {boolean} */ shown) => {
    $frame.dataset.show = shown ? 'true' : 'false';
  };

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

  /** @type {unknown} */
  let currentValue;
  /** @type {string[] | undefined} */
  let currentPetNamePath;

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

  // Hide the overlay and reset its content. The component owns the frame's
  // visibility now (it was previously a `data-show` toggle in chat.js's
  // controlsComponent), so this is the single dismissal path.
  const dismissValue = () => {
    setShown(false);
    window.removeEventListener('keyup', handleKey);
    unmount($valueMount);
    unmount($actionsMount);
    $title.textContent = 'Value';
    $type.value = 'unknown';
    currentValue = undefined;
    currentPetNamePath = undefined;
    $enterProfile.style.display = 'none';
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

  $close.addEventListener('click', onClose);
  $frame.addEventListener('click', onFrameClick);
  $type.addEventListener('change', onTypeChange);
  $enterProfile.addEventListener('click', onEnterProfile);

  /** @param {KeyboardEvent} event */
  const handleKey = event => {
    const { key, repeat, metaKey } = event;
    if (repeat || metaKey) return;
    if (key === 'Escape') {
      dismissValue();
      event.stopPropagation();
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
    setShown(true);
    currentValue = value;
    currentPetNamePath = petNamePath;
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
          E(value)
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
        const petNames = await E(powers).reverseIdentify(id);
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
  // and the frame's own listeners, unmount the two confined surfaces, and
  // remove the frame this component created. The component owns its DOM, so
  // teardown leaves nothing behind — the uniform `component(props) -> cleanup`
  // contract the packaged spaces use.
  const dispose = () => {
    window.removeEventListener('keyup', handleKey);
    $close.removeEventListener('click', onClose);
    $frame.removeEventListener('click', onFrameClick);
    $type.removeEventListener('change', onTypeChange);
    $enterProfile.removeEventListener('click', onEnterProfile);
    unmount($valueMount);
    unmount($actionsMount);
    $frame.remove();
  };

  return harden({ showValue, dismissValue, dispose });
};
harden(valueComponent);
