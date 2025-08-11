// @ts-check

/** @typedef {import('../../src/codecs/components.js').OcapnLocation} OcapnLocation */
/** @typedef {import('../../src/client/types.js').Client} Client */

import test from '@endo/ses-ava/prepare-endo.js';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import net from 'net';
import { isPromise } from '@endo/promise-kit';
import { makeWebSocketClientNetLayer } from '../../src/netlayers/web-socket/client.js';
import { makeWebSocketServerNetLayer } from '../../src/netlayers/web-socket/server.js';
import { makeClient } from '../../src/client/index.js';
import { testWithErrorUnwrapping } from '../_util.js';
import { encodeSwissnum } from '../../src/client/util.js';

/**
 * Get an available port for testing
 * @returns {Promise<number>}
 */
const getAvailablePort = async () => {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error('Could not get available port'));
      }
    });
    server.on('error', reject);
  });
};

/**
 * @param {string} debugLabel
 * @param {() => Map<string, any>} [makeDefaultSwissnumTable]
 * @param {number} [port]
 * @returns {Promise<{ client: Client, location: OcapnLocation }>}
 */
const makeTestWebSocketClient = async (
  debugLabel,
  makeDefaultSwissnumTable,
  port = 8080,
) => {
  const client = makeClient({
    debugLabel,
    swissnumTable: makeDefaultSwissnumTable && makeDefaultSwissnumTable(),
  });
  const webSocketNetlayer = await makeWebSocketClientNetLayer({
    client,
    url: `ws://localhost:${port}`,
  });
  client.registerNetlayer(webSocketNetlayer);
  const { location } = webSocketNetlayer;
  return { client, location };
};

/**
 * @param {string} debugLabel
 * @param {() => Map<string, any>} [makeDefaultSwissnumTable]
 * @param {number} [port]
 * @returns {Promise<{ client: Client, location: OcapnLocation }>}
 */
const makeTestWebSocketServer = async (
  debugLabel,
  makeDefaultSwissnumTable,
  port = 8080,
) => {
  const client = makeClient({
    debugLabel,
    swissnumTable: makeDefaultSwissnumTable && makeDefaultSwissnumTable(),
  });
  const webSocketServerNetlayer = await makeWebSocketServerNetLayer({
    client,
    port,
    hostname: 'localhost',
  });
  client.registerNetlayer(webSocketServerNetlayer);
  const { location } = webSocketServerNetlayer;
  return { client, location };
};

const makeTestWebSocketPair = async makeDefaultSwissnumTable => {
  const port = await getAvailablePort();
  const { client } =
    await makeTestWebSocketClient('Client', makeDefaultSwissnumTable, port);
  const { client: server, location: serverLocation } =
    await makeTestWebSocketServer('Server', makeDefaultSwissnumTable, port);

  const shutdownBoth = () => {
    client.shutdown();
    server.shutdown();
  };
  const { ocapn: clientOcapn } = await client.provideSession(serverLocation);
  const serverBootstrap = await clientOcapn.getBootstrap();
  return { client, server, serverLocation, shutdownBoth, clientOcapn, serverBootstrap };
};

test('WebSocket client and server basic communication', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Say Hello',
    Far('sayHello', name => {
      return `Hello ${name}`;
    }),
  );

  const { serverBootstrap, shutdownBoth } = await makeTestWebSocketPair(
    () => testObjectTable,
  );

  const helloer = await E(serverBootstrap).fetch(encodeSwissnum('Say Hello'));
  const result = await E(helloer)('Wuurl');
  t.is(result, 'Hello Wuurl');

  shutdownBoth();
});

testWithErrorUnwrapping(
  'exported promises dont conflict with answer position',
  async t => {
    const testObjectTable = new Map();
    testObjectTable.set(
      'Get Promises',
      Far('getPromises', () => {
        // return a bunch of promises to populate the local export table
        return [
          Promise.resolve('Why'),
          Promise.resolve('Hello'),
          Promise.resolve('There'),
        ];
      }),
    );
    testObjectTable.set(
      'Deep Number',
      Far('getNumberGetter', () => {
        return Far('getNumber', () => 42);
      }),
    );

    const { serverBootstrap, shutdownBoth } = await makeTestWebSocketPair(
      () => testObjectTable,
    );

    const getPromises = E(serverBootstrap).fetch(encodeSwissnum('Get Promises'));
    const promises = await E(getPromises)();

    // Do some promise pipelining so that incorrectly implemented answerPositions
    // could conflict with exported promises
    const getNumberGetter = E(serverBootstrap).fetch(encodeSwissnum('Deep Number'));
    const numberGetter = E(getNumberGetter)();
    const number = await E(numberGetter)();
    t.is(number, 42, 'Number is 42');

    // Sanity check
    t.truthy(
      promises.every(p => isPromise(p)),
      'All promises',
    );
    const results = await Promise.all(promises);
    t.deepEqual(results, ['Why', 'Hello', 'There'], 'All promises resolved');

    shutdownBoth();
  },
);
