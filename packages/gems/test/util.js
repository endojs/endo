import { makeKernel } from '../src/kernel.js';

export const makeKernelFactory = () => {
  let kernel;
  let kernelVatState = [];

  const stop = async () => {
    await null;
    if (kernel) {
      await kernel.shutdown();
      kernelVatState = kernel.vatSupervisor.serializeState();
      kernel = null;
    }
  };

  const restart = async () => {
    await stop();
    kernel = await makeKernel(kernelVatState);
    return { kernel };
  };

  const clear = async () => {
    await stop();
    kernelVatState = [];
  };

  return {
    stop,
    restart,
    clear,
  };
};
