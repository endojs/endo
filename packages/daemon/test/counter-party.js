import { E, Far } from '@endo/far';

export const make = async powers => {
  let counter = await E(powers).request('host', 'starting number', 'start');
  return Far('Counter', {
    incr() {
      counter += 1;
      return counter;
    },
  });
};
