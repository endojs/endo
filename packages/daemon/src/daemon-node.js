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
import http from 'http';
import * as ws from 'ws';

import { makePromiseKit } from '@endo/promise-kit';
import { makeDaemon } from './daemon.js';
import { makeDiskPowers, makeNetworkPowers, makeDaemonicPowers } from './daemon-node-powers.js';

if (process.argv.length < 5) {
  throw new Error(
    `daemon.js requires arguments [sockPath] [statePath] [ephemeralStatePath] [cachePath], got ${process.argv.join(
      ', ',
    )}`,
  );
}

const [sockPath, statePath, ephemeralStatePath, cachePath] =
  process.argv.slice(2);

const defaultHttpPort = 8920; // Eight Nine Duo Oh: ENDO.

/** @type {import('../types.js').Locator} */
const locator = {
  sockPath,
  statePath,
  ephemeralStatePath,
  cachePath,
};

const { pid, env, kill } = process;

const diskPowers = makeDiskPowers({ fs, path });
const networkPowers = makeNetworkPowers({ http, ws, net });
const powers = makeDaemonicPowers({
  locator,
  crypto,
  fs,
  path,
  popen,
  url,
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
  /** @type {import('@endo/promise-kit').PromiseKit<never>} */ (
    makePromiseKit()
  );

const updateRecordedPid = async () => {
  const pidPath = diskPowers.joinPath(ephemeralStatePath, 'endo.pid');

  await diskPowers
    .readFileText(pidPath)
    .then(pidText => {
      const oldPid = Number(pidText);
      kill(oldPid);
    })
    .catch(() => {});

  await diskPowers.writeFileText(pidPath, `${pid}\n`);
};

const main = async () => {
  const daemonLabel = `daemon on PID ${pid}`
  console.log(`Endo daemon starting on PID ${pid}`);
  cancelled.catch(() => {
    console.log(`Endo daemon stopping on PID ${pid}`);
  });
  const requestedWebletPortText = env.ENDO_HTTP_PORT;
  const requestedWebletPort = requestedWebletPortText
    ? Number(requestedWebletPortText)
    : defaultHttpPort;
  
  await daemonicPersistencePowers.initializePersistence();

  const { endoBootstrap, cancelGracePeriod, assignWebletPort } = await makeDaemon(powers, daemonLabel, cancel, cancelled);

  /** @param {Error} error */
  const exitWithError = error => {
    cancel(error);
    cancelGracePeriod(error);
  };

  // Start network services
  const privatePathService = networkPowers.makePrivatePathService(endoBootstrap, sockPath, cancelled, exitWithError)
  const privateHttpService = networkPowers.makePrivateHttpService(endoBootstrap, requestedWebletPort, assignWebletPort, cancelled, exitWithError)
  const services = [privatePathService, privateHttpService];
  await Promise.all(services.map(({ started }) => started)).then(() => {
    informParentWhenReady();
  },
  error => {
    reportErrorToParent(error.message);
    throw error;
  })
  const servicesStopped = Promise.all(services.map(({ stopped }) => stopped));

  // Record self as official daemon process
  await updateRecordedPid();

  // Wait for services to end normally
  await servicesStopped;
  cancel(new Error('Terminated normally'));
  cancelGracePeriod(new Error('Terminated normally'));
}

process.once('SIGINT', () => cancel(new Error('SIGINT')));

process.exitCode = 1;
main().then(
  () => {
    process.exitCode = 0;
  },
  error => {
    console.error(error);
  },
);
