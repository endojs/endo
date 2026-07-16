// @ts-check
/// <reference types="ses" />
import harden from '@endo/harden';
import { makeCapTP } from '@endo/captp';
import { E, Far } from '@endo/far';

/**
 * The guest-facing shell of a siesta worker: one persistent Compartment
 * and a CapTP endpoint whose bootstrap facet evaluates guest code in it.
 *
 * The shell must behave deterministically: given the same sequence of
 * inbound messages it must produce the same state and the same outbound
 * messages, so that an incarnation restored by journal replay is
 * indistinguishable from one restored from a heap snapshot. For the same
 * reason its endowments are limited to pure capabilities.
 *
 * The same shell is intended to run inside an XS machine under a
 * snapshotting supervisor, where the whole shell (CapTP tables included)
 * is captured by the engine snapshot.
 *
 * @param {object} options
 * @param {(message: Record<string, unknown>) => void} options.send
 *   delivers an outbound CapTP message toward the host
 * @param {string} [options.name] debug label for the CapTP endpoint
 */
export const makeWorkerShell = ({ send, name = 'siesta-worker' }) => {
  const compartment = new Compartment(
    harden({
      E,
      Far,
      harden,
    }),
  );

  const facet = Far('SiestaWorker', {
    help: () =>
      'SiestaWorker: evaluate(source) evaluates a hardened JavaScript expression in this worker persistent compartment and returns its value.',
    /** @param {string} source */
    evaluate: async source => compartment.evaluate(source),
  });

  const { dispatch } = makeCapTP(name, send, facet);

  return harden({
    /** @param {Record<string, unknown>} message */
    dispatch,
  });
};
harden(makeWorkerShell);
