// This file is not very useful as an
// automated test. Rather, its purpose is just to run it to see what a
// deep stack looks like.

import { test } from './prepare-test-env-ava.js';

test('no-deep-stacks then', t => {
  let r;
  const p = new Promise(res => (r = res));
  const q = p.then(v1 =>
    Promise.resolve(v1 + 1).then(v2 => assert.equal(v2, 22)),
  );
  r(33);
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
$ ava test/test-then-no-deep-stacks.js

expected failure (RangeError#1)
RangeError#1: Expected 34 is same as 22
  at packages/eventual-send/test/test-then-no-deep-stacks.js:12:47
```

If you're in a shell or IDE that supports it, try clicking (or command-clicking
or something) on the file path for test-then-no-deep-stacks.js You should see
only the last invocation with its stack from that one last turn. Compare with
test-deep-send.js or test-deep-stacks.js to see the debugging advantage of using
eventual-send (`E`) or `E.when` instead.
*/
