// @ts-check
/* eslint-env es2020 */

/** @typedef {import('@endo/ocapn').OcapnLocation} OcapnLocation */
/** @typedef {import('@endo/ocapn').Client} Client */

import { makeClient, makeTcpNetLayer, Far, makeWebSocketServerNetLayer } from '@endo/ocapn';

const makeDefaultState = () => ({
  routes: {},
  admin: undefined,
});

/**
 * @typedef {object} StorageProvider
 * @property {() => Record<string, any> | undefined} get
 * @property {(value: Record<string, any>) => void} set
 */

const randomSwissnum = () => {
  return Math.random().toString(36).substring(2, 15);
};

/**
 * @param {string} debugLabel
 * @param {StorageProvider} storageProvider
 * @returns {Promise<{ client: Client, tcpLocation: OcapnLocation, webSocketLocation: OcapnLocation, adminFacetSwissnum: string }>}
 */
export const makeCapricornServer = async (debugLabel, storageProvider) => {
  const initialState = storageProvider.get();
  const isInitialized = initialState !== undefined;
  const state = initialState || makeDefaultState();
  const swissnumTable = new Map();

  const exposeSturdyref = (swissnum, object) => {
    console.log('Exposing Sturdyref:', swissnum, object);
    swissnumTable.set(swissnum, object);
  };

  const materializeRoute = (swissnum, codeString) => {
    // Expose platform fetch
    const contextObject = {
      fetch: globalThis.fetch,
    };
    const compartment = new Compartment(contextObject);
    const routeFn = compartment.evaluate(codeString);
    if (typeof routeFn !== 'function') {
      throw new Error(`Route function is not a function, got: ${typeof routeFn}`);
    }
    const routeFarFn = Far('routeFn', routeFn);
    exposeSturdyref(swissnum, routeFarFn);
    return routeFarFn;
  }

  // Creates a new route
  const createRoute = (codeString) => {
    console.log('CreateRoute received a message:', codeString);
    const routeSwissnum = randomSwissnum();
    materializeRoute(routeSwissnum, codeString);
    // Record the route in state
    state.routes[routeSwissnum] = { codeString };
    storageProvider.set(state);
    return routeSwissnum;
  };

  const adminFacetSwissnum = state.admin || randomSwissnum();
  const adminFacet = Far('adminFacet', {
    createRoute,
  });
  exposeSturdyref(adminFacetSwissnum, adminFacet);

  if (isInitialized) {
    // Reinitialize state
    for (const [swissnum, { codeString }] of Object.entries(state.routes)) {
      materializeRoute(swissnum, codeString);
    }
  } else {
    // Record the admin swissnum
    state.admin = adminFacetSwissnum;
    storageProvider.set(state);
  }

  const client = makeClient({
    debugLabel,
    swissnumTable,
  });
  const tcpNetlayer = await makeTcpNetLayer({
    client,
    specifiedHostname: '192.168.50.96',
  });
  client.registerNetlayer(tcpNetlayer);
  const webSocketNetlayer = await makeWebSocketServerNetLayer({
    client,
    hostname: '192.168.50.96',
  });
  client.registerNetlayer(webSocketNetlayer);
  const { location: tcpLocation } = tcpNetlayer;
  const { location: webSocketLocation } = webSocketNetlayer;

  return { client, tcpLocation, webSocketLocation, adminFacetSwissnum: state.admin };
};
