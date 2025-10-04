// This file is not really useful as an
// automated test. Rather, its purpose is just to run it to see what a
// deep stack looks like.
// [lockdown.md](https://github.com/endojs/endo/blob/master/packages/ses/docs/lockdown.md)
// shows the output for `errorTaming: 'safe'` and all variations of
// `stackFiltering.

// Note: importing `commit.js` rather than `commit-debug.js` so that
// `errorTaming` is subject to variation by environment variables. If no
// LOCKDOWN_ERROR_TAMING is set, then it defaults to `'safe'`, whereas
// `commit.js` sets it to `'unsafe'`.
import '@endo/eventual-send/shim.js';
import test from 'ava';

import { E } from '@endo/eventual-send';
import { Fail, hideAndHardenFunction, q } from '../index.js';

const { freeze } = Object;

const carol = freeze({
  // Throw an error with unredacted and redacted contents.
  bar: () => Fail`${q('blue')} is not ${42}`,
});

const bob = freeze({
  foo: carolP => E(carolP).bar(),
});

const alice = freeze({
  test: () => E(bob).foo(carol),
});

const goAskAlice = () => alice.test();
hideAndHardenFunction(goAskAlice);

test('deep-send demo test', t => {
  const p = goAskAlice();
  return p.catch(reason => {
    t.true(reason instanceof Error);
    t.log('possibly redacted message:', reason.message);
    t.log('possibly redacted stack:', JSON.stringify(reason.stack));
    t.log('expected failure:', reason);
  });
});
