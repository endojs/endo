// @ts-check
/**
 * Top-level public factory.
 *
 * Wraps a single connection and exposes a high-level API: registerInterface,
 * getBootstrap, abort, stats. For multi-peer setups (e.g. with Level 3
 * three-party handoff), instantiate one makeCapnp per peer and share a
 * single InterfaceRegistry + a single CapHomeRegistry across them via the
 * `network` argument.
 */

import { makeConnection } from './connection.js';
import { makeInterfaceRegistry } from './interfaces.js';
import { makeCapHomeRegistry } from './cap-home-registry.js';

/**
 * @param {object} cfg
 * @param {(framed: ArrayBuffer) => void} cfg.send
 * @param {unknown} [cfg.bootstrap]
 * @param {ReturnType<typeof makeInterfaceRegistry>} [cfg.interfaceRegistry]
 * @param {object} [cfg.network]
 * @param {Uint8Array} [cfg.recipientVatId]
 *   Vat-id bytes naming the peer this connection speaks to. Required by
 *   the L3 auto-Provide path (used as `Provide.recipient`); single-peer
 *   setups can leave it unset.
 * @param {ReturnType<typeof makeCapHomeRegistry>} [cfg.capHomes]
 *   Network-wide registry mapping each imported Presence to the peer
 *   connection that hosts it. Auto-created if not supplied; for
 *   multi-peer setups (anywhere L3 handoff matters) pass the *same*
 *   registry to every makeCapnp instance in the same vat so one
 *   instance's import is visible to another instance's encoder. The
 *   solo-instance default is a fresh registry per call — cap-home
 *   lookups will never hit (no other peer registered any imports), so
 *   the encoder transparently falls through to senderHosted, matching
 *   original Cap'n Proto's behaviour when the network does not support
 *   third-party handoff.
 */
export const makeCapnp = cfg => {
  const interfaceRegistry = cfg.interfaceRegistry || makeInterfaceRegistry();
  const capHomes = cfg.capHomes || makeCapHomeRegistry();
  // Holder for the public makeCapnp instance. Filled in below once we
  // know what to put in it; the connection's import-side onImport hook
  // dereferences it lazily when registering presences with the network's
  // CapHomeRegistry. Without the holder there's a chicken-and-egg
  // between makeConnection (needs `self` to register imports) and the
  // wrapper object (built from the connection's exports).
  /** @type {{ value: any }} */
  const selfRef = { value: undefined };
  const connection = makeConnection({
    send: cfg.send,
    bootstrap: cfg.bootstrap,
    interfaceRegistry,
    network: cfg.network,
    recipientVatId: cfg.recipientVatId,
    capHomes,
    selfRef,
  });
  const self = {
    dispatch: connection.dispatch,
    getBootstrap: connection.getBootstrap,
    abort: connection.abort,
    stats: connection.stats,
    sendAccept: connection.sendAccept,
    sendRelease: connection.sendRelease,
    setBootstrap: connection.setBootstrap,
    setOnAbort: connection.setOnAbort,
    registerInterface: interfaceRegistry.register,
    interfaceRegistry,
    /**
     * The CapHome registry this connection writes to on import and
     * reads from on export. Same instance as the one passed in via
     * `cfg.capHomes`, or the auto-created one if `cfg.capHomes` was
     * omitted. Exposed so multi-peer test fixtures can verify
     * registrations.
     */
    capHomes,
    // sendFramed is exposed (forwarded from the connection) so another
    // peer's L3 auto-Provide can deliver a Provide message to us without
    // bypassing the abort check.
    sendFramed: connection.sendFramed,
  };
  selfRef.value = self;
  return self;
};
