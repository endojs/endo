// @ts-check

import test from '@endo/ses-ava/test.js';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { makeTestClientPair } from './_util.js';
import { encodeSwissnum } from '../src/client/util.js';

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
  const bootstrapB = ocapnA.getBootstrap();
  const remoteTestObject = await E(bootstrapB).fetch(
    encodeSwissnum('Test Object'),
  );

  // Get the slot for the remote object on A's side
  // NOTE! convertSlotToVal and convertValToSlot have a side effect of incrementing the reference count
  const slotOnA = ocapnA.engine.convertValToSlot(remoteTestObject);
  t.truthy(slotOnA, 'should have a slot for the remote object');
  t.is(
    ocapnA.engine.getRefCount(slotOnA),
    1,
    'should have 1 reference to the remote object',
  );

  const slotOnB = ocapnB.engine.convertValToSlot(testObject);
  t.is(
    ocapnB.engine.getRefCount(slotOnB),
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
  const bootstrapB = ocapnA.getBootstrap();
  const echoObj = await E(bootstrapB).fetch(encodeSwissnum('Echo'));
  const echoObjSlot = ocapnA.engine.getSlotForValue(echoObj);

  if (!echoObjSlot) {
    throw new Error('echoObj should have a slot after being fetched');
  }
  t.is(
    ocapnA.engine.getRefCount(echoObjSlot),
    1,
    'should have 1 reference to the imported object',
  );

  // Before sending, objFromA should have no slot on A
  t.falsy(
    ocapnA.engine.getSlotForValue(objFromA),
    'objFromA should NOT have a slot before sending',
  );

  // Send objFromA to B's echo service and get it back
  await E(echoObj).echo(objFromA);

  t.is(
    ocapnA.engine.getRefCount(echoObjSlot),
    1,
    'should have 1 references to the imported object',
  );

  // After sending, objFromA should have a slot on A (it was exported)
  const objASlot = ocapnA.engine.getSlotForValue(objFromA);
  if (!objASlot) {
    throw new Error('objFromA should have a slot after being sent');
  }

  // Check the ref count of the sent object
  t.is(
    ocapnA.engine.getRefCount(objASlot),
    1,
    'should have 1 reference to the exported object',
  );
  await E(echoObj).echo(objFromA);
  t.is(
    ocapnA.engine.getRefCount(objASlot),
    2,
    'should have 2 references to the exported object',
  );
  await E(echoObj).echo(objFromA);
  t.is(
    ocapnA.engine.getRefCount(objASlot),
    3,
    'should have 3 references to the exported object',
  );
  await Promise.all([E(echoObj).echo(objFromA), E(echoObj).echo(objFromA)]);
  t.is(
    ocapnA.engine.getRefCount(objASlot),
    5,
    'should have 5 references to the exported object',
  );

  // Expect no additional references to the imported object
  t.is(
    ocapnA.engine.getRefCount(echoObjSlot),
    1,
    'should have 1 reference to the imported object',
  );

  await E(echoObj).echo(echoObj);

  // Expect one additional reference to the imported object
  t.is(
    ocapnA.engine.getRefCount(echoObjSlot),
    2,
    'should have 2 references to the imported object',
  );

  shutdownBoth();
});
