// @ts-check
/* global process */

/**
 * Host script: runs an Endo OCapN peer that serves a Goblin Chat compatible
 * chatroom on the websocket netlayer. Intended to be driven by a
 * Goblins client (or another OCapN implementation) for interop exercises.
 */

import '@endo/init';

import { Buffer } from 'node:buffer';

import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { makeWebSocketNetLayer } from '../../src/netlayers/websocket.js';
import { makeClient } from '../../src/client/index.js';
import { locationToLocationId } from '../../src/client/util.js';
import { makeChatroom, makeUserControllerPair } from './backend.js';

const CHATROOM_SWISS = 'goblinChatRoomSwissnumForInteropTests0001';
const DEFAULT_PORT = 22047;
const DEFAULT_NAME = 'endo-interop';
const DEFAULT_CAPTP_VERSION = 'goblins-0.16';
const DEFAULT_GUILE_MESSAGE = 'hello from Guile CI';
const DEFAULT_ENDO_MESSAGE = 'hello from Endo OCapN';

/**
 * @param {any} chatroom
 * @param {string} expectedRemoteMessage
 * @param {string} localMessage
 */
const startInteropOcapnClient = async (
  chatroom,
  expectedRemoteMessage,
  localMessage,
) => {
  const { userController } = makeUserControllerPair('endo-interop-ocapn');
  const channel = await E(userController)['join-room'](chatroom);

  /** @type {Set<string>} */
  const seenMessages = new Set();
  let sentLocalMessage = false;

  const observer = Far('interop-observer', {
    'new-message': (_context, _fromUser, message) => {
      if (typeof message !== 'string') {
        return;
      }
      console.log(`*** Interop host observer received message: ${message}`);
      seenMessages.add(message);

      if (message === expectedRemoteMessage && !sentLocalMessage) {
        sentLocalMessage = true;
        E(channel)
          ['send-message'](localMessage)
          .then(ack => {
            console.log(
              `*** Interop host sent message, ack = ${JSON.stringify(ack)}`,
            );
          })
          .catch(err => {
            console.error('*** Interop host failed to send message', err);
          });
      }

      if (
        seenMessages.has(expectedRemoteMessage) &&
        seenMessages.has(localMessage)
      ) {
        console.log(
          '*** Interop host observer received both expected messages',
        );
      }
    },
    'user-joined': _user => undefined,
    'user-left': _user => undefined,
  });

  const [status] = await E(channel).subscribe(observer);
  if (status !== 'OK') {
    throw Error(`Unexpected subscribe status: ${status}`);
  }
  console.log('*** Interop host observer subscription ready');
};

const main = async () => {
  const roomName = process.argv[2] || DEFAULT_NAME;
  const port = Number(process.env.OCAPN_TEST_PORT) || DEFAULT_PORT;
  const expectedGuileMessage =
    process.env.OCAPN_INTEROP_GUILE_MESSAGE || DEFAULT_GUILE_MESSAGE;
  const endoMessage =
    process.env.OCAPN_INTEROP_ENDO_MESSAGE || DEFAULT_ENDO_MESSAGE;

  const captpVersion = process.env.OCAPN_CAPTP_VERSION || DEFAULT_CAPTP_VERSION;
  const client = makeClient({ verbose: true, captpVersion });
  const chatroom = makeChatroom(roomName);
  client.registerSturdyRef(CHATROOM_SWISS, chatroom);

  await startInteropOcapnClient(chatroom, expectedGuileMessage, endoMessage);

  const netlayer = await client.registerNetlayer((handlers, logger) =>
    makeWebSocketNetLayer({ handlers, logger, specifiedPort: port }),
  );
  // Peer locator the remote end dials to open a session.
  const peerUri = locationToLocationId(netlayer.location);
  // Sturdyref the remote end enlivens to get the chatroom. Per the
  // OCapN spec (and the Spritely Goblins reference implementation),
  // the swissnum is base64url(no-padding) of the raw swiss bytes
  // spliced in as a `/s/<value>` path segment between the authority
  // and the query string. We use the ASCII bytes of `CHATROOM_SWISS`
  // so the round-trip into Endo's `swissnumTable` (which keys on
  // ASCII strings via `decodeSwissnum`) keeps working.
  const swissBase64Url = Buffer.from(CHATROOM_SWISS, 'ascii').toString(
    'base64url',
  );
  const [authority, query = ''] = peerUri.split('?', 2);
  const roomUri = query
    ? `${authority}/s/${swissBase64Url}?${query}`
    : `${authority}/s/${swissBase64Url}`;
  console.log(`*** Peer locator: ${peerUri}`);
  console.log(`*** Serving chatroom "#${roomName}" at sturdyref: ${roomUri}`);
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
