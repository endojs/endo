// @ts-check
/* global setTimeout */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { makeMockPowers } from './mock-powers.js';
import { makeRefIterator } from '../../ref-iterator.js';

test('mock powers list returns initial names', async t => {
  const { powers } = makeMockPowers({ names: ['alice', 'bob'] });

  const names = [];
  const iterable = await E(powers).list();
  for await (const name of iterable) {
    names.push(name);
  }

  t.deepEqual(names, ['alice', 'bob']);
});

test('mock powers lookup returns value', async t => {
  const values = new Map([['foo', 42]]);
  const { powers } = makeMockPowers({ values });

  const result = await E(powers).lookup('foo');
  t.is(result, 42);
});

test('mock powers lookup with path', async t => {
  const values = new Map([['dir.subdir.name', 'nested-value']]);
  const { powers } = makeMockPowers({ values });

  const result = await E(powers).lookup('dir', 'subdir', 'name');
  t.is(result, 'nested-value');
});

test('mock powers lookup throws for missing value', async t => {
  const { powers } = makeMockPowers();

  await t.throwsAsync(() => E(powers).lookup('nonexistent'), {
    message: /Not found/,
  });
});

test('mock powers identify returns id', async t => {
  const ids = new Map([['foo', 'id:foo']]);
  const { powers } = makeMockPowers({ ids });

  const id = await E(powers).identify('foo');
  t.is(id, 'id:foo');
});

test('mock powers followNameChanges yields initial names', async t => {
  const { powers } = makeMockPowers({ names: ['alice', 'bob'] });

  const iterator = makeRefIterator(E(powers).followNameChanges());
  const first = await iterator.next();
  const second = await iterator.next();

  t.deepEqual(first.value, { add: 'alice' });
  t.deepEqual(second.value, { add: 'bob' });
});

test('mock powers followNameChanges yields added names', async t => {
  const { powers, addName } = makeMockPowers({ names: [] });

  const iterator = makeRefIterator(E(powers).followNameChanges());

  // Schedule addName after iterator is waiting
  setTimeout(() => addName('charlie'), 10);

  const result = await iterator.next();
  t.deepEqual(result.value, { add: 'charlie' });
});

test('mock powers send records messages', async t => {
  const { powers, sentMessages } = makeMockPowers();

  await E(powers).send('alice', ['hello ', '!'], ['attachment'], ['file']);

  t.is(sentMessages.length, 1);
  t.deepEqual(sentMessages[0], {
    to: 'alice',
    strings: ['hello ', '!'],
    edgeNames: ['attachment'],
    petNames: ['file'],
  });
});

test('mock powers storeValue adds name and value', async t => {
  const { powers } = makeMockPowers({ names: [] });

  await E(powers).storeValue({ data: 'test' }, ['new', 'name']);

  const result = await E(powers).lookup('new', 'name');
  t.deepEqual(result, { data: 'test' });
});

test('mock powers reverseIdentify returns matching names', async t => {
  const ids = new Map([
    ['foo', 'id:shared'],
    ['bar', 'id:shared'],
    ['baz', 'id:other'],
  ]);
  const { powers } = makeMockPowers({ ids });

  const names = await E(powers).reverseIdentify('id:shared');
  // Spread to avoid mutating frozen array from SES
  t.deepEqual([...names].sort(), ['bar', 'foo']);
});
