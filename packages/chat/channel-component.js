// @ts-check
/* global window, document, requestAnimationFrame, setTimeout, clearTimeout, CSS */

/** @import { ERef } from '@endo/far' */

import harden from '@endo/harden';
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
 * @property {'package'} type
 * @property {string} messageId
 * @property {bigint} number
 * @property {string} date
 * @property {string} memberId
 * @property {string[]} strings
 * @property {string[]} names
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
 * @param {string} [options.personaId] - Unique identifier for the current persona/space, used to scope the address book in localStorage
 * @param {string} [options.ownMemberId] - The current user's memberId, used to highlight own messages
 * @param {(info: { number: bigint, memberId: string, authorName: string, preview: string }) => void} [options.onReply] - Called when user clicks reply on a message
 * @param {(info: { number: string, authorName: string, preview: string }) => void} [options.onThreadOpen] - Called when a thread view is opened
 * @param {() => void} [options.onThreadClose] - Called when the thread view is closed
 */
export const channelComponent = async (
  $parent,
  $end,
  channel,
  { showValue, personaId, ownMemberId, onReply, onThreadOpen, onThreadClose },
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

  // Members who joined via invitation show their self-proposed name
  // in scare quotes (the default for unassigned names) rather than
  // auto-assigning the inviter's chosen invitation name.

  // Auto-assign the current user's own proposed name so they never see
  // themselves in scare quotes.
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

  /**
   * Member info cache: maps memberId -> { proposedName, invitedAs, pedigree, pedigreeMemberIds }.
   * @type {Map<string, { proposedName: string, invitedAs: string, memberId: string, pedigree: string[], pedigreeMemberIds: string[] }>}
   */
  const memberCache = new Map();

  /**
   * Look up member info, using cache to avoid repeated remote calls.
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

  // --- Thread tracking ---
  /**
   * Index of rendered messages by their number (as string).
   * @type {Map<string, { message: ChannelMessage, $element: HTMLElement }>}
   */
  const messageIndex = new Map();

  /**
   * Map from parent message number (string) to child message numbers (string[]).
   * @type {Map<string, string[]>}
   */
  const replyChildren = new Map();

  /** Maximum indentation depth in thread view before showing "Continue thread". */
  const MAX_INDENT_DEPTH = 3;

  /** Thread navigation stack (array of root message keys). */
  /** @type {string[]} */
  const threadStack = [];

  /** Currently rendered thread view element. */
  /** @type {HTMLElement | null} */
  let $currentThreadView = null;

  /** Guard against concurrent thread renders. */
  let threadViewRendering = false;

  /**
   * Generation counter — incremented by showThreadView and hideThreadView
   * so that an in-flight render can detect it was superseded.
   */
  let threadRenderGeneration = 0;

  /** Queued re-render key when showThreadView is called while already rendering. */
  /** @type {string | null} */
  let pendingThreadRender = null;

  /**
   * Count all descendants of a message recursively.
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
   * Build a flat list of thread messages with depth, stopping at maxDepth.
   * @param {string} rootKey
   * @param {number} maxDepth
   * @returns {{ entries: Array<{ key: string, message: ChannelMessage, depth: number }>, continuePoints: string[] }}
   */
  const buildThread = (rootKey, maxDepth) => {
    /** @type {Array<{ key: string, message: ChannelMessage, depth: number }>} */
    const entries = [];
    /** @type {string[]} */
    const continuePoints = [];

    /** @param {string} key @param {number} depth */
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
   * Check if a message belongs to a thread rooted at rootKey.
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
   * Update or create the reply-count badge on a parent message element.
   * Clicking the badge opens the thread drill-down view.
   * @param {string} parentKey - String(parentMessage.number)
   */
  const updateReplyCount = parentKey => {
    const parentData = messageIndex.get(parentKey);
    if (!parentData) return;
    const children = replyChildren.get(parentKey);
    if (!children || children.length === 0) return;

    let $badge = parentData.$element.querySelector('.reply-count');
    if (!$badge) {
      $badge = document.createElement('div');
      $badge.className = 'reply-count';
      $badge.addEventListener('click', e => {
        e.stopPropagation();
        threadStack.length = 0;
        threadStack.push(parentKey);
        showThreadView(parentKey); // eslint-disable-line no-use-before-define
      });
      parentData.$element.appendChild($badge);
    }
    const count = children.length;
    $badge.textContent = `${count} ${count === 1 ? 'reply' : 'replies'}`;
  };

  /**
   * Create a message element for a channel message.
   * @param {ChannelMessage} message
   * @returns {Promise<HTMLElement>}
   */
  const createMessageElement = async message => {
    // Wrapper holds the optional reply indicator above the message bubble.
    const $wrapper = document.createElement('div');
    $wrapper.className = 'message-wrapper';

    // Reply indicator (rendered above the bubble, outside the flex row)
    if (message.replyTo) {
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

        $replyBar.addEventListener('click', () => {
          parentData.$element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
          parentData.$element.classList.add('reply-highlight');
          setTimeout(
            () => parentData.$element.classList.remove('reply-highlight'),
            2000,
          );
        });
      } else {
        $replyBar.textContent = `\u21A9 Message #${message.replyTo}`;
      }
      $wrapper.appendChild($replyBar);
    }

    const $msg = document.createElement('div');
    const isOwn = ownMemberId !== undefined && message.memberId === ownMemberId;
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

    // Look up member info for author display
    const memberInfo = await getMemberInfo(message.memberId);
    const authorProposedName = memberInfo
      ? memberInfo.proposedName
      : message.memberId;
    const pedigree = memberInfo ? memberInfo.pedigree : [];
    const pedigreeMemberIds = memberInfo ? memberInfo.pedigreeMemberIds : [];

    // Author chip — keyed on memberId for per-viewer name resolution
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

    // Message body — use 'names' (new format) with fallback to 'edgeNames' (old format)
    const messageNames =
      /** @type {any} */ (message).names ||
      /** @type {any} */ (message).edgeNames ||
      [];
    const $body = document.createElement('span');
    $body.className = 'message-body';

    if (message.strings && message.strings.length > 0) {
      const textWithPlaceholders = prepareTextWithPlaceholders(message.strings);
      const { fragment, insertionPoints } =
        renderMarkdown(textWithPlaceholders);
      $body.appendChild(fragment);

      // Create token chips for names
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
    if (onReply) {
      const $actions = document.createElement('div');
      $actions.className = 'message-actions';

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
      $msg.appendChild($actions);
    }

    $wrapper.appendChild($msg);
    return $wrapper;
  };

  // --- Thread drill-down view ---

  /**
   * Render the thread drill-down view for a root message.
   * Hides the chronological message list and shows the threaded view.
   * @param {string} rootKey - message number (as string)
   */
  const showThreadView = async rootKey => {
    if (threadViewRendering) {
      pendingThreadRender = rootKey;
      return;
    }
    threadViewRendering = true;
    threadRenderGeneration += 1;
    const myGeneration = threadRenderGeneration;
    try {
      if ($currentThreadView) {
        $currentThreadView.remove();
      }
      $parent.classList.add('thread-active');

      const $threadView = document.createElement('div');
      $threadView.className = 'thread-view';
      $currentThreadView = $threadView;

      // Header: back button + breadcrumb
      const $header = document.createElement('div');
      $header.className = 'thread-header';

      const $back = document.createElement('button');
      $back.className = 'thread-back';
      $back.textContent = '\u2190 Back';
      $back.addEventListener('click', () => {
        if (threadStack.length > 1) {
          threadStack.pop();
          showThreadView(threadStack[threadStack.length - 1]);
        } else {
          hideThreadView(); // eslint-disable-line no-use-before-define
        }
      });
      $header.appendChild($back);

      const $breadcrumb = document.createElement('div');
      $breadcrumb.className = 'thread-breadcrumb';

      const $channelCrumb = document.createElement('span');
      $channelCrumb.className = 'thread-crumb';
      $channelCrumb.textContent = 'Channel';
      $channelCrumb.addEventListener('click', () => {
        hideThreadView(); // eslint-disable-line no-use-before-define
      });
      $breadcrumb.appendChild($channelCrumb);

      for (let i = 0; i < threadStack.length; i += 1) {
        const $sep = document.createElement('span');
        $sep.className = 'thread-crumb-sep';
        $sep.textContent = '\u203A';
        $breadcrumb.appendChild($sep);

        const isCurrent = i === threadStack.length - 1;
        const $crumb = document.createElement('span');
        $crumb.className = isCurrent ? 'thread-crumb current' : 'thread-crumb';
        $crumb.textContent = `Thread #${threadStack[i]}`;
        if (!isCurrent) {
          const targetDepth = i;
          $crumb.addEventListener('click', () => {
            threadStack.length = targetDepth + 1;
            showThreadView(threadStack[targetDepth]);
          });
        }
        $breadcrumb.appendChild($crumb);
      }

      $header.appendChild($breadcrumb);
      $threadView.appendChild($header);

      // Build and render thread
      const { entries, continuePoints } = buildThread(
        rootKey,
        MAX_INDENT_DEPTH,
      );

      const $threadMessages = document.createElement('div');
      $threadMessages.className = 'thread-messages';

      // Build all message elements in parallel to avoid await-in-loop
      const messageElements = await Promise.all(
        entries.map(({ message }) => createMessageElement(message)),
      );

      // If a newer render or hideThreadView superseded us, bail out.
      if (myGeneration !== threadRenderGeneration) return;

      for (let i = 0; i < entries.length; i += 1) {
        const { key, depth } = entries[i];
        const $wrapper = messageElements[i];
        $wrapper.classList.add(
          'thread-message',
          `depth-${Math.min(depth, MAX_INDENT_DEPTH)}`,
        );
        $threadMessages.appendChild($wrapper);

        if (continuePoints.includes(key)) {
          const descendants = countDescendants(key);
          const $continue = document.createElement('div');
          $continue.className = 'thread-continue';
          $continue.textContent = `Continue thread (${descendants} ${descendants === 1 ? 'reply' : 'replies'}) \u2192`;
          const continueKey = key;
          $continue.addEventListener('click', () => {
            threadStack.push(continueKey);
            showThreadView(continueKey);
          });
          $threadMessages.appendChild($continue);
        }
      }

      $threadView.appendChild($threadMessages);

      if ($end) {
        $parent.insertBefore($threadView, $end);
      } else {
        $parent.appendChild($threadView);
      }

      // Notify that a thread is open so the send form can auto-set replyTo.
      // Use cached member info (synchronous) to avoid another async gap.
      if (onThreadOpen) {
        const rootData = messageIndex.get(rootKey);
        if (rootData) {
          const cachedInfo = memberCache.get(rootData.message.memberId);
          const rootAuthor = cachedInfo
            ? cachedInfo.proposedName
            : rootData.message.memberId;
          onThreadOpen({
            number: rootKey,
            authorName:
              nameMap.get(rootData.message.memberId) || rootAuthor,
            preview: rootData.message.strings.join('').substring(0, 60),
          });
        }
      }
    } finally {
      threadViewRendering = false;
      // Process any re-render that was queued while we were rendering.
      if (pendingThreadRender !== null) {
        const rerenderKey = pendingThreadRender;
        pendingThreadRender = null;
        showThreadView(rerenderKey);
      }
    }
  };

  /**
   * Close the thread view and return to the chronological channel view.
   */
  const hideThreadView = () => {
    threadRenderGeneration += 1;
    pendingThreadRender = null;
    threadStack.length = 0;
    if ($currentThreadView) {
      $currentThreadView.remove();
      $currentThreadView = null;
    }
    $parent.classList.remove('thread-active');
    $parent.scrollTo(0, $parent.scrollHeight);
    if (onThreadClose) {
      onThreadClose();
    }
  };

  // Expose a control API on the parent element so chat.js can
  // programmatically close the thread (e.g. from #conversation-back).
  /** @type {{ closeThread: () => boolean }} */
  const channelAPI = harden({
    closeThread: () => {
      if ($parent.classList.contains('thread-active')) {
        hideThreadView();
        return true;
      }
      return false;
    },
  });
  /** @type {any} */ ($parent).channelAPI = channelAPI;

  // Escape key navigates back through thread stack (capture phase
  // so it fires before the chat-bar's Escape handler).
  document.addEventListener(
    'keydown',
    e => {
      if (
        e.key === 'Escape' &&
        $parent.classList.contains('thread-active')
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (threadStack.length > 1) {
          threadStack.pop();
          showThreadView(threadStack[threadStack.length - 1]);
        } else {
          hideThreadView();
        }
      }
    },
    true,
  );

  // Follow messages from the channel
  /** @type {unknown} */
  let messagesRef;
  try {
    messagesRef = await E(channel).followMessages();
  } catch (err) {
    const $error = document.createElement('div');
    $error.className = 'channel-status channel-status-error';
    const message = err instanceof Error ? err.message : String(err);
    $error.textContent = `Unable to load messages: ${message}`;
    if ($end) {
      $parent.insertBefore($error, $end);
    } else {
      $parent.appendChild($error);
    }
    throw err;
  }
  const messageIterator = makeRefIterator(messagesRef);

  // Schedule a hard scroll-to-bottom shortly after messages start arriving.
  // The existing message backlog arrives rapidly via the iterator; this
  // timer fires once the initial batch has been rendered, ensuring the
  // user lands at the latest message when switching to a channel.
  let initialScrollTimer = setTimeout(() => {
    $parent.scrollTo(0, $parent.scrollHeight);
    initialScrollTimer = 0;
  }, 150);

  for await (const message of messageIterator) {
    const typedMessage = /** @type {ChannelMessage} */ (message);
    const $msg = await createMessageElement(typedMessage);
    if ($end) {
      $parent.insertBefore($msg, $end);
    } else {
      $parent.appendChild($msg);
    }

    // Register in thread index (store the inner .message element, not the wrapper)
    const msgKey = String(typedMessage.number);
    const $innerMsg = /** @type {HTMLElement} */ (
      $msg.querySelector('.message') || $msg
    );
    messageIndex.set(msgKey, { message: typedMessage, $element: $innerMsg });

    // Track reply relationships
    if (typedMessage.replyTo) {
      const parentKey = typedMessage.replyTo;
      if (!replyChildren.has(parentKey)) {
        replyChildren.set(parentKey, []);
      }
      /** @type {string[]} */ (replyChildren.get(parentKey)).push(msgKey);
      updateReplyCount(parentKey);
    }

    // Live-update thread view if the new message belongs to the currently viewed thread
    if ($currentThreadView && threadStack.length > 0) {
      const currentRoot = threadStack[threadStack.length - 1];
      if (isInThread(msgKey, currentRoot)) {
        try {
          await showThreadView(currentRoot);
          // Scroll thread messages to show the new message
          const $tm = $currentThreadView && $currentThreadView.querySelector('.thread-messages');
          if ($tm) {
            $tm.scrollTop = $tm.scrollHeight;
          }
        } catch {
          // Don't let a thread render failure kill message processing
        }
      }
    }

    // During the initial batch, reschedule the hard scroll so it fires
    // after the last message in the backlog rather than mid-batch.
    if (initialScrollTimer) {
      clearTimeout(initialScrollTimer);
      initialScrollTimer = setTimeout(() => {
        $parent.scrollTo(0, $parent.scrollHeight);
        initialScrollTimer = 0;
      }, 50);
    } else {
      scrollToBottom();
    }
  }
};
harden(channelComponent);
