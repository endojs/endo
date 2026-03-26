// @ts-check
/* global process */

// Establish a perimeter:
import '@endo/init';

import fs from 'fs';
import url from 'url';

import { makePromiseKit } from '@endo/promise-kit';
import { main } from './worker.js';
import { makePowers } from './worker-go-powers.js';

/** @import { PromiseKit } from '@endo/promise-kit' */

// Worker entry point for workers spawned by the engo supervisor.
//
// Pipe layout (Go subprocess convention):
//   fd 3: worker writes envelopes to engo (child → parent)
//   fd 4: worker reads envelopes from engo (parent → child)
//
// The worker reads an init envelope from fd 4 to learn its handle,
// then establishes CapTP over envelope-framed messages.

const powers = makePowers({ fs, url });

const { promise: cancelled, reject: cancel } =
  /** @type {PromiseKit<never>} */ (makePromiseKit());

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
