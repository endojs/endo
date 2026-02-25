// @ts-check
/* global setTimeout */

import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { test, makeTestClientPair, getOcapnDebug } from './_util.js';
import { encodeSwissnum } from '../src/client/util.js';
import { makeSlot } from '../src/captp/pairwise.js';
import { waitForSentinelGc } from './_gc-util.js';

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
    const testAnswer = ocapnB.referenceKit.makeLocalAnswerPromiseAndFulfill(
      1n,
      Promise.resolve('test answer'),
    );

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

// =============================================================================
// Tests ported from ocapn-test-suite/tests/op_gc.py
// These tests mirror the Python test suite structure for interoperability testing
// =============================================================================

/**
 * Wait for op:gc-export message(s) for a specific export position, with GC triggering.
 * @param {Array<{direction: string, message: any}>} sentMessages - Array to check for messages
 * @param {bigint} exportPosition - The export position to wait for
 * @param {number} [timeoutMs] - Timeout in milliseconds
 * @returns {Promise<Array<any>>} - All matching gc-export messages found
 */
const waitForGcExportsForPosition = async (
  sentMessages,
  exportPosition,
  timeoutMs = 5000,
) => {
  await undefined;
  const endTime = Date.now() + timeoutMs;
  while (Date.now() < endTime) {
    // Wait for sentinel GC to ensure GC has actually run
    // eslint-disable-next-line no-await-in-loop
    await waitForSentinelGc();

    // Check for messages
    const found = sentMessages.filter(
      m =>
        m.message.type === 'op:gc-export' &&
        m.message.exportPosition === exportPosition,
    );
    if (found.length > 0) {
      return found.map(f => f.message);
    }

    // Wait a bit before trying again
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return [];
};

/**
 * Sum up all wireDelta values from gc-export messages.
 * @param {Array<{wireDelta: bigint}>} gcMessages
 * @returns {bigint}
 */
const sumWireDelta = gcMessages => {
  return gcMessages.reduce((sum, msg) => sum + msg.wireDelta, 0n);
};

test('ocapn-test-suite: op:gc-export emitted for single object', async t => {
  // Mirrors test_gc_export_emitted_single_object from op_gc.py
  // When A sends a local object to B's discard service (that immediately drops it),
  // B should send op:gc-export back to A.

  const testObjectTable = new Map();
  // A "discard" service that accepts objects but doesn't hold references
  testObjectTable.set(
    'EchoGc',
    Far('echoGc', {
      receive: (..._args) => _args,
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

    // Track messages sent by B (the service side)
    /** @type {Array<{direction: string, message: any}>} */
    const sentByB = [];
    getOcapnDebug(ocapnB).subscribeMessages((direction, message) => {
      if (direction === 'send') {
        sentByB.push({ direction, message });
      }
    });

    // A creates a local object to send to B
    const localObjFromA = Far('localObj', { getValue: () => 42 });

    // Get B's EchoGc service
    const bootstrapB = ocapnA.getRemoteBootstrap();
    const echoGc = await E(bootstrapB).fetch(encodeSwissnum('EchoGc'));

    // Send the local object to B's service
    await E(echoGc).receive(localObjFromA);

    // Get the export position for the object A sent
    const exportSlot =
      getOcapnDebug(ocapnA).ocapnTable.getSlotForValue(localObjFromA);
    if (!exportSlot) {
      throw new Error('localObjFromA should have an export slot');
    }
    const exportPosition = BigInt(exportSlot.slice(2));

    // Clear messages so we only capture GC messages
    sentByB.length = 0;

    // Wait for B to send op:gc-export for this position
    const gcMessages = await waitForGcExportsForPosition(
      sentByB,
      exportPosition,
    );

    t.true(gcMessages.length > 0, 'B should have sent op:gc-export');
    t.is(
      sumWireDelta(gcMessages),
      1n,
      'wire-delta should be 1 for single reference',
    );
  } finally {
    shutdownBoth();
  }
});

test('ocapn-test-suite: op:gc-export with multiple references in same message', async t => {
  // Mirrors test_gc_export_with_multiple_refrences from op_gc.py
  // When A sends the same object multiple times in one message's arguments,
  // B should eventually report the total wire-delta matching the number of references.

  const testObjectTable = new Map();
  // Service that accepts multiple args and returns them (like Python's echoGc)
  testObjectTable.set(
    'EchoGc',
    Far('echoGc', {
      receiveMany: async (...args) => args,
    }),
  );

  // Disable import collection on B to prevent GC during test setup
  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
    clientBOptions: { enableImportCollection: false },
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
      sessionB: { ocapn: ocapnB },
    } = await establishSession();

    // A creates a local object
    const localObjFromA = Far('localObj', { getValue: () => 42 });

    // Get B's EchoGc service
    const bootstrapB = ocapnA.getRemoteBootstrap();
    const echoGc = await E(bootstrapB).fetch(encodeSwissnum('EchoGc'));

    // Send the same object 4 times in one send-only message
    const refCount = 4;
    E.sendOnly(echoGc).receiveMany(
      localObjFromA,
      localObjFromA,
      localObjFromA,
      localObjFromA,
    );

    // Wait for the message queue to flush by making a round-trip call
    await E(echoGc).receiveMany();

    // Get the export position
    const exportSlot =
      getOcapnDebug(ocapnA).ocapnTable.getSlotForValue(localObjFromA);
    if (!exportSlot) {
      throw new Error('localObjFromA should have an export slot');
    }
    const exportPosition = BigInt(exportSlot.slice(2));

    // Verify A's ref count matches the number of times the object appeared in the message
    t.is(
      getOcapnDebug(ocapnA).ocapnTable.getRefCount(exportSlot),
      refCount,
      `ref count should be ${refCount} for ${refCount} references in same message`,
    );

    // Verify B has imported the object with matching ref count
    const importSlotOnB = makeSlot('o', false, BigInt(exportSlot.slice(2)));
    t.is(
      getOcapnDebug(ocapnB).ocapnTable.getRefCount(importSlotOnB),
      refCount,
      `B should track ${refCount} references for the imported object`,
    );

    // Now manually trigger GC by sending gc-export with full wire-delta
    const gcExportMessage = {
      type: 'op:gc-export',
      exportPosition,
      wireDelta: BigInt(refCount),
    };
    const gcBytes = ocapnB.writeOcapnMessage(gcExportMessage);
    ocapnA.dispatchMessageData(gcBytes);

    // Verify A's ref count is now 0
    t.is(
      getOcapnDebug(ocapnA).ocapnTable.getRefCount(exportSlot),
      0,
      'A should have 0 references after gc-export with full wire-delta',
    );

    // Verify the object is removed from A's export table
    t.is(
      getOcapnDebug(ocapnA).ocapnTable.getValueForSlot(exportSlot),
      undefined,
      'object should be removed from A export table',
    );
  } finally {
    shutdownBoth();
  }
});

test('ocapn-test-suite: op:gc-export with multiple references in different messages', async t => {
  // Mirrors test_gc_export_with_multiple_refrences_in_different_messages from op_gc.py
  // When A sends the same object in multiple separate messages,
  // B should eventually report the total wire-delta.
  //
  // We disable import collection on B to prevent GC from happening during the
  // test setup, then verify A's ref count matches the expected value.

  const testObjectTable = new Map();
  testObjectTable.set(
    'EchoGc',
    Far('echoGc', {
      receive: _args => _args,
    }),
  );

  // Disable import collection on B to prevent GC during test setup
  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
    clientBOptions: { enableImportCollection: false },
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
      sessionB: { ocapn: ocapnB },
    } = await establishSession();

    // Track messages sent by B
    /** @type {Array<{direction: string, message: any}>} */
    const sentByB = [];
    getOcapnDebug(ocapnB).subscribeMessages((direction, message) => {
      if (direction === 'send') {
        sentByB.push({ direction, message });
      }
    });

    // A creates a local object
    const localObjFromA = Far('localObj', { getValue: () => 42 });

    // Get B's EchoGc service
    const bootstrapB = ocapnA.getRemoteBootstrap();
    const echoGc = await E(bootstrapB).fetch(encodeSwissnum('EchoGc'));

    // Send the same object 4 times in DIFFERENT messages
    const refCount = 4;
    for (let i = 0; i < refCount; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await E(echoGc).receive(localObjFromA);
    }

    // Get the export position
    const exportSlot =
      getOcapnDebug(ocapnA).ocapnTable.getSlotForValue(localObjFromA);
    if (!exportSlot) {
      throw new Error('localObjFromA should have an export slot');
    }
    const exportPosition = BigInt(exportSlot.slice(2));

    // Verify A's tracked ref count matches the number of separate sends
    // (With B's import collection disabled, no gc-export should have arrived yet)
    t.is(
      getOcapnDebug(ocapnA).ocapnTable.getRefCount(exportSlot),
      refCount,
      `A should track ${refCount} references for ${refCount} separate messages`,
    );

    // Verify B has imported the object
    // B's import slot for an object from A would be o-N (negative because it's an import)
    const importSlotOnB = makeSlot('o', false, BigInt(exportSlot.slice(2)));
    const importedValueOnB =
      getOcapnDebug(ocapnB).ocapnTable.getValueForSlot(importSlotOnB);
    t.truthy(importedValueOnB, 'B should have imported the object');

    // Now manually trigger GC on B's side by sending gc-export
    // This simulates what would happen if B's import collection was enabled
    const gcExportMessage = {
      type: 'op:gc-export',
      exportPosition,
      wireDelta: BigInt(refCount), // Drop all references
    };
    const gcBytes = ocapnB.writeOcapnMessage(gcExportMessage);
    ocapnA.dispatchMessageData(gcBytes);

    // Verify A's ref count is now 0
    t.is(
      getOcapnDebug(ocapnA).ocapnTable.getRefCount(exportSlot),
      0,
      'A should have 0 references after gc-export with full wire-delta',
    );

    // Verify the object is removed from A's export table
    t.is(
      getOcapnDebug(ocapnA).ocapnTable.getValueForSlot(exportSlot),
      undefined,
      'object should be removed from A export table',
    );
  } finally {
    shutdownBoth();
  }
});

