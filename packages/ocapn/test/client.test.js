// @ts-check
/* global setTimeout */

import test from '@endo/ses-ava/test.js';
import { E } from '@endo/eventual-send';
import { Far, makeTagged } from '@endo/marshal';
import { isPromise } from '@endo/promise-kit';
import {
  waitUntilTrue,
  testWithErrorUnwrapping,
  makeTestClient,
  makeTestClientPair,
  makeUntagTestHelper,
  getOcapnDebug,
} from './_util.js';
import { encodeSwissnum } from '../src/client/util.js';
import { makeOcapnKeyPair, signLocation } from '../src/cryptography.js';
import { writeOcapnHandshakeMessage } from '../src/codecs/operations.js';
import { makeSlot } from '../src/captp/pairwise.js';

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
    firstSessionA.ocapn.abort(Error('Normal abort for testing'));

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
      'SlowObj',
      Far('slowObj', {
        slowMethod: async () => {
          return Far('resultObj', {
            getValue: () => 99,
          });
        },
      }),
    );
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
    const bootstrapB = ocapnA.getRemoteBootstrap();

    // Alice gets Bob's SlowObj (a REMOTE object)
    const bobSlowObj = await E(bootstrapB).fetch(encodeSwissnum('SlowObj'));

    // Alice calls slowMethod on the REMOTE object, creating a REMOTE answer promise
    // This is the key difference: answerPromise is a remote answer (a-N slot), not a local promise
    const answerPromise = E(bobSlowObj).slowMethod();

    // Alice gets Bob's EchoObj
    const bobEchoObj = await E(bootstrapB).fetch(encodeSwissnum('EchoObj'));

    // Alice passes the remote answer promise to Bob's echo method
    // This tests that remote answer promises can be sent as arguments,
    // and that they can be returned (as re-exported promises).
    const echoedAnswerPromise = E(bobEchoObj).echo(answerPromise);
    // Due to promise wrapping, we will not be able to directly inspect the echoed answer promise in the OcapnTable.
    // It is is expected to be returned as a new export-promise (p-N slot).

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

test('op:get with valid copyRecord', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Record Provider',
    Far('recordProvider', () => {
      return harden({ foo: 'bar', baz: 42, nested: { value: 'deep' } });
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();
    const bootstrapB = ocapnA.getRemoteBootstrap();

    const recordProvider = E(bootstrapB).fetch(
      encodeSwissnum('Record Provider'),
    );
    const record = E(recordProvider)();

    // Use E.get to retrieve fields from the record
    const fooValue = await E.get(record).foo;
    const bazValue = await E.get(record).baz;
    const nestedValue = await E.get(record).nested;

    t.is(fooValue, 'bar');
    t.is(bazValue, 42);
    t.deepEqual(nestedValue, { value: 'deep' });
  } finally {
    shutdownBoth();
  }
});

test('op:get with missing field rejects', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Record Provider',
    Far('recordProvider', () => {
      return harden({ foo: 'bar', baz: 42 });
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();
    const bootstrapB = ocapnA.getRemoteBootstrap();

    const recordProvider = E(bootstrapB).fetch(
      encodeSwissnum('Record Provider'),
    );
    const record = E(recordProvider)();

    // Try to get a non-existent field
    const error = await t.throwsAsync(
      async () => {
        await E.get(record).nonExistent;
      },
      {
        instanceOf: Error,
      },
    );

    t.regex(error.message, /Field 'nonExistent' not found on record/);
  } finally {
    shutdownBoth();
  }
});

test('op:get rejects non-copyRecord', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Remotable Provider',
    Far('remotableProvider', () => {
      return Far('remotableObject', {
        someMethod: () => 'result',
      });
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();
    const bootstrapB = ocapnA.getRemoteBootstrap();

    const remotableProvider = E(bootstrapB).fetch(
      encodeSwissnum('Remotable Provider'),
    );
    const remotable = E(remotableProvider)();

    // Try to get a field from a remotable (should fail)
    const error = await t.throwsAsync(
      async () => {
        await E.get(remotable).someField;
      },
      {
        instanceOf: Error,
      },
    );

    t.regex(
      error.message,
      /Cannot get fields from values with pass-style remotable/,
    );
  } finally {
    shutdownBoth();
  }
});

