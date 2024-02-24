import 'ses';
import rawTest from 'ava';
import { wrapTest } from '../src/ses-ava-test.js';

lockdown({
  // Comment or uncomment each of these switches to see variations of the
  // output shown below. When all the switches are commented, you should
  // see that output.
  //
  // Commenting out all settings for a given switch defaults to using
  // the current relevant environment variable setting. To get results
  // independent of that, always uncomment one setting for each switch.
  //
  // stackFiltering: 'concise', // Default. Hide infrastructure, shorten paths
  stackFiltering: 'verbose', // Include `assert` infrastructure
  consoleTaming: 'safe', // Default. Console with access to redacted info
  // consoleTaming: 'unsafe', // Console without access to redacted info
  // errorTaming: 'safe', // Default. Hide redacted info from ava
  errorTaming: 'unsafe', // Disclose `error.stack` to ava
});

const test = wrapTest(rawTest, 'tlog');

test('ses-ava reject console output', t => {
  t.assert(true);
  // Uncomment this to see something like the text in the extended comment below

  // return Promise.resolve(null)
  //   .then(v => v)
  //   .then(v => v)
  //   .then(_ => {
  //     assert.typeof(88, 'string', assert.details`msg ${'NOTICE ME'}`);
  //   });
});

/*
Uncommenting the test code above should produce something like the following.
Some of this output still comes from ava. The stack-like display comes from
the SES `console`, which shows the detailed error message including the
redacted `'NOTICE ME'` that ava has no access to.

We will revisit this example in `@agoric/eventual-send` using `E.when` instead
of `then` to show deep stacks across multiple turns.
```
REJECTED from ava test: (TypeError#1)
TypeError#1: msg NOTICE ME

  at packages/ses-ava/test/test-ses-ava-reject.js:26:20

  ses-ava reject console output

  Rejected promise returned by test. Reason:

  TypeError {
    message: 'msg (a string)',
  }

  ─

  1 test failed
```
*/
