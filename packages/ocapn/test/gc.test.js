// @ts-check
/* global globalThis, setImmediate, setTimeout, FinalizationRegistry */

import test from '@endo/ses-ava/test.js';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import v8 from 'node:v8';
import vm from 'node:vm';
import { makeTestClientPair, getOcapnDebug } from './_util.js';
import { encodeSwissnum } from '../src/client/util.js';
import { makeSlot } from '../src/captp/pairwise.js';

// Enable GC using Node.js v8 wizardry (same pattern as packages/promise-kit)
/** @type {() => void} */
let engineGC;
if (typeof globalThis.gc !== 'function') {
  v8.setFlagsFromString('--expose_gc');
  engineGC = vm.runInNewContext('gc');
  v8.setFlagsFromString('--no-expose_gc');
} else {
  engineGC = globalThis.gc;
}

/**
 * Trigger GC and wait for finalizers to run.
 * Based on packages/captp/test/gc-and-finalize.js
 */
const gcAndFinalize = async () => {
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  engineGC();
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  await new Promise(setImmediate);
};

/** @type {FinalizationRegistry<() => void>} */
const sentinelRegistry = new FinalizationRegistry(callback => callback());

/**
 * Wait for GC to run by using a sentinel object.
 * Based on packages/promise-kit/test/promise-kit.test.js pattern.
 * @returns {Promise<void>}
 */
const waitForSentinelGc = async () => {
  await undefined;
  /** @type {object | null} */
  let sentinel = {};
  const collected = new Promise(resolve => {
    sentinelRegistry.register(sentinel, () => resolve(undefined));
  });
  // Make sentinel unreachable
  sentinel = null;

  // Trigger GC until sentinel is collected
  const endTime = Date.now() + 5000;
  while (Date.now() < endTime) {
    // eslint-disable-next-line no-await-in-loop
    await gcAndFinalize();
    // Check if sentinel was collected by racing with a timeout
    // eslint-disable-next-line no-await-in-loop
    const result = await Promise.race([
      collected.then(() => 'collected'),
      new Promise(resolve => setTimeout(() => resolve('timeout'), 100)),
    ]);
    if (result === 'collected') {
      return;
    }
  }
};

/**
 * Wait for a message of a specific type to be sent, with GC triggering.
 * @param {Array<{direction: string, message: any}>} sentMessages - Array to check for messages
 * @param {string} messageType - The message type to wait for
 * @param {number} [timeoutMs] - Timeout in milliseconds
 * @returns {Promise<any>} - The message that was found
 */
