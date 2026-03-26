// @ts-check

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/far';
import { createCommandExecutor } from '../../command-executor.js';

/**
 * Create a mock powers object that tracks calls.
 * @returns {{ powers: ERef<EndoHost>, calls: Array<{method: string, args: unknown[]}>, showValueCalls: unknown[], showMessageCalls: string[], showErrorCalls: Error[] }}
 */
const createMockContext = () => {
  /** @type {Array<{method: string, args: unknown[]}>} */
  const calls = [];
  /** @type {unknown[]} */
  const showValueCalls = [];
  /** @type {string[]} */
  const showMessageCalls = [];
  /** @type {Error[]} */
  const showErrorCalls = [];

  const powers = Far('MockPowers', {
    adopt: async (
      /** @type {bigint} */ number,
      /** @type {string} */ edgeName,
      /** @type {string[]} */ petName,
    ) => {
      calls.push({ method: 'adopt', args: [number, edgeName, petName] });
    },
    reply: async (
      /** @type {bigint} */ number,
      /** @type {string[]} */ strings,
      /** @type {string[]} */ edgeNames,
      /** @type {string[]} */ petNames,
    ) => {
      calls.push({
        method: 'reply',
        args: [number, strings, edgeNames, petNames],
      });
    },
    write: async (
      /** @type {string[]} */ targetNamePath,
      /** @type {string} */ formulaId,
    ) => {
      calls.push({ method: 'write', args: [targetNamePath, formulaId] });
    },
    identify: async (/** @type {string} */ ...path) => {
      calls.push({ method: 'identify', args: path });
      return `id:${path.join('/')}`;
    },
    list: async (/** @type {string} */ ...pathParts) => {
      calls.push({ method: 'list', args: pathParts });
      return ['item1', 'item2'];
    },
    lookup: async (
      /** @type {string | string[]} */ pathOrFirst,
      /** @type {string} */ ...rest
    ) => {
      const args = Array.isArray(pathOrFirst)
        ? pathOrFirst
        : [pathOrFirst, ...rest];
      calls.push({ method: 'lookup', args: [args] });
      return { looked: 'up' };
    },
    remove: async (/** @type {string} */ ...pathParts) => {
      calls.push({ method: 'remove', args: pathParts });
    },
    move: async (
      /** @type {string[]} */ fromPath,
      /** @type {string[]} */ toPath,
    ) => {
      calls.push({ method: 'move', args: [fromPath, toPath] });
    },
    copy: async (
      /** @type {string[]} */ fromPath,
      /** @type {string[]} */ toPath,
    ) => {
      calls.push({ method: 'copy', args: [fromPath, toPath] });
    },
    makeDirectory: async (/** @type {string[]} */ ...pathParts) => {
      calls.push({ method: 'makeDirectory', args: pathParts });
    },
    evaluate: async (
      /** @type {string} */ workerName,
      /** @type {string} */ source,
      /** @type {string[]} */ codeNames,
      /** @type {string[][]} */ petNamePaths,
      /** @type {string[] | undefined} */ resultPath,
    ) => {
      calls.push({
        method: 'evaluate',
        args: [workerName, source, codeNames, petNamePaths, resultPath],
      });
      return 'eval-result';
    },
    invite: async (/** @type {string} */ guestName) => {
      calls.push({ method: 'invite', args: [guestName] });
      return Far('MockInvitation', {
        locate: async () => 'endo://invitation',
      });
    },
    accept: async (
      /** @type {string} */ locator,
      /** @type {string} */ guestName,
    ) => {
      calls.push({ method: 'accept', args: [locator, guestName] });
    },
    provideWorker: async (/** @type {string[]} */ pathParts) => {
      calls.push({ method: 'provideWorker', args: [pathParts] });
    },
    provideHost: async (
      /** @type {string} */ handleName,
      /** @type {object} */ options,
    ) => {
      calls.push({ method: 'provideHost', args: [handleName, options] });
    },
    provideGuest: async (
      /** @type {string} */ handleName,
      /** @type {object} */ options,
    ) => {
      calls.push({ method: 'provideGuest', args: [handleName, options] });
    },
    cancel: async (
      /** @type {string[]} */ pathParts,
      /** @type {Error} */ error,
    ) => {
      calls.push({ method: 'cancel', args: [pathParts, error] });
    },
  });

  const typedPowers = /** @type {ERef<EndoHost>} */ (
    /** @type {unknown} */ (powers)
  );

  return {
    powers: typedPowers,
    calls,
    showValueCalls,
    showMessageCalls,
    showErrorCalls,
  };
};

