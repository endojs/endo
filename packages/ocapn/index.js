// @ts-check

/** @typedef {import('./src/codecs/components.js').OcapnLocation} OcapnLocation */
/** @typedef {import('./src/client/types.js').Client} Client */

import { makeClient } from './src/client/index.js';
import { makeTcpNetLayer } from './src/netlayers/tcp-test-only.js';
import { encodeSwissnum } from './src/client/util.js';
import { OcapnFar as Far } from './src/client/ocapn.js';
import { E } from '@endo/eventual-send';

export { makeClient, makeTcpNetLayer, encodeSwissnum, Far, E };

export { makeWebSocketServerNetLayer } from './src/netlayers/web-socket/server.js';