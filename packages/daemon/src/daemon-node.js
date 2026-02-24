// @ts-check
/* global process */

// Establish a perimeter:
import '@endo/init';

import crypto from 'crypto';
import net from 'net';
import fs from 'fs';
import path from 'path';
import popen from 'child_process';
import url from 'url';

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makeDaemon } from './daemon.js';
import {
  makeFilePowers,
  makeNetworkPowers,
  makeDaemonicPowers,
  makeCryptoPowers,
} from './daemon-node-powers.js';

/** @import { PromiseKit } from '@endo/promise-kit' */
/** @import { Config, Builtins } from './types.js' */

if (process.argv.length < 5) {
  throw new Error(
    `daemon.js requires arguments [sockPath] [statePath] [ephemeralStatePath] [cachePath], got ${process.argv.join(
      ', ',
    )}`,
  );
}

const [sockPath, statePath, ephemeralStatePath, cachePath] =
  process.argv.slice(2);

/** @type {Config} */
const config = {
  sockPath,
  statePath,
  ephemeralStatePath,
  cachePath,
};

const { pid, kill } = process;

const networkPowers = makeNetworkPowers({ net });
const filePowers = makeFilePowers({ fs, path });
const cryptoPowers = makeCryptoPowers(crypto);
const powers = makeDaemonicPowers({
  config,
  fs,
  popen,
  url,
  filePowers,
  cryptoPowers,
});
const { persistence: daemonicPersistencePowers } = powers;

const informParentWhenReady = () => {
  if (process.send) {
    process.send({ type: 'ready' });
  }
};

const reportErrorToParent = message => {
  if (process.send) {
    process.send({ type: 'error', message });
  }
};

const { promise: cancelled, reject: cancel } =
  /** @type {PromiseKit<never>} */ (makePromiseKit());

const updateRecordedPid = async () => {
  const pidPath = filePowers.joinPath(ephemeralStatePath, 'endo.pid');

  await filePowers
    .readFileText(pidPath)
    .then(pidText => {
      const oldPid = Number(pidText);
      kill(oldPid);
    })
    .catch(() => {});

  await filePowers.writeFileText(pidPath, `${pid}\n`);
};

const main = async () => {
  const daemonLabel = `daemon on PID ${pid}`;
  console.log(`Endo daemon starting on PID ${pid}`);
  cancelled.catch(() => {
    console.log(`Endo daemon stopping on PID ${pid}`);
  });

  await daemonicPersistencePowers.initializePersistence();

  const { endoBootstrap, cancelGracePeriod, capTpConnectionRegistrar } =
    await makeDaemon(powers, daemonLabel, cancel, cancelled, {
      /** @param {Builtins} builtins */
      APPS: ({ MAIN, ENDO }) => ({
        type: /** @type {const} */ ('make-unconfined'),
        worker: MAIN,
        powers: ENDO,
        specifier:
          process.env.ENDO_WORKER_PATH ||
          new URL('web-server-node.js', import.meta.url).href,
        env: {
          ENDO_ADDR: process.env.ENDO_ADDR || '127.0.0.1:8920',
          ENDO_WEB_PAGE_BUNDLE_PATH:
            process.env.ENDO_WEB_PAGE_BUNDLE_PATH || '',
        },
      }),
    });

  /** @param {Error} error */
  const exitWithError = error => {
    cancel(error);
    cancelGracePeriod(error);
  };

  // Start network services
  const privatePathService = networkPowers.makePrivatePathService(
    endoBootstrap,
    sockPath,
    cancelled,
    exitWithError,
    capTpConnectionRegistrar,
  );
  const services = [privatePathService];

  // Start all services, persist the root formula identifier, and start the gateway.
  // Block the ready signal until everything is available.
  try {
    await Promise.all(services.map(({ started }) => started));

    const host = await E(endoBootstrap).host();
    const agentId = /** @type {string} */ (await E(host).identify('AGENT'));
    const agentIdPath = filePowers.joinPath(statePath, 'root');
    await filePowers.writeFileText(agentIdPath, `${agentId}\n`);

    if (await E(host).has('APPS')) {
      const apps = await E(host).lookup('APPS');
      const address = await E(apps).getAddress();
      console.log(`Endo gateway listening on ${address}`);
    }

    informParentWhenReady();
  } catch (error) {
    reportErrorToParent(/** @type {Error} */ (error).message);
    throw error;
  }

  const servicesStopped = Promise.all(services.map(({ stopped }) => stopped));

  // Record self as official daemon process
  await updateRecordedPid();

  // Wait for services to end normally
  await servicesStopped;
  cancel(new Error('Terminated normally'));
  cancelGracePeriod(new Error('Terminated normally'));
};

process.once('SIGINT', () => cancel(new Error('SIGINT')));

// @ts-ignore Yes, we can assign to exitCode, typedoc.
process.exitCode = 1;
main().then(
  () => {
    process.exitCode = 0;
  },
  error => {
    console.error(error);
  },
);