test('op:get with promise pipelining', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Async Record Provider',
    Far('asyncRecordProvider', async () => {
      // Simulate async work
      await new Promise(resolve => setTimeout(resolve, 10));
      return harden({ delayed: 'value', count: 99 });
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();
    const bootstrapB = ocapnA.getRemoteBootstrap();

    const asyncRecordProvider = E(bootstrapB).fetch(
      encodeSwissnum('Async Record Provider'),
    );
    // Pipeline: get the field before the promise resolves
    const recordPromise = E(asyncRecordProvider)();
    const delayedValue = E.get(recordPromise).delayed;
    const countValue = E.get(recordPromise).count;

    t.is(await delayedValue, 'value');
    t.is(await countValue, 99);
  } finally {
    shutdownBoth();
  }
});

test('op:get with rejected promise', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Rejecting Provider',
    Far('rejectingProvider', () => {
      return Promise.reject(Error('Intentional rejection'));
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();
    const bootstrapB = ocapnA.getRemoteBootstrap();

    const rejectingProvider = E(bootstrapB).fetch(
      encodeSwissnum('Rejecting Provider'),
    );
    const rejectedPromise = E(rejectingProvider)();

    // Try to get a field from a rejected promise
    const error = await t.throwsAsync(
      async () => {
        await E.get(rejectedPromise).someField;
      },
      {
        instanceOf: Error,
      },
    );

    t.regex(error.message, /Intentional rejection/);
  } finally {
    shutdownBoth();
  }
});

test('op:index with valid array (awaiting)', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Array Provider',
    Far('arrayProvider', () => {
      return harden(['first', 'second', 'third', 42]);
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();
    const bootstrapB = ocapnA.getRemoteBootstrap();

    const arrayProvider = await E(bootstrapB).fetch(
      encodeSwissnum('Array Provider'),
    );
    const array = await E(arrayProvider)();

    // Use E.get with numeric index to retrieve array elements
    const firstValue = await E.get(array)[0];
    const secondValue = await E.get(array)[1];
    const lastValue = await E.get(array)[3];

    t.is(firstValue, 'first');
    t.is(secondValue, 'second');
    t.is(lastValue, 42);
  } finally {
    shutdownBoth();
  }
});

test('op:index with valid array (pipelining)', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Array Provider',
    Far('arrayProvider', () => {
      return harden(['alpha', 'beta', 'gamma']);
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();
    const bootstrapB = ocapnA.getRemoteBootstrap();

    const arrayProvider = E(bootstrapB).fetch(encodeSwissnum('Array Provider'));
    // Pipeline: get the element before awaiting the provider
    const arrayPromise = E(arrayProvider)();
    const firstElement = E.get(arrayPromise)[0];
    const secondElement = E.get(arrayPromise)[1];

    t.is(await firstElement, 'alpha');
    t.is(await secondElement, 'beta');
  } finally {
    shutdownBoth();
  }
});

test('op:index with out-of-bounds index rejects', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Array Provider',
    Far('arrayProvider', () => {
      return harden(['only', 'two', 'items']);
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();
    const bootstrapB = ocapnA.getRemoteBootstrap();

    // Use pipelining so the access goes through CapTP
    const arrayProvider = E(bootstrapB).fetch(encodeSwissnum('Array Provider'));
    const arrayPromise = E(arrayProvider)();

    // Try to access an out-of-bounds index via pipelining
    const error = await t.throwsAsync(
      async () => {
        await E.get(arrayPromise)[10];
      },
      {
        instanceOf: Error,
      },
    );

    t.regex(error.message, /Index 10 out of bounds/);
  } finally {
    shutdownBoth();
  }
});

test('op:index rejects non-array (copyRecord)', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Record Provider',
    Far('recordProvider', () => {
      return harden({ foo: 'bar', baz: 42 });
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();
    const bootstrapB = ocapnA.getRemoteBootstrap();

    // Use pipelining so the access goes through CapTP
    const recordProvider = E(bootstrapB).fetch(
      encodeSwissnum('Record Provider'),
    );
    const recordPromise = E(recordProvider)();

    // Try to index into a record via pipelining (should fail)
    const error = await t.throwsAsync(
      async () => {
        await E.get(recordPromise)[0];
      },
      {
        instanceOf: Error,
      },
    );

    t.regex(
      error.message,
      /Cannot index into values with pass-style copyRecord/,
    );
  } finally {
    shutdownBoth();
  }
});

