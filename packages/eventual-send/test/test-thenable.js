import { test } from './prepare-test-env-ava.js';

import { E, HandledPromise } from './get-hp.js';

const verifySimplePromise = async (t, resolve) => {
  const p = new Promise(_ => {});
  const p2 = resolve(p);
  t.is(p, p2, 'simple promise should not coerce');
};
test(
  'E.resolve does not coerce simple promise',
  verifySimplePromise,
  E.resolve,
);
test(
  'HandledPromise.resolve does not coerce simple promise',
  verifySimplePromise,
  HandledPromise.resolve,
);

const verifyThenAttack = async (t, resolve) => {
  const p = new Promise(_ => {});
  let getHappened = false;
  let callHappened = false;
  // Work around the override mistake on SES.
  Object.defineProperty(p, 'then', {
    get() {
      getHappened = true;
      return (res, _rej) => {
        callHappened = true;
        res('done');
      };
    },
  });
  const p2 = resolve(p).then(ret => ret);
  t.not(p, p2, 'an own "then" should cause coercion');
  t.is(getHappened, false, `getter not called too early`);
  t.is(callHappened, false, `then not called too early`);
  t.is(await p2, 'done', `p2 is resolved`);
  t.is(getHappened, true, `getter not called too early`);
  t.is(callHappened, true, `then not called too early`);
};
test('E.resolve protects against "then" attack', verifyThenAttack, E.resolve);
test(
  'HandledPromise.resolve protects against "then" attack',
  verifyThenAttack,
  HandledPromise.resolve,
);

const verifyConstructorAttack = async (t, resolve) => {
  const p = new Promise(_ => {});
  let getHappened = false;
  // Work around the override mistake on SES.
  Object.defineProperty(p, 'constructor', {
    get() {
      getHappened = true;
      return Promise;
    },
  });
  const p2 = resolve(p);
  t.not(p, p2, 'an own "constructor" should cause coercion');
  // This 'true' demonstrates our remaining vulnerability to reentrancy.
  // But the fact that p coerced to a fresh p2 means that p2 cannot
  // cause a reentrancy attack
  t.is(getHappened, true, `same turn`);
};
test(
  'E.resolve protects against "constructor" attack',
  verifyConstructorAttack,
  E.resolve,
);
test(
  'HandledPromise.resolve protects against "constructor" attack',
  verifyConstructorAttack,
  HandledPromise.resolve,
);
