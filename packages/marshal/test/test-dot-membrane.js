import test from '@endo/ses-ava/prepare-endo.js';

import { Far } from '@endo/pass-style';
import { makeDotMembraneKit } from '../src/dot-membrane.js';

test('test dot-membrane basics', async t => {
  /** @type {any} */
  let blueState;
  const blueSetState = Far('blueSetState', async (newState, blueInP) => {
    blueState = newState;
    await blueInP;
    return Far('blueObj', {
      getBlueState() {
        return blueState;
      },
    });
  });
  const { yellowProxy: yellowSetState, yellowRevoke } =
    makeDotMembraneKit(blueSetState);
  t.not(blueSetState, yellowSetState);
  const yellow88 = [88];
  const yellow99 = [99];
  const yellowInP = Promise.resolve('wait for it');
  const yellowObjP = yellowSetState(yellow88, yellowInP);
  assert(blueState);
  t.is(blueState[0], 88);
  t.not(blueState, yellow88);
  const yellowObj = await yellowObjP;
  // eslint-disable-next-line no-underscore-dangle
  const methodNames = yellowObj.__getMethodNames__();
  yellowRevoke('Halt!');
  t.throws(() => yellowSetState(yellow99), {
    message: /Revoked: Halt!/,
  });

  t.is(blueState[0], 88);
  t.deepEqual(methodNames, ['__getMethodNames__', 'getBlueState']);
});
