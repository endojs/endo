import { test } from '../prepare-test-env-ava.js';

import { makeAsyncContext } from '../../src/async-contexts/6-async-context-transpose.js';

import { ResolveThen } from './async-tools.js';
import { makeCallAsyncInCurrentContext } from './async-attack-tools.js';

const makeAlice = secret => {
  const snapshots = []; // Alice is mutable
  const alice = harden({
    forBob: () =>
      new Promise(resolve => {
        snapshots.push(makeCallAsyncInCurrentContext());
        resolve();
      }),
    fromBob: cb => snapshots[secret](cb),
  });
  return alice;
};
harden(makeAlice);

const makeBob = () => {
  let secret;
  const fluidVar = makeAsyncContext();

  const bob = harden({
    fromAlice: cb =>
      ResolveThen(fluidVar.run(0, cb), () => ResolveThen(fluidVar.run(1, cb))),
    forAlice: () =>
      new Promise(resolve => {
        secret = fluidVar.get();
        resolve();
      }),
    getSecret: () => secret,
  });
  return bob;
};
harden(makeBob);

const makeCarol = async secretForAlice => {
  // Imagine Carol makes Alice and Bob, each in a new compartment
  const alice = makeAlice(secretForAlice);
  const bob = makeBob();

  const log = [];

  let id = 100;
  const bobSideCtx = makeAsyncContext();
  const aliceSideCtx = makeAsyncContext();

  const forBobFromAlice = () => {
    log.push('alice.forBob() {');
    return ResolveThen(
      aliceSideCtx.run(id, () => {
        id += 1;
        log.push(`bobSideCtx = ${bobSideCtx.get()}`);
        return alice.forBob();
      }),
      () => {
        log.push('alice.forBob }');
      },
      () => {
        log.push('alice.forBob } (error)');
      },
    );
  };
  harden(forBobFromAlice);

  const forAliceFromBob = () => {
    log.push('bob.forAlice() {');
    return ResolveThen(
      bobSideCtx.run(id, () => {
        id += 1;
        log.push(`aliceSideCtx = ${aliceSideCtx.get()}`);
        return bob.forAlice();
      }),
      () => {
        log.push('bob.forAlice }');
      },
      () => {
        log.push('bob.forAlice } (error)');
      },
    );
  };
  harden(forAliceFromBob);

  const carol = harden({
    getLog: () => harden(log),
    getSecret: () => bob.getSecret(),
  });

  return ResolveThen(bob.fromAlice(forBobFromAlice), () =>
    ResolveThen(alice.fromBob(forAliceFromBob), () => carol),
  );
};
harden(makeCarol);

const goldenZero = harden([
  'alice.forBob() {',
  'bobSideCtx = undefined',
  'alice.forBob }',
  'alice.forBob() {',
  'bobSideCtx = undefined',
  'alice.forBob }',
  'bob.forAlice() {',
  'aliceSideCtx = 100', // Carol sees a difference
  'bob.forAlice }',
]);

const goldenOne = harden([
  'alice.forBob() {',
  'bobSideCtx = undefined',
  'alice.forBob }',
  'alice.forBob() {',
  'bobSideCtx = undefined',
  'alice.forBob }',
  'bob.forAlice() {',
  'aliceSideCtx = 101', // Carol sees a difference
  'bob.forAlice }',
]);

test('AliceLeaksZero', async t => {
  t.plan(2);
  const carol = await makeCarol(0);
  t.is(carol.getSecret(), 0);
  t.deepEqual(carol.getLog(), goldenZero);
});

test('AliceLeaksOne', async t => {
  t.plan(2);
  const carol = await makeCarol(1);
  t.is(carol.getSecret(), 1);
  t.deepEqual(carol.getLog(), goldenOne);
});
