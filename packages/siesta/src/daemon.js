// @ts-check
import harden from '@endo/harden';
import { Fail } from '@endo/errors';
import { makeOcapn } from '@endo/ocapn';

import { makeDurableSessions } from './durable-sessions.js';
import { makeSiestaHost } from './host.js';

/**
 * @import {SiestaHost, WorkerEngine} from './host.js'
 * @import {SiestaStore} from './store-fs.js'
 */

/**
 * @typedef {object} SiestaDaemon
 * @property {SiestaHost} host
 * @property {Awaited<ReturnType<typeof makeOcapn>>} ocapn
 * @property {any} location this daemon's OCapN location; combine with a
 *   publication's swissnum to mint a sturdy ref on any peer
 * @property {(secret: string) => { location: any, secret: string }} makeSturdyRefDetails
 * @property {() => Promise<void>} shutdown
 */

/**
 * Makes a siesta daemon: a siesta host whose locator is served over
 * OCapN, so worker exports published under swissnums are reachable as
 * sturdy refs.
 *
 * The netlayer is injected as a power so the embedder chooses the
 * transport (TCP-testing for tests, Noise for production).
 *
 * The daemon always offers session durability: `makeNetlayer` receives
 * a `resumption` power alongside `handlers`, and a netlayer that wires
 * it (the durable netlayer does) gets sessions that survive daemon
 * restarts — identity and export descriptions persisted per resume
 * token, exports re-seated from the host's capability linkage at
 * resume. Netlayers that ignore `resumption` are unaffected.
 *
 * @param {object} options
 * @param {SiestaStore} options.store
 * @param {WorkerEngine} options.engine
 * @param {any} options.codec an OCapN codec, e.g. `syrupCodec`
 * @param {(powers: { handlers: any, logger: any, resumption: any }) => Promise<any> | any} options.makeNetlayer
 * @param {number} [options.idleTimeoutMs]
 * @param {boolean} [options.verbose]
 * @returns {Promise<SiestaDaemon>}
 */
export const makeSiestaDaemon = async ({
  store,
  engine,
  codec,
  makeNetlayer,
  idleTimeoutMs,
  verbose = false,
}) => {
  /** @type {Map<string, any>} */
  const locator = new Map();
  const host = await makeSiestaHost({ store, engine, locator, idleTimeoutMs });
  const durableSessions = makeDurableSessions({ store, host });

  /** @type {{ netlayer?: any }} */
  const netlayerRef = {};
  const ocapn = await makeOcapn({
    codec,
    locator,
    verbose,
    sessionHooks: durableSessions.sessionHooks,
    network: (handlers, logger) =>
      Promise.resolve(
        makeNetlayer({
          handlers,
          logger,
          resumption: durableSessions.resumption,
        }),
      ).then(netlayer => {
        netlayerRef.netlayer = netlayer;
        durableSessions.setNetlayer(netlayer);
        return netlayer;
      }),
  });
  netlayerRef.netlayer !== undefined ||
    Fail`makeNetlayer did not produce a netlayer`;
  const { location } = netlayerRef.netlayer;

  return harden({
    host,
    ocapn,
    location,
    makeSturdyRefDetails: secret => harden({ location, secret }),
    shutdown: async () => {
      // Workers first, so replies to remote calls still executing reach
      // the wire before the netlayer closes.
      await host.shutdown();
      ocapn.shutdown();
    },
  });
};
harden(makeSiestaDaemon);
