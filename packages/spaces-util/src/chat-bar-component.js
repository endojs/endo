// @ts-check

/** @import { ERef } from '@endo/eventual-send' */
/** @import { EndoHost } from '@endo/daemon' */

import harden from '@endo/harden';
import { E } from '@endo/eventual-send';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { Fragment, h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { renderConfined, unmount } from '@endo/preact-container/renderer';

import { sendFormComponent } from './send-form.js';
import { commandSelectorComponent } from './command-selector.js';
import { createEvalForm } from './eval-form.js';
import { createDefineForm } from './define-form.js';
import { createFormBuilder } from './form-builder.js';
import { createBlobViewer } from './blob-viewer.js';
import { createDebuggerPanel } from './debugger-panel.js';
import { createEndowModal } from './endow-modal.js';
import { createInlineCommandForm } from './inline-command-form.js';
import { createPendingCommands } from './pending-commands.js';
import { createCommandExecutor } from './command-executor.js';
import {
  getCommand,
  getCategories,
  getCommandsByCategory,
} from './command-registry.js';
import { createMessagePicker } from './message-picker.js';
import { createHelpModal } from './help-modal.js';
import { isMac, modKey } from './platform-keys.js';

// Command / compose bar, migrated from imperative DOM to confined Preact for the
// three pieces that are genuinely views built from string `.innerHTML` /
// imperative `textContent` / `disabled` / class writes:
//
//   1. THE MODELINE (`#chat-modeline`) — the per-mode keyboard-hint strip. Every
//      `updateModeline` / `updateSendModeline` / `updateSelectingModeline` /
//      `updateFocusModeline` previously assembled an HTML string of
//      `<span class="modeline-hint">…<kbd>…</kbd></span>`. It now renders confined
//      from a flat plain-data hint list pushed through a controller bridge (the
//      same setter-bridge send-form uses for its reply bar), into a DEDICATED
//      mount child of `#chat-modeline`.
//   2. THE COMMAND POPOVER (`#chat-command-popover`) — the hamburger menu's
//      category-grouped command list. It renders confined from the registry data
//      plus an `onSelect` callback, into a DEDICATED mount child of the popover.
//   3. THE COMMAND-MODE CHROME (`.command-header` / `.command-footer`) — the
//      active-command label and the submit/cancel footer buttons. Previously
//      driven by imperative `$commandLabel.textContent`,
//      `$commandSubmitButton.textContent / .disabled / .classList`. It now
//      renders confined as one `CommandChrome` component (sliced per region by a
//      `region` prop) into DEDICATED mount children of the two host regions,
//      driven by the `commandChromeController` setter-bridge. The submit button's
//      `disabled` is Preact state DERIVED from the AUTHORITATIVE `commandValid`
//      boolean held in the host closure — that boolean, never the confined node,
//      is the source of truth for "can I submit?" (the inline-command-form
//      host-closure pattern). Command dispatch is non-blocking, so the button
//      never spins; a failed command surfaces as an ephemeral error card in the
//      pending-commands region (see `pending-commands.js`), NOT an inline bubble.
//
// All three keep the original class names verbatim so the existing CSS applies,
// and none uses `dangerouslySetInnerHTML` (the sanitizing renderer strips it).
//
// EVERYTHING ELSE is irreducible trusted host work and stays imperative, exactly
// as send-form keeps its contenteditable editing imperative: the `$chatBar`
// class toggling, the `$error` `textContent`, the pending-commands region cards
// (`#pending-commands-region`, the in-flight / success / ephemeral-error card
// DOM), the focus-mode CSS-class indentation applied to SHARED `#messages`
// envelopes (host DOM this component does not own), the keyboard handlers, and
// the `MutationObserver`.
//
// CHILD COMPOSITION is unchanged: send-form, command-selector, message-picker,
// help-modal, inline-command-form, and the eval / define / endow / form-builder /
// blob-viewer / debugger modals are each constructed through their existing
// entry/contract and bound to the host nodes chat.js's template provides. The
// non-view utilities (command-executor, command-registry) are used as-is.

/**
 * One keyboard hint in the modeline. `keys` renders as a sequence of `<kbd>`
 * chips (mac-adjacent / win-`+`-joined, matching the old `kbd()` helper); `text`
 * is the trailing/leading label. A hint is `{ keys, text }` where either side
 * may be empty.
 *
 * @typedef {object} ModelineHint
 * @property {string[]} keys - Key chips to render as `<kbd>`; empty for none.
 * @property {string} text - Label text; empty for none.
 * @property {'before' | 'after'} [textPosition] - Where the text sits relative
 *   to the key chips (default `after`).
 */

/**
 * A mutable bridge between the imperative controller and the confined Modeline
 * component. The component's mount effect writes `setHints` here; the controller
 * pushes hint lists through it. Intentionally NOT hardened — the component
 * mutates it.
 *
 * @typedef {object} ModelineController
 * @property {(hints: ModelineHint[] | null) => void} [setHints]
 * @property {() => ModelineHint[] | null} [getHints]
 */

/**
 * Render one hint as a `<span class="modeline-hint">`. Key chips become `<kbd>`
 * elements joined by `+` on non-mac platforms (mirroring the old `kbd()`).
 *
 * @param {object} props
 * @param {ModelineHint} props.hint
 */
const ModelineHintSpan = ({ hint }) => {
  const { keys, text, textPosition = 'after' } = hint;
  /** @type {Array<import('preact').ComponentChild>} */
  const children = [];
  if (text && textPosition === 'before') {
    children.push(text, ' ');
  }
  for (let i = 0; i < keys.length; i += 1) {
    if (i > 0 && !isMac) children.push('+');
    children.push(h('kbd', null, keys[i]));
  }
  if (text && textPosition === 'after') {
    if (keys.length > 0) children.push(' ');
    children.push(text);
  }
  return h('span', { class: 'modeline-hint' }, ...children);
};
harden(ModelineHintSpan);

/**
 * The confined modeline view. Holds its current hint list in a setter exposed
 * through `controller.setHints`; `null` hides the strip (renders nothing).
 *
 * @param {object} props
 * @param {ModelineController} props.controller
 */
const Modeline = ({ controller }) => {
  const [hints, setHints] = useState(
    /** @type {ModelineHint[] | null} */ (controller.getHints?.() ?? null),
  );

  useEffect(() => {
    controller.setHints = next => setHints(next);
    // A hint list pushed before this effect wired up is not lost: pull it now.
    const pending = controller.getHints?.();
    if (pending !== undefined) setHints(pending);
    return () => {
      if (controller.setHints) delete controller.setHints;
    };
  }, [controller]);

  if (!hints) return null;
  return h(
    Fragment,
    null,
    ...hints.map((hint, i) => h(ModelineHintSpan, { key: String(i), hint })),
  );
};
harden(Modeline);

/**
 * The confined command popover view: a header, category-grouped command rows,
 * and a footer. Clicking a row invokes `onSelect(commandName)`.
 *
 * @param {object} props
 * @param {Array<{ category: string, label: string, commands: Array<{ name: string, description: string }> }>} props.sections
 * @param {(commandName: string) => void} props.onSelect
 */
const CommandPopover = ({ sections, onSelect }) =>
  h(
    Fragment,
    null,
    h('div', { class: 'command-popover-header' }, 'Commands'),
    ...sections.map(section =>
      h(
        'div',
        { class: 'command-popover-section', key: section.category },
        h('div', { class: 'command-popover-category' }, section.label),
        ...section.commands.map(cmd =>
          h(
            'div',
            {
              class: 'command-popover-item',
              'data-command': cmd.name,
              key: cmd.name,
              onClick: () => onSelect(cmd.name),
            },
            h('span', { class: 'command-popover-item-name' }, `/${cmd.name}`),
            h('span', { class: 'command-popover-item-desc' }, cmd.description),
          ),
        ),
      ),
    ),
    h(
      'div',
      { class: 'command-popover-footer' },
      'Type ',
      h('kbd', null, '/'),
      ' in input for quick access',
    ),
  );
harden(CommandPopover);

/**
 * Plain-data view state for the command-mode chrome. All booleans are mirrors
 * of the AUTHORITATIVE values held in the host closure — the component must
 * never be read back as the source of truth for "can submit?".
 *
 * @typedef {object} CommandChromeState
 * @property {string} commandLabel - The active command's display label.
 * @property {string} submitLabel - The submit button's label.
 * @property {boolean} valid - Whether the inline form currently validates.
 */

/**
 * A mutable bridge between the imperative command-mode controller and the
 * confined `CommandChrome` views. Each mounted region wires its `setState`
 * setter into the shared `setters` set on mount; the host pushes a fresh state
 * snapshot through `broadcast`, which fans out to every live region. The
 * `onSubmit` / `onCancel` callbacks the confined buttons invoke are also held
 * here so the host owns the behaviour. Intentionally NOT hardened — the
 * components mutate `setters`.
 *
 * @typedef {object} CommandChromeController
 * @property {Set<(state: CommandChromeState) => void>} setters
 * @property {() => CommandChromeState} getState
 * @property {() => void} onSubmit
 * @property {() => void} onCancel
 */

/**
 * One confined region of the command-mode chrome. `region` selects which slice
 * of the shared `CommandChromeState` this mount renders, so a single component +
 * controller drives the (physically separated) header and footer host nodes:
 *
 *   • `header` — the `.command-label` span.
 *   • `footer` — the submit button (label + disabled) and the
 *     `.command-cancel-footer` button.
 *
 * Command dispatch is non-blocking: the submit button never spins (progress
 * moves to the pending-commands region), so its `disabled` is PREACT STATE
 * derived from the mirrored `valid` boolean alone; the host never reads it back.
 * Clicking submit/cancel routes through the controller's `onSubmit` / `onCancel`,
 * which the host owns.
 *
 * @param {object} props
 * @param {'header' | 'footer'} props.region
 * @param {CommandChromeController} props.controller
 */
const CommandChrome = ({ region, controller }) => {
  const [state, setState] = useState(
    /** @type {CommandChromeState} */ (controller.getState()),
  );

  useEffect(() => {
    const setter = next => setState(next);
    controller.setters.add(setter);
    // A state pushed before this effect wired up is not lost: pull it now.
    setState(controller.getState());
    return () => {
      controller.setters.delete(setter);
    };
  }, [controller]);

  if (region === 'header') {
    return h('span', { class: 'command-label' }, state.commandLabel);
  }

  // region === 'footer'
  return h(
    Fragment,
    null,
    h(
      'button',
      {
        disabled: !state.valid,
        onClick: () => controller.onSubmit(),
      },
      state.submitLabel,
    ),
    h(
      'button',
      {
        class: 'command-cancel-footer',
        title: 'Cancel (Esc)',
        onClick: () => controller.onCancel(),
      },
      '×',
    ),
  );
};
harden(CommandChrome);

/**
 * @param {HTMLElement} $parent
 * @param {ERef<EndoHost>} powers
 * @param {object} options
 * @param {(value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>} options.showValue
 * @param {(hostName: string) => Promise<void>} options.enterProfile
 * @param {() => void} options.exitProfile
 * @param {boolean} options.canExitProfile
 * @param {() => string | null} [options.getConversationPetName] - Returns active conversation pet name
 * @param {() => void} [options.exitConversation] - Exit the current conversation view
 * @param {(petName: string) => void} [options.navigateToConversation] - Navigate to a conversation
 * @param {() => unknown | null} [options.getChannelRef] - Returns channel exo ref when in channel mode, null otherwise
 * @param {(info: { petNames: string[], edgeNames: string[], messageStrings: string[], replyTo: string | undefined }) => void} [options.onMentionNotify] - Called after channel post with at-mentions
 */
export const chatBarComponent = (
  $parent,
  powers,
  {
    showValue,
    enterProfile,
    exitProfile,
    canExitProfile,
    getConversationPetName,
    exitConversation,
    navigateToConversation,
    getChannelRef,
    onMentionNotify,
  },
) => {
  const $chatBar = /** @type {HTMLElement} */ (
    $parent.querySelector('#chat-bar')
  );
  const $sendButton = /** @type {HTMLElement} */ (
    $parent.querySelector('#chat-send-button')
  );
  const $input = /** @type {HTMLElement} */ (
    $parent.querySelector('#chat-message')
  );
  const $tokenMenu = /** @type {HTMLElement} */ (
    $parent.querySelector('#token-menu')
  );
  const $commandMenu = /** @type {HTMLElement} */ (
    $parent.querySelector('#command-menu')
  );
  const $error = /** @type {HTMLElement} */ (
    $parent.querySelector('#chat-error')
  );
  const $pendingRegion = /** @type {HTMLElement} */ (
    $parent.querySelector('#pending-commands-region')
  );
  const $evalFormContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#eval-form-container')
  );
  const $evalFormBackdrop = /** @type {HTMLElement} */ (
    $parent.querySelector('#eval-form-backdrop')
  );
  const $formBuilderContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#form-builder-container')
  );
  const $formBuilderBackdrop = /** @type {HTMLElement} */ (
    $parent.querySelector('#form-builder-backdrop')
  );
  const $endowModalContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#endow-modal-container')
  );
  const $endowModalBackdrop = /** @type {HTMLElement} */ (
    $parent.querySelector('#endow-modal-backdrop')
  );
  const $defineFormContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#define-form-container')
  );
  const $defineFormBackdrop = /** @type {HTMLElement} */ (
    $parent.querySelector('#define-form-backdrop')
  );
  const $blobViewerContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#blob-viewer-container')
  );
  const $blobViewerBackdrop = /** @type {HTMLElement} */ (
    $parent.querySelector('#blob-viewer-backdrop')
  );
  const $debuggerContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#debugger-panel-container')
  );
  const $debuggerBackdrop = /** @type {HTMLElement} */ (
    $parent.querySelector('#debugger-panel-backdrop')
  );
  const $inlineFormContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#inline-form-container')
  );
  const $commandHeader = /** @type {HTMLElement} */ (
    $parent.querySelector('.command-header')
  );
  const $commandFooter = /** @type {HTMLElement} */ (
    $parent.querySelector('.command-footer')
  );
  const $messagesContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#messages')
  );
  const $helpModalContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#help-modal-container')
  );
  const $menuButton = /** @type {HTMLButtonElement} */ (
    $parent.querySelector('#chat-menu-button')
  );
  const $commandPopover = /** @type {HTMLElement} */ (
    $parent.querySelector('#chat-command-popover')
  );
  const $modeline = /** @type {HTMLElement} */ (
    $parent.querySelector('#chat-modeline')
  );

  // ---- Confined modeline mount ----
  //
  // The modeline strip renders confined into a dedicated child of the host
  // `#chat-modeline`; `renderConfined` reconciles only against this mount's
  // children, so it never disturbs sibling chat-bar content. The component's
  // mount effect wires its `setHints` setter onto the controller; the host
  // pushes hint lists through it (the same setter-bridge send-form uses).
  /** @type {ModelineController} */
  const modelineController = {};
  /** @type {ModelineHint[] | null} */
  let currentModelineHints = null;
  modelineController.getHints = () => currentModelineHints;

  const $modelineMount = document.createElement('div');
  $modeline.appendChild($modelineMount);
  renderConfined(
    h(Modeline, { controller: modelineController }),
    $modelineMount,
  );

  /**
   * Push a hint list (or `null` to hide) into the confined modeline and toggle
   * the host `has-modeline` class exactly as the imperative version did.
   * @param {ModelineHint[] | null} hints
   */
  const setModeline = hints => {
    currentModelineHints = hints;
    if (modelineController.setHints) {
      modelineController.setHints(hints);
    }
    if (hints && hints.length > 0) {
      $chatBar.classList.add('has-modeline');
    } else {
      $chatBar.classList.remove('has-modeline');
    }
  };

  /**
   * Build a `[mod, 'Enter'] expand-to-editor` hint, matching the old
   * `kbd(modKey, 'Enter')` chip pair.
   * @param {string} label
   * @returns {ModelineHint}
   */
  const modEnterHint = label => ({ keys: [modKey, 'Enter'], text: label });

  /**
   * Update the modeline content based on the current mode.
   * @param {string | null} commandName
   */
  const updateModeline = commandName => {
    if (!commandName) {
      setModeline(null);
      return;
    }

    // Resolve alias to get the actual command
    const command = getCommand(commandName);
    /** @type {ModelineHint[]} */
    let hints;
    if (command && command.name === 'js') {
      hints = [
        { keys: ['@'], text: 'add endowment' },
        { keys: ['Enter'], text: 'evaluate' },
        modEnterHint('expand to editor'),
        { keys: ['Esc'], text: 'cancel' },
      ];
    } else if (command && command.name === 'define') {
      hints = [
        { keys: ['@'], text: 'add slot' },
        { keys: ['Enter'], text: 'define' },
        modEnterHint('expand to editor'),
        { keys: ['Esc'], text: 'cancel' },
      ];
    } else {
      hints = [
        { keys: ['Enter'], text: 'submit' },
        { keys: ['Tab'], text: 'next field' },
        { keys: ['Esc'], text: 'cancel' },
      ];
    }

    setModeline(hints);
  };

  /** @type {'send' | 'selecting' | 'inline' | 'js' | 'form' | 'focus' | 'pending'} */
  let mode = 'send';
  let commandPrefix = '';
  /** @type {string | null} */
  let currentCommand = null;

  /** @type {import('./eval-form.js').EvalFormAPI | null} */
  let evalForm = null;

  /** @type {import('./define-form.js').DefineFormAPI | null} */
  let defineForm = null;

  /** @type {import('./form-builder.js').FormBuilderAPI | null} */
  let formBuilder = null;

  /** @type {import('./endow-modal.js').EndowModalAPI | null} */
  let endowModal = null;

  /** @type {import('./blob-viewer.js').BlobViewerAPI | null} */
  let blobViewer = null;

  /** @type {import('./debugger-panel.js').DebuggerPanelAPI | null} */
  let debuggerPanel = null;

  // The generic `iterateReader` is structurally narrower than the
  // `(ref: unknown) => AsyncIterable<unknown>` factory the child components
  // declare; widen it once for the prop sites below.
  const iterateReaderFactory =
    /** @type {(ref: unknown) => AsyncIterable<unknown>} */ (iterateReader);

  // Initialize the send form component
  const sendForm = sendFormComponent({
    $input,
    $menu: $tokenMenu,
    $error,
    $sendButton,
    $chatBar,
    E,
    iterateReader: iterateReaderFactory,
    powers,
    showValue,
    shouldHandleEnter: () => mode === 'send',
    onStateChange: state => {
      // Update modeline based on send form state (only in send mode)
      if (mode === 'send') {
        updateSendModeline(state); // eslint-disable-line no-use-before-define
      }
    },
    getConversationPetName,
    navigateToConversation,
    getChannelRef,
    onMentionNotify,
  });

  // Initialize command executor
  const executor = createCommandExecutor({
    powers,
    showValue,
    showMessage: message => {
      // For now, just log messages - could add a toast system later
      console.error(message);
    },
    getChannelRef,
    openBlobViewer: async (petNamePath, readOnly) => {
      if (!blobViewer) {
        blobViewer = createBlobViewer({
          $container: $blobViewerContainer,
          $backdrop: $blobViewerBackdrop,
          powers,
          onClose: () => {
            sendForm.focus();
          },
        });
      }
      await blobViewer.open(petNamePath, readOnly);
    },
    openDebugger: (debuggerRef, label) => {
      if (!debuggerPanel) {
        debuggerPanel = createDebuggerPanel({
          $container: $debuggerContainer,
          $backdrop: $debuggerBackdrop,
        });
      }
      debuggerPanel.open(debuggerRef, label);
    },
    showError: error => {
      const message = error?.message || String(error) || 'Unknown error';
      // A failed command is surfaced to the user by its ephemeral pending-command
      // error card (see `pending-commands.js`), which carries the rich error UX
      // — message, daemon stack trace, and clickable worker chip — for EVERY
      // command via the resolved `{ success: false, error, trace }` result. This
      // handler no longer paints a bubble or a toast (there is no command-mode
      // inline error path); it only mirrors the error to the console for
      // debugging, including any aggregate/cause chain.
      console.error(`[Chat] Command error:`, message);
      const { errors } = /** @type {{ errors?: Error[] }} */ (error);
      if (errors?.length) {
        for (const sub of errors) {
          console.error(`[Chat]   caused by:`, sub?.message || sub);
        }
      }
      if (error?.cause) {
        console.error(
          `[Chat]   cause:`,
          /** @type {Error} */ (error.cause)?.message || error.cause,
        );
      }
    },
  });

  // Track active message number input for the picker
  /** @type {HTMLInputElement | null} */
  let activeMessageNumberInput = null;

  // Initialize message picker
  const messagePicker = createMessagePicker({
    $messagesContainer,
    onSelect: messageNumber => {
      if (activeMessageNumberInput) {
        activeMessageNumberInput.value = String(messageNumber);
        activeMessageNumberInput.dispatchEvent(
          new Event('input', { bubbles: true }),
        );
      }
    },
  });

  // Initialize help modal
  const helpModal = createHelpModal({
    $container: $helpModalContainer,
    onClose: () => {
      sendForm.focus();
    },
  });

  // Category display names for hamburger menu
  const CATEGORY_LABELS = {
    messaging: 'Messaging',
    execution: 'Execution',
    storage: 'Storage',
    connections: 'Connections',
    workers: 'Workers',
    agents: 'Agents',
    bundles: 'Bundles',
    profile: 'Profile',
    system: 'System',
  };

  /**
   * Update modeline for send mode based on input state.
   * @param {import('./send-form.js').SendFormState} state
   */
  const updateSendModeline = state => {
    const { menuVisible, hasToken, hasText, isEmpty } = state;
    const inConversation = getConversationPetName
      ? getConversationPetName()
      : null;

    // Update has-content class for send button visibility
    if (hasToken || hasText) {
      $chatBar.classList.add('has-content');
    } else {
      $chatBar.classList.remove('has-content');
    }

    if (inConversation) {
      if (menuVisible) {
        setModeline([
          { keys: [], text: 'select reference' },
          { keys: ['Space'], text: 'embed' },
          { keys: ['↑↓'], text: 'navigate' },
          { keys: ['Esc'], text: 'cancel' },
        ]);
      } else if (hasToken || hasText) {
        setModeline([
          { keys: ['Enter'], text: 'send' },
          { keys: ['@'], text: 'embed reference' },
          { keys: ['/'], text: 'commands' },
        ]);
      } else {
        setModeline([
          { keys: ['@'], text: 'embed reference' },
          { keys: ['/'], text: 'commands' },
          { keys: ['Esc'], text: 'back to inbox' },
        ]);
      }
      return;
    }

    // Determine modeline content based on state
    if (menuVisible) {
      // Token menu is showing (typing @name)
      setModeline([
        { keys: [], text: 'select reference' },
        { keys: ['Space'], text: 'chat' },
        { keys: ['Enter'], text: 'inspect' },
        { keys: ['↑↓'], text: 'navigate' },
        { keys: ['Esc'], text: 'cancel' },
      ]);
    } else if (hasToken && hasText) {
      // Has token and message text - ready to send
      setModeline([
        { keys: ['Enter'], text: 'send' },
        { keys: ['@'], text: 'embed reference' },
        { keys: ['⌫'], text: 'delete chip' },
      ]);
    } else if (hasToken && !hasText) {
      // Just a token, no message - can inspect or start typing
      setModeline([
        { keys: ['Enter'], text: 'inspect or write message' },
        { keys: ['⌫'], text: 'delete chip' },
      ]);
    } else if (isEmpty) {
      // Empty input - show default hints
      const lastRecipient = sendForm.getLastRecipient();
      if (lastRecipient) {
        setModeline([
          { keys: [], text: `sending to @${lastRecipient}` },
          { keys: ['@'], text: 'inspect or message' },
          { keys: ['/'], text: 'commands' },
        ]);
      } else {
        setModeline([
          { keys: ['@'], text: 'inspect or message' },
          { keys: ['/'], text: 'commands' },
        ]);
      }
    } else {
      // Text only without token
      const lastRecipient = sendForm.getLastRecipient();
      if (lastRecipient) {
        setModeline([
          { keys: ['Enter'], text: `send to @${lastRecipient}` },
          { keys: ['@'], text: 'embed reference' },
        ]);
      } else {
        setModeline([{ keys: ['@'], text: 'add recipient to send' }]);
      }
    }
  };

  /**
   * Update modeline for command selection mode.
   */
  const updateSelectingModeline = () => {
    setModeline([
      { keys: [], text: 'type command name' },
      { keys: ['↑↓'], text: 'navigate' },
      { keys: ['Enter'], text: 'select' },
      { keys: ['Esc'], text: 'cancel' },
    ]);
  };

  /**
   * Legacy function for compatibility - updates modeline based on current state.
   */
  const updateHasContent = () => {
    if (mode === 'send') {
      updateSendModeline(sendForm.getState());
    } else if (mode === 'selecting') {
      updateSelectingModeline();
    }
  };

  // ---- Confined command popover mount ----
  //
  // The popover renders confined into a dedicated child of the host
  // `#chat-command-popover`; the host keeps the `.visible` toggle on the popover
  // container itself, matching the original.
  const $commandPopoverMount = document.createElement('div');
  $commandPopover.appendChild($commandPopoverMount);

  /**
   * Render the command popover content (confined).
   */
  const renderCommandPopover = () => {
    const categories = getCategories();
    const context = getCommandContext(); // eslint-disable-line no-use-before-define
    /** @type {Array<{ category: string, label: string, commands: Array<{ name: string, description: string }> }>} */
    const sections = [];

    for (const category of categories) {
      const commands = getCommandsByCategory(category, context);
      if (commands.length !== 0) {
        const label = CATEGORY_LABELS[category] || category;
        sections.push({
          category,
          label,
          commands: commands.map(cmd => ({
            name: cmd.name,
            description: cmd.description,
          })),
        });
      }
    }

    renderConfined(
      h(CommandPopover, {
        sections,
        onSelect: cmdName => {
          hideCommandPopover(); // eslint-disable-line no-use-before-define
          handleCommandSelect(cmdName); // eslint-disable-line no-use-before-define
        },
      }),
      $commandPopoverMount,
    );
  };

  const showCommandPopover = () => {
    renderCommandPopover();
    $commandPopover.classList.add('visible');
  };

  const hideCommandPopover = () => {
    $commandPopover.classList.remove('visible');
  };

  // Menu button click handler
  $menuButton.addEventListener('click', event => {
    event.stopPropagation();
    if ($commandPopover.classList.contains('visible')) {
      hideCommandPopover();
    } else {
      showCommandPopover();
    }
  });

  // Close popover when clicking outside. Named + removed in `dispose()` so a
  // new document listener does not accumulate on every space switch.
  const onDocumentClick = (/** @type {MouseEvent} */ event) => {
    if (
      !$commandPopover.contains(/** @type {Node} */ (event.target)) &&
      !$menuButton.contains(/** @type {Node} */ (event.target))
    ) {
      hideCommandPopover();
    }
  };
  document.addEventListener('click', onDocumentClick);

  // ---- Confined command-mode chrome mounts ----
  //
  // The command-mode header label and submit/cancel footer buttons render
  // confined into dedicated mount children of their host regions
  // (`.command-header`, `.command-footer`); one `CommandChrome` component slice
  // per region, all driven by a single setter-bridge exactly like
  // `modelineController`.
  //
  // THE AUTHORITATIVE STATE lives here in the host closure, NOT in the confined
  // buttons. Under confinement the submit button's `disabled` is Preact state we
  // must never read back, so "can I submit?" reads route through `commandValid`
  // below — the same "authoritative boolean in a host closure" pattern
  // inline-command-form.js uses for `formData` / `disabled`. `commandValid`
  // mirrors the old read of `$commandSubmitButton.disabled` as the validity
  // source of truth. There is no `submitting` mirror: command dispatch is
  // non-blocking (the bar unlocks immediately and progress moves to the pending-
  // commands region), so the submit button never spins.
  let commandValid = false;
  let currentCommandLabel = '';
  let currentSubmitLabel = 'Execute';

  /**
   * Bring up Show Value for the worker that produced an error, given the
   * worker's formula identifier (stamped by the daemon from the connection
   * identity). Best-effort reverse lookup: resolve the live worker remotable
   * via `lookupById` so the modal shows the actual worker value; if the worker
   * is no longer retained under any path the lookup rejects and we fall back to
   * a bare-id (anonymous) Show Value, whose back face still inspects the
   * worker's formula via `diagnostics().getFormula`.
   *
   * @param {string} workerId
   */
  const showWorkerValue = async workerId => {
    try {
      const workerValue = await E(powers).lookupById(
        /** @type {Parameters<EndoHost['lookupById']>[0]} */ (
          /** @type {unknown} */ (workerId)
        ),
      );
      showValue(workerValue, workerId, undefined, undefined);
    } catch {
      // The worker is anonymous to us (no retained path resolves the id); show
      // it by bare formula identifier so the chip still opens Show Value.
      showValue(undefined, workerId, undefined, undefined);
    }
  };

  /** @type {CommandChromeController} */
  const commandChromeController = {
    setters: new Set(),
    getState: () => ({
      commandLabel: currentCommandLabel,
      submitLabel: currentSubmitLabel,
      valid: commandValid,
    }),
    onSubmit: () => {
      // eslint-disable-next-line no-use-before-define
      void submitCurrentCommand();
    },
    onCancel: () => {
      messagePicker.disable();
      exitCommandMode(); // eslint-disable-line no-use-before-define
    },
  };

  /** Push the current chrome snapshot into every live confined region. */
  const pushCommandChrome = () => {
    const state = commandChromeController.getState();
    for (const setter of commandChromeController.setters) {
      setter(state);
    }
  };

  const $commandHeaderMount = document.createElement('div');
  $commandHeader.replaceChildren($commandHeaderMount);
  renderConfined(
    h(CommandChrome, { region: 'header', controller: commandChromeController }),
    $commandHeaderMount,
  );

  const $commandFooterMount = document.createElement('div');
  $commandFooter.replaceChildren($commandFooterMount);
  renderConfined(
    h(CommandChrome, { region: 'footer', controller: commandChromeController }),
    $commandFooterMount,
  );

  // Pending commands region. Every dispatched command is tracked here as a card
  // instead of blocking the bar. The region is ALSO the single, general error
  // surface: on failure of ANY command its pending card is replaced by an
  // ephemeral error card carrying the rich error UX — message, daemon stack
  // trace, and a clickable worker chip — that used to be the eval-only inline
  // command-error bubble. The chip reverse-resolves the worker for Show Value.
  const pendingCommands = createPendingCommands($pendingRegion, {
    powers,
    // The region is flow content at the bottom of the transcript; give it the
    // scroll container so a new card pins the transcript to its bottom.
    scrollContainer: $messagesContainer,
    onShowWorker: workerId => {
      // The worker id is the worker formula's identifier; reverse-resolve the
      // live worker for Show Value (anonymous fallback when unretained).
      void showWorkerValue(workerId);
    },
    onRegionEmptied: () => {
      // An async success-fade or error resolution emptied the region while the
      // user was parked in it; return them to the input.
      if (mode === 'pending') {
        exitPendingToInput(); // eslint-disable-line no-use-before-define
      }
    },
  });

  /**
   * Dispatch a command into the pending region and surface its return value.
   * Dispatch is non-blocking: the command bar unlocks immediately (leaving
   * command mode) while the pending region's card owns the in-flight, success,
   * and error UX (per `pending-commands.js`). This function forwards a
   * successful command's value to the value modal where appropriate.
   *
   * @param {string} commandName
   * @param {Record<string, unknown>} data
   */
  const executeWithSpinner = async (commandName, data) => {
    messagePicker.disable();

    if (commandName === 'enter') {
      const { hostName } = /** @type {{ hostName: string }} */ (data);
      exitCommandMode(); // eslint-disable-line no-use-before-define
      await enterProfile(hostName);
      return;
    }

    if (commandName === 'endow') {
      const { messageNumber } = /** @type {{ messageNumber: number }} */ (data);
      exitCommandMode({ skipFocus: true }); // eslint-disable-line no-use-before-define
      showEndowModal(BigInt(messageNumber));
      return;
    }

    if (commandName === 'help') {
      const name = data.commandName ? String(data.commandName) : undefined;
      exitCommandMode(); // eslint-disable-line no-use-before-define
      helpModal.show(name);
      return;
    }

    // Unlock the command bar immediately for EVERY command. Command dispatch is
    // non-blocking: progress moves from the bar to a card in the pending-commands
    // region, so the user can read back what they submitted and issue concurrent
    // commands. Commands that open their own modal skip focus so the modal
    // receives it; every other command returns to send mode.
    const opensModal =
      commandName === 'view' || commandName === 'edit' || commandName === 'cat';
    if (opensModal) {
      exitCommandMode({ skipFocus: true }); // eslint-disable-line no-use-before-define
    } else {
      exitCommandMode(); // eslint-disable-line no-use-before-define
    }

    // Track the execution as a pending command card. The card owns the success /
    // error UX (per pending-commands.js) — including the ephemeral error card
    // that replaces the pending card and carries the rich daemon trace (message
    // + stack + clickable worker chip) for a failed command, the single general
    // error surface. The executor catches its own errors and resolves a
    // { success, error?, trace? } shape, so awaiting the promise here does not
    // throw; this function only forwards a successful result value to the value
    // modal when appropriate.
    const resultPromise = executor.execute(commandName, data);
    pendingCommands.track(commandName, data, resultPromise);

    const result = await resultPromise;
    if (result.success) {
      const resultName =
        'resultName' in data && data.resultName
          ? String(data.resultName)
          : undefined;
      const resultPath = resultName ? resultName.split('/') : undefined;
      if (commandName === 'js') {
        showValue(result.value, undefined, resultPath, undefined);
      } else if (
        result.value !== undefined &&
        commandName !== 'show' &&
        commandName !== 'list'
      ) {
        showValue(result.value, undefined, resultPath, undefined);
      }
    }
  };

  // Initialize inline command form
  const inlineForm = createInlineCommandForm({
    $container: $inlineFormContainer,
    E,
    powers,
    iterateReader: iterateReaderFactory,
    getContext: () => getCommandContext(), // eslint-disable-line no-use-before-define
    onSubmit: async (commandName, data) => {
      await executeWithSpinner(commandName, data);
    },
    onCancel: () => {
      messagePicker.disable();
      exitCommandMode(); // eslint-disable-line no-use-before-define
    },
    onValidityChange: isValid => {
      // Keep the authoritative validity boolean fresh and mirror it into the
      // confined submit button (its `disabled` is Preact state, never read back).
      commandValid = isValid;
      pushCommandChrome();
    },
    onMessageNumberClick: () => {
      // Enable picker and track the input
      const $msgInput = $inlineFormContainer.querySelector(
        '.message-number-input',
      );
      if ($msgInput) {
        activeMessageNumberInput = /** @type {HTMLInputElement} */ ($msgInput);
        messagePicker.enable();
      }
    },
    onExpandEval: async data => {
      // Expand inline eval to full modal
      // Exit inline command mode first
      exitCommandMode(); // eslint-disable-line no-use-before-define
      // Show the eval form with pre-populated data
      await showEvalForm(); // eslint-disable-line no-use-before-define
      if (evalForm) {
        evalForm.setData({
          source: data.source,
          endowments: data.endowments,
          resultName: '',
          workerName: '@main',
          cursorPosition: data.cursorPosition,
        });
      }
    },
    onExpandDefine: async data => {
      // Expand inline define to full modal
      exitCommandMode(); // eslint-disable-line no-use-before-define
      await showDefineForm(); // eslint-disable-line no-use-before-define
      if (defineForm) {
        defineForm.setData({
          source: data.source,
          slots: data.slots,
          cursorPosition: data.cursorPosition,
        });
      }
    },
    getMessageEdgeNames: async messageNumber => {
      try {
        // In channel mode, look up edge names from channel messages
        const channelRef = getChannelRef ? getChannelRef() : null;
        const messageList = channelRef
          ? await E(
              /** @type {{ listMessages: () => Promise<Array<{ number: bigint, names?: string[], edgeNames?: string[] }>> }} */ (
                channelRef
              ),
            ).listMessages()
          : await E(powers).listMessages();
        const targetNumber = BigInt(messageNumber);
        const message = messageList.find(
          (/** @type {{ number: bigint }} */ m) => m.number === targetNumber,
        );
        if (!message) return [];
        // Package messages have 'names', eval-proposal messages have 'edgeNames'
        if ('names' in message && Array.isArray(message.names)) {
          return message.names;
        }
        if ('edgeNames' in message && Array.isArray(message.edgeNames)) {
          return message.edgeNames;
        }
        return [];
      } catch {
        return [];
      }
    },
  });

  /**
   * Enter command mode for an inline command.
   * @param {string} commandName
   * @param {Record<string, string>} [prefill] - Optional field values to pre-fill
   */
  const enterCommandMode = (commandName, prefill) => {
    const command = getCommand(commandName);
    if (!command) return;

    mode = 'inline';
    currentCommand = commandName;
    $chatBar.classList.add('command-mode');
    // Push the command's label / submit label into the confined chrome. The
    // form starts invalid, so the submit button mirrors `disabled`.
    currentCommandLabel = command.label;
    currentSubmitLabel = command.submitLabel || 'Execute';
    commandValid = false;
    pushCommandChrome();
    updateModeline(commandName);

    inlineForm.setCommand(commandName, prefill);

    // Auto-enable message picker for commands that need message numbers
    const needsMessagePicker = command.fields.some(
      f => f.type === 'messageNumber',
    );
    if (needsMessagePicker) {
      messagePicker.enable();
      // Track the message number input
      setTimeout(() => {
        const $msgInput = $inlineFormContainer.querySelector(
          '.message-number-input',
        );
        if ($msgInput) {
          activeMessageNumberInput = /** @type {HTMLInputElement} */ (
            $msgInput
          );
        }
      }, 50);
    }

    // Focus the first field after a brief delay for DOM update.
    // When prefill is provided, skip past filled fields.
    const skipFilled = prefill !== undefined;
    setTimeout(() => {
      inlineForm.focus(skipFilled);
    }, 50);
  };

  /**
   * Exit command mode and return to send mode.
   * @param {object} [options]
   * @param {boolean} [options.skipFocus]
   */
  const exitCommandMode = ({ skipFocus = false } = {}) => {
    mode = 'send';
    currentCommand = null;
    $chatBar.classList.remove('command-mode');
    updateModeline(null);
    messagePicker.disable();
    activeMessageNumberInput = null;
    inlineForm.clear();
    sendForm.clear();
    if (!skipFocus) {
      sendForm.focus();
    }
    $error.textContent = '';
    updateHasContent();
  };

  // --- Focus mode ---

  /** Shortcut keys mapped to command names for focus mode. */
  const FOCUS_SHORTCUTS = {
    r: 'reply',
    d: 'dismiss',
    a: 'adopt',
    g: 'grant',
    s: 'submit',
  };

  /**
   * Compute which messages should be indented based on the reply chain
   * through the focused message.
   *
   * Walking backward from the focus: indent every message until reaching
   * the message that the cursor replies to (its parent). The parent is
   * not indented and becomes the new cursor. Repeat until history is
   * exhausted.
   *
   * Walking forward from the focus: indent every message until reaching
   * the last message that replies to the cursor. That reply becomes the
   * new cursor. Repeat until messages are exhausted.
   *
   * @param {NodeListOf<HTMLElement>} $messages
   * @param {number} focusIndex
   */
  const applyFocusIndent = ($messages, focusIndex) => {
    // Build messageId → index lookup
    /** @type {Map<string, number>} */
    const idToIndex = new Map();
    for (let i = 0; i < $messages.length; i += 1) {
      const mid = $messages[i].dataset.messageId;
      if (mid) {
        idToIndex.set(mid, i);
      }
    }

    // Start with all messages indented, then un-indent the chain
    for (let i = 0; i < $messages.length; i += 1) {
      $messages[i].classList.add('indented');
    }

    // Collect the ordered chain of non-indented indices
    /** @type {number[]} */
    const chain = [];

    // The focused message is never indented
    $messages[focusIndex].classList.remove('indented');

    // Walk backward: find ancestor chain
    /** @type {number[]} */
    const ancestors = [];
    let cursor = focusIndex;
    for (let i = cursor - 1; i >= 0; i -= 1) {
      const cursorReplyTo = $messages[cursor].dataset.replyTo;
      if (cursorReplyTo) {
        const parentIndex = idToIndex.get(cursorReplyTo);
        if (parentIndex !== undefined && parentIndex <= i) {
          $messages[parentIndex].classList.remove('indented');
          ancestors.push(parentIndex);
          cursor = parentIndex;
          i = parentIndex;
        }
      }
    }
    // Ancestors were collected child-to-parent; reverse for top-down order
    ancestors.reverse();
    chain.push(...ancestors, focusIndex);

    // Walk forward: find descendant chain
    cursor = focusIndex;
    let searchFrom = focusIndex + 1;
    while (searchFrom < $messages.length) {
      const cursorMid = $messages[cursor].dataset.messageId;
      if (!cursorMid) break;

      let lastReplyIndex = -1;
      for (let i = searchFrom; i < $messages.length; i += 1) {
        if ($messages[i].dataset.replyTo === cursorMid) {
          lastReplyIndex = i;
        }
      }

      if (lastReplyIndex === -1) break;

      $messages[lastReplyIndex].classList.remove('indented');
      chain.push(lastReplyIndex);
      cursor = lastReplyIndex;
      searchFrom = lastReplyIndex + 1;
    }

    applyChainLines($messages, chain); // eslint-disable-line no-use-before-define
    // Secondary connections apply to all indented messages, not just
    // those within chain segments.
    applyIndentedConnections($messages, 0, $messages.length); // eslint-disable-line no-use-before-define
  };

  /** Line class names applied to envelopes for the chain line. */
  const LINE_CLASSES = [
    'chain-start',
    'chain-through',
    'chain-end',
    'chain-tee',
    'sub-start',
    'sub-through',
    'sub-end',
    'sub-indicator',
  ];

  /**
   * Within a range of indented envelopes, find reply groups and apply
   * secondary chain classes. For each parent message that has replies
   * in the range, the last reply gets a sub-line and earlier siblings
   * get sub-tees.
   *
   * @param {NodeListOf<HTMLElement>} $envelopes
   * @param {number} from - Start index (inclusive)
   * @param {number} to - End index (exclusive)
   */
  const applyIndentedConnections = ($envelopes, from, to) => {
    // For each indented message, determine its connection to neighbors.
    // Case 1 (gutter-connected via chain-tee) is already handled.
    // Case 2: adjacent indented predecessor is our replyTo parent.
    // Case 3: has a replyTo but parent is not adjacent — reply indicator.
    for (let i = from; i < to; i += 1) {
      if ($envelopes[i].classList.contains('indented')) {
        const rt = $envelopes[i].dataset.replyTo;
        const mid = $envelopes[i].dataset.messageId;

        // Connect upward: previous envelope is indented and is our parent
        const prevIndented =
          i > from && $envelopes[i - 1].classList.contains('indented');
        const connectsUp =
          prevIndented && rt && $envelopes[i - 1].dataset.messageId === rt;

        // Connect downward: next envelope is indented and replies to us
        const nextIndented =
          i + 1 < to && $envelopes[i + 1].classList.contains('indented');
        const connectsDown =
          nextIndented && mid && $envelopes[i + 1].dataset.replyTo === mid;

        if (connectsUp && connectsDown) {
          $envelopes[i].classList.add('sub-through');
        } else if (connectsUp) {
          $envelopes[i].classList.add('sub-end');
        } else if (connectsDown) {
          $envelopes[i].classList.add('sub-start');
        } else if (rt && !$envelopes[i].classList.contains('chain-tee')) {
          // Has a replyTo but not adjacent to parent and not already
          // gutter-connected — show a small reply indicator.
          $envelopes[i].classList.add('sub-indicator');
        }
      }
    }
  };

  /**
   * Apply chain-line classes to envelopes between the first and last
   * chain member so CSS background-image draws a connecting line
   * through the indentation gutter.
   *
   * Indented messages whose `replyTo` matches the upper chain member
   * of their segment get a tee junction (branch stub) instead of a
   * plain through-line.
   *
   * Within each segment, indented messages get adjacency-based
   * connections: adjacent parent-child pairs get sub-lines, and
   * non-adjacent replies get a small indicator stub.
   *
   * @param {NodeListOf<HTMLElement>} $envelopes
   * @param {number[]} chain - Ordered indices of non-indented envelopes
   */
  const applyChainLines = ($envelopes, chain) => {
    // Clear previous line classes from all envelopes
    for (let i = 0; i < $envelopes.length; i += 1) {
      $envelopes[i].classList.remove(...LINE_CLASSES);
    }

    if (chain.length < 2) return;

    const first = chain[0];
    const last = chain[chain.length - 1];

    // First chain member: line from bottom half
    $envelopes[first].classList.add('chain-start');

    // Last chain member: line from top half
    $envelopes[last].classList.add('chain-end');

    // Middle chain members connect both up and down
    for (let c = 1; c < chain.length - 1; c += 1) {
      $envelopes[chain[c]].classList.add('chain-through');
    }

    // Walk each segment between consecutive chain members
    for (let seg = 0; seg < chain.length - 1; seg += 1) {
      const upperIdx = chain[seg];
      const lowerIdx = chain[seg + 1];
      const upperMid = $envelopes[upperIdx].dataset.messageId;

      for (let i = upperIdx + 1; i < lowerIdx; i += 1) {
        if (
          upperMid &&
          $envelopes[i].dataset.replyTo === upperMid &&
          $envelopes[i].classList.contains('indented')
        ) {
          $envelopes[i].classList.add('chain-tee');
        } else {
          $envelopes[i].classList.add('chain-through');
        }
      }
    }
  };

  /**
   * Set a specific message as focused by index, updating indent and highlight.
   * Assumes focus-active is already on the container.
   * @param {NodeListOf<HTMLElement>} $messages
   * @param {number} index
   */
  const setFocusedMessage = ($messages, index) => {
    const $prev = $messagesContainer.querySelector('.message-envelope.focused');
    if ($prev) {
      $prev.classList.remove('focused');
    }
    $messages[index].classList.add('focused');
    applyFocusIndent($messages, index);
  };

  /**
   * Apply passive focus to the last received message. This runs when
   * the command line has focus (send mode) so the user always sees
   * chain context around the most recent incoming message.
   */
  const updatePassiveFocus = () => {
    const $envelopes = /** @type {NodeListOf<HTMLElement>} */ (
      $messagesContainer.querySelectorAll('.message-envelope[data-number]')
    );
    if ($envelopes.length === 0) return;

    // Find the last received (non-sent) message envelope.
    let targetIndex = -1;
    for (let i = $envelopes.length - 1; i >= 0; i -= 1) {
      const $msg = $envelopes[i].querySelector('.message');
      if ($msg && !$msg.classList.contains('sent')) {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex === -1) return;

    $messagesContainer.classList.add('focus-active');
    const $prev = $messagesContainer.querySelector('.message-envelope.focused');
    if ($prev) {
      $prev.classList.remove('focused');
    }
    $envelopes[targetIndex].classList.add('focused');
    applyFocusIndent($envelopes, targetIndex);
  };

  /**
   * Enter focus mode: highlight the last message and show the focus modeline.
   */
  const enterFocusMode = () => {
    const $messages = /** @type {NodeListOf<HTMLElement>} */ (
      $messagesContainer.querySelectorAll('.message-envelope[data-number]')
    );
    if ($messages.length === 0) return;

    mode = 'focus';
    $input.blur();
    $messagesContainer.classList.add('focus-active');

    const lastIndex = $messages.length - 1;
    setFocusedMessage($messages, lastIndex);
    $messages[lastIndex].scrollIntoView({ block: 'nearest' });

    updateFocusModeline(); // eslint-disable-line no-use-before-define
  };

  /**
   * Exit focus mode: remove highlights and return to send mode.
   */
  const exitFocusMode = () => {
    mode = 'send';
    updateModeline(null);
    sendForm.focus();
    updateHasContent();
    // Revert to passive focus on the last received message.
    updatePassiveFocus();
  };

  // --- Pending-commands navigation ---
  //
  // The pending-commands region sits between the transcript and the input.
  // Arrow navigation threads through it: from the input, ↑ enters the region at
  // the card nearest the input; ↑ past the top hands off to durable-message
  // focus; ↓ past the bottom returns to the input. Escape dismisses the card the
  // cursor rests on. The region owns the cursor and dismissal (pending-commands
  // `focusEnd` / `moveCursor` / `dismissCursor` / `clearCursor`); this mode only
  // routes keys and the edge hand-offs.

  /**
   * Modeline for pending-navigation: up to the transcript, down to the input,
   * Escape to dismiss the hovered card.
   */
  const updatePendingModeline = () => {
    setModeline([
      { keys: ['↑'], text: 'messages' },
      { keys: ['↓'], text: 'input' },
      { keys: ['Esc'], text: 'dismiss' },
    ]);
  };

  /**
   * Enter pending-navigation mode: park the cursor on the card nearest `edge`
   * and blur the input so arrow keys drive the cursor. No-op when the region is
   * empty (callers guard on `pendingCommands.count()`).
   * @param {'top' | 'bottom'} edge
   */
  const enterPendingMode = edge => {
    if (!pendingCommands.focusEnd(edge)) return;
    mode = 'pending';
    $input.blur();
    updatePendingModeline();
  };

  /**
   * Leave pending-navigation mode and return to the command input.
   */
  function exitPendingToInput() {
    pendingCommands.clearCursor();
    mode = 'send';
    updateModeline(null);
    sendForm.focus();
    updateHasContent();
    updatePassiveFocus();
  }

  /**
   * Step up out of the send input: into the pending region (nearest card) when
   * it has cards, otherwise into durable-message focus. Shared by the input's
   * keydown handler and the window-level fallback so the ↑ gesture works even
   * when focus is not on the command input.
   */
  const enterNavFromInput = () => {
    if (pendingCommands.count() > 0) {
      enterPendingMode('bottom');
    } else {
      enterFocusMode();
    }
  };

  /**
   * Move focus to the next or previous message.
   * @param {'up' | 'down'} direction
   * @param {boolean} [page] - If true, jump by half a viewport
   */
  const moveFocus = (direction, page = false) => {
    const $messages = /** @type {NodeListOf<HTMLElement>} */ (
      $messagesContainer.querySelectorAll('.message-envelope[data-number]')
    );
    if ($messages.length === 0) return;

    const $current = $messagesContainer.querySelector(
      '.message-envelope.focused',
    );
    let index = $messages.length - 1;
    if ($current) {
      for (let i = 0; i < $messages.length; i += 1) {
        if ($messages[i] === $current) {
          index = i;
          break;
        }
      }
      $current.classList.remove('focused');
    }

    const step = page ? pageFocusStep($messages, index, direction) : 1; // eslint-disable-line no-use-before-define
    if (direction === 'up') {
      index = Math.max(0, index - step);
    } else {
      index = Math.min($messages.length - 1, index + step);
    }

    $messages[index].classList.add('focused');
    applyFocusIndent($messages, index);

    // At the edges, scroll the container to its limit so the focused
    // message aligns flush with the viewport edge. scrollIntoView with
    // 'nearest' does not reliably do this inside the #messages container
    // which uses large top padding.
    if (index === $messages.length - 1 && direction === 'down') {
      $messagesContainer.scrollTo(0, $messagesContainer.scrollHeight);
    } else if (index === 0 && direction === 'up') {
      $messagesContainer.scrollTo(0, 0);
    } else {
      $messages[index].scrollIntoView({ block: 'nearest' });
    }
  };

  /**
   * Count how many messages to skip to move roughly half a viewport,
   * by accumulating actual rendered heights from the current position.
   * @param {NodeListOf<HTMLElement>} $messages
   * @param {number} fromIndex - Current focused index
   * @param {'up' | 'down'} direction
   * @returns {number} Step count (at least 1)
   */
  const pageFocusStep = ($messages, fromIndex, direction) => {
    const budget = $messagesContainer.clientHeight / 2;
    let accumulated = 0;
    let count = 0;
    const delta = direction === 'up' ? -1 : 1;
    let i = fromIndex + delta;
    while (i >= 0 && i < $messages.length) {
      accumulated += $messages[i].offsetHeight + 8; // 8px margin-bottom
      count += 1;
      if (accumulated >= budget) break;
      i += delta;
    }
    return Math.max(1, count);
  };

  /**
   * Get the message number of the currently focused message.
   * @returns {string | undefined}
   */
  const getFocusedMessageNumber = () => {
    const $focused = /** @type {HTMLElement | null} */ (
      $messagesContainer.querySelector('.message-envelope.focused')
    );
    return $focused?.dataset.number;
  };

  /**
   * Update the modeline for focus mode.
   */
  const updateFocusModeline = () => {
    setModeline([
      { keys: ['r'], text: 'reply' },
      { keys: ['d'], text: 'dismiss' },
      { keys: ['a'], text: 'adopt' },
      { keys: ['g'], text: 'grant' },
      { keys: ['s'], text: 'submit' },
      { keys: ['Esc'], text: 'back' },
    ]);
  };

  // Click on a message enters focus mode (or changes focus if already in it)
  $messagesContainer.addEventListener('click', event => {
    const $target = /** @type {HTMLElement} */ (event.target);
    // Don't intercept clicks on interactive elements
    if (
      $target.tagName === 'INPUT' ||
      $target.tagName === 'TEXTAREA' ||
      $target.tagName === 'BUTTON' ||
      $target.tagName === 'A' ||
      $target.tagName === 'SELECT' ||
      $target.isContentEditable
    ) {
      return;
    }

    // Find the closest .message ancestor
    const $msg = $target.closest('.message-envelope');
    if (!$msg) return;

    const $messages = /** @type {NodeListOf<HTMLElement>} */ (
      $messagesContainer.querySelectorAll('.message-envelope[data-number]')
    );

    let clickIndex = -1;
    for (let i = 0; i < $messages.length; i += 1) {
      if ($messages[i] === $msg) {
        clickIndex = i;
        break;
      }
    }
    if (clickIndex === -1) return;

    if (mode !== 'focus') {
      mode = 'focus';
      $input.blur();
      $messagesContainer.classList.add('focus-active');
      updateFocusModeline();
    }

    setFocusedMessage($messages, clickIndex);
  });

  /**
   * Show the eval form (lazily initialize if needed).
   */
  const showEvalForm = async () => {
    if (!evalForm) {
      // Lazily initialize the eval form
      evalForm = await createEvalForm({
        $container: $evalFormContainer,
        E,
        powers,
        onSubmit: async data => {
          // Call E(powers).evaluate()
          // Split dot-notation pet names into paths for the evaluate API
          const codeNames = data.endowments.map(e => e.codeName);
          const petNamePaths = data.endowments.map(e => e.petName.split('/'));
          const resultNamePath = data.resultName
            ? data.resultName.split('/')
            : undefined;
          const workerName = data.workerName || '@main';

          await E(powers).evaluate(
            workerName,
            data.source,
            codeNames,
            petNamePaths,
            resultNamePath,
          );
        },
        onClose: () => {
          hideEvalForm(); // eslint-disable-line no-use-before-define
        },
        onShowWorker: workerId => {
          // Run Show Value for the worker that produced the error: reverse-resolve
          // the live worker remotable (anonymous fallback when unretained).
          void showWorkerValue(workerId);
        },
      });
    }

    mode = 'js';
    $evalFormBackdrop.style.display = 'block';
    $evalFormContainer.style.display = 'block';
    evalForm.show();
  };

  const hideEvalForm = () => {
    mode = 'send';
    $evalFormBackdrop.style.display = 'none';
    $evalFormContainer.style.display = 'none';
    if (evalForm) {
      evalForm.hide();
    }
    sendForm.focus();
  };

  // Click on backdrop closes eval form
  $evalFormBackdrop.addEventListener('click', () => {
    if (evalForm && evalForm.isDirty()) {
      // Could add confirmation here
    }
    hideEvalForm();
  });

  /**
   * Show the form builder modal.
   */
  const showFormBuilder = () => {
    if (!formBuilder) {
      formBuilder = createFormBuilder({
        $container: $formBuilderContainer,
        E,
        powers,
        onSubmit: async data => {
          await executor.execute('form', {
            recipient: data.recipient,
            description: data.description,
            fields: data.fields,
            resultName: data.resultName,
          });
        },
        onClose: () => {
          hideFormBuilder(); // eslint-disable-line no-use-before-define
        },
      });
    }

    mode = 'form';
    $formBuilderBackdrop.style.display = 'block';
    $formBuilderContainer.style.display = 'block';
    formBuilder.show();
  };

  const hideFormBuilder = () => {
    mode = 'send';
    $formBuilderBackdrop.style.display = 'none';
    $formBuilderContainer.style.display = 'none';
    if (formBuilder) {
      formBuilder.hide();
    }
    sendForm.focus();
  };

  // Click on backdrop closes form builder
  $formBuilderBackdrop.addEventListener('click', () => {
    hideFormBuilder();
  });

  /**
   * Show the endow modal for a specific definition message.
   *
   * @param {bigint} messageNumber
   */
  const showEndowModal = messageNumber => {
    if (!endowModal) {
      endowModal = createEndowModal({
        $container: $endowModalContainer,
        E,
        powers,
        onSubmit: async data => {
          await E(powers).endow(
            data.messageNumber,
            data.bindings,
            data.workerName,
            data.resultName,
          );
        },
        onClose: () => {
          hideEndowModal(); // eslint-disable-line no-use-before-define
        },
      });
    }

    mode = 'send';
    $endowModalBackdrop.style.display = 'block';
    $endowModalContainer.style.display = 'block';
    endowModal.show(messageNumber);
  };

  const hideEndowModal = () => {
    mode = 'send';
    $endowModalBackdrop.style.display = 'none';
    $endowModalContainer.style.display = 'none';
    if (endowModal) {
      endowModal.hide();
    }
    sendForm.focus();
  };

  // Click on backdrop closes endow modal
  $endowModalBackdrop.addEventListener('click', () => {
    hideEndowModal();
  });

  /**
   * Show the define form (lazily initialize if needed).
   */
  const showDefineForm = async () => {
    if (!defineForm) {
      defineForm = await createDefineForm({
        $container: $defineFormContainer,
        onSubmit: async data => {
          /** @type {Record<string, { label: string }>} */
          const slots = {};
          for (const slot of data.slots) {
            slots[slot.codeName] = { label: slot.label };
          }
          await E(
            /** @type {{ define: (source: string, slots: Record<string, { label: string }>) => Promise<unknown> }} */ (
              /** @type {unknown} */ (powers)
            ),
          ).define(data.source, slots);
        },
        onClose: () => {
          hideDefineForm(); // eslint-disable-line no-use-before-define
        },
      });
    }

    mode = 'js';
    $defineFormBackdrop.style.display = 'block';
    $defineFormContainer.style.display = 'block';
    defineForm.show();
  };

  const hideDefineForm = () => {
    mode = 'send';
    $defineFormBackdrop.style.display = 'none';
    $defineFormContainer.style.display = 'none';
    if (defineForm) {
      defineForm.hide();
    }
    sendForm.focus();
  };

  // Click on backdrop closes define form
  $defineFormBackdrop.addEventListener('click', () => {
    if (defineForm && defineForm.isDirty()) {
      // Could add confirmation here
    }
    hideDefineForm();
  });

  // The command cancel (header + footer) and submit buttons now live in the
  // confined `CommandChrome`; their clicks route through the controller's
  // `onCancel` (→ `exitCommandMode`) and `onSubmit` (→ here). Every "can I
  // submit?" read goes through the authoritative host-closure booleans, never
  // off the confined button's Preact `disabled`.
  async function submitCurrentCommand() {
    if (currentCommand && commandValid) {
      const data = inlineForm.getData();
      await executeWithSpinner(currentCommand, data);
    }
  }

  /**
   * Handle command selection.
   * @param {string} commandName
   */
  const handleCommandSelect = commandName => {
    commandPrefix = '';
    sendForm.clear();

    const command = getCommand(commandName);
    if (!command) {
      exitCommandMode();
      return;
    }

    // Route based on command mode
    switch (command.mode) {
      case 'modal':
        // Reset mode since we're leaving selecting state
        mode = 'send';
        if (commandName === 'js') {
          showEvalForm();
        } else if (commandName === 'form') {
          showFormBuilder();
        }
        break;

      case 'immediate':
        // Reset mode since we're leaving selecting state
        mode = 'send';
        // Special handling for exit command
        if (commandName === 'exit') {
          if (canExitProfile) {
            exitProfile();
          } else {
            $error.textContent = 'Already at home profile';
            setTimeout(() => {
              $error.textContent = '';
            }, 3000);
          }
          break;
        }
        // Execute immediately with current data
        executor.execute(commandName, {}).then(result => {
          if (result.success && result.value !== undefined) {
            showValue(result.value, undefined, undefined, undefined);
          }
        });
        // Refocus the input after immediate command
        setTimeout(() => $input.focus(), 50);
        break;

      case 'inline':
      default:
        enterCommandMode(commandName);
        break;
    }
  };

  const handleCommandCancel = () => {
    mode = 'send';
    commandPrefix = '';
    updateSendModeline(sendForm.getState());
  };

  /**
   * Get the current UI context for command filtering.
   * @returns {'inbox' | 'channel' | undefined}
   */
  const getCommandContext = () => {
    if (getChannelRef && getChannelRef()) return 'channel';
    return 'inbox';
  };

  // Initialize command selector
  const commandSelector = commandSelectorComponent({
    $menu: $commandMenu,
    onSelect: handleCommandSelect,
    onCancel: handleCommandCancel,
    getContext: getCommandContext,
  });

  /**
   * Get current input text.
   * @returns {string}
   */
  const getInputText = () => $input.textContent || '';

  // Handle input events for command detection
  $input.addEventListener('input', () => {
    const text = getInputText();

    // Update has-content class for showing/hiding send button
    updateHasContent();

    if (mode === 'selecting') {
      // Update filter as user types after "/"
      if (text.startsWith('/')) {
        commandPrefix = text.slice(1);
        commandSelector.filter(commandPrefix);
      } else {
        // User deleted the "/" - cancel command selection
        commandSelector.hide();
        mode = 'send';
        commandPrefix = '';
        updateSendModeline(sendForm.getState());
      }
    } else if (mode === 'send') {
      // Check if "/" was typed at the start of empty input
      if (text === '/') {
        mode = 'selecting';
        commandPrefix = '';
        commandSelector.show();
        updateSelectingModeline();
      }
    }
  });

  // Handle keydown for command selection navigation and focus mode entry
  $input.addEventListener('keydown', event => {
    // Plain ↑ from an empty send input steps up into the transcript — the
    // pending region (nearest card) when it has cards, else durable-message
    // focus. Plain arrows are the idiomatic gesture; ⌘↑ / Ctrl+↑ are left to
    // their native "move to start of field / document" meaning. Gated on an
    // empty input with no open token menu so it never hijacks text editing or
    // @-mention menu navigation.
    if (
      mode === 'send' &&
      event.key === 'ArrowUp' &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey
    ) {
      const state = sendForm.getState();
      if (state.isEmpty && !state.menuVisible) {
        event.preventDefault();
        event.stopPropagation();
        enterNavFromInput();
        return;
      }
    }

    if (mode === 'selecting' && commandSelector.isVisible()) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          commandSelector.selectNext();
          break;
        case 'ArrowUp':
          event.preventDefault();
          commandSelector.selectPrev();
          break;
        case 'Home':
          event.preventDefault();
          commandSelector.selectFirst();
          break;
        case 'End':
          event.preventDefault();
          commandSelector.selectLast();
          break;
        case 'PageDown':
          event.preventDefault();
          commandSelector.selectPageDown();
          break;
        case 'PageUp':
          event.preventDefault();
          commandSelector.selectPageUp();
          break;
        case 'Tab':
        case 'Enter':
        case ' ':
          event.preventDefault();
          event.stopImmediatePropagation();
          commandSelector.confirmSelection();
          break;
        case 'Escape':
          event.preventDefault();
          commandSelector.hide();
          sendForm.clear();
          mode = 'send';
          commandPrefix = '';
          updateSendModeline(sendForm.getState());
          break;
        default:
          break;
      }
    }
  });

  // Global escape key handler and focus mode keyboard handler
  const onFocusModeKeydown = (/** @type {KeyboardEvent} */ event) => {
    // Plain ↑ enters navigation (pending region or durable focus) from send
    // mode. The input's own keydown handler covers the common case and stops
    // propagation; this window-level copy is the fallback for when focus is NOT
    // on the command input (e.g. it drifted to the body / transcript), so the
    // gesture is not silently dropped. Skipped while another editable field
    // holds focus, so it never hijacks ↑ during text entry elsewhere.
    if (
      mode === 'send' &&
      event.key === 'ArrowUp' &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey
    ) {
      const active = document.activeElement;
      const editableFocused =
        !!active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          /** @type {HTMLElement} */ (active).isContentEditable);
      const state = sendForm.getState();
      if (!editableFocused && state.isEmpty && !state.menuVisible) {
        event.preventDefault();
        enterNavFromInput();
        return;
      }
    }

    // Pending-navigation keyboard handling: the cursor threads through the
    // region's cards; ↑ past the top hands off to durable focus, ↓ past the
    // bottom returns to the input, Escape dismisses the hovered card.
    if (mode === 'pending') {
      // Dismiss the hovered card with Escape or the delete/backspace keys (the
      // ergonomic "remove this" gesture); returning to the input when it was the
      // last card.
      if (
        event.key === 'Escape' ||
        event.key === 'Delete' ||
        event.key === 'Backspace'
      ) {
        event.preventDefault();
        if (pendingCommands.dismissCursor() === 'empty') {
          exitPendingToInput();
        }
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        // Past the top card, hand off to durable-message focus — but only when
        // there is a transcript to enter; otherwise keep the cursor on the top
        // card (`enterFocusMode` no-ops on an empty transcript, which would
        // otherwise strand the cursor). `moveCursor` left the cursor in place.
        const hasMessages =
          $messagesContainer.querySelectorAll('.message-envelope[data-number]')
            .length > 0;
        if (pendingCommands.moveCursor('up') === 'exit-top' && hasMessages) {
          pendingCommands.clearCursor();
          enterFocusMode();
        }
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (pendingCommands.moveCursor('down') === 'exit-bottom') {
          exitPendingToInput();
        }
        return;
      }
      return;
    }

    // Focus mode keyboard handling
    if (mode === 'focus') {
      if (event.key === 'Escape') {
        event.preventDefault();
        exitFocusMode();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveFocus('up');
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        // If already on the last message, step down out of durable focus: into
        // the pending region (its top card, nearest the transcript) when it has
        // cards, otherwise back to the command line.
        const $msgs = $messagesContainer.querySelectorAll(
          '.message-envelope[data-number]',
        );
        const $foc = $messagesContainer.querySelector(
          '.message-envelope.focused',
        );
        if ($msgs.length > 0 && $foc === $msgs[$msgs.length - 1]) {
          if (pendingCommands.count() > 0) {
            // Reset the transcript to its passive resting highlight, then enter
            // the region.
            updatePassiveFocus();
            enterPendingMode('top');
          } else {
            exitFocusMode();
          }
        } else {
          moveFocus('down');
        }
        return;
      }
      if (event.key === 'PageUp') {
        event.preventDefault();
        moveFocus('up', true);
        return;
      }
      if (event.key === 'PageDown') {
        event.preventDefault();
        moveFocus('down', true);
        return;
      }
      // Single-letter shortcut keys
      const commandName = FOCUS_SHORTCUTS[event.key];
      if (commandName) {
        event.preventDefault();
        const messageNumber = getFocusedMessageNumber();
        if (messageNumber) {
          exitFocusMode();
          enterCommandMode(commandName, { messageNumber });
        }
        return;
      }
      return;
    }

    if (event.key === 'Escape') {
      if (helpModal.isVisible()) {
        event.preventDefault();
        helpModal.hide();
        sendForm.focus();
      } else if (mode === 'form') {
        event.preventDefault();
        hideFormBuilder();
      } else if (mode === 'inline') {
        event.preventDefault();
        exitCommandMode();
      } else if (mode === 'send') {
        event.preventDefault();
        const state = sendForm.getState();
        if (state.isEmpty && exitConversation && getConversationPetName?.()) {
          exitConversation();
        } else {
          sendForm.clear();
          sendForm.clearReplyTo();
          $error.textContent = '';
          updateHasContent();
        }
      }
    }
  };
  window.addEventListener('keydown', onFocusModeKeydown);

  // Auto-focus the command line and initialize modeline
  sendForm.focus();
  updateHasContent();

  // Focus command line on any keypress when nothing else is focused
  const onGlobalKeypressFocus = (/** @type {KeyboardEvent} */ event) => {
    // Skip if not in send mode (command mode, focus mode, etc.)
    if (mode !== 'send') return;

    const active = document.activeElement;
    if (
      active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.tagName === 'BUTTON' ||
        /** @type {HTMLElement} */ (active).isContentEditable)
    ) {
      return;
    }

    // Skip modifier keys and special keys
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.key === 'Escape' ||
      event.key === 'Tab' ||
      event.key.startsWith('Arrow') ||
      event.key.startsWith('F') ||
      event.key === 'Enter' ||
      event.key === 'Backspace' ||
      event.key === 'Delete'
    ) {
      return;
    }

    // Focus the command line
    sendForm.focus();

    // For printable characters, insert them
    if (event.key.length === 1) {
      document.execCommand('insertText', false, event.key);
      event.preventDefault();
    }
  };
  window.addEventListener('keydown', onGlobalKeypressFocus);

  // Watch for new messages and update passive focus unless the user
  // is actively navigating in focus mode.
  const messageObserver = new MutationObserver(() => {
    if (mode !== 'focus') {
      updatePassiveFocus();
    }
  });
  messageObserver.observe($messagesContainer, { childList: true });

  // Apply passive focus on initial load.
  updatePassiveFocus();

  return harden({
    setReplyTo: sendForm.setReplyTo,
    clearReplyTo: sendForm.clearReplyTo,
    setDefaultReplyTo: sendForm.setDefaultReplyTo,
    clearDefaultReplyTo: sendForm.clearDefaultReplyTo,
    setReplyType: sendForm.setReplyType,
    getReplyType: sendForm.getReplyType,
    setText: sendForm.setText,
    focus: sendForm.focus,
    dispose: () => {
      messageObserver.disconnect();
      document.removeEventListener('click', onDocumentClick);
      window.removeEventListener('keydown', onFocusModeKeydown);
      window.removeEventListener('keydown', onGlobalKeypressFocus);
      unmount($modelineMount);
      unmount($commandPopoverMount);
      unmount($commandHeaderMount);
      unmount($commandFooterMount);
      sendForm.dispose();
    },
  });
};
harden(chatBarComponent);
