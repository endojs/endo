// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/far';

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */
/** @import { ChannelRef } from '../channel-utils.js' */

// Host-side post-intent layer for the outliner. These functions own the single
// channel mutation primitive `E(channel).post(...)` (§5) and the in-memory
// draft store. They were extracted from the `outlinerComponent` closure
// (commitNodeEdit :1101, commitDraft :1177, the deletion posts :1901/2407, the
// move posts :1056/1957/2027, and the draft map ops :1164/1177/2611) so they
// take STRUCTURED `(key, parsed)` / explicit args instead of reaching into the
// DOM for `$text`.
//
// These remain HOST code (they call `E(channel).post` and `E(powers).identify`)
// but they never read `document` — the editable-line island parses the DOM and
// hands the structured `{ strings, petNames, edgeNames }` in. That makes the
// intent layer the single source of truth for what gets posted, ready for the
// confined seam in Phase 3.

/**
 * Structured content parsed out of an editable line. Mirrors the return of
 * `parseNodeContent` (outliner-component.js:422) and the island's `onCommit`
 * payload (editable-line.js).
 *
 * @typedef {object} ParsedContent
 * @property {string[]} strings - Plain-text runs.
 * @property {string[]} petNames - Pet-name paths for token chips.
 * @property {string[]} edgeNames - Edge names for token chips.
 */

/**
 * An uncommitted draft node. Moved here from outliner-component.js:34 because
 * the draft store now lives in the controller-intents layer; the snapshot
 * builder imports this type.
 *
 * @typedef {object} DraftNode
 * @property {string} draftId
 * @property {string} text
 * @property {string | undefined} parentKey
 * @property {string | undefined} afterKey - Render the draft right AFTER this
 *   committed sibling key (used by Enter-at-end "new sibling below").
 * @property {string | undefined} [beforeKey] - Render the draft right BEFORE
 *   this committed sibling key (used by Enter-at-start "peer before"). Takes
 *   precedence over `afterKey` when both are set, mirroring `createDraft`
 *   (outliner-component.js:2371).
 * @property {string | undefined} replyType
 */

/**
 * Mention-notify payload, raised after posting a message that carries
 * at-mentions. Mirrors `options.onMentionNotify` (outliner-component.js:91).
 *
 * @typedef {object} MentionNotify
 * @property {string[]} petNames
 * @property {string[]} edgeNames
 * @property {string[]} messageStrings
 * @property {string | undefined} replyTo
 */

/**
 * Resolve pet-name paths to ids via the host powers, tolerating failures
 * (unresolved names post as `''`). Shared by edit- and draft-commit.
 * Extracted from outliner-component.js:1115-1126 / 1192-1203.
 *
 * @param {unknown} powers
 * @param {string[]} petNames
 * @returns {Promise<string[]>}
 */
const resolveIds = (powers, petNames) => {
  if (!powers || petNames.length === 0) {
    return Promise.resolve(/** @type {string[]} */ ([]));
  }
  return Promise.all(
    petNames.map(name =>
      E(/** @type {ERef<EndoHost>} */ (powers))
        .identify(.../** @type {[string, ...string[]]} */ (name.split('/')))
        .catch(() => ''),
    ),
  ).then(ids => /** @type {string[]} */ (ids));
};

/**
 * Post an edit of a committed node. The caller decides whether content changed;
 * this just posts. Resolves pet names, posts an `'edit'` reply targeting
 * `replyTo`, and fires `onMentionNotify` when at-mentions are present.
 * Extracted from outliner-component.js:1101-1156 (post seam at :1129).
 *
 * @param {object} args
 * @param {unknown} args.channel
 * @param {unknown} args.powers
 * @param {string} args.replyTo - Target message number (as string).
 * @param {ParsedContent} args.parsed
 * @param {(info: MentionNotify) => void} [args.onMentionNotify]
 * @returns {Promise<unknown>}
 */
export const postEdit = ({
  channel,
  powers,
  replyTo,
  parsed,
  onMentionNotify,
}) =>
  resolveIds(powers, parsed.petNames)
    .then(ids => {
      const postP = E(/** @type {ChannelRef} */ (channel)).post(
        parsed.strings,
        parsed.edgeNames,
        parsed.petNames,
        replyTo,
        ids,
        'edit',
      );
      if (parsed.petNames.length > 0 && onMentionNotify) {
        postP
          .then(() =>
            onMentionNotify({
              petNames: parsed.petNames,
              edgeNames: parsed.edgeNames,
              messageStrings: parsed.strings,
              replyTo,
            }),
          )
          .catch(() => {});
      }
      return postP;
    })
    .catch(
      /** @param {Error} err */ err => {
        console.error('Failed to post edit:', err);
      },
    );
harden(postEdit);

/**
 * Post a new draft message. Resolves pet names, posts under `parentKey` with
 * `replyType`, and fires `onMentionNotify` when at-mentions are present.
 * Extracted from outliner-component.js:1177-1233 (post seam at :1206).
 *
 * @param {object} args
 * @param {unknown} args.channel
 * @param {unknown} args.powers
 * @param {string | undefined} args.parentKey
 * @param {string | undefined} args.replyType
 * @param {ParsedContent} args.parsed
 * @param {(info: MentionNotify) => void} [args.onMentionNotify]
 * @returns {Promise<unknown>}
 */
