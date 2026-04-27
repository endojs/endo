// @ts-check
/* global process */

/**
 * Endo interop client for a Guile-hosted Goblin Chat room.
 *
 * The exchange itself (join → subscribe → bilateral send/receive →
 * verify) lives in `../../src/interop-driver.js` so it can be shared
 * with the all-JS self-interop test in `../interop-self.test.js`.
 * This script's job is just to stand up an Endo-side websocket
 * netlayer, parse the Guile-printed sturdyref URI, enliven it, and
 * hand the resulting `^chatroom` presence to that shared driver.
 */

import '@endo/init';

/**
 * @import { OcapnLocation, SwissNum } from '@endo/ocapn'
 */

import { Buffer } from 'buffer';
import { makeClient, swissnumFromBytes } from '@endo/ocapn';
import { makeWebSocketNetLayer } from '@endo/ocapn/src/netlayers/websocket.js';
import { runChatParticipant } from '../../src/interop-driver.js';

const swissnumEncoder = new TextEncoder();

const DEFAULT_PORT = 0;
const DEFAULT_CAPTP_VERSION = '1.0';
const DEFAULT_GUILE_MESSAGE = 'hello from Guile CI';
const DEFAULT_ENDO_MESSAGE = 'hello from Endo OCapN';

/**
 * @param {string} value
 * @returns {SwissNum}
 */
const swissnumFromBase64Url = value => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return swissnumFromBytes(Uint8Array.from(Buffer.from(padded, 'base64')));
};

/**
 * Local equivalent of `encodeSwissnum`, kept inline so this script
 * doesn't pull a swissnum-encoding helper into `@endo/ocapn`'s public
 * exports map (mirrors `test/interop-self.test.js`).
 *
 * @param {string} value
 * @returns {SwissNum}
 */
const swissnumFromAsciiString = value => {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 127) {
      throw Error(`Non-ASCII byte in swissnum at position ${i}: ${value[i]}`);
    }
  }
  return swissnumFromBytes(swissnumEncoder.encode(value));
};

/**
 * @param {string} uri
 * @returns {{ location: OcapnLocation; swissNum: SwissNum }}
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

  /** @type {SwissNum} */
  let swissNum;
  if (path && path !== '/') {
    if (!path.startsWith('/s/')) {
      throw Error(`Unsupported OCapN URI path: ${path}`);
    }
    swissNum = swissnumFromBase64Url(path.slice(3));
  } else if (typeof hints.swiss === 'string' && hints.swiss.length > 0) {
    swissNum = swissnumFromAsciiString(hints.swiss);
  } else {
    throw Error(`No sturdyref swiss number found in URI: ${uri}`);
  }

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
    await runChatParticipant({
      chatroom,
      name: 'endo-interop-ocapn',
      localMessage: endoMessage,
      expectedRemoteMessage: expectedGuileMessage,
      log: line => console.log(`*** ${line}`),
    });
    console.log('*** Endo interop completed');
  } finally {
    client.shutdown();
  }
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
