// @ts-check

/**
 * @import { Client } from '../src/client/types.js'
 * @import { OcapnLocation } from '../src/codecs/components.js'
 */

import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { testWithErrorUnwrapping } from './_util.js';
import { makeTcpNetLayer } from '../src/netlayers/tcp-test-only.js';
import { makeClient } from '../src/client/index.js';
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

/**
 * @param {string} debugLabel
 * @param {() => Map<string, any>} [makeDefaultSwissnumTable]
 * @returns {Promise<{ client: Client, location: OcapnLocation }>}
 */
const makeTestClient = async (debugLabel, makeDefaultSwissnumTable) => {
  const client = makeClient({
    debugLabel,
    swissnumTable: makeDefaultSwissnumTable && makeDefaultSwissnumTable(),
  });
  const tcpNetlayer = await makeTcpNetLayer({
    client,
    specifiedDesignator: debugLabel,
  });
  client.registerNetlayer(tcpNetlayer);
  const { location } = tcpNetlayer;
  return { client, location };
};

const makeTestClientTrio = async makeDefaultSwissnumTable => {
  const { client: clientA } = await makeTestClient(
    'A',
    makeDefaultSwissnumTable,
  );
  const { client: clientB, location: locationB } = await makeTestClient(
    'B',
    makeDefaultSwissnumTable,
  );
  const { client: clientC, location: locationC } = await makeTestClient(
    'C',
    makeDefaultSwissnumTable,
  );
  const shutdownAll = () => {
    clientA.shutdown();
    clientB.shutdown();
    clientC.shutdown();
  };
  // A -> B, A -> C
  const { ocapn: ocapnB } = await clientA.provideSession(locationB);
  const { ocapn: ocapnC } = await clientA.provideSession(locationC);
  const bootstrapB = await ocapnB.getBootstrap();
  const bootstrapC = await ocapnC.getBootstrap();
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
    await makeTestClientTrio(() => testObjectTable);

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
    await makeTestClientTrio(() => testObjectTable);

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
      await makeTestClientTrio(() => testObjectTable);

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

    const { client: clientA, location: locationA } = await makeTestClient(
      'A',
      () => testObjectTable,
    );
    const { client: clientB, location: locationB } = await makeTestClient(
      'B',
      () => testObjectTable,
    );
    const { client: clientC, location: locationC } = await makeTestClient(
      'C',
      () => testObjectTable,
    );

    try {
      // Set up sessions: A->B, A->C, C->B, and C->A
      const sessionAB = await clientA.provideSession(locationB);
      const sessionAC = await clientA.provideSession(locationC);
      const sessionCB = await clientC.provideSession(locationB);
      const sessionCA = await clientC.provideSession(locationA);

      // Get the bootstrap for B from both A and C
      const bootstrapBFromA = await sessionAB.ocapn.getBootstrap();
      const bootstrapBFromC = await sessionCB.ocapn.getBootstrap();

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
