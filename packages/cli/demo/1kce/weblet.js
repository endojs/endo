import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon/ref-reader';
import { make as makeApp } from './ui/index.js';

// no way of resolving relative paths from the weblet
const projectRootPath = './demo/1kce';

const makeThing = async (powers, importFullPath, resultName) => {
  const workerName = 'MAIN';
  const powersName = 'NONE';
  const deck = await E(powers).importUnsafeAndEndow(
    workerName,
    importFullPath,
    powersName,
    resultName,
  );
  return deck
}

export const make = (powers) => {
  // form inventory from powers
  const inventory = {
    subscribeToNames () {
      return makeRefIterator(E(powers).followNames())
    },
    async has (name) {
      return E(powers).has(name)
    },
    async lookup (name) {
      return await E(powers).lookup(name)
    },
    async makeNewDeck () {
      const importFullPath = `${projectRootPath}/deck.js`;
      const resultName = 'deck';
      return await makeThing(powers, importFullPath, resultName)
    },
    async makeGame () {
      const importFullPath = `${projectRootPath}/game.js`;
      const resultName = 'game';
      return await makeThing(powers, importFullPath, resultName)
    },
  }

  return makeApp({ inventory })
}