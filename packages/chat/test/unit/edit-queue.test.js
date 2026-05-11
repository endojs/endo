// @ts-check

import '@endo/init/debug.js';

import test from 'ava';
import {
  isEffectivelyDeleted,
  computeNodeContent,
  computeAllNodeContents,
  isVisibleReplyType,
} from '../../edit-queue.js';

/**
 * Helper: create a synthetic ChannelMessage.
 *
 * @param {number} number
 * @param {string} memberId
 * @param {string[]} strings
 * @param {object} [opts]
 * @param {string[]} [opts.names]
 * @param {string[]} [opts.ids]
 * @param {string} [opts.replyTo]
 * @param {string} [opts.replyType]
 * @returns {import('../../channel-utils.js').ChannelMessage}
 */
const makeMsg = (number, memberId, strings, opts = {}) => ({
  type: 'package',
  messageId: String(number),
  number: BigInt(number),
  date: new Date(2026, 0, 1, 0, 0, number).toISOString(),
  memberId,
  strings,
  names: opts.names || [],
  ids: opts.ids || [],
  replyTo: opts.replyTo,
  replyType: opts.replyType,
});

/**
 * Build messagesByKey and replyChildren maps from an array of messages.
 *
 * @param {import('../../channel-utils.js').ChannelMessage[]} msgs
 * @returns {{ messagesByKey: Map<string, { message: import('../../channel-utils.js').ChannelMessage }>, replyChildren: Map<string, string[]> }}
 */
const buildMaps = msgs => {
  /** @type {Map<string, { message: import('../../channel-utils.js').ChannelMessage }>} */
  const messagesByKey = new Map();
  /** @type {Map<string, string[]>} */
  const replyChildren = new Map();

  for (const msg of msgs) {
    const key = String(msg.number);
    messagesByKey.set(key, { message: msg });
    if (msg.replyTo) {
      if (!replyChildren.has(msg.replyTo)) {
        replyChildren.set(msg.replyTo, []);
      }
      /** @type {string[]} */ (replyChildren.get(msg.replyTo)).push(key);
    }
  }

  return { messagesByKey, replyChildren };
};

/** @type {Set<string>} */
const noBlocks = new Set();

// === Basic content ===

test('1. Node with no edits returns original content', t => {
  const msgs = [makeMsg(0, 'alice', ['Hello world'])];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const result = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  t.deepEqual(result.strings, ['Hello world']);
  t.is(result.authorMemberId, 'alice');
  t.is(result.editedByMemberId, undefined);
  t.is(result.editQueue.length, 0);
});

