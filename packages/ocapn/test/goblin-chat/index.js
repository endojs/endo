// @ts-check
/* global process */

/**
 * Endo interop client for a Guile-hosted Goblin Chat room.
 *
 * The exchange itself (join → subscribe → bilateral send/receive →
 * verify) lives in `@endo/goblin-chat/interop-driver` (imported here
 * via a relative path; see the import comment) so it can be shared
 * with the all-JS self-interop test in
 * `packages/goblin-chat/test/interop-self.test.js`. This script's job
 * is just to stand up an Endo-side websocket netlayer, parse the
 * Guile-printed sturdyref URI, enliven it, and hand the resulting
 * `^chatroom` presence to that shared driver.
 */

import '@endo/init';

/**
 * @import { OcapnLocation } from '../../src/codecs/components.js'
 */

import { Buffer } from 'buffer';
// Use the explicit `./src/...` subpath instead of the cleaner
// `@endo/goblin-chat/interop-driver` shortcut: `eslint-plugin-import`'s
// resolver in this repo doesn't consult the `exports` field, and
// `import/no-relative-packages` rejects the equivalent `../../../`
// relative form. The package.json mirrors this subpath in `exports`
// so Node's runtime resolution agrees.
import { runChatParticipant } from '@endo/goblin-chat/src/interop-driver.js';
import { makeWebSocketNetLayer } from '../../src/netlayers/websocket.js';
import { makeClient } from '../../src/client/index.js';
import { uint8ArrayToImmutableArrayBuffer } from '../../src/buffer-utils.js';
import { encodeSwissnum } from '../../src/client/util.js';

const DEFAULT_PORT = 0;
const DEFAULT_CAPTP_VERSION = 'goblins-0.16';
const DEFAULT_GUILE_MESSAGE = 'hello from Guile CI';
const DEFAULT_ENDO_MESSAGE = 'hello from Endo OCapN';

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
