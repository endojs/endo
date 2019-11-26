import { test } from 'tape-promise/tape';
import { harden, makeCapTP, E } from '../lib/captp';

test('prevent crosstalk', async t => {
  try {
    const debug = false;
    let rightDispatch;
    const { dispatch: leftDispatch, getBootstrap: leftBootstrap } = makeCapTP(
      'left',
      obj => {
        if (debug) {
          console.log('toRight', obj);
        }
        rightDispatch(obj);
      },
    );
    ({ dispatch: rightDispatch } = makeCapTP(
      'right',
      obj => {
        if (debug) {
          console.log('toLeft', obj);
        }
        leftDispatch(obj);
      },
      harden({
        isSide(objP, side) {
          return E(objP).side().then(s => t.equal(s, side, `obj.side() is ${side}`));
        },
        side() {
          return 'right';
        },
      })
    ));
    const rightRef = leftBootstrap();

    await E(rightRef).isSide(rightRef, 'right');
    const leftRef = harden({
      side() {
        return 'left';
      },
    });
    await E(rightRef).isSide(leftRef, 'left');
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
