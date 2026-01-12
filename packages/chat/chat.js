// @ts-check
/* global window, document, requestAnimationFrame, Intl, navigator, setTimeout */
/* eslint-disable no-continue */

import { E } from '@endo/far';
import { passStyleOf, getInterfaceOf } from '@endo/pass-style';
import { makeRefIterator } from './ref-iterator.js';
import { sendFormComponent } from './send-form.js';
import { commandSelectorComponent } from './command-selector.js';
import { createEvalForm } from './eval-form.js';
import { createInlineCommandForm } from './inline-command-form.js';
import { createCommandExecutor } from './command-executor.js';
import { getCommand, getCategories, getCommandsByCategory } from './command-registry.js';
import { createMessagePicker } from './message-picker.js';
import { createHelpModal } from './help-modal.js';
import { prepareTextWithPlaceholders, renderMarkdown } from './markdown-render.js';

const template = `
<div id="pets">
  <div class="inventory-header">
    <span class="inventory-title">Inventory</span>
    <label class="inventory-toggle">
      <input type="checkbox" id="show-special-toggle">
      <span>SPECIAL</span>
    </label>
  </div>
  <div class="pet-list"></div>
  <div id="profile-bar"></div>
</div>

<div id="resize-handle"></div>

<div id="messages">
  <div id="anchor"></div>
</div>

<div id="chat-bar">
  <div class="command-row">
    <div class="command-header">
      <span class="command-label" id="command-label">Command</span>
      <button class="command-cancel" id="command-cancel" title="Cancel (Esc)">&times;</button>
    </div>
    <div id="chat-input-wrapper">
      <div id="chat-message" contenteditable="true" data-placeholder="Type / for commands, or @recipient message..."></div>
      <div id="token-menu" class="token-menu"></div>
      <div id="command-menu" class="token-menu"></div>
      <div id="chat-error"></div>
    </div>
    <div id="inline-form-container"></div>
    <div id="command-error"></div>
    <div class="command-footer">
      <button id="command-submit-button">Execute</button>
      <button class="command-cancel-footer" id="command-cancel-footer" title="Cancel (Esc)">&times;</button>
    </div>
    <div id="chat-button-wrapper" style="position: relative;">
      <button id="chat-menu-button" title="Commands">🐈‍⬛</button>
      <button id="chat-send-button">Send</button>
      <div id="chat-command-popover"></div>
    </div>
  </div>
  <div id="chat-modeline"></div>
</div>

<div id="eval-form-backdrop"></div>
<div id="eval-form-container"></div>


<div id="value-frame" class="frame">
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
      <div class="value-save-form">
        <label>Save as:</label>
        <input type="text" id="value-save-name" placeholder="pet.name.path" />
        <button id="value-save-button">Save</button>
      </div>
      <button id="value-enter-profile" style="display: none;">Enter Profile</button>
      <button id="value-close">Close</button>
    </div>
  </div>
</div>

<div id="help-modal-container"></div>
`;

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'full',
  timeStyle: 'long',
});
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  timeStyle: 'short',
});

/**
 * @param {Date} date
 * @returns {string}
 */
const relativeTime = date => {
  const now = Date.now();
  const then = date.getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return '';
};

const numberFormatter = new Intl.NumberFormat();

/**
 * @param {HTMLElement} $parent
 * @param {HTMLElement | null} $end
 * @param {unknown} powers
 */
