// @ts-check
/// <reference types="ses" />
import harden from '@endo/harden';
import { makeCapTP } from '@endo/captp';
import { Fail, q } from '@endo/errors';
import { E, Far } from '@endo/far';

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

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
  // Assign endowments onto the compartment's global rather than passing
  // them to the constructor: the SES-shim Compartment takes endowments
  // as its first argument, XS's native Compartment takes an options bag,
  // and global assignment works identically on both.
  const compartment = new Compartment();
  Object.assign(compartment.globalThis, {
    E,
    Far,
    harden,
  });

  const facet = Far('SiestaWorker', {
    help: () =>
      'SiestaWorker: evaluate(source, names, values) evaluates a hardened JavaScript expression in this worker persistent compartment, with the optional endowments bound as named values, and returns its value.',
    /**
     * @param {string} source
     * @param {Array<string>} [names]
     * @param {Array<unknown>} [values]
     */
    evaluate: async (source, names = [], values = []) => {
      (Array.isArray(names) &&
        Array.isArray(values) &&
        names.length === values.length) ||
        Fail`evaluate names and values must be equal-length arrays`;
      if (names.length === 0) {
        return compartment.evaluate(source);
      }
      for (const endowmentName of names) {
        (typeof endowmentName === 'string' &&
          IDENTIFIER_PATTERN.test(endowmentName)) ||
          Fail`evaluate endowment name must be an identifier, got ${q(
            endowmentName,
          )}`;
      }
      // Bind endowments as parameters scoped to this evaluation, so
      // they never leak into the compartment's shared global.
      const makeResult = compartment.evaluate(
        `(${names.join(', ')}) => (\n${source}\n)`,
      );
      return makeResult(...values);
    },
  });

  const { dispatch } = makeCapTP(name, send, facet);

  return harden({
    /** @param {Record<string, unknown>} message */
    dispatch,
  });
};
harden(makeWorkerShell);
