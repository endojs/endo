// @ts-check
/* global document, requestAnimationFrame, setTimeout, clearTimeout */

import harden from '@endo/harden';
import { E } from '@endo/far';
import { makeRefIterator } from './ref-iterator.js';
import { createChannelState } from './channel-utils.js';

/** @import { ChannelMessage } from './channel-utils.js' */

/**
 * Render the forum (threaded tree) message view.
 *
 * Messages form a tree via the replyTo field. Roots (messages with no replyTo)
 * are sorted so the root whose subtree was most recently active appears last
 * (at the bottom). Within each subtree, the "active chain" — the path from
 * root to the most recently active leaf — is rendered at full width, while
 * sibling branches appear indented and collapsible.
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
 */
export const forumComponent = async (
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

  // Initialize shared channel state
  const state = await createChannelState(channel, {
    personaId,
    ownMemberId,
    $parent,
  });

  const { messageIndex, replyChildren, countDescendants } = state;

  /** @type {Set<string>} */
  const collapsedNodes = new Set();

  /**
   * Subtree recency map — maps message key to ISO date of most recent descendant.
   * @type {Map<string, string>}
   */
  const subtreeRecency = new Map();

  /**
   * Root message keys (messages with no replyTo), in order received.
   * @type {string[]}
   */
  const rootKeys = [];

  /**
   * Compute the subtree recency for a message key.
   * @param {string} key
   * @returns {string}
   */
  const computeSubtreeRecency = key => {
    const cached = subtreeRecency.get(key);
    if (cached) return cached;

    const entry = messageIndex.get(key);
    if (!entry) return '';
    const children = replyChildren.get(key) || [];
    if (children.length === 0) {
      subtreeRecency.set(key, entry.message.date);
      return entry.message.date;
    }
    const childRecencies = children.map(computeSubtreeRecency);
    const dates = [entry.message.date, ...childRecencies];
    dates.sort();
    const most = /** @type {string} */ (dates[dates.length - 1]);
    subtreeRecency.set(key, most);
    return most;
  };

  /**
   * Invalidate subtree recency from a key up to its root.
   * @param {string} key
   */
  const invalidateRecency = key => {
    let current = key;
    while (current) {
      subtreeRecency.delete(current);
      const data = messageIndex.get(current);
      if (!data || !data.message.replyTo) break;
      current = data.message.replyTo;
    }
  };

  /**
   * Compute the active chain from a root key — the path through the most
   * recently active child at each level.
   * @param {string} rootKey
   * @returns {Set<string>}
   */
  const computeActiveChain = rootKey => {
    const chain = new Set([rootKey]);
    let current = rootKey;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const children = replyChildren.get(current) || [];
      if (children.length === 0) break;
      // Pick child with most recent subtree
      let best = children[0];
      let bestRecency = computeSubtreeRecency(best);
      for (let i = 1; i < children.length; i += 1) {
        const r = computeSubtreeRecency(children[i]);
        if (r > bestRecency) {
          best = children[i];
          bestRecency = r;
        }
      }
      chain.add(best);
      current = best;
    }
    return chain;
  };

  /**
   * The forum view container element, created once.
   * @type {HTMLElement}
   */
  const $forumView = document.createElement('div');
  $forumView.className = 'forum-view';
  if ($end) {
    $parent.insertBefore($forumView, $end);
  } else {
    $parent.appendChild($forumView);
  }

  /** @type {import('./channel-utils.js').CreateMessageOptions} */
  const msgOpts = { ownMemberId, onReply, showValue };

  /* eslint-disable no-use-before-define */

  /**
   * Render a subtree recursively, collecting promises for message element
   * creation and resolving them all at once.
   * @param {string} key
   * @param {number} depth
   * @param {Set<string>} activeChain
   * @returns {Array<{ key: string, depth: number, isChain: boolean, isCollapsed: boolean, children: string[], message: ChannelMessage, childResults: Array<any> }>}
   */
  const collectSubtree = (key, depth, activeChain) => {
    const entry = messageIndex.get(key);
    if (!entry) return [];

    const isChain = activeChain.has(key);
    const children = replyChildren.get(key) || [];
    const isCollapsed = collapsedNodes.has(key) && children.length > 0;

    /** @type {Array<any>} */
    const results = [
      {
        key,
        depth,
        isChain,
        isCollapsed,
        children,
        message: entry.message,
        childResults: [],
      },
    ];

    if (!isCollapsed && children.length > 0) {
      const sorted = [...children].sort((a, b) => {
        const ra = computeSubtreeRecency(a);
        const rb = computeSubtreeRecency(b);
        if (ra < rb) return -1;
        if (ra > rb) return 1;
        return 0;
      });

      for (const childKey of sorted) {
        const childResults = collectSubtree(childKey, depth + 1, activeChain);
        for (const r of childResults) {
          results.push(r);
        }
      }
    }

    return results;
  };

  /**
   * Build DOM nodes for a flat list of subtree entries.
   * @param {Array<{ key: string, depth: number, isChain: boolean, isCollapsed: boolean, children: string[], message: ChannelMessage }>} entries
   * @param {DocumentFragment} frag
   */
  const buildSubtreeDOM = async (entries, frag) => {
    // Build all message elements in parallel.
    // Skip the reply indicator when a message appears directly below its
    // parent in the tree — the nesting already provides that context.
    const msgElements = await Promise.all(
      entries.map((e, i) => {
        const parentIsDirectlyAbove =
          i > 0 &&
          e.message.replyTo !== undefined &&
          e.message.replyTo === entries[i - 1].key;
        return state.createMessageElement(e.message, {
          ...msgOpts,
          skipReplyIndicator: parentIsDirectlyAbove,
        });
      }),
    );

    for (let i = 0; i < entries.length; i += 1) {
      const { key, depth, isChain, isCollapsed, children } = entries[i];
      const $node = document.createElement('div');
      $node.className = 'forum-node';
      $node.classList.add(`depth-${Math.min(depth, 5)}`);
      if (isChain) $node.classList.add('chain-member');
      if (isCollapsed) $node.classList.add('collapsed');
      $node.dataset.msgKey = key;

      $node.appendChild(msgElements[i]);

      if (children.length > 0) {
        const $handle = document.createElement('div');
        $handle.className = 'forum-collapse-handle';
        const count = countDescendants(key);
        if (isCollapsed) {
          $handle.textContent = `${count} ${count === 1 ? 'reply' : 'replies'} \u25B6`;
        } else {
          $handle.textContent = `${count} ${count === 1 ? 'reply' : 'replies'} \u25BC`;
        }
        $handle.addEventListener('click', e => {
          e.stopPropagation();
          if (collapsedNodes.has(key)) {
            collapsedNodes.delete(key);
          } else {
            collapsedNodes.add(key);
          }
          renderForum();
        });
        $node.appendChild($handle);
      }

      frag.appendChild($node);
    }
  };

  /** Guard against concurrent renders. */
  let rendering = false;
  /** @type {boolean} */
  let pendingRender = false;

  /**
   * Re-render the entire forum view.
   */
  const renderForum = async () => {
    if (rendering) {
      pendingRender = true;
      return;
    }
    rendering = true;
    try {
      // Recompute recency for all roots
      for (const key of rootKeys) {
        computeSubtreeRecency(key);
      }

      // Sort roots by subtree recency (most recent last)
      const sortedRoots = [...rootKeys].sort((a, b) => {
        const ra = computeSubtreeRecency(a);
        const rb = computeSubtreeRecency(b);
        if (ra < rb) return -1;
        if (ra > rb) return 1;
        return 0;
      });

      // Collect all entries synchronously, then build DOM in one batch
      /** @type {Array<{ key: string, depth: number, isChain: boolean, isCollapsed: boolean, children: string[], message: ChannelMessage }>} */
      const allEntries = [];
      for (const rootKey of sortedRoots) {
        const activeChain = computeActiveChain(rootKey);
        const subtreeEntries = collectSubtree(rootKey, 0, activeChain);
        for (const entry of subtreeEntries) {
          allEntries.push(entry);
        }
      }

      const frag = document.createDocumentFragment();
      await buildSubtreeDOM(allEntries, frag);

      $forumView.innerHTML = '';
      $forumView.appendChild(frag);
    } finally {
      rendering = false;
      if (pendingRender) {
        pendingRender = false;
        renderForum();
      }
    }
  };

  /* eslint-enable no-use-before-define */

  // Expose a control API matching channelComponent's interface.
  let disposed = false;
  /** @type {AsyncIterableIterator<unknown> | null} */
  let activeIterator = null;
  /** @type {{ closeThread: () => boolean, dispose: () => void }} */
  const channelAPI = harden({
    closeThread: () => false,
    dispose: () => {
      disposed = true;
      if (activeIterator) {
        activeIterator.return();
      }
    },
  });
  /** @type {any} */ ($parent).channelAPI = channelAPI;

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
  activeIterator = messageIterator;

  /** Batch incoming messages during initial load. */
  let batchTimer = 0;

  // Schedule an initial render after the first batch arrives.
  batchTimer = setTimeout(() => {
    renderForum();
    batchTimer = 0;
  }, 200);

  for await (const message of messageIterator) {
    if (disposed) break;
    const typedMessage = /** @type {ChannelMessage} */ (message);
    const msgKey = String(typedMessage.number);

    // Create a placeholder element for the message index (will be replaced
    // during render). The forum re-renders the full tree on each update,
    // so we just need the data in messageIndex.
    const $placeholder = document.createElement('div');
    messageIndex.set(msgKey, {
      message: typedMessage,
      $element: $placeholder,
    });

    // Track reply relationships
    if (typedMessage.replyTo) {
      const parentKey = typedMessage.replyTo;
      if (!replyChildren.has(parentKey)) {
        replyChildren.set(parentKey, []);
      }
      /** @type {string[]} */ (replyChildren.get(parentKey)).push(msgKey);
      // If the parent was collapsed, expand it so the new reply is visible.
      collapsedNodes.delete(parentKey);
      // Invalidate recency cache up the ancestor chain
      invalidateRecency(parentKey);
    } else {
      // Root message
      rootKeys.push(msgKey);
    }

    // During initial batch, debounce renders
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = setTimeout(() => {
        renderForum();
        scrollToBottom();
        batchTimer = 0;
      }, 50);
    } else {
      // After initial load, render incrementally
      // eslint-disable-next-line no-await-in-loop
      await renderForum();
      scrollToBottom();
    }
  }
};
harden(forumComponent);
