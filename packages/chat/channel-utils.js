// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/far';
import {
  prepareTextWithPlaceholders,
  renderMarkdown,
} from './markdown-render.js';
import { colorize } from './monaco-wrapper.js';
import { timeFormatter, relativeTime } from './time-formatters.js';
import { createProfilePopup } from './profile-popup.js';

/**
 * @typedef {object} ChannelMessage
 * @property {'package'} type
 * @property {string} messageId
 * @property {bigint} number
 * @property {string} date
 * @property {string} memberId
 * @property {string[]} strings
 * @property {string[]} names
 * @property {string[]} ids
 * @property {string} [replyTo]
 * @property {string} [replyType]
 */

/**
 * @typedef {object} ChannelState
 * @property {Map<string, string>} nameMap
 * @property {() => void} saveNameMap
 * @property {string} storageKey
 * @property {Map<string, { proposedName: string, invitedAs: string, memberId: string, pedigree: string[], pedigreeMemberIds: string[] }>} memberCache
 * @property {(memberId: string) => Promise<{ proposedName: string, invitedAs: string, memberId: string, pedigree: string[], pedigreeMemberIds: string[] } | undefined>} getMemberInfo
 * @property {(memberId: string) => void} updateAuthorChips
 * @property {Map<string, { message: ChannelMessage, $element: HTMLElement }>} messageIndex
 * @property {Map<string, string[]>} replyChildren
 * @property {(rootKey: string, maxDepth: number) => { entries: Array<{ key: string, message: ChannelMessage, depth: number }>, continuePoints: string[] }} buildThread
 * @property {(key: string) => number} countDescendants
 * @property {(key: string, rootKey: string) => boolean} isInThread
 * @property {(key: string) => string} findThreadRoot
 * @property {(message: ChannelMessage, options: CreateMessageOptions) => Promise<HTMLElement>} createMessageElement
 * @property {ReturnType<typeof createProfilePopup>} profilePopup
 */

/**
 * @typedef {object} CreateMessageOptions
 * @property {string | undefined} ownMemberId
 * @property {(info: { number: bigint, memberId: string, authorName: string, preview: string }) => void} [onReply]
 * @property {(value: unknown, id?: string, petNamePath?: string[]) => void | Promise<void>} showValue
 * @property {boolean} [skipReplyIndicator] - If true, omit the reply indicator bar
 * @property {(heritageChain: ChannelMessage[], previewText: string) => Promise<void>} [onFork] - Fork heritage chain to new channel
 * @property {(heritageChain: ChannelMessage[], previewText: string) => void} [onShare] - Open share modal for this message
 */

/**
 * @typedef {object} MessageMenuItem
 * @property {string} label
 * @property {string} icon
 * @property {() => void} handler
 */

/**
 * Create a three-dot (⋮) menu button with a dropdown for message actions.
 *
 * @param {MessageMenuItem[]} items - Menu items to display
 * @returns {HTMLElement} The menu button element
 */
const createMessageMenu = items => {
  const $menu = document.createElement('div');
  $menu.className = 'message-menu';

  const $trigger = document.createElement('button');
  $trigger.className = 'message-menu-trigger';
  $trigger.type = 'button';
  $trigger.title = 'More actions';
  $trigger.textContent = '\u22EE'; // vertical ellipsis ⋮
  $menu.appendChild($trigger);

  const $dropdown = document.createElement('div');
  $dropdown.className = 'message-menu-dropdown';

  for (const item of items) {
    const $item = document.createElement('button');
    $item.className = 'message-menu-item';
    $item.type = 'button';

    const $icon = document.createElement('span');
    $icon.className = 'message-menu-item-icon';
    $icon.textContent = item.icon;
    $item.appendChild($icon);

    const $label = document.createElement('span');
    $label.textContent = item.label;
    $item.appendChild($label);

    $item.addEventListener('click', e => {
      e.stopPropagation();
      $dropdown.classList.remove('open');
      item.handler();
    });

    $dropdown.appendChild($item);
  }

  $menu.appendChild($dropdown);

  $trigger.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = $dropdown.classList.toggle('open');
    if (isOpen) {
      // Position dropdown above if near bottom of viewport
      const rect = $trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 120) {
        $dropdown.classList.add('above');
      } else {
        $dropdown.classList.remove('above');
      }
      // Close on outside click
      const close = () => {
        $dropdown.classList.remove('open');
        document.removeEventListener('click', close);
      };
      // Defer so this click doesn't immediately close
      requestAnimationFrame(() => {
        document.addEventListener('click', close);
      });
    }
  });

  return $menu;
};

