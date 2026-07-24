// @ts-check

/** @import { ERef } from '@endo/eventual-send' */
/** @import { EndoHost } from '@endo/daemon' */

import '@endo/init/debug.js';

import test from 'ava';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { createCommandExecutor } from '@endo/spaces-util/command-executor.js';

const MockTreeI = M.interface('MockTree', {
  list: M.call().returns(M.any()),
  lookup: M.call(M.string()).returns(M.any()),
});

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

  const powers = /** @type {ERef<EndoHost>} */ (
    /** @type {unknown} */ (
      makeExo(
        'MockPowers',
        M.interface('MockPowers', {}, { defaultGuards: 'passable' }),
        {
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
            return makeExo(
              'MockInvitation',
              M.interface('MockInvitation', {}, { defaultGuards: 'passable' }),
              {
                locate: async () => 'endo://invitation',
              },
            );
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
        },
      )
    )
  );

  return {
    powers,
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

test('execute clear command', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('clear', {});

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
    workerName: '@main',
  });

  t.true(result.success);
  t.is(result.message, 'Result saved as "answer"');
  t.is(result.value, 'eval-result');
  t.deepEqual(ctx.calls[0].args, [
    '@main',
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

  const result = await executor.execute('list', { path: 'my/dir' });

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

  const result = await executor.execute('show', { petName: 'my/value' });

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
    fromName: 'old/path',
    toName: 'new/path',
  });

  t.true(result.success);
  t.is(result.message, '"old/path" moved to "new/path"');
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

test('execute mktmp command calls provideScratchMount', async t => {
  /** @type {Array<{method: string, args: unknown[]}>} */
  const calls = [];

  const powers = /** @type {ERef<EndoHost>} */ (
    /** @type {unknown} */ (
      makeExo(
        'MockPowers',
        M.interface('MockPowers', {}, { defaultGuards: 'passable' }),
        {
          provideScratchMount: async petNamePath => {
            calls.push({ method: 'provideScratchMount', args: [petNamePath] });
          },
        },
      )
    )
  );

  const executor = createCommandExecutor({
    powers,
    showValue: () => {},
    showMessage: () => {},
    showError: () => {},
  });

  const result = await executor.execute('mktmp', {
    petName: 'my-workspace',
  });

  t.true(result.success);
  t.is(calls[0].method, 'provideScratchMount');
  t.deepEqual(calls[0].args[0], ['my-workspace']);
});

