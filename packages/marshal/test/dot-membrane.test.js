import test from '@endo/ses-ava/test.js';

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

test('dot-membrane wraps remotable objects with methods', t => {
  const blueCounter = Far('counter', {
    incr(n) {
      return n + 1;
    },
    double(n) {
      return n * 2;
    },
  });
  const { proxy: yellowCounter } = makeDotMembraneKit(blueCounter);

  // Methods are proxied through the membrane
  t.is(yellowCounter.incr(5), 6);
  t.is(yellowCounter.double(4), 8);
});

test('dot-membrane remotable object revocation', t => {
  const blueObj = Far('service', {
    greet(name) {
      return `hello ${name}`;
    },
  });
  const { proxy: yellowObj, revoke } = makeDotMembraneKit(blueObj);

  t.is(yellowObj.greet('world'), 'hello world');

  revoke('Done!');
  t.throws(() => yellowObj.greet('world'), {
    message: /Revoked: Done!/,
  });
});
