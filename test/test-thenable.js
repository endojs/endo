// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/swingset-vat/tools/prepare-test-env-ava';

import { E, HandledPromise } from './get-hp';

test('E.resolve is always asynchronous', async t => {
  const p = new Promise(_ => {});
  // Work around the override mistake on SES.
  Object.defineProperty(p, 'then', { value: (res, _rej) => res('done') });
  let thened = false;
  const p2 = E.resolve(p).then(ret => (thened = ret));
  t.is(thened, false, `p2 is not yet resolved`);
  t.is(await p2, 'done', `p2 is resolved`);
});

test('HandledPromise.resolve is always asynchronous', async t => {
  const p = new Promise(_ => {});
  // Work around the override mistake on SES.
  Object.defineProperty(p, 'then', { value: (res, _rej) => res('done') });
  let thened = false;
  const p2 = HandledPromise.resolve(p).then(ret => (thened = ret));
  t.is(thened, false, `p2 is not yet resolved`);
  t.is(await p2, 'done', `p2 is resolved`);
});
