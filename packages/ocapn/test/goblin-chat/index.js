// @ts-check
/* global process */

/**
 * Host script: runs an Endo OCapN peer that serves a Goblin Chat compatible
 * chatroom on the websocket netlayer. Intended to be driven by a
 * Goblins client (or another OCapN implementation) for interop exercises.
 */

import '@endo/init';

import { makeWebSocketNetLayer } from '../../src/netlayers/websocket.js';
import { makeClient } from '../../src/client/index.js';
import { locationToLocationId } from '../../src/client/util.js';
import { makeChatroom } from './backend.js';

const CHATROOM_SWISS = 'goblinChatRoomSwissnumForInteropTests0001';
const DEFAULT_PORT = 22047;
const DEFAULT_NAME = 'endo-interop';
const DEFAULT_CAPTP_VERSION = 'goblins-0.16';

const main = async () => {
  const roomName = process.argv[2] || DEFAULT_NAME;
  const port = Number(process.env.OCAPN_TEST_PORT) || DEFAULT_PORT;

  const captpVersion = process.env.OCAPN_CAPTP_VERSION || DEFAULT_CAPTP_VERSION;
  const client = makeClient({ verbose: true, captpVersion });
  const chatroom = makeChatroom(roomName);
  client.registerSturdyRef(CHATROOM_SWISS, chatroom);

  const netlayer = await client.registerNetlayer((handlers, logger) =>
    makeWebSocketNetLayer({ handlers, logger, specifiedPort: port }),
  );
  const hintRecord =
    netlayer.location.hints && typeof netlayer.location.hints === 'object'
      ? netlayer.location.hints
      : {};
  const roomLocation = {
    ...netlayer.location,
    hints: {
      ...hintRecord,
      swiss: CHATROOM_SWISS,
    },
  };
  // Peer locator the remote end dials to open a session.
  const peerUri = locationToLocationId(netlayer.location);
  // Sturdyref the remote end enlivens to get the chatroom.
  const roomUri = locationToLocationId(roomLocation);
  console.log(`*** Peer locator: ${peerUri}`);
  console.log(`*** Serving chatroom "#${roomName}" at sturdyref: ${roomUri}`);
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
