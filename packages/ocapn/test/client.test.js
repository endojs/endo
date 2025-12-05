// @ts-check
/* global setTimeout */

/**
 * @import { Client, Connection, LocationId, Session } from '../src/client/types.js'
 * @import { OcapnLocation } from '../src/codecs/components.js'
 * @import { TcpTestOnlyNetLayer } from '../src/netlayers/tcp-test-only.js'
 */

import test from '@endo/ses-ava/test.js';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { isPromise } from '@endo/promise-kit';
import { makeTcpNetLayer } from '../src/netlayers/tcp-test-only.js';
import { makeClient } from '../src/client/index.js';
import { waitUntilTrue, testWithErrorUnwrapping } from './_util.js';
import { encodeSwissnum, locationToLocationId } from '../src/client/util.js';
import { makeOcapnKeyPair, signLocation } from '../src/cryptography.js';
import { writeOcapnHandshakeMessage } from '../src/codecs/operations.js';

/**
 * @typedef {object} ClientKit
 * @property {Client} client
 * @property {TcpTestOnlyNetLayer} netlayer
 * @property {OcapnLocation} location
 * @property {LocationId} locationId
 */

/**
 * @param {object} options
 * @param {string} options.debugLabel
 * @param {() => Map<string, any>} [options.makeDefaultSwissnumTable]
 * @param {boolean} [options.verbose]
 * @param {object} [options.clientOptions]
 * @returns {Promise<ClientKit>}
 */
const makeTestClient = async ({
  debugLabel,
  makeDefaultSwissnumTable,
  verbose,
  clientOptions,
}) => {
  const client = makeClient({
    debugLabel,
    swissnumTable: makeDefaultSwissnumTable && makeDefaultSwissnumTable(),
    verbose,
    ...clientOptions,
  });
  const netlayer = await makeTcpNetLayer({
    client,
    specifiedDesignator: debugLabel,
  });
  client.registerNetlayer(netlayer);
  const { location } = netlayer;
  const locationId = locationToLocationId(location);
  return { client, netlayer, location, locationId };
};

/**
 * @param {object} [options]
 * @param {() => Map<string, any>} [options.makeDefaultSwissnumTable]
 * @param {boolean} [options.verbose]
 * @param {object} [options.clientAOptions]
 * @param {object} [options.clientBOptions]
 * @returns {Promise<{
 *   clientKitA: ClientKit,
 *   clientKitB: ClientKit,
 *   establishSession: () => Promise<{ sessionA: Session, sessionB: Session }>,
 *   shutdownBoth: () => void,
 *   getConnectionAtoB: () => Connection | undefined,
 *   getConnectionBtoA: () => Connection | undefined,
 * }>}
 */
const makeTestClientPair = async ({
  makeDefaultSwissnumTable,
  verbose,
  clientAOptions,
  clientBOptions,
} = {}) => {
  const clientKitA = await makeTestClient({
    debugLabel: 'A',
    makeDefaultSwissnumTable,
    verbose,
    clientOptions: clientAOptions,
  });
  const clientKitB = await makeTestClient({
    debugLabel: 'B',
    makeDefaultSwissnumTable,
    verbose,
    clientOptions: clientBOptions,
  });
  const shutdownBoth = () => {
    clientKitA.client.shutdown();
    clientKitB.client.shutdown();
  };

  const establishSession = async () => {
    const sessionA = await clientKitA.client.provideSession(
      clientKitB.location,
    );
    const sessionB = await clientKitB.client.provideSession(
      clientKitA.location,
    );
    return { sessionA, sessionB };
  };

  const getConnectionAtoB = () => {
    return clientKitA.client.sessionManager.getActiveSession(
      clientKitB.locationId,
    )?.connection;
  };
  const getConnectionBtoA = () => {
    return clientKitB.client.sessionManager.getActiveSession(
      clientKitA.locationId,
    )?.connection;
  };

  return {
    clientKitA,
    clientKitB,
    establishSession,
    shutdownBoth,
    getConnectionAtoB,
    getConnectionBtoA,
  };
};

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
  const helloer = await E(ocapnA.getBootstrap()).fetch(
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
  const bootstrapB = ocapnA.getBootstrap();

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
    const bootstrapA = ocapnA.getBootstrap();

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
    verbose: true,
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
    const bootstrapB = ocapnA.getBootstrap();
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
