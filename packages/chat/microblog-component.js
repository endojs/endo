// @ts-check
/* global document, requestAnimationFrame, setTimeout, clearTimeout, window */

import harden from '@endo/harden';
import { E } from '@endo/far';
import { makeRefIterator } from './ref-iterator.js';
import { createChannelState } from './channel-utils.js';
import { createReactSystem } from './react-utils.js';
import {
  isVisibleReplyType,
  computeNodeContent,
} from './edit-queue.js';
import { relativeTime, dateFormatter } from './time-formatters.js';
import {
  prepareTextWithPlaceholders,
  renderMarkdown,
} from './markdown-render.js';

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
 * @param {() => import('./send-form.js').SendFormAPI | null} [options.chatBarAPI]
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

  // Container for the feed — insert before anchor so switchChannel can clear it
  const $feed = document.createElement('div');
  $feed.className = 'microblog-feed';
  if ($end) {
    $parent.insertBefore($feed, $end);
  } else {
    $parent.appendChild($feed);
  }

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

  /** @type {Set<string>} */
  const renderedPostKeys = new Set();

  // ---- Helpers ----

  /**
   * Get display name for a member.
   * @param {string} memberId
   * @returns {Promise<string>}
   */
  const getDisplayName = async memberId => {
    const assigned = nameMap.get(memberId);
    if (assigned) return assigned;
    const info = await getMemberInfo(memberId);
    return info ? `\u201C${info.proposedName}\u201D` : memberId;
  };

  /**
   * Render message body text with token placeholders.
   * @param {ChannelMessage} message
   * @returns {HTMLElement}
   */
  const renderBody = message => {
    const $body = document.createElement('div');
    $body.className = 'microblog-body';

    const messageNames =
      /** @type {any} */ (message).names ||
      /** @type {any} */ (message).edgeNames ||
      [];

    if (message.strings && message.strings.length > 0) {
      const textWithPlaceholders = prepareTextWithPlaceholders(message.strings);
      const { fragment, insertionPoints } =
        renderMarkdown(textWithPlaceholders);
      $body.appendChild(fragment);

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

    return $body;
  };

  /**
   * Create a clickable author element with profile popup support.
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

    getMemberInfo(memberId).then(info => {
      if (!info) return;
      const current = nameMap.get(memberId);
      if (!current) {
        $author.textContent = `\u201C${info.proposedName}\u201D`;
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
    }).catch(() => {});

    return $author;
  };

  /**
   * Get heritage chain for a message key.
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

  // ---- Rendering ----

  /**
   * Render the profile header from the first root message.
   * @param {string} key
   * @param {ChannelMessage} message
   */
  const renderHeader = async (key, message) => {
    $header.innerHTML = '';

    const effective = computeNodeContent(key, messageIndex, replyChildren, blockedMemberIds);
    const effectiveMsg = effective
      ? { ...message, strings: effective.strings, names: effective.names, ids: effective.ids }
      : message;

    // Author display name (large)
    const $authorRow = document.createElement('div');
    $authorRow.className = 'microblog-header-author';
    $authorRow.appendChild(createAuthorEl(message.memberId));
    $header.appendChild($authorRow);

    // Bio text (the message content)
    const $bio = renderBody(/** @type {ChannelMessage} */ (effectiveMsg));
    $bio.classList.add('microblog-header-bio');
    $header.appendChild($bio);
  };

  /**
   * Create the interaction bar (reply/comment, share, fork) for a message.
   * Used on both top-level posts and nested comments.
   *
   * @param {string} key - Message key
   * @param {ChannelMessage} message - The message
   * @param {string} rootPostKey - Top-level post key (for re-render on toggle)
   * @returns {HTMLElement}
   */
  const createActionBar = (key, message, rootPostKey) => {
    const $actions = document.createElement('div');
    $actions.className = 'microblog-actions';

    // Reply button — sets reply context in chat bar
    if (onReply) {
      const $replyBtn = document.createElement('button');
      $replyBtn.className = 'microblog-action-btn';
      $replyBtn.type = 'button';
      $replyBtn.title = 'Reply';
      const $replyIcon = document.createElement('span');
      $replyIcon.className = 'microblog-action-icon';
      $replyIcon.textContent = '\u21A9'; // ↩
      $replyBtn.appendChild($replyIcon);
      $replyBtn.addEventListener('click', () => {
        const preview = message.strings.join('').substring(0, 60);
        getMemberInfo(message.memberId)
          .then(info => {
            const authorName = info ? info.proposedName : message.memberId;
            onReply({
              number: message.number,
              memberId: message.memberId,
              authorName,
              preview,
            });
          })
          .catch(() => {});
      });
      $actions.appendChild($replyBtn);
    }

    // React button
    $actions.appendChild(reactSystem.createReactButton(key));

    // Comments toggle — expands/collapses replies
    const replyCount = countDescendants(key);
    const $commentsBtn = document.createElement('button');
    $commentsBtn.className = 'microblog-action-btn';
    $commentsBtn.type = 'button';
    $commentsBtn.title = replyCount > 0 ? 'Show replies' : 'No replies';
    const $commentsIcon = document.createElement('span');
    $commentsIcon.className = 'microblog-action-icon';
    $commentsIcon.textContent = '\uD83D\uDCAC'; // 💬
    $commentsBtn.appendChild($commentsIcon);
    if (replyCount > 0) {
      const $count = document.createElement('span');
      $count.className = 'microblog-action-count';
      $count.textContent = String(replyCount);
      $commentsBtn.appendChild($count);
    }
    if (replyCount > 0) {
      $commentsBtn.addEventListener('click', () => {
        if (expandedPosts.has(key)) {
          expandedPosts.delete(key);
        } else {
          expandedPosts.add(key);
        }
        const rootData = messageIndex.get(rootPostKey);
        if (rootData) {
          rerenderPost(rootPostKey, rootData.message);
        }
      });
    }
    $actions.appendChild($commentsBtn);

    // Share action
    if (onShare) {
      const $shareBtn = document.createElement('button');
      $shareBtn.className = 'microblog-action-btn';
      $shareBtn.type = 'button';
      $shareBtn.title = 'Share';
      const $shareIcon = document.createElement('span');
      $shareIcon.className = 'microblog-action-icon';
      $shareIcon.textContent = '\u21D7'; // ⇗
      $shareBtn.appendChild($shareIcon);
      $shareBtn.addEventListener('click', () => {
        const chain = getHeritageChain(key);
        const preview =
          message.strings.join('').substring(0, 60) || 'Shared post';
        onShare(chain, preview);
      });
      $actions.appendChild($shareBtn);
    }

    // Fork action
    if (onFork) {
      const $forkBtn = document.createElement('button');
      $forkBtn.className = 'microblog-action-btn';
      $forkBtn.type = 'button';
      $forkBtn.title = 'Fork to channel';
      const $forkIcon = document.createElement('span');
      $forkIcon.className = 'microblog-action-icon';
      $forkIcon.textContent = '\u2442'; // ⑂
      $forkBtn.appendChild($forkIcon);
      $forkBtn.addEventListener('click', () => {
        const chain = getHeritageChain(key);
        const preview =
          message.strings.join('').substring(0, 40) || 'Forked post';
        onFork(chain, preview).catch(window.reportError);
      });
      $actions.appendChild($forkBtn);
    }

    return $actions;
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
   * Render a single comment with optional nested replies.
   * @param {string} childKey
   * @param {string} rootPostKey - The top-level post key (for re-render on expand)
   * @returns {HTMLElement | null}
   */
  const renderComment = (childKey, rootPostKey) => {
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

    const childMsg = childEffective
      ? {
          ...childData.message,
          strings: childEffective.strings,
          names: childEffective.names,
          ids: childEffective.ids,
        }
      : childData.message;

    const $comment = document.createElement('div');
    $comment.className = 'microblog-comment';

    const $commentHead = document.createElement('div');
    $commentHead.className = 'microblog-comment-head';
    $commentHead.appendChild(createAuthorEl(childData.message.memberId));

    const $cSep = document.createElement('span');
    $cSep.className = 'microblog-post-sep';
    $cSep.textContent = '\u00B7';
    $commentHead.appendChild($cSep);

    const cDate = new Date(childData.message.date);
    const $cTime = document.createElement('time');
    $cTime.className = 'microblog-post-time';
    const cRel = relativeTime(cDate);
    $cTime.textContent = cRel || dateFormatter.format(cDate);
    $cTime.title = dateFormatter.format(cDate);
    $commentHead.appendChild($cTime);

    $comment.appendChild($commentHead);
    $comment.appendChild(
      renderBody(/** @type {ChannelMessage} */ (childMsg)),
    );

    // Interaction bar (same as top-level posts)
    $comment.appendChild(createActionBar(childKey, childData.message, rootPostKey));

    // React pills
    {
      const $pills = reactSystem.buildReactsContainer(childKey);
      if ($pills) $comment.appendChild($pills);
    }

    // Expanded nested replies
    if (expandedPosts.has(childKey) && countDescendants(childKey) > 0) {
      $comment.appendChild(renderCommentList(childKey, rootPostKey));
    }

    return $comment;
  };

  /**
   * Render the list of comments for a parent key.
   * @param {string} parentKey
   * @param {string} [rootPostKey] - Top-level post key; defaults to parentKey
   * @returns {HTMLElement}
   */
  const renderCommentList = (parentKey, rootPostKey) => {
    const root = rootPostKey || parentKey;
    const $comments = document.createElement('div');
    $comments.className = 'microblog-comments-section';

    const childKeys = replyChildren.get(parentKey) || [];
    const sorted = sortChronologically(childKeys);

    for (const childKey of sorted) {
      const $el = renderComment(childKey, root);
      if ($el) $comments.appendChild($el);
    }

    return $comments;
  };

  /**
   * Render a single post.
   * @param {string} key
   * @param {ChannelMessage} message
   * @returns {Promise<HTMLElement>}
   */
  const renderPost = async (key, message) => {
    const $post = document.createElement('div');
    $post.className = 'microblog-post';
    $post.dataset.key = key;

    const effective = computeNodeContent(key, messageIndex, replyChildren, blockedMemberIds);
    const effectiveMsg = effective
      ? { ...message, strings: effective.strings, names: effective.names, ids: effective.ids }
      : message;

    // Post header: author + timestamp
    const $postHead = document.createElement('div');
    $postHead.className = 'microblog-post-head';

    $postHead.appendChild(createAuthorEl(message.memberId));

    const $sep = document.createElement('span');
    $sep.className = 'microblog-post-sep';
    $sep.textContent = '\u00B7';
    $postHead.appendChild($sep);

    const date = new Date(message.date);
    const $time = document.createElement('time');
    $time.className = 'microblog-post-time';
    const rel = relativeTime(date);
    $time.textContent = rel || dateFormatter.format(date);
    $time.title = dateFormatter.format(date);
    $time.dateTime = message.date;
    $postHead.appendChild($time);

    $post.appendChild($postHead);

    // Post body
    const $body = renderBody(/** @type {ChannelMessage} */ (effectiveMsg));
    $post.appendChild($body);

    // Interaction bar
    $post.appendChild(createActionBar(key, message, key));

    // React pills
    {
      const $pills = reactSystem.buildReactsContainer(key);
      if ($pills) $post.appendChild($pills);
    }

    // Comments section (if expanded)
    if (expandedPosts.has(key) && countDescendants(key) > 0) {
      const $comments = renderCommentList(key);
      $post.appendChild($comments);
    }

    return $post;
  };

  /**
   * Re-render a single post in place (e.g., after expanding comments).
   * @param {string} key
   * @param {ChannelMessage} message
   */
  const rerenderPost = (key, message) => {
    renderPost(key, message)
      .then($newPost => {
        const $existing = postElements.get(key);
        if ($existing && $existing.parentNode) {
          $existing.parentNode.replaceChild($newPost, $existing);
        }
        postElements.set(key, $newPost);
      })
      .catch(window.reportError);
  };

  // ---- Root key management ----

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
      const effective = computeNodeContent(key, messageIndex, replyChildren, blockedMemberIds);
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

  // ---- Feed rendering ----

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
        await renderHeader(firstKey, firstData.message);
      }
    } else {
      $header.innerHTML = '';
      headerKey = null;
    }

    // Remaining roots are posts, displayed newest-first
    const postRoots = roots.slice(1).reverse();

    // Check for new posts to prepend or if we need a full rebuild
    const currentPostKeysSet = new Set(postRoots);
    let needsFullRebuild = false;

    // Check if any existing posts were removed or reordered
    for (const key of renderedPostKeys) {
      if (!currentPostKeysSet.has(key)) {
        needsFullRebuild = true;
        break;
      }
    }

    if (needsFullRebuild || renderedPostKeys.size === 0) {
      // Full rebuild
      $posts.innerHTML = '';
      postElements.clear();
      renderedPostKeys.clear();

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
        renderedPostKeys.add(key);
        $posts.appendChild($post);
      }
    } else {
      // Incremental: prepend new posts
      // Remove "no posts" placeholder if present
      const $empty = $posts.querySelector('.microblog-empty');
      if ($empty) $empty.remove();

      for (const key of postRoots) {
        if (renderedPostKeys.has(key)) continue;
        const data = messageIndex.get(key);
        if (!data) continue;
        // eslint-disable-next-line no-await-in-loop
        const $post = await renderPost(key, data.message);
        postElements.set(key, $post);
        renderedPostKeys.add(key);
        // Prepend (newest first)
        $posts.insertBefore($post, $posts.firstChild);
      }

      // Update comment counts on existing posts that got new replies
      for (const key of renderedPostKeys) {
        const $existing = postElements.get(key);
        if (!$existing) continue;
        const data = messageIndex.get(key);
        if (!data) continue;
        const currentCount = countDescendants(key);
        const $countEl = $existing.querySelector('.microblog-action-count');
        const displayedCount = $countEl ? $countEl.textContent : '0';
        if (String(currentCount) !== displayedCount && currentCount > 0) {
          rerenderPost(key, data.message);
        }
      }
    }
  };

  // Scroll to top (Twitter-style: newest content at top)
  $parent.scrollTo(0, 0);

  let initialLoadComplete = false;

  // Batch incoming messages and re-render
  /** @type {number} */
  let renderTimer = 0;
  const scheduleRender = () => {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = 0;
      renderFeed()
        .then(() => {
          if (!initialLoadComplete) {
            initialLoadComplete = true;
            $parent.scrollTo(0, 0);
          }
        })
        .catch(window.reportError);
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
};
harden(microblogComponent);
