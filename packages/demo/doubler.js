import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

/**
 * TODO fix this import
 *
 * @import { EndoAgent } from '@endo/daemon/types.d.ts'
 */

/**
 * @param {EndoAgent} powers - wat
 */
export const make = powers => {
  console.log('tryna request'); // 🎈
  const myCounter = E(powers).request(
    'HOST',
    'a counter, suitable for doubling',
    'my-counter',
  );
  console.log('made request'); // 🤡

  console.log('making exo'); // 🎈
  const exo = makeExo(
    'Doubler',
    M.interface('Doubler', {}, { defaultGuards: 'passable' }),
    {
      async incr() {
        console.log('incr here ; gimme mine'); // 🎈

        // TODO why do we resolve the counter every request, rather than once at exo construction?
        const mineCounter = await E(myCounter);

        console.log('incr got mine', mineCounter); // 🤡

        const n = mineCounter.incr();

        console.log('incr did incr', n); // 🎈

        const m = n * 2;

        console.log('incr gonna return', m); // 🤡

        return m;
      },
    },
  );

  console.log('return exo'); // 🤡
  return exo;
};
