import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { make as makeApp } from './ui/index.js';

// no way of resolving relative paths from the weblet
const projectRootPath = './demo/1kce';
const deckGuestName = 'guest-deck';

const makeThing = async (powers, importFullPath, resultName, powersName = 'NONE') => {
  const workerName = 'MAIN';
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
      const powersName = deckGuestName
      // delete existing guest, its petstore is what stores the cards
      if (await E(powers).has(powersName)) {
        await E(powers).remove(powersName)
      }
      // make new guest
      await E(powers).provideGuest(powersName)
      // make deck
      return await makeThing(powers, importFullPath, resultName, powersName)
    },
    async addCardToDeckByName (cardName) {
      await E(powers).send(
        // destination guest
        deckGuestName,
        // description
        [`add card to deck: "${cardName}"`],
        // name inside send envelope
        ['card'],
        // my petname for the obj
        [cardName],
      );
    },
    async makeGame () {
      const importFullPath = `${projectRootPath}/game.js`;
      const resultName = 'game';
      return await makeThing(powers, importFullPath, resultName)
    },
  }

  return makeApp({ inventory })
}