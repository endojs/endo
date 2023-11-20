import { Far } from '@endo/far';
import { makeIteratorRef } from '@endo/daemon/reader-ref.js';
import { makeSyncArrayGrain } from './grain.js';

export const make = () => {
  const cards = makeSyncArrayGrain();
  return Far('Deck', {
    add (card) {
      cards.push(card);
      
    },
    getCards () {
      return harden(cards.get().slice());
    },
    follow () {
      return makeIteratorRef(cards.follow());
    },
  });
};
