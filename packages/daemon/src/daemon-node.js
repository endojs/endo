// @ts-check
/* eslint-disable no-await-in-loop */
/* global process */

// Establish a perimeter:
// eslint-disable-next-line import/order
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
import { startWsGateway } from './ws-gateway.js';

/** @import { PromiseKit } from '@endo/promise-kit' */
/** @import { Config } from './types.js' */

const args = process.argv.slice(2);
if (args.length < 4) {
  throw new Error(
    `daemon.js requires arguments [sockPath] [statePath] [ephemeralStatePath] [cachePath], got ${process.argv.join(
      ', ',
    )}`,
  );
}

const [sockPath, statePath, ephemeralStatePath, cachePath] = args;

const gcEnabled = process.env.ENDO_GC === '1';

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

/**
 * @param {string} [gatewayAddress]
 */
const informParentWhenReady = gatewayAddress => {
  if (process.send) {
    process.send({ type: 'ready', gatewayAddress });
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

const killStaleWorkers = async () => {
  const workerDir = filePowers.joinPath(ephemeralStatePath, 'worker');
  /** @type {string[]} */
  let workerIds;
  try {
    workerIds = await filePowers.readDirectory(workerDir);
  } catch {
    return;
  }
  await Promise.all(
    workerIds.map(async workerId => {
      const pidPath = filePowers.joinPath(workerDir, workerId, 'worker.pid');
      try {
        const pidText = await filePowers.readFileText(pidPath);
        const workerPid = Number(pidText);
        if (Number.isFinite(workerPid) && workerPid > 0) {
          try {
            kill(workerPid, 'SIGKILL');
          } catch {
            /* already gone */
          }
        }
        await fs.promises.rm(pidPath, { force: true });
      } catch {
        /* no pid file */
      }
    }),
  );
};

const main = async () => {
  const daemonLabel = `daemon on PID ${pid}`;
  console.log(`Endo daemon starting on PID ${pid}`);
  cancelled.catch(err => {
    console.log(`Endo daemon stopping on PID ${pid} (caught: ${err})`);
  });

  await daemonicPersistencePowers.initializePersistence();
  await killStaleWorkers();

  const { endoBootstrap, cancelGracePeriod, capTpConnectionRegistrar } =
    await makeDaemon(powers, daemonLabel, cancel, cancelled, {}, { gcEnabled });

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
  // Start WebSocket gateway for browser clients (Chat app).
  const addrUrl = new URL(
    `http://${process.env.ENDO_ADDR || '127.0.0.1:8920'}`,
  );
  const gatewayHost = addrUrl.hostname;
  const gatewayPort = addrUrl.port !== '' ? Number(addrUrl.port) : 8920;
  const wsGateway = startWsGateway({
    endoBootstrap,
    host: gatewayHost,
    port: gatewayPort,
    cancelled,
  });

  const services = [privatePathService, wsGateway];

  // INVARIANT: The ready signal must not be sent until all services are fully
  // operational — including the CapTP socket, the host, and the APPS gateway.
  // Callers of start() depend on this: a resolved start() means the daemon is
  // completely ready to serve. If any service fails to start, the error must
  // propagate to the parent via reportErrorToParent so start() rejects.
  try {
    const serviceResults = await Promise.all(
      services.map(({ started }) => started),
    );

    // wsGateway.started resolves to the bound address (e.g. "http://127.0.0.1:8920").
    // It is the second service in the array.
    const gatewayAddress = /** @type {string} */ (serviceResults[1]);

    // Persist gateway address so Familiar (and other tools) can discover it.
    const gatewayPath = filePowers.joinPath(statePath, 'gateway');
    await filePowers.writeFileText(gatewayPath, `${gatewayAddress}\n`);

    const host = await E(endoBootstrap).host();
    const agentId = /** @type {string} */ (await E(host).identify('@agent'));
    const agentIdPath = filePowers.joinPath(statePath, 'root');
    await filePowers.writeFileText(agentIdPath, `${agentId}\n`);

    informParentWhenReady(gatewayAddress);

    // Run ENDO_EXTRA bootstrap scripts (e.g., lal/fae setup for dev mode).
    const extraSpecifiers = (process.env.ENDO_EXTRA || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    for (const specifier of extraSpecifiers) {
      try {
        console.log(`Endo extra: running ${specifier}`);
        const namespace = await import(specifier);
        await namespace.main(host);
        console.log(`Endo extra: ${specifier} done`);
      } catch (error) {
        console.error(`Endo extra: ${specifier} failed:`, error);
      }
    }
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
process.once('SIGTERM', () => cancel(new Error('SIGTERM')));

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
