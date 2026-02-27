// @ts-check
/* global window, document */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/far';
import { inboxComponent } from './inbox-component.js';
import { inventoryComponent } from './inventory-component.js';
import { chatBarComponent } from './chat-bar-component.js';
import { valueComponent } from './value-component.js';
import { createSpacesGutter } from './spaces-gutter.js';

const template = `
<div id="spaces-gutter"></div>

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

<div id="conversation-header">
  <button id="conversation-back" title="Back to inbox (Esc)">←</button>
  <span id="conversation-label">Chatting with</span>
  <span id="conversation-name"></span>
</div>

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
      <div id="chat-message" contenteditable="true"></div>
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

<div id="counter-proposal-backdrop"></div>
<div id="counter-proposal-container"></div>

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
      <div id="value-actions-container"></div>
      <button id="value-enter-profile" style="display: none;">Enter Profile</button>
      <button id="value-close">Close</button>
    </div>
  </div>
</div>

<div id="help-modal-container"></div>
<div id="add-space-modal-container"></div>
`;

/**
 * @param {HTMLElement} $parent
 * @param {{ focusValue: (value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>, blurValue: () => void }} callbacks
 */
const controlsComponent = ($parent, { focusValue, blurValue }) => {
  const $valueFrame = /** @type {HTMLElement} */ (
    $parent.querySelector('#value-frame')
  );

  /**
   * @param {unknown} value
   * @param {string} [id]
   * @param {string[]} [petNamePath]
   * @param {{ number: bigint, edgeName: string }} [messageContext]
   */
  const showValue = (value, id, petNamePath, messageContext) => {
    $valueFrame.dataset.show = 'true';
    focusValue(value, id, petNamePath, messageContext);
  };

  const dismissValue = () => {
    $valueFrame.dataset.show = 'false';
    blurValue();
  };

  return { showValue, dismissValue };
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
 * @typedef {object} ConversationState
 * @property {string} petName
 * @property {string} id - FormulaIdentifier of the conversation partner
 */

/**
 * @param {HTMLElement} $parent
 * @param {unknown} rootPowers
 * @param {string[]} profilePath
 * @param {ConversationState | null} activeConversation
 * @param {(newPath: string[]) => void} onProfileChange
 * @param {(conversation: ConversationState | null) => void} onConversationChange
 */
const bodyComponent = (
  $parent,
  rootPowers,
  profilePath,
  activeConversation,
  onProfileChange,
  onConversationChange,
) => {
  $parent.innerHTML = template;

  const $messages = /** @type {HTMLElement} */ (
    $parent.querySelector('#messages')
  );
  const $anchor = /** @type {HTMLElement} */ ($parent.querySelector('#anchor'));
  const $pets = /** @type {HTMLElement} */ ($parent.querySelector('#pets'));
  const $profileBar = /** @type {HTMLElement} */ (
    $parent.querySelector('#profile-bar')
  );
  const $petList = /** @type {HTMLElement} */ (
    $pets.querySelector('.pet-list')
  );
  const $showSpecialToggle = /** @type {HTMLInputElement} */ (
    $parent.querySelector('#show-special-toggle')
  );
  const $spacesGutter = /** @type {HTMLElement} */ (
    $parent.querySelector('#spaces-gutter')
  );
  const $addSpaceModal = /** @type {HTMLElement} */ (
    $parent.querySelector('#add-space-modal-container')
  );
  const $conversationHeader = /** @type {HTMLElement} */ (
    $parent.querySelector('#conversation-header')
  );
  const $conversationBack = /** @type {HTMLButtonElement} */ (
    $parent.querySelector('#conversation-back')
  );
  const $conversationName = /** @type {HTMLElement} */ (
    $parent.querySelector('#conversation-name')
  );
  const $chatMessage = /** @type {HTMLElement} */ (
    $parent.querySelector('#chat-message')
  );

  // Set up conversation header
  if (activeConversation) {
    $conversationHeader.classList.add('visible');
    $conversationName.textContent = `@${activeConversation.petName}`;
    $conversationBack.onclick = () => onConversationChange(null);
    $chatMessage.dataset.placeholder = 'Type a message...';
  } else {
    $chatMessage.dataset.placeholder =
      'Type / for commands, or @recipient message...';
  }

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

  // Set up spaces gutter for quick navigation
  createSpacesGutter({
    $container: $spacesGutter,
    $modalContainer: $addSpaceModal,
    powers: /** @type {ERef<EndoHost>} */ (rootPowers),
    currentProfilePath: profilePath,
    onNavigate: newPath => {
      onProfileChange(newPath);
    },
  });

  // Resolve powers for the current profile path
  const resolvePowers = async () => {
    /** @type {unknown} */
    let powers = rootPowers;
    for (const name of profilePath) {
      powers = E(/** @type {ERef<EndoHost>} */ (powers)).lookup(name);
    }
    return powers;
  };

  // Handle entering a host (adding to profile path)
  // Validates that the target has the minimum required interface before entering
  const enterHost = async (/** @type {string} */ hostName) => {
    try {
      // Resolve current powers and look up the target
      const currentPowers = await resolvePowers();
      const targetPowers = await E(
        /** @type {ERef<EndoHost>} */ (currentPowers),
      ).lookup(hostName);

      // Verify the target has the minimum required interface for a profile
      // by checking if it responds to identify() - a lightweight check
      const selfId = await E(
        /** @type {ERef<EndoHost>} */ (targetPowers),
      ).identify('SELF');
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
        focusValue: (value, id, petNamePath, messageContext) =>
          focusValue(value, id, petNamePath, messageContext),
        blurValue: () => blurValue(),
      });

      const getConversationPetName = () =>
        activeConversation ? activeConversation.petName : null;

      /** @param {string} petName */
      const navigateToConversation = petName => {
        E(/** @type {ERef<EndoHost>} */ (resolvedPowers))
          .locate(petName)
          .then(locator => {
            if (!locator) return;
            const url = new URL(/** @type {string} */ (locator));
            const formulaNumber = url.searchParams.get('id');
            const nodeNumber = url.hostname;
            const formulaId = `${formulaNumber}:${nodeNumber}`;
            onConversationChange({ petName, id: formulaId });
          })
          .catch(window.reportError);
      };

      inboxComponent(
        $messages,
        $anchor,
        /** @type {ERef<EndoHost>} */ (resolvedPowers),
        {
          showValue,
          conversationId: activeConversation ? activeConversation.id : null,
          conversationPetName: activeConversation
            ? activeConversation.petName
            : null,
        },
      ).catch(window.reportError);
      inventoryComponent(
        $pets,
        $profileBar,
        /** @type {ERef<EndoHost>} */ (resolvedPowers),
        {
          showValue,
          onSelectConversation: (petName, formulaId) => {
            onConversationChange({ petName, id: formulaId });
          },
          activeConversationPetName: activeConversation
            ? activeConversation.petName
            : null,
        },
      ).catch(window.reportError);
      chatBarComponent(
        $parent,
        /** @type {ERef<EndoHost>} */ (resolvedPowers),
        {
          showValue,
          enterProfile: enterHost,
          exitProfile,
          canExitProfile: profilePath.length > 0,
          getConversationPetName,
          exitConversation: () => onConversationChange(null),
          navigateToConversation,
        },
      );
      const { focusValue, blurValue } = valueComponent(
        $parent,
        /** @type {ERef<EndoHost>} */ (resolvedPowers),
        {
          dismissValue,
          enterProfile: enterHost,
        },
      );
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
  /** @type {ConversationState | null} */
  let activeConversation = null;

  const rebuild = () => {
    document.body.innerHTML = '';
    bodyComponent(
      document.body,
      powers,
      currentProfilePath,
      activeConversation,
      newPath => {
        currentProfilePath = newPath;
        activeConversation = null;
        rebuild();
      },
      conversation => {
        if (
          conversation &&
          activeConversation &&
          conversation.id === activeConversation.id
        ) {
          return;
        }
        activeConversation = conversation;
        rebuild();
      },
    );
  };

  rebuild();
};
