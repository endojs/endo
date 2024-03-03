// This file is not very useful as an
// automated test. Rather, its purpose is just to run it to see what a
// deep stack looks like.

import { test } from './prepare-test-env-ava.js';

test('no-deep-stacks then', t => {
  let r;
  const p = new Promise(res => (r = res));
  const q = (async () => assert.equal(await ((await p) + 1), 22))();
  r(33);
  return (async () => {
    try {
      await q;
    } catch (reason) {
      t.assert(reason instanceof Error);
      console.log('expected failure', reason);
    }
  })();
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
$ ava test/test-await-no-deep-stacks.js

expected failure (RangeError#1)
RangeError#1: Expected 34 is same as 22
  at packages/eventual-send/test/test-await-no-deep-stacks.js:11:33
  at async packages/eventual-send/test/test-await-no-deep-stacks.js:15:7
```

If you're in a shell or IDE that supports it, try clicking (or command-clicking
or something) on the file paths for test-await-no-deep-stacks.js You should see
one invocation and one await together in one stack as if they occurred in the
same turn. No other turns are visible. Compare with
test-deep-send.js or test-deep-stacks.js to see the debugging advantage of using
eventual-send (`E`) or `E.when` instead.
*/
