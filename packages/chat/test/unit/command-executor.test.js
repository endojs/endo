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
  // Cast via unknown to satisfy type checker since mock doesn't implement full interface
  /** @type {Array<{method: string, args: unknown[]}>} */
  const calls = [];
  /** @type {unknown[]} */
  const showValueCalls = [];
  /** @type {string[]} */
  const showMessageCalls = [];
  /** @type {Error[]} */
  const showErrorCalls = [];

  const powers = Far('MockPowers', {
    request: async (recipientPath, description, resultPath) => {
      calls.push({
        method: 'request',
        args: [recipientPath, description, resultPath],
      });
    },
    dismiss: async number => {
      calls.push({ method: 'dismiss', args: [number] });
    },
    dismissAll: async () => {
      calls.push({ method: 'dismissAll', args: [] });
    },
    adopt: async (number, edgeName, petName) => {
      calls.push({ method: 'adopt', args: [number, edgeName, petName] });
    },
    resolve: async (number, petName) => {
      calls.push({ method: 'resolve', args: [number, petName] });
    },
    reject: async (number, reason) => {
      calls.push({ method: 'reject', args: [number, reason] });
    },
    grantEvaluate: async number => {
      calls.push({ method: 'grantEvaluate', args: [number] });
    },
    evaluate: async (
      workerName,
      source,
      codeNames,
      petNamePaths,
      resultPath,
    ) => {
      calls.push({
        method: 'evaluate',
        args: [workerName, source, codeNames, petNamePaths, resultPath],
      });
      return 'eval-result';
    },
    list: async (...pathParts) => {
      calls.push({ method: 'list', args: pathParts });
      return ['item1', 'item2'];
    },
    lookup: async (...pathParts) => {
      calls.push({ method: 'lookup', args: pathParts });
      return { looked: 'up' };
    },
    identify: async (...pathParts) => {
      calls.push({ method: 'identify', args: pathParts });
      return 'id:test';
    },
    remove: async (...pathParts) => {
      calls.push({ method: 'remove', args: pathParts });
    },
    move: async (fromPath, toPath) => {
      calls.push({ method: 'move', args: [fromPath, toPath] });
    },
    copy: async (fromPath, toPath) => {
      calls.push({ method: 'copy', args: [fromPath, toPath] });
    },
    makeDirectory: async (...pathParts) => {
      calls.push({ method: 'makeDirectory', args: pathParts });
    },
    invite: async guestName => {
      calls.push({ method: 'invite', args: [guestName] });
      return Far('MockInvitation', {
        locate: async () => 'endo://invitation',
      });
    },
    accept: async (locator, guestName) => {
      calls.push({ method: 'accept', args: [locator, guestName] });
    },
    provideWorker: async pathParts => {
      calls.push({ method: 'provideWorker', args: [pathParts] });
    },
    provideHost: async (handleName, options) => {
      calls.push({ method: 'provideHost', args: [handleName, options] });
    },
    provideGuest: async (handleName, options) => {
      calls.push({ method: 'provideGuest', args: [handleName, options] });
    },
    cancel: async (pathParts, error) => {
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

test('execute request command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('request', {
    recipient: 'alice',
    description: 'Please send file',
    resultName: 'the-file',
  });

  t.true(result.success);
  t.is(result.message, 'Request sent');
  t.is(ctx.calls.length, 1);
  t.is(ctx.calls[0].method, 'request');
  t.deepEqual(ctx.calls[0].args, [['alice'], 'Please send file', ['the-file']]);
});

test('execute dismiss command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('dismiss', { messageNumber: 42 });

  t.true(result.success);
  t.is(result.message, 'Message #42 dismissed');
  t.is(ctx.calls[0].method, 'dismiss');
  t.deepEqual(ctx.calls[0].args, [42n]);
});

test('execute dismiss-all command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('dismiss-all', {});

  t.true(result.success);
  t.is(result.message, 'All messages dismissed');
  t.is(ctx.calls[0].method, 'dismissAll');
  t.deepEqual(ctx.calls[0].args, []);
});

test('execute adopt command with explicit pet name', async t => {
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
  t.is(result.message, 'Adopted as "my-file"');
  t.deepEqual(ctx.calls[0].args, [5n, 'attachment', ['my-file']]);
});

test('execute adopt command uses edge name as default pet name', async t => {
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
  });

  t.true(result.success);
  t.is(result.message, 'Adopted as "attachment"');
  t.deepEqual(ctx.calls[0].args, [5n, 'attachment', ['attachment']]);
});

test('execute resolve command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('resolve', {
    messageNumber: 10,
    petName: 'answer',
  });

  t.true(result.success);
  t.is(result.message, 'Request #10 resolved');
  t.deepEqual(ctx.calls[0].args, [10n, 'answer']);
});

test('execute reject command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('reject', {
    messageNumber: 10,
    reason: 'Not available',
  });

  t.true(result.success);
  t.is(result.message, 'Request #10 rejected');
  t.deepEqual(ctx.calls[0].args, [10n, 'Not available']);
});

test('execute grant command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('grant', { messageNumber: 7 });

  t.true(result.success);
  t.is(result.message, 'Eval-proposal #7 granted');
  t.is(ctx.calls[0].method, 'grantEvaluate');
});