test('execute mount command calls provideMount', async t => {
  /** @type {Array<{method: string, args: unknown[]}>} */
  const calls = [];

  const powers = /** @type {ERef<EndoHost>} */ (
    /** @type {unknown} */ (
      makeExo(
        'MockPowers',
        M.interface('MockPowers', {}, { defaultGuards: 'passable' }),
        {
          provideMount: async (mountPath, petNamePath, options) => {
            calls.push({
              method: 'provideMount',
              args: [mountPath, petNamePath, options],
            });
          },
        },
      )
    )
  );

  const executor = createCommandExecutor({
    powers,
    showValue: () => {},
    showMessage: () => {},
    showError: () => {},
  });

  const result = await executor.execute('mount', {
    path: '/tmp/my-dir',
    petName: 'my-mount',
  });

  t.true(result.success);
  t.true(result.message?.includes('my-mount'));
  t.is(calls[0].method, 'provideMount');
  t.is(calls[0].args[0], '/tmp/my-dir');
  t.deepEqual(calls[0].args[1], ['my-mount']);
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
    handleName: '@self',
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
    handleName: '@host',
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
  const powers = /** @type {ERef<EndoHost>} */ (
    /** @type {unknown} */ (
      makeExo(
        'FailingPowers',
        M.interface('FailingPowers', {}, { defaultGuards: 'passable' }),
        {
          dismiss: async () => {
            throw new Error('Permission denied');
          },
        },
      )
    )
  );

  /** @type {Error[]} */
  const errors = [];

  const executor = createCommandExecutor({
    powers,
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

// ============ CHECKIN / CHECKOUT TESTS ============

test('execute checkin command calls storeTree with browser tree', async t => {
  /** @type {Array<{method: string, args: unknown[]}>} */
  const calls = [];

  const powers = /** @type {ERef<EndoHost>} */ (
    /** @type {unknown} */ (
      makeExo(
        'MockPowers',
        M.interface('MockPowers', {}, { defaultGuards: 'passable' }),
        {
          storeTree: async (tree, petNamePath) => {
            calls.push({ method: 'storeTree', args: [tree, petNamePath] });
          },
        },
      )
    )
  );

  // Mock showDirectoryPicker
  const originalPicker = globalThis.showDirectoryPicker;
  globalThis.showDirectoryPicker = async () =>
    /** @type {any} */ ({
      kind: 'directory',
      name: 'test-dir',
      async *keys() {
        yield 'file.txt';
      },
      getFileHandle: async () => ({
        kind: 'file',
        getFile: async () => new Blob(['hello']),
      }),
      getDirectoryHandle: async () => {
        throw new Error('Not found');
      },
    });

  try {
    const executor = createCommandExecutor({
      powers,
      showValue: () => {},
      showMessage: () => {},
      showError: () => {},
    });

    const result = await executor.execute('checkin', { petName: 'my-tree' });

    t.true(result.success);
    t.true(result.message?.includes('my-tree'));
    t.is(calls.length, 1);
    t.is(calls[0].method, 'storeTree');
    t.deepEqual(calls[0].args[1], ['my-tree']);
    // The first arg should be a remotable tree object
    t.truthy(calls[0].args[0]);
  } finally {
    if (originalPicker) {
      globalThis.showDirectoryPicker = originalPicker;
    } else {
      delete (/** @type {any} */ (globalThis).showDirectoryPicker);
    }
  }
});

test('execute ci alias works like checkin', async t => {
  const calls = [];

  const powers = /** @type {ERef<EndoHost>} */ (
    /** @type {unknown} */ (
      makeExo(
        'MockPowers',
        M.interface('MockPowers', {}, { defaultGuards: 'passable' }),
        {
          storeTree: async (tree, petNamePath) => {
            calls.push({ method: 'storeTree', args: [tree, petNamePath] });
          },
        },
      )
    )
  );

  const originalPicker = globalThis.showDirectoryPicker;
  globalThis.showDirectoryPicker = async () =>
    /** @type {any} */ ({
      kind: 'directory',
      name: 'test-dir',
      // eslint-disable-next-line no-empty-function
      async *keys() {},
      getFileHandle: async () => {
        throw new Error('Not found');
      },
      getDirectoryHandle: async () => {
        throw new Error('Not found');
      },
    });

  try {
    const executor = createCommandExecutor({
      powers,
      showValue: () => {},
      showMessage: () => {},
      showError: () => {},
    });

    const result = await executor.execute('ci', { petName: 'tree-alias' });

    t.true(result.success);
    t.is(calls[0].method, 'storeTree');
    t.deepEqual(calls[0].args[1], ['tree-alias']);
  } finally {
    if (originalPicker) {
      globalThis.showDirectoryPicker = originalPicker;
    } else {
      delete (/** @type {any} */ (globalThis).showDirectoryPicker);
    }
  }
});

test('execute checkout command looks up tree and writes to directory', async t => {
  const calls = [];

  // Mock a remote tree that the daemon would return. The blob is a
  // PassableBytesReader (new exo-stream protocol) wrapping an empty byte
  // stream; checkoutToDirectory consumes it via iterateBytesReader.
  const mockRemoteTree = makeExo('MockTree', MockTreeI, {
    list: async () => ['hello.txt'],
    lookup: async () =>
      bytesReaderFromIterator(
        // eslint-disable-next-line no-empty-function
        (async function* emptyBytes() {})(),
      ),
  });

  const powers = /** @type {ERef<EndoHost>} */ (
    /** @type {unknown} */ (
      makeExo(
        'MockPowers',
        M.interface('MockPowers', {}, { defaultGuards: 'passable' }),
        {
          lookup: async pathParts => {
            calls.push({ method: 'lookup', args: [pathParts] });
            return mockRemoteTree;
          },
        },
      )
    )
  );

  /** @type {Array<{name: string, content: Uint8Array[]}>} */
  const writtenFiles = [];

  const originalPicker = globalThis.showDirectoryPicker;
  globalThis.showDirectoryPicker = async () =>
    /** @type {any} */ ({
      kind: 'directory',
      getDirectoryHandle: async () => {
        throw new Error('Not found');
      },
      getFileHandle: async (
        /** @type {string} */ name,
        /** @type {any} */ _opts,
      ) => ({
        createWritable: async () => {
          /** @type {Uint8Array[]} */
          const chunks = [];
          return {
            write: async (/** @type {Uint8Array} */ chunk) => {
              chunks.push(chunk);
            },
            close: async () => {
              writtenFiles.push({ name, content: chunks });
            },
          };
        },
      }),
    });

  try {
    const executor = createCommandExecutor({
      powers,
      showValue: () => {},
      showMessage: () => {},
      showError: () => {},
    });

    const result = await executor.execute('checkout', {
      petName: 'my-tree',
    });

    t.true(result.success);
    t.true(result.message?.includes('my-tree'));
    t.is(calls[0].method, 'lookup');
    t.deepEqual(calls[0].args[0], ['my-tree']);
  } finally {
    if (originalPicker) {
      globalThis.showDirectoryPicker = originalPicker;
    } else {
      delete (/** @type {any} */ (globalThis).showDirectoryPicker);
    }
  }
});

test('execute checkin fails when showDirectoryPicker unavailable', async t => {
  // Ensure showDirectoryPicker is not defined
  const originalPicker = globalThis.showDirectoryPicker;
  delete (/** @type {any} */ (globalThis).showDirectoryPicker);

  /** @type {Error[]} */
  const errors = [];

  try {
    const ctx = createMockContext();
    const executor = createCommandExecutor({
      powers: ctx.powers,
      showValue: () => {},
      showMessage: () => {},
      showError: e => errors.push(e),
    });

    const result = await executor.execute('checkin', { petName: 'test' });

    t.false(result.success);
    t.truthy(result.error);
    t.true(result.error?.message.includes('Directory picker not available'));
    t.is(errors.length, 1);
  } finally {
    if (originalPicker) {
      globalThis.showDirectoryPicker = originalPicker;
    }
  }
});

test('execute checkout fails when showDirectoryPicker unavailable', async t => {
  const originalPicker = globalThis.showDirectoryPicker;
  delete (/** @type {any} */ (globalThis).showDirectoryPicker);

  /** @type {Error[]} */
  const errors = [];

  try {
    const ctx = createMockContext();
    const executor = createCommandExecutor({
      powers: ctx.powers,
      showValue: () => {},
      showMessage: () => {},
      showError: e => errors.push(e),
    });

    const result = await executor.execute('checkout', { petName: 'test' });

    t.false(result.success);
    t.truthy(result.error);
    t.true(result.error?.message.includes('Directory picker not available'));
    t.is(errors.length, 1);
  } finally {
    if (originalPicker) {
      globalThis.showDirectoryPicker = originalPicker;
    }
  }
});

test('execute checkin splits pet name path on slashes', async t => {
  const calls = [];

  const powers = /** @type {ERef<EndoHost>} */ (
    /** @type {unknown} */ (
      makeExo(
        'MockPowers',
        M.interface('MockPowers', {}, { defaultGuards: 'passable' }),
        {
          storeTree: async (tree, petNamePath) => {
            calls.push({ method: 'storeTree', args: [tree, petNamePath] });
          },
        },
      )
    )
  );

  const originalPicker = globalThis.showDirectoryPicker;
  globalThis.showDirectoryPicker = async () =>
    /** @type {any} */ ({
      kind: 'directory',
      name: 'test-dir',
      // eslint-disable-next-line no-empty-function
      async *keys() {},
      getFileHandle: async () => {
        throw new Error('Not found');
      },
      getDirectoryHandle: async () => {
        throw new Error('Not found');
      },
    });

  try {
    const executor = createCommandExecutor({
      powers,
      showValue: () => {},
      showMessage: () => {},
      showError: () => {},
    });

    await executor.execute('checkin', { petName: 'trees/my-project' });

    t.deepEqual(calls[0].args[1], ['trees', 'my-project']);
  } finally {
    if (originalPicker) {
      globalThis.showDirectoryPicker = originalPicker;
    } else {
      delete (/** @type {any} */ (globalThis).showDirectoryPicker);
    }
  }
});

test('execute handles slash-path splitting', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  await executor.execute('show', { petName: 'a/b/c/d' });

  t.deepEqual(ctx.calls[0].args, [['a', 'b', 'c', 'd']]);
});

test('execute js command surfaces the daemon trace when evaluation throws', async t => {
  // The literal acceptance command `/js throw new Error("x")` routes through
  // this `case 'js'` path. On a rejected evaluation the executor must hand
  // showError not just the error but the resolved daemon-side trace (stack +
  // authoritative worker id) so the chat error bubble can render a stack trace
  // and a clickable worker chip (PR #58 criteria 2 and 3).
  const STACK = 'Error: x\n    at <eval>:1:7';
  const WORKER_ID = 'worker-formula-id-512';

  // A decoded CapTP error carrying the wire-level errorId in its SES error tag.
  const thrown = Error('x');
  thrown.name = 'Error (error:Endo#1)';

  const tracePowers = /** @type {ERef<EndoHost>} */ (
    /** @type {unknown} */ (
      makeExo(
        'TracePowers',
        M.interface('TracePowers', {}, { defaultGuards: 'passable' }),
        {
          evaluate: async () => {
            throw thrown;
          },
          diagnostics: async () =>
            makeExo(
              'Diagnostics',
              M.interface('Diagnostics', {}, { defaultGuards: 'passable' }),
              {
                traces: async () =>
                  makeExo(
                    'Traces',
                    M.interface('Traces', {}, { defaultGuards: 'passable' }),
                    {
                      lookup: async errorId =>
                        errorId === 'error:Endo#1'
                          ? { errorId, stack: STACK, workerId: WORKER_ID }
                          : undefined,
                    },
                  ),
              },
            ),
        },
      )
    )
  );

  /** @typedef {{ message: string, stack: string | undefined, workerId: string | undefined }} TraceDetail */
  /** @type {Array<{ error: Error, trace: TraceDetail }>} */
  const errorCalls = [];
  const executor = createCommandExecutor({
    powers: tracePowers,
    showValue: () => {},
    showMessage: () => {},
    // On the error path the executor always resolves and forwards a trace; the
    // callback's `trace` param is optional, so assert it for the assertions below.
    showError: (error, trace) => {
      const detail = /** @type {TraceDetail} */ (trace);
      errorCalls.push({ error, trace: detail });
    },
  });

  const result = await executor.execute('js', {
    source: 'throw new Error("x")',
  });

  t.false(result.success, 'a thrown evaluation reports failure');
  t.is(errorCalls.length, 1, 'showError invoked once');
  t.is(errorCalls[0].error, thrown, 'the original error is surfaced');
  t.is(errorCalls[0].trace.message, 'x', 'criterion 1: message resolved');
  t.is(errorCalls[0].trace.stack, STACK, 'criterion 2: stack resolved');
  t.is(
    errorCalls[0].trace.workerId,
    WORKER_ID,
    'criterion 3: authoritative worker id resolved for the chip',
  );
});
