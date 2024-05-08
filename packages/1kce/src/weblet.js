import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { make as makeApp } from './ui/index.js';

// no way of resolving relative paths from the weblet
const projectRootPath = '../1kce/src';
const deckName = 'deck';
const deckGuestName = 'guest-deck';
const gameGuestName = 'guest-game';

const makeThing = async (powers, importFullPath, resultName, powersName = 'NONE') => {
  const workerName = 'MAIN';
  if (powersName !== 'NONE') {
    // Disabling the overwrite of the guest for now
    // I want to use the premade guest bc it already knows alice
    // and can receive her messages
    // // delete existing guest, its petstore is what stores all the persistence
    // if (await E(powers).has(powersName)) {
    //   await E(powers).remove(powersName)
    // }
    // make new guest
    await E(powers).provideGuest(powersName)
  }
  // make
  const deck = await E(powers).importUnsafeAndEndow(
    workerName,
    importFullPath,
    powersName,
    resultName,
  );
  return deck
}

export const make = (powers) => {
  const followRequests = async () => {
    const requestIterator = makeRefIterator(await E(powers).followMessages())
    for await (const request of requestIterator) {
      if (request.type !== 'request') continue
      switch (request.what) {
        case 'game/deck':
          if (request.who !== gameGuestName) continue
          await E(powers).resolve(
            request.number,
            deckName,
          );
          break;
        default:
          console.log('unhandled request', request)
          continue;
      }
    }
  }

  followRequests()

  // form inventory from powers
  const inventory = {
    subscribeToNames () {
      return makeRefIterator(E(powers).followNames())
    },
    async has (name) {
      return E(powers).has(name)
    },
    async lookup (name) {
      return E(powers).lookup(name)
    },

    async makeNewDeck () {
      const importFullPath = `${projectRootPath}/deck.js`;
      const resultName = deckName;
      const powersName = deckGuestName
      return makeThing(powers, importFullPath, resultName, powersName)
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
      const powersName = gameGuestName
      return makeThing(powers, importFullPath, resultName, powersName)
    },
  }

  return makeApp({ inventory })
}