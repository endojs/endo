// @ts-check
/// <reference types="ses"/>
/* global process */

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/lockdown/commit.js';

import fs from 'fs';

import { Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makeNodeNetstringCapTP } from './connection.js';

/** @param {Error} error */
const sinkError = error => {
  console.error(error);
};

const { promise: cancelled, reject: cancel } = makePromiseKit();

const makeWorkerFacet = () => {
  return Far('EndoWorkerFacet', {
    async terminate() {
      console.error('Endo worker received terminate request');
      cancel(new Error('terminate'));
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

  const workerFacet = makeWorkerFacet();

  const { closed } = makeNodeNetstringCapTP(
    'Endo',
    writer,
    reader,
    cancelled,
    workerFacet,
  );

  closed.catch(sinkError);
};

main().catch(sinkError);
