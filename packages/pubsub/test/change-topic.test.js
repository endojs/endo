// @ts-check
import test from '@endo/ses-ava/test.js';

import { makeChangeTopic } from '../change-topic.js';

test('change-topic: early subscriber sees every delta', async t => {
  const { publisher, subscribe } = makeChangeTopic();
  const reader = subscribe();
  await publisher.next(1);
  await publisher.next(2);
  await publisher.next(3);
  t.deepEqual(await reader.next(), { value: 1, done: false });
  t.deepEqual(await reader.next(), { value: 2, done: false });
  t.deepEqual(await reader.next(), { value: 3, done: false });
});

test('change-topic: late subscriber starts from next publication', async t => {
  const { publisher, subscribe } = makeChangeTopic();
  await publisher.next(1);
  await publisher.next(2);
  const late = subscribe();
  await publisher.next(3);
  await publisher.next(4);
  t.deepEqual(await late.next(), { value: 3, done: false });
  t.deepEqual(await late.next(), { value: 4, done: false });
});

test('change-topic: multiple subscribers each receive every delta', async t => {
  const { publisher, subscribe } = makeChangeTopic();
  const a = subscribe();
  const b = subscribe();
  await publisher.next('alpha');
  await publisher.next('beta');
  t.deepEqual(await a.next(), { value: 'alpha', done: false });
  t.deepEqual(await b.next(), { value: 'alpha', done: false });
  t.deepEqual(await a.next(), { value: 'beta', done: false });
  t.deepEqual(await b.next(), { value: 'beta', done: false });
});

test('change-topic: subscribe before publish blocks until publish', async t => {
  const { publisher, subscribe } = makeChangeTopic();
  const reader = subscribe();
  let resolved = false;
  const pending = reader.next().then(result => {
    resolved = true;
    return result;
  });
  await Promise.resolve();
  await Promise.resolve();
  t.false(resolved);
  await publisher.next(42);
  t.deepEqual(await pending, { value: 42, done: false });
});

test('change-topic: publisher.return settles subscribers with terminal', async t => {
  const { publisher, subscribe } = makeChangeTopic();
  const reader = subscribe();
  await publisher.next(1);
  await publisher.return(undefined);
  t.deepEqual(await reader.next(), { value: 1, done: false });
  t.deepEqual(await reader.next(), { value: undefined, done: true });
});

test('change-topic: publisher.throw rejects subscribers', async t => {
  const { publisher, subscribe } = makeChangeTopic();
  const reader = subscribe();
  await publisher.next(1);
  await publisher.throw(Error('boom'));
  t.deepEqual(await reader.next(), { value: 1, done: false });
  await t.throwsAsync(reader.next(), { message: 'boom' });
});

test('change-topic: race-safe parallel publish and drain', async t => {
  const { publisher, subscribe } = makeChangeTopic();
  const reader = subscribe();
  const order = [1, 2, 3, 4, 5];

  const produce = async () => {
    await null;
    for (const v of order) {
      // eslint-disable-next-line no-await-in-loop
      await publisher.next(v);
    }
    await publisher.return(undefined);
  };
  const consume = async () => {
    const seen = [];
    let result = await reader.next();
    while (!result.done) {
      seen.push(result.value);
      // eslint-disable-next-line no-await-in-loop
      result = await reader.next();
    }
    return seen;
  };

  const [, seen] = await Promise.all([produce(), consume()]);
  t.deepEqual(seen, order);
});

test('change-topic: subscribe after termination receives terminal', async t => {
  const { publisher, subscribe } = makeChangeTopic();
  await publisher.next(1);
  await publisher.return(undefined);
  const late = subscribe();
  t.deepEqual(await late.next(), { value: undefined, done: true });
});

test('change-topic: subscribe after throw receives rejection', async t => {
  const { publisher, subscribe } = makeChangeTopic();
  await publisher.next(1);
  await publisher.throw(Error('boom'));
  const late = subscribe();
  await t.throwsAsync(late.next(), { message: 'boom' });
});

test('change-topic: for-await loop drains and exits on terminal', async t => {
  const { publisher, subscribe } = makeChangeTopic();
  const reader = subscribe();
  await publisher.next('a');
  await publisher.next('b');
  await publisher.next('c');
  await publisher.return(undefined);
  const seen = [];
  for await (const value of reader) {
    seen.push(value);
  }
  t.deepEqual(seen, ['a', 'b', 'c']);
});
