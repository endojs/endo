// @ts-check
/// <reference types="ses"/>
/* global process, setTimeout */

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/promise-kit/shim.js';
import '@endo/lockdown/commit.js';

import crypto from 'crypto';
import net from 'net';
import fs from 'fs';
import path from 'path';
import popen from 'child_process';
import url from 'url';

import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makeNodeNetstringCapTP } from './connection.js';

const { quote: q } = assert;

const { promise: cancelled, reject: cancel } = makePromiseKit();

// TODO thread through command arguments.
const gracePeriodMs = 100;

const grace = cancelled.catch(async () => {
  await new Promise(resolve => setTimeout(resolve, gracePeriodMs));
});

const endoWorkerPath = url.fileURLToPath(new URL('worker.js', import.meta.url));

/** @param {Error} error */
const sinkError = error => {
  console.error(error);
};

/**
 * @param {import('../types.js').Locator} locator
 */
const makeWorker = async locator => {
  // @ts-ignore Node.js crypto does in fact have randomUUID.
  const uuid = await crypto.randomUUID();
  const workerCachePath = path.join(locator.cachePath, uuid);
  await fs.promises.mkdir(workerCachePath, { recursive: true });
  const logPath = path.join(workerCachePath, 'worker.log');
  const output = fs.openSync(logPath, 'w');
  const child = popen.fork(endoWorkerPath, [uuid, workerCachePath], {
    stdio: ['ignore', output, output, 'pipe', 'ipc'],
  });
  console.error(`Endo worker started PID ${child.pid} UUID ${uuid}`);
  const stream = /** @type {import('stream').Duplex} */ (child.stdio[3]);
  assert(stream);
  const { getBootstrap, closed } = makeNodeNetstringCapTP(
    `Worker ${uuid}`,
    stream,
    stream,
    cancelled,
    undefined,
  );

  const bootstrap = getBootstrap();

  const exited = new Promise(resolve => {
    child.on('exit', () => {
      console.error(`Endo worker stopped PID ${child.pid} UUID ${uuid}`);
      resolve(undefined);
    });
  });

  const terminated = Promise.all([exited, closed]);

  const { reject: cancelWorker, promise: workerCancelled } = makePromiseKit();

  cancelled.catch(async error => cancelWorker(error));

  workerCancelled.then(async () => {
    const responded = E(bootstrap).terminate();
    await Promise.race([grace, terminated, responded]);
    child.kill();
  });

  const terminate = () => {
    cancelWorker(Error('Terminated'));
  };

  return harden({
    actions: Far('EndoWorkerActions', {
      terminate,
    }),
    terminated,
  });
};

/**
 * @param {import('../types.js').Locator} locator
 */
const makeEndoBootstrap = locator =>
  Far('EndoPublicFacet', {
    async ping() {
      return 'pong';
    },
    async terminate() {
      console.error('Endo daemon received terminate request');
      cancel(Error('Terminate'));
    },
    async makeWorker() {
      return makeWorker(locator);
    },
  });

export const main = async () => {
  console.error(`Endo daemon starting on PID ${process.pid}`);
  process.once('exit', () => {
    console.error(`Endo daemon stopping on PID ${process.pid}`);
  });

  if (process.argv.length < 5) {
    throw Error(
      `daemon.js requires arguments [sockPath] [statePath] [cachePath], got ${process.argv.join(
        ', ',
      )}`,
    );
  }

  const sockPath = process.argv[2];
  const statePath = process.argv[3];
  const cachePath = process.argv[4];

  const locator = { sockPath, statePath, cachePath };

  const endoBootstrap = makeEndoBootstrap(locator);

  const statePathP = fs.promises.mkdir(statePath, { recursive: true });
  const cachePathP = fs.promises.mkdir(cachePath, { recursive: true });
  await Promise.all([statePathP, cachePathP]);

  const pidPath = path.join(cachePath, 'endo.pid');
  await fs.promises.writeFile(pidPath, `${process.pid}\n`);

  const server = net.createServer();

  server.listen(
    {
      path: sockPath,
    },
    () => {
      console.log(
        `Endo daemon listening on ${q(sockPath)} ${new Date().toISOString()}`,
      );
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
    console.error(
      `Endo daemon received connection ${new Date().toISOString()}`,
    );
    const { closed } = makeNodeNetstringCapTP(
      'Endo',
      conn,
      conn,
      cancelled,
      endoBootstrap,
    );
    closed.catch(sinkError);
  });

  cancelled.catch(() => {
    server.close();
  });
};

main().catch(sinkError);