test('execute allow command (alias for grant)', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('allow', { messageNumber: 7 });

  t.true(result.success);
  t.is(ctx.calls[0].method, 'grantEvaluate');
});

test('execute js command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('js', {
    source: '1 + 1',
    endowments: [{ codeName: 'x', petName: 'my-value' }],
    resultName: 'answer',
    workerName: 'MAIN',
  });

  t.true(result.success);
  t.is(result.message, 'Result saved as "answer"');
  t.is(result.value, 'eval-result');
  t.deepEqual(ctx.calls[0].args, [
    'MAIN',
    '1 + 1',
    ['x'],
    [['my-value']],
    ['answer'],
  ]);
});

test('execute eval command (alias for js)', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('eval', { source: '2 + 2' });

  t.true(result.success);
  t.is(result.value, 'eval-result');
  t.is(ctx.calls[0].method, 'evaluate');
});

test('execute list command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('list', { path: 'my.dir' });

  t.true(result.success);
  t.deepEqual(result.value, ['item1', 'item2']);
  t.deepEqual(ctx.calls[0].args, ['my', 'dir']);
  t.is(ctx.showValueCalls.length, 1);
});

test('execute ls command (alias for list)', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('ls', {});

  t.true(result.success);
  t.is(ctx.calls[0].method, 'list');
});

test('execute show command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('show', { petName: 'my.value' });

  t.true(result.success);
  t.deepEqual(result.value, { looked: 'up' });
  t.deepEqual(ctx.calls[0].args, [['my', 'value']]);
  t.is(ctx.showValueCalls.length, 1);
});

test('execute remove command with single name', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('remove', { petNames: ['old-name'] });

  t.true(result.success);
  t.is(result.message, '"old-name" removed');
});

test('execute remove command with multiple names', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('remove', {
    petNames: ['a', 'b', 'c'],
  });

  t.true(result.success);
  t.true(result.message?.includes('Removed 3 names'));
  t.is(ctx.calls.length, 3);
});

test('execute rm command (alias for remove)', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('rm', { petNames: ['test'] });

  t.true(result.success);
  t.is(ctx.calls[0].method, 'remove');
});

test('execute move command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('move', {
    fromName: 'old.path',
    toName: 'new.path',
  });

  t.true(result.success);
  t.is(result.message, '"old.path" moved to "new.path"');
  t.deepEqual(ctx.calls[0].args, [
    ['old', 'path'],
    ['new', 'path'],
  ]);
});

test('execute copy command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('copy', {
    fromName: 'source',
    toName: 'dest',
  });

  t.true(result.success);
  t.is(result.message, '"source" copied to "dest"');
});

test('execute mkdir command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('mkdir', { petName: 'new-dir' });

  t.true(result.success);
  t.is(result.message, 'Directory "new-dir" created');
});

test('execute invite command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('invite', { guestName: 'friend' });

  t.true(result.success);
  t.is(result.value, 'endo://invitation');
  t.true(result.message?.includes('friend'));
});

test('execute accept command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('accept', {
    locator: 'endo://abc123',
    guestName: 'new-friend',
  });

  t.true(result.success);
  t.true(result.message?.includes('new-friend'));
});

test('execute spawn command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('spawn', { workerName: 'worker1' });

  t.true(result.success);
  t.is(result.message, 'Worker "worker1" spawned');
});

test('execute mkhost command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('mkhost', {
    handleName: 'SELF',
    agentName: 'new-host',
  });

  t.true(result.success);
  t.is(result.message, 'Host "new-host" created');
});

test('execute mkguest command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('mkguest', {
    handleName: 'HOST',
    agentName: 'new-guest',
  });

  t.true(result.success);
  t.is(result.message, 'Guest "new-guest" created');
});

test('execute cancel command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('cancel', {
    petName: 'broken',
    reason: 'No longer needed',
  });

  t.true(result.success);
  t.is(result.message, '"broken" cancelled');
  const cancelCall = ctx.calls.find(c => c.method === 'cancel');
  t.truthy(cancelCall);
  if (!cancelCall) {
    t.fail('Expected cancel call');
    return;
  }
  t.deepEqual(cancelCall.args[0], ['broken']);
  t.is(/** @type {Error} */ (cancelCall.args[1]).message, 'No longer needed');
});

test('execute unknown command returns error', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('nonexistent', {});

  t.false(result.success);
  t.truthy(result.error);
  t.true(result.error?.message.includes('Unknown command'));
  t.is(ctx.showErrorCalls.length, 1);
});

test('execute handles power errors', async t => {
  const failingPowers = Far('FailingPowers', {
    dismiss: async () => {
      throw new Error('Permission denied');
    },
  });

  /** @type {Error[]} */
  const errors = [];

  const executor = createCommandExecutor({
    powers: /** @type {ERef<EndoHost>} */ (
      /** @type {unknown} */ (failingPowers)
    ),
    showValue: () => {},
    showMessage: () => {},
    showError: e => errors.push(e),
  });

  const result = await executor.execute('dismiss', { messageNumber: 1 });

  t.false(result.success);
  t.is(result.error?.message, 'Permission denied');
  t.is(errors.length, 1);
  t.is(errors[0].message, 'Permission denied');
});

test('execute handles dot-path splitting', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  await executor.execute('show', { petName: 'a.b.c.d' });

  t.deepEqual(ctx.calls[0].args, [['a', 'b', 'c', 'd']]);
});
