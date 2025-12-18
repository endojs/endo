// @ts-check
/* global setTimeout */

import test from '@endo/ses-ava/test.js';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { isPromise } from '@endo/promise-kit';
import {
  waitUntilTrue,
  testWithErrorUnwrapping,
  makeTestClient,
  makeTestClientPair,
} from './_util.js';
import { encodeSwissnum } from '../src/client/util.js';
import { makeOcapnKeyPair, signLocation } from '../src/cryptography.js';
import { writeOcapnHandshakeMessage } from '../src/codecs/operations.js';

test('test slow send', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Say Hello',
    Far('sayHello', name => {
      return `Hello ${name}`;
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  const {
    sessionA: { ocapn: ocapnA },
  } = await establishSession();
  const helloer = await E(ocapnA.getRemoteBootstrap()).fetch(
    encodeSwissnum('Say Hello'),
  );
  const result = await E(helloer)('Wuurl');
  t.is(result, 'Hello Wuurl');

  shutdownBoth();
});

test('basic eventual send', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Say Hello',
    Far('sayHello', name => {
      return `Hello ${name}`;
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  const {
    sessionA: { ocapn: ocapnA },
  } = await establishSession();
  const bootstrapB = ocapnA.getRemoteBootstrap();

  const helloer = E(bootstrapB).fetch(encodeSwissnum('Say Hello'));
  const result = await E(helloer)('Wuurl');

  t.is(result, 'Hello Wuurl');

  shutdownBoth();
});

testWithErrorUnwrapping(
  'exported promises dont conflict with answer position',
  async t => {
    const testObjectTable = new Map();
    testObjectTable.set(
      'Get Promises',
      Far('getPromises', () => {
        // return a bunch of promises to populate the local export table
        return [
          Promise.resolve('Why'),
          Promise.resolve('Hello'),
          Promise.resolve('There'),
        ];
      }),
    );
    testObjectTable.set(
      'Deep Number',
      Far('getNumberGetter', () => {
        return Far('getNumber', () => 42);
      }),
    );

    const { establishSession, shutdownBoth } = await makeTestClientPair({
      makeDefaultSwissnumTable: () => testObjectTable,
    });

    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();
    const bootstrapA = ocapnA.getRemoteBootstrap();

    const getPromises = E(bootstrapA).fetch(encodeSwissnum('Get Promises'));
    const promises = await E(getPromises)();

    // Do some promise pipelining so that incorrectly implemented answerPositions
    // could conflict with exported promises
    const getNumberGetter = E(bootstrapA).fetch(encodeSwissnum('Deep Number'));
    const numberGetter = E(getNumberGetter)();
    const number = await E(numberGetter)();
    t.is(number, 42, 'Number is 42');

    // Sanity check
    t.truthy(
      promises.every(p => isPromise(p)),
      'All promises',
    );
    const results = await Promise.all(promises);
    t.deepEqual(results, ['Why', 'Hello', 'There'], 'All promises resolved');

    shutdownBoth();
  },
);

test('refuses to connect to self', async t => {
  const { client, location } = await makeTestClient({
    debugLabel: 'self-connect-test',
  });

  // Attempt to connect to our own location
  const error = await t.throwsAsync(
    async () => {
      await client.provideSession(location);
    },
    {
      instanceOf: Error,
      message: 'Refusing to connect to self',
    },
  );

  t.truthy(error, 'Error was thrown');

  client.shutdown();
});

test('client aborts on start-session with wrong version', async t => {
  const { clientKitA, clientKitB, establishSession, shutdownBoth } =
    await makeTestClientPair();

  // Create a start-session message with wrong version
  const keyPair = makeOcapnKeyPair();
  const locationSignature = signLocation(clientKitA.location, keyPair);
  const badStartSession = {
    type: 'op:start-session',
    captpVersion: 'BAD', // Wrong version!
    sessionPublicKey: keyPair.publicKey.descriptor,
    location: clientKitA.location,
    locationSignature,
  };

  const { connection: firstConnection } =
    clientKitA.netlayer.testing.establishConnection(clientKitB.location);

  try {
    t.false(firstConnection.isDestroyed, 'Connection should not be destroyed');

    const bytes = writeOcapnHandshakeMessage(badStartSession);
    firstConnection.write(bytes);
    await waitUntilTrue(() => firstConnection.isDestroyed);

    t.true(firstConnection.isDestroyed, 'Connection should be destroyed');

    // Can establish a new session after the first connection fails.
    const {
      sessionA: { connection: secondConnectionAtoB },
      sessionB: { connection: secondConnectionBtoA },
    } = await establishSession();
    t.false(
      secondConnectionAtoB.isDestroyed,
      'Connection A to B should not be destroyed',
    );
    t.false(
      secondConnectionBtoA.isDestroyed,
      'Connection B to A should not be destroyed',
    );
  } finally {
    firstConnection.end();
    shutdownBoth();
  }
});

test('client aborts on unparseable message BEFORE establishing session', async t => {
  const { clientKitA, clientKitB, establishSession, shutdownBoth } =
    await makeTestClientPair();

  const { connection: firstConnection } =
    clientKitA.netlayer.testing.establishConnection(clientKitB.location);

  try {
    t.false(firstConnection.isDestroyed, 'Connection should not be destroyed');

    // Send junk bytes that cannot be parsed
    const junkBytes = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc, 0xfb]);
    firstConnection.write(junkBytes);

    // Wait for the message to be processed and firstConnection to be destroyed
    await waitUntilTrue(() => firstConnection.isDestroyed);

    t.true(
      firstConnection.isDestroyed,
      'Connection should be destroyed after sending unparseable message',
    );

    // Can establish a new session after the first connection fails.
    const {
      sessionA: { connection: secondConnectionAtoB },
      sessionB: { connection: secondConnectionBtoA },
    } = await establishSession();
    t.false(
      secondConnectionAtoB.isDestroyed,
      'Connection A to B should not be destroyed',
    );
    t.false(
      secondConnectionBtoA.isDestroyed,
      'Connection B to A should not be destroyed',
    );
  } finally {
    firstConnection.end();
    shutdownBoth();
  }
});

