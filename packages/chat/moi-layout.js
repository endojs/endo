// @ts-check

/**
 * @typedef {object} Message
 * @property {string} id
 * @property {string} [replyTo]
 */

/**
 * @typedef {object} LayoutEntry
 * @property {number} indent
 * @property {string} lineType - 'continue' | 'end' | 'branch' | 'none'
 */

/**
 * Computes the MOI (message-of-interest) layout for a list of messages.
 *
 * The MOI, its parent, and the chronologically last reply are at indent 0,
 * connected by gutter lines. Earlier replies get indent 1 with branch lines.
 * Intermediate messages between MOI and last reply get indent 1 with
 * continuation lines.
 *
 * @param {Message[]} messages - Chronologically ordered messages.
 * @param {string} moiId - The message-of-interest ID.
 * @returns {Map<string, LayoutEntry>}
 */
const computeLayout = (messages, moiId) => {
  /** @type {Map<string, LayoutEntry>} */
  const layout = new Map();

  const moiIndex = messages.findIndex(m => m.id === moiId);
  if (moiIndex === -1) {
    // MOI not found — assign defaults to all messages.
    for (const msg of messages) {
      layout.set(msg.id, { indent: 0, lineType: 'none' });
    }
    return layout;
  }

  const moi = messages[moiIndex];

  // Find the parent message (the message the MOI replies to).
  /** @type {number} */
  let parentIndex = -1;
  if (moi.replyTo) {
    parentIndex = messages.findIndex(m => m.id === moi.replyTo);
  }

  // Find replies to the MOI, preserving chronological order.
  /** @type {number[]} */
  const replyIndices = [];
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i].replyTo === moiId) {
      replyIndices.push(i);
    }
  }

  // The last reply (chronologically) is the primary reply.
  const lastReplyIndex =
    replyIndices.length > 0 ? replyIndices[replyIndices.length - 1] : -1;

  // Determine the range of the vertical line.
  // It spans from the parent (or MOI if no parent) to the last reply (or MOI if no replies).
  const lineStart = parentIndex !== -1 ? parentIndex : moiIndex;
  const lineEnd = lastReplyIndex !== -1 ? lastReplyIndex : moiIndex;

  // Set of reply IDs for quick lookup.
  const replyIdSet = new Set(replyIndices.map(i => messages[i].id));
  // Set of earlier (non-last) reply indices.
  const earlierReplyIndices = new Set(replyIndices.slice(0, -1));

  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];

    if (i === moiIndex) {
      // MOI: indent 0, line continues if there are replies or parent.
      const hasLine = lineStart !== lineEnd;
      layout.set(msg.id, {
        indent: 0,
        lineType: hasLine ? 'continue' : 'none',
      });
    } else if (i === parentIndex) {
      // Parent: indent 0, line continues downward.
      layout.set(msg.id, { indent: 0, lineType: 'continue' });
    } else if (i === lastReplyIndex) {
      // Last reply: indent 0, line terminates.
      layout.set(msg.id, { indent: 0, lineType: 'end' });
    } else if (earlierReplyIndices.has(i)) {
      // Earlier reply: indent 1, branch line.
      layout.set(msg.id, { indent: 1, lineType: 'branch' });
    } else if (i > lineStart && i < lineEnd && !replyIdSet.has(msg.id)) {
      // Intermediate message within the line range: indent 1, line continues past.
      layout.set(msg.id, { indent: 1, lineType: 'continue' });
    } else if (
      parentIndex !== -1 &&
      i > parentIndex &&
      i < moiIndex &&
      !replyIdSet.has(msg.id)
    ) {
      // Message between parent and MOI: indent 1, line continues past.
      layout.set(msg.id, { indent: 1, lineType: 'continue' });
    } else {
      // Outside the chain.
      layout.set(msg.id, { indent: 0, lineType: 'none' });
    }
  }

  return layout;
};
harden(computeLayout);

export { computeLayout };