const inboxComponent = async ($parent, $end, powers) => {
  $parent.scrollTo(0, $parent.scrollHeight);

  const selfId = await E(powers).identify('SELF');
  for await (const message of makeRefIterator(E(powers).followMessages())) {
    // Read DOM at animation frame to determine whether to pin scroll to bottom
    // of the messages pane.
    const wasAtEnd = await new Promise(resolve =>
      requestAnimationFrame(() => {
        const scrollTop = /** @type {number} */ ($parent.scrollTop);
        const endScrollTop = /** @type {number} */ (
          $parent.scrollHeight - $parent.clientHeight
        );
        resolve(scrollTop > endScrollTop - 10);
      }),
    );

    const { number, from: fromId, to: toId, date, dismissed } = message;

    const isSent = fromId === selfId;

    const $message = document.createElement('div');
    $message.className = isSent ? 'message sent' : 'message';

    const $error = document.createElement('span');
    $error.style.color = 'red';
    $error.innerText = '';

    dismissed.then(() => {
      $message.remove();
    });

    const parsedDate = new Date(date);
    const $timestamp = document.createElement('span');
    $timestamp.className = 'timestamp';
    $timestamp.innerText = timeFormatter.format(parsedDate);

    const $tooltip = document.createElement('span');
    $tooltip.className = 'timestamp-tooltip';

    const $controls = document.createElement('span');
    $controls.className = 'timestamp-controls';

    const $msgNum = document.createElement('span');
    $msgNum.className = 'timestamp-num';
    $msgNum.innerText = `#${number}`;
    $controls.appendChild($msgNum);

    const $dismiss = document.createElement('button');
    $dismiss.className = 'dismiss-button';
    $dismiss.innerText = '×';
    $dismiss.title = 'Dismiss';
    $dismiss.onclick = () => {
      E(powers)
        .dismiss(number)
        .catch(error => {
          $error.innerText = ` ${error.message}`;
        });
    };
    $controls.appendChild($dismiss);

    $tooltip.appendChild($controls);

    const $times = document.createElement('span');
    $times.className = 'timestamp-times';
    const relative = relativeTime(parsedDate);
    const timeLines = [date, dateFormatter.format(parsedDate), relative].filter(
      Boolean,
    );
    for (const line of timeLines) {
      const $line = document.createElement('div');
      $line.className = 'timestamp-line';

      const $text = document.createElement('span');
      $text.innerText = line;
      $line.appendChild($text);

      const $copy = document.createElement('span');
      $copy.className = 'timestamp-copy';
      $copy.innerText = '⧉';
      $line.appendChild($copy);

      $line.onclick = () => {
        navigator.clipboard.writeText(line).then(() => {
          $copy.innerText = '✓';
          setTimeout(() => {
            $copy.innerText = '⧉';
          }, 1000);
        });
      };

      $times.appendChild($line);
    }
    $tooltip.appendChild($times);

    $timestamp.appendChild($tooltip);
    $message.appendChild($timestamp);

    const $body = document.createElement('div');
    $body.className = 'message-body';
    $body.appendChild($error);
    $message.appendChild($body);

    // Create sender/recipient chip to be injected into message content
    /** @type {HTMLElement | null} */
    let $senderChip = null;
    if (!isSent) {
      const fromNames = await E(powers).reverseIdentify(fromId);
      const fromName = fromNames?.[0];
      if (fromName === undefined) {
        continue;
      }
      $senderChip = document.createElement('b');
      $senderChip.innerText = `@${fromName}`;
    } else {
      const toNames = await E(powers).reverseIdentify(toId);
      const toName = toNames?.[0];
      if (toName !== undefined) {
        $senderChip = document.createElement('b');
        $senderChip.innerText = `@${toName}`;
      }
    }

    if (message.type === 'request') {
      const { description, settled } = message;

      const $description = document.createElement('span');
      // Inject sender chip before the description text
      if ($senderChip) {
        $description.appendChild($senderChip);
        $description.appendChild(document.createTextNode(' '));
      }
      $description.appendChild(document.createTextNode(JSON.stringify(description)));
      $body.appendChild($description);

      const $input = document.createElement('span');
      $body.appendChild($input);

      const $pet = document.createElement('input');
      $pet.autocomplete = 'off';
      $pet.dataset.formType = 'other';
      $pet.dataset.lpignore = 'true';
      $input.appendChild($pet);

      const $resolve = document.createElement('button');
      $resolve.innerText = 'resolve';
      $input.appendChild($resolve);

      const $reject = document.createElement('button');
      $reject.innerText = 'reject';
      $reject.onclick = () => {
        E(powers).reject(number, $pet.value).catch(window.reportError);
      };
      $input.appendChild($reject);

      $resolve.onclick = () => {
        E(powers)
          .resolve(number, $pet.value)
          .catch(error => {
            $error.innerText = ` ${error.message}`;
          });
      };

      settled.then(status => {
        $input.innerText = ` ${status} `;
      });
    } else if (message.type === 'package') {
      const { strings, names } = message;
      assert(Array.isArray(strings));
      assert(Array.isArray(names));

      // Prepare text with placeholders for markdown rendering
      const textWithPlaceholders = prepareTextWithPlaceholders(strings);
      const { fragment, insertionPoints } = renderMarkdown(textWithPlaceholders);

      // Inject sender chip into the first paragraph or heading
      // But NOT into code fence wrappers or lists - prepend a new paragraph instead
      if ($senderChip) {
        // Find first element that's a plain paragraph (not code fence wrapper) or heading
        const $firstPara = fragment.querySelector('p:not(.md-code-fence-wrapper), h1, h2, h3, h4, h5, h6');
        const $firstChild = fragment.firstChild;
        const isCodeFenceOrList = $firstChild && (
          ($firstChild instanceof Element && $firstChild.classList.contains('md-code-fence-wrapper')) ||
          ($firstChild instanceof Element && $firstChild.tagName === 'UL') ||
          ($firstChild instanceof Element && $firstChild.tagName === 'OL')
        );

        if ($firstPara && !isCodeFenceOrList) {
          // Insert into existing paragraph or heading
          $firstPara.insertBefore(document.createTextNode(' '), $firstPara.firstChild);
          $firstPara.insertBefore($senderChip, $firstPara.firstChild);
        } else {
          // Prepend a new paragraph for the chip
          const $chipPara = document.createElement('p');
          $chipPara.className = 'md-paragraph';
          $chipPara.appendChild($senderChip);
          fragment.insertBefore($chipPara, fragment.firstChild);
        }
      }

      // Append the rendered markdown
      $body.appendChild(fragment);

      // Create token chips for each insertion point
      for (let index = 0; index < Math.min(insertionPoints.length, names.length); index += 1) {
        assert.typeof(names[index], 'string');
        const edgeName = names[index];
        const $slot = insertionPoints[index];

        const $token = document.createElement('span');
        $token.className = 'token';

        const $name = document.createElement('b');
        $name.innerText = `@${edgeName}`;
        $token.appendChild($name);

        const $popup = document.createElement('span');
        $popup.className = 'token-popup';

        const $as = document.createElement('input');
        $as.type = 'text';
        $as.placeholder = edgeName;
        $as.autocomplete = 'off';
        $as.dataset.formType = 'other';
        $as.dataset.lpignore = 'true';
        $popup.appendChild($as);

        const handleAdopt = () => {
          E(powers)
            .adopt(number, edgeName, $as.value || edgeName)
            .then(
              () => {
                $as.value = '';
              },
              error => {
                $error.innerText = ` ${error.message}`;
              },
            );
        };

        $as.addEventListener('keyup', event => {
          const { key, repeat, metaKey } = event;
          if (repeat || metaKey) return;
          if (key === 'Enter') {
            handleAdopt();
          }
        });

        const $adopt = document.createElement('button');
        $adopt.innerText = 'Adopt';
        $adopt.onclick = handleAdopt;
        $popup.appendChild($adopt);

        $token.appendChild($popup);

        // Replace the placeholder slot with the token
        $slot.replaceWith($token);
      }
    } else if (message.type === 'eval-request') {
      const { source, codeNames, petNamePaths, settled } = message;

      // Show sender chip
      if ($senderChip) {
        const $senderLine = document.createElement('p');
        $senderLine.appendChild($senderChip);
        $senderLine.appendChild(document.createTextNode(' requests evaluation:'));
        $body.appendChild($senderLine);
      }

      // Show source code
      const $codeLabel = document.createElement('p');
      $codeLabel.textContent = 'Source:';
      $body.appendChild($codeLabel);

      const $pre = document.createElement('pre');
      const $code = document.createElement('code');
      $code.textContent = source;
      $pre.appendChild($code);
      $body.appendChild($pre);

      // Show endowment mappings
      if (codeNames.length > 0) {
        const $endowLabel = document.createElement('p');
        $endowLabel.textContent = 'Endowments:';
        $body.appendChild($endowLabel);

        const $endowList = document.createElement('ul');
        for (let i = 0; i < codeNames.length; i += 1) {
          const $li = document.createElement('li');
          const pathStr = Array.isArray(petNamePaths[i])
            ? petNamePaths[i].join('.')
            : String(petNamePaths[i]);
          $li.textContent = `${codeNames[i]} <- ${pathStr}`;
          $endowList.appendChild($li);
        }
        $body.appendChild($endowList);
      }

      // Approve/Reject controls
      const $controls = document.createElement('span');
      $body.appendChild($controls);

      const $approve = document.createElement('button');
      $approve.innerText = 'Approve';
      $approve.onclick = () => {
        E(powers)
          .approveEvaluation(number)
          .catch(error => {
            $error.innerText = ` ${error.message}`;
          });
      };
      $controls.appendChild($approve);

      const $rejectBtn = document.createElement('button');
      $rejectBtn.innerText = 'Reject';
      $rejectBtn.onclick = () => {
        E(powers).reject(number, 'Evaluation rejected').catch(window.reportError);
      };
      $controls.appendChild($rejectBtn);

      settled.then(status => {
        $controls.innerText = ` ${status} `;
      });
    }

    $parent.insertBefore($message, $end);

    if (wasAtEnd) {
      $parent.scrollTo(0, $parent.scrollHeight);
    }
  }
};