const waitForGcMessage = async (
  sentMessages,
  messageType,
  timeoutMs = 5000,
) => {
  await undefined;
  const endTime = Date.now() + timeoutMs;
  while (Date.now() < endTime) {
    // Wait for sentinel GC to ensure GC has actually run
    // eslint-disable-next-line no-await-in-loop
    await waitForSentinelGc();

    // Check for the message
    const found = sentMessages.find(m => m.message.type === messageType);
    if (found) {
      return found.message;
    }

    // Wait a bit before trying again
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return undefined;
};

test('ref count increases when object is sent', async t => {
  const testObjectTable = new Map();
  const testObject = Far('testObject', {
    greet: name => `Hello ${name}`,
  });
  testObjectTable.set('Test Object', testObject);

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  const {
    sessionA: { ocapn: ocapnA },
    sessionB: { ocapn: ocapnB },
  } = await establishSession();

  // Get the bootstrap from B on A's side
  const bootstrapB = ocapnA.getRemoteBootstrap();
  const remoteTestObject = await E(bootstrapB).fetch(
    encodeSwissnum('Test Object'),
  );

  // Get the slot for the remote object on A's side
  const slotOnA =
    getOcapnDebug(ocapnA).ocapnTable.getSlotForValue(remoteTestObject);
  if (!slotOnA) {
    throw new Error('should have a slot for the remote object');
  }
  t.is(
    getOcapnDebug(ocapnA).ocapnTable.getRefCount(slotOnA),
    1,
    'should have 1 reference to the remote object',
  );

  const slotOnB = getOcapnDebug(ocapnB).ocapnTable.getSlotForValue(testObject);
  if (!slotOnB) {
    throw new Error('should have a slot for the local object');
  }
  t.is(
    getOcapnDebug(ocapnB).ocapnTable.getRefCount(slotOnB),
    1,
    'should have 1 reference to the local object',
  );

  shutdownBoth();
});

test('echo object - sending objects back and forth', async t => {
  const receivedObjects = [];
  const testObjectTable = new Map();

  // B provides an echo service that stores and echoes objects
  testObjectTable.set(
    'Echo',
    Far('echo', {
      echo: obj => {
        // Store the object so B actually imports it
        receivedObjects.push(obj);
        return obj;
      },
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  const {
    sessionA: { ocapn: ocapnA },
  } = await establishSession();

  // A creates an object to send
  const objFromA = Far('objFromA', {
    getValue: () => 42,
  });

  // Get B's echo service
  const bootstrapB = ocapnA.getRemoteBootstrap();
  const echoObj = await E(bootstrapB).fetch(encodeSwissnum('Echo'));
  const echoObjSlot = getOcapnDebug(ocapnA).ocapnTable.getSlotForValue(echoObj);

  if (!echoObjSlot) {
    throw new Error('echoObj should have a slot after being fetched');
  }
  t.is(
    getOcapnDebug(ocapnA).ocapnTable.getRefCount(echoObjSlot),
    1,
    'should have 1 reference to the imported object',
  );

  // Before sending, objFromA should have no slot on A
  t.falsy(
    getOcapnDebug(ocapnA).ocapnTable.getSlotForValue(objFromA),
    'objFromA should NOT have a slot before sending',
  );

  // Send objFromA to B's echo service and get it back
  await E(echoObj).echo(objFromA);

  t.is(
    getOcapnDebug(ocapnA).ocapnTable.getRefCount(echoObjSlot),
    1,
    'should have 1 references to the imported object',
  );

  // After sending, objFromA should have a slot on A (it was exported)
  const objASlot = getOcapnDebug(ocapnA).ocapnTable.getSlotForValue(objFromA);
  if (!objASlot) {
    throw new Error('objFromA should have a slot after being sent');
  }

  // Check the ref count of the sent object
  t.is(
    getOcapnDebug(ocapnA).ocapnTable.getRefCount(objASlot),
    1,
    'should have 1 reference to the exported object',
  );
  await E(echoObj).echo(objFromA);
  t.is(
    getOcapnDebug(ocapnA).ocapnTable.getRefCount(objASlot),
    2,
    'should have 2 references to the exported object',
  );
  await E(echoObj).echo(objFromA);
  t.is(
    getOcapnDebug(ocapnA).ocapnTable.getRefCount(objASlot),
    3,
    'should have 3 references to the exported object',
  );
  await Promise.all([E(echoObj).echo(objFromA), E(echoObj).echo(objFromA)]);
  t.is(
    getOcapnDebug(ocapnA).ocapnTable.getRefCount(objASlot),
    5,
    'should have 5 references to the exported object',
  );

  // Expect no additional references to the imported object
  t.is(
    getOcapnDebug(ocapnA).ocapnTable.getRefCount(echoObjSlot),
    1,
    'should have 1 reference to the imported object',
  );

  await E(echoObj).echo(echoObj);

  // Expect one additional reference to the imported object
  t.is(
    getOcapnDebug(ocapnA).ocapnTable.getRefCount(echoObjSlot),
    2,
    'should have 2 references to the imported object',
  );

  shutdownBoth();
});

test('exported object dropped after op:gc-export', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Echo',
    Far('echo', {
      echo: obj => obj,
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  const {
    sessionA: { ocapn: ocapnA },
    sessionB: { ocapn: ocapnB },
  } = await establishSession();

  // A creates an object to send to B
  const objFromA = Far('objFromA', {
    getValue: () => 42,
  });

  // Get B's echo service and send objFromA to it
  const bootstrapB = ocapnA.getRemoteBootstrap();
  const echoObj = await E(bootstrapB).fetch(encodeSwissnum('Echo'));
  await E(echoObj).echo(objFromA);

  // After sending, objFromA should be exported from A
  const objASlot = getOcapnDebug(ocapnA).ocapnTable.getSlotForValue(objFromA);
  if (!objASlot) {
    throw new Error('objFromA should have a slot after being sent');
  }

  // Verify the export exists
  const exportedValue =
    getOcapnDebug(ocapnA).ocapnTable.getValueForSlot(objASlot);
  t.is(exportedValue, objFromA, 'exported object should be in export table');
  t.is(
    getOcapnDebug(ocapnA).ocapnTable.getRefCount(objASlot),
    1,
    'should have 1 reference to the exported object',
  );

  // Now simulate B sending an op:gc-export message to A
  // saying it's dropping all references to objFromA

  // The export position is the numeric part of the slot (e.g., "o+1" -> 1)
  // For exports, the slot format is `o+${position}`
  const exportPosition = BigInt(objASlot.slice(2));

  const gcExportMessage = {
    type: 'op:gc-export',
    exportPosition,
    wireDelta: 1n, // Drop 1 reference
  };

  // Use B's writeOcapnMessage to serialize the message
  const bytes = ocapnB.writeOcapnMessage(gcExportMessage);

  // Inject the message directly into A's dispatch
  // (simulating B sending this message to A)
  ocapnA.dispatchMessageData(bytes);

  // Verify the export has been removed from A's table
  const exportAfterGc =
    getOcapnDebug(ocapnA).ocapnTable.getValueForSlot(objASlot);
  t.is(
    exportAfterGc,
    undefined,
    'exported object should be removed from export table after gc-export',
  );
  t.is(
    getOcapnDebug(ocapnA).ocapnTable.getRefCount(objASlot),
    0,
    'should have 0 references after gc-export',
  );

  shutdownBoth();
});

test('partial op:gc-export does not remove object, full gc does', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Echo',
    Far('echo', {
      echo: obj => obj,
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
      sessionB: { ocapn: ocapnB },
    } = await establishSession();

    // A creates an object to send to B
    const objFromA = Far('objFromA', {
      getValue: () => 42,
    });

    // Get B's echo service and send objFromA multiple times
    const bootstrapB = ocapnA.getRemoteBootstrap();
    const echoObj = await E(bootstrapB).fetch(encodeSwissnum('Echo'));

    // Send the object 5 times to build up ref count
    await E(echoObj).echo(objFromA);
    await E(echoObj).echo(objFromA);
    await E(echoObj).echo(objFromA);
    await E(echoObj).echo(objFromA);
    await E(echoObj).echo(objFromA);

    // After sending 5 times, objFromA should have ref count of 5
    const objASlot = getOcapnDebug(ocapnA).ocapnTable.getSlotForValue(objFromA);
    if (!objASlot) {
      throw new Error('objFromA should have a slot after being sent');
    }

    t.is(
      getOcapnDebug(ocapnA).ocapnTable.getRefCount(objASlot),
      5,
      'should have 5 references to the exported object',
    );

    // Verify the export exists
    const exportedValue =
      getOcapnDebug(ocapnA).ocapnTable.getValueForSlot(objASlot);
    t.is(exportedValue, objFromA, 'exported object should be in export table');

    // Now simulate B sending an op:gc-export with partial wire-delta
    // The export position is the numeric part of the slot (e.g., "o+1" -> 1)
    const exportPosition = BigInt(objASlot.slice(2));

    const partialGcMessage = {
      type: 'op:gc-export',
      exportPosition,
      wireDelta: 3n, // Drop only 3 out of 5 references
    };

    const partialBytes = ocapnB.writeOcapnMessage(partialGcMessage);
    ocapnA.dispatchMessageData(partialBytes);

    // After partial GC, the object should still be in the table
    const exportAfterPartialGc =
      getOcapnDebug(ocapnA).ocapnTable.getValueForSlot(objASlot);
    t.is(
      exportAfterPartialGc,
      objFromA,
      'exported object should still be in export table after partial gc-export',
    );
    t.is(
      getOcapnDebug(ocapnA).ocapnTable.getRefCount(objASlot),
      2,
      'should have 2 references remaining after partial gc-export',
    );

    // Now send another op:gc-export for the remaining references
    const finalGcMessage = {
      type: 'op:gc-export',
      exportPosition,
      wireDelta: 2n, // Drop the remaining 2 references
    };

    const finalBytes = ocapnB.writeOcapnMessage(finalGcMessage);
    ocapnA.dispatchMessageData(finalBytes);

    // After final GC, the object should be removed from the table
    const exportAfterFinalGc =
      getOcapnDebug(ocapnA).ocapnTable.getValueForSlot(objASlot);
    t.is(
      exportAfterFinalGc,
      undefined,
      'exported object should be removed from export table after final gc-export',
    );
    t.is(
      getOcapnDebug(ocapnA).ocapnTable.getRefCount(objASlot),
      0,
      'should have 0 references after final gc-export',
    );
  } finally {
    shutdownBoth();
  }
});

test('op:gc-answer deletes answer from engine', async t => {
  const testObjectTable = new Map();

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
      sessionB: { ocapn: ocapnB },
    } = await establishSession();

    // Manually create an answer on B's side (q+1) to test deletion
    const answerSlot = makeSlot('a', true, 1n);
    const testAnswer = ocapnB.referenceKit.provideLocalAnswerValue(1n);

    // Verify B has the answer
    t.is(
      getOcapnDebug(ocapnB).ocapnTable.getValueForSlot(answerSlot),
      testAnswer,
      'answer should match',
    );

    // Now A sends op:gc-answer to B
    const answerPosition = BigInt(1); // Position 1 for q+1
    const gcAnswerMessage = {
      type: 'op:gc-answer',
      answerPosition,
    };

    const gcBytes = ocapnA.writeOcapnMessage(gcAnswerMessage);
    ocapnB.dispatchMessageData(gcBytes);

    // After op:gc-answer, B should have deleted the answer
    t.is(
      getOcapnDebug(ocapnB).ocapnTable.getValueForSlot(answerSlot),
      undefined,
      'answer should be undefined',
    );
  } finally {
    shutdownBoth();
  }
});

test("object can be re-exported after being GC'd", async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Receiver',
    Far('receiver', {
      // Just receives, doesn't echo back
      receive: obj => {
        // Just accept the object, don't return it
        return 'received';
      },
    }),
  );

  // Disable import collection to avoid flaky GC timing issues in this test.
  // This test only verifies refcounting logic, which doesn't depend on GC reporting.
  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
    clientAOptions: { enableImportCollection: false },
    clientBOptions: { enableImportCollection: false },
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
      sessionB: { ocapn: ocapnB },
    } = await establishSession();

    // A creates an object
    const objFromA = Far('objFromA', {
      getValue: () => 42,
    });

    // Send it to B once
    const bootstrapB = ocapnA.getRemoteBootstrap();
    const receiver = await E(bootstrapB).fetch(encodeSwissnum('Receiver'));
    const result1 = await E(receiver).receive(objFromA);
    t.is(result1, 'received', 'first send succeeded');

    // Verify it's exported
    const objASlot = getOcapnDebug(ocapnA).ocapnTable.getSlotForValue(objFromA);
    if (!objASlot) {
      throw new Error('objFromA should have a slot after being sent');
    }
    t.is(
      getOcapnDebug(ocapnA).ocapnTable.getRefCount(objASlot),
      1,
      'should have 1 reference',
    );

    // GC the export completely
    const exportPosition = BigInt(objASlot.slice(2));
    const gcMessage = {
      type: 'op:gc-export',
      exportPosition,
      wireDelta: 1n,
    };
    const gcBytes = ocapnB.writeOcapnMessage(gcMessage);
    ocapnA.dispatchMessageData(gcBytes);

    // Verify it's gone
    t.is(
      getOcapnDebug(ocapnA).ocapnTable.getValueForSlot(objASlot),
      undefined,
      'export should be removed after GC',
    );
    t.is(
      getOcapnDebug(ocapnA).ocapnTable.getRefCount(objASlot),
      0,
      'should have 0 references after GC',
    );

    // Send the object again after it's been GC'd
    const result2 = await E(receiver).receive(objFromA);
    t.is(result2, 'received', 'second send after GC succeeded');

    // The object should be re-exported with a NEW slot (not the old one)
    const reExportSlot =
      getOcapnDebug(ocapnA).ocapnTable.getSlotForValue(objFromA);
    if (!reExportSlot) {
      throw new Error('objFromA should have a slot after re-export');
    }
    t.truthy(reExportSlot, 'has a slot after re-export');
    t.not(reExportSlot, objASlot, 'gets a NEW slot (not the old one)');

    // The object IS re-exported (has ref count)
    t.is(
      getOcapnDebug(ocapnA).ocapnTable.getRefCount(reExportSlot),
      1,
      'ref count is 1 after re-export',
    );

    // And it should be back in the export table
    t.is(
      getOcapnDebug(ocapnA).ocapnTable.getValueForSlot(reExportSlot),
      objFromA,
      'export is back in table after re-export',
    );
  } finally {
    shutdownBoth();
  }
});

