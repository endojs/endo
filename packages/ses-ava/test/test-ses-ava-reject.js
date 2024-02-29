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
  // errorTaming: 'safe', // Default. Hide redacted info from ava
  errorTaming: 'unsafe', // Disclose `error.stack` to ava
});

const test = wrapTest(rawTest, { tlog: true, pushConsole: true });

test('ses-ava reject console output', t => {
  t.assert(true);

  exampleProblem('t.log1:', t.log);
  exampleProblem('console.log1:', console.log);

  return Promise.resolve(null)
    .then(v => v)
    .then(v => v)
    .then(_ => {
      exampleProblem('console.log2:', console.log);
      exampleProblem('t.log2:', t.log);

      // Uncomment to see something how this test case fails
      // exampleProblem('throw', undefined);
    });
});
