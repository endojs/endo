// @ts-check
import {
  isStandardRole,
  makeCustomEntry,
  makeHeaderEntry,
  makeMessageEntry,
} from './entries.js';

/**
 * @import {
 *   ChatMessage,
 *   HeaderEntry,
 *   NodeEntry,
 *   SessionEntry,
 *   TranscriptNode,
 * } from '../types.js'
 */

/**
 * The on-disk entry id for the `index`-th message of a transcript node. A node
 * bundles several LLM messages under one daemon messageId; on disk each message
 * is its own entry, so the ids are suffixed to stay unique while remaining
 * traceable back to the node.
 *
 * @param {string} messageId
 * @param {number} index
 * @returns {string}
 */
export const entryId = (messageId, index) => `${messageId}:${index}`;

/**
 * Project one Lal transcript node into its on-disk entries. The node's messages
 * become a linear chain: the first links to `parentEntryId`, each subsequent
 * message links to the one before it. A message with a non-standard role
 * projects to a `custom` entry (Pi's extension slot); standard roles project to
 * `message` entries.
 *
 * @param {TranscriptNode} node
 * @param {{ parentEntryId: string | null }} context
 * @returns {{ entries: NodeEntry[], lastEntryId: string | null }}
 */
export const projectNode = (node, { parentEntryId }) => {
  /** @type {NodeEntry[]} */
  const entries = [];
  let previousId = parentEntryId;
  node.messages.forEach((message, index) => {
    const id = entryId(node.messageId, index);
    /** @type {{ id: string, parentId: string | null, 'endo:messageId': string, 'endo:parentMessageId'?: string | null }} */
    const linkage = {
      id,
      parentId: previousId,
      'endo:messageId': node.messageId,
    };
    if (index === 0) {
      linkage['endo:parentMessageId'] = node.parentMessageId;
    }
    if (isStandardRole(message.role)) {
      entries.push(makeMessageEntry(message, linkage));
    } else {
      entries.push(
        makeCustomEntry(message.role, {
          id,
          parentId: previousId,
          payload: {
            'endo:messageId': node.messageId,
            ...(index === 0
              ? { 'endo:parentMessageId': node.parentMessageId }
              : {}),
            message,
          },
        }),
      );
    }
    previousId = id;
  });
  // An index/alias node with no messages contributes nothing and passes its
  // parent linkage straight through.
  return { entries, lastEntryId: previousId };
};

/**
 * Order nodes so every node appears after its parent. Nodes are keyed by their
 * `messageId`; roots (`parentMessageId === null`, or a parent absent from the
 * map) come first. A node reachable under multiple keys (Lal stores an alias
 * under the outbound messageId) is emitted once, by its canonical `messageId`.
 *
 * @param {Map<string, TranscriptNode> | Iterable<TranscriptNode>} nodes
 * @returns {TranscriptNode[]}
 */
export const topoOrder = nodes => {
  /** @type {Map<string, TranscriptNode>} */
  const canonical = new Map();
  const source =
    nodes instanceof Map
      ? nodes.values()
      : /** @type {Iterable<TranscriptNode>} */ (nodes);
  for (const node of source) {
    canonical.set(node.messageId, node);
  }
  /** @type {Map<string | null, TranscriptNode[]>} */
  const childrenOf = new Map();
  for (const node of canonical.values()) {
    const parent =
      node.parentMessageId !== null && canonical.has(node.parentMessageId)
        ? node.parentMessageId
        : null;
    const bucket = childrenOf.get(parent);
    if (bucket === undefined) {
      childrenOf.set(parent, [node]);
    } else {
      bucket.push(node);
    }
  }
  // Iterative pre-order walk (parent before children, children left-to-right):
  // a long linear transcript is thousands of nodes deep, so a recursive walk
  // would overflow the stack. The `visited` set makes a `parentMessageId` cycle
  // (a corrupt graph) terminate instead of dropping or looping on its nodes.
  /** @type {TranscriptNode[]} */
  const ordered = [];
  /** @type {Set<string>} */
  const visited = new Set();
  /** @type {TranscriptNode[]} */
  const stack = [...(childrenOf.get(null) || [])].reverse();
  while (stack.length > 0) {
    const node = /** @type {TranscriptNode} */ (stack.pop());
    if (!visited.has(node.messageId)) {
      visited.add(node.messageId);
      ordered.push(node);
      const children = childrenOf.get(node.messageId) || [];
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push(children[i]);
      }
    }
  }
  return ordered;
};

/**
 * Project a whole Lal transcript-node graph to a session-file entry list: one
 * header followed by every node's message entries, parent-before-child.
 *
 * @param {Map<string, TranscriptNode> | Iterable<TranscriptNode>} nodes
 * @param {Omit<HeaderEntry, 'type' | 'version'> & { version?: number }} header
 * @returns {SessionEntry[]}
 */
export const projectGraph = (nodes, header) => {
  /** @type {SessionEntry[]} */
  const entries = [makeHeaderEntry(header)];
  /** @type {Map<string, string | null>} */
  const lastEntryOfNode = new Map();
  for (const node of topoOrder(nodes)) {
    const parentEntryId =
      node.parentMessageId !== null && lastEntryOfNode.has(node.parentMessageId)
        ? /** @type {string | null} */ (
            lastEntryOfNode.get(node.parentMessageId)
          )
        : null;
    const { entries: nodeEntries, lastEntryId } = projectNode(node, {
      parentEntryId,
    });
    entries.push(...nodeEntries);
    lastEntryOfNode.set(node.messageId, lastEntryId);
  }
  return entries;
};

/**
 * The inverse of {@link projectGraph}: regroup a session file's entries back
 * into Lal transcript nodes, keyed by `endo:messageId`. The header is ignored.
 * Entry order within a node is preserved.
 *
 * @param {SessionEntry[]} entries
 * @returns {Map<string, TranscriptNode>}
 */
export const loadTranscriptNodes = entries => {
  /** @type {Map<string, TranscriptNode>} */
  const nodes = new Map();
  for (const entry of entries) {
    /** @type {string | undefined} */
    let endoMessageId;
    /** @type {string | null | undefined} */
    let endoParentMessageId;
    /** @type {ChatMessage | undefined} */
    let message;
    if (entry.type === 'message') {
      endoMessageId = entry['endo:messageId'];
      endoParentMessageId = entry['endo:parentMessageId'];
      message = entry.message;
    } else if (entry.type === 'custom') {
      endoMessageId = /** @type {string | undefined} */ (
        entry.custom['endo:messageId']
      );
      endoParentMessageId = /** @type {string | null | undefined} */ (
        entry.custom['endo:parentMessageId']
      );
      message = /** @type {ChatMessage | undefined} */ (entry.custom.message);
    }
    // Entries without an `endo:messageId` (the header, a compaction marker) are
    // not projected transcript nodes and contribute nothing here.
    if (endoMessageId !== undefined && message !== undefined) {
      const existing = nodes.get(endoMessageId);
      if (existing === undefined) {
        nodes.set(endoMessageId, {
          messageId: endoMessageId,
          parentMessageId: endoParentMessageId ?? null,
          messages: [message],
        });
      } else {
        existing.messages.push(message);
        if (
          endoParentMessageId !== undefined &&
          existing.parentMessageId === null
        ) {
          existing.parentMessageId = endoParentMessageId;
        }
      }
    }
  }
  return nodes;
};