/**
 * Create a mock channel ref with configurable messages.
 * @param {Array<{ number: bigint, names?: string[], edgeNames?: string[], ids?: string[] }>} messages
 * @returns {{ channelRef: unknown, calls: Array<{method: string, args: unknown[]}> }}
 */
const createMockChannelRef = (messages = []) => {
  /** @type {Array<{method: string, args: unknown[]}>} */
  const calls = [];

  const channelRef = Far('MockChannel', {
    listMessages: async () => {
      calls.push({ method: 'listMessages', args: [] });
      return messages;
    },
    post: async (
      /** @type {string[]} */ strings,
      /** @type {string[]} */ edgeNames,
      /** @type {string[]} */ petNames,
      /** @type {string} */ replyTo,
      /** @type {string[]} */ resolvedIds,
    ) => {
      calls.push({
        method: 'post',
        args: [strings, edgeNames, petNames, replyTo, resolvedIds],
      });
    },
  });

  return { channelRef, calls };
};

// ============ CHANNEL-MODE ADOPT TESTS ============

test('adopt in channel mode writes formula ID from channel message', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef([
    {
      number: 5n,
      names: ['my-attachment'],
      ids: ['formula:abc123'],
    },
  ]);

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('adopt', {
    messageNumber: 5,
    edgeName: 'my-attachment',
    petName: 'saved-file',
  });

  t.true(result.success);
  t.is(result.message, 'Adopted as "saved-file"');

  // Should call powers.write with the formula ID, not powers.adopt
  const writeCall = ctx.calls.find(c => c.method === 'write');
  t.truthy(writeCall);
  t.deepEqual(writeCall?.args, [['saved-file'], 'formula:abc123']);

  // Should NOT call powers.adopt (inbox-mode path)
  const adoptCall = ctx.calls.find(c => c.method === 'adopt');
  t.falsy(adoptCall);
});

test('adopt in channel mode uses edge name as default pet name', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef([
    {
      number: 3n,
      names: ['data-file'],
      ids: ['formula:def456'],
    },
  ]);

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('adopt', {
    messageNumber: 3,
    edgeName: 'data-file',
  });

  t.true(result.success);
  t.is(result.message, 'Adopted as "data-file"');

  const writeCall = ctx.calls.find(c => c.method === 'write');
  t.deepEqual(writeCall?.args, [['data-file'], 'formula:def456']);
});

test('adopt in channel mode supports edgeNames field name', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef([
    {
      number: 7n,
      edgeNames: ['alt-attachment'],
      ids: ['formula:ghi789'],
    },
  ]);

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('adopt', {
    messageNumber: 7,
    edgeName: 'alt-attachment',
    petName: 'my-copy',
  });

  t.true(result.success);
  const writeCall = ctx.calls.find(c => c.method === 'write');
  t.deepEqual(writeCall?.args, [['my-copy'], 'formula:ghi789']);
});

test('adopt in channel mode fails when message not found', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef([
    { number: 1n, names: ['x'], ids: ['id:x'] },
  ]);

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('adopt', {
    messageNumber: 99,
    edgeName: 'x',
  });

  t.false(result.success);
  t.truthy(result.error);
  t.true(result.error?.message.includes('Channel message #99 not found'));
  t.is(ctx.showErrorCalls.length, 1);
});

test('adopt in channel mode fails when edge name not found in message', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef([
    { number: 5n, names: ['real-edge'], ids: ['id:real'] },
  ]);

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('adopt', {
    messageNumber: 5,
    edgeName: 'nonexistent-edge',
  });

  t.false(result.success);
  t.true(result.error?.message.includes('No edge named "nonexistent-edge"'));
});

