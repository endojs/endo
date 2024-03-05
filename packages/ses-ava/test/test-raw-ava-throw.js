import 'ses';
import test from 'ava';
import { exampleProblem } from './example-problem.js';

lockdown({
  // Comment or uncomment each of these switches to see variations of the
  // output shown below. When all the switches are uncommented, you should
  // see that output.
  //
  // Commenting out all settings for a given switch defaults to using
  // the current relevant environment variable setting. To get results
  // independent of that, always uncomment one setting for each switch.
  //
  stackFiltering: 'concise', // Default. Hide infrastructure, shorten paths
  // stackFiltering: 'verbose', // Include `assert` infrastructure
  consoleTaming: 'safe', // Default. Console with access to redacted info
  // consoleTaming: 'unsafe', // Console without access to redacted info
  errorTaming: 'safe', // Default. Hide redacted info on error
  // errorTaming: 'unsafe', // Disclose redacted info on error
});

test('raw ava throw console output', t => {
  t.assert(true);

  t.log('t.log1:', exampleProblem('t.log1'));
  console.log('console.log2:', exampleProblem('console.log2'));

  // Uncomment to see something how this test case fails
  // throw exampleProblem('throw3');
});
