// @ts-check
/* eslint-env es2020 */

/** @typedef {import('@endo/ocapn').OcapnLocation} OcapnLocation */
/** @typedef {import('@endo/ocapn').Client} Client */

import { makeClient, makeTcpNetLayer, Far } from '@endo/ocapn';

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
 * @returns {Promise<{ client: Client, location: OcapnLocation, adminFacetSwissnum: string }>}
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

  const createRoute = (codeString, fnContextObject = {}) => {
    console.log('CreateRoute received a message:', codeString, fnContextObject);
    // Expose platform fetch
    const platformContextObject = {
      fetch: globalThis.fetch,
    };
    const contextObject = {
      ...fnContextObject,
      ...platformContextObject,
    };
    const compartment = new Compartment(contextObject);
    const routeFn = compartment.evaluate(codeString);
    if (typeof routeFn !== 'function') {
      throw new Error('Route function is not a function');
    }
    const routeFarFn = Far('routeFn', routeFn);
    const routeSwissnum = randomSwissnum();
    exposeSturdyref(routeSwissnum, routeFarFn);
    return routeSwissnum;
  };

  if (isInitialized) {
    // Reinitialize state
    for (const [swissnum, object] of Object.entries(state.routes)) {
      exposeSturdyref(swissnum, object);
    }
    if (state.admin) {
      exposeSturdyref(state.admin, state.admin);
    }
  } else {
    // Make admin object
    const adminFacetSwissnum = randomSwissnum();
    state.admin = adminFacetSwissnum;
    storageProvider.set(state);
    const adminFacet = Far('adminFacet', {
      createRoute,
    });
    exposeSturdyref(adminFacetSwissnum, adminFacet);
  }

  const client = makeClient({
    debugLabel,
    swissnumTable,
  });
  const tcpNetlayer = await makeTcpNetLayer({ client });
  client.registerNetlayer(tcpNetlayer);
  const { location } = tcpNetlayer;

  return { client, location, adminFacetSwissnum: state.admin };
};
