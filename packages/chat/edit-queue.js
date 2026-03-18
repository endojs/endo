// @ts-check

import harden from '@endo/harden';

/** @import { ChannelMessage } from './channel-utils.js' */

/**
 * @typedef {object} EditQueueEntry
 * @property {string} messageKey - message number as string
 * @property {string} memberId
 * @property {string} date
 * @property {string[]} strings - replacement content
 * @property {string[]} names
 * @property {string[]} ids
 * @property {boolean} deleted - whether a Deletion targets this edit
 * @property {string | undefined} deletedBy - messageKey of the Deletion
 */

/**
 * @typedef {object} NodeEffectiveContent
 * @property {string[]} strings
 * @property {string[]} names
 * @property {string[]} ids
 * @property {string} authorMemberId - original poster
 * @property {string | undefined} editedByMemberId - winning edit author
 * @property {string | undefined} editedByMessageKey
 * @property {EditQueueEntry[]} editQueue - full queue for display
 * @property {string[]} editorMemberIds - unique editors, chronological
 * @property {boolean} deleted - whether the node itself is effectively deleted
 */

/** Reply types that modify a node rather than appearing as children. */
const MODIFIER_REPLY_TYPES = harden(new Set(['edit', 'deletion', 'move']));

/**
 * Set of reply types that render as visible child nodes.
 * `undefined` means a standard reply (pre-replyType messages).
 *
 * @param {string | undefined} replyType
 * @returns {boolean}
 */
export const isVisibleReplyType = replyType => {
  if (replyType === undefined) return true;
  return !MODIFIER_REPLY_TYPES.has(replyType);
};
harden(isVisibleReplyType);

/**
 * Check if a given message is "effectively deleted" — meaning at least one
 * alive (non-deleted) Deletion targets it, posted by a non-blocked member.
 *
 * Recursion is bounded by the `visited` set to prevent cycles.
 *
 * @param {string} messageKey
 * @param {Map<string, { message: ChannelMessage }>} messagesByKey
 * @param {Map<string, string[]>} replyChildren
 * @param {Set<string>} blockedMemberIds
 * @param {Set<string>} [visited]
 * @returns {boolean}
 */
export const isEffectivelyDeleted = (
  messageKey,
  messagesByKey,
  replyChildren,
  blockedMemberIds,
  visited = new Set(),
) => {
  if (visited.has(messageKey)) return false;
  visited.add(messageKey);

  const children = replyChildren.get(messageKey) || [];
  for (const childKey of children) {
    const childEntry = messagesByKey.get(childKey);
    if (!childEntry) continue;
    const child = childEntry.message;
    if (child.replyType !== 'deletion') continue;
    if (blockedMemberIds.has(child.memberId)) continue;
    // This deletion is alive if it is not itself effectively deleted
    if (
      !isEffectivelyDeleted(
        childKey,
        messagesByKey,
        replyChildren,
        blockedMemberIds,
        visited,
      )
    ) {
      return true;
    }
  }
  return false;
};
harden(isEffectivelyDeleted);

/**
 * Compute the effective content for a single visible node, considering
 * all Edit-type replies, Deletion-type replies on those edits, blocked
 * members, and last-write-wins ordering.
 *
 * @param {string} targetKey
 * @param {Map<string, { message: ChannelMessage }>} messagesByKey
 * @param {Map<string, string[]>} replyChildren
 * @param {Set<string>} blockedMemberIds
 * @returns {NodeEffectiveContent}
 */
