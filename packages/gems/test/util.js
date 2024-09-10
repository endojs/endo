import { makePipe } from '@endo/stream';
import { makeMessageCapTP, util, makeKernel } from '../src/index.js';

const { never } = util;

export const makeScenario = ({
  recipeForBoth,
  recipeForAlice = recipeForBoth,
  recipeForBob = recipeForBoth,
}) => {
  const [writerA, readerB] = makePipe();
  const [writerB, readerA] = makePipe();

  const kernel = makeKernel();

  const gemA = kernel.makeGem({
    ...recipeForAlice,
    name: `${recipeForAlice.name}-alice`,
  });
  const captpKitA = makeMessageCapTP(
    'Alice',
    writerA,
    readerA,
    never,
    gemA.farRef,
  );

  const gemB = kernel.makeGem({
    ...recipeForBob,
    name: `${recipeForBob.name}-bob`,
  });
  const captpKitB = makeMessageCapTP(
    'Bob',
    writerB,
    readerB,
    never,
    gemB.farRef,
  );

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
