// @ts-check

/** @import { ERef } from '@endo/far' */

import harden from '@endo/harden';
import { E } from '@endo/far';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import {
  Fragment,
  h,
  renderConfined,
  unmount,
} from './setup-preact-container.js';

import { timeFormatter, relativeTime } from './time-formatters.js';
import { createProfilePopup } from './profile-popup.js';
import { createMessageMenu } from './channel-utils.js';
import { createReactSystem } from './react-utils.js';
import { prepareTextWithPlaceholders } from './markdown-render.js';
import { markdownToVnodes } from './markdown-vnodes.js';

// Default multiuser channel body view (Dan's), migrated from imperative DOM to
// a confined Preact component rendered through a single `renderConfined`.
//
// THE HOST-NODE BRIDGE PATTERN (mirrors microblog-component.js and
// forum-component.js). The chronological message list and the thread drill-down
// view (message wrappers, reply indicators, timestamps, message bodies, action
// bars, reply-count badges, thread header/breadcrumb/continue handles) render
// confined as `h()` vnodes. Four pieces remain imperative DOM produced by reused
// helpers that are NOT view-migration targets:
//   - author chips (`profile-popup` — positions a portal, mutates `nameMap`,
//     re-renders sibling chips by DOM query),
//   - react buttons and react pills (`react-utils` — a `document.body` react
//     picker portal, nested sub-reacts, contextmenu handlers),
//   - the three-dot message menu (`channel-utils` `createMessageMenu` — a
//     dropdown with outside-click teardown registered on `document`).
// Live DOM (with listeners) cannot enter a confined vnode tree —
// `renderConfined` strips refs and real nodes. So the chrome renders empty
// ANCHOR slots (`data-author-anchor` / `data-react-btn-anchor` /
// `data-react-pills-anchor` / `data-menu-anchor`) and, after each confined
// render, the controller re-parents the imperative nodes into their anchors.
//
// Message bodies use the vnode path (`markdownToVnodes`) instead of the
// string-returning `renderMarkdown`/`.innerHTML`, mirroring the inbox, microblog
// and forum migrations. Attachments without an inline placeholder slot are
// appended at the end of the body as trailing chips rather than dropped.
//
// The substrate-agnostic logic (the followMessages/iterateReader subscription
// loop, threading — `buildThread`/`isInThread`/`findThreadRoot`/the thread
// stack, the per-persona localStorage name map, scroll stickiness, the move /
// deletion / react message handling) is reused VERBATIM from the imperative
// version; only view construction became Preact.

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
 * @param {(heritageChain: ChannelMessage[], previewText: string) => Promise<void>} [options.onFork] - Fork heritage chain to new channel
 * @param {(heritageChain: ChannelMessage[], previewText: string) => void} [options.onShare] - Open share modal for a message
 */
