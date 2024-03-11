import test from '@endo/ses-ava';

import { Far } from '@endo/pass-style';
import { makeDotMembraneKit } from '../src/dot-membrane.js';

test('test dot-membrane basics', t => {
  /** @type {any} */
  let blueState;
  const blueSetState = Far('blueSetState', newState => {
    blueState = newState;
  });
  const { proxy: yellowSetState, revoke } = makeDotMembraneKit(blueSetState);
  const yellow88 = [88];
  const yellow99 = [99];
  yellowSetState(yellow88);
  assert(blueState);
  t.is(blueState[0], 88);
  t.not(blueState, yellow88);
  revoke('Halt!');
  t.throws(() => yellowSetState(yellow99), {
    message: /Revoked: Halt!/,
  });
  t.is(blueState[0], 88);
});