/**
 * Create shared channel state and utilities.
 *
 * @param {unknown} channel - Channel or ChannelMember reference
 * @param {object} opts
 * @param {string} [opts.personaId]
 * @param {string} [opts.ownMemberId]
 * @param {HTMLElement} opts.$parent - Parent container for querying author chips
 * @returns {Promise<ChannelState>}
 */
export const createChannelState = async (channel, opts) => {
  const { personaId, ownMemberId, $parent } = opts;

  // Profile popup for author clicks
  let $popupContainer = document.getElementById('channel-profile-popup');
  if (!$popupContainer) {
    $popupContainer = document.createElement('div');
    $popupContainer.id = 'channel-profile-popup';
    document.body.appendChild($popupContainer);
  }
  const profilePopup = createProfilePopup($popupContainer);

  /** @type {Map<string, string>} */
  const nameMap = new Map();

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

  // Auto-assign the current user's own proposed name
  if (ownMemberId !== undefined && !nameMap.has(ownMemberId)) {
    try {
      const ownInfo = await E(channel).getMember(ownMemberId);
      if (ownInfo && ownInfo.proposedName) {
        nameMap.set(ownMemberId, ownInfo.proposedName);
        saveNameMap();
      }
    } catch {
      // getMember may not be available
    }
  }

  /**
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

  /** @type {Map<string, { proposedName: string, invitedAs: string, memberId: string, pedigree: string[], pedigreeMemberIds: string[] }>} */
  const memberCache = new Map();

  /**
   * @param {string} memberId
   */
  const getMemberInfo = async memberId => {
    if (memberCache.has(memberId)) return memberCache.get(memberId);
    try {
      const info = await E(channel).getMember(memberId);
      if (info) memberCache.set(memberId, info);
      return info;
    } catch {
      return undefined;
    }
  };

  /** @type {Map<string, { message: ChannelMessage, $element: HTMLElement }>} */
  const messageIndex = new Map();

  /** @type {Map<string, string[]>} */
  const replyChildren = new Map();

  /**
   * @param {string} key
   * @returns {number}
   */
  const countDescendants = key => {
    const children = replyChildren.get(key) || [];
    let count = children.length;
    for (const childKey of children) {
      count += countDescendants(childKey);
    }
    return count;
  };

  /**
   * @param {string} rootKey
   * @param {number} maxDepth
   * @returns {{ entries: Array<{ key: string, message: ChannelMessage, depth: number }>, continuePoints: string[] }}
   */
  const buildThread = (rootKey, maxDepth) => {
    /** @type {Array<{ key: string, message: ChannelMessage, depth: number }>} */
    const entries = [];
    /** @type {string[]} */
    const continuePoints = [];

    /**
     * @param {string} key
     * @param {number} depth
     */
    const walk = (key, depth) => {
      const data = messageIndex.get(key);
      if (!data) return;
      entries.push({ key, message: data.message, depth });
      const children = replyChildren.get(key) || [];
      if (children.length === 0) return;

      if (depth >= maxDepth) {
        continuePoints.push(key);
        return;
      }

      const sorted = [...children].sort((a, b) => {
        const na = messageIndex.get(a);
        const nb = messageIndex.get(b);
        if (!na || !nb) return 0;
        if (na.message.number < nb.message.number) return -1;
        if (na.message.number > nb.message.number) return 1;
        return 0;
      });
      for (const childKey of sorted) {
        walk(childKey, depth + 1);
      }
    };
    walk(rootKey, 0);
    return { entries, continuePoints };
  };

  /**
   * @param {string} key
   * @param {string} rootKey
   * @returns {boolean}
   */
  const isInThread = (key, rootKey) => {
    let current = key;
    while (current) {
      if (current === rootKey) return true;
      const data = messageIndex.get(current);
      if (!data || !data.message.replyTo) return false;
      current = data.message.replyTo;
    }
    return false;
  };

  /**
   * @param {string} key
   * @returns {string}
   */
  const findThreadRoot = key => {
    let current = key;
    while (current) {
      const data = messageIndex.get(current);
      if (!data || !data.message.replyTo) return current;
      current = data.message.replyTo;
    }
    return key;
  };

  /**
   * @param {ChannelMessage} message
   * @param {CreateMessageOptions} options
   * @returns {Promise<HTMLElement>}
   */
  const createMessageElement = async (message, options) => {
    const {
      ownMemberId: ownId,
      onReply,
      showValue,
      skipReplyIndicator,
      onFork,
      onShare,
    } = options;

    const $wrapper = document.createElement('div');
    $wrapper.className = 'message-wrapper';

    // Reply indicator
    if (message.replyTo && !skipReplyIndicator) {
      const $replyBar = document.createElement('div');
      $replyBar.className = 'reply-indicator';

      const parentData = messageIndex.get(message.replyTo);
      if (parentData) {
        const parentMsg = parentData.message;
        const parentInfo = await getMemberInfo(parentMsg.memberId);
        const parentAuthor = parentInfo
          ? parentInfo.proposedName
          : parentMsg.memberId;
        const parentPreview = parentMsg.strings.join('').substring(0, 60);

        const $icon = document.createElement('span');
        $icon.className = 'reply-indicator-icon';
        $icon.textContent = '\u21A9';
        $replyBar.appendChild($icon);

        const $author = document.createElement('span');
        $author.className = 'reply-indicator-author';
        $author.textContent = nameMap.get(parentMsg.memberId) || parentAuthor;
        $replyBar.appendChild($author);

        const $preview = document.createElement('span');
        $preview.className = 'reply-indicator-preview';
        $preview.textContent = parentPreview;
        $replyBar.appendChild($preview);
      } else {
        $replyBar.textContent = `\u21A9 Message #${message.replyTo}`;
      }
      $wrapper.appendChild($replyBar);
    }

    const $msg = document.createElement('div');
    const isOwn = ownId !== undefined && message.memberId === ownId;
    $msg.className = isOwn
      ? 'message received own-message'
      : 'message received';
    $msg.dataset.messageId = String(message.number);

    // Timestamp + message number
    const $controls = document.createElement('div');
    $controls.className = 'timestamp-controls';

    const $msgNum = document.createElement('span');
    $msgNum.className = 'timestamp-num';
    $msgNum.textContent = `#${message.number}`;
    $controls.appendChild($msgNum);

    const $time = document.createElement('time');
    $time.className = 'message-time';
    const date = new Date(message.date);
    $time.textContent = timeFormatter.format(date);
    $time.title = relativeTime(date);
    $controls.appendChild($time);

    $msg.appendChild($controls);

    // Author chip
    const memberInfo = await getMemberInfo(message.memberId);
    const authorProposedName = memberInfo
      ? memberInfo.proposedName
      : message.memberId;
    /** @type {string[]} */
    const pedigree = memberInfo ? memberInfo.pedigree : [];
    /** @type {string[]} */
    const pedigreeMemberIds = memberInfo ? memberInfo.pedigreeMemberIds : [];

    const $author = document.createElement('span');
    $author.className = 'channel-author';
    $author.dataset.proposedName = authorProposedName;
    $author.dataset.memberId = message.memberId;

    const memberKey = message.memberId;
    const assignedName = nameMap.get(memberKey);
    if (assignedName) {
      $author.textContent = assignedName;
      $author.classList.add('named');
    } else {
      $author.textContent = `\u201C${authorProposedName}\u201D`;
    }

    $author.title =
      pedigree.length > 0
        ? `Invited by: ${pedigree
            .map((name, i) => {
              const mid = pedigreeMemberIds[i];
              const assigned = mid && nameMap.get(mid);
              return assigned || `\u201C${name}\u201D`;
            })
            .join(' \u2192 ')}`
        : 'Channel creator';
    $author.addEventListener('click', e => {
      e.stopPropagation();
      profilePopup.show({
        proposedName: authorProposedName,
        pedigree,
        pedigreeMemberIds,
        nameMap,
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
    const messageNames =
      /** @type {any} */ (message).names ||
      /** @type {any} */ (message).edgeNames ||
      [];
    const $body = document.createElement('span');
    $body.className = 'message-body';

    if (message.strings && message.strings.length > 0) {
      const textWithPlaceholders = prepareTextWithPlaceholders(message.strings);
      const { fragment, insertionPoints, highlight } = renderMarkdown(
        textWithPlaceholders,
        { colorize },
      );
      $body.appendChild(fragment);

      // Asynchronously apply Monaco syntax highlighting to code fences
      highlight();

      for (
        let index = 0;
        index < Math.min(insertionPoints.length, messageNames.length);
        index += 1
      ) {
        const edgeName = messageNames[index];
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

    // Hover action buttons
    {
      const $actions = document.createElement('div');
      $actions.className = 'message-actions';

      if (onReply) {
        const $replyBtn = document.createElement('button');
        $replyBtn.className = 'message-action-btn';
        $replyBtn.title = 'Reply';
        $replyBtn.textContent = '\u21A9';
        $replyBtn.addEventListener('click', e => {
          e.stopPropagation();
          const preview = message.strings.join('').substring(0, 60);
          onReply({
            number: message.number,
            memberId: message.memberId,
            authorName: authorProposedName,
            preview,
          });
        });
        $actions.appendChild($replyBtn);
      }

      // Three-dot menu
      /** @type {MessageMenuItem[]} */
      const menuItems = [];
      if (onFork) {
        const key = String(message.number);
        menuItems.push({
          label: 'Fork to Channel',
          icon: '\u2442',
          handler: () => {
            const chain = [];
            let current = key;
            while (current) {
              const entry = messageIndex.get(current);
              if (!entry) break;
              chain.unshift(entry.message);
              current = entry.message.replyTo;
            }
            const preview =
              message.strings.join('').substring(0, 40) || 'Forked note';
            onFork(chain, preview).catch(window.reportError);
          },
        });
      }
      if (onShare) {
        const shareKey = String(message.number);
        menuItems.push({
          label: 'Share\u2026',
          icon: '\u21D7',
          handler: () => {
            const chain = [];
            let cur = shareKey;
            while (cur) {
              const ent = messageIndex.get(cur);
              if (!ent) break;
              chain.unshift(ent.message);
              cur = ent.message.replyTo;
            }
            const preview =
              message.strings.join('').substring(0, 60) || 'Shared message';
            onShare(chain, preview);
          },
        });
      }
      if (menuItems.length > 0) {
        $actions.appendChild(createMessageMenu(menuItems));
      }

      if ($actions.childNodes.length > 0) {
        $msg.appendChild($actions);
      }
    }

    $wrapper.appendChild($msg);
    return $wrapper;
  };

  return harden({
    nameMap,
    saveNameMap,
    storageKey,
    memberCache,
    getMemberInfo,
    updateAuthorChips,
    messageIndex,
    replyChildren,
    buildThread,
    countDescendants,
    isInThread,
    findThreadRoot,
    createMessageElement,
    profilePopup,
  });
};
harden(createChannelState);

export { createMessageMenu };
harden(createMessageMenu);
