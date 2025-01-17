// @ts-check
/* global process */

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
  throw Error(
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

  const { endoBootstrap, cancelGracePeriod } = await makeDaemon(
    powers,
    daemonLabel,
    cancel,
    cancelled,
    {
      /** @param {Builtins} builtins */
      APPS: ({ MAIN, NONE }) => ({
        type: /** @type {const} */ ('make-unconfined'),
        worker: MAIN,
        powers: NONE,
        specifier: new URL('web-server-node.js', import.meta.url).href,
      }),
    },
  );

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
  );
  const services = [privatePathService];
  await Promise.all(services.map(({ started }) => started)).then(
    () => {
      informParentWhenReady();
    },
    error => {
      reportErrorToParent(error.message);
      throw error;
    },
  );
  const servicesStopped = Promise.all(services.map(({ stopped }) => stopped));

  // Record self as official daemon process
  await updateRecordedPid();

  // Wait for services to end normally
  await servicesStopped;
  cancel(Error('Terminated normally'));
  cancelGracePeriod(Error('Terminated normally'));
};

process.once('SIGINT', () => cancel(Error('SIGINT')));

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