test('client aborts on unparseable message AFTER establishing session', async t => {
  const {
    establishSession,
    shutdownBoth,
    getConnectionAtoB,
    getConnectionBtoA,
    clientKitA,
    clientKitB,
  } = await makeTestClientPair();

  try {
    await establishSession();

    const connectionAtoB = getConnectionAtoB();
    const connectionBtoA = getConnectionBtoA();

    if (!connectionAtoB || !connectionBtoA) {
      throw new Error('Connections A to B and B to A should exist');
    }

    t.false(
      connectionAtoB.isDestroyed,
      'Connection A to B should not be destroyed',
    );
    t.false(
      connectionBtoA.isDestroyed,
      'Connection B to A should not be destroyed',
    );

    // Send junk bytes that cannot be parsed
    const junkBytes = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc, 0xfb]);
    connectionAtoB.write(junkBytes);

    // Wait for the message to be processed, connection destroyed, and sessions cleaned up
    await waitUntilTrue(
      () =>
        connectionAtoB.isDestroyed &&
        connectionBtoA.isDestroyed &&
        !clientKitA.client.sessionManager.getActiveSession(
          clientKitB.locationId,
        ) &&
        !clientKitB.client.sessionManager.getActiveSession(
          clientKitA.locationId,
        ),
    );

    t.true(
      connectionAtoB.isDestroyed,
      'Connection A to B should be destroyed after sending unparseable message',
    );
    t.true(
      connectionBtoA.isDestroyed,
      'Client B connection should be destroyed after receiving unparseable message',
    );

    // Can establish a new session after the first connection fails.
    const { sessionA, sessionB } = await establishSession();
    const secondConnectionAtoB = sessionA.connection;
    const secondConnectionBtoA = sessionB.connection;

    t.false(
      secondConnectionAtoB.isDestroyed,
      `Second connection A to B should not be destroyed (isDestroyed: ${secondConnectionAtoB.isDestroyed})`,
    );
    t.false(
      secondConnectionBtoA.isDestroyed,
      `Second connection B to A should not be destroyed (isDestroyed: ${secondConnectionBtoA.isDestroyed})`,
    );
  } finally {
    shutdownBoth();
  }
});

