// @ts-check
/* global document, requestAnimationFrame, setTimeout, clearTimeout, window */

import harden from '@endo/harden';
import { E } from '@endo/far';
import { makeRefIterator } from './ref-iterator.js';
import { createChannelState } from './channel-utils.js';
import {
  isVisibleReplyType,
  computeNodeContent,
  isEffectivelyDeleted,
} from './edit-queue.js';

/** @import { ChannelMessage, ChannelState } from './channel-utils.js' */

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
    onThreadOpen,
    onThreadClose,
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

  const { messageIndex, replyChildren, countDescendants } = state;

  const msgOpts = { ownMemberId, onReply, showValue, onFork, onShare };

  // Container for the feed
  const $feed = document.createElement('div');
  $feed.className = 'microblog-feed';
  $parent.appendChild($feed);

  // Profile header (populated once first root arrives)
  const $header = document.createElement('div');
  $header.className = 'microblog-header';
  $feed.appendChild($header);

  // Posts container (newest-first)
  const $posts = document.createElement('div');
  $posts.className = 'microblog-posts';
  $feed.appendChild($posts);

  /** @type {string | null} */
  let headerKey = null;

  /** @type {Map<string, HTMLElement>} */
  const postElements = new Map();

  /** @type {Set<string>} */
  const expandedPosts = new Set();

  /**
   * Collect root keys (messages with no replyTo) in chronological order.
   * @returns {string[]}
   */
  const getRootKeys = () => {
    /** @type {string[]} */
    const roots = [];
    for (const [key, data] of messageIndex) {
      const { message } = data;
      if (message.replyTo) continue;
      if (!isVisibleReplyType(message.replyType)) continue;
      const effective = computeNodeContent(key, messageIndex, replyChildren);
      if (effective && isEffectivelyDeleted(effective)) continue;
      roots.push(key);
    }
    // Sort chronologically (by message number)
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
   * Render the profile header from the first root message.
   * @param {ChannelMessage} message
   */
  const renderHeader = async message => {
    $header.innerHTML = '';

    const $el = await state.createMessageElement(message, {
      ...msgOpts,
      skipReplyIndicator: true,
    });
    $el.classList.add('microblog-header-content');
    $header.appendChild($el);
  };

  /**
   * Render a single post card.
   * @param {string} key
   * @param {ChannelMessage} message
   * @returns {Promise<HTMLElement>}
   */
  const renderPost = async (key, message) => {
    const $post = document.createElement('div');
    $post.className = 'microblog-post';
    $post.dataset.key = key;

    // Main message content
    const effective = computeNodeContent(key, messageIndex, replyChildren);
    const effectiveMessage =
      effective && (effective.strings !== message.strings || effective.names !== message.names)
        ? { ...message, strings: effective.strings, names: effective.names, ids: effective.ids }
        : message;

    const $msgEl = await state.createMessageElement(
      /** @type {ChannelMessage} */ (effectiveMessage),
      {
        ...msgOpts,
        skipReplyIndicator: true,
      },
    );
    $post.appendChild($msgEl);

    // Comment count / expand toggle
    const commentCount = countDescendants(key);
    if (commentCount > 0) {
      const $comments = document.createElement('div');
      $comments.className = 'microblog-comments-section';

      const $toggle = document.createElement('button');
      $toggle.className = 'microblog-comments-toggle';
      $toggle.type = 'button';
      const isExpanded = expandedPosts.has(key);
      $toggle.textContent = isExpanded
        ? `Hide ${commentCount} comment${commentCount === 1 ? '' : 's'}`
        : `${commentCount} comment${commentCount === 1 ? '' : 's'}`;
      $toggle.addEventListener('click', () => {
        if (expandedPosts.has(key)) {
          expandedPosts.delete(key);
        } else {
          expandedPosts.add(key);
        }
        // Re-render this post
        renderPost(key, message).then($newPost => {
          const $existing = postElements.get(key);
          if ($existing && $existing.parentNode) {
            $existing.parentNode.replaceChild($newPost, $existing);
          }
          postElements.set(key, $newPost);
        }).catch(window.reportError);
      });
      $comments.appendChild($toggle);

      if (isExpanded) {
        const $commentList = document.createElement('div');
        $commentList.className = 'microblog-comment-list';

        // Get direct replies, sorted chronologically
        const childKeys = replyChildren.get(key) || [];
        const sorted = [...childKeys].sort((a, b) => {
          const ma = messageIndex.get(a);
          const mb = messageIndex.get(b);
          if (!ma || !mb) return 0;
          if (ma.message.number < mb.message.number) return -1;
          if (ma.message.number > mb.message.number) return 1;
          return 0;
        });

        for (const childKey of sorted) {
          const childData = messageIndex.get(childKey);
          if (!childData) continue;
          if (!isVisibleReplyType(childData.message.replyType)) continue;
          const childEffective = computeNodeContent(
            childKey,
            messageIndex,
            replyChildren,
          );
          if (childEffective && isEffectivelyDeleted(childEffective)) continue;

          const childMessage =
            childEffective &&
            (childEffective.strings !== childData.message.strings ||
              childEffective.names !== childData.message.names)
              ? {
                  ...childData.message,
                  strings: childEffective.strings,
                  names: childEffective.names,
                  ids: childEffective.ids,
                }
              : childData.message;

          // eslint-disable-next-line no-await-in-loop
          const $commentEl = await state.createMessageElement(
            /** @type {ChannelMessage} */ (childMessage),
            {
              ...msgOpts,
              skipReplyIndicator: true,
            },
          );
          $commentEl.classList.add('microblog-comment');
          $commentList.appendChild($commentEl);
        }

        $comments.appendChild($commentList);
      }

      $post.appendChild($comments);
    }

    return $post;
  };

  /**
   * Full render of the feed.
   */
  const renderFeed = async () => {
    const roots = getRootKeys();

    // First root is the profile header
    if (roots.length > 0) {
      const firstKey = roots[0];
      const firstData = messageIndex.get(firstKey);
      if (firstData && firstKey !== headerKey) {
        headerKey = firstKey;
        await renderHeader(firstData.message);
      }
    }

    // Remaining roots are posts, displayed newest-first
    const postRoots = roots.slice(1).reverse();

    // Clear and rebuild posts
    $posts.innerHTML = '';
    postElements.clear();

    if (postRoots.length === 0 && roots.length <= 1) {
      const $empty = document.createElement('div');
      $empty.className = 'microblog-empty';
      $empty.textContent = 'No posts yet';
      $posts.appendChild($empty);
      return;
    }

    for (const key of postRoots) {
      const data = messageIndex.get(key);
      if (!data) continue;
      // eslint-disable-next-line no-await-in-loop
      const $post = await renderPost(key, data.message);
      postElements.set(key, $post);
      $posts.appendChild($post);
    }
  };

  // Batch incoming messages and re-render
  /** @type {number} */
  let renderTimer = 0;
  const scheduleRender = () => {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = 0;
      renderFeed().catch(window.reportError);
    }, 150);
  };

  // Start following messages
  const messagesRef = await E(channel).followMessages();
  const messagesIterator = makeRefIterator(messagesRef);

  /** @type {boolean} */
  let disposed = false;

  const consumeMessages = async () => {
    for await (const message of messagesIterator) {
      if (disposed) break;

      const msg = /** @type {ChannelMessage} */ (message);
      const key = String(msg.number);

      messageIndex.set(key, {
        message: msg,
        $element: document.createElement('div'),
      });

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
};
harden(microblogComponent);
