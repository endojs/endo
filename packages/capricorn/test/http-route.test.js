// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';

import http from 'node:http';
import { E, makeClient, makeTcpNetLayer, encodeSwissnum } from '@endo/ocapn';
import { makeCapricornServer } from '../src/server.js';

test('capricorn can create a route and fetch a scalar value from local server', async t => {
  // Start a local HTTP server that returns JSON 42
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(42));
  });
  await new Promise(resolve => server.listen(0, () => resolve(undefined)));
  const address = server.address();
  if (
    address === null ||
    typeof address !== 'object' ||
    typeof address.port !== 'number'
  ) {
    throw new Error('Server address is not an object with a port property');
  }
  const port = address.port;

  // In-memory storage provider stub for test isolation
  /** @type {import('../src/server.js').StorageProvider} */
  const storageProvider = {
    get: () => undefined,
    set: _value => {},
  };

  const {
    client: serverClient,
    location,
    adminFacetSwissnum,
  } = await makeCapricornServer('TestCapricorn', storageProvider);

  // Create a separate client to connect to the server's location
  const client = makeClient({ debugLabel: 'TestClient' });
  const tcpNetlayer = await makeTcpNetLayer({ client });
  client.registerNetlayer(tcpNetlayer);

  const { ocapn } = await client.provideSession(location);
  const bootstrap = await ocapn.getBootstrap();

  // Fetch the admin facet using its swissnum
  const adminFacet = await E(bootstrap).fetch(
    encodeSwissnum(adminFacetSwissnum),
  );

  // Route handler code: fetch from local server and return parsed JSON
  const routeCode = `
    async () => {
      const res = await fetch('http://localhost:${port}/');
      return await res.json();
    }
  `;

  const routeSwissnum = await E(adminFacet).createRoute(routeCode);
  console.log('Route swissnum:', routeSwissnum);

  t.truthy(routeSwissnum, 'received a route swissnum');

  // Fetch the newly created route and invoke it
  const route = await E(bootstrap).fetch(encodeSwissnum(routeSwissnum));
  console.log('Route:', route);
  try {
    const result = await E(route)();
    t.is(result, 42);
  } finally {
    // Cleanup
    serverClient.shutdown();
    client.shutdown();
    await new Promise(resolve => server.close(() => resolve(undefined)));
  }
});
