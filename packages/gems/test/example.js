/* global gc */

import '@endo/init';
import { E } from '@endo/far';
import { makePipe } from '@endo/stream';
import { makeMessageCapTP, makeGem, util } from '../src/index.js';
import { makeKumavisStore } from '../src/kumavis-store.js';

const { never } = util;

const makeScenario = () => {
  const [writerA, readerB] = makePipe();
  const [writerB, readerA] = makePipe();

  const methodNames = ['ping'];
  const makeFacet = async ({ facetId, persistenceNode }) => {
    const initState = { count: 0 };
    const store = await makeKumavisStore({ persistenceNode }, initState);
    const gem = {
      async ping() {
        let { count } = store.get();
        count += 1;
        await store.update({ count });
        return `${facetId}: pong. (${count} times total)`;
      },
    };
    return gem;
  };

  const { target: gemA, wakeController: wakeControllerA } = makeGem({
    name: 'alice',
    makeFacet,
    methodNames,
  });
  const captpKitA = makeMessageCapTP('Alice', writerA, readerA, never, gemA);

  const { target: gemB, wakeController: wakeControllerB } = makeGem({
    name: 'bob',
    makeFacet,
    methodNames,
  });
  const captpKitB = makeMessageCapTP('Bob', writerB, readerB, never, gemB);

  return { captpKitA, captpKitB, wakeControllerA, wakeControllerB };
};

const start = async () => {
  await null;
  const { captpKitB, wakeControllerA } = makeScenario();
  // bob's bootstrap is alice
  const alice = captpKitB.getBootstrap();

  console.log('ping ->');
  console.log('     <-', await E(alice).ping());
  console.log('ping ->');
  console.log('     <-', await E(alice).ping());
  await wakeControllerA.sleep();

  console.log('ping ->');
  console.log('     <-', await E(alice).ping());

  // testing if we can trigger gc during a method call
  // E(alice).ping().then(resp => console.log('     <-', resp));
  // // delay til after facet creation
  // await delay(1000);

  console.log('...triggering GC...');
  // @ts-expect-error
  gc();

  console.log('ping ->');
  console.log('     <-', await E(alice).ping());

  await never;
};

start();