test('provideSession throws and cleans up pending session on handshake abort', async t => {
  // Create client A with correct version and client B with wrong version
  const { clientKitA, clientKitB } = await makeTestClientPair({
    clientBOptions: {
      captpVersion: 'BAD',
    },
  });

  const hasPendingSession = () => {
    const pendingSession =
      clientKitA.client.sessionManager.getPendingSessionPromise(
        clientKitB.locationId,
      );
    return pendingSession !== undefined;
  };

  try {
    // Attempt to establish session from A to B
    // A will send op:start-session with version 1.0
    // B will accept it and send back op:start-session with version "BAD"
    // A will reject B's version and send op:abort
    const sessionPromise = clientKitA.client.provideSession(
      clientKitB.location,
    );

    t.true(hasPendingSession(), 'Pending session should exist');

    const error = await t.throwsAsync(
      async () => {
        await sessionPromise;
      },
      {
        instanceOf: Error,
      },
      'provideSession should throw when handshake is aborted',
    );

    t.truthy(error, 'Error should be thrown');
    t.regex(
      error.message,
      /Connection closed during handshake|Session ended/,
      'Error message should indicate connection or session failure',
    );

    t.false(
      hasPendingSession(),
      'Pending session should be cleaned up after handshake abort',
    );

    // Verify active session was not created
    const activeSession = clientKitA.client.sessionManager.getActiveSession(
      clientKitB.locationId,
    );
    t.is(
      activeSession,
      undefined,
      'Active session should not exist after handshake abort',
    );
  } finally {
    clientKitA.client.shutdown();
    clientKitB.client.shutdown();
  }
});

test('session can be re-established after normal abort', async t => {
  const {
    establishSession,
    shutdownBoth,
    getConnectionAtoB,
    getConnectionBtoA,
    clientKitA,
    clientKitB,
  } = await makeTestClientPair();

  try {
    // Establish first session
    const { sessionA: firstSessionA, sessionB: firstSessionB } =
      await establishSession();

    const firstConnectionAtoB = getConnectionAtoB();
    const firstConnectionBtoA = getConnectionBtoA();

    if (!firstConnectionAtoB || !firstConnectionBtoA) {
      throw new Error('Connections A to B and B to A should exist');
    }

    t.truthy(firstConnectionAtoB, 'First connection A to B should exist');
    t.truthy(firstConnectionBtoA, 'First connection B to A should exist');
    t.false(
      firstConnectionAtoB.isDestroyed,
      'First connection A to B should not be destroyed',
    );
    t.false(
      firstConnectionBtoA.isDestroyed,
      'First connection B to A should not be destroyed',
    );

    // Verify sessions are active
    t.truthy(
      clientKitA.client.sessionManager.getActiveSession(clientKitB.locationId),
      'Session from A to B should be active',
    );
    t.truthy(
      clientKitB.client.sessionManager.getActiveSession(clientKitA.locationId),
      'Session from B to A should be active',
    );

    // Abort the session from A's side
    firstSessionA.ocapn.abort('Normal abort for testing');

    // Wait for connections to close and sessions to be cleaned up
    await waitUntilTrue(
      () =>
        firstConnectionAtoB.isDestroyed &&
        firstConnectionBtoA.isDestroyed &&
        !clientKitA.client.sessionManager.getActiveSession(
          clientKitB.locationId,
        ) &&
        !clientKitB.client.sessionManager.getActiveSession(
          clientKitA.locationId,
        ),
    );

    t.true(
      firstConnectionAtoB.isDestroyed,
      'First connection A to B should be destroyed after abort',
    );
    t.true(
      firstConnectionBtoA.isDestroyed,
      'First connection B to A should be destroyed after abort',
    );

    // Verify sessions are no longer active
    t.is(
      clientKitA.client.sessionManager.getActiveSession(clientKitB.locationId),
      undefined,
      'Session from A to B should not be active after abort',
    );
    t.is(
      clientKitB.client.sessionManager.getActiveSession(clientKitA.locationId),
      undefined,
      'Session from B to A should not be active after abort',
    );

    // Establish second session
    const { sessionA: secondSessionA, sessionB: secondSessionB } =
      await establishSession();

    // Get connections directly from the sessions, not from lookups
    const secondConnectionAtoB = secondSessionA.connection;
    const secondConnectionBtoA = secondSessionB.connection;

    t.truthy(secondConnectionAtoB, 'Second connection A to B should exist');
    t.truthy(secondConnectionBtoA, 'Second connection B to A should exist');
    t.false(
      secondConnectionAtoB.isDestroyed,
      `Second connection A to B should not be destroyed (is: ${secondConnectionAtoB.isDestroyed})`,
    );
    t.false(
      secondConnectionBtoA.isDestroyed,
      `Second connection B to A should not be destroyed (is: ${secondConnectionBtoA.isDestroyed})`,
    );

    // Verify new sessions are active
    t.truthy(
      clientKitA.client.sessionManager.getActiveSession(clientKitB.locationId),
      'New session from A to B should be active',
    );
    t.truthy(
      clientKitB.client.sessionManager.getActiveSession(clientKitA.locationId),
      'New session from B to A should be active',
    );

    // Verify it's a different session
    t.not(
      secondSessionA,
      firstSessionA,
      'Second session A should be different from first',
    );
    t.not(
      secondSessionB,
      firstSessionB,
      'Second session B should be different from first',
    );

    // Verify it's a different connection
    t.not(
      secondConnectionAtoB,
      firstConnectionAtoB,
      'Second connection A to B should be different from first',
    );
    t.not(
      secondConnectionBtoA,
      firstConnectionBtoA,
      'Second connection B to A should be different from first',
    );
  } finally {
    shutdownBoth();
  }
});

