import '@agoric/install-ses';
import { Far } from '@agoric/marshal';
import test from 'ava';
import { makeLoopback, E } from '../lib/captp';

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
