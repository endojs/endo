// @ts-check
/* eslint-disable no-void */

import { makeNodeReader, makeNodeWriter } from '@endo/stream-node';
import { makeNetstringCapTP } from './connection.js';

/* @import { Config, CryptoPowers, DaemonWorkerFacet, DaemonicPersistencePowers, DaemonicPowers, EndoReadable, FilePowers, Formula, NetworkPowers, SocketPowers, WorkerDaemonFacet } from './types.js' */

/**
 * @param {any} config
 * @param {import('url').fileURLToPath} fileURLToPath
 * @param {typeof import('child_process')} popen
 * @param captpOpts
 */
export const makeDaemonicControlPowers = (
  config,
  fileURLToPath,
  popen,
  captpOpts,
) => {
  const endoWorkerPath = config.workerPath || fileURLToPath(
    new URL('worker-node.js', import.meta.url),
  );

  /*
   * @param {string} workerId
   * @param {DaemonWorkerFacet} daemonWorkerFacet
   * @param {Promise<never>} cancelled
   */
  const makeWorker = async (workerId, daemonWorkerFacet, cancelled, vatState) => {

    // const workerStatePath = filePowers.joinPath(statePath, 'worker', workerId);
    // const workerEphemeralStatePath = filePowers.joinPath(
    //   ephemeralStatePath,
    //   'worker',
    //   workerId,
    // );

    // await Promise.all([
    //   filePowers.makePath(workerStatePath),
    //   filePowers.makePath(workerEphemeralStatePath),
    // ]);

    // const logPath = filePowers.joinPath(workerStatePath, 'worker.log');
    // const pidPath = filePowers.joinPath(workerEphemeralStatePath, 'worker.pid');

    // const log = fs.openSync(logPath, 'a');
    const vatStateBlob = JSON.stringify(vatState);
    const child = popen.fork(endoWorkerPath, [vatStateBlob], {
      // stdio: ['ignore', log, log, 'pipe', 'pipe', 'ipc'],
      stdio: ['ignore', 'inherit', 'inherit', 'pipe', 'pipe', 'ipc'],
      // stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', 'ipc'],
      // @ts-ignore Stale Node.js type definition.
      windowsHide: true,
    });
    const workerPid = child.pid;
    const nodeWriter = /** @type {import('stream').Writable} */ (
      child.stdio[3]
    );
    const nodeReader = /** @type {import('stream').Readable} */ (
      child.stdio[4]
    );
    assert(nodeWriter);
    assert(nodeReader);
    const reader = makeNodeReader(nodeReader);
    const writer = makeNodeWriter(nodeWriter);

    const workerClosed = new Promise(resolve => {
      child.on('exit', () => {
        console.log(
          `Endo worker exited for PID ${workerPid} with unique identifier ${workerId}`,
        );
        resolve(undefined);
      });
    });

    // await filePowers.writeFileText(pidPath, `${child.pid}\n`);

    cancelled.catch(async () => {
      console.log(
        `Endo worker cancelling for PID ${workerPid} with unique identifier ${workerId}`,
      );
      child.kill();
    });

    console.log(
      `Endo worker started PID ${workerPid} unique identifier ${workerId}`,
    );

    const { getBootstrap, closed: capTpClosed } = makeNetstringCapTP(
      `Worker ${workerId}`,
      writer,
      reader,
      cancelled,
      daemonWorkerFacet,
      captpOpts,
    );

    capTpClosed.finally(() => {
      console.log(
        `Endo worker connection closed for PID ${workerPid} with unique identifier ${workerId}`,
      );
    });

    const workerTerminated = Promise.race([workerClosed, capTpClosed]);

    /* @type {ERef<WorkerDaemonFacet>} */
    const workerDaemonFacet = getBootstrap();

    return { workerTerminated, workerDaemonFacet };
  };

  return harden({
    makeWorker,
  });
};

/*
 * @param {object} opts
 * @param {Config} opts.config
 * @param {typeof import('fs')} opts.fs
 * @param {typeof import('child_process')} opts.popen
 * @param {typeof import('url')} opts.url
 * @param {FilePowers} opts.filePowers
 * @param {CryptoPowers} opts.cryptoPowers
 * @returns {DaemonicPowers}
 */
export const makeDaemonicPowers = ({
  config,
  popen,
  url,
  cryptoPowers,
  captpOpts,
}) => {
  const { fileURLToPath } = url;

  const daemonicControlPowers = makeDaemonicControlPowers(
    config,
    fileURLToPath,
    popen,
    captpOpts,
  );

  return harden({
    crypto: cryptoPowers,
    control: daemonicControlPowers,
  });
};
