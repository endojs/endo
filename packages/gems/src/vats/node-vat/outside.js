import * as childProcess from 'child_process';
import * as url from 'url';
import { makeDaemonicControlPowers } from '../../daemon-vendor/daemon-node-powers.js';

const never = new Promise(() => {});

const { fileURLToPath } = url;
const config = {
  workerPath: fileURLToPath(
    new URL('./inside.js', import.meta.url),
  ),
};

export const makeVat = async (vatSideKernelFacet, captpOpts, vatState, cancelled = never) => {
  const daemonicControlPowers = makeDaemonicControlPowers(
    config,
    fileURLToPath,
    childProcess,
    captpOpts,
  );

  const workerId = 1;
  const { workerTerminated, workerDaemonFacet: workerFacet } = await daemonicControlPowers.makeWorker(workerId, vatSideKernelFacet, cancelled, vatState);
  return { workerTerminated, workerFacet };
}
