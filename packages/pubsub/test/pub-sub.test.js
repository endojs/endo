// @ts-check
import test from '@endo/ses-ava/test.js';

import { makePubSub } from '../pub-sub.js';

test('pub-sub: subscriber created before publishes sees all', async t => {
  await null;
  const { pub, sub } = makePubSub();
  const a = sub();
  pub.put(1);
  pub.put(2);
  pub.put(3);
  t.is(await a.get(), 1);
  t.is(await a.get(), 2);
  t.is(await a.get(), 3);
});

test('pub-sub: subscriber created after publishes only sees subsequent', async t => {
  await null;
  const { pub, sub } = makePubSub();
  pub.put(1);
  pub.put(2);
  const late = sub();
  pub.put(3);
  pub.put(4);
  t.is(await late.get(), 3);
  t.is(await late.get(), 4);
});

test('pub-sub: multiple subscribers are independent', async t => {
  await null;
  const { pub, sub } = makePubSub();
  const a = sub();
  const b = sub();
  pub.put('x');
  pub.put('y');
  t.is(await a.get(), 'x');
  t.is(await b.get(), 'x');
  t.is(await a.get(), 'y');
  t.is(await b.get(), 'y');
});

test('pub-sub: subscriber-before-publish blocks until publish', async t => {
  const { pub, sub } = makePubSub();
  const a = sub();
  let resolved = false;
  const pending = a.get().then(value => {
    resolved = true;
    return value;
  });
  await Promise.resolve();
  await Promise.resolve();
  t.false(resolved, 'subscriber should not have resolved yet');
  pub.put('hello');
  t.is(await pending, 'hello');
  t.true(resolved);
});
