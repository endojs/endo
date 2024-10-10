// @ts-check
/* eslint-disable no-void */

import { makeNodeReader, makeNodeWriter } from '@endo/stream-node';
import { makeDurableCaptp } from './durable-captp.js';

/**
 * @param {any} config
 * @param {import('url').fileURLToPath} fileURLToPath
 * @param {typeof import('child_process')} popen
 * @param captpOpts
 */
export const makeWorkerKit = (config, fileURLToPath, popen, captpOpts) => {
  const endoWorkerPath =
    config.workerPath ||
    fileURLToPath(new URL('worker-node.js', import.meta.url));

  /**
   * @param {string} workerId
   * @param {import('@agoric/zone').Zone} workerZone
   * @param {any} fakeVomKit
   * @param {any} workerFacet
   * @param {Promise<never>} cancelled
   * @param {any} vatState
   */
  const makeWorker = (
    workerId,
    workerZone,
    fakeVomKit,
    workerFacet,
    cancelled,
    vatState,
  ) => {
    const vatStateBlob = JSON.stringify(vatState);
    const child = popen.fork(endoWorkerPath, [vatStateBlob], {
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
    const connection = { reader, writer };

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

    const captpZone = workerZone.subZone('captp');
    const {
      captp,
      getBootstrap,
      closed: capTpClosed,
    } = makeDurableCaptp(
      `Worker ${workerId}`,
      captpZone,
      fakeVomKit,
      connection,
      cancelled,
      workerFacet,
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

    return { workerTerminated, workerDaemonFacet, captp };
  };

  return harden({
    makeWorker,
  });
};
