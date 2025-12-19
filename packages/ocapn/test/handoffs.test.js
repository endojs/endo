// @ts-check

import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { testWithErrorUnwrapping, makeTestClient } from './_util.js';
import { encodeSwissnum, locationToLocationId } from '../src/client/util.js';
import {
  randomGiftId,
  signHandoffGive,
  signHandoffReceive,
} from '../src/cryptography.js';
import {
  makeHandoffGiveDescriptor,
  makeHandoffGiveSigEnvelope,
  makeHandoffReceiveDescriptor,
  makeHandoffReceiveSigEnvelope,
} from '../src/codecs/descriptors.js';

const makeTestClientTrio = async ({
  makeDefaultSwissnumTable,
  verbose = false,
}) => {
  const { client: clientA } = await makeTestClient({
    debugLabel: 'A',
    makeDefaultSwissnumTable,
    verbose,
  });
  const { client: clientB, location: locationB } = await makeTestClient({
    debugLabel: 'B',
    makeDefaultSwissnumTable,
    verbose,
  });
  const { client: clientC, location: locationC } = await makeTestClient({
    debugLabel: 'C',
    makeDefaultSwissnumTable,
    verbose,
  });
  const shutdownAll = () => {
    clientA.shutdown();
    clientB.shutdown();
    clientC.shutdown();
  };
  // A -> B, A -> C
  const { ocapn: ocapnB } = await clientA.provideSession(locationB);
  const { ocapn: ocapnC } = await clientA.provideSession(locationC);
  const bootstrapB = ocapnB.getRemoteBootstrap();
  const bootstrapC = ocapnC.getRemoteBootstrap();
  return {
    clientA,
    clientB,
    clientC,
    locationB,
    locationC,
    bootstrapB,
    bootstrapC,
    shutdownAll,
  };
};

testWithErrorUnwrapping('sturdyref transported as sturdyref', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Cat',
    Far('Cat', {
      pet: () => {
        console.log('The cat is petted.');
      },
    }),
  );
  testObjectTable.set(
    'CatSitter',
    Far('CatSitter', {
      takeCareOf: cat => {
        console.log('CatSitter called with', cat);
        return E(cat).pet();
      },
    }),
  );

  const { clientC, locationB, bootstrapB, bootstrapC, shutdownAll } =
    await makeTestClientTrio({
      makeDefaultSwissnumTable: () => testObjectTable,
    });

  const catB = await E(bootstrapB).fetch(encodeSwissnum('Cat'));
  const catSitterC = await E(bootstrapC).fetch(encodeSwissnum('CatSitter'));

  let clientCSessionForB;
  const locationIdB = locationToLocationId(locationB);

  clientCSessionForB = clientC.sessionManager.getActiveSession(locationIdB);
  t.falsy(clientCSessionForB, 'C has no session for B');
  await E(catSitterC).takeCareOf(catB);

  clientCSessionForB = clientC.sessionManager.getActiveSession(locationIdB);
  t.truthy(clientCSessionForB, 'C has a session for B');

  shutdownAll();
});

testWithErrorUnwrapping('third party handoff', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'ObjMaker',
    Far('ObjMaker', {
      makeObj: () => {
        return Far('Obj', {
          getNumber: () => 42,
        });
      },
    }),
  );
  testObjectTable.set(
    'ObjUser',
    Far('ObjUser', {
      useObj: obj => {
        console.log('ObjUser called with', obj);
        return E(obj).getNumber();
      },
    }),
  );

  const { clientC, locationB, bootstrapB, bootstrapC, shutdownAll } =
    await makeTestClientTrio({
      makeDefaultSwissnumTable: () => testObjectTable,
    });

  const objMakerB = await E(bootstrapB).fetch(encodeSwissnum('ObjMaker'));
  const objUserC = await E(bootstrapC).fetch(encodeSwissnum('ObjUser'));

  let clientCSessionForB;
  const locationIdB = locationToLocationId(locationB);

  clientCSessionForB = clientC.sessionManager.getActiveSession(locationIdB);
  t.falsy(clientCSessionForB, 'C has no session for B');

  const objB = await E(objMakerB).makeObj();
  const number = await E(objUserC).useObj(objB);
  t.is(number, 42, 'number is 42');

  clientCSessionForB = clientC.sessionManager.getActiveSession(locationIdB);
  t.truthy(clientCSessionForB, 'C has a session for B');

  shutdownAll();
});