/**
 * @param {HTMLElement} $parent
 * @param {HTMLElement | null} $end
 * @param {unknown} powers
 * @param {{ showValue: (value: unknown, petNamePath?: string[]) => void }} options
 * @param {string[]} [path] - Current path for nested inventories
 */
const inventoryComponent = async ($parent, $end, powers, { showValue }, path = []) => {
  const $list = $parent.querySelector('.pet-list') || $parent;

  /** @type {Map<string, { $wrapper: HTMLElement, cleanup?: () => void }>} */
  const $names = new Map();

  /**
   * Check if a name is "special" (all uppercase letters/numbers/hyphens).
   * @param {string} name
   * @returns {boolean}
   */
  const isSpecialName = name => /^[A-Z][A-Z0-9_-]*$/.test(name);

  /**
   * Create an inventory item with disclosure triangle.
   * @param {string} name
   */
  const createItem = name => {
    const itemPath = [...path, name];

    const $wrapper = document.createElement('div');
    $wrapper.className = 'pet-item-wrapper';
    if (isSpecialName(name)) {
      $wrapper.classList.add('special');
    }

    const $row = document.createElement('div');
    $row.className = 'pet-item-row';

    // Disclosure triangle
    const $disclosure = document.createElement('button');
    $disclosure.className = 'pet-disclosure';
    $disclosure.textContent = '▶';
    $disclosure.title = 'Expand';
    $row.appendChild($disclosure);

    const $name = document.createElement('span');
    $name.className = 'pet-name';
    $name.textContent = name;
    $name.title = 'Click to view';
    $row.appendChild($name);

    const $buttons = document.createElement('span');
    $buttons.className = 'pet-buttons';

    // Remove button (disabled for special names)
    const $remove = document.createElement('button');
    $remove.className = 'remove-button';
    $remove.textContent = '×';
    if (isSpecialName(name)) {
      $remove.disabled = true;
      $remove.title = 'Cannot remove system name';
    } else {
      $remove.title = 'Remove';
    }
    $buttons.appendChild($remove);

    $row.appendChild($buttons);
    $wrapper.appendChild($row);

    // Children container (initially hidden)
    const $children = document.createElement('div');
    $children.className = 'pet-children';
    $wrapper.appendChild($children);

    $list.appendChild($wrapper);

    // Event handlers
    $name.onclick = () =>
      E(powers).lookup(...itemPath).then(value => showValue(value, itemPath), window.reportError);
    $remove.onclick = () => E(powers).remove(...itemPath).catch(window.reportError);

    // Track expansion state and cleanup
    let isExpanded = false;
    /** @type {(() => void) | undefined} */
    let childCleanup;

    // Disclosure triangle click handler
    $disclosure.onclick = async () => {
      if (isExpanded) {
        // Collapse
        isExpanded = false;
        $disclosure.classList.remove('expanded');
        $disclosure.title = 'Expand';
        $children.classList.remove('expanded');
        // Clean up child subscriptions
        if (childCleanup) {
          childCleanup();
          childCleanup = undefined;
        }
        $children.innerHTML = '';
      } else {
        // Expand - try to load children
        $disclosure.classList.add('loading');
        try {
          const target = await E(powers).lookup(...itemPath);
          // Check if it has followNameChanges (is a name hub)
          // We probe by trying to get the async iterator
          const changesIterator = E(target).followNameChanges();
          // If we get here without error, it's expandable
          isExpanded = true;
          $disclosure.classList.remove('loading');
          $disclosure.classList.add('expanded');
          $disclosure.title = 'Collapse';
          $children.classList.add('expanded');

          // Start nested inventory watching the nested target
          // Pass empty path since target is now the root for this subtree
          // But we need to wrap operations to use the full path from root powers
          const nestedPowers = {
            /** @param {string[]} subPath */
            lookup: (...subPath) => E(powers).lookup(...itemPath, ...subPath),
            /** @param {string[]} subPath */
            remove: (...subPath) => E(powers).remove(...itemPath, ...subPath),
            followNameChanges: () => changesIterator,
          };

          inventoryComponent(
            $children,
            null,
            nestedPowers,
            { showValue },
            [], // Reset path since nestedPowers handles the prefix
          ).catch(() => {
            // Silently handle errors (e.g., if the item is removed)
          });
        } catch {
          // Not expandable (no followNameChanges method or error)
          $disclosure.classList.remove('loading');
          $disclosure.classList.add('hidden');
        }
      }
    };

    return { $wrapper, cleanup: () => childCleanup?.() };
  };

  for await (const change of makeRefIterator(E(powers).followNameChanges())) {
    if ('add' in change) {
      const name = change.add;
      const item = createItem(name);
      $names.set(name, item);
    } else if ('remove' in change) {
      const item = $names.get(change.remove);
      if (item !== undefined) {
        item.cleanup?.();
        item.$wrapper.remove();
        $names.delete(change.remove);
      }
    }
  }
};


