import { default as testFn } from '@endo/ses-ava/prepare-endo.js';
import '@agoric/swingset-liveslots/tools/setup-vat-data.js';
import { E } from '@endo/captp';
import { makeKernelFactory } from './util.js';

// All these tests must be serial.
// There can only be one kernel per Realm due to the use of
// vomkit. see reincarnate() in setup-vat-data.js
const test = testFn.serial;
const { restart, clear } = makeKernelFactory();

// always (even on failure) clear the kernel state after each test
testFn.afterEach.always(async t => {
  await clear();
});

test('durability - weakref copydata', async t => {
  let { kernel } = await restart();

  const copyData = harden({ hello: 'world' });
  const ref = new WeakRef(copyData);
  harden(ref);
  kernel.store.init('copyData', ref);

  ({ kernel } = await restart());
  copyData2 = kernel.store.get('copyData').deref();
});
