// @ts-check
/* global process */

// Bus worker entry point for Node.js workers under a Rust/Go supervisor.
//
// Functionally equivalent to bus-worker-node.js. This file exists as
// a distinct entry point so that ENDO_NODE_WORKER_BIN can reference
// it separately from ENDO_WORKER_BIN, allowing the daemon to dispatch
// kind='node' workers to a Node.js process while kind='locked' workers
// go to a native XS binary.
//
// Pipe layout:
//   fd 3: worker writes envelopes to supervisor (child → parent)
//   fd 4: worker reads envelopes from supervisor (parent → child)

// Establish a perimeter:
import '@endo/init';

import fs from 'fs';
import url from 'url';

import { mapWriter, mapReader } from '@endo/stream';
import { makePromiseKit } from '@endo/promise-kit';
import {
  makeMessageCapTP,
  messageToBytes,
  bytesToMessage,
} from './connection.js';
import { makeWorkerFacet } from './worker.js';
import { makePowers } from './bus-worker-node-powers.js';

/** @import { PromiseKit } from '@endo/promise-kit' */

const powers = makePowers({ fs, url });

const { promise: cancelled, reject: cancel } =
  /** @type {PromiseKit<never>} */ (makePromiseKit());

process.once('SIGINT', () => cancel(new Error('SIGINT')));

const { reader, writer } = powers.connection;

const workerFacet = makeWorkerFacet({ cancel });

const messageWriter = mapWriter(writer, messageToBytes);
const messageReader = mapReader(reader, bytesToMessage);

const { closed } = makeMessageCapTP(
  'Endo',
  messageWriter,
  messageReader,
  cancelled,
  workerFacet,
);

// @ts-ignore Yes, we can assign to exitCode, typedoc.
process.exitCode = 1;
Promise.race([cancelled, closed]).then(
  () => {
    process.exitCode = 0;
  },
  error => {
    console.error(error);
  },
);
