// @ts-check
/* global window, document, requestAnimationFrame */

/** @import { ERef } from '@endo/far' */

import { E } from '@endo/far';
import { makeRefIterator } from './ref-iterator.js';
import {
  prepareTextWithPlaceholders,
  renderMarkdown,
} from './markdown-render.js';
import { timeFormatter, relativeTime } from './time-formatters.js';
import { createProfilePopup } from './profile-popup.js';

/**
 * @typedef {object} ChannelMessage
 * @property {bigint} number
 * @property {string} date
 * @property {string} author
 * @property {string} [memberId]
 * @property {string[]} pedigree
 * @property {string[]} strings
 * @property {string[]} edgeNames
 * @property {string[]} ids
 * @property {string} [replyTo]
 */

/**
 * Render the channel message view.
 *
 * @param {HTMLElement} $parent - Container for messages
 * @param {HTMLElement | null} $end - Scroll anchor element
 * @param {unknown} channel - Channel or ChannelMember reference
 * @param {object} options
 * @param {(value: unknown, id?: string, petNamePath?: string[]) => void | Promise<void>} options.showValue
 * @param {(messageNumber: bigint) => void} [options.onMessageChange] - Called with each new message number for implicit threading
 * @param {string} [options.personaId] - Unique identifier for the current persona/space, used to scope the address book in localStorage
 */
