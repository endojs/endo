// This file is not really useful as an
// automated test. Rather, its purpose is just to run it to see what a
// deep stack looks like.

import '@endo/lockdown/commit-debug.js';
import test from 'ava';

import { E } from './_get-hp.js';

const testDeepStacksWhen = test.macro({
  title: (title, loggerDescription, _getLogger) =>
    `deep-stacks E.when with ${loggerDescription}${title ? ` (${title})` : ''}`,
  exec: (t, _loggerDescription, getLogger) => {
    let r;
    const p = new Promise(res => (r = res));
    const q = E.when(p, v1 => E.when(v1 + 1, v2 => assert.equal(v2, 22)));
    r(33);
    return q.catch(reason => {
      t.assert(reason instanceof Error);
      const log = getLogger(t);
      log('expected failure', reason);
    });
  },
});

test(testDeepStacksWhen, 'console.log', _t => console.log.bind(console));
test(testDeepStacksWhen, 'ses-ava t.log', t => t.log.bind(t));
