// This file is not very useful as an
// automated test. Rather, its purpose is just to run it to see what a
// deep stack looks like.

// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from './prepare-test-env-ava.js';

import { E } from './get-hp.js';

const { freeze } = Object;

const carol = freeze({
  bar: () => assert.fail('Wut?'),
});

const bob = freeze({
  foo: carolP => E(carolP).bar(),
});

const alice = freeze({
  test: () => E(bob).foo(carol),
});

test('deep-stacks E', t => {
  const q = alice.test();
  return q.catch(reason => {
    t.assert(reason instanceof Error);
    console.log('expected failure', reason);
  });
});

/*
prepare-test-env-ava sets the `"stackFiltering"` option to `lockdown` to
`"verbose"`. For expository purposes, if the `"stackFiltering"` option to
`lockdown` is set to `"concise"` you should see something like the
following. What you should actually see with `"verbose"` is like this, but with
much extraneous information --- infrastructure stack frames and longer file
paths. See
https://github.com/endojs/endo/blob/master/packages/ses/lockdown-options.md

```
$ ava test/test-deep-send.js

expected failure (Error#1)
Error#1: Wut?
  at Object.bar (packages/eventual-send/test/test-deep-send.js:13:21)

Error#1 ERROR_NOTE: Thrown from: (Error#2) : 2 . 0
Error#1 ERROR_NOTE: Rejection from: (Error#3) : 1 . 1
Nested 2 errors under Error#1
  Error#2: Event: 1.1
    at Object.foo (packages/eventual-send/test/test-deep-send.js:17:28)

  Error#2 ERROR_NOTE: Caused by: (Error#3)
  Nested error under Error#2
    Error#3: Event: 0.1
      at Object.test (packages/eventual-send/test/test-deep-send.js:21:22)
      at packages/eventual-send/test/test-deep-send.js:25:19
      at async Promise.all (index 0)
```

If you're in a shell or IDE that supports it, try clicking (or command-clicking
or something) on the file paths for test-deep-send.js You should see that there
are four invocations that were spread over three turns.
*/
