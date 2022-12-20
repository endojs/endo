// @ts-check
/// <reference types="ses"/>
/* global process */

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/lockdown/commit.js';

import fs from 'fs';

import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makeNodeNetstringCapTP } from './connection.js';

/** @param {Error} error */
const sinkError = error => {
  console.error(error);
};

const { promise: cancelled, reject: cancel } = makePromiseKit();

const endowments = harden({
  assert,
  E,
  Far,
  TextEncoder,
  TextDecoder,
  URL,
});

/**
 *
 * @param {() => any} _getDaemonBootstrap
 */
const makeWorkerFacet = _getDaemonBootstrap => {
  return Far('EndoWorkerFacet', {
    terminate: async () => {
      console.error('Endo worker received terminate request');
      cancel(new Error('terminate'));
    },

    /**
     * @param {string} source
     * @param {Array<string>} names
     * @param {Array<unknown>} values
     */
    evaluate: async (source, names, values) => {
      const compartment = new Compartment(
        harden({
          ...endowments,
          ...Object.fromEntries(
            names.map((name, index) => [name, values[index]]),
          ),
        }),
      );
      return compartment.evaluate(source);
    },
  });
};

export const main = async () => {
  console.error('Endo worker started');
  process.once('exit', () => {
    console.error('Endo worker exiting');
  });

  if (process.argv.length < 4) {
    throw new Error(
      `worker.js requires arguments uuid, workerStatePath, workerEphemeralStatePath, workerCachePath, got ${process.argv.join(
        ', ',
      )}`,
    );
  }

  // const uuid = process.argv[2];
  // const workerCachePath = process.argv[3];

  // @ts-ignore This is in fact how you open a file descriptor.
  const reader = fs.createReadStream(null, { fd: 3 });
  // @ts-ignore This is in fact how you open a file descriptor.
  const writer = fs.createWriteStream(null, { fd: 3 });

  // Behold: reference cycle
  // eslint-disable-next-line no-use-before-define
  const workerFacet = makeWorkerFacet(() => getBootstrap());

  const { closed, getBootstrap } = makeNodeNetstringCapTP(
    'Endo',
    writer,
    reader,
    cancelled,
    workerFacet,
  );

  closed.catch(sinkError);
};

main().catch(sinkError);
