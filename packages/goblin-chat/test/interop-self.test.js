// @ts-check

/**
 * All-JS bilateral interop test.
 *
 * Mirrors the structure of `packages/ocapn/test/goblin-chat/` (where
 * an Endo OCapN client connects to a Guile-hosted chatroom over the
 * websocket netlayer) — but here both sides run in this process. One
 * side hosts the JS port of `^chatroom` and registers it under a
 * known swissnum on a websocket netlayer; the other side enlivens it
 * via `makeSturdyRef` + `enlivenSturdyRef` and joins as a remote
 * participant.
 *
 * Both sides are driven by the same `runChatParticipant` helper that
 * the Guile-interop CI script uses, so this test exercises that
 * helper end-to-end against the real OCapN websocket transport (not
 * just an in-process Far reference).
 */

import '@endo/init';

import test from '@endo/ses-ava/test.js';

import { makeClient } from '@endo/ocapn/src/client/index.js';
import { makeWebSocketNetLayer } from '@endo/ocapn/src/netlayers/websocket.js';
import { encodeSwissnum } from '@endo/ocapn/src/client/util.js';

import { makeChatroom } from '../src/backend.js';
import { runChatParticipant } from '../src/interop-driver.js';

const ROOM_SWISS = 'interop-room';
const ROOM_NAME = '#interop-room';
const HOST_MESSAGE = 'hello from JS host';
const CLIENT_MESSAGE = 'hello from Endo OCapN';
// Match what the Guile-interop CI test uses, so the wire-level
// handshake is exercised against the same CapTP version.
const CAPTP_VERSION = 'goblins-0.16';

test('endo OCapN client interops with the JS goblin-chat backend', async t => {
  const chatroom = makeChatroom(ROOM_NAME);

  // Host: owns the chatroom Far and exposes it under a known
  // swissnum so the remote side can enliven it via sturdyref.
  const hostClient = makeClient({
    debugLabel: 'js-host',
    captpVersion: CAPTP_VERSION,
  });
  hostClient.registerSturdyRef(ROOM_SWISS, chatroom);
  const hostNetlayer = await hostClient.registerNetlayer((handlers, logger) =>
    makeWebSocketNetLayer({ handlers, logger }),
  );

  // Remote participant: a fully separate OCapN client, talks to the
  // host through its websocket netlayer just like the Endo CI client
  // talks to the Guile host.
  const remoteClient = makeClient({
    debugLabel: 'endo-remote',
    captpVersion: CAPTP_VERSION,
  });
  await remoteClient.registerNetlayer((handlers, logger) =>
    makeWebSocketNetLayer({ handlers, logger }),
  );

  try {
    const sturdyRef = remoteClient.makeSturdyRef(
      hostNetlayer.location,
      encodeSwissnum(ROOM_SWISS),
    );
    const remoteChatroom = await remoteClient.enlivenSturdyRef(sturdyRef);

    // Both sides run the same driver. Each subscribes, waits to see a
    // non-self `user-joined`, sends its local message, and resolves
    // once both sides' messages have round-tripped through the
    // chatroom. Drive them concurrently so the timeout in the driver
    // catches a deadlock in either direction.
    await Promise.all([
      runChatParticipant({
        chatroom,
        name: 'js-host',
        localMessage: HOST_MESSAGE,
        expectedRemoteMessage: CLIENT_MESSAGE,
        log: line => t.log(line),
      }),
      runChatParticipant({
        chatroom: remoteChatroom,
        name: 'endo-remote',
        localMessage: CLIENT_MESSAGE,
        expectedRemoteMessage: HOST_MESSAGE,
        log: line => t.log(line),
      }),
    ]);

    t.pass('both participants observed bilateral message exchange');
  } finally {
    remoteClient.shutdown();
    hostClient.shutdown();
  }
});
