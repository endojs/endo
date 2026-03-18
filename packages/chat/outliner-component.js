// @ts-check
/* global document, requestAnimationFrame, setTimeout, clearTimeout */

import harden from '@endo/harden';
import { E } from '@endo/far';
import { makeRefIterator } from './ref-iterator.js';
import { createChannelState } from './channel-utils.js';
import {
  isVisibleReplyType,
  computeAllNodeContents,
} from './edit-queue.js';

/** @import { ChannelMessage } from './channel-utils.js' */
/** @import { NodeEffectiveContent } from './edit-queue.js' */

/**
 * Badge labels and CSS classes for reply types.
 * @type {Record<string, { label: string, className: string }>}
 */
const REPLY_TYPE_BADGES = harden({
  pro: { label: 'Pro', className: 'outliner-badge-pro' },
  con: { label: 'Con', className: 'outliner-badge-con' },
  evidence: { label: 'Evidence', className: 'outliner-badge-evidence' },
});

/**
 * Render the outliner (structured document) message view.
 *
 * Messages form a tree via the replyTo field. Edit, deletion, and move
 * reply types are hidden from the tree — they modify target nodes instead.
 * All other reply types render as child nodes with optional type badges.
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
 */
export const outlinerComponent = async (
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

  const { messageIndex, replyChildren, nameMap } = state;

  /** @type {Set<string>} Collapsed node keys */
  const collapsedNodes = new Set();

  /** @type {string[]} Root message keys (no replyTo, visible type) */
  const rootKeys = [];

  /** @type {Set<string>} Blocked member IDs (empty for now — Phase 4) */
  const blockedMemberIds = new Set();

  /**
   * The outliner view container element, created once.
   * @type {HTMLElement}
   */
  const $outlinerView = document.createElement('div');
  $outlinerView.className = 'outliner-view';
  if ($end) {
    $parent.insertBefore($outlinerView, $end);
  } else {
    $parent.appendChild($outlinerView);
  }

  /* eslint-disable no-use-before-define */

  /**
   * Recursively collect visible nodes for rendering.
   * @param {string} key
   * @param {number} depth
   * @param {Map<string, NodeEffectiveContent>} effectiveContents
   * @returns {Array<{ key: string, depth: number, message: ChannelMessage, effective: NodeEffectiveContent, children: string[], isCollapsed: boolean }>}
   */
  const collectSubtree = (key, depth, effectiveContents) => {
    const entry = messageIndex.get(key);
    if (!entry) return [];
    if (!isVisibleReplyType(entry.message.replyType)) return [];

    const effective = effectiveContents.get(key);
    if (!effective) return [];

    // Gather visible children only
    const allChildren = replyChildren.get(key) || [];
    const visibleChildren = allChildren.filter(childKey => {
      const childEntry = messageIndex.get(childKey);
      return childEntry && isVisibleReplyType(childEntry.message.replyType);
    });

    const isCollapsed =
      collapsedNodes.has(key) && visibleChildren.length > 0;

    /** @type {Array<{ key: string, depth: number, message: ChannelMessage, effective: NodeEffectiveContent, children: string[], isCollapsed: boolean }>} */
    const results = [
      {
        key,
        depth,
        message: entry.message,
        effective,
        children: visibleChildren,
        isCollapsed,
      },
    ];

    if (!isCollapsed && visibleChildren.length > 0) {
      // Sort children by message number
      const sorted = [...visibleChildren].sort((a, b) => {
        const ea = messageIndex.get(a);
        const eb = messageIndex.get(b);
        if (!ea || !eb) return 0;
        if (ea.message.number < eb.message.number) return -1;
        if (ea.message.number > eb.message.number) return 1;
        return 0;
      });
      for (const childKey of sorted) {
        const childResults = collectSubtree(childKey, depth + 1, effectiveContents);
        for (const r of childResults) {
          results.push(r);
        }
      }
    }

    return results;
  };

  /**
   * Count visible descendants of a node.
   * @param {string} key
   * @returns {number}
   */
  const countVisibleDescendants = key => {
    const allChildren = replyChildren.get(key) || [];
    let count = 0;
    for (const childKey of allChildren) {
      const childEntry = messageIndex.get(childKey);
      if (childEntry && isVisibleReplyType(childEntry.message.replyType)) {
        count += 1;
        count += countVisibleDescendants(childKey);
      }
    }
    return count;
  };

  /**
   * Build DOM nodes from collected entries.
   * @param {Array<{ key: string, depth: number, message: ChannelMessage, effective: NodeEffectiveContent, children: string[], isCollapsed: boolean }>} entries
   * @param {DocumentFragment} frag
   */
  const buildOutlinerDOM = async (entries, frag) => {
    for (const entry of entries) {
      const { key, depth, message, effective, children, isCollapsed } = entry;
      const $node = document.createElement('div');
      $node.className = 'outliner-node';
      $node.classList.add(`depth-${Math.min(depth, 5)}`);
      if (isCollapsed) $node.classList.add('collapsed');
      $node.dataset.msgKey = key;

      // Type badge for pro/con/evidence
      const replyType = message.replyType;
      if (replyType && REPLY_TYPE_BADGES[replyType]) {
        const badge = REPLY_TYPE_BADGES[replyType];
        const $badge = document.createElement('span');
        $badge.className = `outliner-badge ${badge.className}`;
        $badge.textContent = badge.label;
        $node.appendChild($badge);
      } else if (replyType && replyType !== 'reply' && isVisibleReplyType(replyType)) {
        // Custom reply type badge
        const $badge = document.createElement('span');
        $badge.className = 'outliner-badge outliner-badge-custom';
        $badge.textContent = replyType;
        $node.appendChild($badge);
      }

      // Content
      const $content = document.createElement('div');
      $content.className = 'outliner-content';

      const $text = document.createElement('span');
      $text.className = 'outliner-text';
      $text.textContent = effective.strings.join('');
      $content.appendChild($text);

      $node.appendChild($content);

      // Author and edit info
      const $meta = document.createElement('div');
      $meta.className = 'outliner-meta';

      // Author
      const authorName =
        nameMap.get(effective.authorMemberId) || `Member ${effective.authorMemberId}`;
      const $author = document.createElement('span');
      $author.className = 'outliner-author';
      $author.textContent = authorName;
      $meta.appendChild($author);

      // "Edited by" label
      if (effective.editedByMemberId) {
        const editorName =
          nameMap.get(effective.editedByMemberId) ||
          `Member ${effective.editedByMemberId}`;
        const $editLabel = document.createElement('span');
        $editLabel.className = 'outliner-edited-by';
        $editLabel.textContent = `Edited by ${editorName}`;
        $editLabel.title = `Edit queue: ${effective.editQueue.length} edit(s)`;
        $meta.appendChild($editLabel);
      }

      $node.appendChild($meta);

      // Action buttons
      const $actions = document.createElement('div');
      $actions.className = 'outliner-actions';

      // Reply button
      if (onReply) {
        const $replyBtn = document.createElement('button');
        $replyBtn.className = 'outliner-action-btn';
        $replyBtn.title = 'Reply';
        $replyBtn.textContent = '\u21A9';
        $replyBtn.addEventListener('click', e => {
          e.stopPropagation();
          const preview = effective.strings.join('').substring(0, 60);
          onReply({
            number: message.number,
            memberId: message.memberId,
            authorName,
            preview,
          });
        });
        $actions.appendChild($replyBtn);
      }

      // Edit button
      const $editBtn = document.createElement('button');
      $editBtn.className = 'outliner-action-btn';
      $editBtn.title = 'Edit';
      $editBtn.textContent = '\u270E';
      $editBtn.addEventListener('click', e => {
        e.stopPropagation();
        const api = chatBarAPI ? chatBarAPI() : null;
        if (api) {
          api.setReplyTo(
            String(message.number),
            authorName,
            effective.strings.join('').substring(0, 60),
          );
          api.setReplyType('edit');
          api.focus();
        }
      });
      $actions.appendChild($editBtn);

      // Delete button
      const $deleteBtn = document.createElement('button');
      $deleteBtn.className = 'outliner-action-btn outliner-action-delete';
      $deleteBtn.title = 'Delete';
      $deleteBtn.textContent = '\u2715';
      $deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        // Post a deletion reply targeting this node
        E(channel).post([''], [], [], String(message.number), [], 'deletion')
          .catch(/** @param {Error} err */ err => {
            console.error('Failed to post deletion:', err);
          });
      });
      $actions.appendChild($deleteBtn);

      $node.appendChild($actions);

      // Collapse handle
      if (children.length > 0) {
        const $handle = document.createElement('div');
        $handle.className = 'outliner-collapse-handle';
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
          renderOutliner();
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
   * Re-render the entire outliner view.
   */
  const renderOutliner = async () => {
    if (rendering) {
      pendingRender = true;
      return;
    }
    rendering = true;
    try {
      // Compute effective content for all visible nodes
      const effectiveContents = computeAllNodeContents(
        messageIndex,
        replyChildren,
        blockedMemberIds,
      );

      // Collect all visible entries
      /** @type {Array<{ key: string, depth: number, message: ChannelMessage, effective: NodeEffectiveContent, children: string[], isCollapsed: boolean }>} */
      const allEntries = [];

      // Sort root keys by message number
      const sortedRoots = [...rootKeys].sort((a, b) => {
        const ea = messageIndex.get(a);
        const eb = messageIndex.get(b);
        if (!ea || !eb) return 0;
        if (ea.message.number < eb.message.number) return -1;
        if (ea.message.number > eb.message.number) return 1;
        return 0;
      });

      for (const rootKey of sortedRoots) {
        const subtreeEntries = collectSubtree(rootKey, 0, effectiveContents);
        for (const e of subtreeEntries) {
          allEntries.push(e);
        }
      }

      const frag = document.createDocumentFragment();
      await buildOutlinerDOM(allEntries, frag);

      $outlinerView.innerHTML = '';
      $outlinerView.appendChild(frag);
    } finally {
      rendering = false;
      if (pendingRender) {
        pendingRender = false;
        renderOutliner();
      }
    }
  };

  /* eslint-enable no-use-before-define */

  // Expose a control API matching channelComponent's interface.
  /** @type {{ closeThread: () => boolean }} */
  const channelAPI = harden({
    closeThread: () => false,
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

  /** Batch incoming messages during initial load. */
  let batchTimer = 0;

  // Schedule an initial render after the first batch arrives.
  batchTimer = setTimeout(() => {
    renderOutliner();
    batchTimer = 0;
  }, 200);

  for await (const message of messageIterator) {
    const typedMessage = /** @type {ChannelMessage} */ (message);
    const msgKey = String(typedMessage.number);

    // Create a placeholder element for the message index
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
      // If a new visible child arrives, expand the parent
      if (isVisibleReplyType(typedMessage.replyType)) {
        collapsedNodes.delete(parentKey);
      }
    } else if (isVisibleReplyType(typedMessage.replyType)) {
      // Root visible message
      rootKeys.push(msgKey);
    }

    // During initial batch, debounce renders
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = setTimeout(() => {
        renderOutliner();
        scrollToBottom();
        batchTimer = 0;
      }, 50);
    } else {
      // After initial load, render incrementally
      // eslint-disable-next-line no-await-in-loop
      await renderOutliner();
      scrollToBottom();
    }
  }
};
harden(outlinerComponent);
