// @ts-check

// import { webSocketNetLayer } from '../netlayers/web-socket.js';
import { makeClient } from '../client/index.js';

const client = makeClient();
// const webSocketNetlayer = await webSocketNetLayer({ client });
// client.registerNetlayer(webSocketNetlayer);

// @ts-expect-error
window.ocapn = client;
