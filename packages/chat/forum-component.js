// @ts-check
/* eslint-disable no-continue */

import harden from '@endo/harden';
import { E } from '@endo/far';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { Fragment, h, renderConfined } from './setup-preact-container.js';

import { createChannelState } from './channel-utils.js';
import { createReactSystem } from './react-utils.js';
import {
  isVisibleReplyType,
  computeNodeContent,
  isEffectivelyDeleted,
} from './edit-queue.js';
import { relativeTime, timeFormatter } from './time-formatters.js';
import { prepareTextWithPlaceholders } from './markdown-render.js';
import { markdownToVnodes } from './markdown-vnodes.js';

/** @import { ChannelMessage } from './channel-utils.js' */

// Forum view — a threaded (tree) message view, migrated from imperative DOM to
// a confined Preact component rendered through a single `renderConfined`.
//
// THE HOST-NODE BRIDGE PATTERN (mirrors microblog-component.js). The tree
// structure (forum-view container, forum-node wrappers, depth/chain/collapsed
// classes, reply indicators, message bodies, timestamps, action bars, collapse
// handles, "edited by" attribution) renders confined as `h()` vnodes. Three
// pieces remain imperative DOM produced by reused helpers that are NOT
// view-migration targets:
//   - author chips (`channel-utils` profile popup — positions a portal, mutates
//     `nameMap`, re-renders sibling chips by DOM query),
//   - react buttons and react pills (`react-utils` — a `document.body` react
//     picker portal, nested sub-reacts, contextmenu handlers).
// Live DOM (with listeners) cannot enter a confined vnode tree — `renderConfined`
// strips refs and real nodes. So the chrome renders empty ANCHOR slots
// (`data-author-anchor` / `data-react-btn-anchor` / `data-react-pills-anchor`)
// and, after each confined render, the controller re-parents the imperative
// nodes into their anchors.
//
// Message bodies use the vnode path (`markdownToVnodes`) instead of the
// string-returning `renderMarkdown`/`.innerHTML`, mirroring the inbox and
// microblog migrations.
//
// The substrate-agnostic tree logic (visible-children resolution respecting
// reparenting, subtree recency, active-chain computation, recursive subtree
// collection) and the followMessages consumer loop are reused VERBATIM from the
// imperative version; only view construction became Preact.

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
 * @param {(heritageChain: ChannelMessage[], previewText: string) => Promise<void>} [options.onFork] - Fork heritage chain to new channel
 * @param {(heritageChain: ChannelMessage[], previewText: string) => void} [options.onShare] - Open share modal for a message
 */
