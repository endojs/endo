import * as childProcess from "child_process";
import * as url from "url";
import { makeDaemonicControlPowers } from "../../daemon-vendor/daemon-node-powers.js";
import { E, Far } from '@endo/captp';

const { fileURLToPath } = url;
const config = {
  workerPath: fileURLToPath(
    new URL('./inside.js', import.meta.url),
  ),
};

export const makeVat = async (vatSideKernelFacet, captpOpts, vatState) => {
  const daemonicControlPowers = makeDaemonicControlPowers(
    config,
    fileURLToPath,
    childProcess,
    captpOpts,
  );

  const workerId = 1;
  const cancelled = new Promise(() => {});

  const worker = await daemonicControlPowers.makeWorker(workerId, vatSideKernelFacet, cancelled, vatState);

  console.log('worker outside', await E(worker.workerDaemonFacet).ping())
  return worker
}
