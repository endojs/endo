import { Far } from '@endo/far';

export const make = () => {
  let cards = [];
  return Far('Deck', {
    add (card) {
      cards.push(card);
      return;
    },
    getCards () {
      return harden(cards.slice());
    }
  });
};