export const channelComponent = async (
  $parent,
  $end,
  channel,
  { showValue, onMessageChange, personaId },
) => {
  $parent.scrollTo(0, $parent.scrollHeight);

  let isNearBottom = true;

  const checkNearBottom = () => {
    const threshold = 80;
    isNearBottom =
      $parent.scrollHeight - $parent.scrollTop - $parent.clientHeight <
      threshold;
  };

  $parent.addEventListener('scroll', checkNearBottom);

  // Profile popup for author clicks
  let $popupContainer = document.getElementById('channel-profile-popup');
  if (!$popupContainer) {
    $popupContainer = document.createElement('div');
    $popupContainer.id = 'channel-profile-popup';
    document.body.appendChild($popupContainer);
  }
  const profilePopup = createProfilePopup($popupContainer);

  /**
   * Local address book: maps memberId -> viewer's pet name.
   * Persisted in localStorage per channel so it survives reloads.
   * When no pet name is assigned, the author's proposed name shows in scare quotes.
   * @type {Map<string, string>}
   */
  const nameMap = new Map();

  // Load saved names from localStorage.
  // The key includes the persona identity to keep address books separate
  // when multiple personas view the same channel.
  /** @type {string} */
  let storageKey = 'channel-names';
  try {
    const channelName = await E(channel).getProposedName();
    storageKey = personaId
      ? `channel-names:${personaId}:${channelName}`
      : `channel-names:${channelName}`;
  } catch {
    // fall back to generic key
  }
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      const entries = JSON.parse(saved);
      for (const [k, v] of entries) {
        nameMap.set(k, v);
      }
    }
  } catch {
    // localStorage not available or corrupted
  }

  const saveNameMap = () => {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify([...nameMap.entries()]),
      );
    } catch {
      // localStorage not available
    }
  };

  // Auto-assign invitation names for members we directly invited.
  // For each member whose pedigree shows we invited them, pre-populate
  // the address book with their invitedAs name (unless already overridden).
  try {
    const ourName = await E(channel).getProposedName();
    const members =
      /** @type {{ memberId: string, invitedAs?: string, pedigree: string[] }[]} */ (
        await E(channel).getMembers()
      );
    let didAutoAssign = false;
    for (const member of members) {
      // Skip self (admin has empty pedigree)
      if (member.pedigree.length === 0) continue;
      // Skip if we already have a name for this member
      if (nameMap.has(member.memberId)) continue;
      // The last entry in pedigree is the direct inviter's name
      const directInviter = member.pedigree[member.pedigree.length - 1];
      if (directInviter === ourName && member.invitedAs) {
        nameMap.set(member.memberId, member.invitedAs);
        didAutoAssign = true;
      }
    }
    if (didAutoAssign) {
      saveNameMap();
    }
  } catch {
    // getMembers may not be available on all channel references
  }

  /**
   * Update all author chips in the DOM for a given memberId.
   * @param {string} memberId
   */
  const updateAuthorChips = memberId => {
    const assignedName = nameMap.get(memberId);
    const chips = $parent.querySelectorAll(
      `.channel-author[data-member-id="${CSS.escape(memberId)}"]`,
    );
    for (const chip of chips) {
      const proposedName = chip.dataset.proposedName || '';
      if (assignedName) {
        chip.textContent = assignedName;
        chip.classList.add('named');
      } else {
        chip.textContent = `\u201C${proposedName}\u201D`;
        chip.classList.remove('named');
      }
    }
  };

  const scrollToBottom = () => {
    if (isNearBottom) {
      requestAnimationFrame(() => {
        if ($end) {
          $end.scrollIntoView({ behavior: 'smooth' });
        } else {
          $parent.scrollTo(0, $parent.scrollHeight);
        }
      });
    }
  };

  /**
   * Create a message element for a channel message.
   * @param {ChannelMessage} message
   * @returns {HTMLElement}
   */
  const createMessageElement = message => {
    const $msg = document.createElement('div');
    $msg.className = 'message received';
    $msg.dataset.messageId = String(message.number);

    // Timestamp
    const $time = document.createElement('time');
    $time.className = 'message-time';
    const date = new Date(message.date);
    $time.textContent = timeFormatter.format(date);
    $time.title = relativeTime(date);
    $msg.appendChild($time);

    // Author chip — keyed on memberId for per-viewer name resolution
    const $author = document.createElement('span');
    $author.className = 'channel-author';
    $author.dataset.proposedName = message.author;
    if (message.memberId) {
      $author.dataset.memberId = message.memberId;
    }

    const memberKey = message.memberId || message.author;
    const assignedName = nameMap.get(memberKey);
    if (assignedName) {
      $author.textContent = assignedName;
      $author.classList.add('named');
    } else {
      $author.textContent = `\u201C${message.author}\u201D`;
    }

    $author.title =
      message.pedigree.length > 0
        ? `Invited by: ${message.pedigree.join(' \u2192 ')}`
        : 'Channel creator';
    $author.addEventListener('click', e => {
      e.stopPropagation();
      profilePopup.show({
        proposedName: message.author,
        pedigree: message.pedigree || [],
        yourName: nameMap.get(memberKey),
        onAssignName: name => {
          nameMap.set(memberKey, name);
          saveNameMap();
          updateAuthorChips(memberKey);
        },
        anchorElement: $author,
      });
    });
    $msg.appendChild($author);

    $msg.appendChild(document.createTextNode(' '));

    // Message body
    const $body = document.createElement('span');
    $body.className = 'message-body';

    if (message.strings && message.strings.length > 0) {
      const textWithPlaceholders = prepareTextWithPlaceholders(
        message.strings,
      );
      const { fragment, insertionPoints } =
        renderMarkdown(textWithPlaceholders);
      $body.appendChild(fragment);

      // Create token chips for edge names
      for (
        let index = 0;
        index < Math.min(insertionPoints.length, message.edgeNames.length);
        index += 1
      ) {
        const edgeName = message.edgeNames[index];
        const $slot = insertionPoints[index];

        const $token = document.createElement('span');
        $token.className = 'token';
        $token.tabIndex = 0;
        $token.setAttribute('role', 'button');
        $token.title = 'Open value';
        $token.textContent = `@${edgeName}`;
        $token.addEventListener('click', () => {
          if (message.ids && message.ids[index]) {
            showValue(undefined, message.ids[index], [edgeName]);
          }
        });

        $slot.replaceWith($token);
      }
    }

    $msg.appendChild($body);
    return $msg;
  };

  // Follow messages from the channel
  const messagesRef = await E(channel).followMessages();
  const messageIterator = makeRefIterator(messagesRef);

  for await (const message of messageIterator) {
    const typedMessage = /** @type {ChannelMessage} */ (message);
    const $msg = createMessageElement(typedMessage);
    if ($end) {
      $parent.insertBefore($msg, $end);
    } else {
      $parent.appendChild($msg);
    }
    scrollToBottom();
    if (onMessageChange) {
      onMessageChange(typedMessage.number);
    }
  }
};
harden(channelComponent);
