// @ts-check

import '@endo/init';

import { makePromiseKit } from '@endo/promise-kit';
import { makeSyrupWriter } from './syrup/encode.js';
import { writeOCapNMessage } from './codecs/operations.js';
import {
  makeCrossedHellosIdForPublicKeyData,
  makeOCapNKeyPair,
  makeOCapNPublicKey,
  publicKeyToPublicKeyData,
} from './cryptography.js';
import { OCapNMyLocation } from './codecs/components.js';
import { getSelectorName, makeSelector } from './pass-style-helpers.js';
import { compareByteArrays } from './syrup/compare.js';

/**
 * @typedef {import('./cryptography.js').OCapNPublicKey} OCapNPublicKey
 * @typedef {import('./cryptography.js').OCapNKeyPair} OCapNKeyPair
 * @typedef {import('./codecs/components.js').OCapNPublicKeyData} OCapNPublicKeyData
 * @typedef {import('./codecs/components.js').OCapNLocation} OCapNLocation
 * @typedef {import('./codecs/components.js').OCapNSignature} OCapNSignature
 * @typedef {import('./netlayers/types.js').Session} Session
 * @typedef {import('./netlayers/types.js').Connection} Connection
 * @typedef {import('./netlayers/types.js').Client} Client
 * @typedef {import('./netlayers/types.js').NetLayer} NetLayer
 * @typedef {import('./netlayers/types.js').SelfIdentity} SelfIdentity
 */

/**
 * @param {OCapNLocation} location
 * @returns {string}
 */
export const locationToLocationId = location => {
  return `${location.transport}:${location.address}`;
};

/**
 * @param {OCapNLocation} location
 * @returns {Uint8Array}
 */
const getLocationBytesForSignature = location => {
  const syrupWriter = makeSyrupWriter();
  const myLocation = {
    type: 'my-location',
    location,
  };
  OCapNMyLocation.write(myLocation, syrupWriter);
  return syrupWriter.getBytes();
};

/**
 * @param {{ type: 'desc:import-object', position: bigint }} descriptor
 * @returns {{ type: 'desc:export', position: bigint }}
 */
const reverseDescriptor = descriptor => {
  if (descriptor.type === 'desc:import-object') {
    return {
      type: 'desc:export',
      position: descriptor.position,
    };
  }
  throw Error(`Unknown descriptor type: ${descriptor.type}`);
};

/**
 * @param {Session} session
 * @param {{ type: 'desc:export' | 'desc:answer', position: bigint }} desc
 * @returns {any}
 */
const lookupExport = (session, desc) => {
  if (desc.type === 'desc:export') {
    const result = session.tables.exportTable.get(desc.position);
    if (!result) {
      throw Error(`Unknown export: ${desc.position}`);
    }
    return result;
  } else if (desc.type === 'desc:answer') {
    const result = session.tables.answerTable.get(desc.position);
    if (!result) {
      throw Error(`Unknown answer: ${desc.position}`);
    }
    return result;
  }
  throw Error(`Unknown descriptor type: ${desc.type}`);
};

/**
 * @param {Session} session
 * @param {any} target
 * @returns {bigint}
 */
const registerExport = (session, target) => {
  const nextId = session.tables.exportCount;
  session.tables.exportCount += 1n;
  console.log('++ Registering export', nextId, target);
  session.tables.exportTable.set(nextId, target);
  return nextId;
};

/**
 * @typedef {object} RemoteObjectHelper
 * @property {(...args: any[]) => void} deliver
 * @property {(target: any) => { type: 'desc:import-object' | 'desc:import-promise', position: bigint }} registerExport
 */

/**
 * @param {Connection} connection
 * @returns {RemoteObjectHelper}
 * This will be replaced with Eventual Send and HandledPromise machinery later
 */
