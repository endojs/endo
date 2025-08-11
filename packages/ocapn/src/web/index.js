// @ts-check
/* global window */

import { makeWebSocketClientNetLayer } from '../netlayers/web-socket/client.js';
import { makeClient } from '../client/index.js';

const client = makeClient();
const webSocketNetlayer = await makeWebSocketClientNetLayer({ client });
client.registerNetlayer(webSocketNetlayer);

// @ts-expect-error
window.ocapn = client;
