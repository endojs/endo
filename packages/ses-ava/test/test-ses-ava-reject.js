import 'ses';
import rawTest from 'ava';
import { wrapTest } from '../src/ses-ava-test.js';
import { exampleProblem } from './example-problem.js';

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
  errorTaming: 'safe', // Default. Hide redacted info on error
  // errorTaming: 'unsafe', // Disclose redacted info on error
});

const test = wrapTest(rawTest, { tlog: true, pushConsole: true });

test('ses-ava reject console output', t => {
  t.assert(true);

  t.log('t.logA:', exampleProblem('t.logA'));
  console.log('console.logB:', exampleProblem('console.logB'));

  return Promise.resolve(null)
    .then(v => v)
    .then(v => v)
    .then(_ => {
      t.log('t.logC:', exampleProblem('t.logC'));
      console.log('console.logD:', exampleProblem('console.logD'));

      // Uncomment to see something how this test case fails
      // throw exampleProblem('throwE');
    });
});
