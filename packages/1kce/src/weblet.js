import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { make as makeApp } from './ui/index.js';
import deckBundleJson from '../bundles/bundle-deck.json';
import gameBundleJson from '../bundles/bundle-game.json';
import { makeReaderRef } from '@endo/daemon/reader-ref.js';

const textEncoder = new TextEncoder();

const deckName = 'deck';
const deckGuestName = 'guest-deck';
const gameGuestName = 'guest-game';

const makeBundle = async (powers, bundleJson, resultName, powersName = 'NONE') => {
  const workerName = 'MAIN';
  // prep powers
  const isBuiltinPowers = powersName.toUpperCase() === powersName
  if (isBuiltinPowers === false) {
    // Disabling the overwrite of the guest for now
    // I want to use the premade guest bc it already knows alice
    // and can receive her messages
    // // delete existing guest, its petstore is what stores all the persistence
    // if (await E(powers).has(powersName)) {
    //   await E(powers).remove(powersName)
    // }
    // make new guest
    const powersHandleName = `handle-${powersName}`
    await E(powers).provideGuest(powersHandleName, {
      agentName: powersName,
    })
    console.log('made guest', powersName)
  }
  // submit bundle
  const temporaryBundleName = `tmp-bundle-${Math.floor(Math.random() * 1000000)}`;
  const bundleText = JSON.stringify(bundleJson);
  const bundleBytes = textEncoder.encode(bundleText);
  const readerRef = makeReaderRef([bundleBytes]);
  await E(powers).storeBlob(readerRef, temporaryBundleName);
  console.log('stored bundle', temporaryBundleName)
  // make
  await E(powers).makeBundle(workerName, temporaryBundleName, powersName, resultName);
  console.log('made bundle', resultName)
  // clean
  await E(powers).remove(temporaryBundleName);
  console.log('cleaned up', temporaryBundleName)
  // get result
  const result = await E(powers).lookup(resultName);
  console.log('got result', resultName, result)
  return result;
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
    
    async makeNewDeck () {
      const resultName = deckName;
      const powersName = deckGuestName
      return makeBundle(powers, deckBundleJson, resultName, powersName)
    },

    async makeGame () {
      const resultName = 'game';
      const powersName = gameGuestName
      return makeBundle(powers, gameBundleJson, resultName, powersName)
    },
  }

  return makeApp({ inventory })
}