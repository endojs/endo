// @ts-check
/**
 * Top-level public factory.
 *
 * Wraps a single connection and exposes a high-level API: registerInterface,
 * getBootstrap, abort, stats. For multi-peer setups (e.g. with Level 3
 * three-party handoff), instantiate one makeCapnp per peer and share a
 * single InterfaceRegistry across them.
 */

import { makeConnection } from './connection.js';
import { makeInterfaceRegistry } from './interfaces.js';

/**
 * @param {object} cfg
 * @param {(framed: ArrayBuffer) => void} cfg.send
 * @param {unknown} [cfg.bootstrap]
 * @param {ReturnType<typeof makeInterfaceRegistry>} [cfg.interfaceRegistry]
 * @param {object} [cfg.network]
 */
export const makeCapnp = cfg => {
  const interfaceRegistry = cfg.interfaceRegistry || makeInterfaceRegistry();
  const connection = makeConnection({
    send: cfg.send,
    bootstrap: cfg.bootstrap,
    interfaceRegistry,
    network: cfg.network,
  });
  return {
    dispatch: connection.dispatch,
    getBootstrap: connection.getBootstrap,
    abort: connection.abort,
    stats: connection.stats,
    setBootstrap: connection.setBootstrap,
    setOnAbort: connection.setOnAbort,
    registerInterface: interfaceRegistry.register,
    interfaceRegistry,
  };
};
