// @ts-check
/* global document, Node, requestAnimationFrame, setTimeout, clearTimeout, window */

import harden from '@endo/harden';
import { E } from '@endo/far';
import { makeRefIterator } from './ref-iterator.js';
import { createChannelState } from './channel-utils.js';
import {
  isVisibleReplyType,
  computeNodeContent,
  computeAllNodeContents,
} from './edit-queue.js';
import { relativeTime } from './time-formatters.js';
import { tokenAutocompleteComponent } from './token-autocomplete.js';

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */
/** @import { ChannelMessage } from './channel-utils.js' */
/** @import { NodeEffectiveContent } from './edit-queue.js' */
/** @import { EditQueueEntry } from './edit-queue.js' */
/** @import { TokenAutocompleteAPI } from './token-autocomplete.js' */

/**
 * Badge labels and CSS classes for reply types.
 * @type {Record<string, { label: string, className: string }>}
 */
const REPLY_TYPE_BADGES = harden({
  pro: { label: 'Pro', className: 'outliner-badge-pro' },
  con: { label: 'Con', className: 'outliner-badge-con' },
  evidence: { label: 'Evidence', className: 'outliner-badge-evidence' },
  fork: { label: 'Fork', className: 'outliner-badge-fork' },
});

/**
 * @typedef {object} DraftNode
 * @property {string} draftId
 * @property {string} text
 * @property {string | undefined} parentKey
 * @property {string | undefined} afterKey
 * @property {string | undefined} replyType
 */

/**
 * Slash command definitions for the outliner.
 * @type {ReadonlyArray<{ command: string, label: string, replyType: string, description: string }>}
 */
const SLASH_COMMANDS = harden([
  { command: 'pro', label: 'Pro', replyType: 'pro', description: 'Supporting argument' },
  { command: 'con', label: 'Con', replyType: 'con', description: 'Opposing argument' },
  { command: 'evidence', label: 'Evidence', replyType: 'evidence', description: 'Supporting evidence' },
]);

/**
 * Render the outliner (structured document) view with interactive
 * contenteditable nodes, draft system, and keyboard tree manipulation.
 *
 * Nodes form a nested tree via replyTo. Edit, deletion, and move reply
 * types modify target nodes; all other types render as children with
 * optional type badges. The DOM mirrors the tree structure for easy
 * incremental updates.
 *
 * @param {HTMLElement} $parent - Container for messages
 * @param {HTMLElement | null} $end - Scroll anchor element
 * @param {unknown} channel - Channel or ChannelMember reference
 * @param {object} options
 * @param {(value: unknown, id?: string, petNamePath?: string[]) => void | Promise<void>} options.showValue
 * @param {string} [options.personaId]
 * @param {string} [options.ownMemberId]
 * @param {unknown} [options.powers] - Powers object for token autocomplete
 * @param {(info: { number: bigint, memberId: string, authorName: string, preview: string }) => void} [options.onReply]
 * @param {(info: { number: string, authorName: string, preview: string }) => void} [options.onThreadOpen]
 * @param {() => void} [options.onThreadClose]
 * @param {() => import('./send-form.js').SendFormAPI | null} [options.chatBarAPI]
 * @param {(heritageChain: ChannelMessage[], previewText: string) => Promise<void>} [options.onFork] - Fork a message's heritage into a new channel
 */