test('connection not aborted when remote function throws', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Thrower',
    Far('thrower', () => {
      throw Error('Expected error from remote function');
    }),
  );

  const { establishSession, getConnectionAtoB, shutdownBoth } =
    await makeTestClientPair({
      makeDefaultSwissnumTable: () => testObjectTable,
    });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();

    const connectionAtoB = getConnectionAtoB();
    if (!connectionAtoB) {
      throw new Error('Connection A to B should exist');
    }

    // Fetch the thrower
    const bootstrapB = ocapnA.getRemoteBootstrap();
    const thrower = E(bootstrapB).fetch(encodeSwissnum('Thrower'));

    // This should reject but not close the connection
    try {
      await E(thrower)();
      t.fail('Expected thrower to throw an error');
    } catch (error) {
      // Error should be received (may be a serialized error descriptor)
      t.truthy(error, 'Remote function should throw');
    }

    // Wait a bit to see if connection closes
    await new Promise(resolve => setTimeout(resolve, 100));

    t.false(
      connectionAtoB.isDestroyed,
      'Connection should NOT be destroyed when remote function throws',
    );
  } finally {
    shutdownBoth();
  }
});

testWithErrorUnwrapping(
  'promise pipelining on Bob promise resolving to Alice object',
  async t => {
    const bobObjectTable = new Map();
    bobObjectTable.set(
      'EchoObj',
      Far('echoObj', {
        echo: async obj => obj,
      }),
    );

    const { establishSession, shutdownBoth } = await makeTestClientPair({
      makeDefaultSwissnumTable: () => bobObjectTable,
    });

    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();

    // Alice creates a local object
    const aliceFooObj = Far('fooObj', {
      xyz: () => 42,
    });

    // Alice gets Bob's EchoObj
    const bootstrapB = ocapnA.getRemoteBootstrap();
    const bobEchoObj = await E(bootstrapB).fetch(encodeSwissnum('EchoObj'));

    // Alice calls echo with her local object (without awaiting)
    const echoPromise = E(bobEchoObj).echo(aliceFooObj);

    // Alice immediately pipelines a call to the promise
    // This should work even though the promise hasn't resolved yet
    const result1 = await E(echoPromise).xyz();

    t.is(result1, 42, 'Pipelined call should succeed');
    shutdownBoth();
  },
);

