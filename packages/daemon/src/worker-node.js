// @ts-check
/* global process */

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/promise-kit/shim.js';
import '@endo/lockdown/commit.js';

import fs from 'fs';
import url from 'url';

import { makePromiseKit } from '@endo/promise-kit';
import { main } from './worker.js';
import { makePowers } from './worker-node-powers.js';

const powers = makePowers({ fs, url });

const { promise: cancelled, reject: cancel } =
  /** @type {import('@endo/promise-kit').PromiseKit<never>} */ (
    makePromiseKit()
  );

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
