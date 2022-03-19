// @ts-check

import '../index.js';
import test from 'ava';

const { setPrototypeOf, defineProperty } = Object;

lockdown({ promiseTaming: 'unsafe' });

const normalPromise = Promise.resolve('normal');
const thenable = { then: onSuccess => onSuccess('thenable') };
const badOwnPromise = Promise.resolve('badOwnPromise');
defineProperty(badOwnPromise, 'then', {
  value: onSuccess => onSuccess('badThenResult'),
});

// Even though `badSubPromise` has no own `then` property,
// it still inherits a bad one.
const badSubPromise = Promise.resolve('badSubPromise');
setPrototypeOf(badSubPromise, badOwnPromise);

// Even though `badSpacerPromise.then` is the original `then` now,
// and it is not an own property, and it is inherited from
// the real Promise.prototype, it is still not reliable.
// The intermediate object on the prototype chain means that
// `then` be something else later.
const spacerProto = { __proto__: Promise.prototype };
const badSpacerPromise = Promise.resolve('badSpacerPromise');
setPrototypeOf(badSpacerPromise, spacerProto);

test('tamePromise unsafe Promise.resolve', t => {
  t.is(Promise.resolve(normalPromise), normalPromise);
  // @ts-ignore It isn't supposed to match, so inconsistent types are ok.
  t.not(Promise.resolve(thenable), thenable);
  t.is(Promise.resolve(badOwnPromise), badOwnPromise);
  t.is(Promise.resolve(badSubPromise), badSubPromise);
  t.is(Promise.resolve(badSpacerPromise), badSpacerPromise);
});

const victim = p => {
  let i = 'good';
  Promise.resolve(p).then(() => {
    i = 'bad';
  });
  return i;
};

test('tamePromise unsafe reentrancy', t => {
  t.is(victim(normalPromise), 'good');
  t.is(victim(thenable), 'good');
  t.is(victim(badOwnPromise), 'bad');
  t.is(victim(badSubPromise), 'bad');
  defineProperty(spacerProto, 'then', {
    value: onSuccess => onSuccess('space attack'),
  });
  t.is(victim(badSpacerPromise), 'bad');
});
