import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { make as makeApp } from './ui/index.js';
import deckBundleJson from '../bundles/bundle-deck.json';
import gameBundleJson from '../bundles/bundle-game.json';
import { makeReaderRef } from '@endo/daemon/reader-ref.js';

const textEncoder = new TextEncoder();

const deckName = 'deck';
const deckHostAgentName = 'host-deck';
const deckHostHandleName = 'handle-deck';
const gameHostAgentName = 'host-game';
const gameHostHandleName = 'handle-game';

const makeBundle = async (powers, bundleJson, resultName, hostAgentName, hostHandleName) => {
  const workerName = 'MAIN';
  // prep powers
  const isBuiltinPowers = hostAgentName.toUpperCase() === hostAgentName
  if (isBuiltinPowers === false) {
    // make new host
    await E(powers).provideHost(hostHandleName, {
      introducedNames: {
        SELF: 'parent',
      },
      agentName: hostAgentName,
    })
    console.log('made host', hostAgentName)
  }
  // submit bundle
  const temporaryBundleName = `tmp-bundle-${Math.floor(Math.random() * 1000000)}`;
  const bundleText = JSON.stringify(bundleJson);
  const bundleBytes = textEncoder.encode(bundleText);
  const readerRef = makeReaderRef([bundleBytes]);
  await E(powers).storeBlob(readerRef, temporaryBundleName);
  console.log('stored bundle', temporaryBundleName)
  // make
  await E(powers).makeBundle(workerName, temporaryBundleName, hostAgentName, resultName);
  console.log('made bundle', resultName)
  // clean
  await E(powers).remove(temporaryBundleName);
  console.log('cleaned up', temporaryBundleName)
  // get result
  const result = await E(powers).lookup(resultName);
  console.log('got result', resultName, result)
  return result;
}

export const make = (agent) => {
  const followRequests = async () => {
    const requestIterator = makeRefIterator(await E(agent).followMessages())
    for await (const request of requestIterator) {
      if (request.type !== 'request') continue
      // date: "2024-05-16T01:03:07.004Z"
      // description: "game/deck"
      // dismissed: Promise {<pending>}
      // dismisser: Alleged: Dismisser {}
      // from: "ecb641f203ad4f91183adfe272ad3bcad44c6cb4f1ee4b8e29b84765dd8558f97e7676710c9c5ae0f097d5f6a9eb336e68c0c3533e9abb97dbfd489d3374984d:9eaaede4c68ff48208cd2a9a9a2ff0050a3c081c6b7dda0c00aef631cc7ecca188a47829a18cf8274eddf41c3bec5e8dda58c71f1a857b1a34f9c5f474e560ac"
      // number: 11
      // responder: Alleged: EndoResponder {}
      // settled: Promise {<pending>}
      // to: "20f44fabae954fca2220c77be32d7608f77e4b33cb99fa434aa49d91e441f2adce46b688fb8997b90224dd92eab5452904159b65a525224ba227ded448c24048:9eaaede4c68ff48208cd2a9a9a2ff0050a3c081c6b7dda0c00aef631cc7ecca188a47829a18cf8274eddf41c3bec5e8dda58c71f1a857b1a34f9c5f474e560ac"
      // type: "request"
      switch (request.description) {
        case 'game/deck':
          // if (request.from !== gameHostAgentId) continue
          await E(agent).resolve(
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
  const actions = {
    subscribeToNames () {
      return E(agent).followNameChanges()
    },
    async has (name) {
      return E(agent).has(name)
    },
    async lookup (name) {
      return E(agent).lookup(name)
    },

    
    async addCardToDeckByName (cardName) {
      await E(agent).send(
        // destination agent
        deckHostHandleName,
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
      const hostAgentName = deckHostAgentName
      const hostHandleName = deckHostHandleName
      return makeBundle(agent, deckBundleJson, resultName, hostAgentName, hostHandleName)
    },

    async makeGame () {
      const resultName = 'game';
      const hostAgentName = gameHostAgentName
      const hostHandleName = gameHostHandleName
      return makeBundle(agent, gameBundleJson, resultName, hostAgentName, hostHandleName)
    },
  }

  return makeApp({ actions })
}