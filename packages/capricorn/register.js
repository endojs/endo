// @ts-check

import '@endo/init';
import process from 'node:process';
import fs from 'node:fs/promises';
import { E, makeClient, makeTcpNetLayer, encodeSwissnum } from '@endo/ocapn';

/** @returns {string} */
const getAdminSwissnumFromEnv = () => {
  const swissnum = process.env.CAPRICORN_ADMIN_SWISSNUM || 'h5xwz4k41pk';
  if (!swissnum) {
    throw new Error('CAPRICORN_ADMIN_SWISSNUM env var is required');
  }
  return swissnum;
};

/** @returns {import('@endo/ocapn').OcapnLocation} */
const getLocationFromEnv = () => {
  const address = process.env.CAPRICORN_LOCATION || '127.0.0.1:64187';
  if (!address) {
    throw new Error('CAPRICORN_LOCATION env var is required (e.g., 127.0.0.1:64187)');
  }
  /** @type {import('@endo/ocapn').OcapnLocation} */
  const loc = {
    type: 'ocapn-node',
    transport: 'tcp-testing-only',
    address,
    hints: false,
  };
  return loc;
};

const main = async () => {
  const location = getLocationFromEnv();
  const adminFacetSwissnum = getAdminSwissnumFromEnv();

  const client = makeClient({ debugLabel: 'LightbulbManipulator' });
  const tcpNetlayer = await makeTcpNetLayer({ client });
  client.registerNetlayer(tcpNetlayer);

  const { ocapn } = await client.provideSession(location);
  const bootstrap = await ocapn.getBootstrap();
  const adminFacet = await E(bootstrap).fetch(encodeSwissnum(adminFacetSwissnum));

  // Install a simple route that toggles a light using the file contents
  const routeCode = await fs.readFile(new URL('./toggle-light.js', import.meta.url), 'utf8');

  const routeSwissnum = await E(adminFacet).createRoute(routeCode);
  // eslint-disable-next-line no-console
  console.log('Installed route swissnum:', routeSwissnum);

  client.shutdown();
  process.exit(0);
};

// eslint-disable-next-line no-console
main().catch(err => console.error(err));