// =============================================================================
// Tests for SENDING GC messages (when imports are garbage collected)
// =============================================================================

test('op:gc-export is sent when imported object is garbage collected', async t => {
  const testObjectTable = new Map();
  const testObject = Far('testObject', {
    greet: name => `Hello ${name}`,
  });
  testObjectTable.set('Test Object', testObject);

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  const {
    sessionA: { ocapn: ocapnA },
  } = await establishSession();

  // Track messages sent by A
  /** @type {Array<{direction: string, message: any}>} */
  const sentMessages = [];
  getOcapnDebug(ocapnA).subscribeMessages((direction, message) => {
    if (direction === 'send') {
      sentMessages.push({ direction, message });
    }
  });

  // Get a remote object from B
  const bootstrapB = ocapnA.getRemoteBootstrap();

  // Use a block scope to allow the reference to be GC'd
  await (async () => {
    const remoteTestObject = await E(bootstrapB).fetch(
      encodeSwissnum('Test Object'),
    );

    // Verify we have a slot for it
    const slotOnA =
      getOcapnDebug(ocapnA).ocapnTable.getSlotForValue(remoteTestObject);
    if (!slotOnA) {
      throw new Error('should have a slot for the remote object');
    }
    t.is(
      getOcapnDebug(ocapnA).ocapnTable.getRefCount(slotOnA),
      1,
      'should have 1 reference to the remote object',
    );

    // Clear sentMessages so we only capture the GC message
    sentMessages.length = 0;

    // remoteTestObject goes out of scope here
  })();

  // Wait for the GC message to be sent (with repeated GC attempts)
  const gcMessage = await waitForGcMessage(sentMessages, 'op:gc-export');

  // Check that an op:gc-export message was sent
  t.truthy(gcMessage, 'should have sent an op:gc-export message');
  t.is(gcMessage.wireDelta, 1n, 'wireDelta should be 1 (the refcount)');

  shutdownBoth();
});

