import { E, Far } from '@endo/far';
import { makeIteratorRef } from '@endo/daemon/reader-ref.js';
import { makeSyncArrayGrain } from '@endo/grain';
import { makeRemoteGrain } from '@endo/grain/captp.js';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

const cardPrefix = 'card-';

export const make = (powers) => {
  const cards = makeSyncArrayGrain();

  // cards already saved in petstore
  const followNames = async () => {
    for await (const change of makeRefIterator(E(powers).followNames())) {
      if (change.add === undefined) continue
      const name = change.add
      if (!name.startsWith(cardPrefix)) continue
      const card = await E(powers).lookup(name);
      cards.push(card);
    }
  }
  // incomming cards
  const followMessages = async () => {
    for await (const message of makeRefIterator(E(powers).followMessages())) {
      if (message.type !== 'package') continue
      await E(powers).adopt(message.number, 'card', `${cardPrefix}${cards.getLength()}`);
    }
  }

  followNames()
  followMessages()

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
