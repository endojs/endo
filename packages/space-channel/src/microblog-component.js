// @ts-check
/* eslint-disable no-continue */

import harden from '@endo/harden';
import { E } from '@endo/far';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import {
  relativeTime,
  dateFormatter,
} from '@endo/spaces-util/time-formatters.js';
import { prepareTextWithPlaceholders } from '@endo/spaces-util/markdown-render.js';
import { markdownToVnodes } from '@endo/spaces-util/markdown-vnodes.js';
import {
  Fragment,
  h,
  renderConfined,
  unmount,
} from './setup-preact-container.js';

import { createChannelState } from './channel-utils.js';
import { createReactSystem } from './react-utils.js';
import { isVisibleReplyType, computeNodeContent } from './edit-queue.js';

/** @import { ChannelMessage, ChannelRef } from './channel-utils.js' */

// Microblog view — a reverse-chronological feed, migrated from imperative DOM to
// a confined Preact component rendered through a single `renderConfined`.
//
// THE HOST-NODE BRIDGE PATTERN. The feed structure (header, posts, comments,
// bodies, action bars) renders confined as `h()` vnodes. Three pieces remain
// imperative DOM produced by reused helpers that are NOT view-migration targets:
//   - author chips (`channel-utils` profile popup — positions a portal, mutates
//     `nameMap`, re-renders sibling chips by DOM query),
//   - react buttons and react pills (`react-utils` — a `document.body` react
//     picker portal, nested sub-reacts, contextmenu handlers).
// Live DOM (with listeners) cannot enter a confined vnode tree — `renderConfined`
// strips refs and real nodes. So the chrome renders empty ANCHOR slots
// (`data-author-anchor` / `data-react-btn-anchor` / `data-react-pills-anchor`)
// and, after each confined render, the controller re-parents the imperative
// nodes into their anchors. This is the same host-node embedding define-form
// uses for the Monaco editor.
//
// Message bodies use the vnode path (`markdownToVnodes`) instead of the
// string-returning `renderMarkdown`/`.innerHTML`, mirroring the inbox migration.
//
// Teardown: chat.js has no dispose hook — it rebuilds `$messages` on
// space/conversation switch, which detaches `$mount`. The message-consumer loop
// stops dispatching once `isLive()` reports the mount detached.

/**
 * Render the microblog view — a reverse-chronological feed.
 *
 * The first root message acts as a profile header / bio.
 * Subsequent root messages are "posts", displayed newest-first.
 * Replies to posts are "comments" (collapsed by default, expandable).
 *
 * @param {HTMLElement} $parent - Container for messages
 * @param {HTMLElement | null} $end - Scroll anchor element
 * @param {unknown} channel - Channel or ChannelMember reference
 * @param {object} options
 * @param {(value: unknown, id?: string, petNamePath?: string[]) => void | Promise<void>} options.showValue
 * @param {string} [options.personaId]
 * @param {string} [options.ownMemberId]
 * @param {(info: { number: bigint, memberId: string, authorName: string, preview: string }) => void} [options.onReply]
 * @param {(info: { number: string, authorName: string, preview: string }) => void} [options.onThreadOpen]
 * @param {() => void} [options.onThreadClose]
 * @param {() => object | null} [options.chatBarAPI]
 * @param {(heritageChain: ChannelMessage[], previewText: string) => Promise<void>} [options.onFork]
 * @param {(heritageChain: ChannelMessage[], previewText: string) => void} [options.onShare]
 */
