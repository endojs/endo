import { existsSync, readFileSync, writeFileSync } from 'fs';
import '@endo/init'
import { E, Far } from '@endo/captp';
import { makeVat } from './vats/node-vat/outside.js';
import { makeVatSupervisor } from './vat-supervisor.js';

const initKernel = (kernelVatSupervisor) => {
  console.log('initKernel')
  // always define class
  const makeKernelFacet = kernelVatSupervisor.zone.exoClass('VatSideKernelFacet', undefined, () => harden({}), {
    ping() {
      return 'pong';
    },
    getExtRefController() {
      return kernelVatSupervisor.extRefController;
    }
  });

  // make only on first start
  if (!kernelVatSupervisor.store.has('kernel')) {
    const vatSideKernelFacet = makeKernelFacet();
    kernelVatSupervisor.store.init('kernel', vatSideKernelFacet);
    kernelVatSupervisor.store.init('vat-state', harden([]));
  }

}

const initDemo = async (kernelVatSupervisor, vat) => {
  console.log('initDemo')
  // code to run in vat
  // register a class and create an instance of it
  const source = `${(powers)=>{
    const name = 'DemoFoo';
    const makeFoo = powers.registerClass(name, `${() => {
      const interfaceGuards = undefined;
      const initFn = () => harden({});
      const methods = {
        ping() {
          return 'pong';
        }
      };
      return { interfaceGuards, initFn, methods };
    }}`);
    return makeFoo();
  }}`
  const demoResult = await E(vat.workerDaemonFacet).incubateGem(source);
  kernelVatSupervisor.store.init('demoResult', demoResult);
}

const getKernelVatState = () => {
  if (!existsSync('kernel-vat-state.json')) {
    return [];
  }
  const kernelVatStateBlob = readFileSync('kernel-vat-state.json', 'utf8');
  return JSON.parse(kernelVatStateBlob);
};

const writeKernelVatState = (kernelVatState) => {
  const kernelVatStateBlob = JSON.stringify(kernelVatState, null, 2);
  writeFileSync('kernel-vat-state.json', kernelVatStateBlob, 'utf8');
};

const start = async () => {
  const kernelVatState = getKernelVatState();
  const kernelVatSupervisor = makeVatSupervisor('kernel', kernelVatState, getRemoteExtRefController);
  initKernel(kernelVatSupervisor);
  const vatSideKernelFacet = kernelVatSupervisor.store.get('kernel');

  const vatState = kernelVatSupervisor.store.get('vat-state');
  const vatP = makeVat(vatSideKernelFacet, kernelVatSupervisor.captpOpts, vatState);
  async function getRemoteExtRefController() {
    const vat = await vatP;
    return E(vat.workerDaemonFacet).getExtRefController()
  }

  const vat = await vatP;

  // initialize only on first start
  if (!kernelVatSupervisor.store.has('demoResult')) {
    await initDemo(kernelVatSupervisor, vat);
  }

  // we await bc on reincarnation it will be a promise
  const demoResult = await kernelVatSupervisor.store.get('demoResult');
  console.log({ demoResult })

  // shutdown the vat
  await E(vat.workerDaemonFacet).nextCrank();
  const newVatState = await E(vat.workerDaemonFacet).serializeState();
  kernelVatSupervisor.store.set('vat-state', newVatState);

  // shutdown the kernel
  writeKernelVatState(kernelVatSupervisor.serializeState());
  process.exitCode = 0;
  process.exit();
}

start()
