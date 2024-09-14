import { makeKernel } from '../src/index.js';
import { reincarnate } from '@agoric/swingset-liveslots/tools/setup-vat-data.js';

const setupWorld = (fakeStore) => {
  const { fakeVomKit } = reincarnate({ relaxDurabilityRules: false, fakeStore });
  const { vom, cm, vrm } = fakeVomKit;
  const flush = () => {
    vom.flushStateCache();
    cm.flushSchemaCache();
    vrm.flushIDCounters();
  }
  const baggage = cm.provideBaggage();
  return { baggage, flush };
};

export const makeVat = () => {
  let fakeStore, baggage, flush, kernel;

  const restart = () => {
    if (flush) {
      flush();
    }
    fakeStore = new Map(fakeStore);
    ({ baggage, flush } = setupWorld(fakeStore));
    kernel = makeKernel(baggage);
    return kernel;
  }

  return {
    restart,
  }
};