export const microblogComponent = async (
  $parent,
  $end,
  channel,
  {
    showValue,
    personaId,
    ownMemberId,
    onReply,
    // eslint-disable-next-line no-unused-vars
    onThreadOpen,
    // eslint-disable-next-line no-unused-vars
    onThreadClose,
    // eslint-disable-next-line no-unused-vars
    chatBarAPI,
    onFork,
    onShare,
  },
) => {
  // Initialize shared channel state
  const state = await createChannelState(channel, {
    personaId,
    ownMemberId,
    $parent,
  });

  const {
    messageIndex,
    replyChildren,
    countDescendants,
    nameMap,
    getMemberInfo,
    profilePopup,
    saveNameMap,
    updateAuthorChips,
  } = state;

  // Shared react system
  const reactSystem = createReactSystem({
    channel,
    ownMemberId,
    nameMap,
    getMemberInfo,
  });

  /** @type {Set<string>} */
  const blockedMemberIds = new Set();

  /** @type {Set<string>} */
  const expandedPosts = new Set();

  // Dedicated confined mount, inserted before the scroll anchor so
  // switchChannel's cleanup (which clears `$parent`) still works and siblings
  // (the `$end` anchor) are never reconciled away.
  const $mount = document.createElement('div');
  $mount.className = 'microblog-feed';
  if ($end) {
    $parent.insertBefore($mount, $end);
  } else {
    $parent.appendChild($mount);
  }
  const isLive = () => $mount.isConnected;

  // ---- Imperative host-node helpers (bridged into anchors after each render) ----

  /**
   * Create a clickable author element (imperative DOM) with profile popup.
   * Identical to the original `createAuthorEl`.
   * @param {string} memberId
   * @returns {HTMLElement}
   */
  const createAuthorEl = memberId => {
    const $author = document.createElement('span');
    $author.className = 'channel-author microblog-author';
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
        if (!info) return;
        const current = nameMap.get(memberId);
        if (!current) {
          $author.textContent = `“${info.proposedName}”`;
        }
        $author.dataset.proposedName = info.proposedName;
        $author.addEventListener('click', e => {
          e.stopPropagation();
          profilePopup.show({
            proposedName: info.proposedName,
            pedigree: info.pedigree,
            pedigreeMemberIds: info.pedigreeMemberIds,
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

  // ---- Pure helpers ----

  /**
   * Get heritage chain for a message key.
   * @param {string} key
   * @returns {ChannelMessage[]}
   */
  const getHeritageChain = key => {
    /** @type {ChannelMessage[]} */
    const chain = [];
    /** @type {string | undefined} */
    let current = key;
    while (current) {
      const entry = messageIndex.get(current);
      if (!entry) break;
      chain.unshift(entry.message);
      current = entry.message.replyTo;
    }
    return chain;
  };

  /**
   * Sort child keys chronologically.
   * @param {string[]} keys
   * @returns {string[]}
   */
  const sortChronologically = keys =>
    [...keys].sort((a, b) => {
      const ma = messageIndex.get(a);
      const mb = messageIndex.get(b);
      if (!ma || !mb) return 0;
      if (ma.message.number < mb.message.number) return -1;
      if (ma.message.number > mb.message.number) return 1;
      return 0;
    });

  /**
   * Collect root keys in chronological order.
   * @returns {string[]}
   */
  const getRootKeys = () => {
    /** @type {string[]} */
    const roots = [];
    for (const [key, data] of messageIndex) {
      const { message } = data;
      if (message.replyTo) continue;
      if (!isVisibleReplyType(message.replyType)) continue;
      const effective = computeNodeContent(
        key,
        messageIndex,
        replyChildren,
        blockedMemberIds,
      );
      if (effective && effective.deleted) continue;
      roots.push(key);
    }
    roots.sort((a, b) => {
      const ma = messageIndex.get(a);
      const mb = messageIndex.get(b);
      if (!ma || !mb) return 0;
      if (ma.message.number < mb.message.number) return -1;
      if (ma.message.number > mb.message.number) return 1;
      return 0;
    });
    return roots;
  };

  /**
   * Apply effective (edit/delete-resolved) content over a message's fields.
   * @param {string} key
   * @param {ChannelMessage} message
   * @returns {ChannelMessage}
   */
  const effectiveMessage = (key, message) => {
    const effective = computeNodeContent(
      key,
      messageIndex,
      replyChildren,
      blockedMemberIds,
    );
    return effective
      ? /** @type {ChannelMessage} */ ({
          ...message,
          strings: effective.strings,
          names: effective.names,
          ids: effective.ids,
        })
      : message;
  };

  // ---- View (confined Preact vnodes) ----

  /**
   * Render a message body as vnodes with interactive token chips. Mirrors the
   * original `renderBody`, but emits vnodes (no `.innerHTML`).
   * @param {ChannelMessage} message
   * @param {string} [extraClass] - Appended to the `microblog-body` class.
   * @returns {import('preact').VNode}
   */
  const Body = (message, extraClass) => {
    const cls = extraClass ? `microblog-body ${extraClass}` : 'microblog-body';
    const messageNames = /** @type {string[]} */ (
      /** @type {any} */ (message).names ||
        /** @type {any} */ (message).edgeNames ||
        []
    );

    if (!message.strings || message.strings.length === 0) {
      return h('div', { class: cls });
    }

    const textWithPlaceholders = prepareTextWithPlaceholders(message.strings);

    /** @type {import('@endo/spaces-util/markdown-vnodes.js').RenderToken} */
    const renderToken = index => {
      const edgeName = messageNames[index];
      if (edgeName === undefined) return null;
      return h(
        'span',
        {
          key: `chip-${index}`,
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
    return h('div', { class: cls }, ...nodes, ...extraChips);
  };

  /**
   * An author chip anchor — the imperative `createAuthorEl` node is re-parented
   * here after render.
   * @param {object} props
   * @param {string} props.memberId
   * @param {string} [props.class]
   */
  const AuthorAnchor = ({ memberId, class: className }) =>
    h('span', {
      class: className,
      'data-author-anchor': memberId,
    });

  /**
   * The interaction bar (reply / react / comments / share / fork).
   * @param {object} props
   * @param {string} props.messageKey
   * @param {ChannelMessage} props.message
   * @param {string} props.rootPostKey
   */
  const ActionBar = ({ messageKey, message, rootPostKey }) => {
    const replyCount = countDescendants(messageKey);
    return h(
      'div',
      { class: 'microblog-actions' },
      // Reply button
      onReply
        ? h(
            'button',
            {
              class: 'microblog-action-btn',
              type: 'button',
              title: 'Reply',
              onClick: () => {
                const preview = message.strings.join('').substring(0, 60);
                getMemberInfo(message.memberId)
                  .then(info => {
                    const authorName = info
                      ? info.proposedName
                      : message.memberId;
                    onReply({
                      number: message.number,
                      memberId: message.memberId,
                      authorName,
                      preview,
                    });
                  })
                  .catch(() => {});
              },
            },
            h('span', { class: 'microblog-action-icon' }, '↩'),
          )
        : null,
      // React button (imperative host node, bridged via anchor)
      h('span', { 'data-react-btn-anchor': messageKey }),
      // Comments toggle
      h(
        'button',
        {
          class: 'microblog-action-btn',
          type: 'button',
          title: replyCount > 0 ? 'Show replies' : 'No replies',
          onClick:
            replyCount > 0
              ? () => {
                  if (expandedPosts.has(messageKey)) {
                    expandedPosts.delete(messageKey);
                  } else {
                    expandedPosts.add(messageKey);
                  }
                  rerender();
                }
              : undefined,
        },
        h('span', { class: 'microblog-action-icon' }, '💬'),
        replyCount > 0
          ? h('span', { class: 'microblog-action-count' }, String(replyCount))
          : null,
      ),
      // Share action
      onShare
        ? h(
            'button',
            {
              class: 'microblog-action-btn',
              type: 'button',
              title: 'Share',
              onClick: () => {
                const chain = getHeritageChain(messageKey);
                const preview =
                  message.strings.join('').substring(0, 60) || 'Shared post';
                onShare(chain, preview);
              },
            },
            h('span', { class: 'microblog-action-icon' }, '⇗'),
          )
        : null,
      // Fork action
      onFork
        ? h(
            'button',
            {
              class: 'microblog-action-btn',
              type: 'button',
              title: 'Fork to channel',
              onClick: () => {
                const chain = getHeritageChain(messageKey);
                const preview =
                  message.strings.join('').substring(0, 40) || 'Forked post';
                onFork(chain, preview).catch(window.reportError);
              },
            },
            h('span', { class: 'microblog-action-icon' }, '⑂'),
          )
        : null,
    );
  };

  /**
   * Render a single comment (optionally with nested replies).
   * @param {object} props
   * @param {string} props.childKey
   * @param {string} props.rootPostKey
   */
  const Comment = ({ childKey, rootPostKey }) => {
    const childData = messageIndex.get(childKey);
    if (!childData) return null;
    if (!isVisibleReplyType(childData.message.replyType)) return null;
    const childEffective = computeNodeContent(
      childKey,
      messageIndex,
      replyChildren,
      blockedMemberIds,
    );
    if (childEffective && childEffective.deleted) return null;

    const childMsg = effectiveMessage(childKey, childData.message);
    const cDate = new Date(childData.message.date);
    const cRel = relativeTime(cDate);

    return h(
      'div',
      { class: 'microblog-comment' },
      h(
        'div',
        { class: 'microblog-comment-head' },
        h(AuthorAnchor, { memberId: childData.message.memberId }),
        h('span', { class: 'microblog-post-sep' }, '·'),
        h(
          'time',
          {
            class: 'microblog-post-time',
            title: dateFormatter.format(cDate),
          },
          cRel || dateFormatter.format(cDate),
        ),
      ),
      Body(childMsg),
      h(ActionBar, {
        messageKey: childKey,
        message: childData.message,
        rootPostKey,
      }),
      // React pills (imperative host node, bridged via anchor)
      h('span', { 'data-react-pills-anchor': childKey }),
      expandedPosts.has(childKey) && countDescendants(childKey) > 0
        ? h(CommentList, { parentKey: childKey, rootPostKey })
        : null,
    );
  };

  /**
   * Render the comments list for a parent key.
   * @param {object} props
   * @param {string} props.parentKey
   * @param {string} [props.rootPostKey]
   */
  const CommentList = ({ parentKey, rootPostKey }) => {
    const root = rootPostKey || parentKey;
    const childKeys = replyChildren.get(parentKey) || [];
    const sorted = sortChronologically(childKeys);
    return h(
      'div',
      { class: 'microblog-comments-section' },
      sorted.map(childKey =>
        h(Comment, { key: childKey, childKey, rootPostKey: root }),
      ),
    );
  };

  /**
   * Render a single top-level post.
   * @param {object} props
   * @param {string} props.postKey
   */
  const Post = ({ postKey }) => {
    const data = messageIndex.get(postKey);
    if (!data) return null;
    const { message } = data;
    const effectiveMsg = effectiveMessage(postKey, message);
    const date = new Date(message.date);
    const rel = relativeTime(date);

    return h(
      'div',
      { class: 'microblog-post', 'data-key': postKey },
      h(
        'div',
        { class: 'microblog-post-head' },
        h(AuthorAnchor, { memberId: message.memberId }),
        h('span', { class: 'microblog-post-sep' }, '·'),
        h(
          'time',
          {
            class: 'microblog-post-time',
            title: dateFormatter.format(date),
            datetime: message.date,
          },
          rel || dateFormatter.format(date),
        ),
      ),
      Body(effectiveMsg),
      h(ActionBar, { messageKey: postKey, message, rootPostKey: postKey }),
      // React pills (imperative host node, bridged via anchor)
      h('span', { 'data-react-pills-anchor': postKey }),
      expandedPosts.has(postKey) && countDescendants(postKey) > 0
        ? h(CommentList, { parentKey: postKey })
        : null,
    );
  };

  /**
   * The whole feed: profile header + newest-first posts.
   */
  const Feed = () => {
    const roots = getRootKeys();

    // First root is the profile header / bio.
    let header = null;
    if (roots.length > 0) {
      const firstKey = roots[0];
      const firstData = messageIndex.get(firstKey);
      if (firstData) {
        const bioMsg = effectiveMessage(firstKey, firstData.message);
        header = h(
          'div',
          { class: 'microblog-header' },
          h(
            'div',
            { class: 'microblog-header-author' },
            h(AuthorAnchor, { memberId: firstData.message.memberId }),
          ),
          Body(bioMsg, 'microblog-header-bio'),
        );
      }
    } else {
      header = h('div', { class: 'microblog-header' });
    }

    // Remaining roots are posts, newest-first.
    const postRoots = roots.slice(1).reverse();

    const posts =
      postRoots.length === 0 && roots.length <= 1
        ? h('div', { class: 'microblog-empty' }, 'No posts yet')
        : postRoots.map(key => h(Post, { key, postKey: key }));

    return h(
      Fragment,
      null,
      header,
      h('div', { class: 'microblog-posts' }, posts),
    );
  };

  // ---- Host-node bridging ----

  // Cache imperative react-button nodes (one stable node per message key) so
  // they survive confined re-renders rather than re-binding listeners each time.
  /** @type {Map<string, HTMLElement>} */
  const reactButtonNodes = new Map();

  /**
   * After each confined render, re-parent the imperative host nodes into their
   * freshly rendered anchors.
   */
  const bridgeHostNodes = () => {
    // Author chips — keyed by memberId (a member may appear in several anchors;
    // re-create per anchor so each post/comment has its own chip element, as the
    // original did).
    const authorAnchors = $mount.querySelectorAll('[data-author-anchor]');
    for (const $anchor of authorAnchors) {
      const el = /** @type {HTMLElement} */ (/** @type {unknown} */ ($anchor));
      if (el.firstChild) continue;
      const memberId = el.getAttribute('data-author-anchor') || '';
      el.appendChild(createAuthorEl(memberId));
    }

    // React buttons — one per message key (stable, reusable node).
    const reactBtnAnchors = $mount.querySelectorAll('[data-react-btn-anchor]');
    for (const $anchor of reactBtnAnchors) {
      const el = /** @type {HTMLElement} */ (/** @type {unknown} */ ($anchor));
      if (el.firstChild) continue;
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

  /**
   * Render the confined feed, then bridge the imperative host nodes.
   * `renderConfined` is synchronous, so anchors exist when bridging runs.
   */
  const rerender = () => {
    renderConfined(h(Feed, null), $mount);
    bridgeHostNodes();
  };

  // ---- Controller ----

  // Scroll to top (Twitter-style: newest content at top)
  $parent.scrollTo(0, 0);

  let initialLoadComplete = false;

  // Batch incoming messages and re-render.
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let renderTimer = 0;
  const scheduleRender = () => {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = 0;
      if (!isLive()) return;
      try {
        rerender();
        if (!initialLoadComplete) {
          initialLoadComplete = true;
          $parent.scrollTo(0, 0);
        }
      } catch (err) {
        window.reportError(/** @type {Error} */ (err));
      }
    }, 150);
  };

  // Initial render so the empty feed structure exists immediately.
  rerender();

  // Start following messages.
  const messagesRef = await E(
    /** @type {ChannelRef} */ (channel),
  ).followMessages();
  const messagesIterator = iterateReader(
    /** @type {Parameters<typeof iterateReader>[0]} */ (
      /** @type {unknown} */ (messagesRef)
    ),
    {
      // Prefetch a window of messages so the backlog streams without a
      // round-trip acknowledgement per message.
      buffer: 64,
    },
  );

  const consumeMessages = async () => {
    for await (const message of messagesIterator) {
      if (!isLive()) break;

      const msg = /** @type {ChannelMessage} */ (message);
      const key = String(msg.number);

      messageIndex.set(key, { message: msg });

      // Track reacts
      reactSystem.processReactMessage(msg, key);

      if (msg.replyTo) {
        const children = replyChildren.get(msg.replyTo) || [];
        if (!children.includes(key)) {
          children.push(key);
          replyChildren.set(msg.replyTo, children);
        }
      }

      scheduleRender();
    }
  };

  consumeMessages().catch(window.reportError);

  const channelAPI = harden({
    // Microblog has no thread sub-view; closeThread is a no-op for parity with
    // the channelComponent API that chat.js's switchChannel calls.
    closeThread: () => false,
    /** Tear down the confined tree and detach host nodes. */
    dispose: () => {
      if (renderTimer) {
        clearTimeout(renderTimer);
        renderTimer = 0;
      }
      unmount($mount);
      $mount.remove();
    },
  });
  // chat.js's switchChannel reads `$parent.channelAPI` (the fire-and-forget
  // mount's return value is ignored), so teardown only runs if the API is hung
  // there — matching forum-component / channel-component.
  /** @type {any} */ ($parent).channelAPI = channelAPI;
  return channelAPI;
};
harden(microblogComponent);