testWithErrorUnwrapping(
  'promise pipelining with answer promise echoed through Bob',
  async t => {
    const bobObjectTable = new Map();
    bobObjectTable.set(
      'EchoObj',
      Far('echoObj', {
        echo: async obj => obj,
      }),
    );

    const { establishSession, shutdownBoth } = await makeTestClientPair({
      makeDefaultSwissnumTable: () => bobObjectTable,
    });

    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();

    // Alice creates a local object that returns a promise
    const aliceSlowObj = Far('slowObj', {
      slowMethod: async () => {
        return Far('resultObj', {
          getValue: () => 99,
        });
      },
    });

    // Alice creates an answer promise by calling slowMethod without awaiting
    const answerPromise = E(aliceSlowObj).slowMethod();

    // Alice gets Bob's EchoObj
    const bootstrapB = ocapnA.getRemoteBootstrap();
    const bobEchoObj = await E(bootstrapB).fetch(encodeSwissnum('EchoObj'));

    // Alice passes the answer promise to Bob's echo method
    const echoedAnswerPromise = E(bobEchoObj).echo(answerPromise);

    // Alice pipelines a call through the echoed answer promise
    // This tests that answer promises can be echoed and still work correctly
    const result = await E(echoedAnswerPromise).getValue();

    t.is(result, 99, 'Pipelined call on echoed answer promise should succeed');
    shutdownBoth();
  },
);

testWithErrorUnwrapping(
  'deliver to promise resolving to sturdyref should fail without disconnecting (can only deliver to "remotable" pass-style)',
  async t => {
    const testObjectTable = new Map();
    testObjectTable.set(
      'SturdyRefReturner',
      Far('sturdyRefReturner', {
        getSturdyRef: location =>
          // eslint-disable-next-line no-use-before-define
          clientKitB.client.makeSturdyRef(location, encodeSwissnum('target')),
      }),
    );

    const { establishSession, shutdownBoth, clientKitB, getConnectionAtoB } =
      await makeTestClientPair({
        makeDefaultSwissnumTable: () => testObjectTable,
      });

    try {
      const {
        sessionA: { ocapn: ocapnA },
      } = await establishSession();

      const connectionAtoB = getConnectionAtoB();
      if (!connectionAtoB) {
        throw new Error('Connection A to B should exist');
      }

      // Get Bob's SturdyRefReturner
      const bootstrapB = ocapnA.getRemoteBootstrap();
      const sturdyRefReturner = await E(bootstrapB).fetch(
        encodeSwissnum('SturdyRefReturner'),
      );

      // Get a promise that will resolve to a sturdyref
      // (Bob's method returns a sturdyref)
      const promiseThatResolvesToSturdyRef = E(sturdyRefReturner).getSturdyRef(
        clientKitB.location,
      );

      // Attempt to deliver to this promise should fail when it resolves
      // because sturdyref pass-style is not 'remotable'
      const error = await t.throwsAsync(
        async () => {
          await E(promiseThatResolvesToSturdyRef)(
            'some-method',
            'arg1',
            'arg2',
          );
        },
        {
          instanceOf: Error,
          message: /Cannot apply functions to values with pass-style sturdyref/,
        },
        'Delivering to a promise that resolves to a sturdyref should throw',
      );

      t.truthy(error, 'Error should be thrown');

      // Wait a bit to ensure no disconnection happens
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify connection is still active
      t.false(
        connectionAtoB.isDestroyed,
        'Connection should NOT be destroyed when deliver fails due to wrong pass-style',
      );

      // Verify we can still make successful calls
      const anotherSturdyRef = await E(sturdyRefReturner).getSturdyRef(
        clientKitB.location,
      );
      t.truthy(anotherSturdyRef, 'Should still be able to make calls');
    } finally {
      shutdownBoth();
    }
  },
);