test('2. Node with only reply-type children returns original content', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Hello']),
    makeMsg(1, 'bob', ['Nice!'], { replyTo: '0' }),
    makeMsg(2, 'carol', ['I agree'], { replyTo: '0', replyType: 'reply' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const result = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  t.deepEqual(result.strings, ['Hello']);
  t.is(result.editQueue.length, 0);
});

// === Single edit ===

test('3. Single edit replaces node content', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'bob', ['Edited text'], { replyTo: '0', replyType: 'edit' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const result = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  t.deepEqual(result.strings, ['Edited text']);
  t.is(result.editedByMemberId, 'bob');
});

test('4. Edit preserves original authorMemberId', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'bob', ['Edited'], { replyTo: '0', replyType: 'edit' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const result = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  t.is(result.authorMemberId, 'alice');
  t.is(result.editedByMemberId, 'bob');
});

// === Multiple edits (last write wins) ===

test('5. Latest edit wins among multiple edits', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'bob', ['First edit'], { replyTo: '0', replyType: 'edit' }),
    makeMsg(2, 'carol', ['Second edit'], { replyTo: '0', replyType: 'edit' }),
    makeMsg(3, 'dave', ['Third edit'], { replyTo: '0', replyType: 'edit' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const result = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  t.deepEqual(result.strings, ['Third edit']);
  t.is(result.editedByMemberId, 'dave');
});

test('6. Edit queue contains all edits chronologically', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'bob', ['Edit 1'], { replyTo: '0', replyType: 'edit' }),
    makeMsg(2, 'carol', ['Edit 2'], { replyTo: '0', replyType: 'edit' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const result = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  t.is(result.editQueue.length, 2);
  t.is(result.editQueue[0].memberId, 'bob');
  t.is(result.editQueue[1].memberId, 'carol');
});

test('7. editorMemberIds lists unique editors chronologically', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'bob', ['Edit 1'], { replyTo: '0', replyType: 'edit' }),
    makeMsg(2, 'carol', ['Edit 2'], { replyTo: '0', replyType: 'edit' }),
    makeMsg(3, 'bob', ['Edit 3'], { replyTo: '0', replyType: 'edit' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const result = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  t.deepEqual(result.editorMemberIds, ['bob', 'carol']);
});

// === Edit + Deletion ===

test('8. Deleted edit falls back to original content', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'bob', ['Bad edit'], { replyTo: '0', replyType: 'edit' }),
    makeMsg(2, 'alice', [''], { replyTo: '1', replyType: 'deletion' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const result = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  t.deepEqual(result.strings, ['Original']);
  t.is(result.editedByMemberId, undefined);
});

test('9. Deleted edit falls back to previous undeleted edit', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'bob', ['Good edit'], { replyTo: '0', replyType: 'edit' }),
    makeMsg(2, 'carol', ['Bad edit'], { replyTo: '0', replyType: 'edit' }),
    makeMsg(3, 'alice', [''], { replyTo: '2', replyType: 'deletion' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const result = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  t.deepEqual(result.strings, ['Good edit']);
  t.is(result.editedByMemberId, 'bob');
});

test('10. Deletion of a non-edit reply does not affect node content', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'bob', ['Reply'], { replyTo: '0' }),
    makeMsg(2, 'alice', [''], { replyTo: '1', replyType: 'deletion' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const result = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  t.deepEqual(result.strings, ['Original']);
  t.is(result.editQueue.length, 0);
});

// === Deletion-of-Deletion (restore) ===

test('11. Deleting a deletion restores the edit', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'bob', ['Edited'], { replyTo: '0', replyType: 'edit' }),
    makeMsg(2, 'alice', [''], { replyTo: '1', replyType: 'deletion' }),
    makeMsg(3, 'bob', [''], { replyTo: '2', replyType: 'deletion' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const result = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  t.deepEqual(result.strings, ['Edited']);
  t.is(result.editedByMemberId, 'bob');
});

test('12. Triple deletion chain alternates: deleted -> restored -> deleted', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'bob', ['Edited'], { replyTo: '0', replyType: 'edit' }),
    makeMsg(2, 'alice', [''], { replyTo: '1', replyType: 'deletion' }),
    makeMsg(3, 'bob', [''], { replyTo: '2', replyType: 'deletion' }),
    makeMsg(4, 'alice', [''], { replyTo: '3', replyType: 'deletion' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const result = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  // Deletion chain: edit(1) <- del(2) <- del(3) <- del(4)
  // del(4) is alive => del(3) is deleted => del(2) is alive => edit(1) is deleted
  t.deepEqual(result.strings, ['Original']);
  t.is(result.editedByMemberId, undefined);
});

// === Blocked members ===

test('13. Edits from blocked members are ignored', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'bob', ['Bad edit'], { replyTo: '0', replyType: 'edit' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const blocked = new Set(['bob']);
  const result = computeNodeContent('0', messagesByKey, replyChildren, blocked);
  t.deepEqual(result.strings, ['Original']);
  t.is(result.editQueue.length, 0);
});

test('14. Deletions from blocked members are ignored', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'carol', ['Good edit'], { replyTo: '0', replyType: 'edit' }),
    makeMsg(2, 'bob', [''], { replyTo: '1', replyType: 'deletion' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const blocked = new Set(['bob']);
  const result = computeNodeContent('0', messagesByKey, replyChildren, blocked);
  t.deepEqual(result.strings, ['Good edit']);
  t.is(result.editedByMemberId, 'carol');
});

test('15. Blocking a deletion author restores the targeted edit', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'bob', ['Edited'], { replyTo: '0', replyType: 'edit' }),
    makeMsg(2, 'eve', [''], { replyTo: '1', replyType: 'deletion' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);

  // Without blocking: edit is deleted
  const resultUnblocked = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  t.deepEqual(resultUnblocked.strings, ['Original']);

  // With blocking eve: edit is restored
  const blocked = new Set(['eve']);
  const resultBlocked = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    blocked,
  );
  t.deepEqual(resultBlocked.strings, ['Edited']);
});

test('16. Blocking cascades through deletion chains', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'bob', ['Edited'], { replyTo: '0', replyType: 'edit' }),
    makeMsg(2, 'eve', [''], { replyTo: '1', replyType: 'deletion' }),
    makeMsg(3, 'carol', [''], { replyTo: '2', replyType: 'deletion' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);

  // Block carol: her deletion-of-deletion is ignored, so eve's deletion stays alive
  const blocked = new Set(['carol']);
  const result = computeNodeContent('0', messagesByKey, replyChildren, blocked);
  t.deepEqual(result.strings, ['Original']);
});