test('op:index with rejected promise propagates rejection', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Rejecting Provider',
    Far('rejectingProvider', () => {
      return Promise.reject(Error('Array fetch failed'));
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();
    const bootstrapB = ocapnA.getRemoteBootstrap();

    const rejectingProvider = E(bootstrapB).fetch(
      encodeSwissnum('Rejecting Provider'),
    );
    const rejectedPromise = E(rejectingProvider)();

    // Try to index into a rejected promise
    const error = await t.throwsAsync(
      async () => {
        await E.get(rejectedPromise)[0];
      },
      {
        instanceOf: Error,
      },
    );

    t.regex(error.message, /Array fetch failed/);
  } finally {
    shutdownBoth();
  }
});

test('E.get rejects Symbol property access', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Object Provider',
    Far('objectProvider', () => {
      return harden({ foo: 'bar' });
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();
    const bootstrapB = ocapnA.getRemoteBootstrap();

    // Use pipelining so the access goes through the handler
    const objectProvider = E(bootstrapB).fetch(
      encodeSwissnum('Object Provider'),
    );
    const objectPromise = E(objectProvider)();

    // Try to access a Symbol property (should fail immediately without consuming an answer slot)
    const testSymbol = Symbol('test');
    const error = await t.throwsAsync(
      async () => {
        // @ts-expect-error - intentionally using symbol for testing
        await E.get(objectPromise)[testSymbol];
      },
      {
        instanceOf: Error,
      },
    );

    t.regex(error.message, /Property must be a string, got symbol/);
  } finally {
    shutdownBoth();
  }
});

test('op:untag with valid tagged value', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Tagged Provider',
    Far('taggedProvider', () => {
      return makeTagged('myTag', { data: 42, nested: ['a', 'b'] });
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const { sessionA } = await establishSession();
    const { ocapn: ocapnA } = sessionA;
    const bootstrapB = ocapnA.getRemoteBootstrap();

    // First fetch the tagged provider from B
    const taggedProvider = await E(bootstrapB).fetch(
      encodeSwissnum('Tagged Provider'),
    );

    // Use the helper to call the provider and untag the result in one pipelined operation
    const untagHelper = makeUntagTestHelper(sessionA);
    // Call the provider as a function and untag the result
    const payload = await untagHelper.callAndUntag(
      taggedProvider,
      Symbol.for(''),
      [],
      'myTag',
    );

    t.deepEqual(payload, { data: 42, nested: ['a', 'b'] });
  } finally {
    shutdownBoth();
  }
});

test('op:untag with wrong tag rejects', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Tagged Provider',
    Far('taggedProvider', () => {
      return makeTagged('actualTag', 'some payload');
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const { sessionA } = await establishSession();
    const { ocapn: ocapnA } = sessionA;
    const bootstrapB = ocapnA.getRemoteBootstrap();

    // First fetch the tagged provider from B
    const taggedProvider = await E(bootstrapB).fetch(
      encodeSwissnum('Tagged Provider'),
    );

    // Use the helper to call the provider and untag with wrong tag
    const untagHelper = makeUntagTestHelper(sessionA);
    const error = await t.throwsAsync(
      async () => {
        await untagHelper.callAndUntag(
          taggedProvider,
          Symbol.for(''),
          [],
          'wrongTag',
        );
      },
      {
        instanceOf: Error,
      },
    );

    t.regex(
      error.message,
      /Tag mismatch: expected 'wrongTag', got 'actualTag'/,
    );
  } finally {
    shutdownBoth();
  }
});

