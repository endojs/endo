// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';

import http from 'node:http';
import { E, makeClient, makeTcpNetLayer, encodeSwissnum } from '@endo/ocapn';
import { makeCapricornServer } from '../src/server.js';

test('capricorn can create a route and fetch a scalar value from local server, and still works after server restart', async t => {
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

  // Persistent in-memory storage provider across restarts for this test
  /** @type {Record<string, any> | undefined} */
  let persistedState;
  /** @type {import('../src/server.js').StorageProvider} */
  const storageProvider = {
    get: () => persistedState,
    set: value => {
      persistedState = value;
    },
  };

  const {
    client: serverClient1,
    location: location1,
    adminFacetSwissnum,
  } = await makeCapricornServer('TestCapricorn', storageProvider);

  // Create a separate client to connect to the server's location
  const client = makeClient({ debugLabel: 'TestClient' });
  const tcpNetlayer = await makeTcpNetLayer({ client });
  client.registerNetlayer(tcpNetlayer);

  const { ocapn } = await client.provideSession(location1);
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

  // Fetch the newly created route and invoke it (before restart)
  const route1 = await E(bootstrap).fetch(encodeSwissnum(routeSwissnum));
  console.log('Route before restart:', route1);

  // First invocation should succeed
  const result1 = await E(route1)();
  t.is(result1, 42);

  // Simulate server restart by shutting down and starting a new server with the same storage
  serverClient1.shutdown();
  client.shutdown();

  const {
    client: serverClient2,
    location: location2,
    adminFacetSwissnum: adminFacetSwissnum2,
  } = await makeCapricornServer('TestCapricorn-Restart', storageProvider);

  // Ensure admin swissnum persisted across restart
  t.is(adminFacetSwissnum2, adminFacetSwissnum);

  // New client/session to the restarted server
  const client2 = makeClient({ debugLabel: 'TestClient-After-Restart' });
  const tcpNetlayer2 = await makeTcpNetLayer({ client: client2 });
  client2.registerNetlayer(tcpNetlayer2);

  const { ocapn: ocapn2 } = await client2.provideSession(location2);
  const bootstrap2 = await ocapn2.getBootstrap();

  // Fetch the same route and invoke it after restart
  const route2 = await E(bootstrap2).fetch(encodeSwissnum(routeSwissnum));
  console.log('Route after restart:', route2);
  try {
    const result2 = await E(route2)();
    t.is(result2, 42);
  } finally {
    // Cleanup
    // Shut down restarted server and client
    serverClient2.shutdown();
    // Close HTTP origin server
    await new Promise(resolve => server.close(() => resolve(undefined)));
    client2.shutdown();
  }
});
