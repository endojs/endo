// @ts-check
/* global process */

// Establish a perimeter:
import '@endo/init';

import fs from 'fs';
import url from 'url';

import { makeCancelKit } from '@endo/cancel';
import { main } from './worker.js';
import { makePowers } from './worker-node-powers.js';

const powers = makePowers({ fs, url });

const { cancelled, cancel } = makeCancelKit();

process.once('SIGINT', () => cancel(new Error('SIGINT')));

// @ts-ignore Yes, we can assign to exitCode, typedoc.
process.exitCode = 1;
main(powers, process.pid, cancel, cancelled).then(
  () => {
    process.exitCode = 0;
  },
  error => {
    console.error(error);
  },
);
