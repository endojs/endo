import { Far } from '@endo/far';
import { makeIteratorRef } from '@endo/daemon/reader-ref.js';
import { makeTrackedArray } from './util.js';

export const make = () => {
  let cards = makeTrackedArray();
  return Far('Deck', {
    add (card) {
      cards.push(card);
      return;
    },
    getCards () {
      return harden(cards.slice());
    },
    subscribe () {
      return makeIteratorRef(cards.subscribe());
    },
    follow () {
      return makeIteratorRef(cards.follow());
    },
  });
};