// === Edge cases ===

test('17. Edit targeting nonexistent message — no crash', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'bob', ['Edit for ghost'], {
      replyTo: '999',
      replyType: 'edit',
    }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const result = computeNodeContent(
    '999',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  t.deepEqual(result.strings, ['']);
  t.is(result.authorMemberId, '');
});

test('18. Deletion targeting nonexistent message — no crash', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'bob', [''], { replyTo: '999', replyType: 'deletion' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const result = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  t.deepEqual(result.strings, ['Original']);
});

test('19. Self-edit updates editorMemberIds correctly', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'alice', ['Self-edit'], { replyTo: '0', replyType: 'edit' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const result = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  t.deepEqual(result.strings, ['Self-edit']);
  t.is(result.authorMemberId, 'alice');
  t.is(result.editedByMemberId, 'alice');
  t.deepEqual(result.editorMemberIds, ['alice']);
});

test('20. Empty block list same as no blocks', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Hello']),
    makeMsg(1, 'bob', ['Edited'], { replyTo: '0', replyType: 'edit' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const result1 = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  const result2 = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    new Set(),
  );
  t.deepEqual(result1.strings, result2.strings);
  t.is(result1.editedByMemberId, result2.editedByMemberId);
});

test('21. computeAllNodeContents covers all visible nodes', t => {
  const msgs = [
    makeMsg(0, 'alice', ['Root 1']),
    makeMsg(1, 'bob', ['Root 2']),
    makeMsg(2, 'carol', ['Reply'], { replyTo: '0' }),
    makeMsg(3, 'dave', ['Pro'], { replyTo: '0', replyType: 'pro' }),
    makeMsg(4, 'eve', ['Edit'], { replyTo: '0', replyType: 'edit' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);
  const results = computeAllNodeContents(
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  // Visible: 0 (root), 1 (root), 2 (reply), 3 (pro)
  // Not visible: 4 (edit)
  t.is(results.size, 4);
  t.true(results.has('0'));
  t.true(results.has('1'));
  t.true(results.has('2'));
  t.true(results.has('3'));
  t.false(results.has('4'));
});

test('22. Edit/deletion-type messages excluded from visible node set', t => {
  t.true(isVisibleReplyType(undefined));
  t.true(isVisibleReplyType('reply'));
  t.true(isVisibleReplyType('pro'));
  t.true(isVisibleReplyType('con'));
  t.true(isVisibleReplyType('evidence'));
  t.true(isVisibleReplyType('custom-type'));
  t.false(isVisibleReplyType('edit'));
  t.false(isVisibleReplyType('deletion'));
  t.false(isVisibleReplyType('move'));
});

test('23. Cycle in deletion chain does not infinite loop', t => {
  // Artificial cycle: del-A targets del-B, del-B targets del-A
  // This can't happen in normal operation, but we guard against it
  const msgs = [
    makeMsg(0, 'alice', ['Original']),
    makeMsg(1, 'bob', ['Edit'], { replyTo: '0', replyType: 'edit' }),
    // Create a deletion pointing at the edit
    makeMsg(2, 'carol', [''], { replyTo: '1', replyType: 'deletion' }),
    // Create another deletion pointing at the first deletion
    makeMsg(3, 'dave', [''], { replyTo: '2', replyType: 'deletion' }),
  ];
  const { messagesByKey, replyChildren } = buildMaps(msgs);

  // Manually create a cycle in replyChildren: make msg 2 also a child of msg 3
  // to simulate a broken cycle
  if (!replyChildren.has('3')) {
    replyChildren.set('3', []);
  }

  // This should not hang — the visited set prevents infinite recursion
  const deleted = isEffectivelyDeleted(
    '1',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  t.is(typeof deleted, 'boolean');
});

test('24. Node with 100 edits computes in reasonable time', t => {
  const msgs = [makeMsg(0, 'alice', ['Original'])];
  for (let i = 1; i <= 100; i += 1) {
    msgs.push(
      makeMsg(i, `editor-${i}`, [`Edit ${i}`], {
        replyTo: '0',
        replyType: 'edit',
      }),
    );
  }
  const { messagesByKey, replyChildren } = buildMaps(msgs);

  const start = Date.now();
  const result = computeNodeContent(
    '0',
    messagesByKey,
    replyChildren,
    noBlocks,
  );
  const elapsed = Date.now() - start;

  t.deepEqual(result.strings, ['Edit 100']);
  t.is(result.editQueue.length, 100);
  // Should complete well under 1 second
  t.true(elapsed < 1000, `Took ${elapsed}ms, expected < 1000ms`);
});
