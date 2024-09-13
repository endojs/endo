import { makePipe } from '@endo/stream';
import { makeMessageCapTP, util, makeKernel } from '../src/index.js';
import { reincarnate } from '@agoric/swingset-liveslots/tools/setup-vat-data.js';

const { never } = util;

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

export const makeScenario = ({
  recipeForBoth,
  recipeForAlice = recipeForBoth,
  recipeForBob = recipeForBoth,
}) => {
  const [writerA, readerB] = makePipe();
  const [writerB, readerA] = makePipe();

  const fakeStore = new Map();
  const { baggage } = setupWorld(fakeStore);

  const kernel = makeKernel(baggage);

  const gemA = kernel.makeGem({
    ...recipeForAlice,
    name: `${recipeForAlice.name}-alice`,
  });
  const captpKitA = makeMessageCapTP(
    'Alice',
    writerA,
    readerA,
    never,
    gemA,
  );

  const gemB = kernel.makeGem({
    ...recipeForBob,
    name: `${recipeForBob.name}-bob`,
  });
  const captpKitB = makeMessageCapTP('Bob', writerB, readerB, never, gemB);

  return {
    aliceKit: {
      captpKit: captpKitA,
      gem: gemA,
    },
    bobKit: {
      captpKit: captpKitB,
      gem: gemB,
    },
  };
};
