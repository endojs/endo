// @ts-check

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/far';
import { makeRefIterator } from './ref-iterator.js';
import { sendFormComponent } from './send-form.js';
import { commandSelectorComponent } from './command-selector.js';
import { createEvalForm } from './eval-form.js';
import { createCounterProposalForm } from './counter-proposal-form.js';
import { createFormBuilder } from './form-builder.js';
import { createInlineCommandForm } from './inline-command-form.js';
import { createCommandExecutor } from './command-executor.js';
import {
  getCommand,
  getCategories,
  getCommandsByCategory,
} from './command-registry.js';
import { createMessagePicker } from './message-picker.js';
import { createHelpModal } from './help-modal.js';
import { kbd, modKey } from './platform-keys.js';

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
  const $commandError = /** @type {HTMLElement} */ (
    $parent.querySelector('#command-error')
  );
  const $evalFormContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#eval-form-container')
  );
  const $evalFormBackdrop = /** @type {HTMLElement} */ (
    $parent.querySelector('#eval-form-backdrop')
  );
  const $counterProposalContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#counter-proposal-container')
  );
  const $counterProposalBackdrop = /** @type {HTMLElement} */ (
    $parent.querySelector('#counter-proposal-backdrop')
  );
  const $formBuilderContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#form-builder-container')
  );
  const $formBuilderBackdrop = /** @type {HTMLElement} */ (
    $parent.querySelector('#form-builder-backdrop')
  );
  const $inlineFormContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#inline-form-container')
  );
  const $commandLabel = /** @type {HTMLElement} */ (
    $parent.querySelector('#command-label')
  );
  const $commandCancel = /** @type {HTMLElement} */ (
    $parent.querySelector('#command-cancel')
  );
  const $commandSubmitButton = /** @type {HTMLButtonElement} */ (
    $parent.querySelector('#command-submit-button')
  );
  const $commandCancelFooter = /** @type {HTMLElement} */ (
    $parent.querySelector('#command-cancel-footer')
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

  /**
   * Update the modeline content based on the current mode.
   * @param {string | null} commandName
   */
  const updateModeline = commandName => {
    if (!commandName) {
      $chatBar.classList.remove('has-modeline');
      $modeline.innerHTML = '';
      return;
    }

    // Resolve alias to get the actual command
    const command = getCommand(commandName);
    let hints = '';
    if (command && command.name === 'js') {
      hints = `
        <span class="modeline-hint"><kbd>@</kbd> add endowment</span>
        <span class="modeline-hint"><kbd>Enter</kbd> evaluate</span>
        <span class="modeline-hint">${kbd(modKey, 'Enter')} expand to editor</span>
        <span class="modeline-hint"><kbd>Esc</kbd> cancel</span>
      `;
    } else {
      hints = `
        <span class="modeline-hint"><kbd>Enter</kbd> submit</span>
        <span class="modeline-hint"><kbd>Tab</kbd> next field</span>
        <span class="modeline-hint"><kbd>Esc</kbd> cancel</span>
      `;
    }

    $modeline.innerHTML = hints;
    $chatBar.classList.add('has-modeline');
  };

  /** @type {'send' | 'selecting' | 'inline' | 'js' | 'form' | 'focus'} */
  let mode = 'send';
  let commandPrefix = '';
  /** @type {string | null} */
  let currentCommand = null;

  /** @type {import('./eval-form.js').EvalFormAPI | null} */
  let evalForm = null;

  /** @type {import('./counter-proposal-form.js').CounterProposalFormAPI | null} */
  let counterProposalForm = null;

  /** @type {import('./form-builder.js').FormBuilderAPI | null} */
  let formBuilder = null;

  // Initialize the send form component
  const sendForm = sendFormComponent({
    $input,
    $menu: $tokenMenu,
    $error,
    $sendButton,
    $chatBar,
    E,
    makeRefIterator,
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
  });

  // Initialize command executor
  const executor = createCommandExecutor({
    powers,
    showValue,
    showMessage: message => {
      // For now, just log messages - could add a toast system later
      console.log(message);
    },
    getChannelRef,
    showError: error => {
      const message = error?.message || String(error) || 'Unknown error';
      // Use command error element in command mode, chat error otherwise
      if (mode === 'inline') {
        $commandError.textContent = message;
      } else {
        $error.textContent = message;
      }
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
        $modeline.innerHTML = `
          <span class="modeline-hint">select reference</span>
          <span class="modeline-hint"><kbd>Space</kbd> embed</span>
          <span class="modeline-hint"><kbd>↑↓</kbd> navigate</span>
          <span class="modeline-hint"><kbd>Esc</kbd> cancel</span>
        `;
      } else if (hasToken || hasText) {
        $modeline.innerHTML = `
          <span class="modeline-hint"><kbd>Enter</kbd> send</span>
          <span class="modeline-hint"><kbd>@</kbd> embed reference</span>
          <span class="modeline-hint"><kbd>/</kbd> commands</span>
        `;
      } else {
        $modeline.innerHTML = `
          <span class="modeline-hint"><kbd>@</kbd> embed reference</span>
          <span class="modeline-hint"><kbd>/</kbd> commands</span>
          <span class="modeline-hint"><kbd>Esc</kbd> back to inbox</span>
        `;
      }
      $chatBar.classList.add('has-modeline');
      return;
    }

    // Determine modeline content based on state
    if (menuVisible) {
      // Token menu is showing (typing @name)
      $modeline.innerHTML = `
        <span class="modeline-hint">select reference</span>
        <span class="modeline-hint"><kbd>Space</kbd> chat</span>
        <span class="modeline-hint"><kbd>Enter</kbd> inspect</span>
        <span class="modeline-hint"><kbd>↑↓</kbd> navigate</span>
        <span class="modeline-hint"><kbd>Esc</kbd> cancel</span>
      `;
    } else if (hasToken && hasText) {
      // Has token and message text - ready to send
      $modeline.innerHTML = `
        <span class="modeline-hint"><kbd>Enter</kbd> send</span>
        <span class="modeline-hint"><kbd>@</kbd> embed reference</span>
        <span class="modeline-hint"><kbd>⌫</kbd> delete chip</span>
      `;
    } else if (hasToken && !hasText) {
      // Just a token, no message - can inspect or start typing
      $modeline.innerHTML = `
        <span class="modeline-hint"><kbd>Enter</kbd> inspect or write message</span>
        <span class="modeline-hint"><kbd>⌫</kbd> delete chip</span>
      `;
    } else if (isEmpty) {
      // Empty input - show default hints
      const lastRecipient = sendForm.getLastRecipient();
      if (lastRecipient) {
        $modeline.innerHTML = `
          <span class="modeline-hint">sending to @${lastRecipient}</span>
          <span class="modeline-hint"><kbd>@</kbd> inspect or message</span>
          <span class="modeline-hint"><kbd>/</kbd> commands</span>
        `;
      } else {
        $modeline.innerHTML = `
          <span class="modeline-hint"><kbd>@</kbd> inspect or message</span>
          <span class="modeline-hint"><kbd>/</kbd> commands</span>
        `;
      }
    } else {
      // Text only without token
      const lastRecipient = sendForm.getLastRecipient();
      if (lastRecipient) {
        $modeline.innerHTML = `
          <span class="modeline-hint"><kbd>Enter</kbd> send to @${lastRecipient}</span>
          <span class="modeline-hint"><kbd>@</kbd> embed reference</span>
        `;
      } else {
        $modeline.innerHTML = `
          <span class="modeline-hint"><kbd>@</kbd> add recipient to send</span>
        `;
      }
    }
    $chatBar.classList.add('has-modeline');
  };

  /**
   * Update modeline for command selection mode.
   */
  const updateSelectingModeline = () => {
    $modeline.innerHTML = `
      <span class="modeline-hint">type command name</span>
      <span class="modeline-hint"><kbd>↑↓</kbd> navigate</span>
      <span class="modeline-hint"><kbd>Enter</kbd> select</span>
      <span class="modeline-hint"><kbd>Esc</kbd> cancel</span>
    `;
    $chatBar.classList.add('has-modeline');
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

  /**
   * Render the command popover content.
   */
  const renderCommandPopover = () => {
    const categories = getCategories();
    const context = getCommandContext();
    let html = '<div class="command-popover-header">Commands</div>';

    for (const category of categories) {
      const commands = getCommandsByCategory(category, context);
      if (commands.length !== 0) {
        const label = CATEGORY_LABELS[category] || category;

        html += '<div class="command-popover-section">';
        html += `<div class="command-popover-category">${label}</div>`;

        for (const cmd of commands) {
          html += `
            <div class="command-popover-item" data-command="${cmd.name}">
              <span class="command-popover-item-name">/${cmd.name}</span>
              <span class="command-popover-item-desc">${cmd.description}</span>
            </div>
          `;
        }

        html += '</div>';
      }
    }

    html +=
      '<div class="command-popover-footer">Type <kbd>/</kbd> in input for quick access</div>';
    $commandPopover.innerHTML = html;

    // Attach click handlers
    const $items = $commandPopover.querySelectorAll('.command-popover-item');
    for (const $item of $items) {
      $item.addEventListener('click', () => {
        const cmdName = /** @type {HTMLElement} */ ($item).dataset.command;
        if (cmdName) {
          hideCommandPopover(); // eslint-disable-line no-use-before-define
          handleCommandSelect(cmdName); // eslint-disable-line no-use-before-define
        }
      });
    }
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

  // Close popover when clicking outside
  document.addEventListener('click', event => {
    if (
      !$commandPopover.contains(/** @type {Node} */ (event.target)) &&
      !$menuButton.contains(/** @type {Node} */ (event.target))
    ) {
      hideCommandPopover();
    }
  });

  let commandSubmitting = false;

  const setCommandSubmitting = (/** @type {boolean} */ value) => {
    commandSubmitting = value;
    if (value) {
      $chatBar.classList.add('submitting');
      $commandSubmitButton.classList.add('btn-spinner');
      $commandSubmitButton.disabled = true;
      inlineForm.setDisabled(true); // eslint-disable-line no-use-before-define
    } else {
      $chatBar.classList.remove('submitting');
      $commandSubmitButton.classList.remove('btn-spinner');
      inlineForm.setDisabled(false); // eslint-disable-line no-use-before-define
      $commandSubmitButton.disabled = !inlineForm.isValid(); // eslint-disable-line no-use-before-define
    }
  };

  /**
   * Run a command with spinner/disabled state management.
   *
   * @param {string} commandName
   * @param {Record<string, unknown>} data
   */
  const executeWithSpinner = async (commandName, data) => {
    messagePicker.disable();
    $commandError.textContent = '';

    if (commandName === 'enter') {
      const { hostName } = /** @type {{ hostName: string }} */ (data);
      exitCommandMode(); // eslint-disable-line no-use-before-define
      await enterProfile(hostName);
      return;
    }

    // For js/eval: reset command line immediately so guest proposals don't block the UI.
    const isEval = commandName === 'js' || commandName === 'eval';
    if (isEval) {
      exitCommandMode(); // eslint-disable-line no-use-before-define
    } else {
      setCommandSubmitting(true);
    }

    try {
      const result = await executor.execute(commandName, data);
      if (result.success) {
        if (!isEval) {
          exitCommandMode(); // eslint-disable-line no-use-before-define
        }
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
    } finally {
      if (!isEval) {
        setCommandSubmitting(false);
      }
    }
  };

  // Initialize inline command form
  const inlineForm = createInlineCommandForm({
    $container: $inlineFormContainer,
    E,
    powers,
    makeRefIterator,
    onSubmit: async (commandName, data) => {
      if (commandSubmitting) return;
      await executeWithSpinner(commandName, data);
    },
    onCancel: () => {
      messagePicker.disable();
      exitCommandMode(); // eslint-disable-line no-use-before-define
    },
    onValidityChange: isValid => {
      if (!commandSubmitting) {
        $commandSubmitButton.disabled = !isValid;
      }
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
    getMessageEdgeNames: async messageNumber => {
      try {
        // In channel mode, look up edge names from channel messages
        const channelRef = getChannelRef ? getChannelRef() : null;
        const messageList = channelRef
          ? await E(channelRef).listMessages()
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
    $commandLabel.textContent = command.label;
    $commandSubmitButton.textContent = command.submitLabel || 'Execute';
    $commandSubmitButton.disabled = true;
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
   */
  const exitCommandMode = () => {
    mode = 'send';
    currentCommand = null;
    $chatBar.classList.remove('command-mode');
    updateModeline(null);
    messagePicker.disable();
    activeMessageNumberInput = null;
    inlineForm.clear();
    sendForm.clear();
    sendForm.focus();
    $error.textContent = '';
    $commandError.textContent = '';
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
    $modeline.innerHTML = `
      <span class="modeline-hint"><kbd>r</kbd> reply</span>
      <span class="modeline-hint"><kbd>d</kbd> dismiss</span>
      <span class="modeline-hint"><kbd>a</kbd> adopt</span>
      <span class="modeline-hint"><kbd>g</kbd> grant</span>
      <span class="modeline-hint"><kbd>s</kbd> submit</span>
      <span class="modeline-hint"><kbd>Esc</kbd> back</span>
    `;
    $chatBar.classList.add('has-modeline');
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
   * Show the counter-proposal form with proposal data.
   * @param {object} proposalData
   * @param {bigint} proposalData.messageNumber
   * @param {string} proposalData.source
   * @param {string[]} proposalData.codeNames
   * @param {string[]} proposalData.edgeNames
   * @param {string} proposalData.workerName
   * @param {string} proposalData.resultName
   */
  const showCounterProposalForm = async proposalData => {
    if (!counterProposalForm) {
      // Lazily initialize the counter-proposal form
      counterProposalForm = await createCounterProposalForm({
        $container: $counterProposalContainer,
        E,
        powers,
        onSubmit: async data => {
          // Call E(powers).counterEvaluate()
          const codeNames = data.endowments.map(e => e.codeName);
          const petNamePaths = data.endowments.map(e => e.petName.split('/'));
          const resultNamePath = data.resultName
            ? data.resultName.split('/')
            : undefined;
          const workerName = data.workerName || '@main';

          await E(powers).counterEvaluate(
            data.messageNumber,
            data.source,
            codeNames,
            petNamePaths,
            workerName,
            resultNamePath,
          );
        },
        onClose: () => {
          hideCounterProposalForm(); // eslint-disable-line no-use-before-define
        },
      });
    }

    // Convert arrays to endowments format
    const endowments = proposalData.codeNames.map((codeName, i) => ({
      codeName,
      petName: proposalData.edgeNames[i] || '',
    }));

    counterProposalForm.setProposal({
      messageNumber: proposalData.messageNumber,
      source: proposalData.source,
      endowments,
      workerName: proposalData.workerName,
      resultName: proposalData.resultName,
    });

    $counterProposalBackdrop.style.display = 'block';
    $counterProposalContainer.style.display = 'block';
    counterProposalForm.show();
  };

  const hideCounterProposalForm = () => {
    $counterProposalBackdrop.style.display = 'none';
    $counterProposalContainer.style.display = 'none';
    if (counterProposalForm) {
      counterProposalForm.hide();
    }
    sendForm.focus();
  };

  // Click on backdrop closes counter-proposal form
  $counterProposalBackdrop.addEventListener('click', () => {
    hideCounterProposalForm();
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

  // Listen for counter-proposal events from message buttons
  $parent.addEventListener('open-counter-proposal', event => {
    const { detail } = /** @type {CustomEvent} */ (event);
    showCounterProposalForm(detail);
  });

  // Command cancel button (header)
  $commandCancel.addEventListener('click', () => {
    exitCommandMode();
  });

  // Command cancel button (footer - far right)
  $commandCancelFooter.addEventListener('click', () => {
    exitCommandMode();
  });

  // Command submit button
  $commandSubmitButton.addEventListener('click', async () => {
    if (commandSubmitting) return;
    if (currentCommand && inlineForm.isValid()) {
      const data = inlineForm.getData();
      await executeWithSpinner(currentCommand, data);
    }
  });

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
        // Special handling for help command
        if (commandName === 'help') {
          helpModal.show();
          break;
        }
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
    // ⌘↑ / Ctrl+↑ to enter focus mode from empty send input
    if (
      mode === 'send' &&
      event.key === 'ArrowUp' &&
      (event.metaKey || event.ctrlKey) &&
      sendForm.getState().isEmpty
    ) {
      event.preventDefault();
      event.stopPropagation();
      enterFocusMode();
      return;
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
  window.addEventListener('keydown', event => {
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
        // If already on the last message, exit focus mode back to command line
        const $msgs = $messagesContainer.querySelectorAll(
          '.message-envelope[data-number]',
        );
        const $foc = $messagesContainer.querySelector(
          '.message-envelope.focused',
        );
        if ($msgs.length > 0 && $foc === $msgs[$msgs.length - 1]) {
          exitFocusMode();
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
  });

  // Auto-focus the command line and initialize modeline
  sendForm.focus();
  updateHasContent();

  // Focus command line on any keypress when nothing else is focused
  window.addEventListener('keydown', event => {
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
  });

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

  return {
    setReplyTo: sendForm.setReplyTo,
    clearReplyTo: sendForm.clearReplyTo,
    setDefaultReplyTo: sendForm.setDefaultReplyTo,
    clearDefaultReplyTo: sendForm.clearDefaultReplyTo,
    dispose: sendForm.dispose,
  };
};
