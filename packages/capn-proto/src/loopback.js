// @ts-check
/**
 * Loopback helper that pairs two makeCapnp instances back-to-back.
 *
 * Both sides share the same InterfaceRegistry by default so that registered
 * methods on one side are usable from the other.
 */

import { makeCapnp } from './rpc-system.js';
import { makeInterfaceRegistry } from './interfaces.js';

/**
 * @param {object} [opts]
 * @param {unknown} [opts.nearBootstrap]
 * @param {unknown} [opts.farBootstrap]
 */
export const makeLoopback = (opts = {}) => {
  const interfaceRegistry = makeInterfaceRegistry();
  /** @type {Array<() => void>} */
  let nearInbox = [];
  /** @type {Array<() => void>} */
  let farInbox = [];
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    while (nearInbox.length || farInbox.length) {
      const fi = farInbox;
      farInbox = [];
      for (const fn of fi) fn();
      const ni = nearInbox;
      nearInbox = [];
      for (const fn of ni) fn();
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(flush);
  };

  // eslint-disable-next-line prefer-const
  let near; let far;
  near = makeCapnp({
    send: framed => {
      farInbox.push(() => far.dispatch(framed));
      schedule();
    },
    bootstrap: opts.nearBootstrap,
    interfaceRegistry,
  });
  far = makeCapnp({
    send: framed => {
      nearInbox.push(() => near.dispatch(framed));
      schedule();
    },
    bootstrap: opts.farBootstrap,
    interfaceRegistry,
  });

  return {
    near,
    far,
    interfaceRegistry,
    flush,
    registerInterface: interfaceRegistry.register,
  };
};
