// @ts-check
/* global window, document, setTimeout */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/far';
import { channelComponent } from './channel-component.js';
import { forumComponent } from './forum-component.js';
import { outlinerComponent } from './outliner-component.js';
import { createChannelHeader } from './channel-header.js';
import { inboxComponent } from './inbox-component.js';
import { inventoryComponent } from './inventory-component.js';
import { chatBarComponent } from './chat-bar-component.js';
import { valueComponent } from './value-component.js';
import { createSpacesGutter } from './spaces-gutter.js';
import { inventoryGraphComponent } from './inventory-graph-component.js';
import { whylipComponent } from './whylip-component.js';
import { peersComponent } from './peers-component.js';
import { createShareModal } from './share-modal.js';
import { microblogComponent } from './microblog-component.js';

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
  <div id="channel-header-actions"></div>
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

<div id="form-builder-backdrop"></div>
<div id="form-builder-container"></div>

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
<div id="share-modal-container"></div>
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
/**
 * @param {HTMLElement} $parent
 * @param {unknown} rootPowers
 * @param {string[]} profilePath
 * @param {ConversationState | null} activeConversation
 * @param {(newPath: string[], spaceInfo?: ActiveSpaceInfo) => void} onProfileChange
 * @param {(conversation: ConversationState | null) => void} onConversationChange
 * @param {ActiveSpaceInfo} [activeSpaceInfo]
 * @returns {(() => void) | null} cleanup function, if any
 */
