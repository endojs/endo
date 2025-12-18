// @ts-check

import test from '@endo/ses-ava/test.js';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { makeTestClientPair } from './_util.js';
import { encodeSwissnum } from '../src/client/util.js';
import { makeSlot } from '../src/captp/pairwise.js';

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
  const slotOnA = ocapnA.debug.ocapnTable.getSlotForValue(remoteTestObject);
  if (!slotOnA) {
    throw new Error('should have a slot for the remote object');
  }
  t.is(
    ocapnA.debug.ocapnTable.getRefCount(slotOnA),
    1,
    'should have 1 reference to the remote object',
  );

  const slotOnB = ocapnB.debug.ocapnTable.getSlotForValue(testObject);
  if (!slotOnB) {
    throw new Error('should have a slot for the local object');
  }
  t.is(
    ocapnB.debug.ocapnTable.getRefCount(slotOnB),
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
  const echoObjSlot = ocapnA.debug.ocapnTable.getSlotForValue(echoObj);

  if (!echoObjSlot) {
    throw new Error('echoObj should have a slot after being fetched');
  }
  t.is(
    ocapnA.debug.ocapnTable.getRefCount(echoObjSlot),
    1,
    'should have 1 reference to the imported object',
  );

  // Before sending, objFromA should have no slot on A
  t.falsy(
    ocapnA.debug.ocapnTable.getSlotForValue(objFromA),
    'objFromA should NOT have a slot before sending',
  );

  // Send objFromA to B's echo service and get it back
  await E(echoObj).echo(objFromA);

  t.is(
    ocapnA.debug.ocapnTable.getRefCount(echoObjSlot),
    1,
    'should have 1 references to the imported object',
  );

  // After sending, objFromA should have a slot on A (it was exported)
  const objASlot = ocapnA.debug.ocapnTable.getSlotForValue(objFromA);
  if (!objASlot) {
    throw new Error('objFromA should have a slot after being sent');
  }

  // Check the ref count of the sent object
  t.is(
    ocapnA.debug.ocapnTable.getRefCount(objASlot),
    1,
    'should have 1 reference to the exported object',
  );
  await E(echoObj).echo(objFromA);
  t.is(
    ocapnA.debug.ocapnTable.getRefCount(objASlot),
    2,
    'should have 2 references to the exported object',
  );
  await E(echoObj).echo(objFromA);
  t.is(
    ocapnA.debug.ocapnTable.getRefCount(objASlot),
    3,
    'should have 3 references to the exported object',
  );
  await Promise.all([E(echoObj).echo(objFromA), E(echoObj).echo(objFromA)]);
  t.is(
    ocapnA.debug.ocapnTable.getRefCount(objASlot),
    5,
    'should have 5 references to the exported object',
  );

  // Expect no additional references to the imported object
  t.is(
    ocapnA.debug.ocapnTable.getRefCount(echoObjSlot),
    1,
    'should have 1 reference to the imported object',
  );

  await E(echoObj).echo(echoObj);

  // Expect one additional reference to the imported object
  t.is(
    ocapnA.debug.ocapnTable.getRefCount(echoObjSlot),
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
  const objASlot = ocapnA.debug.ocapnTable.getSlotForValue(objFromA);
  if (!objASlot) {
    throw new Error('objFromA should have a slot after being sent');
  }

  // Verify the export exists
  const exportedValue = ocapnA.debug.ocapnTable.getValueForSlot(objASlot);
  t.is(exportedValue, objFromA, 'exported object should be in export table');
  t.is(
    ocapnA.debug.ocapnTable.getRefCount(objASlot),
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
  const exportAfterGc = ocapnA.debug.ocapnTable.getValueForSlot(objASlot);
  t.is(
    exportAfterGc,
    undefined,
    'exported object should be removed from export table after gc-export',
  );
  t.is(
    ocapnA.debug.ocapnTable.getRefCount(objASlot),
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
    const objASlot = ocapnA.debug.ocapnTable.getSlotForValue(objFromA);
    if (!objASlot) {
      throw new Error('objFromA should have a slot after being sent');
    }

    t.is(
      ocapnA.debug.ocapnTable.getRefCount(objASlot),
      5,
      'should have 5 references to the exported object',
    );

    // Verify the export exists
    const exportedValue = ocapnA.debug.ocapnTable.getValueForSlot(objASlot);
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
      ocapnA.debug.ocapnTable.getValueForSlot(objASlot);
    t.is(
      exportAfterPartialGc,
      objFromA,
      'exported object should still be in export table after partial gc-export',
    );
    t.is(
      ocapnA.debug.ocapnTable.getRefCount(objASlot),
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
      ocapnA.debug.ocapnTable.getValueForSlot(objASlot);
    t.is(
      exportAfterFinalGc,
      undefined,
      'exported object should be removed from export table after final gc-export',
    );
    t.is(
      ocapnA.debug.ocapnTable.getRefCount(objASlot),
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
      ocapnB.debug.ocapnTable.getValueForSlot(answerSlot),
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
      ocapnB.debug.ocapnTable.getValueForSlot(answerSlot),
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

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
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
    const objASlot = ocapnA.debug.ocapnTable.getSlotForValue(objFromA);
    if (!objASlot) {
      throw new Error('objFromA should have a slot after being sent');
    }
    t.is(
      ocapnA.debug.ocapnTable.getRefCount(objASlot),
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
      ocapnA.debug.ocapnTable.getValueForSlot(objASlot),
      undefined,
      'export should be removed after GC',
    );
    t.is(
      ocapnA.debug.ocapnTable.getRefCount(objASlot),
      0,
      'should have 0 references after GC',
    );

    // Send the object again after it's been GC'd
    const result2 = await E(receiver).receive(objFromA);
    t.is(result2, 'received', 'second send after GC succeeded');

    // The object should be re-exported with a NEW slot (not the old one)
    const reExportSlot = ocapnA.debug.ocapnTable.getSlotForValue(objFromA);
    if (!reExportSlot) {
      throw new Error('objFromA should have a slot after re-export');
    }
    t.truthy(reExportSlot, 'has a slot after re-export');
    t.not(reExportSlot, objASlot, 'gets a NEW slot (not the old one)');

    // The object IS re-exported (has ref count)
    t.is(
      ocapnA.debug.ocapnTable.getRefCount(reExportSlot),
      1,
      'ref count is 1 after re-export',
    );

    // And it should be back in the export table
    t.is(
      ocapnA.debug.ocapnTable.getValueForSlot(reExportSlot),
      objFromA,
      'export is back in table after re-export',
    );
  } finally {
    shutdownBoth();
  }
});
