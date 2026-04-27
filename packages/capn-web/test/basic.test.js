// @ts-nocheck
import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import { makeCapnWebSession, makeLoopbackPair } from '../src/index.js';

const makePair = ({ aMain, bMain } = {}) => {
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, { localMain: aMain });
  const sessionB = makeCapnWebSession(b, { localMain: bMain });
  return { sessionA, sessionB };
};

test('basic call: client invokes server method', async t => {
  const server = Far('server', {
    hello: name => `Hello, ${name}!`,
  });
  const { sessionA } = makePair({ bMain: server });
  const remote = sessionA.getRemoteMain();
  const result = await E(remote).hello('World');
  t.is(result, 'Hello, World!');
});

test('returning numbers, strings, booleans', async t => {
  const server = Far('server', {
    num: () => 42,
    str: () => 'hi',
    bool: () => true,
    nul: () => null,
  });
  const { sessionA } = makePair({ bMain: server });
  const r = sessionA.getRemoteMain();
  t.is(await E(r).num(), 42);
  t.is(await E(r).str(), 'hi');
  t.is(await E(r).bool(), true);
  t.is(await E(r).nul(), null);
});

test('passing arguments', async t => {
  const server = Far('server', {
    add: (a, b) => a + b,
    concat: (...parts) => parts.join('|'),
  });
  const { sessionA } = makePair({ bMain: server });
  const r = sessionA.getRemoteMain();
  t.is(await E(r).add(2, 3), 5);
  t.is(await E(r).concat('a', 'b', 'c'), 'a|b|c');
});

test('returning plain objects', async t => {
  const server = Far('server', {
    user: () => ({ id: 1, name: 'Alice', tags: ['admin', 'user'] }),
  });
  const { sessionA } = makePair({ bMain: server });
  const r = sessionA.getRemoteMain();
  const u = await E(r).user();
  t.is(u.id, 1);
  t.is(u.name, 'Alice');
  t.deepEqual(u.tags, ['admin', 'user']);
});

test('rejection propagation', async t => {
  const server = Far('server', {
    boom: () => {
      throw new TypeError('nope');
    },
  });
  const { sessionA } = makePair({ bMain: server });
  const r = sessionA.getRemoteMain();
  let caught;
  try {
    await E(r).boom();
  } catch (e) {
    caught = e;
  }
  t.true(caught instanceof TypeError);
  t.is(caught.message, 'nope');
});
