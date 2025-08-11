// @ts-check

import '@endo/init';
import process from 'node:process';
import { E, makeClient, makeTcpNetLayer, encodeSwissnum } from '@endo/ocapn';

/** @returns {string} */
const getFnSwissnumFromEnv = () => {
  const swissnum = process.env.CAPRICORN_FN_SWISSNUM || '2w91spfxd66';
  if (!swissnum) {
    throw new Error('CAPRICORN_FN_SWISSNUM env var is required');
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
  const fnSwissnum = getFnSwissnumFromEnv();

  const client = makeClient({ debugLabel: 'LightbulbManipulator' });
  const tcpNetlayer = await makeTcpNetLayer({ client });
  client.registerNetlayer(tcpNetlayer);

  const { ocapn } = await client.provideSession(location);
  const bootstrap = await ocapn.getBootstrap();
  const routeFn = await E(bootstrap).fetch(encodeSwissnum(fnSwissnum));

  console.log('calling routeFn', routeFn);
  await E(routeFn)();
  console.log('routeFn called');

  client.shutdown();
  process.exit(0);
};

// eslint-disable-next-line no-console
main().catch(err => console.error(err));


