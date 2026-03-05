// @ts-check

/**
 * @import { OcapnLocation, OcapnSignature } from '../codecs/components.js'
 * @import { OcapnPublicKey } from '../cryptography.js'
 * @import { Ocapn } from './ocapn.js'
 * @import { Connection, Logger, SelfIdentity, SessionManager, SessionId } from './types.js'
 */

import harden from '@endo/harden';
import { ONE_N, ZERO_N } from '@endo/nat';
import {
  readOcapnHandshakeMessage,
  writeOcapnHandshakeMessage,
} from '../codecs/operations.js';
import {
  makeOcapnPublicKey,
  makeSessionId,
  assertLocationSignatureValid,
} from '../cryptography.js';
import { compareImmutableArrayBuffers } from '../syrup/compare.js';
import { makeSyrupReader } from '../syrup/decode.js';
import { decodeSyrup } from '../syrup/js-representation.js';
import { locationToLocationId } from './util.js';

/**
 * @param {Connection} connection
 * @param {SelfIdentity} selfIdentity
 * @param {string} captpVersion
 */
export const sendHandshake = (connection, selfIdentity, captpVersion) => {
  const { keyPair, location, locationSignature } = selfIdentity;
  const opStartSession = {
    type: 'op:start-session',
    captpVersion,
    sessionPublicKey: keyPair.publicKey.descriptor,
    location,
    locationSignature,
  };
  const bytes = writeOcapnHandshakeMessage(opStartSession);
  connection.write(bytes);
};

/**
 * @param {Connection} outgoingConnection
 * @param {Connection} incommingConnection
 * @param {OcapnPublicKey} incommingPublicKey
 * @param {(connection: Connection) => SelfIdentity} getSelfIdentityForConnection
 * @returns {{ preferredConnection: Connection, connectionToClose: Connection }}
 */
const compareSessionKeysForCrossedHellos = (
  outgoingConnection,
  incommingConnection,
  incommingPublicKey,
  getSelfIdentityForConnection,
) => {
  const outgoingPublicKey =
    getSelfIdentityForConnection(outgoingConnection).keyPair.publicKey;
  const outgoingId = outgoingPublicKey.id;
  const incommingId = incommingPublicKey.id;
  const result = compareImmutableArrayBuffers(outgoingId, incommingId);
  const [preferredConnection, connectionToClose] =
    result > 0
      ? [outgoingConnection, incommingConnection]
      : [incommingConnection, outgoingConnection];
  return { preferredConnection, connectionToClose };
};

/**
 * @import { InternalSession } from './types.js'
 */

/**
 * @param {object} options
 * @param {SessionId} options.id
 * @param {SelfIdentity} options.selfIdentity
 * @param {OcapnLocation} options.peerLocation
 * @param {OcapnPublicKey} options.peerPublicKey
 * @param {OcapnSignature} options.peerLocationSig
 * @param {Ocapn} options.ocapn
 * @param {Connection} options.connection
 * @returns {InternalSession}
 */
const makeSession = ({
  id,
  selfIdentity,
  peerLocation,
  peerPublicKey,
  peerLocationSig,
  ocapn,
  connection,
}) => {
  const { keyPair, location, locationSignature } = selfIdentity;
  let nextHandoffCount = ZERO_N;
  return harden({
    id,
    connection,
    ocapn,
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
    getHandoffCount: () => {
      return nextHandoffCount;
    },
    takeNextHandoffCount: () => {
      const current = nextHandoffCount;
      nextHandoffCount += ONE_N;
      return current;
    },
  });
};

/**
 * @param {Logger} logger
 * @param {SessionManager} sessionManager
 * @param {Connection} connection
 * @param {(connection: Connection) => SelfIdentity} getSelfIdentityForConnection
 * @param {(connection: Connection, reason: string) => void} sendAbortAndClose
 * @param {any} message
 * @param {string} captpVersion
 * @param {(connection: Connection, sessionId: SessionId, peerLocation: OcapnLocation) => Ocapn} prepareOcapn
 */
