import { Far } from '@endo/far';

export const make = () => {
  let counter = 0;
  return Far('Counter', {
    incr() {
      counter += 1;
      return counter;
    },
  });
};
