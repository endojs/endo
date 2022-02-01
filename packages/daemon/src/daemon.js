// @ts-check
/// <reference types="ses"/>
/* global process */

// Establish a perimeter:
import '@agoric/babel-standalone';
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/lockdown/commit.js';

import net from 'net';
import fs from 'fs';
import { Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';

import { makeCapTPWithConnection } from './connection.js';

const { quote: q } = assert;

const { promise: cancelled, reject: cancel } = makePromiseKit();

/** @param {Error} error */
const sinkError = error => {
  console.error(error);
};

/**
 * @param {import('../index.js').Locator} locator
 */
const makeEndoFacets = locator => {
  const publicFacet = Far('Endo public facet', {});

  const privateFacet = Far('Endo private facet', {
    async shutdown() {
      console.error('Endo received shutdown request');
      cancel(new Error('Shutdown'));
    },
  });

  const endoFacet = harden({
    publicFacet,
    privateFacet,
  });

  return endoFacet;
};

export const main = async () => {
  process.once('exit', () => {
    console.error('Endo exiting');
  });

  if (process.argv.length < 5) {
    throw new Error(
      `daemon.js requires arguments [sockPath] [statePath] [cachePath], got ${process.argv.join(
        ', ',
      )}`,
    );
  }

  const sockPath = process.argv[2];
  const statePath = process.argv[3];
  const cachePath = process.argv[4];

  const locator = { sockPath, statePath, cachePath };

  const endoFacets = makeEndoFacets(locator);

  await fs.promises.mkdir(statePath, { recursive: true });

  const server = net.createServer();

  server.listen(
    {
      path: sockPath,
    },
    () => {
      console.log(`Listening on ${q(sockPath)} ${new Date().toISOString()}`);
      // Inform parent that we have an open unix domain socket, if we were
      // spawned with IPC.
      if (process.send) {
        process.send({ type: 'listening', path: sockPath });
      }
    },
  );
  server.on('error', error => {
    sinkError(error);
    process.exit(-1);
  });
  server.on('connection', conn => {
    const { drained } = makeCapTPWithConnection('Endo', conn, endoFacets);
    drained.catch(sinkError);
  });

  cancelled.catch(() => {
    server.close();
  });
};

main().catch(sinkError);
