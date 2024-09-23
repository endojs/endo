import { reincarnate } from '@agoric/swingset-liveslots/tools/setup-vat-data.js';
import { makeKernel, makeMessageCapTP } from '../src/index.js';
import { makePipe } from '@endo/stream';

const never = new Promise(() => {});

export const makeCaptpPair = (leftOpts, rightOpts) => {
  const [writerA, readerB] = makePipe();
  const [writerB, readerA] = makePipe();

  const makeLeft = (tag, bootstrap) => {
    return makeMessageCapTP(
      tag,
      writerA,
      readerA,
      never,
      bootstrap,
      leftOpts,
    );
  };

  const makeRight = (tag, bootstrap) => {
    return makeMessageCapTP(
      tag,
      writerB,
      readerB,
      never,
      bootstrap,
      rightOpts,
    );
  };

  return { makeLeft, makeRight };
};

const setupWorld = fakeStore => {
  const { fakeVomKit } = reincarnate({
    relaxDurabilityRules: false,
    fakeStore,
  });
  const { vom, cm, vrm } = fakeVomKit;
  const flush = () => {
    vom.flushStateCache();
    cm.flushSchemaCache();
    vrm.flushIDCounters();
  };
  const baggage = cm.provideBaggage();
  return { baggage, flush };
};

export const makeVat = () => {
  let fakeStore;
  let baggage;
  let flush;
  let kernel;

  const restart = () => {
    if (flush) {
      flush();
    }
    fakeStore = new Map(fakeStore);
    ({ baggage, flush } = setupWorld(fakeStore));
    kernel = makeKernel(baggage);
    return kernel;
  };

  return {
    restart,
  };
};
