import 'ses';
import test from 'ava';

lockdown({
  // Comment or uncomment each of these switches to see variations of the
  // output shown below. When all the switches are uncommented, you should
  // see that output.
  //
  stackFiltering: 'verbose', // Exclude `assert` infrastructure
  consoleTaming: 'unsafe', // Doesn't make a difference here
  errorTaming: 'unsafe', // Redacts entire `error.stack`
});

test('raw ava reject console output', t => {
  t.assert(true);
  // Uncomment this to see something like the text in the extended comment below

  /*
  return Promise.resolve(null)
    .then(v => v)
    .then(v => v)
    .then(_ => {
      assert.typeof(88, 'string', assert.details`msg ${'NOTICE ME'}`);
    });
  */
});

/*
Uncommenting the test code above should produce something like the following.
This output is all from ava. The stack-like display comes from ava's direct
use of the `error.stack` property. Ava bypasses the normal `console`.
For the error message, ava has access only to the `message` string carried
by the error instance, which would normally be redacted to
`'msg (a string)'`. But `errorTaming: 'unsafe'` suppresses that redaction along
with suppressing the redaction of the stack, so the console blabs
`'msg "NOTICE ME"'` instead.
```
  raw ava reject console output

  Rejected promise returned by test. Reason:

  TypeError {
    message: 'msg "NOTICE ME"',
  }

  › makeError (file:///Users/markmiller/src/ongithub/agoric/SES-shim/packages/ses/src/error/assert.js:141:17)
  › fail (file:///Users/markmiller/src/ongithub/agoric/SES-shim/packages/ses/src/error/assert.js:260:20)
  › baseAssert (file:///Users/markmiller/src/ongithub/agoric/SES-shim/packages/ses/src/error/assert.js:278:13)
  › equal (file:///Users/markmiller/src/ongithub/agoric/SES-shim/packages/ses/src/error/assert.js:289:5)
  › Function.assertTypeof [as typeof] (file:///Users/markmiller/src/ongithub/agoric/SES-shim/packages/ses/src/error/assert.js:308:5)
  › file://test/test-raw-ava-reject.js:22:20

  ─

  1 test failed
```
*/