export const postDraft = ({
  channel,
  powers,
  parentKey,
  replyType,
  parsed,
  onMentionNotify,
}) =>
  resolveIds(powers, parsed.petNames)
    .then(ids => {
      const postP = E(/** @type {ChannelRef} */ (channel)).post(
        parsed.strings,
        parsed.edgeNames,
        parsed.petNames,
        parentKey,
        ids,
        replyType,
      );
      if (parsed.petNames.length > 0 && onMentionNotify) {
        postP
          .then(() =>
            onMentionNotify({
              petNames: parsed.petNames,
              edgeNames: parsed.edgeNames,
              messageStrings: parsed.strings,
              replyTo: parentKey,
            }),
          )
          .catch(() => {});
      }
      return postP;
    })
    .catch(
      /** @param {Error} err */ err => {
        console.error('Failed to post draft:', err);
      },
    );
harden(postDraft);

/**
 * Post a deletion of a committed node.
 * Extracted from outliner-component.js:1901 / 2407.
 *
 * @param {object} args
 * @param {unknown} args.channel
 * @param {string} args.replyTo - Target message number (as string).
 * @param {(err: Error) => void} [args.onError] - Error sink (defaults to
 *   logging to `console.error`, matching the keyboard-delete path).
 * @returns {Promise<unknown>}
 */
export const postDeletion = ({ channel, replyTo, onError }) =>
  E(/** @type {ChannelRef} */ (channel))
    .post([''], [], [], replyTo, [], 'deletion')
    .catch(
      /** @param {Error} err */ err => {
        if (onError) {
          onError(err);
        } else {
          console.error('Failed to delete:', err);
        }
      },
    );
harden(postDeletion);

/**
 * Post a move (reorder and/or reparent) of a committed node. `newParent` of
 * `undefined` means "leave the parent unchanged" (a pure reorder); pass a string
 * key (or `''` for root) to reparent.
 * Extracted from outliner-component.js:1040-1062 / 1957 / 2027.
 *
 * @param {object} args
 * @param {unknown} args.channel
 * @param {string} args.replyTo - Target message number (as string).
 * @param {number} args.sortOrder - New effective sort order.
 * @param {string | undefined} args.newParent - New parent key, `''` for root,
 *   or `undefined` to omit reparenting from the move message.
 * @returns {Promise<unknown>}
 */
export const postMove = ({ channel, replyTo, sortOrder, newParent }) => {
  const moveStrings = [String(sortOrder)];
  if (newParent !== undefined) {
    moveStrings.push(newParent);
  }
  return E(/** @type {ChannelRef} */ (channel))
    .post(moveStrings, [], [], replyTo, [], 'move')
    .catch(
      /** @param {Error} err */ err => {
        console.error('Failed to post move:', err);
      },
    );
};
harden(postMove);

/**
 * Create the in-memory draft store. The store owns the `drafts` map and a
 * monotonic counter; DOM bookkeeping (`draftEls`) stays in the controller.
 * Extracted from the draft-map operations scattered across
 * outliner-component.js (createDraft :2463 map ops, removeDraft :1164,
 * matchPendingDraft :2611).
 *
 * @returns {DraftStore}
 */
export const makeDraftStore = () => {
  /** @type {Map<string, DraftNode>} */
  const drafts = new Map();
  let draftCounter = 0;

  /**
   * Allocate a new draft and register it. Returns the new draft (and its id via
   * `draft.draftId`).
   *
   * @param {string | undefined} parentKey
   * @param {string} [afterKey]
   * @param {string} [beforeKey]
   * @returns {DraftNode}
   */
  const createDraft = (parentKey, afterKey, beforeKey) => {
    draftCounter += 1;
    const draftId = `draft-${draftCounter}`;
    /** @type {DraftNode} */
    const draft = {
      draftId,
      text: '',
      parentKey,
      afterKey,
      beforeKey,
      replyType: undefined,
    };
    drafts.set(draftId, draft);
    return draft;
  };

  /**
   * @param {string} draftId
   * @returns {DraftNode | undefined}
   */
  const getDraft = draftId => drafts.get(draftId);

  /**
   * @param {string} draftId
   */
  const removeDraft = draftId => {
    drafts.delete(draftId);
  };

  /**
   * Find a pending draft that an arriving message matches: same parent and same
   * trimmed text. Returns the draft id, or `undefined` when none matches. The
   * caller (controller) checks the pending flag and removes the draft.
   * Extracted from outliner-component.js:2611.
   *
   * @param {{ replyTo?: string, strings: string[] }} message
   * @param {(draft: DraftNode) => boolean} isPending - Predicate the controller
   *   supplies to test whether a draft is in the "pending" (posted) state, which
   *   lives in the controller's DOM bookkeeping.
   * @returns {string | undefined}
   */
  const matchPendingDraft = (message, isPending) => {
    const msgText = message.strings.join('').trim();
    for (const [draftId, draft] of drafts) {
      if (
        isPending(draft) &&
        (draft.parentKey || undefined) === (message.replyTo || undefined) &&
        draft.text === msgText
      ) {
        return draftId;
      }
    }
    return undefined;
  };

  return harden({
    drafts,
    createDraft,
    getDraft,
    removeDraft,
    matchPendingDraft,
  });
};
harden(makeDraftStore);

/**
 * @typedef {object} DraftStore
 * @property {Map<string, DraftNode>} drafts
 * @property {(parentKey: string | undefined, afterKey?: string, beforeKey?: string) => DraftNode} createDraft
 * @property {(draftId: string) => DraftNode | undefined} getDraft
 * @property {(draftId: string) => void} removeDraft
 * @property {(message: { replyTo?: string, strings: string[] }, isPending: (draft: DraftNode) => boolean) => string | undefined} matchPendingDraft
 */
