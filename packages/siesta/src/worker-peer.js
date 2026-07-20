// @ts-check
/// <reference types="ses" />
import harden from '@endo/harden';
import { Fail, q } from '@endo/errors';
import { E, Far } from '@endo/far';
import { makeOcapn } from '@endo/ocapn';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makePipeNetwork } from './pipe-network.js';

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * The OCapN-native siesta worker shell (protocol unification, worker
 * side): one persistent Compartment behind a full OCapN peer speaking
 * the p2p wire protocol over the host pipe, in place of the endo-captp
 * shell. The evaluate facet is published in the worker's own locator
 * under the well-known swissnum `shell`; the host fetches it through
 * the session bootstrap.
 *
 * Determinism contract is unchanged from the captp shell: same inbound
 * frames, same state and outbound frames, so a snapshot-restored
 * incarnation is indistinguishable. Endowments are pure capabilities.
 *
 * @param {object} options
 * @param {string} options.workerId
 * @param {(bytes: Uint8Array) => void} options.send outbound OCapN
 *   frames toward the host
 * @param {string} [options.debugLabel]
 */
export const makeWorkerPeer = async ({
  workerId,
  send,
  debugLabel = 'siesta-worker-peer',
}) => {
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
      const makeResult = compartment.evaluate(
        `(${names.join(', ')}) => (\n${source}\n)`,
      );
      return makeResult(...values);
    },
  });

  const locator = new Map([['shell', facet]]);

  const pipe = makePipeNetwork({
    codec: syrupCodec,
    workerId,
    role: 'worker',
    send,
  });

  const client = await makeOcapn({
    codec: syrupCodec,
    network: pipe.network,
    locator,
    debugLabel,
  });

  // Establish the (fabricated, handshake-free) session toward the host
  // eagerly so the reader pump is running before the first inbound
  // frame arrives.
  await client.provideSession(pipe.peerLocation);

  return harden({
    /** @param {Uint8Array} bytes one inbound OCapN frame from the host */
    deliver: pipe.deliver,
    shutdown: () => {
      client.shutdown();
      pipe.close();
    },
  });
};
harden(makeWorkerPeer);