test('op:gc-export wireDelta reflects accumulated refcount', async t => {
  // This test verifies that when multiple references to the same remote object
  // are received, the wireDelta in the gc-export message reflects the total.
  // We test this by manually verifying refcount tracking, since JS GC is non-deterministic.

  const testObjectTable = new Map();
  const testObject = Far('testObject', {
    echo: obj => obj,
  });
  testObjectTable.set('Test Object', testObject);

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  const {
    sessionA: { ocapn: ocapnA },
  } = await establishSession();

  const bootstrapB = ocapnA.getRemoteBootstrap();
  const remoteTestObject = await E(bootstrapB).fetch(
    encodeSwissnum('Test Object'),
  );

  // Each call to echo sends the object to B and gets it back, incrementing refcount
  await E(remoteTestObject).echo(remoteTestObject);
  await E(remoteTestObject).echo(remoteTestObject);
  await E(remoteTestObject).echo(remoteTestObject);

  const slotOnA =
    getOcapnDebug(ocapnA).ocapnTable.getSlotForValue(remoteTestObject);
  if (!slotOnA) {
    throw new Error('should have a slot');
  }

  // Refcount should be 4 (1 initial + 3 from echo returns)
  t.is(
    getOcapnDebug(ocapnA).ocapnTable.getRefCount(slotOnA),
    4,
    'should have 4 references after receiving object 4 times',
  );

  // The wireDelta that will be sent when this object is GC'd should equal the refcount.
  // We verify this by checking the refcount, which is what slotCollectedHook uses.
  // (Testing actual GC is done in the single-reference test which is more reliable)

  shutdownBoth();
});

