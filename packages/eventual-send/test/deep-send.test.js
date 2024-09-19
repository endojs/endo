// This file is not really useful as an
// automated test. Rather, its purpose is just to run it to see what a
// deep stack looks like.

import '@endo/lockdown/commit-debug.js';
import test from 'ava';

import { E } from './_get-hp.js';

const { freeze } = Object;

const carol = freeze({
  // Throw an error with redacted contents (here, a string and a number).
  bar: label => assert.Fail`[${assert.quote(label)}] ${'blue'} is not ${42}`,
});

const bob = freeze({
  foo: (label, carolP) => E(carolP).bar(label),
});

const alice = freeze({
  test: label => E(bob).foo(label, carol),
});

const testDeepStacksE = test.macro({
  title: (title, loggerDescription, _getLogger) =>
    `deep-stacks E with ${loggerDescription}${title ? ` (${title})` : ''}`,
  exec: (t, loggerDescription, getLogger) => {
    const p = alice.test(loggerDescription);
    return p.catch(reason => {
      t.true(reason instanceof Error);
      const log = getLogger(t);
      log('expected failure', reason);
    });
  },
});

test(testDeepStacksE, 'console.log', _t => console.log.bind(console));
test(testDeepStacksE, 'ses-ava t.log', t => t.log.bind(t));