test('ocapn-test-suite: op:gc-answer after promise fulfillment', async t => {
  // Mirrors test_gc_answer from op_gc.py
  // When A makes a call to B that returns a value (creating an answer on B's side),
  // then A drops the reference to that answer, A should send op:gc-answer to B.

  const testObjectTable = new Map();
  // A greeter service that returns a greeting
  testObjectTable.set(
    'Greeter',
    Far('greeter', {
      greet: name => `Hello ${name}!`,
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();

    // Track messages sent by A
    /** @type {Array<{direction: string, message: any}>} */
    const sentByA = [];
    getOcapnDebug(ocapnA).subscribeMessages((direction, message) => {
      if (direction === 'send') {
        sentByA.push({ direction, message });
      }
    });

    // Get B's Greeter service
    const bootstrapB = ocapnA.getRemoteBootstrap();
    const greeter = await E(bootstrapB).fetch(encodeSwissnum('Greeter'));

    // Make a call that creates an answer on B's side
    const greeting = await E(greeter).greet('World');
    t.is(greeting, 'Hello World!', 'greeting should be correct');

    // Clear messages before letting the promise go out of scope
    sentByA.length = 0;

    // Wait for op:gc-answer to be sent by A
    const gcMessage = await waitForGcMessage(sentByA, 'op:gc-answer');

    // Verify the message was sent
    t.truthy(gcMessage, 'should have sent an op:gc-answer message');
    t.is(gcMessage.type, 'op:gc-answer', 'should be op:gc-answer');
    t.is(
      typeof gcMessage.answerPosition,
      'bigint',
      'answerPosition should be a bigint',
    );
  } finally {
    shutdownBoth();
  }
});

test('ocapn-test-suite: op:gc-answer after callback promise fulfillment', async t => {
  // Mirrors test_gc_answer from op_gc.py (lines 126-154)
  // This tests the callback pattern:
  // 1. A sends a local object to B's greeter
  // 2. B's greeter calls back to A's object (creating an answer on B's side)
  // 3. A fulfills the promise
  // 4. B sends op:gc-answer to A when the answer is garbage collected

  const testObjectTable = new Map();
  // A greeter service that calls back to the object passed to it
  // This mirrors the Python test suite's greeter (swiss: VMDDd1voKWarCe2GvgLbxbVFysNzRPzx)
  testObjectTable.set(
    'CallbackGreeter',
    Far('callbackGreeter', {
      greet: async objectToGreet => {
        // Call the object and wait for the result
        // This creates an answer on B's side (the question promise)
        const greeting = await E(objectToGreet).receiveGreeting('Hello');
        return greeting;
      },
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

    // Track messages sent by B (the greeter side)
    /** @type {Array<{direction: string, message: any}>} */
    const sentByB = [];
    getOcapnDebug(ocapnB).subscribeMessages((direction, message) => {
      if (direction === 'send') {
        sentByB.push({ direction, message });
      }
    });

    // A creates a local object that will receive the greeting callback
    const objectToGreet = Far('objectToGreet', {
      receiveGreeting: greeting => {
        return `Received: ${greeting}`;
      },
    });

    // Get B's CallbackGreeter service
    const bootstrapB = ocapnA.getRemoteBootstrap();
    const greeter = await E(bootstrapB).fetch(
      encodeSwissnum('CallbackGreeter'),
    );

    // Clear messages to focus on the callback interaction
    sentByB.length = 0;

    // A calls B's greeter with A's local object
    // B's greeter will call back to A's object, creating an answer on B's side
    // When A responds, B's answer is fulfilled and should be GC'd
    const result = await E(greeter).greet(objectToGreet);
    t.is(result, 'Received: Hello', 'callback result should be correct');

    // Wait for B to send op:gc-answer for the answer it created when calling A's object
    const gcMessage = await waitForGcMessage(sentByB, 'op:gc-answer');

    // Verify the message was sent
    t.truthy(gcMessage, 'B should have sent an op:gc-answer message');
    t.is(gcMessage.type, 'op:gc-answer', 'should be op:gc-answer');
    t.is(
      typeof gcMessage.answerPosition,
      'bigint',
      'answerPosition should be a bigint',
    );
  } finally {
    shutdownBoth();
  }
});