testWithErrorUnwrapping(
  'multiple handoffs use unique handoff counts',
  async t => {
    const testObjectTable = new Map();
    testObjectTable.set(
      'ObjMaker',
      Far('ObjMaker', {
        makeObj: id => {
          return Far('Obj', {
            getId: () => id,
          });
        },
      }),
    );
    testObjectTable.set(
      'ObjUser',
      Far('ObjUser', {
        useObj: obj => {
          console.log('ObjUser called with', obj);
          return E(obj).getId();
        },
      }),
    );

    const { clientC, locationB, bootstrapB, bootstrapC, shutdownAll } =
      await makeTestClientTrio({
        makeDefaultSwissnumTable: () => testObjectTable,
      });

    const objMakerB = await E(bootstrapB).fetch(encodeSwissnum('ObjMaker'));
    const objUserC = await E(bootstrapC).fetch(encodeSwissnum('ObjUser'));

    // Perform multiple handoffs in sequence.
    // Each handoff from A->C involving B should use a different handoff count.
    const objB1 = await E(objMakerB).makeObj(1);
    const result1 = await E(objUserC).useObj(objB1);
    t.is(result1, 1, 'first handoff successful');

    // After first handoff, C->B session should exist
    const sessionCtoB = clientC.sessionManager.getActiveSession(
      locationToLocationId(locationB),
    );

    if (!sessionCtoB) {
      throw new Error('sessionCtoB is undefined');
    }

    t.truthy(sessionCtoB, 'C has session to B after first handoff');
    t.is(
      sessionCtoB.getHandoffCount(),
      1n,
      'handoff count is 1 after first handoff',
    );

    const objB2 = await E(objMakerB).makeObj(2);
    const result2 = await E(objUserC).useObj(objB2);
    t.is(result2, 2, 'second handoff successful');
    t.is(sessionCtoB.getHandoffCount(), 2n, 'handoff count incremented to 2');

    const objB3 = await E(objMakerB).makeObj(3);
    const result3 = await E(objUserC).useObj(objB3);
    t.is(result3, 3, 'third handoff successful');
    t.is(sessionCtoB.getHandoffCount(), 3n, 'handoff count incremented to 3');

    shutdownAll();
  },
);