test('adopt in channel mode fails when formula ID is missing', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef([
    { number: 5n, names: ['edge-without-id'], ids: [] },
  ]);

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('adopt', {
    messageNumber: 5,
    edgeName: 'edge-without-id',
  });

  t.false(result.success);
  t.true(result.error?.message.includes('No formula ID'));
});

test('adopt in channel mode with slash-path pet name', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef([
    { number: 2n, names: ['doc'], ids: ['formula:doc1'] },
  ]);

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('adopt', {
    messageNumber: 2,
    edgeName: 'doc',
    petName: 'my/docs/file',
  });

  t.true(result.success);
  const writeCall = ctx.calls.find(c => c.method === 'write');
  t.deepEqual(writeCall?.args, [['my', 'docs', 'file'], 'formula:doc1']);
});

test('adopt with getChannelRef returning null falls back to inbox mode', async t => {
  const ctx = createMockContext();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => null,
  });

  const result = await executor.execute('adopt', {
    messageNumber: 5,
    edgeName: 'attachment',
    petName: 'my-file',
  });

  t.true(result.success);
  // Should use inbox-mode adopt, not channel-mode write
  const adoptCall = ctx.calls.find(c => c.method === 'adopt');
  t.truthy(adoptCall);
  t.deepEqual(adoptCall?.args, [5n, 'attachment', ['my-file']]);
});

test('adopt without getChannelRef uses inbox mode', async t => {
  const ctx = createMockContext();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('adopt', {
    messageNumber: 5,
    edgeName: 'attachment',
    petName: 'my-file',
  });

  t.true(result.success);
  const adoptCall = ctx.calls.find(c => c.method === 'adopt');
  t.truthy(adoptCall);
});

// ============ CHANNEL-MODE REPLY TESTS ============

test('reply in channel mode posts to channel with resolved IDs', async t => {
  const ctx = createMockContext();
  const { channelRef, calls: channelCalls } = createMockChannelRef();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('reply', {
    messageNumber: 10,
    message: {
      strings: ['Hello ', ' how are you?'],
      edgeNames: ['alice'],
      petNames: ['alice'],
    },
  });

  t.true(result.success);
  t.is(result.message, 'Reply sent to channel message #10');

  // Should call channel.post
  const postCall = channelCalls.find(c => c.method === 'post');
  t.truthy(postCall);
  t.deepEqual(postCall?.args, [
    ['Hello ', ' how are you?'],
    ['alice'],
    ['alice'],
    '10',
    ['id:alice'],
  ]);

  // Should NOT call powers.reply
  const replyCall = ctx.calls.find(c => c.method === 'reply');
  t.falsy(replyCall);
});

test('reply in channel mode resolves slash-path pet names', async t => {
  const ctx = createMockContext();
  const { channelRef, calls: channelCalls } = createMockChannelRef();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  await executor.execute('reply', {
    messageNumber: 3,
    message: {
      strings: ['Check out ', ''],
      edgeNames: ['my-doc'],
      petNames: ['docs/shared/readme'],
    },
  });

  // Should resolve the slash-path via powers.identify
  const identifyCall = ctx.calls.find(c => c.method === 'identify');
  t.truthy(identifyCall);
  t.deepEqual(identifyCall?.args, ['docs', 'shared', 'readme']);

  // Channel post should get the resolved ID
  const postCall = channelCalls.find(c => c.method === 'post');
  t.deepEqual(postCall?.args[4], ['id:docs/shared/readme']);
});

test('reply in channel mode with multiple references', async t => {
  const ctx = createMockContext();
  const { channelRef, calls: channelCalls } = createMockChannelRef();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  await executor.execute('reply', {
    messageNumber: 1,
    message: {
      strings: ['Compare ', ' with ', ''],
      edgeNames: ['file-a', 'file-b'],
      petNames: ['file-a', 'file-b'],
    },
  });

  // Should resolve both pet names
  const identifyCalls = ctx.calls.filter(c => c.method === 'identify');
  t.is(identifyCalls.length, 2);

  const postCall = channelCalls.find(c => c.method === 'post');
  t.deepEqual(postCall?.args[4], ['id:file-a', 'id:file-b']);
});