const makeCallHelper = connection => {
  const { session } = connection;
  if (!session) {
    throw Error('No session');
  }
  return {
    /**
     * @param {{ type: 'desc:import-object' | 'desc:import-promise', position: bigint }} to
     * @param {...any} args
     */
    deliver: (to, ...args) => {
      const opDeliver = {
        type: 'op:deliver',
        to: {
          type: 'desc:export',
          position: to.position,
        },
        args,
        answerPosition: false,
        resolveMeDesc: {
          type: 'desc:import-promise',
          position: 0n,
        },
      };
      const bytes = writeOCapNMessage(opDeliver);
      connection.write(bytes);
    },
    registerExport: target => {
      const exportId = registerExport(session, target);
      return {
        type: 'desc:import-object',
        position: exportId,
      };
    },
  };
};

/**
 * @param {OCapNLocation} myLocation
 * @returns {SelfIdentity}
 */
export const makeSelfIdentity = myLocation => {
  const keyPair = makeOCapNKeyPair();
  const myLocationBytes = getLocationBytesForSignature(myLocation);
  const myLocationSig = keyPair.sign(myLocationBytes);
  return { keyPair, location: myLocation, locationSignature: myLocationSig };
};

/**
 * @param {object} options
 * @param {SelfIdentity} options.selfIdentity
 * @param {OCapNLocation} options.peerLocation
 * @param {OCapNPublicKey} options.peerPublicKey
 * @param {OCapNSignature} options.peerLocationSig
 * @param {() =>Map<string, any>} [options.makeDefaultSwissnumTable]
 * @returns {Session}
 */
const makeSession = ({
  selfIdentity,
  peerLocation,
  peerPublicKey,
  peerLocationSig,
  makeDefaultSwissnumTable = () => new Map(),
}) => {
  const { keyPair, location, locationSignature } = selfIdentity;
  const importTable = new Map();
  const exportTable = new Map();
  const answerTable = new Map();
  return {
    tables: {
      swissnumTable: makeDefaultSwissnumTable(),
      importTable,
      exportTable,
      exportCount: 1n,
      answerTable,
    },
    peer: {
      publicKey: peerPublicKey,
      location: peerLocation,
      locationSignature: peerLocationSig,
    },
    self: {
      keyPair,
      location,
      locationSignature,
    },
  };
};

/**
 * @param {Connection} connection
 * @param {any} resolveMeDesc
 * @param {Promise<any>} promise
 * @param {boolean} _wantsPartial
 */
const schedulePromiseListener = (
  connection,
  resolveMeDesc,
  promise,
  _wantsPartial,
) => {
  const sendResolve = result => {
    // Respond with the result
    const opDeliver = {
      type: 'op:deliver-only',
      to: {
        type: 'desc:export',
        position: resolveMeDesc.position,
      },
      args: [makeSelector('fulfill'), result],
    };
    console.log('>> Sending message', opDeliver);
    const bytes = writeOCapNMessage(opDeliver);
    connection.write(bytes);
  };

  const sendReject = err => {
    console.log('!! Rejecting promise', err, err.stack);
    // Respond with the error
    const opDeliver = {
      type: 'op:deliver-only',
      to: {
        type: 'desc:export',
        position: resolveMeDesc.position,
      },
      args: [makeSelector('break'), err],
    };
    console.log('>> Sending message', opDeliver);
    const bytes = writeOCapNMessage(opDeliver);
    connection.write(bytes);
  };

  promise.then(sendResolve, sendReject);
};

/**
 * @param {Connection} connection
 * @param {bigint | false} answerPosition
 * @param {any} resolveMeDesc
 * @param {Promise<any>} promise
 */
const registerAnswer = (connection, answerPosition, resolveMeDesc, promise) => {
  const { session } = connection;
  if (!session) {
    throw Error('No session');
  }
  if (answerPosition !== false) {
    console.log(
      '++ Registering answer',
      answerPosition,
      resolveMeDesc,
      promise,
    );
    session.tables.answerTable.set(answerPosition, promise);
  }

  schedulePromiseListener(connection, resolveMeDesc, promise, false);
};

