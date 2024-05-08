import { E, Far } from '@endo/far';
import { makeIteratorRef } from '@endo/daemon/reader-ref.js';
import { makeSyncArrayGrain } from '@endo/grain';
import { makeRemoteGrain } from '@endo/grain/captp.js';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

const cardPrefix = 'card-';

export const make = async (powers) => {
  const cards = makeSyncArrayGrain();

  // cards already saved in petstore
  const loadExistingNames = async () => {
    for await (const name of await E(powers).list()) {
      if (!name.startsWith(cardPrefix)) continue
      const indexString = name.slice(cardPrefix.length)
      const card = await E(powers).lookup(name);
      cards.setAtIndex(indexString, card);
    }
  }
  // incomming cards
  const listenForIncommingCards = async () => {
    for await (const message of makeRefIterator(E(powers).followMessages())) {
      if (message.type !== 'package') continue
      if (!message.names.includes('card')) continue
      const petName = `${cardPrefix}${cards.getLength()}`
      await E(powers).adopt(message.number, 'card', petName);
      const card = await E(powers).lookup(petName);
      cards.push(card);
    }
  }

  // ensure all cards are loaded before continuing
  await loadExistingNames()
  // listen for new cards, but dont await as it will never resolve
  listenForIncommingCards()

  return Far('Deck', {
    add (card) {
      cards.push(card);
    },
    remove (card) {
      const index = cards.get().indexOf(card)
      if (index === -1) return
      cards.splice(index, 1);
    },
    getCards () {
      return harden(cards.get().slice());
    },
    getCardsGrain () {
      return makeRemoteGrain(cards);
    },
    follow () {
      return makeIteratorRef(cards.follow());
    },
  });
};