testWithErrorUnwrapping(
  'replay attack: duplicate handoff-receive is rejected',
  async t => {
    const testObjectTable = new Map();
    const testObj = Far('TestObj', {
      getValue: () => 'test-value',
    });
    testObjectTable.set('TestObj', testObj);

    const { client: clientA, location: locationA } = await makeTestClient({
      debugLabel: 'A',
      makeDefaultSwissnumTable: () => testObjectTable,
    });
    const { client: clientB, location: locationB } = await makeTestClient({
      debugLabel: 'B',
      makeDefaultSwissnumTable: () => testObjectTable,
    });
    const { client: clientC, location: locationC } = await makeTestClient({
      debugLabel: 'C',
      makeDefaultSwissnumTable: () => testObjectTable,
    });

    try {
      // Set up sessions: A->B, A->C, C->B, and C->A
      const sessionAB = await clientA.provideSession(locationB);
      const sessionAC = await clientA.provideSession(locationC);
      const sessionCB = await clientC.provideSession(locationB);
      const sessionCA = await clientC.provideSession(locationA);

      // Get the bootstrap for B from both A and C
      const bootstrapBFromA = sessionAB.ocapn.getRemoteBootstrap();
      const bootstrapBFromC = sessionCB.ocapn.getRemoteBootstrap();

      // A gets an object from B
      const testObjB = await E(bootstrapBFromA).fetch(
        encodeSwissnum('TestObj'),
      );

      // A deposits ONE gift at B for C
      const giftId = randomGiftId();

      // Create handoff-give using A's view of C (sessionAC.peer is C from A's perspective)
      const handoffGive = makeHandoffGiveDescriptor(
        sessionAC.peer.publicKey.descriptor, // C's public key from A's perspective
        locationB,
        sessionAB.id,
        sessionAB.self.keyPair.publicKey.id,
        giftId,
      );
      const signatureGive = signHandoffGive(
        handoffGive,
        sessionAB.self.keyPair,
      );
      const signedGive = makeHandoffGiveSigEnvelope(handoffGive, signatureGive);

      await E(bootstrapBFromA)['deposit-gift'](giftId, testObjB);

      // C withdraws the gift the FIRST time with handoff-count = 0
      const handoffCount0 = 0n;
      const handoffReceive1 = makeHandoffReceiveDescriptor(
        signedGive,
        handoffCount0,
        sessionCB.id,
        sessionCB.self.keyPair.publicKey.id,
      );
      const signatureReceive1 = signHandoffReceive(
        handoffReceive1,
        sessionCA.self.keyPair,
      );
      const signedReceive1 = makeHandoffReceiveSigEnvelope(
        handoffReceive1,
        signatureReceive1,
      );

      // First withdrawal should succeed
      const withdrawnObj1 =
        await E(bootstrapBFromC)['withdraw-gift'](signedReceive1);
      const value1 = await E(withdrawnObj1).getValue();
      t.is(
        value1,
        'test-value',
        'first withdrawal with handoff-count 0 succeeds',
      );

      // Try to withdraw THE SAME GIFT again with the SAME handoff-count = 0 (replay attack)
      const handoffReceive2 = makeHandoffReceiveDescriptor(
        signedGive,
        handoffCount0, // Same count - this is the replay attack
        sessionCB.id,
        sessionCB.self.keyPair.publicKey.id,
      );
      const signatureReceive2 = signHandoffReceive(
        handoffReceive2,
        sessionCA.self.keyPair,
      );
      const signedReceive2 = makeHandoffReceiveSigEnvelope(
        handoffReceive2,
        signatureReceive2,
      );

      // Second withdrawal with reused handoff-count should fail
      let replayError;
      try {
        await E(bootstrapBFromC)['withdraw-gift'](signedReceive2);
        t.fail('replay attack should have been rejected');
      } catch (error) {
        replayError = error;
      }

      t.truthy(replayError, 'replay attack threw an error');
      t.regex(
        String(replayError.message),
        /Gift handoff already used/,
        'error mentions handoff already used',
      );
      t.regex(
        String(replayError.message),
        /0/,
        'error mentions the reused handoff count 0',
      );
    } finally {
      clientA.shutdown();
      clientB.shutdown();
      clientC.shutdown();
    }
  },
);