const maybeResolveExport = (session, target) => {
  if (typeof target === 'object' && target.type === 'desc:import-object') {
    const exportDesc = reverseDescriptor(target);
    const result = lookupExport(session, exportDesc);
    console.log('maybeResolveExport', { target, result });
    return result;
  }
  return target;
};

/**
 * @param {Connection} connection
 * @param {any} target
 * @param {any[]} args
 * @returns {Promise<any>}
 */
const handleLocalObjectCall = (connection, target, args) => {
  const { session } = connection;
  if (!session) {
    throw Error('No session');
  }
  return (async () => {
    const resolvedTarget = await Promise.resolve(target);
    const actualTarget = maybeResolveExport(session, resolvedTarget);
    const callHelper = makeCallHelper(connection);
    console.log('handleLocalObjectCall', {
      actualTarget,
      resolvedTarget,
      args,
    });
    let result;
    if (typeof actualTarget === 'function') {
      result = actualTarget.apply(callHelper, args);
    } else {
      const [methodNameSymbol, ...fnArgs] = args;
      const methodName = getSelectorName(methodNameSymbol);
      result = actualTarget[methodName].apply(callHelper, fnArgs);
    }
    return result;
  })();
};

/**
 * @param {Session} session
 * @returns {{ promise: Promise<any>, resolveMeDesc: { type: 'desc:import-promise', position: bigint } }}
 */
const makePromiseForExport = session => {
  const { promise, resolve, reject } = makePromiseKit();
  const resolver = {
    resolve,
    break: reject,
  };
  const exportId = registerExport(session, resolver);
  const resolveMeDesc = {
    type: 'desc:import-promise',
    position: exportId,
  };
  // @ts-expect-error type system misses the exact type match
  return { promise, resolveMeDesc };
};

/**
 * @param {Connection} connection
 * @param {any} mySessionData
 */
export const sendHello = (connection, mySessionData) => {
  const { keyPair, location, locationSignature } = mySessionData;
  const opStartSession = {
    type: 'op:start-session',
    captpVersion: '1.0',
    sessionPublicKey: publicKeyToPublicKeyData(keyPair.publicKey),
    location,
    locationSignature,
  };
  const bytes = writeOCapNMessage(opStartSession);
  connection.write(bytes);
};

/**
 * @param {Connection} connection
 * @param {Uint8Array} swissnum
 * @returns {Promise<any>}
 */
const sendBootstrapFetch = (connection, swissnum) => {
  const { session } = connection;
  if (!session) {
    throw Error('No session');
  }
  const { promise, resolveMeDesc } = makePromiseForExport(session);

  const opDeliver = {
    type: 'op:deliver',
    to: {
      type: 'desc:export',
      position: 0n,
    },
    args: [makeSelector('fetch'), swissnum],
    answerPosition: false,
    resolveMeDesc,
  };
  const bytes = writeOCapNMessage(opDeliver);
  connection.write(bytes);

  return promise;
};

/**
 * @param {Connection} connection
 * @param {any} message
 */