export const forumComponent = async (
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

  const {
    messageIndex,
    replyChildren,
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

  // ---- Substrate-agnostic tree logic (reused verbatim) ----

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

  /* eslint-disable no-use-before-define */

  /**
   * Render a subtree recursively, collecting entries for batch rendering.
   * Only includes visible (non-modifier, non-deleted) nodes.
   * @param {string} key
   * @param {number} depth
   * @param {Set<string>} activeChain
   * @returns {Array<{ key: string, depth: number, isChain: boolean, isCollapsed: boolean, children: string[], message: ChannelMessage }>}
   */
  const collectSubtree = (key, depth, activeChain) => {
    const entry = messageIndex.get(key);
    if (!entry) return [];

    // Skip effectively deleted nodes
    if (
      isEffectivelyDeleted(key, messageIndex, replyChildren, blockedMemberIds)
    ) {
      return [];
    }

    const isChain = activeChain.has(key);
    const children = getVisibleChildren(key);
    const isCollapsed = collapsedNodes.has(key) && children.length > 0;

    /** @type {Array<{ key: string, depth: number, isChain: boolean, isCollapsed: boolean, children: string[], message: ChannelMessage }>} */
    const results = [
      {
        key,
        depth,
        isChain,
        isCollapsed,
        children,
        message: entry.message,
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

  /* eslint-enable no-use-before-define */

  // ---- Dedicated confined mount ----

  // The forum view container element, created once and inserted before the
  // scroll anchor so switchChannel's cleanup (which clears `$parent`) still
  // works and siblings (the `$end` anchor) are never reconciled away.
  const $forumView = document.createElement('div');
  $forumView.className = 'forum-view';
  if ($end) {
    $parent.insertBefore($forumView, $end);
  } else {
    $parent.appendChild($forumView);
  }
  const isLive = () => $forumView.isConnected;

  // ---- View (confined Preact vnodes) ----

  /**
   * Render a message body as vnodes with interactive token chips. Mirrors the
   * imperative body construction in `createMessageElement`, but emits vnodes
   * (no `.innerHTML`).
   * @param {ChannelMessage} message
   * @returns {import('preact').VNode}
   */
  const Body = message => {
    const messageNames =
      /** @type {any} */ (message).names ||
      /** @type {any} */ (message).edgeNames ||
      [];

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

    const { nodes } = markdownToVnodes(textWithPlaceholders, { renderToken });
    return h('span', { class: 'message-body' }, ...nodes);
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
   * The reply indicator shown above a message whose parent is not directly
   * above it in the tree. Mirrors `createMessageElement`'s reply indicator.
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
    const parentPreview = parentMsg.strings.join('').substring(0, 60);
    // The author name uses the assigned nickname when present, falling back to
    // the proposed name resolved asynchronously into nameMap by author chips.
    const parentAuthor = nameMap.get(parentMsg.memberId) || parentMsg.memberId;
    return h(
      'div',
      { class: 'reply-indicator' },
      h('span', { class: 'reply-indicator-icon' }, '↩'),
      h('span', { class: 'reply-indicator-author' }, parentAuthor),
      h('span', { class: 'reply-indicator-preview' }, parentPreview),
    );
  };

  /**
   * The hover action bar (reply + react anchor + fork/share menu).
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
            '↩',
          )
        : null,
      // React button (imperative host node, bridged via anchor)
      h('span', { 'data-react-btn-anchor': messageKey }),
      // Fork action
      onFork
        ? h(
            'button',
            {
              class: 'message-action-btn',
              title: 'Fork to Channel',
              onClick: () => {
                const chain = getHeritageChain(messageKey);
                const preview =
                  message.strings.join('').substring(0, 40) || 'Forked note';
                onFork(chain, preview).catch(window.reportError);
              },
            },
            '⑂',
          )
        : null,
      // Share action
      onShare
        ? h(
            'button',
            {
              class: 'message-action-btn',
              title: 'Share…',
              onClick: () => {
                const chain = getHeritageChain(messageKey);
                const preview =
                  message.strings.join('').substring(0, 60) || 'Shared message';
                onShare(chain, preview);
              },
            },
            '⇗',
          )
        : null,
    );
  };

  /**
   * Get heritage chain for a message key (root-to-message path).
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

  /**
   * Render one forum tree node from a collected entry. Mirrors the imperative
   * `forum-node` construction: depth/chain/collapsed classes, the message
   * wrapper (reply indicator + message bubble), "edited by" attribution, and
   * the collapse handle.
   * @param {object} props
   * @param {{ key: string, depth: number, isChain: boolean, isCollapsed: boolean, children: string[], message: ChannelMessage }} props.entry
   * @param {boolean} props.parentIsDirectlyAbove
   */
  const ForumNode = ({ entry, parentIsDirectlyAbove }) => {
    const { key, depth, isChain, isCollapsed, children, message } = entry;

    // Apply effective (edit/delete-resolved) content over the message fields.
    const ec = computeNodeContent(
      key,
      messageIndex,
      replyChildren,
      blockedMemberIds,
    );
    const effectiveMessage = ec.editedByMemberId
      ? /** @type {ChannelMessage} */ ({
          ...message,
          strings: ec.strings,
          names: ec.names,
          ids: ec.ids,
        })
      : message;

    const isOwn = ownMemberId !== undefined && message.memberId === ownMemberId;
    const date = new Date(message.date);

    // node-level classes
    const nodeClasses = ['forum-node', `depth-${Math.min(depth, 5)}`];
    if (isChain) nodeClasses.push('chain-member');
    if (isCollapsed) nodeClasses.push('collapsed');

    // The message bubble: timestamp controls, author anchor, body, action bar.
    const $message = h(
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
      h(AuthorAnchor, { memberId: message.memberId }),
      ' ',
      Body(effectiveMessage),
      h(ActionBar, { messageKey: key, message }),
    );

    // The reply indicator is skipped when the message appears directly below
    // its parent in the tree — the nesting already provides that context.
    const showReplyIndicator =
      message.replyTo !== undefined && !parentIsDirectlyAbove;

    const children2 = [
      showReplyIndicator ? h(ReplyIndicator, { message }) : null,
      $message,
    ];

    const $wrapper = h('div', { class: 'message-wrapper' }, ...children2);

    // "edited by" attribution
    let $edited = null;
    if (ec.editedByMemberId) {
      const editorName =
        nameMap.get(ec.editedByMemberId) || ec.editedByMemberId;
      const editorCount = ec.editorMemberIds.length;
      const editCount = ec.editQueue.filter(eq => !eq.deleted).length;
      $edited = h(
        'div',
        {
          class: 'forum-edited-by',
          title: `${editCount} edit${editCount === 1 ? '' : 's'}`,
        },
        editorCount <= 1
          ? `edited by ${editorName}`
          : `edited by ${editorCount} people`,
      );
    }

    // collapse handle
    let $handle = null;
    if (children.length > 0) {
      const count = countVisibleDescendants(key);
      const label = `${count} ${count === 1 ? 'reply' : 'replies'} ${
        isCollapsed ? '▶' : '▼'
      }`;
      $handle = h(
        'div',
        {
          class: 'forum-collapse-handle',
          onClick: () => {
            if (collapsedNodes.has(key)) {
              collapsedNodes.delete(key);
            } else {
              collapsedNodes.add(key);
            }
            rerender();
          },
        },
        label,
      );
    }

    return h(
      'div',
      {
        class: nodeClasses.join(' '),
        'data-msg-key': key,
      },
      $wrapper,
      // React pills (imperative host node, bridged via anchor)
      h('span', { 'data-react-pills-anchor': key }),
      $edited,
      $handle,
    );
  };

  /**
   * The whole forum tree: roots sorted by subtree recency (most recent last),
   * each expanded to a flat list of visible nodes.
   */
  const Forum = () => {
    // Get effective root keys (visible, non-deleted, respecting reparenting)
    const effectiveRoots = getVisibleChildren(undefined).filter(
      k =>
        !isEffectivelyDeleted(k, messageIndex, replyChildren, blockedMemberIds),
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

    // Collect all entries, then render in one flat batch (matching the
    // imperative `forum-view` flat-append structure).
    /** @type {Array<{ key: string, depth: number, isChain: boolean, isCollapsed: boolean, children: string[], message: ChannelMessage }>} */
    const allEntries = [];
    for (const rootKey of sortedRoots) {
      const activeChain = computeActiveChain(rootKey);
      const subtreeEntries = collectSubtree(rootKey, 0, activeChain);
      for (const entry of subtreeEntries) {
        allEntries.push(entry);
      }
    }

    return h(
      Fragment,
      null,
      ...allEntries.map((entry, i) => {
        const parentIsDirectlyAbove =
          i > 0 &&
          entry.message.replyTo !== undefined &&
          entry.message.replyTo === allEntries[i - 1].key;
        return h(ForumNode, {
          key: entry.key,
          entry,
          parentIsDirectlyAbove,
        });
      }),
    );
  };

  // ---- Imperative host-node helpers (bridged into anchors after each render) ----

  /**
   * Create a clickable author element (imperative DOM) with profile popup.
   * Mirrors the author chip built inline by `createMessageElement`.
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
        if (!info) return;
        const authorProposedName = info.proposedName;
        const pedigree = info.pedigree || [];
        const pedigreeMemberIds = info.pedigreeMemberIds || [];
        $author.dataset.proposedName = authorProposedName;
        const current = nameMap.get(memberId);
        if (!current) {
          $author.textContent = `“${authorProposedName}”`;
        }
        $author.title =
          pedigree.length > 0
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
    // Author chips — re-create per anchor so each node has its own chip element,
    // as the original did.
    const authorAnchors = $forumView.querySelectorAll('[data-author-anchor]');
    for (const $anchor of authorAnchors) {
      const el = /** @type {HTMLElement} */ (/** @type {unknown} */ ($anchor));
      if (el.firstChild) continue;
      const memberId = el.getAttribute('data-author-anchor') || '';
      el.appendChild(createAuthorEl(memberId));
    }

    // React buttons — one per message key (stable, reusable node).
    const reactBtnAnchors = $forumView.querySelectorAll(
      '[data-react-btn-anchor]',
    );
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
    const pillAnchors = $forumView.querySelectorAll(
      '[data-react-pills-anchor]',
    );
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
   * Render the confined forum tree, then bridge the imperative host nodes.
   * `renderConfined` is synchronous, so anchors exist when bridging runs.
   * A re-entrancy guard preserves the imperative version's "coalesce a render
   * requested while one is running" behavior.
   */
  const rerender = () => {
    if (rendering) {
      pendingRender = true;
      return;
    }
    rendering = true;
    try {
      renderConfined(h(Forum, null), $forumView);
      bridgeHostNodes();
    } finally {
      rendering = false;
      if (pendingRender) {
        pendingRender = false;
        rerender();
      }
    }
  };

  // Expose a control API matching channelComponent's interface, hung off the
  // parent exactly where the imperative version put it.
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
  const messageIterator = iterateReader(messagesRef);
  activeIterator = messageIterator;

  /** Batch incoming messages during initial load. */
  let batchTimer = 0;

  // Schedule an initial render after the first batch arrives.
  batchTimer = setTimeout(() => {
    rerender();
    $parent.scrollTo(0, $parent.scrollHeight);
    batchTimer = 0;
  }, 200);

  for await (const message of messageIterator) {
    if (disposed) break;
    const typedMessage = /** @type {ChannelMessage} */ (message);
    const msgKey = String(typedMessage.number);

    // Record the message in the index. The forum re-renders the full tree on
    // each update, so we just need the data in messageIndex.
    messageIndex.set(msgKey, {
      message: typedMessage,
      $element: document.createElement('div'),
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
        rerender();
        $parent.scrollTo(0, $parent.scrollHeight);
        batchTimer = 0;
      }, 50);
    } else if (isLive()) {
      // After initial load, render incrementally
      rerender();
      scrollToBottom();
    }
  }
};
harden(forumComponent);
