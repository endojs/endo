// @ts-check
import harden from '@endo/harden';
import { Fail, q } from '@endo/errors';

/**
 * A hybrid OCapN network fronting several transports on one client, so
 * the daemon holds its worker sessions (siesta-pipe, handshake-free
 * `provideSession`) and its remote-peer sessions (a handshake netlayer
 * such as durable TCP) in one session manager — the substrate of the
 * protocol-unified comms-vat daemon.
 *
 * Routing is by the location's network id: `siesta-pipe` locations
 * resolve to a per-worker pipe network via `resolvePipe`; everything
 * else falls back to the base netlayer's connect + handshake path
 * (`provideSession` declines by resolving undefined, which the OCapN
 * client treats as fall-through).
 *
 * @param {object} options
 * @param {(designator: string) => { network: any } | undefined} options.resolvePipe
 *   look up the live pipe network for a `siesta-pipe` location
 *   designator (`<workerId>-worker`), e.g. from the host's running
 *   worker incarnations
 * @param {any} options.fallback the handshake netlayer for every other
 *   location (provides the daemon's public location)
 */
export const makeRoutingNetwork = ({ resolvePipe, fallback }) => {
  /** @param {any} location */
  const networkIdOf = location => location.network ?? location.transport;

  return harden({
    location: fallback.location,
    locationId: fallback.locationId,
    /** @param {any} location */
    connect: location => {
      networkIdOf(location) !== 'siesta-pipe' ||
        Fail`siesta-pipe locations have no connect path`;
      return fallback.connect(location);
    },
    /** @param {any} location */
    provideSession: async location => {
      if (networkIdOf(location) !== 'siesta-pipe') {
        // Decline: the client falls back to connect + handshake.
        return fallback.provideSession
          ? fallback.provideSession(location)
          : undefined;
      }
      const pipe = resolvePipe(location.designator);
      if (pipe === undefined) {
        throw Fail`no running worker pipe for ${q(location.designator)}`;
      }
      return pipe.network.provideSession(location);
    },
    shutdown: () => {
      fallback.shutdown();
    },
    /**
     * Forwarded so durable-session glue can key persistence by resume
     * token for remote-peer sessions; pipe sessions have no token.
     *
     * @param {any} connection
     */
    getResumeToken: connection => {
      return fallback.getResumeToken !== undefined
        ? fallback.getResumeToken(connection)
        : undefined;
    },
  });
};
harden(makeRoutingNetwork);