const handleActiveSessionMessage = (connection, message) => {
  const { session } = connection;
  if (!session) {
    throw Error('No session');
  }
  const { swissnumTable } = session.tables;

  switch (message.type) {
    case 'op:abort': {
      console.log('Server received op:abort', message.reason);
      connection.end();
      break;
    }

    case 'op:deliver': {
      const { to, args, answerPosition, resolveMeDesc } = message;
      console.log(
        'Server received op:deliver',
        to,
        args,
        answerPosition,
        resolveMeDesc,
      );
      // Handle call to the bootstrap object
      if (to.position === 0n && to.type === 'desc:export') {
        const methodName = getSelectorName(args[0]);
        if (methodName === 'fetch') {
          const id = args[1].toString('ascii');
          console.log('Server received fetch', id);
          const object = swissnumTable.get(id);
          if (!object) {
            throw Error(`Unknown swissnum for sturdyref: ${id}`);
          }
          const exportId = registerExport(session, object);
          const objectExport = {
            type: 'desc:import-object',
            position: exportId,
          };
          const objectExportPromise = Promise.resolve(objectExport);
          registerAnswer(
            connection,
            answerPosition,
            resolveMeDesc,
            objectExportPromise,
          );
        }
        break;
      }
      // Handle call to a local object
      const target = lookupExport(session, to);
      const resultP = handleLocalObjectCall(connection, target, args);
      registerAnswer(connection, answerPosition, resolveMeDesc, resultP);
      console.log('Server processed op:deliver', target, args);
      break;
    }

    case 'op:deliver-only': {
      const { to, args } = message;
      console.log('Server received op:deliver-only', to, args);
      const target = lookupExport(session, to);
      const resultP = handleLocalObjectCall(connection, target, args);
      console.log('Server processed op:deliver-only', target, args, resultP);
      break;
    }

    case 'op:listen': {
      const { to, resolveMeDesc, wantsPartial } = message;
      console.log('Server received op:listen', {
        to,
        resolveMeDesc,
        wantsPartial,
      });
      if (to.type !== 'desc:export' && to.type !== 'desc:answer') {
        throw Error(`Invalid op:listen to: ${to}`);
      }
      if (
        resolveMeDesc.type !== 'desc:import-object' &&
        resolveMeDesc.type !== 'desc:import-promise'
      ) {
        throw Error(`Invalid op:listen resolveMeDesc: ${resolveMeDesc}`);
      }
      const resultP = lookupExport(session, to);
      schedulePromiseListener(connection, resolveMeDesc, resultP, wantsPartial);
      break;
    }

    default: {
      throw Error(`Unknown message type: ${message.type}`);
    }
  }
};

/**
 * @param {Connection} outgoingConnection
 * @param {Connection} incommingConnection
 * @param {OCapNPublicKeyData} incommingPublicKey
 * @returns {{ preferredConnection: Connection, connectionToClose: Connection }}
 */
const compareSessionKeysForCrossedHellos = (
  outgoingConnection,
  incommingConnection,
  incommingPublicKey,
) => {
  const outgoingPublicKey = publicKeyToPublicKeyData(
    outgoingConnection.selfIdentity.keyPair.publicKey,
  );
  const outgoingId = makeCrossedHellosIdForPublicKeyData(outgoingPublicKey);
  const incommingId = makeCrossedHellosIdForPublicKeyData(incommingPublicKey);
  const result = compareByteArrays(
    outgoingId,
    incommingId,
    0,
    outgoingId.length,
    0,
    incommingId.length,
  );
  const [preferredConnection, connectionToClose] =
    result > 0
      ? [outgoingConnection, incommingConnection]
      : [incommingConnection, outgoingConnection];
  return { preferredConnection, connectionToClose };
};

/**
 * @param {Client} client
 * @param {Connection} connection
 * @param {any} message
 */