test('reply in channel mode with no references', async t => {
  const ctx = createMockContext();
  const { channelRef, calls: channelCalls } = createMockChannelRef();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  await executor.execute('reply', {
    messageNumber: 8,
    message: {
      strings: ['Just a plain text reply'],
      edgeNames: [],
      petNames: [],
    },
  });

  const postCall = channelCalls.find(c => c.method === 'post');
  t.truthy(postCall);
  t.deepEqual(postCall?.args[0], ['Just a plain text reply']);
  t.deepEqual(postCall?.args[4], []);
});

test('reply with getChannelRef returning null falls back to inbox mode', async t => {
  const ctx = createMockContext();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => null,
  });

  const result = await executor.execute('reply', {
    messageNumber: 10,
    message: {
      strings: ['Hello'],
      edgeNames: [],
      petNames: [],
    },
  });

  t.true(result.success);
  t.is(result.message, 'Reply sent to message #10');

  // Should use inbox-mode reply
  const replyCall = ctx.calls.find(c => c.method === 'reply');
  t.truthy(replyCall);
  t.deepEqual(replyCall?.args, [10n, ['Hello'], [], []]);
});

test('reply without getChannelRef uses inbox mode', async t => {
  const ctx = createMockContext();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('reply', {
    messageNumber: 10,
    message: {
      strings: ['Hello'],
      edgeNames: [],
      petNames: [],
    },
  });

  t.true(result.success);
  const replyCall = ctx.calls.find(c => c.method === 'reply');
  t.truthy(replyCall);
});

// ============ COMMANDS THAT WORK IN BOTH MODES ============

test('list command works in channel mode', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('list', {});

  t.true(result.success);
  t.deepEqual(result.value, ['item1', 'item2']);
  t.is(ctx.calls[0].method, 'list');
});

test('show command works in channel mode', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('show', { petName: 'my-value' });

  t.true(result.success);
  t.deepEqual(result.value, { looked: 'up' });
});

test('js command works in channel mode', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('js', {
    source: '1 + 1',
    endowments: [],
  });

  t.true(result.success);
  t.is(result.value, 'eval-result');
});

test('remove command works in channel mode', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('remove', {
    petNames: ['old-name'],
  });

  t.true(result.success);
  t.is(result.message, '"old-name" removed');
});

test('move command works in channel mode', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('move', {
    fromName: 'old',
    toName: 'new',
  });

  t.true(result.success);
  t.is(result.message, '"old" moved to "new"');
});

test('copy command works in channel mode', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('copy', {
    fromName: 'source',
    toName: 'dest',
  });

  t.true(result.success);
  t.is(result.message, '"source" copied to "dest"');
});

test('mkdir command works in channel mode', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('mkdir', { petName: 'new-dir' });

  t.true(result.success);
  t.is(result.message, 'Directory "new-dir" created');
});

test('invite command works in channel mode', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('invite', { guestName: 'friend' });

  t.true(result.success);
  t.is(result.value, 'endo://invitation');
});

test('spawn command works in channel mode', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('spawn', { workerName: 'worker1' });

  t.true(result.success);
  t.is(result.message, 'Worker "worker1" spawned');
});

test('cancel command works in channel mode', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef();

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('cancel', {
    petName: 'stale-process',
    reason: 'Done with it',
  });

  t.true(result.success);
  t.is(result.message, '"stale-process" cancelled');
});

// ============ CHANNEL-MODE ADOPT WITH MULTIPLE EDGES ============

test('adopt in channel mode picks the correct edge from multiple', async t => {
  const ctx = createMockContext();
  const { channelRef } = createMockChannelRef([
    {
      number: 10n,
      names: ['file-a', 'file-b', 'file-c'],
      ids: ['id:aaa', 'id:bbb', 'id:ccc'],
    },
  ]);

  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    getChannelRef: () => channelRef,
  });

  const result = await executor.execute('adopt', {
    messageNumber: 10,
    edgeName: 'file-b',
    petName: 'my-b',
  });

  t.true(result.success);
  const writeCall = ctx.calls.find(c => c.method === 'write');
  t.deepEqual(writeCall?.args, [['my-b'], 'id:bbb']);
});
