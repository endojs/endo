// @ts-check
/* global process */

import '@endo/init';

import * as fs from 'fs';
import * as url from 'url';

import { makePromiseKit } from '@endo/promise-kit';
import { makePowers } from '../../daemon-vendor/worker-node-powers.js';
import { startVatSupervisorProcess } from '../../worker.js';

/** @import { PromiseKit } from '@endo/promise-kit' */

const [,, ...args] = process.argv;
const [vatStateBlob] = args;
const vatState = JSON.parse(vatStateBlob);

const powers = makePowers({ fs, url });

const { promise: cancelled, reject: cancel } =
  /** @type {PromiseKit<never>} */ (makePromiseKit());

process.once('SIGINT', () => cancel(new Error('SIGINT')));

// @ts-ignore Yes, we can assign to exitCode, typedoc.
process.exitCode = 1;
startVatSupervisorProcess('worker', vatState, powers, process.pid, cancel, cancelled).then(
  () => {
    process.exitCode = 0;
  },
  error => {
    console.error(error);
  },
);