export const channelComponent = async (
  $parent,
  $end,
  channel,
  {
    showValue,
    personaId,
    ownMemberId,
    onReply,
    onThreadOpen,
    onThreadClose,
    onFork,
    onShare,
  },
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
        chip.textContent = `“${proposedName}”`;
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

  // Shared react system
  const reactSystem = createReactSystem({
    channel,
    ownMemberId,
    nameMap,
    getMemberInfo,
  });

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
   * @type {Map<string, { message: ChannelMessage }>}
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

  /** Whether the thread drill-down view is currently active. */
  let threadActive = false;

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
   * Walk up the replyTo chain from a message key and return the root
   * (the first ancestor with no replyTo).
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
   * Get the root-to-message heritage chain for a message key.
   * @param {string} key
   * @returns {ChannelMessage[]}
   */
  const getHeritageChain = key => {
    /** @type {ChannelMessage[]} */
    const chain = [];
    let current = key;
    while (current) {
      const entry = messageIndex.get(current);
      if (!entry) break;
      chain.unshift(entry.message);
      current = entry.message.replyTo;
    }
    return chain;
  };

  // ---- Dedicated confined mount ----

  // The message-list container, created once and inserted before the scroll
  // anchor so switchChannel's cleanup (which clears `$parent`) still works and
  // siblings (the `$end` anchor) are never reconciled away.
  const $mount = document.createElement('div');
  $mount.className = 'channel-message-list';
  if ($end) {
    $parent.insertBefore($mount, $end);
  } else {
    $parent.appendChild($mount);
  }
  const isLive = () => $mount.isConnected;

  // ---- View (confined Preact vnodes) ----

  /**
   * Render a message body as vnodes with interactive token chips. Mirrors the
   * imperative body construction in `createMessageElement`, but emits vnodes
   * (no `.innerHTML`). Monaco colorize of code fences is deferred (the markdown
   * vnode path emits plain `<pre>`), matching the inbox migration.
   * @param {ChannelMessage} message
   * @returns {import('preact').VNode}
   */
  const Body = message => {
    const messageNames = /** @type {string[]} */ (
      /** @type {any} */ (message).names ||
        /** @type {any} */ (message).edgeNames ||
        []
    );

    if (!message.strings || message.strings.length === 0) {
      return h('span', { class: 'message-body' });
    }

    const textWithPlaceholders = prepareTextWithPlaceholders(message.strings);

    /** @type {import('./markdown-vnodes.js').RenderToken} */
    const renderToken = index => {
      const edgeName = messageNames[index];
      if (edgeName === undefined) return null;
      return h(
        'span',
        {
          key: String(index),
          class: 'token',
          tabindex: 0,
          role: 'button',
          title: 'Open value',
          onClick: () => {
            if (message.ids && message.ids[index]) {
              showValue(undefined, message.ids[index], [edgeName]);
            }
          },
        },
        `@${edgeName}`,
      );
    };

    const { nodes, placeholderCount } = markdownToVnodes(textWithPlaceholders, {
      renderToken,
    });
    // Attachments without an inline placeholder slot (e.g. one text string and
    // one attached value) are appended at the end rather than dropped.
    const extraChips = [];
    for (let i = placeholderCount; i < messageNames.length; i += 1) {
      const chip = renderToken(i);
      if (chip) extraChips.push(' ', chip);
    }
    return h('span', { class: 'message-body' }, ...nodes, ...extraChips);
  };

  /**
   * An author chip anchor — the imperative author node is re-parented here
   * after render.
   * @param {object} props
   * @param {string} props.memberId
   */
  const AuthorAnchor = ({ memberId }) =>
    h('span', { 'data-author-anchor': memberId });

  /**
   * The reply indicator shown above a message whose parent is referenced via
   * `replyTo`. Mirrors `createMessageElement`'s reply indicator (icon, author,
   * preview), including the edit variant. Clicking it opens the thread rooted at
   * the message's ancestor.
   * @param {object} props
   * @param {ChannelMessage} props.message
   */
  const ReplyIndicator = ({ message }) => {
    const parentData = message.replyTo
      ? messageIndex.get(message.replyTo)
      : undefined;
    if (!parentData) {
      return h(
        'div',
        { class: 'reply-indicator' },
        `↩ Message #${message.replyTo}`,
      );
    }
    const parentMsg = parentData.message;
    const parentCached = memberCache.get(parentMsg.memberId);
    const parentAuthor =
      nameMap.get(parentMsg.memberId) ||
      (parentCached ? parentCached.proposedName : parentMsg.memberId);
    const parentPreview = parentMsg.strings.join('').substring(0, 60);
    const isEdit = message.replyType === 'edit';
    const cls = isEdit
      ? 'reply-indicator reply-indicator-edit'
      : 'reply-indicator';
    return h(
      'div',
      {
        class: cls,
        onClick: () => {
          const rootKey = findThreadRoot(
            /** @type {string} */ (message.replyTo),
          );
          threadStack.length = 0;
          threadStack.push(rootKey);
          showThreadView(rootKey); // eslint-disable-line no-use-before-define
        },
      },
      h('span', { class: 'reply-indicator-icon' }, isEdit ? '✎' : '↩'),
      h('span', { class: 'reply-indicator-author' }, parentAuthor),
      h('span', { class: 'reply-indicator-preview' }, parentPreview),
    );
  };

  /**
   * The hover action bar: reply button, react anchor, and the three-dot menu
   * anchor (fork / share / delete). Mirrors `createMessageElement`'s actions.
   * @param {object} props
   * @param {string} props.messageKey
   * @param {ChannelMessage} props.message
   */
  const ActionBar = ({ messageKey, message }) => {
    return h(
      'div',
      { class: 'message-actions' },
      // Reply button
      onReply
        ? h(
            'button',
            {
              class: 'message-action-btn',
              title: 'Reply',
              onClick: () => {
                // Synchronous, matching the original: the member info is
                // already cached (the message loop resolves it before render),
                // so onReply fires immediately rather than after an await.
                const preview = message.strings.join('').substring(0, 60);
                const cached = memberCache.get(message.memberId);
                const authorName = cached
                  ? cached.proposedName
                  : message.memberId;
                onReply({
                  number: message.number,
                  memberId: message.memberId,
                  authorName,
                  preview,
                });
              },
            },
            '↩',
          )
        : null,
      // React button (imperative host node, bridged via anchor)
      h('span', { 'data-react-btn-anchor': messageKey }),
      // Three-dot menu (imperative host node, bridged via anchor)
      h('span', { 'data-menu-anchor': messageKey }),
    );
  };

  /**
   * The reply-count badge shown on a parent message; clicking it opens the
   * thread drill-down view. Mirrors `updateReplyCount`.
   * @param {object} props
   * @param {string} props.messageKey
   */
  const ReplyCount = ({ messageKey }) => {
    const children = replyChildren.get(messageKey);
    if (!children || children.length === 0) return null;
    const count = children.length;
    return h(
      'div',
      {
        class: 'reply-count',
        onClick: () => {
          threadStack.length = 0;
          threadStack.push(messageKey);
          showThreadView(messageKey); // eslint-disable-line no-use-before-define
        },
      },
      `${count} ${count === 1 ? 'reply' : 'replies'}`,
    );
  };

  /**
   * A single message wrapper: optional reply indicator above the bubble, then
   * the message bubble (timestamp controls, edit badge, author anchor, body,
   * action bar), then react pills and an optional reply-count badge. Mirrors
   * `createMessageElement`.
   * @param {object} props
   * @param {string} props.messageKey
   * @param {ChannelMessage} props.message
   * @param {string} [props.extraClass] - Extra classes for the wrapper (thread depth).
   */
  const MessageWrapper = ({ messageKey, message, extraClass }) => {
    const isOwn = ownMemberId !== undefined && message.memberId === ownMemberId;
    const date = new Date(message.date);
    const isEdit = message.replyType === 'edit';

    const wrapperClasses = ['message-wrapper'];
    if (isEdit) wrapperClasses.push('message-edit');
    if (extraClass) wrapperClasses.push(extraClass);

    const $bubble = h(
      'div',
      {
        class: isOwn ? 'message received own-message' : 'message received',
        'data-message-id': String(message.number),
      },
      h(
        'div',
        { class: 'timestamp-controls' },
        h('span', { class: 'timestamp-num' }, `#${message.number}`),
        h(
          'time',
          { class: 'message-time', title: relativeTime(date) },
          timeFormatter.format(date),
        ),
      ),
      // Edit badge, inserted before the body in the imperative version.
      isEdit ? h('span', { class: 'message-edit-badge' }, 'Edit') : null,
      h(AuthorAnchor, { memberId: message.memberId }),
      ' ',
      Body(message),
      h(ActionBar, { messageKey, message }),
      h(ReplyCount, { messageKey }),
    );

    return h(
      'div',
      { class: wrapperClasses.join(' '), 'data-wrapper-key': messageKey },
      message.replyTo ? h(ReplyIndicator, { message }) : null,
      $bubble,
      // React pills (imperative host node, bridged via anchor)
      h('span', { 'data-react-pills-anchor': messageKey }),
    );
  };

  /**
   * The chronological message list — every visible message in receive order.
   */
  const MessageList = () => {
    /** @type {import('preact').VNode[]} */
    const items = [];
    for (const [key, data] of messageIndex) {
      const { message } = data;
      // Operational / react messages are tracked but never rendered.
      if (
        message.replyType === 'move' ||
        message.replyType === 'deletion' ||
        message.replyType === 'react' ||
        message.replyType === 'redact-react'
      ) {
        // eslint-disable-next-line no-continue
        continue;
      }
      items.push(h(MessageWrapper, { key, messageKey: key, message }));
    }
    return h(Fragment, null, ...items);
  };

  /**
   * The thread drill-down view: back button + breadcrumb header, then the
   * thread messages (depth-indented) with "Continue thread" handles. Mirrors
   * the imperative `showThreadView`.
   * @param {object} props
   * @param {string} props.rootKey
   */
  const ThreadView = ({ rootKey }) => {
    const { entries, continuePoints } = buildThread(rootKey, MAX_INDENT_DEPTH);

    // Header: back button + breadcrumb
    const crumbs = [
      h(
        'span',
        {
          key: 'channel',
          class: 'thread-crumb',
          onClick: () => hideThreadView(), // eslint-disable-line no-use-before-define
        },
        'Channel',
      ),
    ];
    for (let i = 0; i < threadStack.length; i += 1) {
      crumbs.push(
        h('span', { key: `sep-${i}`, class: 'thread-crumb-sep' }, '›'),
      );
      const isCurrent = i === threadStack.length - 1;
      const targetDepth = i;
      crumbs.push(
        h(
          'span',
          {
            key: `crumb-${i}`,
            class: isCurrent ? 'thread-crumb current' : 'thread-crumb',
            onClick: isCurrent
              ? undefined
              : () => {
                  threadStack.length = targetDepth + 1;
                  showThreadView(threadStack[targetDepth]); // eslint-disable-line no-use-before-define
                },
          },
          `Thread #${threadStack[i]}`,
        ),
      );
    }

    const $header = h(
      'div',
      { class: 'thread-header' },
      h(
        'button',
        {
          class: 'thread-back',
          onClick: () => {
            if (threadStack.length > 1) {
              threadStack.pop();
              showThreadView(threadStack[threadStack.length - 1]); // eslint-disable-line no-use-before-define
            } else {
              hideThreadView(); // eslint-disable-line no-use-before-define
            }
          },
        },
        '← Back',
      ),
      h('div', { class: 'thread-breadcrumb' }, ...crumbs),
    );

    /** @type {import('preact').VNode[]} */
    const messageNodes = [];
    for (const { key, message, depth } of entries) {
      messageNodes.push(
        h(MessageWrapper, {
          key,
          messageKey: key,
          message,
          extraClass: `thread-message depth-${Math.min(depth, MAX_INDENT_DEPTH)}`,
        }),
      );
      if (continuePoints.includes(key)) {
        const descendants = countDescendants(key);
        const continueKey = key;
        messageNodes.push(
          h(
            'div',
            {
              key: `continue-${key}`,
              class: 'thread-continue',
              onClick: () => {
                threadStack.push(continueKey);
                showThreadView(continueKey); // eslint-disable-line no-use-before-define
              },
            },
            `Continue thread (${descendants} ${descendants === 1 ? 'reply' : 'replies'}) →`,
          ),
        );
      }
    }

    return h(
      'div',
      { class: 'thread-view' },
      $header,
      h('div', { class: 'thread-messages' }, ...messageNodes),
    );
  };

  /** The root view: thread drill-down if active, else the chronological list. */
  const View = () =>
    threadActive && threadStack.length > 0
      ? h(ThreadView, { rootKey: threadStack[threadStack.length - 1] })
      : h(MessageList, null);

  // ---- Imperative host-node helpers (bridged into anchors after each render) ----

  /**
   * Create a clickable author element (imperative DOM) with profile popup.
   * Mirrors the author chip built inline by the imperative
   * `createMessageElement`.
   * @param {string} memberId
   * @returns {HTMLElement}
   */
  const createAuthorEl = memberId => {
    const $author = document.createElement('span');
    $author.className = 'channel-author';
    $author.dataset.memberId = memberId;

    const assigned = nameMap.get(memberId);
    if (assigned) {
      $author.textContent = assigned;
      $author.classList.add('named');
    } else {
      $author.textContent = memberId;
    }

    getMemberInfo(memberId)
      .then(info => {
        const authorProposedName = info ? info.proposedName : memberId;
        const pedigree = info ? info.pedigree || [] : [];
        const pedigreeMemberIds = info ? info.pedigreeMemberIds || [] : [];
        $author.dataset.proposedName = authorProposedName;
        const current = nameMap.get(memberId);
        if (!current) {
          $author.textContent = `“${authorProposedName}”`;
        }
        $author.title =
          pedigree.length !== 0
            ? `Invited by: ${pedigree
                .map((name, i) => {
                  const mid = pedigreeMemberIds[i];
                  const namedMid = mid && nameMap.get(mid);
                  return namedMid || `“${name}”`;
                })
                .join(' → ')}`
            : 'Channel creator';
        $author.addEventListener('click', e => {
          e.stopPropagation();
          profilePopup.show({
            proposedName: authorProposedName,
            pedigree,
            pedigreeMemberIds,
            nameMap,
            yourName: nameMap.get(memberId),
            onAssignName: name => {
              nameMap.set(memberId, name);
              saveNameMap();
              updateAuthorChips(memberId);
            },
            anchorElement: $author,
          });
        });
      })
      .catch(() => {});

    return $author;
  };

  /**
   * Build the three-dot message menu (imperative DOM) for a message key, with
   * fork / share / delete items. Mirrors `createMessageElement`'s menu.
   * @param {string} messageKey
   * @returns {HTMLElement | null}
   */
  const createMenuEl = messageKey => {
    const data = messageIndex.get(messageKey);
    if (!data) return null;
    const { message } = data;
    /** @type {Array<{label: string, icon: string, handler: () => void}>} */
    const menuItems = [];
    if (onFork) {
      menuItems.push({
        label: 'Fork to Channel',
        icon: '⑂',
        handler: () => {
          const chain = getHeritageChain(messageKey);
          const preview =
            message.strings.join('').substring(0, 40) || 'Forked note';
          onFork(chain, preview).catch(window.reportError);
        },
      });
    }
    if (onShare) {
      menuItems.push({
        label: 'Share…',
        icon: '⇗',
        handler: () => {
          const chain = getHeritageChain(messageKey);
          const preview =
            message.strings.join('').substring(0, 60) || 'Shared message';
          onShare(chain, preview);
        },
      });
    }
    // Delete: post a deletion reply to this message
    menuItems.push({
      label: 'Delete',
      icon: '✗',
      handler: () => {
        E(channel)
          .post([''], [], [], messageKey, [], 'deletion')
          .catch(window.reportError);
      },
    });
    if (menuItems.length === 0) return null;
    return createMessageMenu(menuItems);
  };

  // ---- Host-node bridging ----

  // Cache imperative react-button and menu nodes (one stable node per message
  // key) so they survive confined re-renders rather than re-binding listeners.
  /** @type {Map<string, HTMLElement>} */
  const reactButtonNodes = new Map();
  /** @type {Map<string, HTMLElement>} */
  const menuNodes = new Map();

  /**
   * After each confined render, re-parent the imperative host nodes into their
   * freshly rendered anchors.
   */
  const bridgeHostNodes = () => {
    // Author chips — re-create per anchor so each node has its own chip element,
    // as the original did.
    const authorAnchors = $mount.querySelectorAll('[data-author-anchor]');
    for (const $anchor of authorAnchors) {
      const el = /** @type {HTMLElement} */ (/** @type {unknown} */ ($anchor));
      if (el.firstChild) continue; // eslint-disable-line no-continue
      const memberId = el.getAttribute('data-author-anchor') || '';
      el.appendChild(createAuthorEl(memberId));
    }

    // React buttons — one per message key (stable, reusable node).
    const reactBtnAnchors = $mount.querySelectorAll('[data-react-btn-anchor]');
    for (const $anchor of reactBtnAnchors) {
      const el = /** @type {HTMLElement} */ (/** @type {unknown} */ ($anchor));
      if (el.firstChild) continue; // eslint-disable-line no-continue
      const key = el.getAttribute('data-react-btn-anchor') || '';
      let $btn = reactButtonNodes.get(key);
      if (!$btn) {
        $btn = reactSystem.createReactButton(key);
        reactButtonNodes.set(key, $btn);
      } else if ($btn.parentElement) {
        $btn.parentElement.removeChild($btn);
      }
      el.appendChild($btn);
    }

    // Three-dot menus — one per message key (stable, reusable node so the
    // dropdown's open/outside-click state survives re-renders).
    const menuAnchors = $mount.querySelectorAll('[data-menu-anchor]');
    for (const $anchor of menuAnchors) {
      const el = /** @type {HTMLElement} */ (/** @type {unknown} */ ($anchor));
      if (el.firstChild) continue; // eslint-disable-line no-continue
      const key = el.getAttribute('data-menu-anchor') || '';
      let $menu = menuNodes.get(key);
      if (!$menu) {
        const built = createMenuEl(key);
        if (!built) continue; // eslint-disable-line no-continue
        $menu = built;
        menuNodes.set(key, $menu);
      } else if ($menu.parentElement) {
        $menu.parentElement.removeChild($menu);
      }
      el.appendChild($menu);
    }

    // React pills — rebuilt each render from current react state (cheap, and the
    // react picker portal lives on document.body, so the pills carry no
    // long-lived listeners that must survive).
    const pillAnchors = $mount.querySelectorAll('[data-react-pills-anchor]');
    for (const $anchor of pillAnchors) {
      const el = /** @type {HTMLElement} */ (/** @type {unknown} */ ($anchor));
      const key = el.getAttribute('data-react-pills-anchor') || '';
      const $pills = reactSystem.buildReactsContainer(key);
      if (el.firstChild) el.textContent = '';
      if ($pills) el.appendChild($pills);
    }
  };

  // ---- Render orchestration ----

  /** Guard against concurrent renders. */
  let rendering = false;
  /** @type {boolean} */
  let pendingRender = false;

  /**
   * Render the confined view, then bridge the imperative host nodes.
   * `renderConfined` is synchronous, so anchors exist when bridging runs.
   * A re-entrancy guard coalesces a render requested while one is running.
   */
  const rerender = () => {
    if (rendering) {
      pendingRender = true;
      return;
    }
    rendering = true;
    try {
      renderConfined(h(View, null), $mount);
      bridgeHostNodes();
    } finally {
      rendering = false;
      if (pendingRender) {
        pendingRender = false;
        rerender();
      }
    }
  };

  // ---- Thread navigation ----

  /**
   * Open the thread drill-down view for a root message. The chronological list
   * is replaced by the threaded view (confined render), and `onThreadOpen` fires
   * so the send form can auto-set replyTo.
   * @param {string} rootKey - message number (as string)
   */
  const showThreadView = rootKey => {
    threadActive = true;
    $parent.classList.add('thread-active');
    rerender();

    // Scroll thread messages to show the latest message.
    requestAnimationFrame(() => {
      const $tm = $mount.querySelector('.thread-messages');
      if ($tm) {
        $tm.scrollTop = $tm.scrollHeight;
      }
    });

    // Notify that a thread is open so the send form can auto-set replyTo.
    if (onThreadOpen) {
      const rootData = messageIndex.get(rootKey);
      if (rootData) {
        const cachedInfo = memberCache.get(rootData.message.memberId);
        const rootAuthor = cachedInfo
          ? cachedInfo.proposedName
          : rootData.message.memberId;
        onThreadOpen({
          number: rootKey,
          authorName: nameMap.get(rootData.message.memberId) || rootAuthor,
          preview: rootData.message.strings.join('').substring(0, 60),
        });
      }
    }
  };

  /**
   * Close the thread view and return to the chronological channel view.
   */
  const hideThreadView = () => {
    threadStack.length = 0;
    threadActive = false;
    $parent.classList.remove('thread-active');
    rerender();
    $parent.scrollTo(0, $parent.scrollHeight);
    if (onThreadClose) {
      onThreadClose();
    }
  };

  /**
   * Focus on a thread node (used for bookmark navigation). Opens the thread
   * drill-down rooted at the node's ancestor and scrolls the node into view.
   * @param {string} threadKey - message number (as string)
   */
  const focusOnNode = threadKey => {
    if (!messageIndex.has(threadKey)) return;
    const rootKey = findThreadRoot(threadKey);
    threadStack.length = 0;
    threadStack.push(rootKey);
    showThreadView(rootKey);
    // After the thread renders, scroll the focused node into view.
    requestAnimationFrame(() => {
      const $node = $mount.querySelector(
        `.thread-messages [data-message-id="${CSS.escape(threadKey)}"]`,
      );
      if ($node && $node.scrollIntoView) {
        $node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  };

  // Initial render so the (empty) message-list structure exists immediately.
  rerender();

  // Expose a control API on the parent element so chat.js can programmatically
  // close the thread, focus a node, or dispose the view — hung off the parent
  // exactly where the imperative version put it.
  let disposed = false;
  /** @type {AsyncIterableIterator<unknown> | null} */
  let activeIterator = null;
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let initialScrollTimer = 0;
  /**
   * @type {{
   *   closeThread: () => boolean,
   *   focusOnNode: (threadKey: string) => void,
   *   dispose: () => void,
   * }}
   */
  const channelAPI = harden({
    closeThread: () => {
      if ($parent.classList.contains('thread-active')) {
        hideThreadView();
        return true;
      }
      return false;
    },
    focusOnNode: threadKey => {
      focusOnNode(threadKey);
    },
    dispose: () => {
      disposed = true;
      if (initialScrollTimer) {
        clearTimeout(initialScrollTimer);
        initialScrollTimer = 0;
      }
      if (activeIterator) {
        activeIterator.return();
      }
      unmount($mount);
      $mount.remove();
    },
  });
  /** @type {any} */ ($parent).channelAPI = channelAPI;

  // Escape key navigates back through thread stack (capture phase
  // so it fires before the chat-bar's Escape handler).
  document.addEventListener(
    'keydown',
    e => {
      if (e.key === 'Escape' && $parent.classList.contains('thread-active')) {
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
  const messageIterator = iterateReader(messagesRef);
  activeIterator = messageIterator;

  // Schedule a hard scroll-to-bottom shortly after messages start arriving.
  // The existing message backlog arrives rapidly via the iterator; this
  // timer fires once the initial batch has been rendered, ensuring the
  // user lands at the latest message when switching to a channel.
  initialScrollTimer = setTimeout(() => {
    $parent.scrollTo(0, $parent.scrollHeight);
    initialScrollTimer = 0;
  }, 150);

  for await (const message of messageIterator) {
    if (disposed) break;
    const typedMessage = /** @type {ChannelMessage} */ (message);
    const msgKey = String(typedMessage.number);

    // Skip operational messages (move/deletion) — they have no
    // conversational content. Index them but don't render or count.
    if (
      typedMessage.replyType === 'move' ||
      typedMessage.replyType === 'deletion'
    ) {
      messageIndex.set(msgKey, { message: typedMessage });
      continue; // eslint-disable-line no-continue
    }

    // React / redact-react: track and update the target message's pills.
    if (
      typedMessage.replyType === 'react' ||
      typedMessage.replyType === 'redact-react'
    ) {
      // Index the react message so getRootMessageKey can follow its chain.
      messageIndex.set(msgKey, { message: typedMessage });
      const rootKey = reactSystem.processReactMessage(typedMessage, msgKey);
      if (rootKey) {
        // Re-bridge the target's pills (and the rest) from current state.
        rerender();
      }
      continue; // eslint-disable-line no-continue
    }

    // Register in the message index. The view re-renders from messageIndex.
    messageIndex.set(msgKey, { message: typedMessage });

    // Track reply relationships
    if (typedMessage.replyTo) {
      const parentKey = typedMessage.replyTo;
      if (!replyChildren.has(parentKey)) {
        replyChildren.set(parentKey, []);
      }
      /** @type {string[]} */ (replyChildren.get(parentKey)).push(msgKey);
    }

    if (!isLive()) break;

    // Warm the member cache before rendering so the synchronous reads in the
    // reply indicator, reply button, and thread-open callback resolve to
    // proposed names rather than raw member ids on first paint. The original
    // imperative createMessageElement awaited getMemberInfo before appending
    // the element; the confined render reads from the cache synchronously.
    await getMemberInfo(typedMessage.memberId);
    if (typedMessage.replyTo) {
      const parentData = messageIndex.get(typedMessage.replyTo);
      if (parentData) await getMemberInfo(parentData.message.memberId);
    }

    rerender();

    // Live-update thread view if the new message belongs to the currently
    // viewed thread — scroll the thread messages to show the new message.
    if (threadActive && threadStack.length > 0) {
      const currentRoot = threadStack[threadStack.length - 1];
      if (isInThread(msgKey, currentRoot)) {
        requestAnimationFrame(() => {
          const $tm = $mount.querySelector('.thread-messages');
          if ($tm) {
            $tm.scrollTop = $tm.scrollHeight;
          }
        });
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