const bodyComponent = (
  $parent,
  rootPowers,
  profilePath,
  activeConversation,
  onProfileChange,
  onConversationChange,
  activeSpaceInfo,
) => {
  if (activeSpaceInfo && activeSpaceInfo.mode === 'whylip') {
    return whylipComponent($parent, rootPowers, profilePath, onProfileChange);
  }

  if (activeSpaceInfo && activeSpaceInfo.mode === 'graph') {
    return inventoryGraphComponent(
      $parent,
      rootPowers,
      profilePath,
      onProfileChange,
    );
  }

  if (activeSpaceInfo && activeSpaceInfo.mode === 'peers') {
    return peersComponent($parent, rootPowers, profilePath, onProfileChange);
  }

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
  const $channelHeaderActions = /** @type {HTMLElement} */ (
    $parent.querySelector('#channel-header-actions')
  );
  const $chatBar = /** @type {HTMLElement} */ (
    $parent.querySelector('#chat-bar')
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
  const spacesGutterAPI = createSpacesGutter({
    $container: $spacesGutter,
    $modalContainer: $addSpaceModal,
    powers: /** @type {ERef<EndoHost>} */ (rootPowers),
    currentProfilePath: profilePath,
    onNavigate: (newPath, spaceInfo) => {
      onProfileChange(newPath, spaceInfo);
    },
  });

  // Set up share modal
  const $shareModalContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#share-modal-container')
  );
  const shareModal = createShareModal($shareModalContainer);

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
      ).identify('@self');
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
            onConversationChange({ petName, id: locator });
          })
          .catch(window.reportError);
      };

      /** @type {unknown} */
      let currentChannelRef = null;

      // Wrap showValue so channel token clicks resolve the value
      // via lookupById before displaying, matching inbox behavior.
      const channelShowValue = async (
        /** @type {unknown} */ value,
        /** @type {string | undefined} */ id,
        /** @type {string[] | undefined} */ petNamePath,
      ) => {
        if (value === undefined && id) {
          try {
            const resolved = await E(
              /** @type {ERef<EndoHost>} */ (resolvedPowers),
            ).lookupById(id);
            showValue(resolved, id, petNamePath);
          } catch {
            // Fall back to showing with undefined value
            showValue(value, id, petNamePath);
          }
        } else {
          showValue(value, id, petNamePath);
        }
      };

      if (
        activeSpaceInfo &&
        activeSpaceInfo.mode === 'channel' &&
        activeSpaceInfo.channelPetName
      ) {
        // Channel mode: look up the channel object and render channel component
        $conversationHeader.classList.add('visible');
        $conversationName.textContent = `#${activeSpaceInfo.channelPetName}`;
        $conversationBack.onclick = () => {
          // If a thread is open, close it and stay in the channel.
          if (
            /** @type {any} */ ($messages).channelAPI &&
            /** @type {any} */ ($messages).channelAPI.closeThread()
          ) {
            return;
          }
          // Not in a thread — go back to channel list.
          onProfileChange(profilePath, {
            mode: 'channel',
            proposedName: activeSpaceInfo.proposedName,
            viewMode: activeSpaceInfo.viewMode,
          });
        };
        $chatMessage.dataset.placeholder = 'Type a message...';

        // Show a connecting indicator while we reach the channel.
        const $connectingStatus = document.createElement('div');
        $connectingStatus.className =
          'channel-status channel-status-connecting';
        $connectingStatus.textContent = 'Connecting to channel\u2026';
        if ($anchor) {
          $messages.insertBefore($connectingStatus, $anchor);
        } else {
          $messages.appendChild($connectingStatus);
        }

        E(/** @type {ERef<EndoHost>} */ (resolvedPowers))
          .lookup(activeSpaceInfo.channelPetName)
          .then(async channelRef => {
            // Determine if we're the channel admin or a joiner.
            // If the channel's proposed name matches our space's proposed name,
            // we're the admin and can use the channel directly.
            // Otherwise, we join as a member so our posts carry our own identity.
            const channelCreatorName = await E(channelRef).getProposedName();
            const ourProposedName = activeSpaceInfo.proposedName;

            if (ourProposedName && ourProposedName !== channelCreatorName) {
              // We're not the admin — join to get our own member ref for posting
              const memberRef = await E(channelRef).join(ourProposedName);
              currentChannelRef = memberRef;
            } else {
              // We're the admin — use the channel directly
              currentChannelRef = channelRef;
            }

            // Connected — remove the connecting indicator.
            $connectingStatus.remove();

            // Set up channel header with invite/members menu.
            // Use currentChannelRef (member ref for joiners, raw channel for admin)
            // so getMembers()/invite() are scoped to the current user's view.
            createChannelHeader({
              $container: $channelHeaderActions,
              channel: currentChannelRef,
              powers: resolvedPowers,
              channelPetName: activeSpaceInfo.channelPetName,
              viewMode: activeSpaceInfo.viewMode || 'chat',
              onViewModeChange: newMode => {
                activeSpaceInfo.viewMode = newMode;
                const spaceId = spacesGutterAPI.getActiveSpaceId();
                spacesGutterAPI
                  .updateSpace(spaceId, { viewMode: newMode })
                  .catch(window.reportError);
                switchChannel(activeSpaceInfo.channelPetName);
              },
            });

            // Get our own memberId for highlighting own messages.
            // Gracefully degrade if getMemberId is not available (older daemon).
            /** @type {string | undefined} */
            let ownMemberId;
            try {
              ownMemberId = await E(
                /** @type {{ getMemberId: () => string }} */ (
                  currentChannelRef
                ),
              ).getMemberId();
            } catch {
              // getMemberId not available on this channel/member ref
            }

            // Follow messages from the current channel ref (member ref for
            // joiners, raw channel for admin) so that access controls
            // (disable, rate limit, ban) are enforced on the iterator.
            // Pass personaId (derived from profile path) so the address book
            // localStorage key is scoped per-persona, preventing nickname
            // leakage between spaces viewing the same channel.
            const channelViewFn =
              activeSpaceInfo.viewMode === 'forum'
                ? forumComponent
                : activeSpaceInfo.viewMode === 'outliner'
                  ? outlinerComponent
                  : activeSpaceInfo.viewMode === 'microblog'
                    ? microblogComponent
                    : channelComponent;
            // Set view-mode attributes for special modes
            if (activeSpaceInfo.viewMode === 'outliner' || activeSpaceInfo.viewMode === 'microblog') {
              $messages.dataset.viewMode = activeSpaceInfo.viewMode;
              $chatBar.dataset.viewMode = activeSpaceInfo.viewMode;
            } else {
              delete $messages.dataset.viewMode;
              delete $chatBar.dataset.viewMode;
            }

            /**
             * Fork a message's heritage chain into a new channel
             * within the current persona, then navigate to it.
             * @param {import('./channel-utils.js').ChannelMessage[]} heritageChain
             * @param {string} previewText
             */
            const handleFork = async (heritageChain, previewText) => {
              const channelName = `note-${Date.now()}`;
              const forkDisplayName =
                activeSpaceInfo.proposedName || previewText;

              await null; // safe-await-separator

              // Create channel under current persona
              await E(
                /** @type {{ makeChannel: (petName: string, proposedName: string) => Promise<unknown> }} */ (
                  resolvedPowers
                ),
              ).makeChannel(channelName, forkDisplayName);

              // Look up the new channel to post heritage
              const newChannelRef = await E(
                /** @type {{ lookup: (...args: string[]) => Promise<unknown> }} */ (
                  resolvedPowers
                ),
              ).lookup(channelName);

              // Re-post heritage messages in order
              for (let i = 0; i < heritageChain.length; i += 1) {
                const msg = heritageChain[i];
                const replyTo = i > 0 ? String(i - 1) : undefined;
                // eslint-disable-next-line no-await-in-loop
                await E(newChannelRef).post(
                  msg.strings,
                  msg.names,
                  [],
                  replyTo,
                  msg.ids,
                );
              }

              // Navigate to the new channel in-place
              switchChannel(channelName);
            };

            /**
             * Open the share modal for a message's heritage chain.
             * @param {import('./channel-utils.js').ChannelMessage[]} heritageChain
             * @param {string} previewText
             */
            const handleShare = (heritageChain, previewText) => {
              const targets = spacesGutterAPI
                .getSpaces()
                .filter(s => s.mode === 'channel' && s.channelPetName)
                .map(s => ({
                  id: s.id,
                  name: s.name,
                  icon: s.icon,
                  profilePath: s.profilePath,
                  channelPetName: s.channelPetName,
                }));
              shareModal.show({
                heritageChain,
                previewText,
                powers: resolvedPowers,
                rootPowers,
                targets,
                onNavigate: switchChannel,
              });
            };

            channelViewFn($messages, $anchor, currentChannelRef, {
              showValue: channelShowValue,
              personaId: profilePath.join('/'),
              ownMemberId,
              powers: resolvedPowers,
              onReply: info => {
                if (chatBarAPI) {
                  chatBarAPI.setReplyTo(
                    String(info.number),
                    info.authorName,
                    info.preview,
                  );
                }
              },
              onThreadOpen: info => {
                if (chatBarAPI) {
                  chatBarAPI.setDefaultReplyTo(
                    info.number,
                    info.authorName,
                    info.preview,
                  );
                }
              },
              onThreadClose: () => {
                if (chatBarAPI) {
                  chatBarAPI.clearDefaultReplyTo();
                }
              },
              chatBarAPI: () => chatBarAPI,
              onFork: handleFork,
              onShare: handleShare,
              onMentionNotify: isChannelMode
                ? handleMentionNotify
                : undefined,
            }).catch(window.reportError);
          })
          .catch(err => {
            // Connection failed — replace the connecting indicator with an error.
            $connectingStatus.className = 'channel-status channel-status-error';
            const message = err instanceof Error ? err.message : String(err);
            $connectingStatus.textContent = `Unable to connect to channel: ${message}`;
            window.reportError(err);
          });
      } else {
        // Default inbox mode
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
      }
      /**
       * Switch the active channel within the current space (channel mode only).
       * Clears current messages and starts a new channel connection without
       * rebuilding the entire page.
       * @param {string} channelPetName
       */
      const switchChannel = channelPetName => {
        if (!activeSpaceInfo || activeSpaceInfo.mode !== 'channel') {
          return;
        }

        // Dispose the old view component to stop its message iterator.
        if (/** @type {any} */ ($messages).channelAPI) {
          /** @type {any} */ ($messages).channelAPI.closeThread();
          if (/** @type {any} */ ($messages).channelAPI.dispose) {
            /** @type {any} */ ($messages).channelAPI.dispose();
          }
        }

        // Clear messages (keep anchor)
        while ($messages.firstChild !== $anchor) {
          /** @type {ChildNode} */ ($messages.firstChild).remove();
        }

        // Update activeSpaceInfo
        activeSpaceInfo.channelPetName = channelPetName;

        // Update header
        $conversationName.textContent = `#${channelPetName}`;

        // Show a connecting indicator while we reach the channel.
        const $switchStatus = document.createElement('div');
        $switchStatus.className = 'channel-status channel-status-connecting';
        $switchStatus.textContent = 'Connecting to channel\u2026';
        if ($anchor) {
          $messages.insertBefore($switchStatus, $anchor);
        } else {
          $messages.appendChild($switchStatus);
        }

        // Look up and connect to new channel
        E(/** @type {ERef<EndoHost>} */ (resolvedPowers))
          .lookup(channelPetName)
          .then(async channelRef => {
            const channelCreatorName = await E(channelRef).getProposedName();
            const ourProposedName = activeSpaceInfo.proposedName;

            if (ourProposedName && ourProposedName !== channelCreatorName) {
              currentChannelRef = await E(channelRef).join(ourProposedName);
            } else {
              currentChannelRef = channelRef;
            }

            // Connected — remove the connecting indicator.
            $switchStatus.remove();

            // Update channel header
            createChannelHeader({
              $container: $channelHeaderActions,
              channel: currentChannelRef,
              powers: resolvedPowers,
              channelPetName,
              viewMode: activeSpaceInfo.viewMode || 'chat',
              onViewModeChange: newMode => {
                activeSpaceInfo.viewMode = newMode;
                const spaceId = spacesGutterAPI.getActiveSpaceId();
                spacesGutterAPI
                  .updateSpace(spaceId, { viewMode: newMode })
                  .catch(window.reportError);
                switchChannel(activeSpaceInfo.channelPetName);
              },
            });

            // Get our own memberId for highlighting own messages.
            // Gracefully degrade if getMemberId is not available.
            /** @type {string | undefined} */
            let switchOwnMemberId;
            try {
              switchOwnMemberId = await E(
                /** @type {{ getMemberId: () => string }} */ (
                  currentChannelRef
                ),
              ).getMemberId();
            } catch {
              // getMemberId not available on this channel/member ref
            }

            // Set view-mode attributes for special modes
            if (activeSpaceInfo.viewMode === 'outliner' || activeSpaceInfo.viewMode === 'microblog') {
              $messages.dataset.viewMode = activeSpaceInfo.viewMode;
              $chatBar.dataset.viewMode = activeSpaceInfo.viewMode;
            } else {
              delete $messages.dataset.viewMode;
              delete $chatBar.dataset.viewMode;
            }

            // Start message stream from the current channel ref so access
            // controls are enforced on the iterator.
            const switchViewFn =
              activeSpaceInfo.viewMode === 'forum'
                ? forumComponent
                : activeSpaceInfo.viewMode === 'outliner'
                  ? outlinerComponent
                  : activeSpaceInfo.viewMode === 'microblog'
                    ? microblogComponent
                    : channelComponent;
            /**
             * Fork handler for switched channels.
             * @param {import('./channel-utils.js').ChannelMessage[]} heritageChain
             * @param {string} previewText
             */
            const handleSwitchFork = async (heritageChain, previewText) => {
              const channelName = `note-${Date.now()}`;
              const forkDisplayName =
                activeSpaceInfo.proposedName || previewText;

              await null; // safe-await-separator

              await E(
                /** @type {{ makeChannel: (petName: string, proposedName: string) => Promise<unknown> }} */ (
                  resolvedPowers
                ),
              ).makeChannel(channelName, forkDisplayName);

              const newChannelRef = await E(
                /** @type {{ lookup: (...args: string[]) => Promise<unknown> }} */ (
                  resolvedPowers
                ),
              ).lookup(channelName);

              for (let i = 0; i < heritageChain.length; i += 1) {
                const msg = heritageChain[i];
                const replyTo = i > 0 ? String(i - 1) : undefined;
                // eslint-disable-next-line no-await-in-loop
                await E(newChannelRef).post(
                  msg.strings,
                  msg.names,
                  [],
                  replyTo,
                  msg.ids,
                );
              }

              switchChannel(channelName);
            };

            /**
             * Share handler for switched channels.
             * @param {import('./channel-utils.js').ChannelMessage[]} heritageChain
             * @param {string} previewText
             */
            const handleSwitchShare = (heritageChain, previewText) => {
              const targets = spacesGutterAPI
                .getSpaces()
                .filter(s => s.mode === 'channel' && s.channelPetName)
                .map(s => ({
                  id: s.id,
                  name: s.name,
                  icon: s.icon,
                  profilePath: s.profilePath,
                  channelPetName: s.channelPetName,
                }));
              shareModal.show({
                heritageChain,
                previewText,
                powers: resolvedPowers,
                rootPowers,
                targets,
                onNavigate: switchChannel,
              });
            };

            switchViewFn($messages, $anchor, currentChannelRef, {
              showValue: channelShowValue,
              personaId: profilePath.join('/'),
              ownMemberId: switchOwnMemberId,
              powers: resolvedPowers,
              onReply: info => {
                if (chatBarAPI) {
                  chatBarAPI.setReplyTo(
                    String(info.number),
                    info.authorName,
                    info.preview,
                  );
                }
              },
              onThreadOpen: info => {
                if (chatBarAPI) {
                  chatBarAPI.setDefaultReplyTo(
                    info.number,
                    info.authorName,
                    info.preview,
                  );
                }
              },
              onThreadClose: () => {
                if (chatBarAPI) {
                  chatBarAPI.clearDefaultReplyTo();
                }
              },
              chatBarAPI: () => chatBarAPI,
              onFork: handleSwitchFork,
              onShare: handleSwitchShare,
              onMentionNotify: isChannelMode
                ? handleMentionNotify
                : undefined,
            }).catch(window.reportError);
          })
          .catch(err => {
            // Connection failed — replace the connecting indicator with an error.
            $switchStatus.className = 'channel-status channel-status-error';
            const message = err instanceof Error ? err.message : String(err);
            $switchStatus.textContent = `Unable to connect to channel: ${message}`;
            window.reportError(err);
          });

        // Update active highlight in inventory
        const $activeItems = $pets.querySelectorAll('.active-channel');
        for (const $item of $activeItems) {
          $item.classList.remove('active-channel');
        }
      };

      const isChannelMode =
        activeSpaceInfo && activeSpaceInfo.mode === 'channel';

      // Meta-J: quick note creation within the current outliner space.
      // Creates a new channel under the current persona and navigates to it.
      if (isChannelMode && activeSpaceInfo.viewMode === 'outliner') {
        document.addEventListener('keydown', e => {
          if (!((e.metaKey || e.ctrlKey) && e.key === 'j')) return;
          e.preventDefault();
          const channelName = `note-${Date.now()}`;
          const displayName = activeSpaceInfo.proposedName || 'Untitled';
          E(
            /** @type {{ makeChannel: (petName: string, proposedName: string) => Promise<unknown> }} */ (
              resolvedPowers
            ),
          )
            .makeChannel(channelName, displayName)
            .then(() => switchChannel(channelName))
            .catch(window.reportError);
        });
      }

      inventoryComponent(
        $pets,
        $profileBar,
        /** @type {ERef<EndoHost>} */ (resolvedPowers),
        {
          showValue,
          onSelectConversation: isChannelMode
            ? undefined
            : (petName, formulaId) => {
                onConversationChange({ petName, id: formulaId });
              },
          activeConversationPetName: activeConversation
            ? activeConversation.petName
            : null,
          channelMode: isChannelMode || false,
          onSelectChannel: isChannelMode ? switchChannel : undefined,
          activeChannelPetName: isChannelMode
            ? activeSpaceInfo.channelPetName || null
            : null,
        },
      ).catch(window.reportError);

      // Add collapsible inbox section to sidebar when in channel mode
      if (isChannelMode) {
        const $inboxSection = document.createElement('div');
        $inboxSection.className = 'sidebar-inbox-section';

        const $inboxHeader = document.createElement('div');
        $inboxHeader.className = 'sidebar-inbox-header';
        $inboxHeader.innerHTML =
          '<span class="sidebar-inbox-toggle">\u25B6</span> <span>Inbox</span>';

        const $inboxBody = document.createElement('div');
        $inboxBody.className = 'sidebar-inbox-body';

        $inboxSection.appendChild($inboxHeader);
        $inboxSection.appendChild($inboxBody);
        $pets.insertBefore($inboxSection, $profileBar);

        let inboxExpanded = false;
        let inboxLoaded = false;

        const loadInbox = async () => {
          $inboxBody.textContent = 'Loading\u2026';
          try {
            const rawMessages = await E(
              /** @type {{ listMessages: () => Promise<unknown[]> }} */ (
                resolvedPowers
              ),
            ).listMessages();
            const messages =
              /** @type {Array<{ number: bigint, type: string, strings?: string[], names?: string[] }>} */ (
                rawMessages
              );
            const withValues = messages.filter(
              m =>
                m.type === 'package' && m.names && m.names.length > 0,
            );
            $inboxBody.innerHTML = '';
            if (withValues.length === 0 && messages.length === 0) {
              $inboxBody.innerHTML =
                '<div class="sidebar-inbox-empty">No messages yet.</div>';
              return;
            }
            if (withValues.length === 0) {
              $inboxBody.innerHTML =
                '<div class="sidebar-inbox-empty">No adoptable values.</div>';
              return;
            }
            for (const msg of withValues) {
              const $entry = document.createElement('div');
              $entry.className = 'sidebar-inbox-entry';

              const text = msg.strings ? msg.strings.join('') : '';
              if (text) {
                const $text = document.createElement('div');
                $text.className = 'sidebar-inbox-text';
                $text.textContent = text;
                $entry.appendChild($text);
              }

              for (const name of msg.names || []) {
                const $btnRow = document.createElement('div');
                $btnRow.className = 'inbox-btn-row';

                const $btn = document.createElement('button');
                $btn.className = 'inbox-adopt-btn';
                $btn.textContent = `Adopt \u201C${name}\u201D`;
                $btn.addEventListener('click', async () => {
                  const petName = window.prompt(
                    `Adopt \u201C${name}\u201D as:`,
                    name,
                  );
                  if (!petName) return;
                  try {
                    await E(
                      /** @type {{ adopt: (n: bigint, edge: string, pet: string) => Promise<void> }} */ (
                        resolvedPowers
                      ),
                    ).adopt(msg.number, name, petName);
                    window.alert(
                      `Adopted \u201C${name}\u201D as \u201C${petName}\u201D`,
                    );
                    inboxLoaded = false;
                    await loadInbox();
                  } catch (err) {
                    window.alert(
                      `Failed to adopt: ${/** @type {Error} */ (err).message}`,
                    );
                  }
                });
                $btnRow.appendChild($btn);

                // "Join as Channel" button
                const $joinBtn = document.createElement('button');
                $joinBtn.className = 'inbox-join-channel-btn';
                $joinBtn.textContent = 'Join as Channel';
                $joinBtn.addEventListener('click', async () => {
                  const localName = window.prompt(
                    `Local name for this channel:`,
                    name,
                  );
                  if (!localName) return;
                  $joinBtn.disabled = true;
                  $joinBtn.textContent = 'Joining\u2026';
                  try {
                    // Adopt the channel reference
                    await E(
                      /** @type {{ adopt: (n: bigint, edge: string, pet: string) => Promise<void> }} */ (
                        resolvedPowers
                      ),
                    ).adopt(msg.number, name, localName);

                    // Look up and join the channel
                    const channelRef = await E(
                      /** @type {ERef<EndoHost>} */ (resolvedPowers),
                    ).lookup(localName);
                    const displayName =
                      window.prompt(
                        'Your display name in this channel:',
                        'Guest',
                      ) || 'Guest';
                    await E(channelRef).join(displayName);

                    // Create a space config for this channel
                    const spaceId = String(Date.now());
                    const spaceIcon = '\uD83D\uDCE8'; // 📨
                    const spaceName = localName;
                    await spacesGutterAPI.addSpace({
                      name: spaceName,
                      icon: spaceIcon,
                      profilePath,
                      mode: 'channel',
                      channelPetName: localName,
                      proposedName: displayName,
                      viewMode: 'chat',
                    });
                    window.alert(
                      `Joined channel as \u201C${displayName}\u201D. Check the spaces gutter.`,
                    );
                    inboxLoaded = false;
                    await loadInbox();
                  } catch (err) {
                    $joinBtn.disabled = false;
                    $joinBtn.textContent = 'Join as Channel';
                    window.alert(
                      `Failed to join channel: ${/** @type {Error} */ (err).message}`,
                    );
                  }
                });
                $btnRow.appendChild($joinBtn);

                $entry.appendChild($btnRow);
              }
              $inboxBody.appendChild($entry);
            }
          } catch {
            $inboxBody.textContent = 'Unable to load inbox.';
          }
          inboxLoaded = true;
        };

        $inboxHeader.addEventListener('click', () => {
          inboxExpanded = !inboxExpanded;
          $inboxBody.style.display = inboxExpanded ? '' : 'none';
          const $toggle = $inboxHeader.querySelector(
            '.sidebar-inbox-toggle',
          );
          if ($toggle) {
            $toggle.textContent = inboxExpanded ? '\u25BC' : '\u25B6';
          }
          if (inboxExpanded && !inboxLoaded) {
            loadInbox().catch(window.reportError);
          }
        });

        // Start collapsed
        $inboxBody.style.display = 'none';
      }

      // --- Mention notification area ---
      const $mentionNotifyArea = document.createElement('div');
      $mentionNotifyArea.className = 'mention-notify-area';
      $chatBar.insertBefore($mentionNotifyArea, $chatBar.firstChild);

      /**
       * Build a thread recap by walking the replyTo chain from a message
       * to the root. Returns interleaved strings/edgeNames/petNames so
       * that member references are embedded as adoptable values in the
       * inbox message.
       *
       * @param {Array<{ number: bigint, strings?: string[], names?: string[], replyTo?: string, memberId?: string }>} allMessages
       * @param {string | undefined} fromKey - message number (as string) to start from
       * @param {Map<string, { petName: string, edgeName: string }>} memberIdToRef - maps memberId to pet name (for resolution) and edge name (proposed name for recipient)
       * @returns {{ strings: string[], edgeNames: string[], petNames: string[] }}
       */
      const buildThreadRecap = (allMessages, fromKey, memberIdToRef) => {
        const empty = { strings: [], edgeNames: [], petNames: [] };
        if (!fromKey) return empty;

        /** @type {Map<string, { strings?: string[], names?: string[], replyTo?: string, memberId?: string }>} */
        const byNumber = new Map();
        for (const m of allMessages) {
          byNumber.set(String(m.number), m);
        }

        // Walk up from fromKey to root
        /** @type {Array<{ text: string, memberId: string | undefined }>} */
        const chain = [];
        let current = fromKey;
        while (current) {
          const msg = byNumber.get(current);
          if (!msg) break;
          const text = msg.strings ? msg.strings.join('') : '';
          chain.unshift({ text, memberId: msg.memberId });
          current = msg.replyTo;
        }

        if (chain.length === 0) return empty;

        // Build interleaved arrays following the send() protocol:
        //   strings[0] ref[0] strings[1] ref[1] ... strings[n]
        // where strings.length === edgeNames.length + 1.
        //
        // Edge names must be unique per message, so each author is
        // embedded as a reference only on their first appearance.
        // Subsequent messages by the same author use plain text.
        /** @type {string[]} */
        const strings = [''];
        /** @type {string[]} */
        const edgeNames = [];
        /** @type {string[]} */
        const petNames = [];
        /** @type {Set<string>} */
        const embeddedAuthors = new Set();

        for (let i = 0; i < chain.length; i++) {
          const entry = chain[i];
          const indent = '  '.repeat(i);
          const preview =
            entry.text.length > 120
              ? `${entry.text.slice(0, 120)}\u2026`
              : entry.text;
          const separator = i > 0 ? '\n' : '';
          const authorRef = entry.memberId
            ? memberIdToRef.get(entry.memberId)
            : undefined;

          if (
            authorRef &&
            !embeddedAuthors.has(authorRef.edgeName)
          ) {
            // First appearance — embed the author as a reference.
            // Suffix "(author)" in the preceding text so agents
            // know this is attribution, not an actionable ref.
            embeddedAuthors.add(authorRef.edgeName);
            strings[strings.length - 1] += `${separator}${indent}`;
            edgeNames.push(authorRef.edgeName);
            petNames.push(authorRef.petName);
            strings.push(` (author): ${preview}`);
          } else {
            // Repeat author or no resolvable author — plain text
            const authorLabel =
              (authorRef && authorRef.edgeName) ||
              entry.memberId ||
              '?';
            strings[strings.length - 1] +=
              `${separator}${indent}${authorLabel}: ${preview}`;
          }
        }

        return { strings, edgeNames, petNames };
      };

      /**
       * Send a mention notification to a pet name.
       * Builds thread recap from channel messages and sends it
       * as an inbox message with embedded channel + author refs.
       *
       * @param {string} petName - recipient pet name
       * @param {string} channelPetName - pet name of the channel
       * @param {boolean} alreadyInvited - whether recipient is already a member
       */
      const sendMentionNotification = async (
        petName,
        channelPetName,
        alreadyInvited,
      ) => {
        const channelRef = currentChannelRef;
        if (!channelRef) throw new Error('No channel connection');

        if (!alreadyInvited) {
          // Create a new invitation
          const displayName =
            window.prompt(
              `Display name for ${petName} in this channel:`,
              petName,
            ) || petName;
          await E(channelRef).createInvitation(displayName);
        }

        // Build thread recap from the channel's messages
        const rawMessages = await E(channelRef).listMessages();
        const channelMessages =
          /** @type {Array<{ number: bigint, strings?: string[], names?: string[], replyTo?: string, memberId?: string }>} */ (
            rawMessages
          );

        // Build memberId → { petName, edgeName } map.
        // petName resolves in sender's namespace to a formula ID.
        // edgeName is proposed to the recipient for adoption.
        /** @type {Map<string, { petName: string, edgeName: string }>} */
        const memberIdToRef = new Map();

        // Map our own memberId: @self resolves to our identity.
        // Use the channel's proposedName as the edge name so the
        // recipient sees a readable author name.
        try {
          const ownMid = await E(
            /** @type {{ getMemberId: () => string }} */ (
              channelRef
            ),
          ).getMemberId();
          if (ownMid) {
            const ownName = await E(
              /** @type {{ getProposedName: () => string }} */ (
                channelRef
              ),
            ).getProposedName();
            // Sanitize proposedName to a valid edge name
            const safeName = ownName
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, '-')
              .replace(/^[^a-z]/, 'u')
              .slice(0, 128);
            memberIdToRef.set(ownMid, {
              petName: '@self',
              edgeName: safeName || 'sender',
            });
          }
        } catch {
          // getMemberId/getProposedName not available
        }

        // Map invited members: invitedAs is the pet name we used
        // to create the invitation, and also a valid edge name.
        try {
          const memberList =
            /** @type {Array<{ memberId: string, invitedAs: string }>} */ (
              await E(channelRef).getMembers()
            );
          for (const m of memberList) {
            try {
              const mid = await E(
                /** @type {ERef<EndoHost>} */ (resolvedPowers),
              ).identify(m.invitedAs);
              if (mid) {
                memberIdToRef.set(m.memberId, {
                  petName: m.invitedAs,
                  edgeName: m.invitedAs,
                });
              }
            } catch {
              // Not in our namespace — skip
            }
          }
        } catch {
          // getMembers not available
        }

        // The most recent message is the one that triggered the mention
        const lastMsg = channelMessages[channelMessages.length - 1];
        const lastMsgKey = lastMsg
          ? String(lastMsg.number)
          : undefined;
        const recap = buildThreadRecap(
          channelMessages,
          lastMsgKey,
          memberIdToRef,
        );

        // Include the channel message number so the agent can
        // reply to the specific thread, not just post to root.
        const replyToNum = lastMsgKey || '0';

        // Choose instructions based on whether the recipient
        // is already a channel member or needs to adopt/join.
        const edgeName = channelPetName;
        const instructions = alreadyInvited
          ? `\n\nReply to channel message #${replyToNum}. ` +
            `Use exec() with this code:\n` +
            `const ch = await E(powers).lookup("${channelPetName}");\n` +
            `const me = await E(ch).join("YOUR_NAME");\n` +
            `await E(me).post(["YOUR_REPLY"], [], [], "${replyToNum}");\n` +
            `Do NOT post internal steps or reasoning to the channel.`
          : `\n\nReply to channel message #${replyToNum}. ` +
            `Use exec() with this code:\n` +
            `await E(powers).adopt(MSG_NUM, "${edgeName}", "ch-ref");\n` +
            `const ch = await E(powers).lookup("ch-ref");\n` +
            `const me = await E(ch).join("YOUR_NAME");\n` +
            `await E(me).post(["YOUR_REPLY"], [], [], "${replyToNum}");\n` +
            `Do NOT post internal steps or reasoning to the channel.`;

        // Assemble the final send() arrays.
        // Structure: "You were mentioned in " [channel] ":\n\n"
        //   [author1] ": msg1\n  " [author2] ": msg2\n\n..."
        // The channel is always the first embedded reference.
        /** @type {string[]} */
        const sendStrings = [`You were mentioned in `];
        /** @type {string[]} */
        const sendEdgeNames = [edgeName];
        /** @type {string[]} */
        const sendPetNames = [channelPetName];

        if (recap.edgeNames.length > 0) {
          // String after the channel ref: separator + recap
          // lead-in. recap.strings is interleaved as:
          //   strings[0] ref[0] strings[1] ref[1] ... strings[n]
          sendStrings.push(`:\n\n${recap.strings[0]}`);
          const usedEdgeNames = new Set([edgeName]);
          for (let ri = 0; ri < recap.edgeNames.length; ri++) {
            // Ensure edge name uniqueness across the message
            let recapEdge = recap.edgeNames[ri];
            if (usedEdgeNames.has(recapEdge)) {
              recapEdge = `${recapEdge}-author`;
            }
            usedEdgeNames.add(recapEdge);
            sendEdgeNames.push(recapEdge);
            sendPetNames.push(recap.petNames[ri]);
            sendStrings.push(recap.strings[ri + 1] || '');
          }
          sendStrings[sendStrings.length - 1] += instructions;
        } else if (
          recap.strings.length > 0 &&
          recap.strings[0]
        ) {
          // Recap text but no embedded refs
          sendStrings.push(
            `:\n\n${recap.strings[0]}${instructions}`,
          );
        } else {
          sendStrings.push(instructions);
        }

        await E(
          /** @type {ERef<EndoHost>} */ (resolvedPowers),
        ).send(
          petName,
          sendStrings,
          sendEdgeNames,
          sendPetNames,
        );
      };

      /**
       * Handle @-mention notifications after a channel post.
       * Auto-sends for already-invited members; prompts for new ones.
       * @param {{ petNames: string[], edgeNames: string[], messageStrings: string[], replyTo: string | undefined }} info
       */
      const handleMentionNotify = async info => {
        if (
          !activeSpaceInfo ||
          activeSpaceInfo.mode !== 'channel' ||
          !activeSpaceInfo.channelPetName
        ) {
          return;
        }
        const { channelPetName } = activeSpaceInfo;

        // For each mentioned pet name, validate and notify
        for (const petName of info.petNames) {
          // Check if the pet name resolves to something
          let isValid = false;
          try {
            const id = await E(
              /** @type {ERef<EndoHost>} */ (resolvedPowers),
            ).identify(petName);
            isValid = Boolean(id);
          } catch {
            // Not a valid pet name
          }
          if (!isValid) {
            // eslint-disable-next-line no-continue
            continue;
          }

          // Check if an invitation already exists for this name
          let alreadyInvited = false;
          try {
            const channelRef = currentChannelRef;
            if (channelRef) {
              const members = /** @type {Array<{ invitedAs: string }>} */ (
                await E(channelRef).getMembers()
              );
              alreadyInvited = members.some(
                m => m.invitedAs === petName,
              );
            }
          } catch {
            // getMembers not available
          }

          if (alreadyInvited) {
            // Already a member — auto-send notification silently
            const $toast = document.createElement('div');
            $toast.className = 'mention-notify-prompt';
            $toast.innerHTML = `<span class="mention-notify-text mention-notify-sent">\u2713 Notified <strong>@${petName}</strong></span>`;
            $mentionNotifyArea.appendChild($toast);
            setTimeout(() => $toast.remove(), 3000);

            sendMentionNotification(
              petName,
              channelPetName,
              true,
            ).catch(err => {
              $toast.innerHTML = `<span class="mention-notify-text">\u2717 Failed to notify <strong>@${petName}</strong></span>`;
              console.error('Auto-notify failed:', err);
              setTimeout(() => $toast.remove(), 5000);
            });
          } else {
            // Not yet invited — prompt the user
            const $prompt = document.createElement('div');
            $prompt.className = 'mention-notify-prompt';
            $prompt.innerHTML = `
              <span class="mention-notify-text">\uD83D\uDCE8 Invite & notify <strong>@${petName}</strong>?</span>
              <button type="button" class="mention-notify-yes">Yes, invite</button>
              <button type="button" class="mention-notify-no">No</button>
            `;
            $mentionNotifyArea.appendChild($prompt);

            const $yes = /** @type {HTMLButtonElement} */ (
              $prompt.querySelector('.mention-notify-yes')
            );
            const $no = /** @type {HTMLButtonElement} */ (
              $prompt.querySelector('.mention-notify-no')
            );

            $no.addEventListener('click', () => {
              $prompt.remove();
            });

            $yes.addEventListener('click', async () => {
              $yes.disabled = true;
              $yes.textContent = 'Sending\u2026';
              try {
                await sendMentionNotification(
                  petName,
                  channelPetName,
                  false,
                );
                $prompt.innerHTML = `<span class="mention-notify-text mention-notify-sent">\u2713 Notification sent to <strong>@${petName}</strong></span>`;
                setTimeout(() => $prompt.remove(), 3000);
              } catch (err) {
                $yes.disabled = false;
                $yes.textContent = 'Yes, invite';
                window.alert(
                  `Failed to send notification: ${/** @type {Error} */ (err).message}`,
                );
              }
            });
          }
        }
      };

      const chatBarAPI = chatBarComponent(
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
          getChannelRef: () => currentChannelRef,
          onMentionNotify: isChannelMode ? handleMentionNotify : undefined,
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

  return null;
};