const handleSessionHandshakeMessage = (
  logger,
  sessionManager,
  connection,
  getSelfIdentityForConnection,
  sendAbortAndClose,
  message,
  captpVersion,
  prepareOcapn,
) => {
  logger.info(`handling handshake message of type ${message.type}`);
  switch (message.type) {
    case 'op:start-session': {
      const {
        captpVersion: messageCaptpVersion,
        sessionPublicKey,
        location: peerLocation,
        locationSignature: peerLocationSig,
      } = message;
      // Handle invalid version
      if (messageCaptpVersion !== captpVersion) {
        // send op abort
        logger.info(`Abort during start-session message with invalid version`);
        sendAbortAndClose(connection, 'invalid-version');
        sessionManager.deleteConnection(connection);
        return;
      }
      const locationId = locationToLocationId(peerLocation);
      if (sessionManager.getActiveSession(locationId)) {
        // throw error
        throw Error(`Active session already exists for ${locationId}`);
      }

      // Check if the location signature is valid
      const peerPublicKey = makeOcapnPublicKey(sessionPublicKey.q);
      try {
        assertLocationSignatureValid(
          peerLocation,
          peerLocationSig,
          peerPublicKey,
        );
      } catch {
        logger.info('>> Server received NOT VALID location signature');
        sendAbortAndClose(connection, 'Invalid location signature');
        sessionManager.deleteConnection(connection);
        return;
      }
      logger.info('>> Server received VALID location signature');

      // Check for crossed hellos
      const outgoingConnection =
        sessionManager.getOutgoingConnection(locationId);
      if (
        outgoingConnection !== undefined &&
        outgoingConnection !== connection
      ) {
        const incommingConnection = connection;
        const { connectionToClose } = compareSessionKeysForCrossedHellos(
          outgoingConnection,
          incommingConnection,
          peerPublicKey,
          getSelfIdentityForConnection,
        );
        // Close the non-preferred connection
        sendAbortAndClose(connectionToClose, 'Crossed hellos mitigated');
        sessionManager.deleteConnection(connectionToClose);

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
        logger.info('Server sending op:start-session');
        const selfIdentity = getSelfIdentityForConnection(connection);
        sendHandshake(connection, selfIdentity, captpVersion);
      }

      // Create session
      const selfIdentity = getSelfIdentityForConnection(connection);
      const sessionId = makeSessionId(
        selfIdentity.keyPair.publicKey.id,
        peerPublicKey.id,
      );

      const ocapn = prepareOcapn(connection, sessionId, peerLocation);
      const session = makeSession({
        id: sessionId,
        selfIdentity,
        peerLocation,
        peerPublicKey,
        peerLocationSig,
        ocapn,
        connection,
      });
      logger.info(`session established for ${locationId}`);
      sessionManager.resolveSession(locationId, connection, session);

      break;
    }

    case 'op:abort': {
      logger.info('Server received op:abort', message.reason);
      connection.end();
      sessionManager.deleteConnection(connection);
      break;
    }

    default: {
      throw Error(`Unknown message type: ${message.type}`);
    }
  }
};

/**
 * @param {Logger} logger
 * @param {SessionManager} sessionManager
 * @param {Connection} connection
 * @param {(connection: Connection) => SelfIdentity} getSelfIdentityForConnection
 * @param {(connection: Connection, reason: string) => void} sendAbortAndClose
 * @param {Uint8Array} data
 * @param {string} captpVersion
 * @param {(connection: Connection, sessionId: SessionId, peerLocation: OcapnLocation) => Ocapn} prepareOcapn
 */
export const handleHandshakeMessageData = (
  logger,
  sessionManager,
  connection,
  getSelfIdentityForConnection,
  sendAbortAndClose,
  data,
  captpVersion,
  prepareOcapn,
) => {
  try {
    const syrupReader = makeSyrupReader(data);
    while (syrupReader.index < data.length) {
      const start = syrupReader.index;
      let message;
      try {
        message = readOcapnHandshakeMessage(syrupReader);
      } catch (err) {
        const problematicBytes = data.slice(start);
        const syrupMessage = decodeSyrup(problematicBytes);
        logger.error(
          `Message decode error:`,
          err,
          'while reading',
          syrupMessage,
        );
        throw err;
      }
      if (!connection.isDestroyed) {
        handleSessionHandshakeMessage(
          logger,
          sessionManager,
          connection,
          getSelfIdentityForConnection,
          sendAbortAndClose,
          message,
          captpVersion,
          prepareOcapn,
        );
      } else {
        logger.info(
          'Server received message after connection was destroyed',
          message,
        );
      }
    }
  } catch (err) {
    logger.error(`Unexpected error while processing handshake message:`, err);
    sendAbortAndClose(connection, 'internal error');
    sessionManager.deleteConnection(connection);
  }
};
