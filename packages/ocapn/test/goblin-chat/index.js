// @ts-check
/* global process, setTimeout, clearTimeout */

/**
 * Endo interop client for a Guile-hosted Goblin Chat room.
 */

import '@endo/init';

/**
 * @import { OcapnLocation } from '../../src/codecs/components.js'
 */

import { Buffer } from 'buffer';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { makeUserControllerPair } from '@endo/goblin-chat';
import { makeWebSocketNetLayer } from '../../src/netlayers/websocket.js';
import { makeClient } from '../../src/client/index.js';
import { uint8ArrayToImmutableArrayBuffer } from '../../src/buffer-utils.js';
import { encodeSwissnum } from '../../src/client/util.js';

const DEFAULT_PORT = 0;
const DEFAULT_CAPTP_VERSION = 'goblins-0.16';
const DEFAULT_GUILE_MESSAGE = 'hello from Guile CI';
const DEFAULT_ENDO_MESSAGE = 'hello from Endo OCapN';
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * @param {string} value
 * @returns {ArrayBufferLike}
 */
const decodeBase64Url = value => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return uint8ArrayToImmutableArrayBuffer(
    Uint8Array.from(Buffer.from(padded, 'base64')),
  );
};

/**
 * @param {string} uri
 * @returns {{ location: OcapnLocation; swissNum: import('../../src/client/types.js').SwissNum }}
 */
const parseSturdyrefUri = uri => {
  const match = /^ocapn:\/\/([^/?#]+)(\/[^?#]*)?(?:\?([^#]*))?$/.exec(uri);
  if (!match) {
    throw Error(`Invalid OCapN URI: ${uri}`);
  }
  const [, host, path = '/', query = ''] = match;
  const hostParts = host.split('.');
  if (hostParts.length < 2) {
    throw Error(`Invalid OCapN host: ${host}`);
  }
  const transport = hostParts.pop();
  const designator = hostParts.join('.');
  if (!transport) {
    throw Error(`Missing transport in OCapN host: ${host}`);
  }

  /** @type {Record<string, string>} */
  const hints = {};
  for (const [key, value] of new URLSearchParams(query).entries()) {
    hints[key] = value;
  }

  /** @type {ArrayBufferLike | import('../../src/client/types.js').SwissNum} */
  let parsedSwissNum;
  if (path && path !== '/') {
    if (!path.startsWith('/s/')) {
      throw Error(`Unsupported OCapN URI path: ${path}`);
    }
    const swissBase64Url = path.slice(3);
    parsedSwissNum = decodeBase64Url(swissBase64Url);
  } else if (typeof hints.swiss === 'string' && hints.swiss.length > 0) {
    parsedSwissNum = encodeSwissnum(hints.swiss);
  } else {
    throw Error(`No sturdyref swiss number found in URI: ${uri}`);
  }
  const swissNum = /** @type {import('../../src/client/types.js').SwissNum} */ (
    parsedSwissNum
  );

  return {
    location: {
      type: 'ocapn-peer',
      designator,
      transport,
      hints,
    },
    swissNum,
  };
};

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

  /** @type {(value?: unknown) => void} */
  let resolveDone;
  /** @type {(reason?: any) => void} */
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const timeout = setTimeout(() => {
    rejectDone(
      Error(`Timed out waiting for interop messages (${DEFAULT_TIMEOUT_MS}ms)`),
    );
  }, DEFAULT_TIMEOUT_MS);

  /** @type {Set<string>} */
  const seenMessages = new Set();
  let sentLocalMessageAck = false;

  const finishIfReady = () => {
    if (
      sentLocalMessageAck &&
      seenMessages.has(expectedRemoteMessage) &&
      seenMessages.has(localMessage)
    ) {
      console.log('*** Endo interop observer received both expected messages');
      resolveDone(undefined);
    }
  };

  const observer = Far('interop-observer', {
    'new-message': (_context, _fromUser, message) => {
      if (typeof message !== 'string') {
        return;
      }
      console.log(`*** Endo interop observer received message: ${message}`);
      seenMessages.add(message);
      finishIfReady();
    },
    'user-joined': _user => undefined,
    'user-left': _user => undefined,
  });

  const [status] = await E(channel).subscribe(observer);
  if (status !== 'OK') {
    throw Error(`Unexpected subscribe status: ${status}`);
  }
  console.log('*** Endo interop observer subscription ready');
  const ack = await E(channel)['send-message'](localMessage);
  sentLocalMessageAck = true;
  console.log(`*** Endo interop sent message, ack = ${JSON.stringify(ack)}`);
  finishIfReady();

  try {
    await done;
  } finally {
    clearTimeout(timeout);
  }
};

const main = async () => {
  const sturdyrefUri = process.argv[2];
  if (!sturdyrefUri) {
    throw Error('Usage: node index.js <guile-chatroom-sturdyref-uri>');
  }

  const port = Number(process.env.OCAPN_TEST_PORT) || DEFAULT_PORT;
  const expectedGuileMessage =
    process.env.OCAPN_INTEROP_GUILE_MESSAGE || DEFAULT_GUILE_MESSAGE;
  const endoMessage =
    process.env.OCAPN_INTEROP_ENDO_MESSAGE || DEFAULT_ENDO_MESSAGE;

  const { location, swissNum } = parseSturdyrefUri(sturdyrefUri);
  const captpVersion = process.env.OCAPN_CAPTP_VERSION || DEFAULT_CAPTP_VERSION;
  const client = makeClient({ verbose: true, captpVersion });
  await null;
  try {
    await client.registerNetlayer((handlers, logger) =>
      makeWebSocketNetLayer({ handlers, logger, specifiedPort: port }),
    );
    const sturdyRef = client.makeSturdyRef(location, swissNum);
    const chatroom = await client.enlivenSturdyRef(sturdyRef);
    await startInteropOcapnClient(chatroom, expectedGuileMessage, endoMessage);
    console.log('*** Endo interop completed');
  } finally {
    client.shutdown();
  }
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
