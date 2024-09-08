import { makePipe } from '@endo/stream';
import { makeMessageCapTP, util, makeKernel } from '../src/index.js';

const { never } = util;

export const makeScenario = ({
  makeBoth,
  makeAlice = makeBoth,
  makeBob = makeBoth,
}) => {
  const [writerA, readerB] = makePipe();
  const [writerB, readerA] = makePipe();

  const kernel = makeKernel();

  const gemA = kernel.makeGem({
    name: 'alice',
    makeFacet: makeAlice.makeFacet,
    methodNames: makeAlice.methodNames,
  });
  const captpKitA = makeMessageCapTP(
    'Alice',
    writerA,
    readerA,
    never,
    gemA.farRef,
  );

  const gemB = kernel.makeGem({
    name: 'bob',
    makeFacet: makeBob.makeFacet,
    methodNames: makeBob.methodNames,
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
