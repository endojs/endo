import test from '@endo/ses-ava';

import { Far } from '@endo/marshal';
import { makeLoopback, E } from '../src/loopback.js';

test('prevent crosstalk', async t => {
  const { makeFar } = makeLoopback('alice');
  const rightRef = makeFar(
    Far('rightRef', {
      isSide(objP, side) {
        return E(objP)
          .side()
          .then(s => t.is(s, side, `obj.side() is ${side}`));
      },
      side() {
        return 'right';
      },
    }),
  );

  await E(rightRef).isSide(rightRef, 'right');
  const leftRef = Far('leftRef', {
    side() {
      return 'left';
    },
  });
  await E(rightRef).isSide(leftRef, 'left');
});