/**
 * @typedef {object} ActiveSpaceInfo
 * @property {'inbox' | 'channel' | 'whylip' | 'graph' | 'peers'} mode
 * @property {string} [channelPetName]
 * @property {string} [proposedName]
 * @property {string} [whylipSystemPrompt]
 * @property {'chat' | 'forum' | 'outliner'} [viewMode] - channel view mode (default: 'chat')
 */

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
  /** @type {ActiveSpaceInfo} */
  let activeSpaceInfo = { mode: 'inbox' };
  /** @type {(() => void) | null} */
  let activeCleanup = null;

  const rebuild = () => {
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }
    document.body.innerHTML = '';
    activeCleanup = bodyComponent(
      document.body,
      powers,
      currentProfilePath,
      activeConversation,
      onProfileChange,
      onConversationChange,
      activeSpaceInfo,
    );
  };

  /**
   * @param {string[]} newPath
   * @param {ActiveSpaceInfo} [spaceInfo]
   */
  const onProfileChange = (newPath, spaceInfo) => {
    currentProfilePath = newPath;
    activeConversation = null;
    if (spaceInfo) {
      activeSpaceInfo = spaceInfo;
    } else {
      activeSpaceInfo = { mode: 'inbox' };
    }
    rebuild();
  };

  /** @param {ConversationState | null} conversation */
  const onConversationChange = conversation => {
    if (
      conversation &&
      activeConversation &&
      conversation.id === activeConversation.id
    ) {
      return;
    }
    activeConversation = conversation;
    rebuild();
  };

  rebuild();
};