test('op:untag rejects non-tagged value', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Record Provider',
    Far('recordProvider', () => {
      return harden({ foo: 'bar' });
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const { sessionA } = await establishSession();
    const { ocapn: ocapnA } = sessionA;
    const bootstrapB = ocapnA.getRemoteBootstrap();

    // First fetch the record provider from B
    const recordProvider = await E(bootstrapB).fetch(
      encodeSwissnum('Record Provider'),
    );

    // Use the helper to call the provider and try to untag a non-tagged value
    const untagHelper = makeUntagTestHelper(sessionA);
    const error = await t.throwsAsync(
      async () => {
        await untagHelper.callAndUntag(
          recordProvider,
          Symbol.for(''),
          [],
          'someTag',
        );
      },
      {
        instanceOf: Error,
      },
    );

    t.regex(error.message, /Cannot untag values with pass-style copyRecord/);
  } finally {
    shutdownBoth();
  }
});

test('op:untag with nested payload containing remotable', async t => {
  const testObjectTable = new Map();
  const innerRemotable = Far('innerRemotable', {
    getValue: () => 99,
  });
  testObjectTable.set(
    'Tagged Provider',
    Far('taggedProvider', () => {
      return makeTagged('wrapper', { inner: innerRemotable });
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const { sessionA } = await establishSession();
    const { ocapn: ocapnA } = sessionA;
    const bootstrapB = ocapnA.getRemoteBootstrap();

    // First fetch the tagged provider from B
    const taggedProvider = await E(bootstrapB).fetch(
      encodeSwissnum('Tagged Provider'),
    );

    // Use the helper to call the provider and untag the result
    const untagHelper = makeUntagTestHelper(sessionA);
    const payload = await untagHelper.callAndUntag(
      taggedProvider,
      Symbol.for(''),
      [],
      'wrapper',
    );

    // The payload should contain the remotable, which we can call
    const result = await E(payload.inner).getValue();
    t.is(result, 99);
  } finally {
    shutdownBoth();
  }
});

test('session disconnect rejects pending promises and subsequent calls', async t => {
  const testObjectTable = new Map();
  /** @type {((value: unknown) => void) | undefined} */
  let slowResolve;
  testObjectTable.set(
    'SlowResponder',
    Far('slowResponder', {
      slowMethod: () => {
        // Return a promise that we control - it will never resolve
        return new Promise(resolve => {
          slowResolve = resolve;
        });
      },
      fastMethod: () => 'fast result',
    }),
  );

  const { establishSession, shutdownBoth, getConnectionAtoB } =
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

    // Get a remote reference from B
    const bootstrapB = ocapnA.getRemoteBootstrap();
    const slowResponder = await E(bootstrapB).fetch(
      encodeSwissnum('SlowResponder'),
    );

    // Start a slow call that will never resolve
    const pendingPromise = E(slowResponder).slowMethod();

    // Verify we can make successful calls before disconnect
    const fastResult = await E(slowResponder).fastMethod();
    t.is(fastResult, 'fast result', 'Fast method works before disconnect');

    // Abort the session from A's side
    ocapnA.abort(Error('Testing session disconnect'));

    // Wait for the connection to be destroyed
    await waitUntilTrue(() => connectionAtoB.isDestroyed);

    // The pending promise should reject with session disconnected error
    const pendingError = await t.throwsAsync(
      async () => {
        await pendingPromise;
      },
      {
        instanceOf: Error,
      },
      'Pending promise should reject when session disconnects',
    );
    t.regex(
      pendingError.message,
      /Session disconnected/,
      'Error message should indicate session disconnected',
    );

    // After disconnect, invoking E() on the remote reference should also reject
    const postDisconnectError = await t.throwsAsync(
      async () => {
        await E(slowResponder).fastMethod();
      },
      {
        instanceOf: Error,
      },
      'E() call after disconnect should reject',
    );
    t.regex(
      postDisconnectError.message,
      /Session disconnected/,
      'Post-disconnect error should indicate session disconnected',
    );

    // Silence the slowResolve to prevent memory leak warnings
    if (slowResolve) {
      slowResolve('ignored');
    }
  } finally {
    shutdownBoth();
  }
});

test('local answer promise on B is not rejected on connection close', async t => {
  const testObjectTable = new Map();
  /** @type {((value: unknown) => void) | undefined} */
  let slowResolveOnB;
  /** @type {Promise<unknown> | undefined} */
  let capturedLocalAnswerPromise;

  testObjectTable.set(
    'PromiseHandler',
    Far('promiseHandler', {
      // B creates a slow method that returns a promise we control
      slowMethod: () => {
        return new Promise(resolve => {
          slowResolveOnB = resolve;
        });
      },
      // B captures a promise sent as an argument
      capturePromise: receivedPromise => {
        capturedLocalAnswerPromise = receivedPromise;
        return 'captured';
      },
    }),
  );

  const { establishSession, shutdownBoth, getConnectionAtoB } =
    await makeTestClientPair({
      makeDefaultSwissnumTable: () => testObjectTable,
    });

  try {
    const {
      sessionA: { ocapn: ocapnA },
      sessionB: { ocapn: ocapnB },
    } = await establishSession();

    const connectionAtoB = getConnectionAtoB();
    if (!connectionAtoB) {
      throw new Error('Connection A to B should exist');
    }

    // Get remote reference to B's PromiseHandler
    const bootstrapB = ocapnA.getRemoteBootstrap();
    const promiseHandler = await E(bootstrapB).fetch(
      encodeSwissnum('PromiseHandler'),
    );

    // Step 1: A calls B's slowMethod, creating an answer promise.
    // On A's side: this is a remote answer promise (A waits for B's answer)
    // On B's side: this is a local answer promise (B's pending result)
    const remoteAnswerOnA = E(promiseHandler).slowMethod();

    // Debug: Check A's slot for remoteAnswerOnA
    const ocapnTableA = getOcapnDebug(ocapnA).ocapnTable;
    const slotOnA = ocapnTableA.getSlotForValue(remoteAnswerOnA);
    console.log('A: slot for remoteAnswerOnA:', slotOnA);
    console.log(
      'A: remoteAnswerOnA is promise?',
      remoteAnswerOnA instanceof Promise,
    );
    console.log(
      'A: remoteAnswerOnA constructor:',
      remoteAnswerOnA?.constructor?.name,
    );

    // Check if answer position 0 was registered
    const answerSlot0 = ocapnTableA.getValueForSlot(makeSlot('a', false, 0n));
    console.log('A: value for slot a-0:', answerSlot0);
    console.log(
      'A: is remoteAnswerOnA === a-0 value?',
      remoteAnswerOnA === answerSlot0,
    );

    // Step 2: A sends the pending answer promise back to B as an argument.
    // When B deserializes this argument, B recognizes it as a reference to
    // its own local answer (the promise from slowMethod).
    const captureResult =
      await E(promiseHandler).capturePromise(remoteAnswerOnA);
    t.is(captureResult, 'captured', 'Promise was captured by B');

    // Verify B received and captured a promise
    t.truthy(capturedLocalAnswerPromise, 'B should have captured the promise');
    t.true(
      isPromise(capturedLocalAnswerPromise),
      'Captured value should be a promise',
    );

    // Debug: Check B's slots
    const ocapnTableB = getOcapnDebug(ocapnB).ocapnTable;
    const slotOnB = ocapnTableB.getSlotForValue(capturedLocalAnswerPromise);
    const answerPosition = ocapnTableB.getLocalAnswerToPosition(
      capturedLocalAnswerPromise,
    );
    console.log('B: slot for capturedLocalAnswerPromise:', slotOnB);
    console.log('B: getLocalAnswerToPosition result:', answerPosition);

    // Verify the captured promise is B's local answer.
    // Note: We use getLocalAnswerToPosition, not getSlotForValue, because
    // local answers are special in OCapN - calling getSlotForValue would
    // cause it to be re-exported as a promise instead.
    t.truthy(
      answerPosition !== undefined,
      'Captured promise should be a local answer in B table',
    );

    // Step 3: Abort the session from A's side
    ocapnA.abort(Error('Testing session disconnect'));

    // Wait for the connection to be destroyed
    await waitUntilTrue(() => connectionAtoB.isDestroyed);

    // Step 4: A's remote answer promise should be rejected (connection closed)
    const remoteError = await t.throwsAsync(
      async () => {
        await remoteAnswerOnA;
      },
      {
        instanceOf: Error,
      },
      "A's remote promise should reject when session disconnects",
    );
    t.regex(
      remoteError.message,
      /Session disconnected/,
      "A's error message should indicate session disconnected",
    );

    // Step 5: B's LOCAL answer promise should NOT be rejected.
    // Since B owns this answer locally, closing the connection shouldn't affect it.
    // Resolve the underlying promise and verify the local answer resolves.
    if (slowResolveOnB) {
      slowResolveOnB('resolved after disconnect');
    }

    // The local answer promise on B should resolve successfully
    const localResult = await capturedLocalAnswerPromise;
    t.is(
      localResult,
      'resolved after disconnect',
      "B's local answer promise should resolve normally after disconnect",
    );
  } finally {
    // Ensure slowResolve is called to prevent memory leak warnings
    if (slowResolveOnB) {
      slowResolveOnB('cleanup');
    }
    shutdownBoth();
  }
});

test('serialization error in E() call arguments rejects the promise', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Receiver',
    Far('receiver', {
      acceptAnything: arg => arg,
    }),
  );

  const { establishSession, shutdownBoth, getConnectionAtoB } =
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

    const bootstrapB = ocapnA.getRemoteBootstrap();
    const receiver = await E(bootstrapB).fetch(encodeSwissnum('Receiver'));

    // Create an object that cannot be serialized.
    // A plain function that isn't Far-wrapped should fail serialization.
    const unpassableFunction = () => 'I am not Far-wrapped';

    // When we try to send this unpassable object as an argument,
    // the promise should reject with the serialization error.
    const error = await t.throwsAsync(
      async () => {
        await E(receiver).acceptAnything(unpassableFunction);
      },
      {
        instanceOf: Error,
      },
    );

    // The error should indicate a serialization/write failure
    t.regex(
      error.message,
      /write failed|cannot be passable|Cannot pass|pass-style/i,
      'Error message should indicate serialization failure',
    );

    // Connection should still be alive (serialization errors don't abort the session)
    t.false(
      connectionAtoB.isDestroyed,
      'Connection should NOT be destroyed on serialization error',
    );

    // We should still be able to make successful calls
    const result = await E(receiver).acceptAnything('valid string');
    t.is(result, 'valid string', 'Should still work after serialization error');
  } finally {
    shutdownBoth();
  }
});

