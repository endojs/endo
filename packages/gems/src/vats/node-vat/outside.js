import * as childProcess from 'child_process';
import * as url from 'url';
import { makeWorkerKit } from '../../worker-outside.js';

/** @type Promise<never> */
const never = new Promise(() => {});

const { fileURLToPath } = url;
const config = {
  workerPath: fileURLToPath(new URL('./inside.js', import.meta.url)),
};

export const makeVat = (
  zone,
  fakeVomKit,
  vatSideKernelFacet,
  vatState,
  captpOpts,
  cancelled = never,
) => {
  const workerKit = makeWorkerKit(
    config,
    fileURLToPath,
    childProcess,
    captpOpts,
  );

  const workerId = `1`;
  const workerZone = zone.subZone(`worker-${workerId}`);
  const { workerTerminated, workerDaemonFacet: workerFacet } =
    workerKit.makeWorker(
      workerId,
      workerZone,
      fakeVomKit,
      vatSideKernelFacet,
      cancelled,
      vatState,
    );
  return { workerTerminated, workerFacet };
};
