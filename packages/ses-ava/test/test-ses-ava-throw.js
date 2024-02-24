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

test('ses-ava throw console output', t => {
  t.assert(true);
  // Uncomment this to see something like the text in the extended comment below

  // assert.typeof(88, 'string', assert.details`msg ${'NOTICE ME'}`);
});

/*
Uncommenting the test code above should produce something like the following.
Some of this output still comes from ava. The stack-like display comes from
the SES `console`, which shows the detailed error message including the
redacted `'NOTICE ME'` that ava has no access to.
```
THROWN from ava test: (TypeError#1)
TypeError#1: msg NOTICE ME

  at packages/ses-ava/test/test-ses-ava-throw.js:21:16
  at logErrorFirst (packages/ses-ava/src/ses-ava-test.js:32:14)
  at testFuncWrapper (packages/ses-ava/src/ses-ava-test.js:73:14)

  ses-ava throw console output

  Error thrown in test:

  TypeError {
    message: 'msg (a string)',
  }

  ─

  1 test failed
```
*/
