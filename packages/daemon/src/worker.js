// @ts-check
/// <reference types="ses"/>
/* global process */

// Establish a perimeter:
import '@agoric/babel-standalone';
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
    async shutdown() {
      console.error('Endo worker received shutdown request');
      cancel(new Error('Shutdown'));
    },
  });
};

export const main = async () => {
  process.once('exit', () => {
    console.error('Endo Worker exiting');
  });

  if (process.argv.length < 2) {
    throw new Error(
      `worker.js requires arguments [uuid] [workerCachePath], got ${process.argv.join(
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

  const { drained, finalize } = makeNodeNetstringCapTP(
    'Endo',
    writer,
    reader,
    workerFacet,
  );

  cancelled.catch(async () => {
    finalize();
    writer.close();
  });

  drained.catch(sinkError);
};

main().catch(sinkError);
