// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/far';
import { makeRefIterator } from './ref-iterator.js';
import { createChannelState } from './channel-utils.js';
import { createReactSystem } from './react-utils.js';
import {
  isVisibleReplyType,
  computeNodeContent,
  isEffectivelyDeleted,
} from './edit-queue.js';

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
 * Modifier messages (edit, deletion, move) are not rendered as tree nodes.
 * Edit effects are applied to target nodes with "edited by" attribution.
 * Move effects update the tree structure (reparenting).
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
 * @param {(heritageChain: import('./channel-utils.js').ChannelMessage[], previewText: string) => Promise<void>} [options.onFork] - Fork heritage chain to new channel
 * @param {(heritageChain: import('./channel-utils.js').ChannelMessage[], previewText: string) => void} [options.onShare] - Open share modal for a message
 */
export const forumComponent = async (
  $parent,
  $end,
  channel,
  { showValue, personaId, ownMemberId, onReply, onThreadOpen, onThreadClose, onFork, onShare },
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

  const { messageIndex, replyChildren } = state;

  // Shared react system
  const reactSystem = createReactSystem({
    channel,
    ownMemberId,
    nameMap: state.nameMap,
    getMemberInfo: state.getMemberInfo,
  });

  /** @type {Set<string>} */
  const collapsedNodes = new Set();

  /** @type {Set<string>} */
  const blockedMemberIds = new Set();

  /**
   * Parent overrides from move messages.
   * Maps message key → new parent key (undefined = root).
   * @type {Map<string, string | undefined>}
   */
  const parentOverrides = new Map();

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
   * Get the visible (non-modifier) children of a parent, respecting
   * reparenting from move messages.
   * @param {string | undefined} parentKey - undefined for root-level children
   * @returns {string[]}
   */
  const getVisibleChildren = parentKey => {
    const naturalKeys =
      parentKey !== undefined ? replyChildren.get(parentKey) || [] : rootKeys;

    const result = naturalKeys.filter(k => {
      const entry = messageIndex.get(k);
      if (!entry) return false;
      if (!isVisibleReplyType(entry.message.replyType)) return false;
      // If reparented, only show if still belongs to this parent
      if (parentOverrides.has(k)) {
        return parentOverrides.get(k) === parentKey;
      }
      return true;
    });

    // Add keys reparented INTO this parent from elsewhere
    for (const [k, p] of parentOverrides.entries()) {
      if (p === parentKey && !result.includes(k)) {
        const entry = messageIndex.get(k);
        if (entry && isVisibleReplyType(entry.message.replyType)) {
          result.push(k);
        }
      }
    }

    return result;
  };

  /**
   * Count visible (non-modifier, non-deleted) descendants recursively.
   * @param {string} key
   * @returns {number}
   */
  const countVisibleDescendants = key => {
    const children = getVisibleChildren(key);
    let count = children.length;
    for (const childKey of children) {
      count += countVisibleDescendants(childKey);
    }
    return count;
  };

  /**
   * Compute the subtree recency for a message key, considering only
   * visible children.
   * @param {string} key
   * @returns {string}
   */
  const computeSubtreeRecency = key => {
    const cached = subtreeRecency.get(key);
    if (cached) return cached;

    const entry = messageIndex.get(key);
    if (!entry) return '';
    const children = getVisibleChildren(key);
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
   * Invalidate subtree recency from a key up to its root,
   * following effective parents (respecting reparenting).
   * @param {string} key
   */
  const invalidateRecency = key => {
    let current = key;
    while (current) {
      subtreeRecency.delete(current);
      if (parentOverrides.has(current)) {
        current = /** @type {string} */ (parentOverrides.get(current));
      } else {
        const data = messageIndex.get(current);
        if (!data || !data.message.replyTo) break;
        current = data.message.replyTo;
      }
    }
  };

  /**
   * Compute the active chain from a root key — the path through the most
   * recently active child at each level, using visible children only.
   * @param {string} rootKey
   * @returns {Set<string>}
   */
  const computeActiveChain = rootKey => {
    const chain = new Set([rootKey]);
    let current = rootKey;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const children = getVisibleChildren(current);
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
  const msgOpts = { ownMemberId, onReply, showValue, onFork, onShare };

  /* eslint-disable no-use-before-define */

  /**
   * Render a subtree recursively, collecting entries for batch DOM creation.
   * Only includes visible (non-modifier, non-deleted) nodes.
   * @param {string} key
   * @param {number} depth
   * @param {Set<string>} activeChain
   * @returns {Array<{ key: string, depth: number, isChain: boolean, isCollapsed: boolean, children: string[], message: ChannelMessage, childResults: Array<any> }>}
   */
  const collectSubtree = (key, depth, activeChain) => {
    const entry = messageIndex.get(key);
    if (!entry) return [];

    // Skip effectively deleted nodes
    if (
      isEffectivelyDeleted(
        key,
        messageIndex,
        replyChildren,
        blockedMemberIds,
      )
    ) {
      return [];
    }

    const isChain = activeChain.has(key);
    const children = getVisibleChildren(key);
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
   * Uses effective content (applying edits) and shows "edited by" attribution.
   * @param {Array<{ key: string, depth: number, isChain: boolean, isCollapsed: boolean, children: string[], message: ChannelMessage }>} entries
   * @param {DocumentFragment} frag
   */
  const buildSubtreeDOM = async (entries, frag) => {
    // Compute effective content for each entry
    const effectiveContents = entries.map(e =>
      computeNodeContent(
        e.key,
        messageIndex,
        replyChildren,
        blockedMemberIds,
      ),
    );

    // Build all message elements in parallel.
    // Skip the reply indicator when a message appears directly below its
    // parent in the tree — the nesting already provides that context.
    const msgElements = await Promise.all(
      entries.map((e, i) => {
        const ec = effectiveContents[i];
        // Use effective content if the node has been edited
        const effectiveMessage = ec.editedByMemberId
          ? { ...e.message, strings: ec.strings, names: ec.names, ids: ec.ids }
          : e.message;

        const parentIsDirectlyAbove =
          i > 0 &&
          e.message.replyTo !== undefined &&
          e.message.replyTo === entries[i - 1].key;
        return state.createMessageElement(
          /** @type {ChannelMessage} */ (effectiveMessage),
          {
            ...msgOpts,
            skipReplyIndicator: parentIsDirectlyAbove,
          },
        );
      }),
    );

    for (let i = 0; i < entries.length; i += 1) {
      const { key, depth, isChain, isCollapsed, children } = entries[i];
      const ec = effectiveContents[i];
      const $node = document.createElement('div');
      $node.className = 'forum-node';
      $node.classList.add(`depth-${Math.min(depth, 5)}`);
      if (isChain) $node.classList.add('chain-member');
      if (isCollapsed) $node.classList.add('collapsed');
      $node.dataset.msgKey = key;

      $node.appendChild(msgElements[i]);

      // React button: inject into the message's action bar
      {
        const $msgEl = msgElements[i].querySelector('.message');
        let $actions = $msgEl && $msgEl.querySelector('.message-actions');
        if ($msgEl && !$actions) {
          $actions = document.createElement('div');
          $actions.className = 'message-actions';
          $msgEl.appendChild($actions);
        }
        if ($actions) {
          $actions.appendChild(reactSystem.createReactButton(key));
        }
      }

      // React pills
      {
        const $pills = reactSystem.buildReactsContainer(key);
        if ($pills) $node.appendChild($pills);
      }

      // Show "edited by" attribution when the node has been edited
      if (ec.editedByMemberId) {
        const $edited = document.createElement('div');
        $edited.className = 'forum-edited-by';
        const editorName =
          state.nameMap.get(ec.editedByMemberId) || ec.editedByMemberId;
        const editorCount = ec.editorMemberIds.length;
        if (editorCount <= 1) {
          $edited.textContent = `edited by ${editorName}`;
        } else {
          $edited.textContent = `edited by ${editorCount} people`;
        }
        const editCount = ec.editQueue.filter(eq => !eq.deleted).length;
        $edited.title = `${editCount} edit${editCount === 1 ? '' : 's'}`;
        $node.appendChild($edited);
      }

      if (children.length > 0) {
        const $handle = document.createElement('div');
        $handle.className = 'forum-collapse-handle';
        const count = countVisibleDescendants(key);
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
      // Get effective root keys (visible, non-deleted, respecting reparenting)
      const effectiveRoots = getVisibleChildren(undefined).filter(
        k =>
          !isEffectivelyDeleted(
            k,
            messageIndex,
            replyChildren,
            blockedMemberIds,
          ),
      );

      // Recompute recency for all roots
      for (const key of effectiveRoots) {
        computeSubtreeRecency(key);
      }

      // Sort roots by subtree recency (most recent last)
      const sortedRoots = [...effectiveRoots].sort((a, b) => {
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
    renderForum().then(() => {
      $parent.scrollTo(0, $parent.scrollHeight);
      batchTimer = 0;
    });
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

    // Track reacts
    reactSystem.processReactMessage(typedMessage, msgKey);

    // Process move messages for reparenting
    if (typedMessage.replyType === 'move' && typedMessage.replyTo) {
      const newParent = typedMessage.strings[1];
      if (newParent !== undefined) {
        const targetKey = typedMessage.replyTo;
        // Invalidate old parent's recency chain
        const targetEntry = messageIndex.get(targetKey);
        if (targetEntry && targetEntry.message.replyTo) {
          invalidateRecency(targetEntry.message.replyTo);
        }
        parentOverrides.set(
          targetKey,
          newParent === '' ? undefined : newParent,
        );
        // Invalidate new parent's recency chain
        if (newParent !== '') {
          invalidateRecency(newParent);
        }
      }
    }

    // Track reply relationships (all messages including modifiers,
    // since computeNodeContent needs edits/deletions as children)
    if (typedMessage.replyTo) {
      const parentKey = typedMessage.replyTo;
      if (!replyChildren.has(parentKey)) {
        replyChildren.set(parentKey, []);
      }
      /** @type {string[]} */ (replyChildren.get(parentKey)).push(msgKey);
      // If the parent was collapsed and this is a visible reply, expand it
      if (isVisibleReplyType(typedMessage.replyType)) {
        collapsedNodes.delete(parentKey);
      }
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
        renderForum().then(() => {
          $parent.scrollTo(0, $parent.scrollHeight);
          batchTimer = 0;
        });
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
