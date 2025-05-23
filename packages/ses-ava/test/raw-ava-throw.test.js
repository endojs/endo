// This file is not really useful as an
// automated test. Rather, its purpose is just to run it to see what
// its console log looks like.

import 'ses';
import test from 'ava';
import { exampleProblem } from './_example-problem.js';

lockdown({
  // Comment or uncomment each of these switches to see variations of the
  // output shown below. When all the switches are uncommented, you should
  // see that output.
  //
  // Commenting out all settings for a given switch defaults to using
  // the current relevant environment variable setting. To get results
  // independent of that, always uncomment one setting for each switch.
  //
  stackFiltering: 'concise', // Default. Omit likely uninteresting frames. Shorten paths
  // stackFiltering: 'omit-frames', // Only omit infrastructure frames
  // stackFiltering: 'shorten-paths', // Only shorten paths
  // stackFiltering: 'verbose', // Original frames with original paths
  consoleTaming: 'safe', // Default. Console with access to redacted info
  // consoleTaming: 'unsafe', // Host console lacks access to redacted info
  // errorTaming: 'safe', // Default. Hide redacted info on error
  errorTaming: 'unsafe', // Disclose redacted info on error
});

test('raw ava throw console output', t => {
  t.assert(true);

  t.log('t.logA:', exampleProblem('t.logA'));
  console.log('console.logB:', exampleProblem('console.logB'));

  // Uncomment to see something how this test case fails
  // throw exampleProblem('throwC');
});