/**
 * @param {HTMLElement} $parent
 * @param {{ focusValue: (value: unknown, petNamePath?: string[]) => void | Promise<void>, blurValue: () => void }} callbacks
 */
const controlsComponent = ($parent, { focusValue, blurValue }) => {
  const $valueFrame = /** @type {HTMLElement} */ (
    $parent.querySelector('#value-frame')
  );

  /**
   * @param {unknown} value
   * @param {string[]} [petNamePath]
   */
  const showValue = (value, petNamePath) => {
    $valueFrame.dataset.show = 'true';
    focusValue(value, petNamePath);
  };

  const dismissValue = () => {
    $valueFrame.dataset.show = 'false';
    blurValue();
  };

  return { showValue, dismissValue };
};

/**
 * @param {HTMLElement} $parent
 * @param {unknown} powers
 * @param {object} options
 * @param {(value: unknown) => void} options.showValue
 * @param {(hostName: string) => Promise<void>} options.enterProfile
 * @param {() => void} options.exitProfile
 * @param {boolean} options.canExitProfile
 */
const chatBarComponent = ($parent, powers, { showValue, enterProfile, exitProfile, canExitProfile }) => {
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
        <span class="modeline-hint"><kbd>Cmd+Enter</kbd> expand to editor</span>
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

  // Initialize the send form component
  const sendForm = sendFormComponent({
    $input,
    $menu: $tokenMenu,
    $error,
    $sendButton,
    E,
    makeRefIterator,
    powers,
    shouldHandleEnter: () => mode === 'send',
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
      console.error('Command error:', error);
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
        activeMessageNumberInput.dispatchEvent(new Event('input', { bubbles: true }));
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
   * Update the has-content class on the chat bar.
   */
  const updateHasContent = () => {
    const text = $input.textContent || '';
    if (text.trim().length > 0 && mode === 'send') {
      $chatBar.classList.add('has-content');
      // Show send mode modeline hints
      $modeline.innerHTML = `
        <span class="modeline-hint"><kbd>Enter</kbd> send</span>
        <span class="modeline-hint"><kbd>/</kbd> commands</span>
        <span class="modeline-hint"><kbd>@</kbd> reference</span>
      `;
      $chatBar.classList.add('has-modeline');
    } else {
      $chatBar.classList.remove('has-content');
      // Show space hint when empty and there's a last recipient
      const lastRecipient = sendForm.getLastRecipient();
      if (mode === 'send' && lastRecipient) {
        $modeline.innerHTML = `
          <span class="modeline-hint"><kbd>Space</kbd> continue with @${lastRecipient}</span>
        `;
        $chatBar.classList.add('has-modeline');
      } else {
        $chatBar.classList.remove('has-modeline');
        $modeline.innerHTML = '';
      }
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

    html += '<div class="command-popover-footer">Type <kbd>/</kbd> in input for quick access</div>';
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
    if (!$commandPopover.contains(/** @type {Node} */ (event.target)) &&
        !$menuButton.contains(/** @type {Node} */ (event.target))) {
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

      const result = await executor.execute(commandName, data);
      if (result.success) {
        exitCommandMode(); // eslint-disable-line no-use-before-define
        // Always show js results (even undefined), skip show/list which handle their own display
        if (commandName === 'js') {
          showValue(result.value);
        } else if (result.value !== undefined && commandName !== 'show' && commandName !== 'list') {
          showValue(result.value);
        }
      }
      // Error case: showError callback already set $commandError.textContent
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
      const $msgInput = $inlineFormContainer.querySelector('.message-number-input');
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
    const needsMessagePicker = command.fields.some(f => f.type === 'messageNumber');
    if (needsMessagePicker) {
      messagePicker.enable();
      // Track the message number input
      setTimeout(() => {
        const $msgInput = $inlineFormContainer.querySelector('.message-number-input');
        if ($msgInput) {
          activeMessageNumberInput = /** @type {HTMLInputElement} */ ($msgInput);
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
          // Pet names must be arrays (path segments for dot-delimited names)
          const codeNames = data.endowments.map(e => e.codeName);
          const petNamePaths = data.endowments.map(e => e.petName.split('.'));
          const resultNamePath = data.resultName ? data.resultName.split('.') : undefined;
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

      const result = await executor.execute(currentCommand, data);
      if (result.success) {
        exitCommandMode();
        // Always show js results (even undefined), skip show/list which handle their own display
        if (currentCommand === 'js') {
          showValue(result.value);
        } else if (result.value !== undefined && currentCommand !== 'show' && currentCommand !== 'list') {
          showValue(result.value);
        }
      }
      // Error case: showError callback already set $commandError.textContent
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
            setTimeout(() => { $error.textContent = ''; }, 3000);
          }
          break;
        }
        // Execute immediately with current data
        executor.execute(commandName, {}).then(result => {
          if (result.success && result.value !== undefined) {
            showValue(result.value);
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
      }
    } else if (mode === 'send') {
      // Check if "/" was typed at the start of empty input
      if (text === '/') {
        mode = 'selecting';
        commandPrefix = '';
        commandSelector.show();
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
        // Clear send input and modeline
        event.preventDefault();
        sendForm.clear();
        $error.textContent = '';
        updateHasContent();
      }
    }
  });

  // Auto-focus the command line
  sendForm.focus();

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

/**
 * @param {unknown} value
 * @returns {HTMLElement}
 */
const render = value => {
  let passStyle;
  try {
    passStyle = passStyleOf(value);
  } catch {
    const $value = document.createElement('div');
    $value.className = 'error';
    $value.innerText = '⚠️ Not passable ⚠️';
    return $value;
  }

  switch (passStyle) {
    case 'null':
    case 'undefined':
    case 'boolean': {
      const $value = document.createElement('span');
      $value.className = 'number';
      $value.innerText = `${value}`;
      return $value;
    }
    case 'bigint': {
      const $value = document.createElement('span');
      $value.className = 'bigint';
      $value.innerText = `${numberFormatter.format(/** @type {bigint} */ (value))}n`;
      return $value;
    }
    case 'number': {
      const $value = document.createElement('span');
      $value.className = 'number';
      $value.innerText = numberFormatter.format(/** @type {number} */ (value));
      return $value;
    }
    case 'string': {
      const $value = document.createElement('span');
      $value.className = 'string';
      $value.innerText = JSON.stringify(value);
      return $value;
    }
    case 'promise': {
      const $value = document.createElement('span');
      $value.innerText = '⏳';
      // TODO await (and respect cancellation)
      return $value;
    }
    case 'copyArray': {
      const $value = document.createElement('span');
      $value.appendChild(document.createTextNode('['));
      const $entries = document.createElement('span');
      $entries.className = 'entries';
      $value.appendChild($entries);
      let $entry;
      for (const child of /** @type {unknown[]} */ (value)) {
        $entry = document.createElement('span');
        $entries.appendChild($entry);
        const $child = render(child);
        $entry.appendChild($child);
        $entry.appendChild(document.createTextNode(', '));
      }
      // Remove final comma.
      if ($entry) {
        $entry.removeChild(/** @type {ChildNode} */ ($entry.lastChild));
      }
      $value.appendChild(document.createTextNode(']'));
      return $value;
    }
    case 'copyRecord': {
      const $value = document.createElement('span');
      $value.appendChild(document.createTextNode('{'));
      const $entries = document.createElement('span');
      $value.appendChild($entries);
      $entries.className = 'entries';
      let $entry;
      for (const [key, child] of Object.entries(
        /** @type {Record<string, unknown>} */ (value),
      )) {
        $entry = document.createElement('span');
        $entries.appendChild($entry);
        const $key = document.createElement('span');
        $key.innerText = `${JSON.stringify(key)}: `;
        $entry.appendChild($key);
        const $child = render(child);
        $entry.appendChild($child);
        $entry.appendChild(document.createTextNode(', '));
      }
      if ($entry) {
        // Remove final comma.
        $entry.removeChild(/** @type {ChildNode} */ ($entry.lastChild));
      }
      $value.appendChild(document.createTextNode('}'));
      return $value;
    }
    case 'tagged': {
      const $value = document.createElement('span');
      const $tag = document.createElement('span');
      const tagged =
        /** @type {{ [Symbol.toStringTag]: string, payload: unknown }} */ (
          value
        );
      $tag.innerText = `${JSON.stringify(tagged[Symbol.toStringTag])} `;
      $tag.className = 'tag';
      $value.appendChild($tag);
      const $child = render(tagged.payload);
      $value.appendChild($child);
      return $value;
    }
    case 'error': {
      const $value = document.createElement('span');
      $value.className = 'error';
      $value.innerText = /** @type {Error} */ (value).message;
      return $value;
    }
    case 'remotable': {
      const $value = document.createElement('span');
      $value.className = 'remotable';
      const remotable = /** @type {{ [Symbol.toStringTag]: string }} */ (value);
      $value.innerText = remotable[Symbol.toStringTag];
      return $value;
    }
    default: {
      throw new Error(
        'Unreachable if programmed to account for all pass-styles',
      );
    }
  }
};

/**
 * Map from remotable interface tags to semantic types.
 * @type {Record<string, string>}
 */
const INTERFACE_TO_TYPE = {
  EndoHost: 'profile',
  EndoGuest: 'profile',
  Endo: 'profile',
  EndoDirectory: 'directory',
  EndoWorker: 'worker',
  Handle: 'handle',
  Invitation: 'invitation',
  EndoReadable: 'readable',
  AsyncIterator: 'readable',
};

/**
 * Infer the semantic type from a value.
 * @param {unknown} value
 * @returns {string}
 */
const inferType = value => {
  const passStyle = passStyleOf(value);

  // For primitives, use the pass style directly
  if (passStyle !== 'remotable') {
    return passStyle;
  }

  // For remotables, try to infer from the interface tag
  const iface = getInterfaceOf(value);
  if (iface) {
    // Interface format is "Alleged: TypeName" or just "TypeName"
    const match = iface.match(/^(?:Alleged:\s*)?(\w+)/);
    if (match) {
      const typeName = match[1];
      if (typeName in INTERFACE_TO_TYPE) {
        return INTERFACE_TO_TYPE[typeName];
      }
    }
  }

  return 'remotable';
};

/**
 * @param {HTMLElement} $parent
 * @param {unknown} powers
 * @param {object} options
 * @param {() => void} options.dismissValue
 * @param {(hostName: string) => Promise<void>} options.enterProfile
 */
const valueComponent = ($parent, powers, { dismissValue, enterProfile }) => {
  const $frame = /** @type {HTMLElement} */ (
    $parent.querySelector('#value-frame')
  );
  const $title = /** @type {HTMLElement} */ (
    $parent.querySelector('#value-title')
  );
  const $type = /** @type {HTMLSelectElement} */ (
    $parent.querySelector('#value-type')
  );
  const $value = /** @type {HTMLElement} */ (
    $parent.querySelector('#value-value')
  );
  const $close = /** @type {HTMLElement} */ (
    $parent.querySelector('#value-close')
  );
  const $saveName = /** @type {HTMLInputElement} */ (
    $parent.querySelector('#value-save-name')
  );
  const $saveButton = /** @type {HTMLButtonElement} */ (
    $parent.querySelector('#value-save-button')
  );
  const $enterProfile = /** @type {HTMLButtonElement} */ (
    $parent.querySelector('#value-enter-profile')
  );

  /** @type {unknown} */
  let currentValue;
  /** @type {string[] | undefined} */
  let currentPetNamePath;

  /**
   * Update Enter Profile button visibility based on type.
   */
  const updateEnterProfileVisibility = () => {
    const selectedType = $type.value;
    if (selectedType === 'profile' && currentPetNamePath && currentPetNamePath.length > 0) {
      $enterProfile.style.display = 'block';
    } else {
      $enterProfile.style.display = 'none';
    }
  };

  const clearValue = () => {
    $value.innerHTML = '';
    $saveName.value = '';
    $title.textContent = 'Value';
    $type.value = 'unknown';
    currentValue = undefined;
    currentPetNamePath = undefined;
    $enterProfile.style.display = 'none';
    dismissValue();
  };

  $close.addEventListener('click', () => {
    clearValue();
  });

  // Dismiss when clicking on the backdrop (but not the modal window)
  $frame.addEventListener('click', event => {
    if (event.target === $frame) {
      clearValue();
    }
  });

  $type.addEventListener('change', () => {
    updateEnterProfileVisibility();
  });

  $enterProfile.addEventListener('click', async () => {
    if (!currentPetNamePath) return;
    const hostName = currentPetNamePath.join('.');
    clearValue();
    await enterProfile(hostName);
  });

  const handleSave = async () => {
    const name = $saveName.value.trim();
    if (!name || currentValue === undefined) return;

    try {
      // Store the value with the given pet name path
      const petNamePath = name.split('.');
      await E(powers).storeValue(currentValue, petNamePath);
      $saveName.value = '';
      clearValue();
    } catch (error) {
      // Show error feedback
      $saveName.style.borderColor = '#e53e3e';
      setTimeout(() => {
        $saveName.style.borderColor = '';
      }, 2000);
      console.error('Failed to save value:', error);
    }
  };

  $saveButton.addEventListener('click', handleSave);

  $saveName.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSave();
    }
  });

  /** @param {KeyboardEvent} event */
  const handleKey = event => {
    const { key, repeat, metaKey } = event;
    if (repeat || metaKey) return;
    if (key === 'Escape') {
      clearValue();
      event.stopPropagation();
    }
  };

  /**
   * @param {unknown} value
   * @param {string[]} [petNamePath]
   */
  const focusValue = async (value, petNamePath) => {
    currentValue = value;
    currentPetNamePath = petNamePath;
    window.addEventListener('keyup', handleKey);

    // Render the value
    $value.innerHTML = '';
    $value.appendChild(render(value));

    // Infer and set the type
    const inferredType = inferType(value);
    $type.value = inferredType;

    // Update Enter Profile visibility based on inferred type
    updateEnterProfileVisibility();

    // Get pet names via reverse lookup and update title
    try {
      const petNames = /** @type {string[]} */ (await E(powers).reverseLookup(value));
      if (petNames.length > 0) {
        $title.textContent = petNames.join(', ');
      } else if (petNamePath && petNamePath.length > 0) {
        // Fall back to the path we used to look it up
        $title.textContent = petNamePath.join('.');
      } else {
        $title.textContent = 'Value';
      }
    } catch {
      // If reverse lookup fails, use the path or default
      if (petNamePath && petNamePath.length > 0) {
        $title.textContent = petNamePath.join('.');
      } else {
        $title.textContent = 'Value';
      }
    }

    $saveName.focus();
  };

  const blurValue = () => {
    window.removeEventListener('keyup', handleKey);
  };

  return { focusValue, blurValue };
};

/**
 * Set up the resizable sidebar handle.
 * @param {HTMLElement} $parent
 */
const resizeHandleComponent = $parent => {
  const $handle = /** @type {HTMLElement} */ (
    $parent.querySelector('#resize-handle')
  );

  const minWidth = 180;
  const maxWidth = 500;

  let isDragging = false;

  const onMouseDown = (/** @type {MouseEvent} */ e) => {
    e.preventDefault();
    isDragging = true;
    $handle.classList.add('dragging');
    document.body.classList.add('resizing');
  };

  const onMouseMove = (/** @type {MouseEvent} */ e) => {
    if (!isDragging) return;
    const newWidth = Math.min(maxWidth, Math.max(minWidth, e.clientX));
    document.documentElement.style.setProperty(
      '--sidebar-width',
      `${newWidth}px`,
    );
  };

  const onMouseUp = () => {
    if (isDragging) {
      isDragging = false;
      $handle.classList.remove('dragging');
      document.body.classList.remove('resizing');
    }
  };

  $handle.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};

/**
 * Render the profile breadcrumb bar.
 *
 * @param {HTMLElement} $profileBar
 * @param {string[]} profilePath
 * @param {(depth: number) => void} onNavigate - Called with depth to navigate to
 */
const renderProfileBar = ($profileBar, profilePath, onNavigate) => {
  $profileBar.innerHTML = '';

  // Always show "Home" as the root
  const $home = document.createElement('span');
  $home.className = 'profile-breadcrumb';
  if (profilePath.length === 0) {
    $home.classList.add('current');
  }
  $home.textContent = 'Home';
  $home.onclick = () => onNavigate(0);
  $profileBar.appendChild($home);

  // Add each segment of the path
  for (let i = 0; i < profilePath.length; i += 1) {
    const $sep = document.createElement('span');
    $sep.className = 'profile-separator';
    $sep.textContent = '›';
    $profileBar.appendChild($sep);

    const $crumb = document.createElement('span');
    $crumb.className = 'profile-breadcrumb';
    if (i === profilePath.length - 1) {
      $crumb.classList.add('current');
    }
    $crumb.textContent = profilePath[i];
    const depth = i + 1;
    $crumb.onclick = () => onNavigate(depth);
    $profileBar.appendChild($crumb);
  }
};

/**
 * @param {HTMLElement} $parent
 * @param {unknown} rootPowers
 * @param {string[]} profilePath
 * @param {(newPath: string[]) => void} onProfileChange
 */
const bodyComponent = ($parent, rootPowers, profilePath, onProfileChange) => {
  $parent.innerHTML = template;

  const $messages = /** @type {HTMLElement} */ (
    $parent.querySelector('#messages')
  );
  const $anchor = /** @type {HTMLElement} */ ($parent.querySelector('#anchor'));
  const $pets = /** @type {HTMLElement} */ ($parent.querySelector('#pets'));
  const $profileBar = /** @type {HTMLElement} */ (
    $parent.querySelector('#profile-bar')
  );
  const $petList = /** @type {HTMLElement} */ ($pets.querySelector('.pet-list'));
  const $showSpecialToggle = /** @type {HTMLInputElement} */ (
    $parent.querySelector('#show-special-toggle')
  );

  // Set up special names toggle
  $showSpecialToggle.addEventListener('change', () => {
    if ($showSpecialToggle.checked) {
      $petList.classList.add('show-special');
    } else {
      $petList.classList.remove('show-special');
    }
  });

  // Set up resizable sidebar
  resizeHandleComponent($parent);

  // Resolve powers for the current profile path
  const resolvePowers = async () => {
    /** @type {unknown} */
    let powers = rootPowers;
    for (const name of profilePath) {
      powers = E(powers).lookup(name);
    }
    return powers;
  };

  // Handle entering a host (adding to profile path)
  // Validates that the target has the minimum required interface before entering
  const enterHost = async (/** @type {string} */ hostName) => {
    try {
      // Resolve current powers and look up the target
      const currentPowers = await resolvePowers();
      const targetPowers = await E(currentPowers).lookup(hostName);

      // Verify the target has the minimum required interface for a profile
      // by checking if it responds to identify() - a lightweight check
      const selfId = await E(targetPowers).identify('SELF');
      if (selfId === undefined) {
        throw new Error(`"${hostName}" does not appear to be a valid host`);
      }

      // Passed validation - proceed with profile change
      onProfileChange([...profilePath, hostName]);
    } catch (error) {
      // Report the error - the user can see why entering failed
      window.reportError(/** @type {Error} */ (error));
    }
  };

  // Handle navigating to a specific depth in the profile path
  const navigateToDepth = (/** @type {number} */ depth) => {
    if (depth < profilePath.length) {
      onProfileChange(profilePath.slice(0, depth));
    }
  };

  // Handle exiting to parent profile
  const exitProfile = () => {
    if (profilePath.length > 0) {
      onProfileChange(profilePath.slice(0, -1));
    }
  };

  // Render the profile breadcrumbs
  renderProfileBar($profileBar, profilePath, navigateToDepth);

  // Initialize components with resolved powers
  resolvePowers()
    .then(resolvedPowers => {
      // To they who can avoid forward-references for entangled component
      // dependency-injection, I salute you and welcome your pull requests.
      /* eslint-disable no-use-before-define */
      const { showValue, dismissValue } = controlsComponent($parent, {
        focusValue: (value, petNamePath) => focusValue(value, petNamePath),
        blurValue: () => blurValue(),
      });
      inboxComponent($messages, $anchor, resolvedPowers).catch(window.reportError);
      inventoryComponent($pets, $profileBar, resolvedPowers, { showValue }).catch(
        window.reportError,
      );
      chatBarComponent($parent, resolvedPowers, {
        showValue,
        enterProfile: enterHost,
        exitProfile,
        canExitProfile: profilePath.length > 0,
      });
      const { focusValue, blurValue } = valueComponent($parent, resolvedPowers, {
        dismissValue,
        enterProfile: enterHost,
      });
      /* eslint-enable no-use-before-define */
    })
    .catch(window.reportError);
};

/**
 * Initialize the chat application with the given powers object.
 *
 * @param {unknown} powers - The powers object from HubCap
 */
export const make = async powers => {
  /** @type {string[]} */
  let currentProfilePath = [];

  const rebuild = () => {
    document.body.innerHTML = '';
    bodyComponent(document.body, powers, currentProfilePath, newPath => {
      currentProfilePath = newPath;
      rebuild();
    });
  };

  rebuild();
};