const handleSessionInitMessage = (client, connection, message) => {
  if (connection.session) {
    throw Error('Session already exists');
  }
  const { activeSessions, outgoingConnections } = client;

  switch (message.type) {
    case 'op:start-session': {
      console.log('Server received op:start-session');
      const {
        captpVersion,
        sessionPublicKey,
        location: peerLocation,
        locationSignature: peerLocationSig,
      } = message;
      // Handle invalid version
      if (captpVersion !== '1.0') {
        // send op abort
        const opAbort = {
          type: 'op:abort',
          reason: 'invalid-version',
        };
        const bytes = writeOCapNMessage(opAbort);
        connection.write(bytes);
        return;
      }
      const locationId = locationToLocationId(peerLocation);
      if (activeSessions.has(locationId)) {
        // throw error
        throw Error('Active session already exists');
      }

      // Check if the location signature is valid
      const peerPublicKey = makeOCapNPublicKey(sessionPublicKey.q);
      const peerLocationBytes = getLocationBytesForSignature(peerLocation);
      const peerLocationSigValid = peerPublicKey.verify(
        peerLocationBytes,
        peerLocationSig,
      );
      // Handle invalid location signature
      if (!peerLocationSigValid) {
        console.log('>> Server received NOT VALID location signature');
        const opAbort = {
          type: 'op:abort',
          reason: 'Invalid location signature',
        };
        const bytes = writeOCapNMessage(opAbort);
        connection.write(bytes);
        return;
      }
      console.log('>> Server received VALID location signature');

      // Check for crossed hellos
      const outgoingConnection = outgoingConnections.get(locationId);
      if (outgoingConnection !== undefined) {
        const incommingConnection = connection;
        const { connectionToClose } = compareSessionKeysForCrossedHellos(
          outgoingConnection,
          incommingConnection,
          sessionPublicKey,
        );
        // Close the non-preferred connection
        const opAbort = {
          type: 'op:abort',
          reason: 'Crossed hellos mitigated',
        };
        const bytes = writeOCapNMessage(opAbort);
        connectionToClose.write(bytes);
        connectionToClose.end();

        // If the incomming connection is the one that was just closed, we're done.
        if (incommingConnection === connectionToClose) {
          return;
        }
      }

      // Send our hello if we haven't already
      if (connection.isOutgoing) {
        // We've already sent our hello, so our session data is already set
      } else {
        // We've received a hello, so we need to send our own
        // Send our op:start-session
        console.log('Server sending op:start-session');
        sendHello(connection, connection.selfIdentity);
      }

      // Create session
      const { makeDefaultSwissnumTable } = client;
      const { selfIdentity } = connection;
      const session = makeSession({
        selfIdentity,
        peerLocation,
        peerPublicKey,
        peerLocationSig,
        makeDefaultSwissnumTable,
      });
      connection.session = session;
      activeSessions.set(locationId, session);

      break;
    }

    case 'op:abort': {
      console.log('Server received op:abort', message.reason);
      connection.end();
      break;
    }

    default: {
      throw Error(`Unknown message type: ${message.type}`);
    }
  }
};

/**
 * @param {Client} client
 * @param {Connection} connection
 * @param {any} message
 */
const handleMessage = (client, connection, message) => {
  try {
    if (connection.session) {
      return handleActiveSessionMessage(connection, message);
    } else {
      return handleSessionInitMessage(client, connection, message);
    }
  } catch (err) {
    console.error('Server error:', err);
    connection.end();
    throw err;
  }
};

/**
 * @param {object} [options]
 * @param {() => Map<string, any>} [options.makeDefaultSwissnumTable]
 * @returns {Client}
 */
export const makeClient = ({
  makeDefaultSwissnumTable = () => new Map(),
} = {}) => {
  const activeSessions = new Map();
  const outgoingConnections = new Map();
  /** @type {Map<string, NetLayer>} */
  const netlayers = new Map();

  /** @type {Client} */
  const client = {
    activeSessions,
    outgoingConnections,
    makeDefaultSwissnumTable,
    /**
     * @param {NetLayer} netlayer
     */
    registerNetlayer(netlayer) {
      const { transport } = netlayer.location;
      if (netlayers.has(transport)) {
        throw Error(`Netlayer already registered for transport: ${transport}`);
      }
      netlayers.set(transport, netlayer);
    },
    /**
     * @param {Connection} connection
     * @param {any} message
     */
    handleMessage(connection, message) {
      handleMessage(client, connection, message);
    },
    /**
     * @param {OCapNLocation} location
     * @returns {Connection}
     */
    connect(location) {
      console.log('connect called with', { location });
      const netlayer = netlayers.get(location.transport);
      if (!netlayer) {
        throw Error(
          `Netlayer not registered for transport: ${location.transport}`,
        );
      }
      const connection = netlayer.connect(location);
      //
      // TODO: Queue up the send hello
      //
      return connection;
    },
    /**
     * @param {any} sturdyref
     * @returns {Promise<any>}
     */
    async enlivenSturdyref(sturdyref) {
      console.log('enlivenSturdyref called with', { sturdyref });
      const { node: location } = sturdyref;
      const connection = client.connect(location);
      await connection.whenSessionReady();
      return sendBootstrapFetch(connection, sturdyref.swissnum);
    },
  };

  return client;
};