testWithErrorUnwrapping('deposit-gift rejects non-local gift', async t => {
  // This test verifies that deposit-gift properly rejects gifts that are not
  // local to the exporter.
  //
  // Scenario:
  // - A creates a local object (objA)
  // - A tries to deposit objA at B as a gift for C
  // - B receives objA as an IMPORT (not local to B)
  // - B rejects the deposit with "Gift must be local"
  const testObjectTable = new Map();

  // A creates its own local object
  const objA = Far('ObjA', {
    getValue: () => 'from-A',
  });

  const { client: clientA } = await makeTestClient({
    debugLabel: 'A',
    makeDefaultSwissnumTable: () => testObjectTable,
  });
  const { client: clientB, location: locationB } = await makeTestClient({
    debugLabel: 'B',
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    // Set up session: A->B
    const sessionAB = await clientA.provideSession(locationB);
    const bootstrapBFromA = sessionAB.ocapn.getRemoteBootstrap();

    // A tries to deposit its own local object (objA) at B
    // When B receives this, objA will be an IMPORT (not local to B)
    // B should reject this deposit
    const giftId = randomGiftId();

    // Attempt to deposit A's local object at B
    // B should reject because objA is not local to B
    let depositError;
    try {
      await E(bootstrapBFromA)['deposit-gift'](giftId, objA);
      t.fail('Expected deposit-gift to reject non-local gift');
    } catch (error) {
      depositError = error;
    }

    t.truthy(depositError, 'deposit-gift threw an error');
    t.regex(
      String(depositError.message),
      /Gift must be local/,
      'error mentions gift must be local',
    );
  } finally {
    clientA.shutdown();
    clientB.shutdown();
  }
});

testWithErrorUnwrapping(
  'deposit-gift rejects non-remotable gift (struct)',
  async t => {
    // This test verifies that deposit-gift properly rejects gifts that are not
    // remotables (e.g., structs/copyRecords).
    const testObjectTable = new Map();

    const { client: clientA } = await makeTestClient({
      debugLabel: 'A',
      makeDefaultSwissnumTable: () => testObjectTable,
    });
    const { client: clientB, location: locationB } = await makeTestClient({
      debugLabel: 'B',
      makeDefaultSwissnumTable: () => testObjectTable,
    });

    try {
      // Set up session: A->B
      const sessionAB = await clientA.provideSession(locationB);
      const bootstrapBFromA = sessionAB.ocapn.getRemoteBootstrap();

      // A tries to deposit a struct (copyRecord) at B
      // B should reject because structs are not remotables
      const giftId = randomGiftId();
      const structGift = harden({ foo: 'bar', count: 42 });

      let depositError;
      try {
        await E(bootstrapBFromA)['deposit-gift'](giftId, structGift);
        t.fail('Expected deposit-gift to reject non-remotable gift');
      } catch (error) {
        depositError = error;
      }

      t.truthy(depositError, 'deposit-gift threw an error');
      t.regex(
        String(depositError.message),
        /Gift must be remotable/,
        'error mentions gift must be remotable',
      );
    } finally {
      clientA.shutdown();
      clientB.shutdown();
    }
  },
);

testWithErrorUnwrapping(
  'handoff of answer local to exporter succeeds',
  async t => {
    // This test verifies that an "answer" (promise result from a deliver operation)
    // that is local to the exporter can be successfully handed off.
    const testObjectTable = new Map();

    // B has an ObjMaker that creates local objects
    testObjectTable.set(
      'ObjMaker',
      Far('ObjMaker', {
        makeObj: id => {
          // This object is created locally at B
          return Far('LocalObj', {
            getId: () => id,
          });
        },
      }),
    );

    // C has an ObjUser that uses objects
    testObjectTable.set(
      'ObjUser',
      Far('ObjUser', {
        useObj: obj => {
          console.log('ObjUser called with', obj);
          return E(obj).getId();
        },
      }),
    );

    const { clientC, locationB, bootstrapB, bootstrapC, shutdownAll } =
      await makeTestClientTrio({
        makeDefaultSwissnumTable: () => testObjectTable,
      });

    // A asks B's ObjMaker to create an object
    // The returned object is an "answer" - the result of a question
    // This answer is local to B (created by B's ObjMaker)
    const objMakerB = await E(bootstrapB).fetch(encodeSwissnum('ObjMaker'));

    // Get the ObjUser from C
    const objUserC = await E(bootstrapC).fetch(encodeSwissnum('ObjUser'));

    // Verify C doesn't have a session with B yet
    const locationIdB = locationToLocationId(locationB);
    let clientCSessionForB =
      clientC.sessionManager.getActiveSession(locationIdB);
    t.falsy(clientCSessionForB, 'C has no session for B initially');

    // A asks B to make an object - this creates an "answer" local to B
    const localObjFromB = await E(objMakerB).makeObj('answer-test');

    // A hands off this answer to C via B
    // This should work because the answer (LocalObj) is local to the exporter (B)
    const result = await E(objUserC).useObj(localObjFromB);
    t.is(
      result,
      'answer-test',
      'answer local to exporter was handed off successfully',
    );

    // Verify C now has a session with B (handoff occurred)
    clientCSessionForB = clientC.sessionManager.getActiveSession(locationIdB);
    t.truthy(clientCSessionForB, 'C has a session for B after handoff');

    shutdownAll();
  },
);
