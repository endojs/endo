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

  const bobSideCtx = wrap(cb => cb());
  const aliceSideCtx = wrap(cb => cb());

  const forBobFromAlice = () => {
    log.push('alice.forBob() {');
    aliceSideCtx(() => {
      alice.forBob();
    });
    log.push('alice.forBob }');
  };
  harden(forBobFromAlice);
  bob.fromAlice(forBobFromAlice);

  const forAliceFromBob = () => {
    log.push('bob.forAlice() {');
    bobSideCtx(() => {
      bob.forAlice();
    });
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

const golden = harden([
  'alice.forBob() {',
  'alice.forBob }',
  'alice.forBob() {',
  'alice.forBob }',
  'bob.forAlice() {',
  'bob.forAlice }',
]);

test('AliceLeaksZero', t => {
  const carol = makeCarol(0);
  t.is(carol.getSecret(), undefined); // No secret leaked
  t.deepEqual(carol.getLog(), golden);
});

test('AliceLeaksOne', t => {
  const carol = makeCarol(1);
  t.is(carol.getSecret(), undefined); // No secret leaked
  t.deepEqual(carol.getLog(), golden);
});
