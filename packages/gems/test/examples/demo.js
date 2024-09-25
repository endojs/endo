/* global process */

import '@endo/init'
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { E } from '@endo/captp';
import { makeKernel } from '../../src/kernel.js';

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

const initDemo = async (vatSupervisor, workerFacet) => {
  console.log('initDemo')
  // code to run in vat
  // register a class and create an instance of it
  const source = `(${(powers)=>{
    const name = 'DemoCounter';
    const makeCounter = powers.registerClass(name, `${() => {
      const interfaceGuards = undefined;
      const initFn = () => harden({ count: 0 });
      const methods = {
        increment() {
          this.state.count += 1;
          return this.state.count;
        },
      };
      return { interfaceGuards, initFn, methods };
    }}`);
    return makeCounter();
  }})()`
  const demoResult = await E(workerFacet).incubate(source);
  vatSupervisor.store.init('demoResult', demoResult);
}

const start = async () => {
  const kernelVatState = getKernelVatState();
  const { vatSupervisor, workerFacet } = await makeKernel(kernelVatState);
  
  // initialize only on first start
  if (!vatSupervisor.store.has('demoResult')) {
    await initDemo(vatSupervisor, workerFacet);
  }

  // we await bc on reincarnation it will be a promise
  const demoResult = await vatSupervisor.store.get('demoResult');
  console.log({ demoResult })
  console.log('counter:', await E(demoResult).increment())

  // shutdown the vat
  await E(workerFacet).nextCrank();
  const newVatState = await E(workerFacet).serializeState();
  vatSupervisor.store.set('vat-state', newVatState);

  // shutdown the kernel
  writeKernelVatState(vatSupervisor.serializeState());
  process.exitCode = 0;
  process.exit();
}

start()
