import { makeExo } from '@endo/exo';
import { E } from '@endo/far';
import { M } from '@endo/patterns';

/** @param {any} powers */
export const make = (powers) => {
  // const counter = E(powers).request(
  //   'HOST',
  //   'a counter, suitable for doubling',
  //   'my-counter',
  // );

  // E(powers).make

  return makeExo(
    'Wallet',
    M.interface('Wallet', {}, { defaultGuards: 'passable' }),
    {
      hello() { return 'I am a wallet!'; }
    },
  );
}