export const outlinerComponent = async (
  $parent,
  $end,
  channel,
  {
    showValue,
    personaId,
    ownMemberId,
    powers,
    onReply,
    onThreadOpen,
    onThreadClose,
    chatBarAPI,
    onFork,
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

  /** @type {Set<string>} Blocked member IDs (empty for now) */
  const blockedMemberIds = new Set();

  const $outlinerView = document.createElement('div');
  $outlinerView.className = 'outliner-view';
  if ($end) {
    $parent.insertBefore($outlinerView, $end);
  } else {
    $parent.appendChild($outlinerView);
  }

  // ---- Node tracking state ----

  /**
   * @type {Map<string, {
   *   $node: HTMLElement,
   *   $row: HTMLElement,
   *   $text: HTMLElement,
   *   $bullet: HTMLElement,
   *   $meta: HTMLElement,
   *   $children: HTMLElement
   * }>}
   */
  const nodeEls = new Map();

  /**
   * @type {Map<string, {
   *   $node: HTMLElement,
   *   $text: HTMLElement,
   *   $children: HTMLElement
   * }>}
   */
  const draftEls = new Map();

  /** @type {Map<string, DraftNode>} */
  const drafts = new Map();

  /** @type {Set<string>} Committed keys with unsaved edits */
  const dirtyNodes = new Set();

  // ---- Token autocomplete state ----

  /** @type {string[]} Shared pet names for all token autocomplete instances */
  const sharedPetNames = [];

  // Subscribe once to followNameChanges for shared pet names
  if (powers) {
    (async () => {
      for await (const change of makeRefIterator(
        E(/** @type {ERef<EndoHost>} */ (powers)).followNameChanges(),
      )) {
        if ('add' in /** @type {object} */ (change)) {
          sharedPetNames.push(/** @type {{ add: string }} */ (change).add);
          sharedPetNames.sort();
        } else if ('remove' in /** @type {object} */ (change)) {
          const idx = sharedPetNames.indexOf(
            /** @type {{ remove: string }} */ (change).remove,
          );
          if (idx !== -1) {
            sharedPetNames.splice(idx, 1);
          }
        }
      }
    })().catch(window.reportError);
  }

  /** @type {TokenAutocompleteAPI | null} */
  let activeTokenComponent = null;
  /** @type {HTMLElement | null} */
  let activeTokenMenu = null;

  let draftCounter = 0;
  let initialLoadComplete = false;

  /** @type {Set<string>} Selected committed node keys */
  const selectedNodes = new Set();

  /** @type {string | null} Last clicked key for shift-click range */
  let lastSelectedKey = null;

  /** @type {Map<string, number>} Move overrides: committed node key → effective sort order */
  const moveOverrides = new Map();

  /** @type {string[] | null} Keys currently being dragged */
  let draggedKeys = null;

  /** @type {HTMLElement | null} Drop indicator line */
  let $dropIndicator = null;

  /** @type {boolean} Flag to prevent click handler after rubber-band */
  let rubberBandJustFinished = false;

  /* eslint-disable no-use-before-define */

  // ---- Depth & container helpers ----

  /**
   * Walk up replyTo chain to determine committed node depth.
   * @param {string} key
   * @returns {number}
   */
  const getNodeDepth = key => {
    let depth = 0;
    let current = key;
    while (current) {
      const entry = messageIndex.get(current);
      if (!entry || !entry.message.replyTo) break;
      current = entry.message.replyTo;
      depth += 1;
    }
    return depth;
  };

  /**
   * Get the effective sort order for a committed node.
   * Returns the move override if present, otherwise the message number.
   * @param {string} key
   * @returns {number}
   */
  const getEffectiveSortOrder = key => {
    const override = moveOverrides.get(key);
    if (override !== undefined) return override;
    const entry = messageIndex.get(key);
    return entry ? Number(entry.message.number) : 0;
  };

  /**
   * Get the children container for a parent key.
   * Returns $outlinerView for root-level nodes.
   * @param {string | undefined} parentKey
   * @returns {HTMLElement}
   */
  const getChildrenContainer = parentKey => {
    if (!parentKey) return $outlinerView;
    const committed = nodeEls.get(parentKey);
    if (committed) return committed.$children;
    const draft = draftEls.get(parentKey);
    if (draft) return draft.$children;
    return $outlinerView;
  };

  // ---- Focus & cursor helpers ----

  /**
   * Get all visible .outliner-text elements in document order.
   * Excludes elements inside collapsed children containers.
   * @returns {HTMLElement[]}
   */
  const getAllVisibleTextNodes = () => {
    /** @type {HTMLElement[]} */
    const result = [];
    const all = $outlinerView.querySelectorAll('.outliner-text');
    for (const $el of all) {
      let visible = true;
      let ancestor = /** @type {HTMLElement | null} */ ($el.parentElement);
      while (ancestor && ancestor !== $outlinerView) {
        if (ancestor.classList.contains('outliner-children-collapsed')) {
          visible = false;
          break;
        }
        ancestor = ancestor.parentElement;
      }
      if (visible) {
        result.push(/** @type {HTMLElement} */ ($el));
      }
    }
    return result;
  };

  /**
   * Focus a text node, placing cursor at start or end.
   * @param {HTMLElement} $text
   * @param {boolean} [atEnd]
   */
  const focusTextNode = ($text, atEnd = false) => {
    $text.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents($text);
    range.collapse(!atEnd);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  /**
   * Get cursor position within a contenteditable element.
   * @param {HTMLElement} $text
   * @returns {{ position: number, atStart: boolean, atEnd: boolean }}
   */
  const getCursorPosition = $text => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !$text.contains(sel.anchorNode)) {
      return { position: 0, atStart: true, atEnd: true };
    }
    const range = document.createRange();
    range.selectNodeContents($text);
    range.setEnd(
      /** @type {Node} */ (sel.anchorNode),
      sel.anchorOffset,
    );
    const position = range.toString().length;
    const textLength = ($text.textContent || '').length;
    return {
      position,
      atStart: position === 0,
      atEnd: position >= textLength,
    };
  };

  // ---- Token content helpers ----

  /**
   * Parse a contenteditable element's DOM into structured message data.
   * Handles both plain text nodes and span.chat-token elements.
   * @param {HTMLElement} $text
   * @returns {{ strings: string[], petNames: string[], edgeNames: string[] }}
   */
  const parseNodeContent = $text => {
    /** @type {string[]} */
    const strings = [];
    /** @type {string[]} */
    const nodePetNames = [];
    /** @type {string[]} */
    const edgeNames = [];
    let currentText = '';

    /** @param {Node} node */
    const walk = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        currentText += (node.textContent || '').replace(/\u200B/g, '');
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = /** @type {HTMLElement} */ (node);
        if (el.classList.contains('chat-token')) {
          strings.push(currentText);
          currentText = '';
          nodePetNames.push(el.dataset.petName || '');
          edgeNames.push(el.dataset.edgeName || el.dataset.petName || '');
        } else {
          for (const child of node.childNodes) {
            walk(child);
          }
        }
      }
    };

    for (const child of $text.childNodes) {
      walk(child);
    }
    strings.push(currentText);

    // Trim leading/trailing spaces
    const trimmedStrings = strings.map((s, i) => {
      if (i === 0) return s.trimStart();
      if (i === strings.length - 1) return s.trimEnd();
      return s;
    });

    return { strings: trimmedStrings, petNames: nodePetNames, edgeNames };
  };

  /**
   * Render structured content (strings + names) into a contenteditable element.
   * Creates text nodes interleaved with span.chat-token elements.
   * @param {HTMLElement} $text
   * @param {NodeEffectiveContent} effective
   */
  const renderNodeContent = ($text, effective) => {
    $text.innerHTML = '';
    const { strings, names } = effective;
    if (!names || names.length === 0) {
      $text.textContent = strings.join('');
      return;
    }
    for (let i = 0; i < strings.length; i += 1) {
      if (strings[i]) {
        $text.appendChild(document.createTextNode(strings[i]));
      }
      if (i < names.length) {
        const name = names[i];
        const $token = document.createElement('span');
        $token.className = 'chat-token';
        $token.contentEditable = 'false';
        $token.dataset.petName = name;
        $token.dataset.edgeName = name;
        const $tokenName = document.createElement('span');
        $tokenName.className = 'token-name';
        $tokenName.textContent = name;
        $token.appendChild($tokenName);
        $text.appendChild($token);
      }
    }
  };

  // ---- Effective content helpers ----

  /**
   * @param {string} key
   * @returns {NodeEffectiveContent}
   */
  const getEffective = key =>
    computeNodeContent(key, messageIndex, replyChildren, blockedMemberIds);

  /**
   * Get sorted visible children keys for a parent.
   * @param {string | undefined} parentKey
   * @param {Map<string, NodeEffectiveContent>} [effectiveContents]
   * @returns {string[]}
   */
  const getSortedVisibleChildren = (parentKey, effectiveContents) => {
    const keys = parentKey ? replyChildren.get(parentKey) || [] : rootKeys;
    return [...keys]
      .filter(k => {
        const entry = messageIndex.get(k);
        if (!entry || !isVisibleReplyType(entry.message.replyType)) {
          return false;
        }
        const eff = effectiveContents
          ? effectiveContents.get(k)
          : getEffective(k);
        return eff && !eff.deleted;
      })
      .sort((a, b) => getEffectiveSortOrder(a) - getEffectiveSortOrder(b));
  };

  // ---- Heritage chain utility ----

  /**
   * Walk up the replyTo chain to build the full ancestry of a message.
   * Returns messages in root-first order.
   * @param {string} key
   * @returns {ChannelMessage[]}
   */
  const getHeritageChain = key => {
    /** @type {ChannelMessage[]} */
    const chain = [];
    let current = /** @type {string | undefined} */ (key);
    while (current) {
      const entry = messageIndex.get(current);
      if (!entry) break;
      chain.unshift(entry.message);
      current = entry.message.replyTo;
    }
    return chain;
  };

  // ---- Selection system ----

  /**
   * Clear all node selection.
   */
  const clearSelection = () => {
    for (const key of selectedNodes) {
      const els = nodeEls.get(key);
      if (els) els.$node.classList.remove('outliner-selected');
    }
    selectedNodes.clear();
  };

  /**
   * Set or clear selection on a single node.
   * @param {string} key
   * @param {boolean} selected
   */
  const setNodeSelected = (key, selected) => {
    const els = nodeEls.get(key);
    if (!els) return;
    if (selected) {
      selectedNodes.add(key);
      els.$node.classList.add('outliner-selected');
    } else {
      selectedNodes.delete(key);
      els.$node.classList.remove('outliner-selected');
    }
  };

  /**
   * Get all visible committed node keys in document order.
   * @returns {string[]}
   */
  const getVisibleCommittedKeys = () => {
    const allText = getAllVisibleTextNodes();
    /** @type {string[]} */
    const keys = [];
    for (const $t of allText) {
      const $node = /** @type {HTMLElement | null} */ ($t.closest('.outliner-node'));
      if ($node) {
        const key = $node.dataset.key;
        if (key && !key.startsWith('draft-')) {
          keys.push(key);
        }
      }
    }
    return keys;
  };

  /**
   * Select a range of visible committed nodes between two keys (inclusive).
   * @param {string} fromKey
   * @param {string} toKey
   */
  const selectRange = (fromKey, toKey) => {
    const allKeys = getVisibleCommittedKeys();
    const fromIdx = allKeys.indexOf(fromKey);
    const toIdx = allKeys.indexOf(toKey);
    if (fromIdx === -1 || toIdx === -1) return;
    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);
    clearSelection();
    for (let i = start; i <= end; i += 1) {
      setNodeSelected(allKeys[i], true);
    }
  };

  /**
   * Handle mousedown on a committed node row (not on text content).
   * @param {string} key
   * @param {MouseEvent} e
   */
  const handleNodeMouseDown = (key, e) => {
    if (e.shiftKey && lastSelectedKey) {
      e.preventDefault();
      selectRange(lastSelectedKey, key);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      if (selectedNodes.has(key)) {
        setNodeSelected(key, false);
      } else {
        setNodeSelected(key, true);
      }
      lastSelectedKey = key;
      return;
    }
    // Normal click: select only this node
    clearSelection();
    setNodeSelected(key, true);
    lastSelectedKey = key;
  };

  // ---- Drag and drop ----

  /**
   * Handle dragstart from a node's bullet.
   * @param {string} key
   * @param {DragEvent} e
   */
  const handleDragStart = (key, e) => {
    if (!e.dataTransfer) return;
    // If dragged node is in selection, drag all selected; otherwise just this one
    if (selectedNodes.has(key) && selectedNodes.size > 1) {
      draggedKeys = [...selectedNodes];
    } else {
      clearSelection();
      setNodeSelected(key, true);
      draggedKeys = [key];
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedKeys.join(','));
    for (const k of draggedKeys) {
      const els = nodeEls.get(k);
      if (els) els.$node.classList.add('outliner-dragging');
    }
  };

  /**
   * Clean up drag state.
   */
  const handleDragEnd = () => {
    if (draggedKeys) {
      for (const k of draggedKeys) {
        const els = nodeEls.get(k);
        if (els) els.$node.classList.remove('outliner-dragging');
      }
    }
    draggedKeys = null;
    if ($dropIndicator) {
      $dropIndicator.remove();
      $dropIndicator = null;
    }
  };

  /**
   * Find the drop position among siblings of the dragged node's parent.
   * @param {DragEvent} e
   * @returns {{ afterKey: string | undefined, y: number } | null}
   */
  const findDropPosition = e => {
    if (!draggedKeys || draggedKeys.length === 0) return null;
    const firstEntry = messageIndex.get(draggedKeys[0]);
    if (!firstEntry) return null;
    const parentKey = firstEntry.message.replyTo;
    const siblings = getSortedVisibleChildren(parentKey).filter(
      k => !(/** @type {string[]} */ (draggedKeys)).includes(k),
    );
    const mouseY = e.clientY;
    /** @type {{ afterKey: string | undefined, y: number } | null} */
    let bestGap = null;
    let bestDist = Infinity;
    // Gap before first sibling
    if (siblings.length > 0) {
      const firstEls = nodeEls.get(siblings[0]);
      if (firstEls) {
        const rect = firstEls.$node.getBoundingClientRect();
        const gapY = rect.top;
        const dist = Math.abs(mouseY - gapY);
        if (dist < bestDist) {
          bestDist = dist;
          bestGap = { afterKey: undefined, y: gapY };
        }
      }
    }
    // Gap after each sibling
    for (let i = 0; i < siblings.length; i += 1) {
      const els = nodeEls.get(siblings[i]);
      if (els) {
        const rect = els.$node.getBoundingClientRect();
        const gapY = rect.bottom;
        const dist = Math.abs(mouseY - gapY);
        if (dist < bestDist) {
          bestDist = dist;
          bestGap = { afterKey: siblings[i], y: gapY };
        }
      }
    }
    if (!bestGap) {
      const containerRect = $outlinerView.getBoundingClientRect();
      bestGap = { afterKey: undefined, y: containerRect.top };
    }
    return bestGap;
  };

  /**
   * Show or reposition the drop indicator.
   * @param {number} clientY - Y coordinate in viewport pixels
   */
  const showDropIndicator = clientY => {
    if (!$dropIndicator) {
      $dropIndicator = document.createElement('div');
      $dropIndicator.className = 'outliner-drop-indicator';
      $outlinerView.appendChild($dropIndicator);
    }
    const viewRect = $outlinerView.getBoundingClientRect();
    $dropIndicator.style.top = `${clientY - viewRect.top}px`;
  };

  /**
   * Hide the drop indicator.
   */
  const hideDropIndicator = () => {
    if ($dropIndicator) {
      $dropIndicator.remove();
      $dropIndicator = null;
    }
  };

  /**
   * Re-order DOM children of a parent container to match current sort order.
   * @param {string | undefined} parentKey
   */
  const reorderChildren = parentKey => {
    const $container = getChildrenContainer(parentKey);
    const sorted = getSortedVisibleChildren(parentKey);
    for (const key of sorted) {
      const els = nodeEls.get(key);
      if (els) $container.appendChild(els.$node);
    }
    // Re-append draft nodes at the end
    const draftNodes = $container.querySelectorAll(':scope > .outliner-draft');
    for (const $draft of draftNodes) {
      $container.appendChild($draft);
    }
  };

  /**
   * Execute a drop: compute sort orders and post move messages.
   * @param {{ afterKey: string | undefined }} pos
   */
  const handleDrop = pos => {
    if (!draggedKeys || draggedKeys.length === 0) return;
    const firstEntry = messageIndex.get(draggedKeys[0]);
    if (!firstEntry) return;
    const parentKey = firstEntry.message.replyTo;
    const siblings = getSortedVisibleChildren(parentKey).filter(
      k => !(/** @type {string[]} */ (draggedKeys)).includes(k),
    );
    // Find insert index
    let insertIdx = 0;
    if (pos.afterKey) {
      const idx = siblings.indexOf(pos.afterKey);
      if (idx !== -1) insertIdx = idx + 1;
    }
    // Compute boundary sort orders
    let beforeOrder;
    if (insertIdx > 0) {
      beforeOrder = getEffectiveSortOrder(siblings[insertIdx - 1]);
    } else if (siblings.length > 0) {
      beforeOrder =
        getEffectiveSortOrder(siblings[0]) - draggedKeys.length - 1;
    } else {
      beforeOrder = 0;
    }
    const afterOrder =
      insertIdx < siblings.length
        ? getEffectiveSortOrder(siblings[insertIdx])
        : beforeOrder + draggedKeys.length + 1;
    const step = (afterOrder - beforeOrder) / (draggedKeys.length + 1);
    // Sort dragged keys by their current order to preserve relative order
    const sortedDragged = [...draggedKeys].sort(
      (a, b) => getEffectiveSortOrder(a) - getEffectiveSortOrder(b),
    );
    for (let i = 0; i < sortedDragged.length; i += 1) {
      const newOrder = beforeOrder + step * (i + 1);
      const entry = messageIndex.get(sortedDragged[i]);
      if (entry) {
        moveOverrides.set(sortedDragged[i], newOrder);
        E(channel)
          .post(
            [String(newOrder)],
            [],
            [],
            String(entry.message.number),
            [],
            'move',
          )
          .catch(/** @param {Error} err */ err => {
            console.error('Failed to post move:', err);
          });
      }
    }
    reorderChildren(parentKey);
  };

  // ---- Committed node edit handling ----

  /**
   * Commit a dirty committed node's edit to the channel.
   * @param {string} key
   */
  const commitNodeEdit = key => {
    if (!dirtyNodes.has(key)) return;
    const els = nodeEls.get(key);
    if (!els) return;
    const parsed = parseNodeContent(els.$text);
    const effective = getEffective(key);
    const oldText = effective.strings.join('');
    const newText = parsed.strings.join('');
    dirtyNodes.delete(key);
    if (newText === oldText && parsed.petNames.length === 0) return;
    const entry = messageIndex.get(key);
    if (!entry) return;

    // Resolve IDs for pet names, then post
    const idsP =
      powers && parsed.petNames.length > 0
        ? Promise.all(
            parsed.petNames.map(name =>
              E(/** @type {ERef<EndoHost>} */ (powers))
                .identify(
                  .../** @type {[string, ...string[]]} */ (name.split('/')),
                )
                .catch(() => ''),
            ),
          )
        : Promise.resolve(/** @type {string[]} */ ([]));
    idsP
      .then(ids =>
        E(channel).post(
          parsed.strings,
          parsed.edgeNames,
          parsed.petNames,
          String(entry.message.number),
          ids,
          'edit',
        ),
      )
      .catch(/** @param {Error} err */ err => {
        console.error('Failed to post edit:', err);
      });
  };

  // ---- Draft handling ----

  /**
   * Remove a draft node from state and DOM.
   * @param {string} draftId
   */
  const removeDraft = draftId => {
    drafts.delete(draftId);
    const els = draftEls.get(draftId);
    if (els) {
      els.$node.remove();
      draftEls.delete(draftId);
    }
  };

  /**
   * Commit a draft node to the channel. Empty drafts are discarded.
   * @param {string} draftId
   */
  const commitDraft = draftId => {
    const draft = drafts.get(draftId);
    if (!draft) return;
    const els = draftEls.get(draftId);
    const parsed = els
      ? parseNodeContent(els.$text)
      : { strings: [draft.text], petNames: [], edgeNames: [] };
    const plainText = parsed.strings.join('').trim();
    draft.text = plainText;
    if (!draft.text) {
      removeDraft(draftId);
      return;
    }

    // Resolve IDs for pet names, then post
    const draftIdsP =
      powers && parsed.petNames.length > 0
        ? Promise.all(
            parsed.petNames.map(name =>
              E(/** @type {ERef<EndoHost>} */ (powers))
                .identify(
                  .../** @type {[string, ...string[]]} */ (name.split('/')),
                )
                .catch(() => ''),
            ),
          )
        : Promise.resolve(/** @type {string[]} */ ([]));
    draftIdsP
      .then(ids =>
        E(channel).post(
          parsed.strings,
          parsed.edgeNames,
          parsed.petNames,
          draft.parentKey,
          ids,
          draft.replyType,
        ),
      )
      .catch(/** @param {Error} err */ err => {
        console.error('Failed to post draft:', err);
      });

    // Mark pending — keep visible until real message arrives
    if (els) {
      els.$node.classList.add('outliner-draft-pending');
      els.$text.contentEditable = 'false';
    }
  };

  // ---- DOM element creation ----

  /**
   * Create a bullet point or collapse handle element.
   * @param {string} key
   * @param {boolean} hasVisibleChildren
   * @param {boolean} isCollapsed
   * @returns {HTMLElement}
   */
  const createBulletEl = (key, hasVisibleChildren, isCollapsed) => {
    const $el = document.createElement('span');
    if (hasVisibleChildren) {
      $el.className = 'outliner-collapse-handle';
      $el.textContent = isCollapsed ? '\u25B6' : '\u25BC';
      $el.addEventListener('click', e => {
        e.stopPropagation();
        toggleCollapse(key);
      });
    } else {
      $el.className = 'outliner-bullet';
      $el.textContent = '\u2022';
    }
    return $el;
  };

  /**
   * Toggle collapse state for a node.
   * @param {string} key
   */
  const toggleCollapse = key => {
    const els = nodeEls.get(key);
    if (!els) return;
    if (collapsedNodes.has(key)) {
      collapsedNodes.delete(key);
      els.$children.classList.remove('outliner-children-collapsed');
      els.$bullet.textContent = '\u25BC';
      els.$bullet.className = 'outliner-collapse-handle';
    } else {
      collapsedNodes.add(key);
      els.$children.classList.add('outliner-children-collapsed');
      els.$bullet.textContent = '\u25B6';
    }
  };

  /**
   * Update a committed node's bullet based on current children.
   * @param {string} key
   */
  const updateBullet = key => {
    const els = nodeEls.get(key);
    if (!els) return;
    const children = getSortedVisibleChildren(key);
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedNodes.has(key) && hasChildren;
    const $newBullet = createBulletEl(key, hasChildren, isCollapsed);
    els.$bullet.replaceWith($newBullet);
    els.$bullet = $newBullet;
  };

  /**
   * Create type badges for a reply type.
   * @param {string | undefined} replyType
   * @returns {HTMLElement[]}
   */
  const createBadges = replyType => {
    /** @type {HTMLElement[]} */
    const badges = [];
    if (replyType && REPLY_TYPE_BADGES[replyType]) {
      const info = REPLY_TYPE_BADGES[replyType];
      const $badge = document.createElement('span');
      $badge.className = `outliner-badge ${info.className}`;
      $badge.textContent = info.label;
      badges.push($badge);
    } else if (
      replyType &&
      replyType !== 'reply' &&
      isVisibleReplyType(replyType)
    ) {
      const $badge = document.createElement('span');
      $badge.className = 'outliner-badge outliner-badge-custom';
      $badge.textContent = replyType;
      badges.push($badge);
    }
    return badges;
  };

  /**
   * Show an edit history popup anchored near the clicked element.
   * @param {EditQueueEntry[]} editQueue
   * @param {HTMLElement} anchorEl
   */
  const showEditHistory = (editQueue, anchorEl) => {
    // Remove any existing popup
    const existing = $outlinerView.querySelector('.outliner-edit-history');
    if (existing) existing.remove();

    const $popup = document.createElement('div');
    $popup.className = 'outliner-edit-history';

    const $header = document.createElement('div');
    $header.className = 'outliner-edit-history-header';
    $header.textContent = `Edit History (${editQueue.length})`;
    const $close = document.createElement('button');
    $close.className = 'outliner-edit-history-close';
    $close.textContent = '\u00D7';
    $close.type = 'button';
    $header.appendChild($close);
    $popup.appendChild($header);

    const $list = document.createElement('div');
    $list.className = 'outliner-edit-history-list';

    for (const entry of editQueue) {
      const $entry = document.createElement('div');
      $entry.className = 'outliner-edit-history-entry';
      if (entry.deleted) $entry.classList.add('outliner-edit-deleted');

      const $entryMeta = document.createElement('div');
      $entryMeta.className = 'outliner-edit-history-meta';
      const editorName =
        nameMap.get(entry.memberId) || `Member ${entry.memberId}`;
      const date = new Date(entry.date);
      $entryMeta.textContent = `${editorName} \u00B7 ${relativeTime(date)}`;
      if (entry.deleted) {
        const $tag = document.createElement('span');
        $tag.className = 'outliner-edit-history-deleted-tag';
        $tag.textContent = 'reverted';
        $entryMeta.appendChild($tag);
      }
      $entry.appendChild($entryMeta);

      const $content = document.createElement('div');
      $content.className = 'outliner-edit-history-content';
      $content.textContent = entry.strings.join('');
      $entry.appendChild($content);

      $list.appendChild($entry);
    }

    $popup.appendChild($list);

    // Position near the anchor
    const anchorRect = anchorEl.getBoundingClientRect();
    const parentRect = $parent.getBoundingClientRect();
    $popup.style.top = `${anchorRect.bottom - parentRect.top + $parent.scrollTop + 4}px`;
    $popup.style.left = `${anchorRect.left - parentRect.left}px`;

    $outlinerView.appendChild($popup);

    const closePopup = () => {
      $popup.remove();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
    };

    /** @param {KeyboardEvent} e */
    const onKey = e => {
      if (e.key === 'Escape') closePopup();
    };

    /** @param {MouseEvent} e */
    const onOutside = e => {
      if (!$popup.contains(/** @type {Node} */ (e.target))) closePopup();
    };

    $close.addEventListener('click', closePopup);
    setTimeout(() => {
      document.addEventListener('keydown', onKey);
      document.addEventListener('mousedown', onOutside);
    }, 0);
  };

  /**
   * Create an "Edited by" span with a click handler for edit history.
   * @param {NodeEffectiveContent} effective
   * @returns {HTMLElement}
   */
  const createEditedByEl = effective => {
    const editorName =
      nameMap.get(/** @type {string} */ (effective.editedByMemberId)) ||
      `Member ${effective.editedByMemberId}`;
    const $edited = document.createElement('span');
    $edited.className = 'outliner-edited-by';
    $edited.textContent = `Edited by ${editorName}`;
    $edited.title = `Edit queue: ${effective.editQueue.length} edit(s)`;
    $edited.addEventListener('click', e => {
      e.stopPropagation();
      showEditHistory(effective.editQueue, $edited);
    });
    return $edited;
  };

  /**
   * Create the metadata element for a committed node.
   * @param {NodeEffectiveContent} effective
   * @returns {HTMLElement}
   */
  const createMetaEl = effective => {
    const $meta = document.createElement('div');
    $meta.className = 'outliner-meta';
    const authorName =
      nameMap.get(effective.authorMemberId) ||
      `Member ${effective.authorMemberId}`;
    const $author = document.createElement('span');
    $author.className = 'outliner-author';
    $author.textContent = authorName;
    $meta.appendChild($author);
    if (effective.editedByMemberId) {
      $meta.appendChild(createEditedByEl(effective));
    }
    return $meta;
  };

  /**
   * Update metadata content in-place.
   * @param {HTMLElement} $meta
   * @param {NodeEffectiveContent} effective
   */
  const updateMetaContent = ($meta, effective) => {
    $meta.innerHTML = '';
    const authorName =
      nameMap.get(effective.authorMemberId) ||
      `Member ${effective.authorMemberId}`;
    const $author = document.createElement('span');
    $author.className = 'outliner-author';
    $author.textContent = authorName;
    $meta.appendChild($author);
    if (effective.editedByMemberId) {
      $meta.appendChild(createEditedByEl(effective));
    }
  };

  // ---- Token autocomplete lifecycle ----

  /**
   * Attach token autocomplete on focus for any .outliner-text element.
   * Creates a menu element inside the closest .outliner-node and initializes
   * a tokenAutocompleteComponent. Only one is active at a time.
   * @param {HTMLElement} $text
   */
  const attachTokenAutocompleteOnFocus = $text => {
    $text.addEventListener('focus', () => {
      if (!powers) return;
      // Clean up any previous instance
      if (activeTokenMenu) {
        activeTokenMenu.remove();
        activeTokenMenu = null;
        activeTokenComponent = null;
      }
      const $node = $text.closest('.outliner-node');
      if (!$node) return;
      const $menu = document.createElement('div');
      $menu.className = 'token-menu';
      $node.appendChild($menu);
      activeTokenMenu = $menu;
      const typedPowers = /** @type {ERef<EndoHost>} */ (powers);
      activeTokenComponent = tokenAutocompleteComponent($text, $menu, {
        E,
        makeRefIterator,
        powers: typedPowers,
        externalPetNames: sharedPetNames,
      });
    });
  };

  /**
   * Clean up token autocomplete on blur for any .outliner-text element.
   * @param {HTMLElement} $text
   */
  const attachTokenAutocompleteOnBlur = $text => {
    $text.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.activeElement !== $text && activeTokenMenu) {
          activeTokenMenu.remove();
          activeTokenMenu = null;
          activeTokenComponent = null;
        }
      }, 200);
    });
  };

  // ---- Slash command menu ----

  /** @type {HTMLElement | null} */
  let activeSlashMenu = null;
  /** @type {number} */
  let slashMenuSelectedIndex = 0;
  /** @type {string | null} */
  let slashMenuDraftId = null;

  /**
   * Hide the active slash command menu.
   */
  const hideSlashMenu = () => {
    if (activeSlashMenu) {
      activeSlashMenu.remove();
      activeSlashMenu = null;
      slashMenuDraftId = null;
    }
  };

  /**
   * Apply a slash command to a draft: set replyType, clear the slash text,
   * and add a badge to the row.
   * @param {string} draftId
   * @param {typeof SLASH_COMMANDS[number]} cmd
   * @param {HTMLElement} $text
   */
  const applySlashCommand = (draftId, cmd, $text) => {
    const draft = drafts.get(draftId);
    if (!draft) return;

    draft.replyType = cmd.replyType;

    // Remove the slash text from the content
    $text.textContent = '';

    // Add badge to the row
    const $row = $text.closest('.outliner-node-row');
    if ($row) {
      // Remove any existing slash badge
      const existing = $row.querySelector('.outliner-badge');
      if (existing) existing.remove();
      const badgeInfo = REPLY_TYPE_BADGES[cmd.replyType];
      if (badgeInfo) {
        const $badge = document.createElement('span');
        $badge.className = `outliner-badge ${badgeInfo.className}`;
        $badge.textContent = badgeInfo.label;
        // Insert badge after bullet, before text
        $row.insertBefore($badge, $text);
      }
    }

    hideSlashMenu();
    $text.focus();
  };

  /**
   * Render the slash command menu filtered by current input.
   * @param {string} draftId
   * @param {HTMLElement} $text
   * @param {string} query - text after the `/`
   */
  const showSlashMenu = (draftId, $text, query) => {
    const filtered = SLASH_COMMANDS.filter(cmd =>
      cmd.command.startsWith(query.toLowerCase()),
    );

    if (filtered.length === 0) {
      hideSlashMenu();
      return;
    }

    // Clamp selection
    if (slashMenuSelectedIndex >= filtered.length) {
      slashMenuSelectedIndex = filtered.length - 1;
    }

    // Create or reuse menu
    if (!activeSlashMenu) {
      activeSlashMenu = document.createElement('div');
      activeSlashMenu.className = 'outliner-slash-menu';
      const $node = $text.closest('.outliner-node');
      if ($node) {
        $node.appendChild(activeSlashMenu);
      }
    }
    slashMenuDraftId = draftId;

    activeSlashMenu.innerHTML = '';
    filtered.forEach((cmd, i) => {
      const $item = document.createElement('div');
      $item.className = 'outliner-slash-item';
      if (i === slashMenuSelectedIndex) {
        $item.classList.add('selected');
      }
      const badgeInfo = REPLY_TYPE_BADGES[cmd.replyType];
      if (badgeInfo) {
        const $badge = document.createElement('span');
        $badge.className = `outliner-badge ${badgeInfo.className}`;
        $badge.textContent = badgeInfo.label;
        $item.appendChild($badge);
      }
      const $desc = document.createElement('span');
      $desc.className = 'outliner-slash-desc';
      $desc.textContent = cmd.description;
      $item.appendChild($desc);
      $item.addEventListener('mousedown', e => {
        e.preventDefault();
        applySlashCommand(draftId, cmd, $text);
      });
      activeSlashMenu.appendChild($item);
    });
  };

  /**
   * Check if the slash menu is visible and handling keys.
   * @returns {boolean}
   */
  const isSlashMenuVisible = () => activeSlashMenu !== null;

  /**
   * Handle keydown events for slash menu navigation.
   * @param {KeyboardEvent} e
   * @param {string} draftId
   * @param {HTMLElement} $text
   * @returns {boolean} true if the event was consumed
   */
  const handleSlashMenuKeydown = (e, draftId, $text) => {
    if (!isSlashMenuVisible() || slashMenuDraftId !== draftId) return false;

    const text = ($text.textContent || '').trimStart();
    const query = text.startsWith('/') ? text.slice(1).toLowerCase() : '';
    const filtered = SLASH_COMMANDS.filter(cmd =>
      cmd.command.startsWith(query),
    );

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      slashMenuSelectedIndex = Math.min(
        slashMenuSelectedIndex + 1,
        filtered.length - 1,
      );
      showSlashMenu(draftId, $text, query);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      slashMenuSelectedIndex = Math.max(slashMenuSelectedIndex - 1, 0);
      showSlashMenu(draftId, $text, query);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (filtered[slashMenuSelectedIndex]) {
        applySlashCommand(draftId, filtered[slashMenuSelectedIndex], $text);
      }
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hideSlashMenu();
      return true;
    }
    return false;
  };

  /**
   * Check draft text on input and show/hide slash menu.
   * @param {string} draftId
   * @param {HTMLElement} $text
   */
  const checkSlashTrigger = (draftId, $text) => {
    const text = ($text.textContent || '').trimStart();
    if (text.startsWith('/')) {
      const query = text.slice(1);
      slashMenuSelectedIndex = 0;
      showSlashMenu(draftId, $text, query);
    } else {
      hideSlashMenu();
    }
  };

  // ---- Event handlers ----

  /**
   * Set up input, blur, and keyboard events on a committed node's text.
   * @param {HTMLElement} $text
   * @param {string} key
   */
  const setupCommittedEvents = ($text, key) => {
    attachTokenAutocompleteOnFocus($text);
    attachTokenAutocompleteOnBlur($text);

    $text.addEventListener('focus', () => {
      clearSelection();
    });

    $text.addEventListener('input', () => {
      dirtyNodes.add(key);
    });

    $text.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.activeElement !== $text) {
          commitNodeEdit(key);
        }
      }, 150);
    });

    $text.addEventListener('keydown', e => {
      // Let token autocomplete handle keys when its menu is open
      if (activeTokenComponent && activeTokenComponent.isMenuVisible()) return;

      // Cmd/Ctrl+A: select all within this block only
      if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents($text);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        // Commit pending edit, then create sibling draft below
        commitNodeEdit(key);
        const entry = messageIndex.get(key);
        const parentKey = entry?.message.replyTo;
        const draftId = createDraft(parentKey, key);
        const draftEl = draftEls.get(draftId);
        if (draftEl) {
          requestAnimationFrame(() => focusTextNode(draftEl.$text));
        }
        return;
      }

      if (e.key === 'Backspace') {
        const text = $text.textContent || '';
        if (text === '') {
          e.preventDefault();
          // Delete the committed node
          const allNodes = getAllVisibleTextNodes();
          const idx = allNodes.indexOf($text);
          const entry = messageIndex.get(key);
          if (entry) {
            E(channel)
              .post(
                [''],
                [],
                [],
                String(entry.message.number),
                [],
                'deletion',
              )
              .catch(/** @param {Error} err */ err => {
                console.error('Failed to delete:', err);
              });
          }
          if (idx > 0) {
            focusTextNode(allNodes[idx - 1], true);
          }
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        const { atStart } = getCursorPosition($text);
        if (atStart) {
          e.preventDefault();
          const allNodes = getAllVisibleTextNodes();
          const idx = allNodes.indexOf($text);
          if (idx > 0) focusTextNode(allNodes[idx - 1], true);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        const { atEnd } = getCursorPosition($text);
        if (atEnd) {
          e.preventDefault();
          const allNodes = getAllVisibleTextNodes();
          const idx = allNodes.indexOf($text);
          if (idx < allNodes.length - 1) focusTextNode(allNodes[idx + 1]);
        }
      }
      // Tab/Shift-Tab on committed nodes deferred to Phase B
    });
  };

  /**
   * Set up input, blur, and keyboard events on a draft node's text.
   * @param {HTMLElement} $text
   * @param {string} draftId
   */
  const setupDraftEvents = ($text, draftId) => {
    attachTokenAutocompleteOnFocus($text);
    attachTokenAutocompleteOnBlur($text);

    $text.addEventListener('input', () => {
      const draft = drafts.get(draftId);
      if (draft) {
        draft.text = $text.textContent || '';
      }
      checkSlashTrigger(draftId, $text);
    });

    $text.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.activeElement !== $text) {
          hideSlashMenu();
          commitDraft(draftId);
        }
      }, 150);
    });

    $text.addEventListener('keydown', e => {
      // Let token autocomplete handle keys when its menu is open
      if (activeTokenComponent && activeTokenComponent.isMenuVisible()) return;

      // Let slash menu handle navigation keys when visible
      if (handleSlashMenuKeydown(e, draftId, $text)) return;

      // Cmd/Ctrl+A: select all within this block only
      if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents($text);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        return;
      }

      const draft = drafts.get(draftId);
      if (!draft) return;

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = ($text.textContent || '').trim();

        // Empty draft with a parent: dedent instead of committing
        if (!text && draft.parentKey) {
          const parentEntry = messageIndex.get(draft.parentKey);
          const grandparentKey = parentEntry?.message.replyTo;
          const oldParentKey = draft.parentKey;

          draft.parentKey = grandparentKey;
          draft.afterKey = oldParentKey;

          const els = draftEls.get(draftId);
          if (!els) return;
          els.$node.remove();

          const newDepth = grandparentKey
            ? getNodeDepth(grandparentKey) + 1
            : 0;
          els.$node.dataset.depth = String(newDepth);

          const newContainer = getChildrenContainer(grandparentKey);
          const $after = newContainer.querySelector(
            `:scope > [data-key="${oldParentKey}"]`,
          );
          if ($after && $after.nextSibling) {
            newContainer.insertBefore(els.$node, $after.nextSibling);
          } else {
            newContainer.appendChild(els.$node);
          }
          focusTextNode(els.$text);
          return;
        }

        // Commit current draft, create new sibling
        draft.text = text;
        commitDraft(draftId);
        const newDraftId = createDraft(draft.parentKey, draftId);
        const newEls = draftEls.get(newDraftId);
        if (newEls) {
          requestAnimationFrame(() => focusTextNode(newEls.$text));
        }
        return;
      }

      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        // Indent: reparent under previous sibling
        const $container = getChildrenContainer(draft.parentKey);
        const $me = $container.querySelector(
          `:scope > [data-key="${draftId}"]`,
        );
        if (!$me) return;
        const $prev = /** @type {HTMLElement | null} */ (
          $me.previousElementSibling
        );
        if (!$prev || !$prev.dataset.key) return;
        const prevKey = /** @type {string} */ ($prev.dataset.key);

        draft.parentKey = prevKey;
        draft.afterKey = undefined;

        const els = draftEls.get(draftId);
        if (!els) return;
        els.$node.remove();

        const newDepth = getNodeDepth(prevKey) + 1;
        els.$node.dataset.depth = String(newDepth);

        // Expand previous sibling if collapsed
        if (collapsedNodes.has(prevKey)) {
          collapsedNodes.delete(prevKey);
          const prevEls = nodeEls.get(prevKey);
          if (prevEls) {
            prevEls.$children.classList.remove('outliner-children-collapsed');
            updateBullet(prevKey);
          }
        }

        const newContainer = getChildrenContainer(prevKey);
        newContainer.appendChild(els.$node);
        focusTextNode(els.$text, true);
        return;
      }

      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        // Dedent: reparent to be sibling after current parent
        if (!draft.parentKey) return;
        const parentEntry = messageIndex.get(draft.parentKey);
        const grandparentKey = parentEntry?.message.replyTo;
        const oldParentKey = draft.parentKey;

        draft.parentKey = grandparentKey;
        draft.afterKey = oldParentKey;

        const els = draftEls.get(draftId);
        if (!els) return;
        els.$node.remove();

        const newDepth = grandparentKey
          ? getNodeDepth(grandparentKey) + 1
          : 0;
        els.$node.dataset.depth = String(newDepth);

        const newContainer = getChildrenContainer(grandparentKey);
        const $after = newContainer.querySelector(
          `:scope > [data-key="${oldParentKey}"]`,
        );
        if ($after && $after.nextSibling) {
          newContainer.insertBefore(els.$node, $after.nextSibling);
        } else {
          newContainer.appendChild(els.$node);
        }
        focusTextNode(els.$text, true);
        return;
      }

      if (e.key === 'Backspace') {
        const text = $text.textContent || '';
        if (text === '') {
          e.preventDefault();
          const allNodes = getAllVisibleTextNodes();
          const idx = allNodes.indexOf($text);
          removeDraft(draftId);
          if (idx > 0) focusTextNode(allNodes[idx - 1], true);
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        const { atStart } = getCursorPosition($text);
        if (atStart) {
          e.preventDefault();
          const allNodes = getAllVisibleTextNodes();
          const idx = allNodes.indexOf($text);
          if (idx > 0) focusTextNode(allNodes[idx - 1], true);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        const { atEnd } = getCursorPosition($text);
        if (atEnd) {
          e.preventDefault();
          const allNodes = getAllVisibleTextNodes();
          const idx = allNodes.indexOf($text);
          if (idx < allNodes.length - 1) focusTextNode(allNodes[idx + 1]);
        }
      }
    });
  };

  // ---- Committed node creation ----

  /**
   * Create a full committed node element with nested children container.
   * @param {string} key
   * @param {number} depth
   * @param {ChannelMessage} message
   * @param {NodeEffectiveContent} effective
   * @param {string[]} visibleChildren
   * @param {boolean} isCollapsed
   * @returns {{ $node: HTMLElement, $row: HTMLElement, $text: HTMLElement, $bullet: HTMLElement, $meta: HTMLElement, $children: HTMLElement }}
   */
  const createCommittedNode = (
    key,
    depth,
    message,
    effective,
    visibleChildren,
    isCollapsed,
  ) => {
    const $node = document.createElement('div');
    $node.className = 'outliner-node';
    $node.dataset.key = key;
    $node.dataset.depth = String(depth);

    const $row = document.createElement('div');
    $row.className = 'outliner-node-row';

    const $bullet = createBulletEl(
      key,
      visibleChildren.length > 0,
      isCollapsed,
    );
    $row.appendChild($bullet);

    for (const $badge of createBadges(message.replyType)) {
      $row.appendChild($badge);
    }

    const $text = document.createElement('div');
    $text.className = 'outliner-text';
    $text.contentEditable = 'true';
    renderNodeContent($text, effective);
    setupCommittedEvents($text, key);
    $row.appendChild($text);

    // Fork button (visible on hover)
    if (onFork) {
      const $forkBtn = document.createElement('button');
      $forkBtn.className = 'outliner-fork-button';
      $forkBtn.title = 'Fork to new channel';
      $forkBtn.type = 'button';
      $forkBtn.textContent = '\u2442';
      $forkBtn.addEventListener('click', e => {
        e.stopPropagation();
        const chain = getHeritageChain(key);
        const preview =
          effective.strings.join('').slice(0, 40) || 'Forked note';
        onFork(chain, preview).catch(window.reportError);
      });
      $row.appendChild($forkBtn);
    }

    // Make bullet a drag handle
    $bullet.draggable = true;
    $bullet.addEventListener('dragstart', dragE => handleDragStart(key, dragE));
    $bullet.addEventListener('dragend', () => handleDragEnd());

    // Selection on non-text row click
    $row.addEventListener('mousedown', mouseE => {
      if ($text.contains(/** @type {Node} */ (mouseE.target))) return;
      const btn = /** @type {HTMLElement} */ (mouseE.target).closest('button');
      if (btn) return;
      handleNodeMouseDown(key, mouseE);
    });

    $node.appendChild($row);

    const $meta = createMetaEl(effective);
    $node.appendChild($meta);

    const $children = document.createElement('div');
    $children.className = 'outliner-children';
    if (isCollapsed) {
      $children.classList.add('outliner-children-collapsed');
    }
    $node.appendChild($children);

    const els = { $node, $row, $text, $bullet, $meta, $children };
    nodeEls.set(key, els);

    // Update messageIndex element reference
    const entry = messageIndex.get(key);
    if (entry) {
      messageIndex.set(key, { message: entry.message, $element: $node });
    }

    return els;
  };

  // ---- Draft creation ----

  /**
   * Create a new draft node and insert it into the DOM.
   * @param {string | undefined} parentKey
   * @param {string | undefined} afterKey
   * @returns {string} draftId
   */
  const createDraft = (parentKey, afterKey) => {
    draftCounter += 1;
    const draftId = `draft-${draftCounter}`;
    /** @type {DraftNode} */
    const draft = { draftId, text: '', parentKey, afterKey, replyType: undefined };
    drafts.set(draftId, draft);

    const depth = parentKey ? getNodeDepth(parentKey) + 1 : 0;

    const $node = document.createElement('div');
    $node.className = 'outliner-node outliner-draft';
    $node.dataset.key = draftId;
    $node.dataset.depth = String(depth);

    const $row = document.createElement('div');
    $row.className = 'outliner-node-row';

    const $bullet = document.createElement('span');
    $bullet.className = 'outliner-bullet';
    $bullet.textContent = '\u2022';
    $row.appendChild($bullet);

    const $text = document.createElement('div');
    $text.className = 'outliner-text';
    $text.contentEditable = 'true';
    setupDraftEvents($text, draftId);
    $row.appendChild($text);

    $node.appendChild($row);

    const $children = document.createElement('div');
    $children.className = 'outliner-children';
    $node.appendChild($children);

    draftEls.set(draftId, { $node, $text, $children });

    // Insert at correct position in parent's children container
    const $container = getChildrenContainer(parentKey);
    if (afterKey) {
      const $afterItem = $container.querySelector(
        `:scope > [data-key="${afterKey}"]`,
      );
      if ($afterItem && $afterItem.nextSibling) {
        $container.insertBefore($node, $afterItem.nextSibling);
      } else {
        $container.appendChild($node);
      }
    } else {
      $container.appendChild($node);
    }

    return draftId;
  };

  // ---- Full render ----

  /**
   * Recursively build the DOM tree for a committed node.
   * @param {string} key
   * @param {number} depth
   * @param {Map<string, NodeEffectiveContent>} effectiveContents
   * @returns {HTMLElement | null}
   */
  const buildNodeTree = (key, depth, effectiveContents) => {
    const entry = messageIndex.get(key);
    if (!entry) return null;
    if (!isVisibleReplyType(entry.message.replyType)) return null;
    const effective = effectiveContents.get(key);
    if (!effective || effective.deleted) return null;

    const visibleChildren = getSortedVisibleChildren(key, effectiveContents);
    const isCollapsed =
      collapsedNodes.has(key) && visibleChildren.length > 0;

    const els = createCommittedNode(
      key,
      depth,
      entry.message,
      effective,
      visibleChildren,
      isCollapsed,
    );

    // Build children recursively (always in DOM, hidden if collapsed)
    for (const childKey of visibleChildren) {
      const $child = buildNodeTree(childKey, depth + 1, effectiveContents);
      if ($child) {
        els.$children.appendChild($child);
      }
    }

    return els.$node;
  };

  /**
   * Full re-render: clear and rebuild the entire outliner DOM.
   */
  const renderFull = () => {
    nodeEls.clear();
    $outlinerView.innerHTML = '';

    const effectiveContents = computeAllNodeContents(
      messageIndex,
      replyChildren,
      blockedMemberIds,
    );

    const sortedRoots = [...rootKeys].sort((a, b) => {
      const ea = messageIndex.get(a);
      const eb = messageIndex.get(b);
      if (!ea || !eb) return 0;
      if (ea.message.number < eb.message.number) return -1;
      if (ea.message.number > eb.message.number) return 1;
      return 0;
    });

    const frag = document.createDocumentFragment();
    for (const rootKey of sortedRoots) {
      const $node = buildNodeTree(rootKey, 0, effectiveContents);
      if ($node) frag.appendChild($node);
    }
    $outlinerView.appendChild(frag);
  };

  // ---- Incremental message handling ----

  /**
   * Try to match an arriving message to a pending draft and remove it.
   * @param {ChannelMessage} message
   * @returns {boolean}
   */
  const matchPendingDraft = message => {
    const msgText = message.strings.join('').trim();
    for (const [draftId, draft] of drafts) {
      const els = draftEls.get(draftId);
      if (
        els &&
        els.$node.classList.contains('outliner-draft-pending') &&
        (draft.parentKey || undefined) === (message.replyTo || undefined) &&
        draft.text === msgText
      ) {
        removeDraft(draftId);
        return true;
      }
    }
    return false;
  };

  /**
   * Handle a single new message incrementally (after initial load).
   * @param {ChannelMessage} message
   * @param {string} msgKey
   */
  const handleIncremental = (message, msgKey) => {
    if (isVisibleReplyType(message.replyType)) {
      matchPendingDraft(message);
      const effective = getEffective(msgKey);
      if (effective.deleted) return;

      const parentKey = message.replyTo;
      const depth = parentKey ? getNodeDepth(parentKey) + 1 : 0;
      const visibleChildren = getSortedVisibleChildren(msgKey);

      const els = createCommittedNode(
        msgKey,
        depth,
        message,
        effective,
        visibleChildren,
        false,
      );

      // Insert at sorted position among siblings
      const $container = getChildrenContainer(parentKey);
      const siblings = getSortedVisibleChildren(parentKey);
      const myIdx = siblings.indexOf(msgKey);
      let inserted = false;
      if (myIdx >= 0 && myIdx < siblings.length - 1) {
        const nextKey = siblings[myIdx + 1];
        const $next = $container.querySelector(
          `:scope > [data-key="${nextKey}"]`,
        );
        if ($next) {
          $container.insertBefore(els.$node, $next);
          inserted = true;
        }
      }
      if (!inserted) {
        // Insert before any draft nodes so committed content stays above drafts
        const $firstDraft = $container.querySelector(
          ':scope > .outliner-draft',
        );
        if ($firstDraft) {
          $container.insertBefore(els.$node, $firstDraft);
        } else {
          $container.appendChild(els.$node);
        }
      }

      // Expand parent and update its bullet
      if (parentKey) {
        if (collapsedNodes.has(parentKey)) {
          collapsedNodes.delete(parentKey);
          const parentEls = nodeEls.get(parentKey);
          if (parentEls) {
            parentEls.$children.classList.remove(
              'outliner-children-collapsed',
            );
          }
        }
        updateBullet(parentKey);
      }
    } else if (
      message.replyType === 'edit' ||
      message.replyType === 'deletion'
    ) {
      const targetKey = message.replyTo;
      if (!targetKey) return;
      const els = nodeEls.get(targetKey);
      if (!els) return;

      // Skip update if user is actively editing this node
      if (document.activeElement === els.$text) return;

      const effective = getEffective(targetKey);
      if (effective.deleted) {
        els.$node.classList.add('outliner-hidden');
      } else {
        els.$node.classList.remove('outliner-hidden');
        renderNodeContent(els.$text, effective);
        updateMetaContent(els.$meta, effective);
      }
    } else if (message.replyType === 'move') {
      const targetKey = message.replyTo;
      if (!targetKey) return;
      const sortOrder = parseFloat(message.strings[0]);
      if (Number.isNaN(sortOrder)) return;
      moveOverrides.set(targetKey, sortOrder);
      // Re-sort the affected parent's children in the DOM
      const targetEntry = messageIndex.get(targetKey);
      if (targetEntry) {
        reorderChildren(targetEntry.message.replyTo);
      }
    }
  };

  /* eslint-enable no-use-before-define */

  // ---- Empty-space click handler ----

  // Clicking empty space in the outliner creates a root draft
  $outlinerView.addEventListener('click', e => {
    if (rubberBandJustFinished) return;
    if (e.target !== $outlinerView) return;
    const draftId = createDraft(undefined, undefined);
    const draftEl = draftEls.get(draftId);
    if (draftEl) {
      requestAnimationFrame(() => focusTextNode(draftEl.$text));
    }
  });

  // ---- Drag and drop on outliner view ----

  $outlinerView.addEventListener('dragover', e => {
    if (!draggedKeys || !e.dataTransfer) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const pos = findDropPosition(e);
    if (pos) {
      showDropIndicator(pos.y);
    }
  });

  $outlinerView.addEventListener('dragleave', e => {
    if (
      !$outlinerView.contains(/** @type {Node | null} */ (e.relatedTarget))
    ) {
      hideDropIndicator();
    }
  });

  $outlinerView.addEventListener('drop', e => {
    e.preventDefault();
    hideDropIndicator();
    if (!draggedKeys) return;
    const pos = findDropPosition(e);
    if (pos) {
      handleDrop(pos);
    }
    handleDragEnd();
  });

  // ---- Rubber-band selection ----

  /** @type {boolean} */
  let isRubberBanding = false;
  /** @type {number} */
  let rbStartX = 0;
  /** @type {number} */
  let rbStartY = 0;
  /** @type {HTMLElement | null} */
  let $rbRect = null;

  $outlinerView.addEventListener('mousedown', e => {
    // Only start on background (outliner-view or children container)
    const target = /** @type {HTMLElement} */ (e.target);
    if (
      target !== $outlinerView &&
      !target.classList.contains('outliner-children')
    ) {
      return;
    }
    if (e.button !== 0) return;

    rbStartX = e.clientX;
    rbStartY = e.clientY;
    isRubberBanding = false;

    /** @param {MouseEvent} me */
    const onMouseMove = me => {
      const dx = me.clientX - rbStartX;
      const dy = me.clientY - rbStartY;
      if (!isRubberBanding && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        isRubberBanding = true;
        $rbRect = document.createElement('div');
        $rbRect.className = 'outliner-selection-rect';
        $outlinerView.appendChild($rbRect);
      }
      if (isRubberBanding && $rbRect) {
        const viewRect = $outlinerView.getBoundingClientRect();
        const left = Math.min(rbStartX, me.clientX) - viewRect.left;
        const top = Math.min(rbStartY, me.clientY) - viewRect.top;
        $rbRect.style.left = `${left}px`;
        $rbRect.style.top = `${top}px`;
        $rbRect.style.width = `${Math.abs(dx)}px`;
        $rbRect.style.height = `${Math.abs(dy)}px`;

        // Compute intersecting nodes
        const selLeft = Math.min(rbStartX, me.clientX);
        const selTop = Math.min(rbStartY, me.clientY);
        const selRight = Math.max(rbStartX, me.clientX);
        const selBottom = Math.max(rbStartY, me.clientY);

        clearSelection();
        for (const [key, els] of nodeEls) {
          const rowRect = els.$row.getBoundingClientRect();
          if (
            rowRect.bottom > selTop &&
            rowRect.top < selBottom &&
            rowRect.right > selLeft &&
            rowRect.left < selRight
          ) {
            setNodeSelected(key, true);
          }
        }
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if ($rbRect) {
        $rbRect.remove();
        $rbRect = null;
      }
      if (isRubberBanding) {
        rubberBandJustFinished = true;
        setTimeout(() => {
          rubberBandJustFinished = false;
        }, 0);
      }
      isRubberBanding = false;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // Escape clears selection
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && selectedNodes.size > 0) {
      clearSelection();
    }
  });

  // ---- Channel API ----

  /** @type {{ closeThread: () => boolean }} */
  const channelAPI = harden({
    closeThread: () => false,
  });
  /** @type {any} */ ($parent).channelAPI = channelAPI;

  // ---- Follow messages ----

  /** @type {unknown} */
  let messagesRef;
  try {
    messagesRef = await E(channel).followMessages();
  } catch (err) {
    const $error = document.createElement('div');
    $error.className = 'channel-status channel-status-error';
    const errMsg = err instanceof Error ? err.message : String(err);
    $error.textContent = `Unable to load messages: ${errMsg}`;
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

  batchTimer = setTimeout(() => {
    renderFull();
    initialLoadComplete = true;
    batchTimer = 0;
    // Auto-create title draft if empty channel
    if (rootKeys.length === 0) {
      const draftId = createDraft(undefined, undefined);
      const draftEl = draftEls.get(draftId);
      if (draftEl) {
        draftEl.$node.classList.add('outliner-title-draft');
        requestAnimationFrame(() => focusTextNode(draftEl.$text));
      }
    }
  }, 200);

  for await (const message of messageIterator) {
    const typedMessage = /** @type {ChannelMessage} */ (message);
    const msgKey = String(typedMessage.number);

    // Placeholder element for messageIndex compatibility
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
    } else if (isVisibleReplyType(typedMessage.replyType)) {
      rootKeys.push(msgKey);
    }

    // Track move overrides
    if (typedMessage.replyType === 'move' && typedMessage.replyTo) {
      const sortOrder = parseFloat(typedMessage.strings[0]);
      if (!Number.isNaN(sortOrder)) {
        moveOverrides.set(typedMessage.replyTo, sortOrder);
      }
    }

    // Render strategy: batch during initial load, incremental after
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = setTimeout(() => {
        renderFull();
        scrollToBottom();
        initialLoadComplete = true;
        batchTimer = 0;
      }, 50);
    } else if (initialLoadComplete) {
      handleIncremental(typedMessage, msgKey);
      scrollToBottom();
    } else {
      renderFull();
      scrollToBottom();
    }
  }
};
harden(outlinerComponent);