// Tests for E() vs E.sendOnly() message types
test('E() sends op:deliver with answer tracking', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Echo',
    Far('echo', {
      echo: val => val,
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
    /** @type {Array<{type: string}>} */
    const sentMessages = [];
    const unsubscribe = getOcapnDebug(ocapnA).subscribeMessages(
      (direction, message) => {
        if (direction === 'send') {
          sentMessages.push(message);
        }
      },
    );

    const bootstrapB = ocapnA.getRemoteBootstrap();
    const echoService = await E(bootstrapB).fetch(encodeSwissnum('Echo'));

    // Clear messages from setup
    sentMessages.length = 0;

    // Use E() which expects a response
    const result = await E(echoService).echo('hello');
    t.is(result, 'hello');

    unsubscribe();

    // Should have sent op:deliver (not op:deliver-only)
    const deliverMessages = sentMessages.filter(m => m.type === 'op:deliver');
    const deliverOnlyMessages = sentMessages.filter(
      m => m.type === 'op:deliver-only',
    );

    t.true(
      deliverMessages.length >= 1,
      'E() should send at least one op:deliver message',
    );
    t.is(
      deliverOnlyMessages.length,
      0,
      'E() should NOT send op:deliver-only messages',
    );
  } finally {
    shutdownBoth();
  }
});

