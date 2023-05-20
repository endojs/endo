// This file is a variation of the `test-ses-ava-reject` from the
// `@agoric/ses-ava` package. The difference is that this test
// uses `E.when` rather than `then` to demonstrate deep stacks.

import { wrapTest } from '@endo/ses-ava';
import rawTest from 'ava';

lockdown({
  // Comment or uncomment each of these switches to see variations of the
  // output shown below. When all the switches are commented, you should
  // see that output.
  //
  // stackFiltering: 'verbose', // Include `assert` infrastructure
  // consoleTaming: 'unsafe', // console without access to redacted info
  // errorTaming: 'unsafe', // Disclose `error.stack` to ava
});

/** @type {typeof rawTest} */
const test = wrapTest(rawTest);

test('ses-ava reject console output', t => {
  t.assert(true);
  // Uncomment this to see something like the text in the extended comment below

  /*
  return E.when(Promise.resolve(null), v1 =>
    E.when(v1, v2 =>
      E.when(v2, _ => {
        assert.typeof(88, 'string', assert.details`msg ${'NOTICE ME'}`);
      }),
    ),
  );
  */
});

/*
Uncommenting the test code above should produce something like the following.
Some of this output still comes from ava. The stack-like display comes from
the SES `console`, which shows the detailed error message including the
redacted `'NOTICE ME'` that ava has no access to.
```
REJECTED from ava test: (TypeError#1)
TypeError#1: msg NOTICE ME
  at packages/eventual-send/test/test-ses-ava-reject-deep-stacks.js:29:22

TypeError#1 ERROR_NOTE: Thrown from: (Error#2) : 3 . 0
TypeError#1 ERROR_NOTE: Rejection from: (Error#3) : 2 . 1
TypeError#1 ERROR_NOTE: Rejection from: (Error#4) : 1 . 1
Nested 3 errors under TypeError#1
  Error#2: Event: 2.1
    at packages/eventual-send/test/test-ses-ava-reject-deep-stacks.js:28:9

  Error#2 ERROR_NOTE: Caused by: (Error#3)
  Nested error under Error#2
    Error#3: Event: 1.1
      at packages/eventual-send/test/test-ses-ava-reject-deep-stacks.js:27:7

    Error#3 ERROR_NOTE: Caused by: (Error#4)
    Nested error under Error#3
      Error#4: Event: 0.1
        at packages/eventual-send/test/test-ses-ava-reject-deep-stacks.js:26:12
        at async Promise.all (index 0)

  ses-ava reject console output

  Rejected promise returned by test. Reason:

  TypeError {
    message: 'msg (a string)',
  }

  › packages/eventual-send/test/test-ses-ava-reject-deep-stacks.js:29:22

  ─

  1 test failed
```
*/
