import { test } from '../prepare-test-env-ava.js';

import {
  makeAsyncContext,
  wrap,
} from '../../src/async-contexts/6-async-context-transpose.js';

const makeAlice = secret => {
  const snapshots = []; // Alice is mutable
  const alice = harden({
    forBob: () => {
      snapshots.push(wrap(cb => cb()));
    },
    fromBob: cb => {
      snapshots[secret](cb);
    },
  });
  return alice;
};
harden(makeAlice);

const makeBob = () => {
  let secret;
  const fluidVar = makeAsyncContext();

  const bob = harden({
    fromAlice: cb => {
      fluidVar.run(0, cb);
      fluidVar.run(1, cb);
    },
    forAlice: () => {
      secret = fluidVar.get();
    },
    getSecret: () => secret,
  });
  return bob;
};
harden(makeBob);

const makeCarol = secretForAlice => {
  // Imagine Carol makes Alice and Bob, each in a new compartment
  const alice = makeAlice(secretForAlice);
  const bob = makeBob();

  const log = [];

  let id = 100;
  const bobSideCtx = makeAsyncContext();
  const aliceSideCtx = makeAsyncContext();

  const forBobFromAlice = () => {
    log.push('alice.forBob() {');
    aliceSideCtx.run(id, () => {
      log.push(`bobSideCtx = ${bobSideCtx.get()}`);
      alice.forBob();
    });
    id += 1;
    log.push('alice.forBob }');
  };
  harden(forBobFromAlice);
  bob.fromAlice(forBobFromAlice);

  const forAliceFromBob = () => {
    log.push('bob.forAlice() {');
    bobSideCtx.run(id, () => {
      log.push(`aliceSideCtx = ${aliceSideCtx.get()}`);
      bob.forAlice();
    });
    id += 1;
    log.push('bob.forAlice }');
  };
  harden(forAliceFromBob);
  alice.fromBob(forAliceFromBob);

  const carol = harden({
    getLog: () => harden(log),
    getSecret: () => bob.getSecret(),
  });
  return carol;
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

test('AliceLeaksZero', t => {
  const carol = makeCarol(0);
  t.is(carol.getSecret(), 0);
  t.deepEqual(carol.getLog(), goldenZero);
});

test('AliceLeaksOne', t => {
  const carol = makeCarol(1);
  t.is(carol.getSecret(), 1);
  t.deepEqual(carol.getLog(), goldenOne);
});