test('E.sendOnly() sends op:deliver-only without answer tracking', async t => {
  const testObjectTable = new Map();
  /** @type {string | undefined} */
  let receivedValue;
  testObjectTable.set(
    'Receiver',
    Far('receiver', {
      receive: val => {
        receivedValue = val;
      },
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
    /** @type {Array<{type: string}>} */
    const sentMessages = [];
    const unsubscribe = getOcapnDebug(ocapnA).subscribeMessages(
      (direction, message) => {
        if (direction === 'send') {
          sentMessages.push(message);
        }
      },
    );

    const bootstrapB = ocapnA.getRemoteBootstrap();
    const receiver = await E(bootstrapB).fetch(encodeSwissnum('Receiver'));

    // Clear messages from setup
    sentMessages.length = 0;

    // Use E.sendOnly() which does not expect a response
    E.sendOnly(receiver).receive('fire-and-forget');

    // Wait a bit for the message to be sent and processed
    await waitUntilTrue(() => receivedValue === 'fire-and-forget');

    unsubscribe();

    // Should have sent op:deliver-only (not op:deliver)
    const deliverMessages = sentMessages.filter(m => m.type === 'op:deliver');
    const deliverOnlyMessages = sentMessages.filter(
      m => m.type === 'op:deliver-only',
    );

    t.is(
      deliverMessages.length,
      0,
      'E.sendOnly() should NOT send op:deliver messages',
    );
    t.true(
      deliverOnlyMessages.length >= 1,
      'E.sendOnly() should send at least one op:deliver-only message',
    );

    t.is(
      /** @type {string | undefined} */ (receivedValue),
      'fire-and-forget',
      'Value should have been received',
    );
  } finally {
    shutdownBoth();
  }
});

test('E.sendOnly() on function call sends op:deliver-only', async t => {
  const testObjectTable = new Map();
  /** @type {string | undefined} */
  let receivedValue;
  testObjectTable.set(
    'Func',
    Far('func', val => {
      receivedValue = val;
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
    /** @type {Array<{type: string}>} */
    const sentMessages = [];
    const unsubscribe = getOcapnDebug(ocapnA).subscribeMessages(
      (direction, message) => {
        if (direction === 'send') {
          sentMessages.push(message);
        }
      },
    );

    const bootstrapB = ocapnA.getRemoteBootstrap();
    const func = await E(bootstrapB).fetch(encodeSwissnum('Func'));

    // Clear messages from setup
    sentMessages.length = 0;

    // Use E.sendOnly() with function call syntax
    E.sendOnly(func)('function-call-value');

    // Wait a bit for the message to be sent and processed
    await waitUntilTrue(() => receivedValue === 'function-call-value');

    unsubscribe();

    // Should have sent op:deliver-only (not op:deliver)
    const deliverMessages = sentMessages.filter(m => m.type === 'op:deliver');
    const deliverOnlyMessages = sentMessages.filter(
      m => m.type === 'op:deliver-only',
    );

    t.is(
      deliverMessages.length,
      0,
      'E.sendOnly() function call should NOT send op:deliver messages',
    );
    t.true(
      deliverOnlyMessages.length >= 1,
      'E.sendOnly() function call should send at least one op:deliver-only message',
    );

    t.is(
      /** @type {string | undefined} */ (receivedValue),
      'function-call-value',
      'Value should have been received',
    );
  } finally {
    shutdownBoth();
  }
});

test('resolver callbacks use op:deliver-only', async t => {
  // When Bob responds to a call from Alice, he calls fulfill/break on
  // a remote resolver. These should use op:deliver-only since we don't
  // need a response from the resolver call.

  const testObjectTable = new Map();
  testObjectTable.set(
    'Echo',
    Far('echo', {
      echo: val => val,
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

    // Track messages sent by B (the responder)
    /** @type {Array<{type: string}>} */
    const messagesSentByB = [];
    const unsubscribe = getOcapnDebug(ocapnB).subscribeMessages(
      (direction, message) => {
        if (direction === 'send') {
          messagesSentByB.push(message);
        }
      },
    );

    const bootstrapB = ocapnA.getRemoteBootstrap();
    const echoService = await E(bootstrapB).fetch(encodeSwissnum('Echo'));

    // Clear messages from setup
    messagesSentByB.length = 0;

    // Make a call - B will respond by calling fulfill on the resolver
    const result = await E(echoService).echo('test');
    t.is(result, 'test');

    unsubscribe();

    // B's response should use op:deliver-only for the resolver callback
    const deliverOnlyMessages = messagesSentByB.filter(
      m => m.type === 'op:deliver-only',
    );

    t.true(
      deliverOnlyMessages.length >= 1,
      'Resolver callbacks should use op:deliver-only',
    );
  } finally {
    shutdownBoth();
  }
});
