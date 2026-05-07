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
 * @import { OcapnLocation } from '@endo/ocapn'
 */

import { makeOcapn } from '@endo/ocapn';
import { makeWebSocketNetLayer } from '@endo/ocapn/netlayer/ws';
import { syrupCodec } from '@endo/ocapn/syrup';
import { decodeBase64Url } from '../../src/base64url.js';
import { runChatParticipant } from '../../src/interop-driver.js';

const swissnumEncoder = new TextEncoder();

const DEFAULT_PORT = 0;
const DEFAULT_CAPTP_VERSION = '1.0';
const DEFAULT_GUILE_MESSAGE = 'hello from Guile CI';
const DEFAULT_ENDO_MESSAGE = 'hello from Endo OCapN';

/**
 * @param {string} uri
 * @returns {{ location: OcapnLocation; swissNum: Uint8Array }}
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

  /** @type {Uint8Array} */
  let swissNum;
  if (path && path !== '/') {
    if (!path.startsWith('/s/')) {
      throw Error(`Unsupported OCapN URI path: ${path}`);
    }
    swissNum = decodeBase64Url(path.slice(3));
  } else if (typeof hints.swiss === 'string' && hints.swiss.length > 0) {
    // Validate ASCII so a stray non-ASCII char in a `?swiss=…` hint
    // fails loudly here rather than producing a wire-level mystery.
    for (let i = 0; i < hints.swiss.length; i += 1) {
      if (hints.swiss.charCodeAt(i) > 127) {
        throw Error(
          `Non-ASCII byte in swissnum at position ${i}: ${hints.swiss[i]}`,
        );
      }
    }
    swissNum = swissnumEncoder.encode(hints.swiss);
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
  const client = await makeOcapn({
    codec: syrupCodec,
    verbose: true,
    captpVersion,
    network: (handlers, logger) =>
      makeWebSocketNetLayer({ handlers, logger, specifiedPort: port }),
  });
  try {
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
