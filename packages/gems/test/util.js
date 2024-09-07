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

  const { target: gemA, wakeController: wakeControllerA } = kernel.makeGem({
    name: 'alice',
    makeFacet: makeAlice.makeFacet,
    methodNames: makeAlice.methodNames,
  });
  const captpKitA = makeMessageCapTP('Alice', writerA, readerA, never, gemA);

  const { target: gemB, wakeController: wakeControllerB } = kernel.makeGem({
    name: 'bob',
    makeFacet: makeBob.makeFacet,
    methodNames: makeBob.methodNames,
  });
  const captpKitB = makeMessageCapTP('Bob', writerB, readerB, never, gemB);

  return {
    aliceKit: {
      captpKit: captpKitA,
      wakeController: wakeControllerA,
    },
    bobKit: {
      captpKit: captpKitB,
      wakeController: wakeControllerB,
    },
  };
};