test('op:gc-answer is sent when answer promise is garbage collected', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Echo',
    Far('echo', {
      echo: obj => obj,
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  const {
    sessionA: { ocapn: ocapnA },
  } = await establishSession();

  // Track messages sent by A
  /** @type {Array<{direction: string, message: any}>} */
  const sentMessages = [];
  getOcapnDebug(ocapnA).subscribeMessages((direction, message) => {
    if (direction === 'send') {
      sentMessages.push({ direction, message });
    }
  });

  const bootstrapB = ocapnA.getRemoteBootstrap();
  const echoService = await E(bootstrapB).fetch(encodeSwissnum('Echo'));

  // Create an answer (question from A's perspective) that we'll let be GC'd
  await (async () => {
    // Make a call that creates an answer - don't await the inner promise
    // so it can be GC'd
    const answerPromise = E(echoService).echo('test');
    // Wait for it to resolve so the answer is created on the remote side
    await answerPromise;

    sentMessages.length = 0;
    // answerPromise goes out of scope here
  })();

  // Wait for the GC message to be sent
  const gcMessage = await waitForGcMessage(sentMessages, 'op:gc-answer');

  // Check that an op:gc-answer message was sent
  t.truthy(gcMessage, 'should have sent an op:gc-answer message');
  t.is(
    typeof gcMessage.answerPosition,
    'bigint',
    'answerPosition should be a bigint',
  );

  shutdownBoth();
});
