// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from './prepare-test-env-ava.js';

import { E, HandledPromise } from './get-hp.js';

test('E.resolve does not coerce simple promise', async t => {
  const p = new Promise(_ => {});
  const p2 = E.resolve(p);
  t.is(p, p2, 'simple promise should not coerce');
});

test('HandledPromise.resolve does not coerce simple promise', async t => {
  const p = new Promise(_ => {});
  const p2 = HandledPromise.resolve(p);
  t.is(p, p2, 'simple promise should not coerce');
});

test('E.resolve protects against "then" attack', async t => {
  const p = new Promise(_ => {});
  // Work around the override mistake on SES.
  Object.defineProperty(p, 'then', { value: (res, _rej) => res('done') });
  let happened = false;
  const p2 = E.resolve(p).then(ret => (happened = ret));
  t.not(p, p2, 'an own "then" should cause coercion');
  t.is(happened, false, `p2 is not yet resolved`);
  t.is(await p2, 'done', `p2 is resolved`);
});

test('HandledPromise.resolve protects against "then" attack', async t => {
  const p = new Promise(_ => {});
  // Work around the override mistake on SES.
  Object.defineProperty(p, 'then', { value: (res, _rej) => res('done') });
  let happened = false;
  const p2 = HandledPromise.resolve(p).then(ret => (happened = ret));
  t.not(p, p2, 'an own "then" should cause coercion');
  t.is(happened, false, `p2 is not yet resolved`);
  t.is(await p2, 'done', `p2 is resolved`);
});

test('E.resolve protects against "constructor" attack', async t => {
  const p = new Promise(_ => {});
  let happened = false;
  // Work around the override mistake on SES.
  Object.defineProperty(p, 'constructor', {
    get() {
      happened = true;
      return Promise;
    },
  });
  const p2 = E.resolve(p);
  t.not(p, p2, 'an own "constructor" should cause coercion');
  // This first 'true' demonstrates our remaining vulnerability to reentrancy.
  // But the fact that p coerced to a fresh p2 means that p2 cannot
  // cause a reentrancy attack
  t.is(happened, true, `same turn`);
  await null;
  t.is(happened, true, `later turn with p still unresolved`);
});

test('HandledPromise.resolve protects against "constructor" attack', async t => {
  const p = new Promise(_ => {});
  let happened = false;
  // Work around the override mistake on SES.
  Object.defineProperty(p, 'constructor', {
    get() {
      happened = true;
      return Promise;
    },
  });
  const p2 = HandledPromise.resolve(p);
  t.not(p, p2, 'an own "constructor" should cause coercion');
  // This first 'true' demonstrates our remaining vulnerability to reentrancy.
  // But the fact that p coerced to a fresh p2 means that p2 cannot
  // cause a reentrancy attack
  t.is(happened, true, `same turn`);
  await null;
  t.is(happened, true, `later turn with p still unresolved`);
});