export const computeNodeContent = (
  targetKey,
  messagesByKey,
  replyChildren,
  blockedMemberIds,
) => {
  const targetEntry = messagesByKey.get(targetKey);
  if (!targetEntry) {
    return harden({
      strings: [''],
      names: [],
      ids: [],
      authorMemberId: '',
      editedByMemberId: undefined,
      editedByMessageKey: undefined,
      editQueue: [],
      editorMemberIds: [],
      deleted: false,
    });
  }

  const original = targetEntry.message;

  // Check if the node itself is effectively deleted
  const nodeDeleted = isEffectivelyDeleted(
    targetKey,
    messagesByKey,
    replyChildren,
    blockedMemberIds,
  );
  const children = replyChildren.get(targetKey) || [];

  // Collect all edit-type replies targeting this node
  /** @type {Array<{ key: string, message: ChannelMessage }>} */
  const edits = [];
  for (const childKey of children) {
    const childEntry = messagesByKey.get(childKey);
    if (!childEntry) continue;
    if (childEntry.message.replyType !== 'edit') continue;
    if (blockedMemberIds.has(childEntry.message.memberId)) continue;
    edits.push({ key: childKey, message: childEntry.message });
  }

  // Sort edits by message number (chronological)
  edits.sort((a, b) => {
    if (a.message.number < b.message.number) return -1;
    if (a.message.number > b.message.number) return 1;
    return 0;
  });

  // Build the edit queue, checking which edits are effectively deleted
  /** @type {EditQueueEntry[]} */
  const editQueue = [];
  /** @type {string[]} */
  const editorMemberIds = [];
  /** @type {Set<string>} */
  const seenEditors = new Set();

  for (const edit of edits) {
    const deleted = isEffectivelyDeleted(
      edit.key,
      messagesByKey,
      replyChildren,
      blockedMemberIds,
    );

    // Find which deletion targets this edit (if any alive deletion exists)
    let deletedBy;
    if (deleted) {
      const editChildren = replyChildren.get(edit.key) || [];
      for (const delKey of editChildren) {
        const delEntry = messagesByKey.get(delKey);
        if (!delEntry) continue;
        if (delEntry.message.replyType !== 'deletion') continue;
        if (blockedMemberIds.has(delEntry.message.memberId)) continue;
        if (
          !isEffectivelyDeleted(
            delKey,
            messagesByKey,
            replyChildren,
            blockedMemberIds,
          )
        ) {
          deletedBy = delKey;
          break;
        }
      }
    }

    editQueue.push(
      harden({
        messageKey: edit.key,
        memberId: edit.message.memberId,
        date: edit.message.date,
        strings: edit.message.strings,
        names: /** @type {string[]} */ (edit.message.names || []),
        ids: /** @type {string[]} */ (edit.message.ids || []),
        deleted,
        deletedBy,
      }),
    );

    if (!seenEditors.has(edit.message.memberId)) {
      seenEditors.add(edit.message.memberId);
      editorMemberIds.push(edit.message.memberId);
    }
  }

  // Find the winning edit: latest undeleted edit
  let winningEdit;
  for (let i = editQueue.length - 1; i >= 0; i -= 1) {
    if (!editQueue[i].deleted) {
      winningEdit = editQueue[i];
      break;
    }
  }

  if (winningEdit) {
    return harden({
      strings: winningEdit.strings,
      names: winningEdit.names,
      ids: winningEdit.ids,
      authorMemberId: original.memberId,
      editedByMemberId: winningEdit.memberId,
      editedByMessageKey: winningEdit.messageKey,
      editQueue,
      editorMemberIds,
      deleted: nodeDeleted,
    });
  }

  // No winning edit — return original content
  return harden({
    strings: original.strings,
    names: /** @type {string[]} */ (original.names || []),
    ids: /** @type {string[]} */ (original.ids || []),
    authorMemberId: original.memberId,
    editedByMemberId: undefined,
    editedByMessageKey: undefined,
    editQueue,
    editorMemberIds,
    deleted: nodeDeleted,
  });
};
harden(computeNodeContent);

/**
 * Compute effective content for all visible nodes in a message set.
 * A visible node is one whose replyType is not a modifier type
 * (edit, deletion, move).
 *
 * @param {Map<string, { message: ChannelMessage }>} messagesByKey
 * @param {Map<string, string[]>} replyChildren
 * @param {Set<string>} blockedMemberIds
 * @returns {Map<string, NodeEffectiveContent>}
 */
export const computeAllNodeContents = (
  messagesByKey,
  replyChildren,
  blockedMemberIds,
) => {
  /** @type {Map<string, NodeEffectiveContent>} */
  const results = new Map();
  for (const [key, entry] of messagesByKey) {
    if (!isVisibleReplyType(entry.message.replyType)) continue;
    results.set(
      key,
      computeNodeContent(key, messagesByKey, replyChildren, blockedMemberIds),
    );
  }
  return results;
};
harden(computeAllNodeContents);
