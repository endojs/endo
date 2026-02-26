// @ts-check
/* global window, document, setTimeout */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/far';
import { makeRefIterator } from './ref-iterator.js';
import { sendFormComponent } from './send-form.js';
import { commandSelectorComponent } from './command-selector.js';
import { createEvalForm } from './eval-form.js';
import { createCounterProposalForm } from './counter-proposal-form.js';
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

  /** @type {'send' | 'selecting' | 'inline' | 'js'} */
  let mode = 'send';
  let commandPrefix = '';
  /** @type {string | null} */
  let currentCommand = null;

  /** @type {import('./eval-form.js').EvalFormAPI | null} */
  let evalForm = null;

  /** @type {import('./counter-proposal-form.js').CounterProposalFormAPI | null} */
  let counterProposalForm = null;

  // Initialize the send form component
  const sendForm = sendFormComponent({
    $input,
    $menu: $tokenMenu,
    $error,
    $sendButton,
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
  });

  // Initialize command executor
  const executor = createCommandExecutor({
    powers,
    showValue,
    showMessage: message => {
      // For now, just log messages - could add a toast system later
      console.log(message);
    },
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
    let html = '<div class="command-popover-header">Commands</div>';

    for (const category of categories) {
      const commands = getCommandsByCategory(category);
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

  // Initialize inline command form
  const inlineForm = createInlineCommandForm({
    $container: $inlineFormContainer,
    E,
    powers,
    onSubmit: async (commandName, data) => {
      messagePicker.disable();
      $commandError.textContent = '';

      // Special handling for enter command - uses profile navigation
      if (commandName === 'enter') {
        const { hostName } = /** @type {{ hostName: string }} */ (data);
        exitCommandMode(); // eslint-disable-line no-use-before-define
        await enterProfile(hostName);
        return;
      }

      // For js/eval: reset command line immediately so guest proposals don't block the UI.
      // (Guest evaluate() resolves only when the host grants; we show the result when it does.)
      const isEval = commandName === 'js' || commandName === 'eval';
      if (isEval) {
        exitCommandMode(); // eslint-disable-line no-use-before-define
      }

      const result = await executor.execute(commandName, data);
      if (result.success) {
        if (!isEval) {
          exitCommandMode(); // eslint-disable-line no-use-before-define
        }
        const resultName =
          'resultName' in data && data.resultName
            ? String(data.resultName)
            : undefined;
        const resultPath = resultName ? resultName.split('.') : undefined;
        // Always show js results (even undefined), skip show/list which handle their own display
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
      // Error case: showError callback already set $commandError or $error.textContent
    },
    onCancel: () => {
      messagePicker.disable();
      exitCommandMode(); // eslint-disable-line no-use-before-define
    },
    onValidityChange: isValid => {
      $commandSubmitButton.disabled = !isValid;
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
          workerName: 'MAIN',
          cursorPosition: data.cursorPosition,
        });
      }
    },
    getMessageEdgeNames: async messageNumber => {
      try {
        const messages = await E(powers).listMessages();
        const targetNumber = BigInt(messageNumber);
        const message = messages.find(m => m.number === targetNumber);
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
   */
  const enterCommandMode = commandName => {
    const command = getCommand(commandName);
    if (!command) return;

    mode = 'inline';
    currentCommand = commandName;
    $chatBar.classList.add('command-mode');
    $commandLabel.textContent = command.label;
    $commandSubmitButton.textContent = command.submitLabel || 'Execute';
    $commandSubmitButton.disabled = true;
    updateModeline(commandName);

    inlineForm.setCommand(commandName);

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

    // Focus the first field after a brief delay for DOM update
    setTimeout(() => {
      inlineForm.focus();
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
          const petNamePaths = data.endowments.map(e => e.petName.split('.'));
          const resultNamePath = data.resultName
            ? data.resultName.split('.')
            : undefined;
          const workerName = data.workerName || 'MAIN';

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
          const petNamePaths = data.endowments.map(e => e.petName.split('.'));
          const resultNamePath = data.resultName
            ? data.resultName.split('.')
            : undefined;
          const workerName = data.workerName || 'MAIN';

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
    if (currentCommand && inlineForm.isValid()) {
      $commandError.textContent = '';
      const data = inlineForm.getData();

      // Special handling for enter command - uses profile navigation
      if (currentCommand === 'enter') {
        const { hostName } = /** @type {{ hostName: string }} */ (data);
        exitCommandMode();
        await enterProfile(hostName);
        return;
      }

      // For js/eval: reset command line immediately so guest proposals don't block the UI
      const isEval = currentCommand === 'js' || currentCommand === 'eval';
      if (isEval) {
        exitCommandMode();
      }

      const result = await executor.execute(currentCommand, data);
      if (result.success) {
        if (!isEval) {
          exitCommandMode();
        }
        const resultName =
          'resultName' in data && data.resultName
            ? String(data.resultName)
            : undefined;
        const resultPath = resultName ? resultName.split('.') : undefined;
        // Always show js results (even undefined), skip show/list which handle their own display
        if (currentCommand === 'js') {
          showValue(result.value, undefined, resultPath, undefined);
        } else if (
          result.value !== undefined &&
          currentCommand !== 'show' &&
          currentCommand !== 'list'
        ) {
          showValue(result.value, undefined, resultPath, undefined);
        }
      }
      // Error case: showError callback already set $commandError or $error.textContent
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
        // For now only js uses modal
        if (commandName === 'js') {
          showEvalForm();
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

  // Initialize command selector
  const commandSelector = commandSelectorComponent({
    $menu: $commandMenu,
    onSelect: handleCommandSelect,
    onCancel: handleCommandCancel,
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

  // Handle keydown for command selection navigation
  $input.addEventListener('keydown', event => {
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

  // Global escape key handler
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (helpModal.isVisible()) {
        event.preventDefault();
        helpModal.hide();
        sendForm.focus();
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
    // Skip if in command mode or if already focused on an interactive element
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
};
